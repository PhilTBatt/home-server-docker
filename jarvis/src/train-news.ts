import { errorOf, hubAsk, reasonOf } from "./code-words.js";
import { hubApiUrl } from "./hub-tools.js";
import { pause } from "./wake.js";

export type TrainEvent = { kind: "trains" } | { kind: "trains note"; line: string };
export type TrainNews = { events: AsyncIterable<TrainEvent>; take(): string[] };
export type ChangesReply = { status: number; fields: Record<string, unknown> };
export type TrainWatchDeps = { ask: (query: string, signal: AbortSignal) => Promise<ChangesReply>; signal: AbortSignal; pollMs?: number; nudgeMs?: number; wait?: (ms: number, signal: AbortSignal) => Promise<void> };

export const trainPollMs = 30_000;
export const trainNudgeMs = 2_000;
export const trainLinesKept = 20;
export const trainLineChars = 300;

export const trainAlertsOffNote = "train changes: the hub's train alerts are off, so set TRAIN_ALERTS=on and its settings in api/.env and restart the hub, then start Jarvis again";
export const trainsBackNote = "train changes: the hub is answering again";
export const trainsOldHubNote = "train changes: this hub doesn't have them yet, so rebuild it with docker compose up --build --wait api, then start Jarvis again";

export function trainsUnreachableNote(why: string): string {
  return `train changes: couldn't ask the hub (${why}), so trying again every 30 seconds`;
}

function tidyLine(line: string): string {
  return line.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim().slice(0, trainLineChars);
}

export function changesOf(fields: Record<string, unknown>): { run: string; latest: number; lines: string[] } | null {
  const { run, latest, changes } = fields;
  if (typeof run !== "string" || run === "" || run.length > 100) return null;
  if (typeof latest !== "number" || !Number.isSafeInteger(latest) || latest < 0) return null;
  if (!Array.isArray(changes)) return null;
  const lines: string[] = [];
  for (const change of changes) {
    if (typeof change !== "object" || change === null) return null;
    const given = (change as Record<string, unknown>).lines;
    if (!Array.isArray(given) || !given.every((line) => typeof line === "string")) return null;
    lines.push(...given.map(tidyLine).filter((line) => line !== ""));
  }
  return { run, latest, lines };
}

export function trainSay(lines: string[]): string {
  return `${lines.length === 1 ? "Train change" : "Train changes"}: ${lines.join(" ")}`;
}

export function askHubForChanges(token: string, url = hubApiUrl): TrainWatchDeps["ask"] {
  return (query, signal) => hubAsk(`/trains/changes${query}`, { headers: { Authorization: `Bearer ${token}` } }, signal, url);
}

export function watchTrainChanges(deps: TrainWatchDeps): TrainNews {
  const wait = deps.wait ?? pause;
  const pollMs = deps.pollMs ?? trainPollMs;
  const nudgeMs = deps.nudgeMs ?? trainNudgeMs;
  let waiting: string[] = [];
  async function* events(): AsyncGenerator<TrainEvent> {
    let run: string | null = null;
    let after: number | null = null;
    let failing = false;
    while (!deps.signal.aborted) {
      let reply: ChangesReply;
      try {
        reply = await deps.ask(after === null ? "" : `?after=${after}&run=${encodeURIComponent(run ?? "")}`, deps.signal);
      } catch (error) {
        if (deps.signal.aborted) return;
        reply = { status: 0, fields: { error: reasonOf(error) } };
      }
      if (reply.status === 404) {
        yield { kind: "trains note", line: reply.fields.error === "Train alerts are switched off" ? trainAlertsOffNote : trainsOldHubNote };
        return;
      }
      const got = reply.status === 200 ? changesOf(reply.fields) : null;
      if (got === null) {
        if (!failing) {
          failing = true;
          const why = reply.status === 0 ? String(reply.fields.error) : reply.status === 200 ? "its reply wasn't a list of train changes" : errorOf(reply.fields, reply.status);
          yield { kind: "trains note", line: trainsUnreachableNote(why) };
        }
      } else {
        if (failing) {
          failing = false;
          yield { kind: "trains note", line: trainsBackNote };
        }
        if (after !== null) waiting = [...waiting, ...got.lines].slice(-trainLinesKept);
        after = got.latest;
        run = got.run;
      }
      let waited = 0;
      while (waited < pollMs && !deps.signal.aborted) {
        if (waiting.length > 0) yield { kind: "trains" };
        const step = waiting.length > 0 ? Math.min(nudgeMs, pollMs - waited) : pollMs - waited;
        await wait(step, deps.signal);
        waited += step;
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
