import { earsPort } from "./server.js";

export const questions: Record<string, { method: string; path: string; waitMs: number }> = {
  state: { method: "GET", path: "/state", waitMs: 4_000 },
  start: { method: "POST", path: "/recording/start", waitMs: 4_000 },
  stop: { method: "POST", path: "/recording/stop", waitMs: 70_000 },
  health: { method: "GET", path: "/state", waitMs: 4_000 },
};

export const askUsage = "Usage: node dist/ask.js state|start|stop|health";

function healthLine(status: number, body: string): string {
  const state = (JSON.parse(body) as { state?: unknown }).state;
  return `${status} ${typeof state === "string" && /^[a-z]{1,20}$/.test(state) ? state : "(no state)"}`;
}

export async function ask(what: string | undefined, token: string, base = `http://127.0.0.1:${earsPort}`): Promise<{ status: number; body: string }> {
  const question = what === undefined ? undefined : questions[what];
  if (question === undefined || !Object.hasOwn(questions, what as string)) throw new Error(askUsage);
  const response = await fetch(`${base}${question.path}`, { method: question.method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(question.waitMs) });
  return { status: response.status, body: JSON.stringify(await response.json()) };
}

export async function askCommand(what: string | undefined, token: string, out: (line: string) => void, base?: string): Promise<number> {
  try {
    const answer = await ask(what, token, base);
    out(what === "health" ? healthLine(answer.status, answer.body) : `${answer.status} ${answer.body}`);
    return answer.status >= 400 ? 1 : 0;
  } catch (error) {
    out(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
