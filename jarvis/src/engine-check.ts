import type { AgentSession } from "./agent.js";
import { withTimeout } from "./run.js";
import { plainAnswer, readInsideWord, readOutsideWord, type SeenRequest } from "./stand-in-api.js";

export type CheckResult = { name: string; ok: boolean; detail: string };

export type EngineCheckDeps = {
  session: AgentSession;
  requests: SeenRequest[];
  insideMarker: string;
  outsideMarker: string;
  settingsMarker: string;
  systemMarker: string;
  model: string;
  timeoutMs: number;
  settleMs: number;
  countTranscripts: () => Promise<number>;
  engineEnv: () => Record<string, string | undefined> | undefined;
};

export const allowedTools = ["Read", "DeferredToolPlaceholder"];

export const expectedRequests: RegExp[] = [/^Hello$/, new RegExp(readInsideWord), /^\[tool result\]/, new RegExp(readOutsideWord), /^\[tool result\]/];

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runEngineCheck(deps: EngineCheckDeps): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const toolsUsed: string[] = [];
  const ask = (question: string) => withTimeout(deps.session.ask(question, { tool: (name) => toolsUsed.push(name) }), deps.timeoutMs, () => deps.session.close());

  try {
    const answer = await ask("Hello");
    results.push({ name: "a question gets an answer", ok: answer.text === plainAnswer, detail: answer.text });
  } catch (error) {
    results.push({ name: "a question gets an answer", ok: false, detail: reason(error) });
  }

  try {
    const answer = await ask(`Please ${readInsideWord}`);
    const ok = answer.text.includes(deps.insideMarker) && toolsUsed.includes("Read");
    results.push({ name: "a file in the brain can be read", ok, detail: ok ? "read" : `answer: ${answer.text}` });
  } catch (error) {
    results.push({ name: "a file in the brain can be read", ok: false, detail: reason(error) });
  }

  try {
    const answer = await ask(`Please ${readOutsideWord}`);
    results.push({ name: "a file outside the brain is refused", ok: false, detail: `not refused: ${answer.text}` });
  } catch (error) {
    const message = reason(error);
    results.push({ name: "a file outside the brain is refused", ok: message.startsWith("Refused:"), detail: message });
  }

  await new Promise((resolve) => setTimeout(resolve, deps.settleMs));

  const leaked = deps.requests.filter((request) => request.body.includes(deps.outsideMarker)).length;
  results.push({ name: "nothing from outside the brain reached the API", ok: leaked === 0, detail: `${leaked} requests carried it` });

  const settings = deps.requests.filter((request) => request.body.includes(deps.settingsMarker)).length;
  results.push({ name: "settings and instruction files in the brain are ignored", ok: settings === 0, detail: `${settings} requests carried them` });

  const calls = deps.requests.filter((request) => request.path === "/v1/messages");
  const inOrder = calls.length === expectedRequests.length && calls.every((request, index) => expectedRequests[index].test(request.lastUserText) && request.system.includes(deps.systemMarker));
  results.push({ name: "only Jarvis's own five requests, in order (no title or other extra requests)", ok: inOrder, detail: `${calls.length} requests: ${calls.map((request) => JSON.stringify(request.lastUserText.slice(0, 30))).join(", ")}` });

  const wrongModel = calls.filter((request) => request.model !== deps.model).length;
  results.push({ name: `every request uses ${deps.model}`, ok: calls.length > 0 && wrongModel === 0, detail: `${wrongModel} of ${calls.length} didn't` });

  const offered = [...new Set(calls.flatMap((request) => request.tools))].sort();
  const extra = offered.filter((tool) => !allowedTools.includes(tool));
  const withoutRead = calls.filter((request) => !request.tools.includes("Read")).length;
  results.push({ name: "only Read is offered", ok: calls.length > 0 && withoutRead === 0 && extra.length === 0, detail: `offered: ${offered.join(", ") || "none"}; ${withoutRead} requests without Read` });

  try {
    const transcripts = await deps.countTranscripts();
    results.push({ name: "no chat transcript is saved", ok: transcripts === 0, detail: `${transcripts} saved` });
  } catch (error) {
    results.push({ name: "no chat transcript is saved", ok: false, detail: reason(error) });
  }

  const env = deps.engineEnv();
  const quiet = Boolean(env?.DISABLE_TELEMETRY) && Boolean(env?.DISABLE_ERROR_REPORTING);
  results.push({ name: "the engine's telemetry and error reports are off", ok: quiet, detail: env === undefined ? "no environment was given to the engine" : "a setting is missing or empty" });

  return results;
}

export function formatCheck(results: CheckResult[]): string[] {
  const lines = results.map((result) => (result.ok ? `✓ ${result.name}` : `✗ ${result.name}: ${result.detail}`));
  const failed = results.filter((result) => !result.ok).length;
  lines.push(failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`);
  return lines;
}
