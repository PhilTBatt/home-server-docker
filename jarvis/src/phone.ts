import { errorOf, hubAsk, reasonOf } from "./code-words.js";
import { hubApiUrl, typeYes } from "./hub-tools.js";
import { createSentences } from "./sentences.js";
import type { SpeechEngine } from "./speech.js";
import { ModesOff, hubModes, type Mode } from "./modes.js";
import { pause } from "./wake.js";
import { connectWyoming, transcribe, type WyomingConnection } from "./wyoming-client.js";

export const phoneRate = 16_000;
export const whisperHost = "whisper";
export const whisperPort = 10300;
export const hearMs = 60_000;
export const nextMs = 30_000;
export const callMs = 10_000;
export const voiceSendMs = 30_000;
export const retryMs = 10_000;
export const nudgeMs = 2_000;
export const shortestLoopMs = 1_000;
export const askPollMs = 1_000;
export const mostVoiceSeconds = 120;
export const idPattern = /^[0-9a-f]{16}$/;

export const phoneOffNote = "phone: the hub's TALK switch is off, so set TALK=on in api/.env and rebuild the hub, then start Jarvis again";
export const phoneOldHubNote = "phone: this hub can't take recordings yet, so rebuild it with docker compose up --build --wait api, then start Jarvis again";
export const phoneBackNote = "phone: the hub is answering again";
export const phoneGuestNote = "a question came from your phone, but the hub is in guest mode, so Jarvis said no";
export const phoneGuestSay = "The hub's in guest mode, so I won't take questions from the phone until it's off.";
export const phoneNothingNote = "a recording came from your phone, but nothing was heard in it";
export const phoneModeUnknownSay = "I couldn't check the hub's mode, so I won't take that from the phone just now. Try again in a moment.";

export function phoneModeUnknownNote(why: string): string {
  return `a question came from your phone, but the hub's mode couldn't be checked (${why}), so Jarvis said no, in case it's guest mode`;
}
export const phoneNothingSay = "I didn't hear anything in that recording.";
export const phoneEmptySay = "I had nothing to say to that.";
export const phonePrefix = "From your phone: ";
export const phoneTag = "[Asked from his phone, through the hub.]";

export function withPhoneTag(text: string): string {
  return `${text}\n\n${phoneTag}`;
}

export function phoneQuestion(question: string): string {
  return question.replace(` ${typeYes}`, "").replace(typeYes, "").trim();
}

export const phoneNothingToSayNote = "none of it could be spoken";

export function phoneUnreachableNote(why: string): string {
  return `phone: couldn't ask the hub for recordings (${why}), so trying again every 10 seconds`;
}

export function phoneUnheardNote(why: string): string {
  return `a recording came from your phone, but it couldn't be turned into words: ${why}`;
}

export function phoneTellNote(why: string): string {
  return `couldn't tell the phone: ${why}`;
}

export function phoneVoiceNote(why: string): string {
  return `the phone gets the answer as text only: ${why}`;
}

export function phoneVoiceCutNote(sent: number, why: string): string {
  return `the phone got the first ${sent} piece${sent === 1 ? "" : "s"} of his voice, then the rest couldn't be sent: ${why}`;
}

export function phoneAskingNote(question: string): string {
  return `${phoneQuestion(question)} Answer yes or no on your phone`;
}

export type PhoneRequest = { id: string; audio: Uint8Array };
export type PhoneEvent = { kind: "phone" } | { kind: "phone note"; line: string };
export type PhoneNews = { events: AsyncIterable<PhoneEvent>; take(): PhoneRequest | null };
export type NextReply = { status: number; request: PhoneRequest | null; fields: Record<string, unknown> };

export type PhoneDesk = {
  next(signal: AbortSignal): Promise<NextReply>;
  heard(id: string, text: string, signal: AbortSignal): Promise<void>;
  reply(id: string, text: string, voice: boolean, signal: AbortSignal): Promise<void>;
  failed(id: string, text: string, signal: AbortSignal): Promise<void>;
  ask(id: string, question: string, signal: AbortSignal): Promise<void>;
  answer(id: string, signal: AbortSignal): Promise<"yes" | "no" | null>;
  voice(id: string, wav: Uint8Array<ArrayBuffer>, signal: AbortSignal, part?: number): Promise<void>;
  voiceDone(id: string, signal: AbortSignal): Promise<void>;
  noVoice(id: string, signal: AbortSignal): Promise<void>;
};

export type PhoneParts = {
  news: PhoneNews;
  desk: PhoneDesk;
  hear: (audio: Uint8Array, signal: AbortSignal) => Promise<string>;
  voice: ((text: string, signal: AbortSignal, piece: (wav: Uint8Array<ArrayBuffer>) => Promise<void>) => Promise<number>) | null;
  mode: (signal: AbortSignal) => Promise<Mode | "off">;
  askPollMs?: number;
  askMs?: number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

function limited(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

export function hubDesk(token: string, url = hubApiUrl): PhoneDesk {
  const auth = { Authorization: `Bearer ${token}` };
  const sent = async (path: string, body: unknown, signal: AbortSignal): Promise<Record<string, unknown>> => {
    const { status, fields } = await hubAsk(path, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(body) }, signal, url);
    if (status !== 200) throw new Error(`the hub said: ${errorOf(fields, status)}`);
    return fields;
  };
  return {
    async next(signal) {
      const response = await fetch(`${url}/talk/next`, { headers: auth, redirect: "error", signal: limited(signal, nextMs) });
      if (response.status === 200) {
        const id = response.headers.get("talk-id") ?? "";
        const audio = new Uint8Array(await response.arrayBuffer());
        if (!idPattern.test(id) || audio.length === 0 || audio.length % 2 !== 0) return { status: 200, request: null, fields: { error: "its recording couldn't be read" } };
        return { status: 200, request: { id, audio }, fields: {} };
      }
      const parsed: unknown = await response.json().catch(() => null);
      return { status: response.status, request: null, fields: typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {} };
    },
    async heard(id, text, signal) {
      await sent(`/talk/${id}/heard`, { text }, signal);
    },
    async reply(id, text, voice, signal) {
      await sent(`/talk/${id}/reply`, { text, voice }, signal);
    },
    async failed(id, text, signal) {
      await sent(`/talk/${id}/failed`, { text }, signal);
    },
    async ask(id, question, signal) {
      await sent(`/talk/${id}/ask`, { question }, signal);
    },
    async answer(id, signal) {
      const { status, fields } = await hubAsk(`/talk/${id}/answer`, { headers: auth }, signal, url);
      if (status !== 200) throw new Error(`the hub said: ${errorOf(fields, status)}`);
      return fields.answer === "yes" || fields.answer === "no" ? fields.answer : null;
    },
    async noVoice(id, signal) {
      await sent(`/talk/${id}/no-voice`, {}, signal);
    },
    async voiceDone(id, signal) {
      await sent(`/talk/${id}/voice-done`, {}, signal);
    },
    async voice(id, wav, signal, part) {
      const response = await fetch(`${url}/talk/${id}/voice${part === undefined ? "" : `?part=${part}`}`, { method: "POST", headers: { ...auth, "content-type": "audio/wav" }, body: wav, redirect: "error", signal: limited(signal, voiceSendMs) });
      if (response.status === 200) return;
      const parsed: unknown = await response.json().catch(() => null);
      throw new Error(`the hub said: ${errorOf(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}, response.status)}`);
    },
  };
}

export type PhoneWatchDeps = { desk: Pick<PhoneDesk, "next">; signal: AbortSignal; wait?: (ms: number, signal: AbortSignal) => Promise<void>; now?: () => number; retryMs?: number; nudgeMs?: number; shortestLoopMs?: number };

export function watchPhone(deps: PhoneWatchDeps): PhoneNews {
  const wait = deps.wait ?? pause;
  const now = deps.now ?? (() => Date.now());
  let waiting: PhoneRequest | null = null;
  async function* events(): AsyncGenerator<PhoneEvent> {
    let failing: string | null = null;
    while (!deps.signal.aborted) {
      if (waiting !== null) {
        await wait(deps.nudgeMs ?? nudgeMs, deps.signal).catch(() => {});
        if (waiting !== null && !deps.signal.aborted) yield { kind: "phone" };
        continue;
      }
      const started = now();
      let why: string | null = null;
      try {
        const reply = await deps.desk.next(deps.signal);
        if (reply.status === 200 && reply.request !== null) {
          if (failing !== null) yield { kind: "phone note", line: phoneBackNote };
          failing = null;
          waiting = reply.request;
          yield { kind: "phone" };
          continue;
        }
        if (reply.status === 204) {
          if (failing !== null) yield { kind: "phone note", line: phoneBackNote };
          failing = null;
          const left = (deps.shortestLoopMs ?? shortestLoopMs) - (now() - started);
          if (left > 0) await wait(left, deps.signal).catch(() => {});
          continue;
        }
        if (reply.status === 404 && typeof reply.fields.error === "string" && /switched off/i.test(reply.fields.error)) why = phoneOffNote;
        else if (reply.status === 404) why = phoneOldHubNote;
        else why = phoneUnreachableNote(errorOf(reply.fields, reply.status));
      } catch (error) {
        if (deps.signal.aborted) return;
        why = phoneUnreachableNote(reasonOf(error));
      }
      if (why !== failing) yield { kind: "phone note", line: why };
      failing = why;
      await wait(deps.retryMs ?? retryMs, deps.signal).catch(() => {});
    }
  }
  return {
    events: events(),
    take() {
      const taken = waiting;
      waiting = null;
      return taken;
    },
  };
}

export function whisperHears(options: { host?: string; port?: number; limitMs?: number } = {}): PhoneParts["hear"] {
  const host = options.host ?? whisperHost;
  const port = options.port ?? whisperPort;
  const limitMs = options.limitMs ?? hearMs;
  return async (audio, signal) => {
    const tooLong = AbortSignal.timeout(limitMs);
    const within = AbortSignal.any([signal, tooLong]);
    let connection: WyomingConnection | null = null;
    try {
      connection = await connectWyoming({ host, port, signal: within });
      const text = await transcribe(connection, audio, { rate: phoneRate, width: 2, channels: 1 }, "en", within);
      return text.replace(/\s+/g, " ").trim();
    } catch (error) {
      if (tooLong.aborted && !signal.aborted) throw new Error(`Whisper took longer than ${limitMs / 1000} seconds`);
      throw error;
    } finally {
      connection?.close();
    }
  };
}

export function wavOf(sound: Uint8Array, rate: number): Uint8Array<ArrayBuffer> {
  const wav = new Uint8Array(44 + sound.length);
  const view = new DataView(wav.buffer);
  const text = (at: number, words: string) => [...words].forEach((letter, index) => view.setUint8(at + index, letter.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + sound.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, sound.length, true);
  wav.set(sound, 44);
  return wav;
}

async function* listed(pieces: string[]): AsyncGenerator<string> {
  yield* pieces;
}

export async function phoneVoice(engine: SpeechEngine, text: string, signal: AbortSignal, skipCode: boolean, piece: (wav: Uint8Array<ArrayBuffer>) => Promise<void>, mostSeconds = mostVoiceSeconds): Promise<number> {
  const sentences = createSentences({ start: "sentence", skipCode });
  const pieces = [...sentences.push(text), ...sentences.end()];
  if (pieces.length === 0) return 0;
  const most = engine.sampleRate * 2 * mostSeconds;
  let length = 0;
  let count = 0;
  for await (const sound of engine.speak(listed(pieces), signal)) {
    const kept = sound.subarray(0, Math.max(0, most - length));
    if (kept.length > 0) {
      await piece(wavOf(kept, engine.sampleRate));
      count++;
    }
    length += kept.length;
    if (length >= most) break;
  }
  return count;
}

export async function askOnPhone(parts: Pick<PhoneParts, "desk" | "askPollMs" | "askMs" | "wait">, id: string, question: string, signal: AbortSignal): Promise<string | null> {
  const wait = parts.wait ?? pause;
  const within = AbortSignal.any([signal, AbortSignal.timeout(parts.askMs ?? 60_000)]);
  await parts.desk.ask(id, phoneQuestion(question), within);
  while (!within.aborted) {
    await wait(parts.askPollMs ?? askPollMs, within);
    if (within.aborted) break;
    const answer = await parts.desk.answer(id, within);
    if (answer !== null) return answer;
  }
  return null;
}

export function hubModeCheck(token: string, url = hubApiUrl): (signal: AbortSignal) => Promise<Mode | "off"> {
  const modes = hubModes(token, url);
  return async (signal) => {
    try {
      return (await modes.get(signal)).mode;
    } catch (error) {
      if (error instanceof ModesOff) return "off";
      throw error;
    }
  };
}
