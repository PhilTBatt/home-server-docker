import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { createEars, type Ears } from "./ears.js";
import { findMicCard, recorderArgs, recorderCommand, setMicLevel, type MicCard } from "./mic-card.js";
import { switchEveryMs, switchFile, watchSwitch } from "./mute.js";
import { startRecording, type Recorder } from "./recorder.js";
import { earsPort, startEarsServer } from "./server.js";
import type { ToText } from "./whisper.js";

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
};

export type Service = { ears: Ears; server: Server; microphone: string; close(): Promise<void> };

async function chooseRecorder(options: ServiceOptions): Promise<{ recorder: Recorder; microphone: string }> {
  const { config } = options;
  if (config.microphone === null) return { recorder: options.recorder ?? pretendMic, microphone: "no microphone set" };
  if (config.microphone === "pretend") return { recorder: options.recorder ?? pretendMic, microphone: "the pretend microphone" };
  const card = await (options.findCard ?? (() => findMicCard()))();
  if (config.micLevel !== "keep") await (options.setLevel ?? setMicLevel)(card.number, config.micControl, config.micLevel);
  const level = config.micLevel === "keep" ? "at its own level" : `${config.micControl} set to ${config.micLevel}%`;
  return { recorder: options.recorder ?? { command: recorderCommand, args: recorderArgs(card) }, microphone: `sound card ${card.number}'s microphone (${level})` };
}

export async function startService(options: ServiceOptions): Promise<Service> {
  const { recorder, microphone } = await chooseRecorder(options);
  const ears = createEars({ microphone: options.config.microphone, record: () => startRecording({ recorder, limitMs: options.limitMs }), log: options.log, toText: options.toText });
  const watch = await watchSwitch({ read: () => readFile(options.switchAt ?? switchFile, "utf8"), everyMs: options.everyMs ?? switchEveryMs, onMute: () => void ears.mute(null), onUnmute: () => void ears.unmute() });
  let server: Server;
  try {
    server = await startEarsServer(ears, options.config.token, options.port ?? earsPort, options.host);
  } catch (error) {
    watch.stop();
    throw error;
  }
  let closing: Promise<void> | null = null;
  return {
    ears,
    server,
    microphone,
    close() {
      closing ??= (async () => {
        watch.stop();
        await ears.mute("ears is shutting down");
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
      })();
      return closing;
    },
  };
}
