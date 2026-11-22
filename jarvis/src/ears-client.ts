export const earsUrl = "http://ears:8090";
export const earsQuickMs = 4_000;
export const earsStopMs = 70_000;

export type Ender = "loudness" | "silero";

export type EarsLast = { seconds: number; reason: string; text: string | null; textProblem: string | null; ender?: Ender; pauseMs?: number };
export type EarsCurrent = { id: number; by: "push" | "wake" | "follow" | "button"; claimed: boolean };
export type EarsWake = { on: boolean; listening: boolean; held: boolean; problem: string | null; late?: { count: number; behindMs: number | null } };
export type EarsAnswer = { status: number; state: string | null; reason: string | null; error: string | null; seconds: number | null; last: EarsLast | null; id?: number | null; version?: number | null; run?: string | null; lastId?: number | null; current?: EarsCurrent | null; wake?: EarsWake | null };
export type EarsCall = (method: "GET" | "POST", path: string, ms: number, signal?: AbortSignal) => Promise<EarsAnswer>;

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function tidy(value: string): string {
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/ {2,}/g, " ").trim();
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat;
}

function lastOf(value: unknown): EarsLast | null {
  if (typeof value !== "object" || value === null) return null;
  const last = value as Record<string, unknown>;
  if (typeof last.seconds !== "number" || !Number.isFinite(last.seconds) || last.seconds < 0 || typeof last.reason !== "string") return null;
  if (last.text !== null && typeof last.text !== "string") return null;
  if (last.textProblem !== null && typeof last.textProblem !== "string") return null;
  return { seconds: last.seconds, reason: tidy(last.reason), text: last.text, textProblem: last.textProblem === null ? null : tidy(last.textProblem), ...(last.ender === "loudness" || last.ender === "silero" ? { ender: last.ender } : {}), ...(count(last.pauseMs, 1) === null ? {} : { pauseMs: last.pauseMs as number }) };
}

function count(value: unknown, least: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= least ? value : null;
}

function currentOf(value: unknown): EarsCurrent | null {
  if (typeof value !== "object" || value === null) return null;
  const current = value as Record<string, unknown>;
  const id = count(current.id, 1);
  if (id === null || (current.by !== "push" && current.by !== "wake" && current.by !== "follow" && current.by !== "button") || typeof current.claimed !== "boolean") return null;
  return { id, by: current.by, claimed: current.claimed };
}

function wakeOf(value: unknown): EarsWake | null {
  if (typeof value !== "object" || value === null) return null;
  const wake = value as Record<string, unknown>;
  if (typeof wake.on !== "boolean" || typeof wake.listening !== "boolean" || typeof wake.held !== "boolean") return null;
  if (wake.problem !== null && typeof wake.problem !== "string") return null;
  const late = typeof wake.late === "object" && wake.late !== null ? (wake.late as Record<string, unknown>) : null;
  const ignored = late === null ? null : count(late.count, 0);
  const behindMs = late === null ? null : count(late.behindMs, 0);
  const known = ignored !== null ? { late: { count: ignored, behindMs } } : {};
  return { on: wake.on, listening: wake.listening, held: wake.held, problem: wake.problem === null ? null : tidy(wake.problem), ...known };
}

export function readEarsAnswer(status: number, body: unknown): EarsAnswer {
  const fields = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const seconds = typeof fields.seconds === "number" && Number.isFinite(fields.seconds) ? fields.seconds : null;
  const tidied = (value: unknown) => {
    const found = text(value);
    return found === null ? null : tidy(found);
  };
  const answer: EarsAnswer = { status, state: tidied(fields.state), reason: tidied(fields.reason), error: tidied(fields.error), seconds, last: lastOf(fields.last), ...("lastId" in fields ? { lastId: count(fields.lastId, 1) } : {}), ...("id" in fields ? { id: count(fields.id, 1) } : {}) };
  if (!("version" in fields)) return answer;
  const run = typeof fields.run === "string" && /^[0-9a-f]{1,32}$/.test(fields.run) ? fields.run : null;
  return { ...answer, version: count(fields.version, 0), run, lastId: count(fields.lastId, 1), current: currentOf(fields.current), wake: wakeOf(fields.wake) };
}

function code(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === "string" && /^[A-Z0-9_]+$/.test(cause.code) ? ` (${cause.code})` : "";
}

export function earsCaller(token: string, url = earsUrl): EarsCall {
  return async (method, path, ms, signal) => {
    const limit = AbortSignal.timeout(ms);
    const within = signal === undefined ? limit : AbortSignal.any([signal, limit]);
    let response: Response;
    try {
      response = await fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: within });
    } catch (error) {
      if (signal?.aborted === true) throw signal.reason;
      if (limit.aborted) throw new Error(`Ears didn't answer within ${ms / 1000} seconds`);
      throw new Error(`Couldn't reach ears at ${url}${code(error)}. Start it on the server with bash host/ears.sh start`);
    }
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      throw new Error("Ears turned down Jarvis's token. Start Jarvis with bash host/jarvis.sh, which passes in EARS_TOKEN from ears/.env");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal?.aborted === true) throw signal.reason;
      if (limit.aborted) throw new Error(`Ears didn't answer within ${ms / 1000} seconds`);
      throw new Error(`Ears answered ${response.status} without its usual JSON`);
    }
    return readEarsAnswer(response.status, body);
  };
}
