import { earsPort } from "./server.js";

export const questions: Record<string, { method: string; path: string }> = { state: { method: "GET", path: "/state" }, start: { method: "POST", path: "/recording/start" }, stop: { method: "POST", path: "/recording/stop" } };

export const askUsage = "Usage: node dist/ask.js state|start|stop";

export async function ask(what: string | undefined, token: string, base = `http://127.0.0.1:${earsPort}`): Promise<{ status: number; body: string }> {
  const question = what === undefined ? undefined : questions[what];
  if (question === undefined || !Object.hasOwn(questions, what as string)) throw new Error(askUsage);
  const response = await fetch(`${base}${question.path}`, { method: question.method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4_000) });
  return { status: response.status, body: JSON.stringify(await response.json()) };
}

export async function askCommand(what: string | undefined, token: string, out: (line: string) => void, base?: string): Promise<number> {
  try {
    const answer = await ask(what, token, base);
    out(`${answer.status} ${answer.body}`);
    return answer.status >= 400 ? 1 : 0;
  } catch (error) {
    out(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
