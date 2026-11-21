export const earsUrl = "http://ears:8090";
export const earsQuickMs = 4_000;
export const earsStopMs = 70_000;

export type EarsLast = { seconds: number; reason: string; text: string | null; textProblem: string | null };
export type EarsAnswer = { status: number; state: string | null; reason: string | null; error: string | null; seconds: number | null; last: EarsLast | null };
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
  return { seconds: last.seconds, reason: tidy(last.reason), text: last.text, textProblem: last.textProblem === null ? null : tidy(last.textProblem) };
}

export function readEarsAnswer(status: number, body: unknown): EarsAnswer {
  const fields = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const seconds = typeof fields.seconds === "number" && Number.isFinite(fields.seconds) ? fields.seconds : null;
  const tidied = (value: unknown) => {
    const found = text(value);
    return found === null ? null : tidy(found);
  };
  return { status, state: tidied(fields.state), reason: tidied(fields.reason), error: tidied(fields.error), seconds, last: lastOf(fields.last) };
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
