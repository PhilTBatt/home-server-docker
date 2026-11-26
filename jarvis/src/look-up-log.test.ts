import assert from "node:assert/strict";
import { test } from "node:test";
import { logVersion, startAnswerLog, type LogContext, type LookUpLogLine } from "./answer-log.js";
import { compareReport, readLog, table } from "./comparison.js";
import { noNumbers, type Helped, type LookedUp } from "./look-up.js";
import { lookUpErrorKind, lookUpLine, lookUpLogFile, lookUpLoggingNote, lookUpLogVersion, lookUpNumbers, startLookUpLog } from "./look-up-log.js";
import { noGuard, noProgram, noResult, otherTools } from "./look-up-claude.js";
import { isLookUpLine, lookUpReport } from "./look-up-report.js";

const at = new Date("2026-11-26T19:00:00.000Z");
const helped: Helped = { answer: "Node 26 is the latest, per [nodejs.org](https://nodejs.org).", error: null, numbers: { searches: 1, opened: 2, refused: 1, steps: 4, inputTokens: 25_634, outputTokens: 1_222, costEstimateUsd: 0.013, helperMs: 11_233, startMs: 1_585, credential: "none", version: "2.1.327" }, found: ["nodejs.org", "endoflife.date"], opened: ["nodejs.org"], refused: ["192.168.0.1"] };
const answered: LookedUp = { ended: "answered", say: "Node 26 is the latest, per nodejs.org.", question: "what is the latest Node version?", ms: 12_668, helped };
const numbers = { mode: "ask", by: "claude", ended: "answered", ms: 12_668, questionChars: 32, answerChars: 38, searches: 1, opened: 2, refused: 1, steps: 4, inputTokens: 25_634, outputTokens: 1_222, costEstimateUsd: 0.013, helperMs: 11_233, startMs: 1_585, credential: "none", version: "2.1.327", error: null } as const;
const context: LogContext = { engine: "sdk", thinking: null, model: "claude-haiku-5-5", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "kokoro", kokoroSpeed: 1, speechStart: "sentence", speechStop: "now", speechBundle: "off", spokenStyle: "off", persona: "off", liveFacts: "off" };

test("a look-up's numbers are taken from how it ended and what the helper reported, with lengths in place of words", () => {
  assert.deepEqual(lookUpNumbers("ask", "claude", answered), numbers);
  assert.equal(numbers.questionChars, answered.question.length);
  assert.equal(numbers.answerChars, (answered.say ?? "").length);
});

test("a look-up that never reached the helper, or didn't end in an answer, has empty numbers and no answer length", () => {
  assert.deepEqual(lookUpNumbers("auto", "claude", { ended: "stopped", say: null, question: "q", ms: 3, helped: null }), { mode: "auto", by: "claude", ended: "stopped", ms: 3, questionChars: 1, answerChars: 0, searches: 0, opened: 0, refused: 0, steps: null, inputTokens: null, outputTokens: null, costEstimateUsd: null, helperMs: null, startMs: null, credential: null, version: null, error: null });
  const failed = lookUpNumbers("ask", "claude", { ended: "failed", say: "I couldn't look that up.", question: "q", ms: 900, helped: { ...helped, answer: null, error: "Claude Code ended without a result. It exited with 1.", numbers: { ...noNumbers } } });
  assert.deepEqual([failed.ended, failed.answerChars, failed.error], ["failed", 0, "no result"]);
  assert.equal(lookUpNumbers("ask", "claude", { ended: "timed out", say: "The look-up took too long, so I stopped it.", question: "q", ms: 45_000, helped }).answerChars, 0);
});

test("the look-up log lives in jarvis/data, and its note says what it keeps and how to clear it", () => {
  assert.match(lookUpLogFile, /[\\/]jarvis[\\/]data[\\/]look-ups\.jsonl$/);
  assert.match(lookUpLoggingNote, /question that was sent, the sites it used and what went wrong if it failed/);
  assert.match(lookUpLoggingNote, /never the answer/);
  assert.match(lookUpLoggingNote, /Delete the file to clear it/);
});

test("a line in the look-up log holds the numbers, the question and the sites, and never the answer", async () => {
  const written: string[] = [];
  const log = startLookUpLog({ append: async (text) => void written.push(text), now: () => at, warn: () => assert.fail("no warning expected") });
  await log("ask", "claude", answered);
  assert.equal(written.length, 1);
  assert.ok(written[0].endsWith("\n") && !written[0].slice(0, -1).includes("\n"));
  assert.deepEqual(JSON.parse(written[0]), { v: lookUpLogVersion, at: "2026-11-26T19:00:00.000Z", ...numbers, question: "what is the latest Node version?", found: ["nodejs.org", "endoflife.date"], openedSites: ["nodejs.org"], refusedSites: ["192.168.0.1"], errorDetail: null });
  assert.ok(!written[0].includes("Node 26 is the latest"));
  assert.deepEqual(lookUpLine("ask", "claude", { ended: "stopped", say: null, question: "q", ms: 1, helped: null }, at).found, []);
});

test("what went wrong is kept as one of a fixed set of kinds in the numbers, and in the helper's own words only in the look-up log", () => {
  const kinds: [string, string][] = [
    ["stopped", "stopped"],
    [noProgram, "no program"],
    [noGuard, "no guard"],
    ["Claude Code couldn't start: spawn /app/claude EACCES", "couldn't start"],
    [`${noResult} It exited with 1. Not logged in`, "no result"],
    [noResult, "no result"],
    [otherTools, "other tools"],
    ["Claude Code said: error_max_turns", "too many steps"],
    ["Claude Code said: error_during_execution: something the page said", "claude code error"],
    ["Claude Code said: success: Invalid API key", "claude code error"],
    ["The API said 401: invalid x-api-key", "api 401"],
    ["The API said 529", "api 529"],
    ["The API's answer couldn't be read.", "api unreadable"],
    ["The API paused twice without answering.", "api paused"],
    ["The API couldn't be reached: fetch failed", "api unreachable"],
    ["something nobody planned for, with words from a page", "other"],
    ["Say: The API said 400: x", "other"],
    ["The API said 4000: x", "other"],
    ["", "other"],
  ];
  for (const [message, kind] of kinds) assert.equal(lookUpErrorKind(message), kind, message);
  const words = "Claude Code said: error_during_execution: the secret plan is on the page";
  const failed: LookedUp = { ended: "failed", say: "I couldn't look that up.", question: "q", ms: 900, helped: { ...helped, answer: null, error: words } };
  assert.equal(lookUpNumbers("ask", "claude", failed).error, "claude code error");
  assert.ok(!JSON.stringify(lookUpNumbers("ask", "claude", failed)).includes("secret plan"));
  const line = lookUpLine("ask", "claude", failed, at);
  assert.deepEqual([line.error, line.errorDetail], ["claude code error", words]);
  assert.equal(lookUpLine("ask", "claude", answered, at).errorDetail, null);
  assert.equal(lookUpLine("ask", "claude", { ended: "stopped", say: null, question: "q", ms: 1, helped: null }, at).errorDetail, null);
});

test("a look-up log that can't be written warns once and stops trying", async () => {
  const warnings: string[] = [];
  let attempts = 0;
  const log = startLookUpLog({ append: async () => (attempts++, Promise.reject(new Error("disk full"))), now: () => at, warn: (text) => void warnings.push(text) });
  await log("ask", "claude", answered);
  await log("ask", "claude", answered);
  assert.equal(attempts, 1);
  assert.deepEqual(warnings, ["Couldn't write to the look-up log, so the rest of this chat's look-ups won't be logged there: disk full"]);
});

test("the answer log's line for a look-up is numbers only: no question, no sites, no answer", async () => {
  const written: Record<string, unknown>[] = [];
  const log = startAnswerLog(context, { append: async (text) => void written.push(JSON.parse(text)), now: () => at, chat: "chat-1", warn: () => {}, costSoFar: () => null });
  await log.lookUp(lookUpNumbers("ask", "claude", answered));
  assert.deepEqual(written, [{ v: logVersion, kind: "look-up", at: "2026-11-26T19:00:00.000Z", chat: "chat-1", engine: "sdk", voice: "kokoro", ...numbers }]);
  const text = JSON.stringify(written);
  for (const word of ["latest Node version", "nodejs.org", "endoflife", "192.168", "Node 26"]) assert.ok(!text.includes(word), word);
  assert.ok(isLookUpLine(written[0]));
});

test("a look-up line doesn't count as a question for rating, and a broken answer log skips it quietly", async () => {
  const written: string[] = [];
  let fail = false;
  const warnings: string[] = [];
  const log = startAnswerLog(context, { append: async (text) => (fail ? Promise.reject(new Error("full")) : void written.push(text)), now: () => at, chat: "chat-1", warn: (text) => void warnings.push(text), costSoFar: () => null });
  await log.lookUp(lookUpNumbers("ask", "claude", answered));
  assert.equal(await log.rate("good"), "nothing to rate");
  fail = true;
  await log.lookUp(lookUpNumbers("ask", "claude", answered));
  await log.lookUp(lookUpNumbers("ask", "claude", answered));
  assert.equal(written.length, 1);
  assert.equal(warnings.length, 1);
});

const logged = (overrides: Partial<LookUpLogLine> = {}): LookUpLogLine => ({ v: logVersion, kind: "look-up", at: "2026-11-26T19:00:00.000Z", chat: "chat-1", engine: "sdk", voice: "kokoro", ...numbers, ...overrides });
const jsonl = (...lines: unknown[]) => lines.map((value) => `${JSON.stringify(value)}\n`).join("");

test("only a well-formed look-up line is read as one", () => {
  assert.ok(isLookUpLine(logged()));
  assert.ok(isLookUpLine(logged({ steps: null, inputTokens: null, outputTokens: null, costEstimateUsd: null, helperMs: null, startMs: null, credential: null, version: null, error: "x", ended: "timed out", mode: "auto", engine: "api", voice: "off" })));
  const broken: Record<string, unknown>[] = [{ kind: "speech" }, { at: "yesterday" }, { chat: 3 }, { engine: "other" }, { voice: "loud" }, { mode: "always" }, { by: "bing" }, { ended: "sort of" }, { ms: -1 }, { ms: "12" }, { questionChars: null }, { searches: Number.NaN }, { opened: undefined }, { refused: "0" }, { steps: "4" }, { inputTokens: -5 }, { costEstimateUsd: "free" }, { credential: 7 }, { error: 0 }, { v: "1" }];
  for (const change of broken) assert.equal(isLookUpLine({ ...logged(), ...change }), false, JSON.stringify(change));
  for (const value of [null, 42, "line", [], {}]) assert.equal(isLookUpLine(value), false);
});

test("look-ups by the API are logged and reported apart from Claude Code's", () => {
  assert.ok(isLookUpLine(logged({ by: "api", credential: "API key", version: null, startMs: null })));
  const report = lookUpReport([logged(), logged({ by: "api", ms: 4_000, startMs: null, credential: "API key" })], table);
  const rows = report[1].split("\n").map((row) => row.split(/\s{3,}/));
  assert.deepEqual([rows[1][0], rows[1][7], rows[1][8]], ["ask, api", "4.0 s (4.0 s)", "-"]);
  assert.deepEqual([rows[2][0], rows[2][7], rows[2][8]], ["ask, claude", "12.7 s (12.7 s)", "1.6 s"]);
  assert.equal(report[3], "The sign-in each look-up reported: API key (1), none (1).");
});

test("the compare tool reads look-up lines apart from answers, and counts nothing as unreadable", () => {
  const read = readLog(jsonl(logged(), logged({ ended: "failed", error: "exit 1" }), { ...logged(), by: "bing" }));
  assert.equal(read.lookUps?.length, 2);
  assert.deepEqual([read.lines.length, read.skipped], [0, 1]);
});

test("the look-up report groups by mode and helper, with medians over answered look-ups and totals for refusals and cost", () => {
  const lines = [
    logged({ ms: 10_000, startMs: 1_000, searches: 1, opened: 0, refused: 0, inputTokens: 20_000, outputTokens: 1_000, costEstimateUsd: 0.01 }),
    logged({ ms: 14_000, startMs: 2_000, searches: 3, opened: 2, refused: 2, inputTokens: 30_000, outputTokens: 2_000, costEstimateUsd: 0.03, at: "2026-11-27T08:00:00.000Z" }),
    logged({ ended: "failed", ms: 900, error: "Claude Code ended without a result. It exited with 1.", refused: 1, costEstimateUsd: null, credential: null }),
    logged({ ended: "timed out", ms: 45_000, costEstimateUsd: 0.02 }),
    logged({ ended: "stopped", ms: 2_000, error: "stopped", costEstimateUsd: null }),
    logged({ ended: "nothing", ms: 8_000, costEstimateUsd: 0.01 }),
    logged({ mode: "auto", ms: 7_000, credential: "ANTHROPIC_API_KEY" }),
  ];
  const report = lookUpReport(lines, table);
  assert.equal(report[0], "7 look-ups logged. By day (UTC): 2026-11-26 (6), 2026-11-27 (1).");
  const rows = report[1].split("\n").map((row) => row.split(/\s{3,}/));
  assert.deepEqual(rows[0].slice(1), ["Look-ups", "Answered", "Found nothing", "Failed", "Too slow", "Stopped", "Time", "Starting up", "Searches", "Pages opened", "Pages refused", "Tokens in", "Tokens out", "Est. cost each", "Est. cost in all"]);
  assert.deepEqual(rows[1], ["ask, claude", "6", "2", "1", "1", "1", "1", "12.0 s (14.0 s)", "1.5 s", "2.0", "1.0", "6", "25,000", "1,500", "$0.0200", "$0.0700"]);
  assert.deepEqual(rows[2], ["auto, claude", "1", "1", "0", "0", "0", "0", "7.0 s (7.0 s)", "1.6 s", "1.0", "2.0", "1", "25,634", "1,222", "$0.0130", "$0.0130"]);
  assert.match(report[2], /on a plan it isn't a bill/);
  assert.equal(report[3], "The sign-in each look-up reported: ANTHROPIC_API_KEY (1), none (5).");
  assert.equal(report[4], "What went wrong: Claude Code ended without a result. It exited with 1. (1).");
  assert.equal(report.length, 5);
});

test("a group with nothing answered shows dashes, one look-up is singular, and no look-ups gives no section", () => {
  const report = lookUpReport([logged({ ended: "failed", error: null, credential: null, costEstimateUsd: null })], table);
  assert.equal(report[0], "1 look-up logged. By day (UTC): 2026-11-26 (1).");
  assert.deepEqual(report[1].split("\n")[1].split(/\s{3,}/), ["ask, claude", "1", "0", "0", "1", "0", "0", "- (-)", "-", "-", "-", "1", "-", "-", "-", "-"]);
  assert.equal(report.length, 3);
  assert.deepEqual(lookUpReport([], table), []);
});

test("the compare report ends with the look-ups, with or without answers in the log", () => {
  const only = compareReport(readLog(jsonl(logged())));
  assert.match(only, /^No answers logged yet\./);
  assert.match(only, /\n\nLook-ups:\n1 look-up logged\./);
  assert.ok(!compareReport(readLog("")).includes("Look-ups"));
});
