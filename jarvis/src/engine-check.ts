import type { AgentSession } from "./agent.js";
import { gitRefusal, outsideRefusal } from "./brain-tools.js";
import { apiChatSystem, chatSystem } from "./chat.js";
import type { ChatMode, Engine } from "./config.js";
import { withTimeout } from "./run.js";
import {
  echoFor,
  findIgnoredWord,
  findInsideWord,
  findOutsideWord,
  ignoredName,
  longName,
  longText,
  plainAnswer,
  readGitWord,
  readInsideWord,
  readLinkedWord,
  readOutsideWord,
  searchCaseWord,
  searchHiddenWord,
  searchIgnoredWord,
  searchInsideWord,
  searchLongWord,
  searchOutsideWord,
  type SeenRequest,
  type SeenToolResult,
} from "./stand-in-api.js";

export type CheckResult = { name: string; ok: boolean; detail: string };

export type Probe = { tool: string | null; used: string[]; refusedTools: string[]; spokeFirst: boolean | null; answer: string | null; expectedAnswer: string | null; threw: string | null; results: SeenToolResult[] };

export type Refusal = "outside" | "git";

export type EngineUnderTest = {
  engine: Engine;
  session: AgentSession;
  requests: SeenRequest[];
  systemMarker: string;
  tools: string[];
  extraTools: string[];
  refused: (probe: Probe, because: Refusal) => boolean;
};

export type Markers = { inside: string; outside: string; git: string; settings: string; hidden: string; ignored: string; mixedCase: string };

export type EngineCheckDeps = {
  engines: EngineUnderTest[];
  markers: Markers;
  model: string;
  timeoutMs: number;
  settleMs: number;
  countTranscripts: () => Promise<number>;
  engineEnv: () => Record<string, string | undefined> | undefined;
};

export type Expect = { refused?: Refusal; found?: string[]; absent?: string[] };

export type SharedRule = { name: string; word: string; expect: Expect; differs?: { engine: Engine; expect: Expect; why: string } };

export const checkNames: Record<Engine, string> = { sdk: "Agent SDK", api: "plain API call" };

function refusedBy(probe: Probe): boolean {
  return probe.tool !== null && probe.threw === null && probe.refusedTools.length > 0 && probe.refusedTools.every((name) => name === probe.tool) && probe.results.length > 0 && probe.results.every((result) => result.isError);
}

export function sdkRefused(probe: Probe): boolean {
  return refusedBy(probe);
}

export function apiRefused(probe: Probe, because: Refusal): boolean {
  const refusal = because === "git" ? gitRefusal : outsideRefusal;
  return refusedBy(probe) && probe.results.every((result) => result.text === refusal);
}

export function sdkUnderTest(session: AgentSession, requests: SeenRequest[]): EngineUnderTest {
  return { engine: "sdk", session, requests, systemMarker: chatSystem, tools: ["Read", "Grep", "Glob"], extraTools: ["DeferredToolPlaceholder"], refused: sdkRefused };
}

export function apiUnderTest(session: AgentSession, requests: SeenRequest[]): EngineUnderTest {
  return { engine: "api", session, requests, systemMarker: apiChatSystem, tools: ["read_file", "list_folder", "search_files", "find_files"], extraTools: [], refused: apiRefused };
}

export function sharedRules(markers: Markers): SharedRule[] {
  return [
    { name: "a file in the brain can be read", word: readInsideWord, expect: { found: [markers.inside] } },
    { name: "a file outside the brain is refused", word: readOutsideWord, expect: { refused: "outside", absent: [markers.outside] } },
    { name: "the .git folder is off limits", word: readGitWord, expect: { refused: "git", absent: [markers.git] } },
    { name: "a link from the brain to a file outside is refused", word: readLinkedWord, expect: { refused: "outside", absent: [markers.outside] } },
    { name: "a search inside the brain finds the file", word: searchInsideWord, expect: { found: [markers.inside], absent: [markers.git, markers.outside] } },
    { name: "a search outside the brain is refused", word: searchOutsideWord, expect: { refused: "outside", absent: [markers.outside] } },
    { name: "finding files in the brain lists the file, but not .git or links out", word: findInsideWord, expect: { found: ["index.md"], absent: [".git/", "linked/", "secret.md"] } },
    { name: "finding files outside the brain is refused", word: findOutsideWord, expect: { refused: "outside", absent: ["secret.md"] } },
    { name: "a search looks inside hidden files", word: searchHiddenWord, expect: { found: [markers.hidden] } },
    {
      name: "a search looks inside git-ignored files",
      word: searchIgnoredWord,
      expect: { found: [markers.ignored] },
      differs: { engine: "sdk", expect: { absent: [markers.ignored] }, why: "Grep skips what .gitignore lists" },
    },
    { name: "finding files lists git-ignored files", word: findIgnoredWord, expect: { found: [ignoredName] } },
    {
      name: "a search ignores capital letters",
      word: searchCaseWord,
      expect: { found: [markers.mixedCase] },
      differs: { engine: "sdk", expect: { absent: [markers.mixedCase] }, why: "Grep matches capitals unless asked not to" },
    },
    {
      name: "a long line comes back without broken characters",
      word: searchLongWord,
      expect: { found: [longText] },
      differs: { engine: "sdk", expect: { found: [longName], absent: [longText] }, why: "Grep leaves out very long lines and names only the file" },
    },
  ];
}

export const helloQuestion = "Hello";

export function expectedRequests(rules: SharedRule[]): RegExp[] {
  return [/^Hello$/, ...rules.flatMap((rule) => [new RegExp(rule.word), /^\[tool result\]/])];
}

const brokenCharacter = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]|\ufffd/;

export function problems(expect: Expect, probe: Probe, refused: boolean): string[] {
  const found: string[] = [];
  const text = probe.results.map((result) => result.text).join("\n");
  if (probe.tool === null) found.push("no tool was asked for");
  else if (!probe.used.includes(probe.tool)) found.push(`no tool note for ${probe.tool}`);
  if (probe.results.length === 0) found.push(probe.threw === null ? "no tool result reached the API" : `no tool result reached the API (${probe.threw})`);
  if (brokenCharacter.test(text)) found.push("a result has a broken character");
  if (expect.refused !== undefined && !refused) found.push(probe.threw !== null ? `not refused (${probe.threw})` : `not refused (${probe.refusedTools.length === 0 ? "nothing reported refused" : `reported refused: ${probe.refusedTools.join(", ")}`})`);
  if (expect.refused === undefined && (probe.threw !== null || probe.results.some((result) => result.isError))) found.push(probe.threw ?? "the tool failed");
  if (probe.threw === null && probe.expectedAnswer !== null && probe.answer !== probe.expectedAnswer) found.push("the answer after the tool didn't come back");
  if (probe.threw === null && probe.tool !== null && probe.spokeFirst !== true) found.push("didn't report the words said before the tool");
  const missing = (expect.found ?? []).filter((wanted) => !text.includes(wanted));
  if (missing.length > 0) found.push(`didn't show ${missing.join(", ")}`);
  const shown = (expect.absent ?? []).filter((unwanted) => text.includes(unwanted));
  if (shown.length > 0) found.push(`showed ${shown.join(", ")}`);
  return found;
}

function scope(engines: EngineUnderTest[]): string {
  return engines.length === 1 ? checkNames[engines[0].engine] : "both engines";
}

function check(engine: EngineUnderTest, expect: Expect, probe: Probe): string[] {
  return problems(expect, probe, expect.refused !== undefined && engine.refused(probe, expect.refused));
}

export function judgeRule(rule: SharedRule, engines: EngineUnderTest[], probes: Map<Engine, Map<string, Probe>>): CheckResult {
  const failures: string[] = [];
  for (const engine of engines) {
    const probe = probes.get(engine.engine)?.get(rule.word) ?? { tool: null, used: [], refusedTools: [], spokeFirst: null, answer: null, expectedAnswer: null, threw: "not asked", results: [] };
    const differs = rule.differs?.engine === engine.engine ? rule.differs : undefined;
    const wrong = check(engine, differs?.expect ?? rule.expect, probe);
    if (wrong.length === 0) continue;
    if (differs !== undefined && check(engine, rule.expect, probe).length === 0) {
      failures.push(`${checkNames[engine.engine]} no longer differs (${differs.why}), so remove that from the expected differences`);
    } else {
      failures.push(`${checkNames[engine.engine]}: ${wrong.join("; ")}`);
    }
  }
  const differs = rule.differs;
  const note = differs === undefined || !engines.some((engine) => engine.engine === differs.engine) ? "" : ` (${engines.length === 1 ? "it" : checkNames[differs.engine]} differs, as expected: ${differs.why})`;
  return { name: `${scope(engines)}: ${rule.name}${note}`, ok: failures.length === 0, detail: failures.length === 0 ? "worked" : failures.join(" | ") };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function list(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function calls(engine: EngineUnderTest): SeenRequest[] {
  return engine.requests.filter((request) => request.path === "/v1/messages");
}

export async function runEngineCheck(deps: EngineCheckDeps): Promise<CheckResult[]> {
  const rules = sharedRules(deps.markers);
  const results: CheckResult[] = [];
  const probes = new Map<Engine, Map<string, Probe>>();
  const hello: string[] = [];

  for (const engine of deps.engines) {
    const ask = (question: string, used: string[] = []) => withTimeout(engine.session.ask(question, { tool: (name) => used.push(name) }), deps.timeoutMs, () => engine.session.close());
    try {
      const answer = await ask(helloQuestion);
      if (answer.text !== plainAnswer) hello.push(`${checkNames[engine.engine]}: ${answer.text}`);
    } catch (error) {
      hello.push(`${checkNames[engine.engine]}: ${reason(error)}`);
    }
    const seen = new Map<string, Probe>();
    for (const rule of rules) {
      const from = engine.requests.length;
      const used: string[] = [];
      let answer: string | null = null;
      let refusedTools: string[] = [];
      let spokeFirst: boolean | null = null;
      let threw: string | null = null;
      try {
        const answered = await ask(`Please ${rule.word}`, used);
        answer = answered.text;
        refusedTools = answered.stats?.refusedTools ?? [];
        spokeFirst = answered.stats?.spokeFirst ?? null;
      } catch (error) {
        threw = reason(error);
      }
      const after = engine.requests.slice(from);
      const lastResult = after.filter((request) => request.toolResults.length > 0).at(-1);
      seen.set(rule.word, {
        tool: after.find((request) => request.asked !== null)?.asked ?? null,
        used,
        refusedTools,
        spokeFirst,
        answer,
        expectedAnswer: lastResult === undefined ? null : echoFor(lastResult.lastUserText),
        threw,
        results: after.flatMap((request) => request.toolResults),
      });
    }
    probes.set(engine.engine, seen);
  }
  results.push({ name: `${scope(deps.engines)}: a question gets an answer`, ok: hello.length === 0, detail: hello.length === 0 ? plainAnswer : hello.join(" | ") });
  for (const rule of rules) results.push(judgeRule(rule, deps.engines, probes));

  await new Promise((resolve) => setTimeout(resolve, deps.settleMs));

  const everything = deps.engines.flatMap((engine) => engine.requests);
  const leaked = everything.filter((request) => request.body.includes(deps.markers.outside) || request.body.includes(deps.markers.git)).length;
  results.push({ name: `${scope(deps.engines)}: nothing from .git or outside the brain reached the API`, ok: leaked === 0, detail: `${leaked} requests carried it` });

  const settings = everything.filter((request) => request.body.includes(deps.markers.settings)).length;
  results.push({ name: `${scope(deps.engines)}: settings and instruction files in the brain are ignored`, ok: settings === 0, detail: `${settings} requests carried them` });

  const expected = expectedRequests(rules);
  const outOfOrder = deps.engines.filter((engine) => {
    const sent = calls(engine);
    return !(sent.length === expected.length && sent.every((request, index) => expected[index].test(request.lastUserText) && request.system.includes(engine.systemMarker)));
  });
  results.push({
    name: `${scope(deps.engines)}: only Jarvis's own ${expected.length} requests${deps.engines.length === 1 ? "" : " each"}, in order (no title or other extra requests)`,
    ok: deps.engines.length > 0 && outOfOrder.length === 0,
    detail: outOfOrder.map((engine) => `${checkNames[engine.engine]} sent ${calls(engine).length}: ${calls(engine).map((request) => JSON.stringify(request.lastUserText.slice(0, 30))).join(", ")}`).join(" | "),
  });

  const models = deps.engines.map((engine) => ({ engine, sent: calls(engine).length, wrong: calls(engine).filter((request) => request.model !== deps.model).length }));
  const wrongModel = models.filter((model) => model.sent === 0 || model.wrong > 0);
  results.push({
    name: `${scope(deps.engines)}: every request uses ${deps.model}`,
    ok: deps.engines.length > 0 && wrongModel.length === 0,
    detail: wrongModel.map((model) => (model.sent === 0 ? `${checkNames[model.engine.engine]}: no requests` : `${checkNames[model.engine.engine]}: ${model.wrong} of ${model.sent} didn't`)).join(" | "),
  });

  for (const engine of deps.engines) {
    const sent = calls(engine);
    const offered = [...new Set(sent.flatMap((request) => request.tools))].sort();
    const extra = offered.filter((tool) => !engine.tools.includes(tool) && !engine.extraTools.includes(tool));
    const missing = sent.filter((request) => !engine.tools.every((tool) => request.tools.includes(tool))).length;
    results.push({
      name: `${checkNames[engine.engine]}: only ${list(engine.tools)} are offered`,
      ok: sent.length > 0 && missing === 0 && extra.length === 0,
      detail: `offered: ${offered.join(", ") || "none"}; ${missing} requests without all ${engine.tools.length}`,
    });
  }

  if (deps.engines.some((engine) => engine.engine === "sdk")) {
    try {
      const transcripts = await deps.countTranscripts();
      results.push({ name: "Agent SDK: no chat transcript is saved", ok: transcripts === 0, detail: `${transcripts} saved` });
    } catch (error) {
      results.push({ name: "Agent SDK: no chat transcript is saved", ok: false, detail: reason(error) });
    }
    const env = deps.engineEnv();
    const quiet = Boolean(env?.DISABLE_TELEMETRY) && Boolean(env?.DISABLE_ERROR_REPORTING);
    results.push({ name: "Agent SDK: the engine's telemetry and error reports are off", ok: quiet, detail: env === undefined ? "no environment was given to the engine" : "a setting is missing or empty" });
  }

  return results;
}

export type StartedChat = AgentSession & { knownSize?: number; rememberSize?: (tokens: number) => Promise<void> };

export type SavedChatsUnderTest = {
  engine: Engine;
  start: (chats: ChatMode | "new") => Promise<StartedChat>;
  requests: SeenRequest[];
  saved: () => Promise<number>;
};

export type SavedChatsDeps = {
  engines: SavedChatsUnderTest[];
  marker: string;
  timeoutMs: number;
  settleMs: number;
};

export const pickedQuestion = "What did I ask you to remember?";
export const freshQuestion = "Hello from a fresh chat";
export const lastQuestion = "Anything else?";
export const newQuestion = "Starting over";
export const afterNewQuestion = "And now?";

export async function runSavedChatsCheck(deps: SavedChatsDeps): Promise<CheckResult[]> {
  const scope = deps.engines.length === 1 ? checkNames[deps.engines[0].engine] : "both engines";
  const failures: Record<string, string[]> = { fresh: [], first: [], picked: [], ignored: [], renewed: [], sized: [] };
  const settle = () => new Promise((resolve) => setTimeout(resolve, deps.settleMs));
  for (const engine of deps.engines) {
    const name = checkNames[engine.engine];
    const chat = async (chats: ChatMode | "new", question: string, settleAfter = true) => {
      const session = await engine.start(chats);
      const from = engine.requests.length;
      const sent = () => engine.requests.slice(from).filter((request) => request.path === "/v1/messages");
      const knownSize = session.knownSize ?? null;
      try {
        const answer = await withTimeout(session.ask(question, {}), deps.timeoutMs, () => session.close());
        const size = answer.stats?.lastRequestTokens ?? null;
        if (size !== null) await session.rememberSize?.(size);
        return { answer: answer.text, sent: sent(), knownSize, size };
      } catch (error) {
        return { answer: `failed: ${reason(error)}`, sent: sent(), knownSize, size: null };
      } finally {
        session.close();
        if (settleAfter) await settle();
      }
    };
    const remember = `Please remember ${deps.marker}`;
    const count = (sent: SeenRequest[], text: string) => (sent.length === 0 ? 0 : sent[0].body.split(text).length - 1);
    const fresh = await chat("fresh", remember);
    const afterFresh = await engine.saved();
    if (fresh.answer !== plainAnswer || afterFresh !== 0) failures.fresh.push(`${name}: answered "${fresh.answer}", ${afterFresh} saved`);
    const first = await chat("resume", remember);
    const afterFirst = await engine.saved();
    if (first.answer !== plainAnswer || afterFirst !== 1 || count(first.sent, deps.marker) !== 1) failures.first.push(`${name}: answered "${first.answer}", ${afterFirst} saved, the question appeared ${count(first.sent, deps.marker)} times in its first request`);
    const picked = await chat("resume", pickedQuestion);
    const beforeIgnored = await engine.saved();
    const ignored = await chat("fresh", freshQuestion);
    const afterIgnored = await engine.saved();
    const last = await chat("resume", lastQuestion, false);
    const carried = { marker: count(last.sent, deps.marker), picked: count(last.sent, pickedQuestion), answers: count(last.sent, plainAnswer), fresh: count(last.sent, freshQuestion) };
    if (picked.answer !== plainAnswer || last.answer !== plainAnswer || count(picked.sent, deps.marker) !== 1 || carried.marker !== 1 || carried.picked !== 1 || carried.answers !== 2) {
      failures.picked.push(`${name}: answered "${picked.answer}" then "${last.answer}"; the second resumed chat's first request carried the first question ${count(picked.sent, deps.marker)} times, the third's carried the first question ${carried.marker} times, the second ${carried.picked} times and the answers ${carried.answers} times`);
    }
    const renewed = await chat("new", newQuestion);
    const after = await chat("resume", afterNewQuestion);
    const old = { renewed: count(renewed.sent, deps.marker) + count(renewed.sent, pickedQuestion), after: count(after.sent, deps.marker), kept: count(after.sent, newQuestion) };
    if (renewed.answer !== plainAnswer || after.answer !== plainAnswer || renewed.sent.length === 0 || old.renewed !== 0 || old.after !== 0 || old.kept !== 1) {
      failures.renewed.push(`${name}: answered "${renewed.answer}" then "${after.answer}"; the new chat's first request carried the old chat ${old.renewed} times, the next resumed chat carried the old chat ${old.after} times and the new chat's question ${old.kept} times`);
    }
    const started = [first, picked, last, renewed, after].map((run) => String(run.knownSize));
    if (first.size === null || first.knownSize !== null || picked.knownSize !== first.size || last.knownSize !== picked.size || renewed.knownSize !== null || after.knownSize !== renewed.size) {
      failures.sized.push(`${name}: answers reached ${[first.size, picked.size, renewed.size].map(String).join(", ")} tokens; the chats started with ${started.join(", ")}`);
    }
    if (ignored.answer !== plainAnswer || ignored.sent.length === 0 || ignored.sent.some((request) => request.body.includes(deps.marker)) || afterIgnored !== beforeIgnored || carried.fresh !== 0) {
      failures.ignored.push(`${name}: answered "${ignored.answer}", ${ignored.sent.some((request) => request.body.includes(deps.marker)) ? "carried the saved chat" : "didn't carry the saved chat"}, ${afterIgnored} saved after it; the next resumed chat carried the fresh chat's question ${carried.fresh} times`);
    }
  }
  const result = (key: string, name: string): CheckResult => ({ name: `${scope}: ${name}`, ok: deps.engines.length > 0 && failures[key].length === 0, detail: failures[key].join(" | ") });
  return [
    result("fresh", "a fresh chat saves nothing"),
    result("first", "with nothing saved yet, a resumed chat starts one and saves it"),
    result("picked", "a resumed chat picks up where the last one stopped"),
    result("ignored", "a fresh chat leaves a saved one alone"),
    result("renewed", "new starts a chat without the old one, and that's the one picked up next"),
    result("sized", "a resumed chat starts with the size its last answer reached, and new starts with none"),
  ];
}

export function formatCheck(results: CheckResult[]): string[] {
  const lines = results.map((result) => (result.ok ? `✓ ${result.name}` : `✗ ${result.name}: ${result.detail}`));
  const failed = results.filter((result) => !result.ok).length;
  lines.push(failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`);
  return lines;
}
