import { alreadyListening, earsPort, notTakenYet } from "./server.js";

export const questions: Record<string, { method: string; path: string; waitMs: number }> = {
  state: { method: "GET", path: "/state", waitMs: 4_000 },
  start: { method: "POST", path: "/recording/start", waitMs: 4_000 },
  stop: { method: "POST", path: "/recording/stop", waitMs: 70_000 },
  health: { method: "GET", path: "/state", waitMs: 4_000 },
  talk: { method: "POST", path: "/wake/talk", waitMs: 70_000 },
};

export const askUsage = "Usage: node dist/ask.js state|start|stop|health|talk";

export const listeningLine = "Listening, and a Jarvis chat has taken it. Speak after his chime: ears sends it when you stop talking, or press again once you've spoken to send it now.";
export const alreadyLine = "Already listening, so just speak: ears sends it when you stop talking.";

function healthLine(status: number, body: string): string {
  const state = (JSON.parse(body) as { state?: unknown }).state;
  return `${status} ${typeof state === "string" && /^[a-z]{1,20}$/.test(state) ? state : "(no state)"}`;
}

function plainReason(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").slice(0, 300);
}

function talkLine(status: number, body: string): { line: string; ok: boolean } {
  const fields = JSON.parse(body) as { error?: unknown };
  if (status === 409 && fields.error === alreadyListening) return { line: alreadyLine, ok: true };
  if (status === 409 && fields.error === notTakenYet) return { line: "Not sent yet: no Jarvis chat has taken the recording, so there's nothing to send it to. Press again in a moment.", ok: false };
  return { line: talkAnswer(status, body), ok: status < 400 };
}

function talkAnswer(status: number, body: string): string {
  const fields = JSON.parse(body) as { sent?: unknown; seconds?: unknown; error?: unknown; last?: { text?: unknown; textProblem?: unknown } | null };
  const seconds = typeof fields.seconds === "number" && Number.isFinite(fields.seconds) ? fields.seconds : "?";
  if (status === 200 && fields.sent === true && typeof fields.last?.text === "string" && fields.last.text.trim() !== "") return `Sent after ${seconds} seconds of recording, to the Jarvis chat that took it.`;
  if (status === 200 && fields.sent === true) return `Stopped after ${seconds} seconds of recording, but there's no text to send: ${typeof fields.last?.textProblem === "string" ? plainReason(fields.last.textProblem) : "Whisper heard no words"}.`;
  if (status === 200) return listeningLine;
  if (status === 404) return "This ears doesn't know the talk button yet, so start it again with bash host/ears.sh start, which rebuilds it.";
  if (status === 401) return "Ears didn't accept the token, so nothing happened.";
  if (fields.error === "ears is muted") return "Not listening: ears is muted, so unmute it with bash host/ears.sh unmute.";
  return `Not listening: ${typeof fields.error === "string" ? plainReason(fields.error) : `ears answered ${status}`}.`;
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
    if (what === "talk") {
      const talked = talkLine(answer.status, answer.body);
      out(talked.line);
      return talked.ok ? 0 : 1;
    }
    out(what === "health" ? healthLine(answer.status, answer.body) : `${answer.status} ${answer.body}`);
    return answer.status >= 400 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out(what === "talk" && message !== askUsage ? `Not listening: couldn't reach ears (${plainReason(message)}).` : message);
    return 1;
  }
}
