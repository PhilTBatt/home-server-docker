import { earsQuickMs, earsStopMs, type EarsAnswer, type EarsCall, type Ender } from "./ears-client.js";

export const talkWord = "/talk";
export const unmuteHint = "unmute it on the server with bash host/ears.sh unmute";
export const talkPollMs = 250;

export type Heard = { text: string; recordedMs: number; textMs: number; wake?: true; follow?: true; ender?: Ender };
export type Started = { ok: true; id?: number | null } | { ok: false; why: string };
export type Sent = { ok: true; heard: Heard } | { ok: false; why: string };

export type Talk = {
  check(signal?: AbortSignal): Promise<string>;
  start(signal?: AbortSignal): Promise<Started>;
  send(signal?: AbortSignal, wake?: boolean | "follow", id?: number | null): Promise<Sent>;
  drop(signal?: AbortSignal, id?: number | null): Promise<string | null>;
};

export type TalkDeps = { call: EarsCall; now?: () => number; wait?: (ms: number) => Promise<void>; pollMs?: number; waitMs?: number; wake?: boolean };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function refusal(answer: EarsAnswer): string {
  if (answer.state === "muted") return `ears is muted, so ${unmuteHint}`;
  return answer.error ?? `ears answered ${answer.status}`;
}

export function earsLine(answer: EarsAnswer, wake = false): string {
  const speak = wake ? `say Hey Jarvis or type ${talkWord}` : `type ${talkWord} to speak`;
  if (answer.status !== 200) return `Ears: ${refusal(answer)}`;
  if (answer.state === "muted") return `Ears: ready but muted, so ${unmuteHint}, then ${speak}`;
  if (answer.state === "failed") return `Ears: failed (${answer.reason ?? "no reason given"}), so ${unmuteHint} to start it again, then ${speak}`;
  return wake ? `Ears: ready. Type ${talkWord} to speak, or say Hey Jarvis while the wake word is on` : `Ears: ready. Type ${talkWord} to speak, then press Enter on an empty line to send it`;
}

function whyNoText(answer: EarsAnswer): string {
  const last = answer.last;
  if (last !== null && last.textProblem !== null) return last.textProblem;
  if (answer.state === "muted") return "ears was muted, so the recording was dropped";
  if (answer.state === "failed") return `ears failed (${answer.reason ?? "no reason given"})`;
  if (answer.state === "working") return "Whisper was still working on it after 70 seconds";
  if (answer.state === "recording") return "ears was still ending the recording after 70 seconds";
  if (last === null) return "ears sent back no text";
  if (last.text !== null) return "Whisper heard no words";
  return `it wasn't turned into text: ${last.reason}`;
}

export const movedOnWhy = "ears moved on to a newer recording, so this one's text is gone";

function named(path: string, id: number | null | undefined): string {
  return id === null || id === undefined ? path : `${path}?id=${id}`;
}

export function heardFrom(answer: EarsAnswer, textMs: number, wake: boolean | "follow" = false, id: number | null = null): Sent {
  if (answer.status !== 200) return { ok: false, why: refusal(answer) };
  const known = id !== null && answer.lastId !== undefined;
  if (known && answer.lastId !== id) return { ok: false, why: movedOnWhy };
  const text = answer.last?.text ?? null;
  if (answer.state === "working" || (answer.state === "recording" && !known) || text === null || text.trim() === "") return { ok: false, why: whyNoText(answer) };
  return { ok: true, heard: { text: text.trim(), recordedMs: Math.round((answer.last?.seconds ?? 0) * 1000), textMs, ...(wake === true ? { wake: true as const } : wake === "follow" ? { follow: true as const } : {}), ...(wake !== false && answer.last?.ender !== undefined ? { ender: answer.last.ender } : {}) } };
}

export function startTalk(deps: TalkDeps): Talk {
  const now = deps.now ?? (() => performance.now());
  const wait = deps.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pollMs = deps.pollMs ?? talkPollMs;
  const waitMs = deps.waitMs ?? earsStopMs;
  const cancelQuietly = (id: number | null = null) => deps.call("POST", named("/recording/cancel", id), earsQuickMs).then(() => {}, () => {});
  const settled = async (signal: AbortSignal | undefined, id: number | null): Promise<EarsAnswer> => {
    const deadline = now() + waitMs;
    for (;;) {
      const answer = await deps.call("GET", "/state", earsQuickMs, signal);
      if (answer.status !== 200 || (answer.state !== "working" && answer.state !== "recording") || now() >= deadline) return answer;
      if (id !== null && answer.lastId !== undefined && answer.lastId !== null && (answer.lastId > id || (answer.lastId === id && answer.state !== "working"))) return answer;
      await wait(pollMs);
    }
  };
  return {
    async check(signal) {
      try {
        return earsLine(await deps.call("GET", "/state", earsQuickMs, signal), deps.wake === true);
      } catch (error) {
        if (signal?.aborted === true) throw error;
        return `Ears: ${reasonOf(error)}`;
      }
    },
    async start(signal) {
      try {
        const answer = await deps.call("POST", "/recording/start", earsQuickMs, signal);
        return answer.status === 200 ? { ok: true, id: answer.id ?? null } : { ok: false, why: refusal(answer) };
      } catch (error) {
        await cancelQuietly();
        return { ok: false, why: reasonOf(error) };
      }
    },
    async send(signal, wake = false, id = null) {
      const began = now();
      try {
        let answer = await deps.call("POST", named("/recording/stop", id), earsStopMs, signal);
        if (answer.status === 409) answer = await settled(signal, id);
        return heardFrom(answer, now() - began, wake, id);
      } catch (error) {
        await cancelQuietly(id);
        return { ok: false, why: reasonOf(error) };
      }
    },
    async drop(signal, id = null) {
      try {
        const answer = await deps.call("POST", named("/recording/cancel", id), earsQuickMs, signal);
        return answer.status === 200 || answer.status === 409 || answer.status === 410 ? null : refusal(answer);
      } catch (error) {
        return reasonOf(error);
      }
    },
  };
}
