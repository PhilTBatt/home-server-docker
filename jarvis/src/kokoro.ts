import { shortError } from "./player.js";
import type { SpeechEngine } from "./speech.js";

export const kokoroName = "Kokoro";
export const kokoroUrl = "http://kokoro:8880";
export const kokoroRate = 24_000;
export const kokoroModel = "kokoro";
export const kokoroSpeakMs = 30_000;
export const kokoroCheckMs = 3_000;

export type KokoroOptions = { voice: string; url?: string; speakMs?: number; checkMs?: number };

function limited(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

function cause(error: unknown): string {
  const code = error instanceof Error && typeof error.cause === "object" && error.cause !== null ? (error.cause as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? ` (${code})` : "";
}

function failed(error: unknown, signal: AbortSignal, slow: string, other: (error: unknown) => string): unknown {
  if (signal.aborted) return signal.reason;
  if (error instanceof Error && error.name === "TimeoutError") return new Error(slow);
  return new Error(other(error));
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function refusal(status: number, text: string): string {
  const body = parsed(text);
  const detail = typeof body === "object" && body !== null ? (body as Record<string, unknown>).detail : undefined;
  const message = typeof detail === "object" && detail !== null ? (detail as Record<string, unknown>).message : detail;
  const said = typeof message === "string" ? shortError(message) : "";
  return `${kokoroName} replied ${status}${said === "" ? "" : `: ${said}`}`;
}

export function speechRequest(text: string, voice: string): string {
  return JSON.stringify({ model: kokoroModel, input: text, voice, response_format: "pcm", stream: false });
}

export function createKokoro(options: KokoroOptions): SpeechEngine {
  const url = options.url ?? kokoroUrl;
  const speakMs = options.speakMs ?? kokoroSpeakMs;
  const checkMs = options.checkMs ?? kokoroCheckMs;
  const unreachable = (error: unknown) => `Couldn't reach ${kokoroName} at ${url}${cause(error)}`;
  const cutOff = () => `${kokoroName}'s reply was cut off part-way`;

  async function soundFor(text: string, signal: AbortSignal): Promise<Uint8Array> {
    const slow = `${kokoroName} took longer than ${speakMs / 1000} seconds over one piece of speech`;
    const response = await fetch(`${url}/v1/audio/speech`, { method: "POST", headers: { "content-type": "application/json" }, body: speechRequest(text, options.voice), redirect: "error", signal: limited(signal, speakMs) }).catch((error: unknown) => {
      throw failed(error, signal, slow, unreachable);
    });
    if (!response.ok) {
      const said = await response.text().catch((error: unknown) => {
        throw failed(error, signal, slow, () => `${kokoroName} replied ${response.status}, and its reason was cut off part-way`);
      });
      throw new Error(refusal(response.status, said));
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/^audio\/pcm\s*(;|$)/i.test(type)) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`${kokoroName} sent ${type === "" ? "something with no type" : shortError(type)}, not raw sound`);
    }
    const sound = await response.arrayBuffer().catch((error: unknown) => {
      throw failed(error, signal, slow, cutOff);
    });
    return new Uint8Array(sound, 0, sound.byteLength - (sound.byteLength % 2));
  }

  return {
    name: kokoroName,
    sampleRate: kokoroRate,
    splitsSentences: false,
    async *speak(text, signal) {
      for await (const piece of text) {
        const words = piece.trim();
        if (words === "") continue;
        const sound = await soundFor(words, signal);
        if (sound.length === 0) throw new Error(`${kokoroName} sent no sound`);
        yield sound;
      }
    },
    async check(signal) {
      const slow = `${kokoroName} didn't answer within ${checkMs / 1000} seconds`;
      const response = await fetch(`${url}/health`, { redirect: "error", signal: limited(signal, checkMs) }).catch((error: unknown) => {
        throw failed(error, signal, slow, unreachable);
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`${kokoroName} replied ${response.status} when asked if it's ready`);
      }
      const body = parsed(
        await response.text().catch((error: unknown) => {
          throw failed(error, signal, slow, cutOff);
        }),
      );
      if (typeof body !== "object" || body === null || (body as Record<string, unknown>).status !== "healthy") throw new Error(`Something answered at ${url}, but not as ${kokoroName} does`);
    },
  };
}
