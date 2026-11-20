import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { createEars, type Ears } from "./ears.js";
import { switchEveryMs, switchFile, watchSwitch } from "./mute.js";
import { startRecording, type Recorder } from "./recorder.js";
import { earsPort, startEarsServer } from "./server.js";

export const pretendMic: Recorder = { command: process.execPath, args: [join(dirname(fileURLToPath(import.meta.url)), "pretend-mic-run.js")] };

export type ServiceOptions = { config: Config; log: (line: string) => void; switchAt?: string; everyMs?: number; port?: number; host?: string; recorder?: Recorder; limitMs?: number };

export type Service = { ears: Ears; server: Server; close(): Promise<void> };

export async function startService(options: ServiceOptions): Promise<Service> {
  const recorder = options.recorder ?? pretendMic;
  const ears = createEars({ microphone: options.config.microphone, record: () => startRecording({ recorder, limitMs: options.limitMs }), log: options.log });
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
