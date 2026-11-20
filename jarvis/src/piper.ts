import type { SpeechEngine } from "./speech.js";
import { connectWyoming, describe, synthesize, type WyomingConnection } from "./wyoming-client.js";

export const piperName = "Piper";
export const piperHost = "piper";
export const piperPort = 10200;
export const piperSpeakMs = 30_000;
export const piperCheckMs = 3_000;

export type PiperOptions = { voice: string; host?: string; port?: number; speakMs?: number; checkMs?: number };

export function piperRate(voice: string): number {
  return /-(x_low|low)$/.test(voice) ? 16_000 : 22_050;
}

function limited(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

function failed(error: unknown, signal: AbortSignal, slow: string): unknown {
  if (signal.aborted) return signal.reason;
  if (error instanceof Error && error.name === "TimeoutError") return new Error(slow);
  return error;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joined(pieces: Uint8Array[], bytes: number): Uint8Array {
  if (pieces.length === 1) return pieces[0];
  const whole = new Uint8Array(bytes);
  let at = 0;
  for (const piece of pieces) {
    whole.set(piece, at);
    at += piece.length;
  }
  return whole;
}

export function createPiper(options: PiperOptions): SpeechEngine {
  const host = options.host ?? piperHost;
  const port = options.port ?? piperPort;
  const speakMs = options.speakMs ?? piperSpeakMs;
  const checkMs = options.checkMs ?? piperCheckMs;
  const rate = piperRate(options.voice);

  async function soundFor(words: string, signal: AbortSignal): Promise<Uint8Array> {
    const within = limited(signal, speakMs);
    let connection: WyomingConnection | null = null;
    try {
      connection = await connectWyoming({ host, port, signal: within });
      const pieces: Uint8Array[] = [];
      let bytes = 0;
      for await (const piece of synthesize(connection, words, options.voice, within)) {
        if (piece.rate !== rate || piece.width !== 2 || piece.channels !== 1) throw new Error(`${piperName} sent sound at ${piece.rate} Hz, ${piece.width * 8}-bit, with ${piece.channels} channel${piece.channels === 1 ? "" : "s"}, but Jarvis plays ${options.voice} as ${rate} Hz, 16-bit mono`);
        pieces.push(piece.audio);
        bytes += piece.audio.length;
      }
      if (bytes === 0) throw new Error(`${piperName} sent no sound`);
      return joined(pieces, bytes);
    } catch (error) {
      throw failed(error, signal, `${piperName} took longer than ${speakMs / 1000} seconds over one piece of speech`);
    } finally {
      connection?.close();
    }
  }

  return {
    name: piperName,
    sampleRate: rate,
    splitsSentences: false,
    async *speak(text, signal) {
      for await (const piece of text) {
        const words = piece.trim();
        if (words === "") continue;
        yield await soundFor(words, signal);
      }
    },
    async check(signal) {
      const within = limited(signal, checkMs);
      let connection: WyomingConnection | null = null;
      try {
        connection = await connectWyoming({ host, port, signal: within });
        const info = await describe(connection, within);
        const programs = Array.isArray(info.tts) ? info.tts : [];
        const program = programs.find((found) => isObject(found) && found.name === "piper");
        if (!isObject(program)) throw new Error(`Something answered at ${host}:${port}, but not as ${piperName} does`);
        const voices = Array.isArray(program.voices) ? program.voices : [];
        if (!voices.some((voice) => isObject(voice) && voice.name === options.voice)) throw new Error(`${piperName} has no voice called ${options.voice}`);
      } catch (error) {
        throw failed(error, signal, `${piperName} didn't answer within ${checkMs / 1000} seconds`);
      } finally {
        connection?.close();
      }
    },
  };
}
