import { errorOf, hubAsk, reasonOf } from "./code-words.js";
import { hubApiUrl } from "./hub-tools.js";
import { pause } from "./wake.js";

export const sessionStates = ["waiting", "working", "stopped"] as const;
export type SessionState = (typeof sessionStates)[number];
export type SessionChange = { name: string; state: SessionState; was: SessionState | null; at: string };
export type SessionEvent = { kind: "sessions" } | { kind: "sessions note"; line: string };
export type SessionNews = { events: AsyncIterable<SessionEvent>; take(): SessionChange[] };
export type ChangesReply = { status: number; fields: Record<string, unknown> };
export type SessionWatchDeps = { ask: (after: number, signal: AbortSignal) => Promise<ChangesReply>; signal: AbortSignal; pollMs?: number; nudgeMs?: number; wait?: (ms: number, signal: AbortSignal) => Promise<void> };

export const sessionPollMs = 10_000;
export const sessionNudgeMs = 2_000;
export const sessionChangesKept = 10;

export const sessionsOffNote = "sessions: the hub's session manager is off, so set SESSIONS=on in api/.env and restart the hub, then start Jarvis again";
export const sessionsBackNote = "sessions: the hub is answering again";
export const sessionsOldHubNote = "sessions: this hub doesn't have them yet, so rebuild it with docker compose up --build --wait api, then start Jarvis again";

export function sessionsUnreachableNote(why: string): string {
  return `sessions: couldn't ask the hub (${why}), so trying again every 10 seconds`;
}

export function changesOf(fields: Record<string, unknown>): { seq: number; changes: SessionChange[] } | null {
  const { seq, changes } = fields;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || !Array.isArray(changes)) return null;
  const read: SessionChange[] = [];
  for (const one of changes) {
    if (typeof one !== "object" || one === null) return null;
    const { name, state, was, at } = one as Record<string, unknown>;
    const now = sessionStates.find((known) => known === state);
    const before = was === null ? null : sessionStates.find((known) => known === was);
    if (typeof name !== "string" || !/^[a-z0-9-]{1,20}$/.test(name) || now === undefined || before === undefined || typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
    read.push({ name, state: now, was: before, at });
  }
  return { seq, changes: read };
}

export function askHubForSessions(token: string, url = hubApiUrl): SessionWatchDeps["ask"] {
  return (after, signal) => hubAsk(`/sessions/changes?after=${after}`, { headers: { Authorization: `Bearer ${token}` } }, signal, url);
}

export function watchSessions(deps: SessionWatchDeps): SessionNews {
  const wait = deps.wait ?? pause;
  let waiting: SessionChange[] = [];
  async function* events(): AsyncGenerator<SessionEvent> {
    let after: number | null = null;
    let failing: string | null = null;
    while (!deps.signal.aborted) {
      let reply: ChangesReply | null = null;
      let why: string | null = null;
      try {
        reply = await deps.ask(after ?? 0, deps.signal);
      } catch (error) {
        if (deps.signal.aborted) return;
        why = sessionsUnreachableNote(reasonOf(error));
      }
      if (reply !== null) {
        const read = reply.status === 200 ? changesOf(reply.fields) : null;
        if (reply.status === 404 && typeof reply.fields.error === "string" && /switched off/i.test(reply.fields.error)) why = sessionsOffNote;
        else if (reply.status === 404) why = sessionsOldHubNote;
        else if (read === null) why = sessionsUnreachableNote(reply.status === 200 ? "its answer couldn't be read" : errorOf(reply.fields, reply.status));
        else {
          if (failing !== null) yield { kind: "sessions note", line: sessionsBackNote };
          failing = null;
          const fresh = after === null ? [] : read.changes.filter((change) => change.state === "waiting" || change.state === "stopped");
          after = read.seq;
          if (fresh.length > 0) {
            waiting = [...waiting, ...fresh].slice(-sessionChangesKept);
            yield { kind: "sessions" };
          }
        }
      }
      if (why !== null && why !== failing) yield { kind: "sessions note", line: why };
      if (why !== null) failing = why;
      const nudgeMs = deps.nudgeMs ?? sessionNudgeMs;
      for (let waited = 0; waited < (deps.pollMs ?? sessionPollMs) && !deps.signal.aborted; waited += nudgeMs) {
        await wait(nudgeMs, deps.signal).catch(() => {});
        if (waiting.length > 0 && !deps.signal.aborted) yield { kind: "sessions" };
      }
    }
  }
  return {
    events: events(),
    take() {
      const taken = waiting;
      waiting = [];
      return taken;
    },
  };
}

export function sessionSay(changes: SessionChange[]): string {
  const latest = new Map<string, SessionChange>();
  for (const change of changes) latest.set(change.name, change);
  const lines = [...latest.values()].map((change) => (change.state === "waiting" ? `The ${change.name} session is waiting on you.` : `The ${change.name} session has stopped.`));
  return lines.join(" ");
}
