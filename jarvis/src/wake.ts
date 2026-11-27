import { randomUUID } from "node:crypto";
import { earsQuickMs, type EarsAnswer, type EarsCall } from "./ears-client.js";
import { unmuteHint } from "./talk.js";
import type { TurnCheck, TurnVerdict } from "./turn-check.js";

export const waitAskMs = 30_000;
export const retryMs = 2_000;
export const holdEveryMs = 5_000;
export const busyClaimMs = 1_000;

export type WakeEvent = { kind: "wake"; id: number; follow?: true; button?: true; cut?: true } | { kind: "hush"; id: number } | { kind: "done"; id: number; answer: EarsAnswer; textMs: number } | { kind: "status"; line: string } | { kind: "no follow-up"; why: string } | { kind: "late"; behindMs: number | null } | { kind: "turn"; id: number; verdict: TurnVerdict | null; ms: number; counted: boolean };

export const mutedLine = `off while ears is muted, so ${unmuteHint}`;
export const onLine = "on: say Hey Jarvis";

export function mutedFrom(line: string): boolean | null {
  if (line === mutedLine) return true;
  if (line === onLine) return false;
  return null;
}

export const oldEarsLine = "off: this ears doesn't know the wake word yet, so start it again with bash host/ears.sh start, which rebuilds it";
export const oldFollowWhy = "this ears doesn't know follow-ups yet, so start it again with bash host/ears.sh start, which rebuilds it";

export type FollowAsk = { ask(withinMs: number): void; take(): number | null; onAsk(poke: () => void): () => void };

export function createFollowAsk(): FollowAsk {
  let asked: number | null = null;
  let poke: (() => void) | null = null;
  return {
    ask(withinMs) {
      asked = withinMs;
      poke?.();
    },
    take() {
      const was = asked;
      asked = null;
      return was;
    },
    onAsk(given) {
      poke = given;
      if (asked !== null) given();
      return () => {
        if (poke === given) poke = null;
      };
    },
  };
}

function followRefusal(answer: EarsAnswer): string {
  if (answer.status === 404) return oldFollowWhy;
  return answer.error ?? `ears answered ${answer.status}`;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function wakeStatus(answer: EarsAnswer): string {
  if (answer.status === 404 || (answer.status === 200 && (answer.version === undefined || answer.version === null))) return oldEarsLine;
  if (answer.status !== 200) return `off: ears answered ${answer.status}${answer.error === null ? "" : ` (${answer.error})`}`;
  if (answer.state === "muted") return mutedLine;
  if (answer.state === "failed") return `off: ears failed (${answer.reason ?? "no reason given"}), so ${unmuteHint} to start it again`;
  if (answer.wake === undefined || answer.wake === null || !answer.wake.on) return "off: ears has the wake word off, so set EARS_WAKE=on in ears/.env and start it again with bash host/ears.sh start";
  if (answer.wake.problem !== null) return `off: ${answer.wake.problem}`;
  return onLine;
}

async function dropStrayFollow(call: EarsCall): Promise<void> {
  try {
    const now = await call("GET", "/wait?after=-1", earsQuickMs);
    if (now.current?.by === "follow") await call("POST", `/recording/cancel?id=${now.current.id}`, earsQuickMs);
  } catch {}
}

export type WatchDeps = { call: EarsCall; signal: AbortSignal; first?: string | null; now?: () => number; wait?: (ms: number, signal: AbortSignal) => Promise<void>; retryMs?: number; busy?: () => boolean; busyClaimMs?: number; follow?: FollowAsk; judge?: TurnCheck; speaking?: () => boolean };

export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function* watchWake(deps: WatchDeps): AsyncGenerator<WakeEvent> {
  const now = deps.now ?? (() => performance.now());
  const wait = deps.wait ?? pause;
  const again = deps.retryMs ?? retryMs;
  let after = -1;
  let run: string | null = null;
  let status = deps.first ?? null;
  let lateSeen: { run: string | null; count: number } | null = null;
  let taken: { id: number; endedAt: number | null } | null = null;
  let judged: { id: number; n: number } | null = null;
  let hushed: number | null = null;
  const judgements: { id: number; verdict: TurnVerdict | null; ms: number; counted: boolean }[] = [];
  const waitPath = deps.judge === undefined ? "" : "&judge=on";
  const answerEars = async (check: TurnCheck, id: number, n: number, text: string) => {
    const began = now();
    const verdict = await check(text, deps.signal).catch(() => null);
    const ms = now() - began;
    const told = verdict === null ? null : await deps.call("POST", `/wake/turn?id=${id}&n=${n}&verdict=${verdict}`, earsQuickMs, deps.signal).catch(() => null);
    judgements.push({ id, verdict, ms, counted: told?.status === 200 });
  };
  try {
    while (!deps.signal.aborted) {
      const within = deps.follow?.take() ?? null;
      if (within !== null && taken === null) {
        let started: EarsAnswer;
        try {
          started = await deps.call("POST", `/wake/follow?within=${within}`, earsQuickMs, deps.signal);
        } catch (error) {
          await dropStrayFollow(deps.call);
          if (deps.signal.aborted) return;
          started = { status: 0, state: null, reason: null, error: reasonOf(error), seconds: null, last: null };
        }
        if (started.status === 200 && typeof started.id === "number") {
          taken = { id: started.id, endedAt: null };
          yield { kind: "wake", id: started.id, follow: true };
        } else {
          yield { kind: "no follow-up", why: followRefusal(started) };
        }
      }
      const nudge = new AbortController();
      const unhook = deps.follow?.onAsk(() => nudge.abort()) ?? (() => {});
      let answer: EarsAnswer;
      try {
        answer = await deps.call("GET", `/wait?after=${after}${run === null ? "" : `&run=${encodeURIComponent(run)}`}${waitPath}`, waitAskMs, deps.follow === undefined ? deps.signal : AbortSignal.any([deps.signal, nudge.signal]));
      } catch (error) {
        if (deps.signal.aborted) return;
        if (nudge.signal.aborted) continue;
        answer = { status: 0, state: null, reason: null, error: reasonOf(error), seconds: null, last: null };
      } finally {
        unhook();
      }
      for (const one of judgements.splice(0)) if (taken?.id === one.id) yield { kind: "turn", ...one };
      const line = answer.status === 0 ? `off: ${answer.error ?? "ears didn't answer"}` : wakeStatus(answer);
      if (line !== status) {
        status = line;
        yield { kind: "status", line };
      }
      if (answer.status !== 200 || answer.version === undefined || answer.version === null) {
        if (taken !== null) {
          const gone = taken;
          taken = null;
          yield { kind: "done", id: gone.id, answer: answer.status === 0 ? { ...answer, status: 503 } : answer, textMs: now() - (gone.endedAt ?? now()) };
        }
        await wait(again, deps.signal);
        continue;
      }
      if (answer.run !== run) {
        run = answer.run ?? null;
        if (taken !== null && answer.current?.id !== taken.id && answer.lastId !== taken.id) {
          const gone = taken;
          taken = null;
          yield { kind: "done", id: gone.id, answer: { ...answer, status: 409, error: "ears started again, so the recording was lost" }, textMs: 0 };
        }
      }
      after = answer.version;
      const late = answer.wake?.late;
      if (late !== undefined) {
        if (lateSeen !== null && lateSeen.run === run && late.count > lateSeen.count) yield { kind: "late", behindMs: late.behindMs };
        lateSeen = { run, count: late.count };
      }
      if (taken === null && (answer.current?.by === "wake" || answer.current?.by === "button") && !answer.current.claimed) {
        const id: number = answer.current.id;
        const button = answer.current.by === "button";
        let claimed: EarsAnswer | null = null;
        const cut = answer.wake?.interrupt !== undefined && deps.speaking?.() === true;
        if (deps.busy?.() === true && !cut) {
          await wait(deps.busyClaimMs ?? busyClaimMs, deps.signal);
          if (deps.signal.aborted) return;
        }
        try {
          claimed = await deps.call("POST", `/wake/claim?id=${id}`, earsQuickMs, deps.signal);
        } catch {
          if (deps.signal.aborted) return;
        }
        if (claimed?.status === 200) {
          taken = { id, endedAt: null };
          yield { kind: "wake", id, ...(button ? { button: true as const } : {}), ...(cut ? { cut: true as const } : {}) };
          answer = claimed;
        }
      }
      const theirs = taken === null ? (answer.current ?? null) : null;
      if (theirs !== null && (theirs.by === "wake" || theirs.by === "button") && theirs.id !== hushed && answer.state === "recording" && answer.wake?.interrupt !== undefined && deps.speaking?.() === true) {
        hushed = theirs.id;
        yield { kind: "hush", id: theirs.id };
      }
      if (taken === null) continue;
      const asking = answer.asking ?? null;
      if (deps.judge !== undefined && asking !== null && asking.id === taken.id && (judged === null || judged.id !== asking.id || judged.n !== asking.n)) {
        judged = { id: asking.id, n: asking.n };
        void answerEars(deps.judge, asking.id, asking.n, asking.text);
      }
      if (answer.state === "recording" && answer.current?.id === taken.id) continue;
      taken.endedAt ??= now();
      if (answer.state === "working" || (answer.state === "recording" && answer.lastId === taken.id && (answer.current ?? null) === null)) continue;
      const done = taken;
      taken = null;
      yield { kind: "done", id: done.id, answer, textMs: now() - (done.endedAt ?? now()) };
    }
  } finally {
    if (taken !== null) await deps.call("POST", `/recording/cancel?id=${taken.id}`, earsQuickMs).catch(() => {});
  }
}

export type WakeHold = { during(spoken: () => Promise<void>): void; active(): boolean; close(): void };

export function holderId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

export function startWakeHold(call: EarsCall, by = holderId(), everyMs = holdEveryMs): WakeHold {
  let count = 0;
  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let chain: Promise<void> = Promise.resolve();
  const tell = (path: string) => {
    chain = chain.then(() => call("POST", `${path}?by=${by}`, earsQuickMs).then(
      () => {},
      () => {},
    ));
  };
  const letGo = () => {
    if (closed) return;
    count--;
    if (count > 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    tell("/wake/release");
  };
  return {
    during(spoken) {
      if (closed) return;
      count++;
      if (count === 1) {
        tell("/wake/hold");
        timer = setInterval(() => tell("/wake/hold"), everyMs);
        timer.unref();
      }
      void spoken().then(letGo, letGo);
    },
    active: () => count > 0,
    close() {
      if (closed) return;
      closed = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (count > 0) tell("/wake/release");
      count = 0;
    },
  };
}

export function spokenOf(speech: { done(): Promise<void> }): () => Promise<void> {
  return async () => {
    for (;;) {
      const done = speech.done();
      await done.catch(() => {});
      if (speech.done() === done) return;
    }
  };
}

export function stopOnCutIn(speeches: Iterable<{ stop(): void }>): (event: WakeEvent) => void {
  return (event) => {
    if (event.kind !== "hush" && !(event.kind === "wake" && event.cut === true)) return;
    for (const speech of speeches) speech.stop();
  };
}

export function eager<T>(source: AsyncIterable<T>, seen?: (event: T) => void): AsyncIterable<T> {
  const waiting: T[] = [];
  let over = false;
  let problem: { error: unknown } | null = null;
  let wake = () => {};
  const iterator = source[Symbol.asyncIterator]();
  void (async () => {
    try {
      for (;;) {
        const next = await iterator.next();
        if (next.done === true) break;
        seen?.(next.value);
        waiting.push(next.value);
        wake();
      }
    } catch (error) {
      problem = { error };
    } finally {
      over = true;
      wake();
    }
  })();
  return {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (waiting.length === 0 && !over) await new Promise<void>((resolve) => (wake = resolve));
        const next = waiting.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (problem !== null) throw problem.error;
        return;
      }
    },
  };
}
