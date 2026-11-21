import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createChanges, type Changes } from "./changes.js";
import type { Config } from "./config.js";
import { createEars, type Ears } from "./ears.js";
import { createListener, wakeHost, wakeOff, wakePort, type Listener, type ListenerDeps } from "./listener.js";
import { applyMicSettings, findMicCard, recorderArgs, recorderCommand, type MicCard } from "./mic-card.js";
import { switchEveryMs, switchFile, watchSwitch } from "./mute.js";
import { startRecording, type Recorder } from "./recorder.js";
import { createDetector, loadSilero, type SileroStep } from "./silero.js";
import { earsPort, startEarsServer, wakeOffError, type WakeApi } from "./server.js";
import type { ToText } from "./whisper.js";
import { connectWyoming } from "./wyoming-client.js";

export const pretendMic: Recorder = { command: process.execPath, args: [join(dirname(fileURLToPath(import.meta.url)), "pretend-mic-run.js")] };

export type ServiceOptions = {
  config: Config;
  log: (line: string) => void;
  switchAt?: string;
  everyMs?: number;
  port?: number;
  host?: string;
  recorder?: Recorder;
  limitMs?: number;
  toText?: ToText;
  findCard?: () => Promise<MicCard>;
  setLevel?: (card: number, control: string, level: number) => Promise<void>;
  setBoost?: (card: number, control: string, steps: number) => Promise<void>;
  loadSilero?: () => Promise<SileroStep>;
  wake?: Partial<Pick<ListenerDeps, "connect" | "presenceMs" | "holdMs" | "gapMs" | "retryMs" | "settleMs" | "startWithinMs" | "quietForMs">> & { claimMs?: number; waitMs?: number };
};

export type Service = { ears: Ears; server: Server; microphone: string; wake: WakeApi; close(): Promise<void> };

async function chooseRecorder(options: ServiceOptions): Promise<{ recorder: Recorder; microphone: string }> {
  const { config } = options;
  if (config.microphone === null) return { recorder: options.recorder ?? pretendMic, microphone: "no microphone set" };
  if (config.microphone === "pretend") return { recorder: options.recorder ?? pretendMic, microphone: "the pretend microphone" };
  const card = await (options.findCard ?? (() => findMicCard()))();
  const level = await applyMicSettings(card.number, config, { setLevel: options.setLevel, setBoost: options.setBoost });
  return { recorder: options.recorder ?? { command: recorderCommand, args: recorderArgs(card) }, microphone: `sound card ${card.number}'s microphone (${level})` };
}

export async function startService(options: ServiceOptions): Promise<Service> {
  const { recorder, microphone } = await chooseRecorder(options);
  let step: SileroStep | null = null;
  if (options.config.wake && options.config.wakeEnd === "silero") {
    try {
      step = await (options.loadSilero ?? (() => loadSilero()))();
    } catch (error) {
      throw new Error(`the speech detector couldn't load: ${error instanceof Error ? error.message : String(error)}. Set EARS_WAKE_END=loudness to go back to the loudness check`);
    }
  }
  const silero = step;
  const tuning = options.wake ?? {};
  let changes: Changes | null = null;
  let listener: Listener | null = null;
  const ears = createEars({
    microphone: options.config.microphone,
    record: (by) => (listener === null ? startRecording({ recorder, limitMs: options.limitMs }) : listener.tap(by)),
    log: options.log,
    toText: options.toText,
    claimMs: tuning.claimMs,
    idsAfter: Date.now(),
    changed: () => {
      listener?.update();
      changes?.check();
    },
  });
  const run = randomUUID().replaceAll("-", "").slice(0, 16);
  const full = () => ({ ...ears.view(), lastId: ears.lastId(), current: ears.current(), wake: listener?.view() ?? wakeOff });
  changes = createChanges(full);
  const seen = changes;
  if (options.config.wake) {
    listener = createListener({
      ...tuning,
      ears: () => ({ state: () => ears.view().state, start: (by) => ears.start(by), fail: (why) => ears.fail(why) }),
      stream: (onSound) => startRecording({ recorder, limitMs: null, keep: false, onSound }),
      connect: tuning.connect ?? ((signal) => connectWyoming({ host: wakeHost, port: wakePort, signal })),
      detector: silero === null ? undefined : () => createDetector(silero),
      log: options.log,
      changed: () => seen.check(),
      limitMs: options.limitMs,
    });
  }
  const hearing = listener;
  const wake: WakeApi = {
    full: () => ({ ...full(), version: seen.version(), run }),
    async wait(after, from, signal) {
      const done = hearing?.waiting();
      try {
        if (from === null || from === run) await seen.wait(after, signal, tuning.waitMs);
      } finally {
        done?.();
      }
      return { ...full(), version: seen.version(), run };
    },
    hold(by) {
      hearing?.hold(by);
      return hearing !== null;
    },
    release(by) {
      hearing?.release(by);
      return hearing !== null;
    },
    follow: (withinMs) => (hearing === null ? { ok: false, error: wakeOffError } : hearing.follow(withinMs, () => ears.start("follow"))),
  };
  const watch = await watchSwitch({ read: () => readFile(options.switchAt ?? switchFile, "utf8"), everyMs: options.everyMs ?? switchEveryMs, onMute: () => void ears.mute(null), onUnmute: () => void ears.unmute() });
  let server: Server;
  try {
    server = await startEarsServer(ears, options.config.token, options.port ?? earsPort, options.host, wake);
  } catch (error) {
    watch.stop();
    await hearing?.close();
    throw error;
  }
  let closing: Promise<void> | null = null;
  return {
    ears,
    server,
    microphone,
    wake,
    close() {
      closing ??= (async () => {
        watch.stop();
        await ears.mute("ears is shutting down");
        await hearing?.close();
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
      })();
      return closing;
    },
  };
}
