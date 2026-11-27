import { randomBytes } from "node:crypto";
import { readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const choreJobs = ["rebuild-api", "run-tests", "pull-images"] as const;
export const idPattern = /^[0-9a-f]{16}$/;
export const sessionJobPattern = /^session-(?:start|stop)-[a-z0-9-]{1,20}$/;

export function choreJobFor(sessions: boolean): (job: string) => boolean {
  return (job) => (choreJobs as readonly string[]).includes(job) || (sessions && sessionJobPattern.test(job));
}
export const pickUpMs = 2 * 60 * 1000;
export const runningSlackMs = 2 * 60 * 1000;
export const outputMostBytes = 4_000;

export type ChoreState = "waiting" | "running" | "done" | "refused" | "dropped";
export type ChoreResult = {
  id: string;
  state: ChoreState;
  job: string | null;
  exit: number | null;
  timedOut: boolean | null;
  seconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  limitSeconds: number | null;
  why: string | null;
  output: string[];
};
export type Requested = { id: string; job: string; requestedAt: string };
export type ChoreLog = {
  info?: (fields: Record<string, unknown>, message: string) => void;
  warn?: (fields: Record<string, unknown>, message: string) => void;
};
export type Chores = {
  request(job: string, now: Date): Promise<Requested | { refused: string; status: 409 | 500 }>;
  result(id: string): Promise<ChoreResult | null>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && Number.isFinite(Date.parse(value));
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function readResult(id: string, text: string): Omit<ChoreResult, "output"> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || parsed.id !== id) return null;
  const state = (["running", "done", "refused"] as const).find((one) => one === parsed.state);
  if (state === undefined) return null;
  const job = typeof parsed.job === "string" && (choreJobFor(true)(parsed.job)) ? parsed.job : null;
  return {
    id,
    state,
    job,
    exit: count(parsed.exit),
    timedOut: typeof parsed.timedOut === "boolean" ? parsed.timedOut : null,
    seconds: count(parsed.seconds),
    startedAt: isTime(parsed.startedAt) ? parsed.startedAt : null,
    endedAt: isTime(parsed.endedAt) ? parsed.endedAt : null,
    limitSeconds: count(parsed.limitSeconds),
    why: typeof parsed.why === "string" ? parsed.why.replace(/[^\x20-\x7E]/g, "").slice(0, 100) : null,
  };
}

export function outputLines(text: string): string[] {
  return Buffer.from(text, "utf8")
    .subarray(-outputMostBytes)
    .toString("utf8")
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-40);
}

export function createChores(options: { dir: string; jobs?: (job: string) => boolean; makeId?: () => string; log?: ChoreLog }): Chores {
  const requests = join(options.dir, "requests");
  const results = join(options.dir, "results");
  const isJob = options.jobs ?? choreJobFor(false);
  const makeId = options.makeId ?? (() => randomBytes(8).toString("hex"));
  const dropped = new Map<string, string>();
  const { log } = options;

  async function waiting(now: Date): Promise<string | null> {
    const names = (await readdir(requests).catch(() => [] as string[])).filter((name) => /^[0-9a-f]{16}\.job$/.test(name));
    for (const name of names) {
      const path = join(requests, name);
      const made = await stat(path).then((info) => info.mtimeMs).catch(() => null);
      if (made === null) continue;
      if (now.getTime() - made < pickUpMs) return name.slice(0, 16);
      await unlink(path).catch(() => {});
      dropped.set(name.slice(0, 16), "the runner didn't pick it up within 2 minutes: is home-hub-runner@<user>.path enabled?");
      log?.warn?.({ id: name.slice(0, 16), waitedSeconds: Math.round((now.getTime() - made) / 1000) }, "a chore request the runner never picked up was removed");
    }
    return null;
  }

  async function running(now: Date): Promise<Omit<ChoreResult, "output"> | null> {
    const names = (await readdir(results).catch(() => [] as string[])).filter((name) => /^[0-9a-f]{16}\.json$/.test(name));
    for (const name of names) {
      const text = await readFile(join(results, name), "utf8").catch(() => null);
      const found = text === null ? null : readResult(name.slice(0, 16), text);
      if (found === null || found.state !== "running" || found.startedAt === null) continue;
      const until = Date.parse(found.startedAt) + (found.limitSeconds ?? 0) * 1000 + runningSlackMs;
      if (until > now.getTime()) return found;
    }
    return null;
  }

  return {
    async request(job, now) {
      if (!isJob(job)) return { refused: "That isn't a chore", status: 409 };
      const pending = await waiting(now);
      if (pending !== null) {
        log?.info?.({ job, waiting: pending }, "chore refused: one is waiting for the runner");
        return { refused: "A chore is already waiting for the runner to pick it up", status: 409 };
      }
      const busy = await running(now);
      if (busy !== null) {
        log?.info?.({ job, running: busy.id, runningJob: busy.job }, "chore refused: one is running");
        return { refused: `${busy.job ?? "A chore"} is already running, since ${busy.startedAt}: one at a time`, status: 409 };
      }
      const id = makeId();
      if (!idPattern.test(id)) return { refused: "That isn't a chore", status: 409 };
      const writing = join(requests, `.${id}.tmp`);
      try {
        await writeFile(writing, `${job}\n`, { mode: 0o600, flag: "wx" });
        await rename(writing, join(requests, `${id}.job`));
      } catch {
        await unlink(writing).catch(() => {});
        log?.warn?.({ job }, "a chore request couldn't be written");
        return { refused: "Couldn't write the request: is chores/requests there and mounted?", status: 500 };
      }
      log?.info?.({ id, job }, "chore requested");
      return { id, job, requestedAt: now.toISOString() };
    },
    async result(id) {
      const empty = { job: null, exit: null, timedOut: null, seconds: null, startedAt: null, endedAt: null, limitSeconds: null, why: null, output: [] };
      const text = await readFile(join(results, `${id}.json`), "utf8").catch(() => null);
      if (text !== null) {
        const found = readResult(id, text);
        if (found === null) return { ...empty, id, state: "refused", why: "the result file couldn't be read" };
        const output = await readFile(join(results, `${id}.out`), "utf8").catch(() => "");
        return { ...found, output: outputLines(output) };
      }
      const asked = await stat(join(requests, `${id}.job`)).then(() => true).catch(() => false);
      if (asked) return { ...empty, id, state: "waiting" };
      const why = dropped.get(id);
      if (why !== undefined) return { ...empty, id, state: "dropped", why };
      return null;
    },
  };
}
