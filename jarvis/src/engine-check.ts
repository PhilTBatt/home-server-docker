import type { AgentSession } from "./agent.js";
import { withTimeout } from "./run.js";
import { findInsideWord, findOutsideWord, plainAnswer, readGitWord, readInsideWord, readLinkedWord, readOutsideWord, searchInsideWord, searchOutsideWord, type SeenRequest } from "./stand-in-api.js";

export type CheckResult = { name: string; ok: boolean; detail: string };

export type EngineCheckDeps = {
  session: AgentSession;
  requests: SeenRequest[];
  insideMarker: string;
  outsideMarker: string;
  gitMarker: string;
  settingsMarker: string;
  systemMarker: string;
  model: string;
  timeoutMs: number;
  settleMs: number;
  countTranscripts: () => Promise<number>;
  engineEnv: () => Record<string, string | undefined> | undefined;
};

export const requiredTools = ["Read", "Grep", "Glob"];
export const allowedTools = [...requiredTools, "DeferredToolPlaceholder"];

export const expectedRequests: RegExp[] = [
  /^Hello$/,
  ...[readInsideWord, readOutsideWord, readGitWord, readLinkedWord, searchInsideWord, searchOutsideWord, findInsideWord, findOutsideWord].flatMap((word) => [new RegExp(word), /^\[tool result\]/]),
];

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runEngineCheck(deps: EngineCheckDeps): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const ask = async (question: string) => {
    const used: string[] = [];
    const answer = await withTimeout(deps.session.ask(question, { tool: (name) => used.push(name) }), deps.timeoutMs, () => deps.session.close());
    return { answer, used };
  };
  const works = async (name: string, question: string, tool: string, wanted: string, unwanted: string[] = []) => {
    try {
      const { answer, used } = await ask(question);
      const extra = unwanted.filter((text) => answer.text.includes(text));
      const ok = answer.text.includes(wanted) && used.includes(tool) && extra.length === 0;
      results.push({ name, ok, detail: ok ? "worked" : `${used.includes(tool) ? tool : `no ${tool}`}${extra.length > 0 ? `; showed ${extra.join(", ")}` : ""}; answer: ${answer.text}` });
    } catch (error) {
      results.push({ name, ok: false, detail: reason(error) });
    }
  };
  const refusedTo = async (name: string, question: string, tool: string) => {
    try {
      const { answer } = await ask(question);
      results.push({ name, ok: false, detail: `not refused: ${answer.text}` });
    } catch (error) {
      const message = reason(error);
      results.push({ name, ok: message.startsWith(`Refused: ${tool}`), detail: message });
    }
  };

  try {
    const { answer } = await ask("Hello");
    results.push({ name: "a question gets an answer", ok: answer.text === plainAnswer, detail: answer.text });
  } catch (error) {
    results.push({ name: "a question gets an answer", ok: false, detail: reason(error) });
  }
  await works("a file in the brain can be read", `Please ${readInsideWord}`, "Read", deps.insideMarker);
  await refusedTo("a file outside the brain is refused", `Please ${readOutsideWord}`, "Read");
  await refusedTo("the .git folder is off limits", `Please ${readGitWord}`, "Read");
  await refusedTo("a link from the brain to a file outside is refused", `Please ${readLinkedWord}`, "Read");
  await works("a search inside the brain finds the file", `Please ${searchInsideWord}`, "Grep", "index.md", [".git", "linked"]);
  await refusedTo("a search outside the brain is refused", `Please ${searchOutsideWord}`, "Grep");
  await works("finding files in the brain lists the file, but not .git or links out", `Please ${findInsideWord}`, "Glob", "index.md", [".git", "linked"]);
  await refusedTo("finding files outside the brain is refused", `Please ${findOutsideWord}`, "Glob");

  await new Promise((resolve) => setTimeout(resolve, deps.settleMs));

  const leaked = deps.requests.filter((request) => request.body.includes(deps.outsideMarker) || request.body.includes(deps.gitMarker)).length;
  results.push({ name: "nothing from .git or outside the brain reached the API", ok: leaked === 0, detail: `${leaked} requests carried it` });

  const settings = deps.requests.filter((request) => request.body.includes(deps.settingsMarker)).length;
  results.push({ name: "settings and instruction files in the brain are ignored", ok: settings === 0, detail: `${settings} requests carried them` });

  const calls = deps.requests.filter((request) => request.path === "/v1/messages");
  const inOrder = calls.length === expectedRequests.length && calls.every((request, index) => expectedRequests[index].test(request.lastUserText) && request.system.includes(deps.systemMarker));
  results.push({ name: `only Jarvis's own ${expectedRequests.length} requests, in order (no title or other extra requests)`, ok: inOrder, detail: `${calls.length} requests: ${calls.map((request) => JSON.stringify(request.lastUserText.slice(0, 30))).join(", ")}` });

  const wrongModel = calls.filter((request) => request.model !== deps.model).length;
  results.push({ name: `every request uses ${deps.model}`, ok: calls.length > 0 && wrongModel === 0, detail: `${wrongModel} of ${calls.length} didn't` });

  const offered = [...new Set(calls.flatMap((request) => request.tools))].sort();
  const extra = offered.filter((tool) => !allowedTools.includes(tool));
  const missing = calls.filter((request) => !requiredTools.every((tool) => request.tools.includes(tool))).length;
  results.push({ name: "only Read, Grep and Glob are offered", ok: calls.length > 0 && missing === 0 && extra.length === 0, detail: `offered: ${offered.join(", ") || "none"}; ${missing} requests without all three` });

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
