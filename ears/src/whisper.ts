import { recordingRate } from "./recorder.js";
import { connectWyoming, transcribe, type WyomingConnection } from "./wyoming-client.js";

export const whisperHost = "whisper";
export const whisperPort = 10300;
export const textLimitMs = 60_000;

export type ToText = (sound: Uint8Array, signal: AbortSignal) => Promise<string>;

export type WhisperOptions = { host?: string; port?: number; limitMs?: number };

export function whisperText(options: WhisperOptions = {}): ToText {
  const host = options.host ?? whisperHost;
  const port = options.port ?? whisperPort;
  const limitMs = options.limitMs ?? textLimitMs;
  return async (sound, signal) => {
    const tooLong = AbortSignal.timeout(limitMs);
    const within = AbortSignal.any([signal, tooLong]);
    let connection: WyomingConnection | null = null;
    try {
      connection = await connectWyoming({ host, port, signal: within });
      const text = await transcribe(connection, sound, { rate: recordingRate, width: 2, channels: 1 }, null, within);
      return text.replace(/\s+/g, " ").trim();
    } catch (error) {
      if (tooLong.aborted) throw new Error(`Whisper took longer than ${limitMs / 1000} seconds`);
      throw error;
    } finally {
      connection?.close();
    }
  };
}
