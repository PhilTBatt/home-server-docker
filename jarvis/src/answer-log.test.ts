import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { answerLogFile, errorKind, logLine, logVersion, startAnswerLog, type LogContext, type Outcome } from "./answer-log.js";
import type { Answer } from "./timing.js";

const apiKeep: LogContext = { engine: "api", thinking: "keep", model: "claude-haiku-5-5" };
const at = new Date("2026-11-16T18:30:00.000Z");

const answered: Answer = {
  text: "Your notes cover the hub and your family.",
  firstWordsMs: 640,
  totalMs: 2100,
  stats: { rounds: 2, toolUses: 1, inputTokens: 5200, cacheWriteTokens: 1200, cacheReadTokens: 3000, outputTokens: 90, costUsd: 0.000565, earlierThinkingBlocks: 3, recovered: true, largestRequestTokens: 2900, refusedTools: ["read_file"], spokeFirst: true },
};

function fakeLog(context: LogContext = apiKeep, failAppends = 0) {
  const written: string[] = [];
  const warnings: string[] = [];
  let attempts = 0;
  const { record, rate } = startAnswerLog(context, {
    append: async (text) => {
      attempts++;
      if (attempts <= failAppends) throw new Error("EACCES: permission denied");
      written.push(text);
    },
    now: () => at,
    chat: "chat-1",
    warn: (message) => warnings.push(message),
    costSoFar: () => null,
  });
  return { record, rate, written, warnings, attempts: () => attempts };
}

test("the log lives in jarvis/data, next to src and dist", () => {
  assert.equal(answerLogFile, fileURLToPath(new URL("../data/answers.jsonl", import.meta.url)));
});

test("an answer becomes one line of numbers, with none of its words", () => {
  assert.deepEqual(logLine(apiKeep, "chat-1", 3, at, { answer: answered }), {
    v: logVersion,
    at: "2026-11-16T18:30:00.000Z",
    chat: "chat-1",
    question: 3,
    engine: "api",
    thinking: "keep",
    model: "claude-haiku-5-5",
    ok: true,
    error: null,
    firstWordsMs: 640,
    totalMs: 2100,
    rounds: 2,
    toolUses: 1,
    inputTokens: 5200,
    cacheWriteTokens: 1200,
    cacheReadTokens: 3000,
    outputTokens: 90,
    costUsd: 0.000565,
    earlierThinkingBlocks: 3,
    recovered: true,
    largestRequestTokens: 2900,
    refusedTools: 1,
    spokeFirst: true,
  });
  assert.doesNotMatch(JSON.stringify(logLine(apiKeep, "chat-1", 3, at, { answer: answered })), /notes|family|read_file/);
});

test("a failure is logged as a kind of failure, never its message", () => {
  const line = logLine(apiKeep, "chat-1", 1, at, { error: "Your notes say the spare key is under the blue pot" });
  assert.equal(line.ok, false);
  assert.equal(line.error, "other");
  assert.equal(line.totalMs, null);
  assert.equal(line.inputTokens, null);
  assert.equal(line.cacheReadTokens, null);
  assert.equal(line.recovered, null);
  assert.equal(line.largestRequestTokens, null);
  assert.equal(line.refusedTools, null);
  assert.equal(line.spokeFirst, null);
  assert.doesNotMatch(JSON.stringify(line), /spare key|blue pot/);
});

test("whether Jarvis spoke before his first tool is logged as the engine reported it: yes, no, or no tool used", () => {
  const spoke = (spokeFirst: boolean | null) => ({ answer: { ...answered, stats: { ...answered.stats!, spokeFirst } } });
  assert.equal(logLine(apiKeep, "chat-1", 1, at, spoke(false)).spokeFirst, false);
  assert.equal(logLine(apiKeep, "chat-1", 1, at, spoke(null)).spokeFirst, null);
  assert.equal(logLine(apiKeep, "chat-1", 1, at, { answer: { text: "Hi.", firstWordsMs: null, totalMs: 900 } }).spokeFirst, null);
});

test("an unknown largest request is logged as unknown, not zero", () => {
  assert.equal(logLine(apiKeep, "chat-1", 1, at, { answer: { ...answered, stats: { ...answered.stats!, largestRequestTokens: null } } }).largestRequestTokens, null);
});

test("refused tools are counted, not named, and an answer with none counts zero", () => {
  const none = { ...answered, stats: { ...answered.stats!, refusedTools: [] } };
  assert.equal(logLine(apiKeep, "chat-1", 1, at, { answer: none }).refusedTools, 0);
  const two = { ...answered, stats: { ...answered.stats!, refusedTools: ["Read", "Grep"] } };
  assert.equal(logLine(apiKeep, "chat-1", 1, at, { answer: two }).refusedTools, 2);
});

test("an answer without numbers logs its timings and leaves the rest empty", () => {
  const line = logLine(apiKeep, "chat-1", 1, at, { answer: { text: "Hi.", firstWordsMs: null, totalMs: 900 } });
  assert.equal(line.ok, true);
  assert.equal(line.firstWordsMs, null);
  assert.equal(line.totalMs, 900);
  assert.equal(line.rounds, null);
  assert.equal(line.costUsd, null);
});

test("times are logged to the whole millisecond, and costs without floating-point noise", () => {
  const line = logLine(apiKeep, "c", 1, at, {
    answer: { ...answered, firstWordsMs: 178.83546499999989, totalMs: 180.5, stats: { ...answered.stats!, costUsd: 0.00027420000000000005 } },
  });
  assert.equal(line.firstWordsMs, 179);
  assert.equal(line.totalMs, 181);
  assert.equal(line.costUsd, 0.0002742);
  assert.equal(logLine(apiKeep, "c", 1, at, { answer: { ...answered, stats: { ...answered.stats!, costUsd: 0.000000004 } } }).costUsd, 0);
});

test("the thinking setting is only logged for the plain API engine, which is the only one it changes", () => {
  assert.equal(logLine({ engine: "sdk", thinking: "drop", model: "m" }, "c", 1, at, { answer: answered }).thinking, null);
  assert.equal(logLine({ engine: "api", thinking: "drop", model: "m" }, "c", 1, at, { answer: answered }).thinking, "drop");
});

test("failures are sorted into kinds", () => {
  const kinds: [string, string][] = [
    ["The API replied 400: messages: text content blocks must contain non-whitespace text", "api 400"],
    ["The API replied 529: Overloaded", "api 529"],
    ["The API didn't answer in time", "api timeout"],
    ["Couldn't reach the API", "api unreachable"],
    ["The API stopped with an error: overloaded_error", "api stream error"],
    ["The API sent no answer", "api empty"],
    ["No answer within 120 seconds", "timeout"],
    ["The answer was cut off", "cut off"],
    ["The answer was cut off part-way through using a tool", "cut off"],
    ["Gave up after 10 rounds of tool use", "too many tool rounds"],
    ["Refused: Read", "other"],
    ["error_max_turns", "engine error"],
    ["The agent stopped", "engine stopped"],
    ["Something new", "other"],
    ["", "other"],
  ];
  for (const [message, kind] of kinds) assert.equal(errorKind(message), kind, message);
});

test("messages that only start like a known failure aren't trusted to be one", () => {
  assert.equal(errorKind("The API replied 4000: nope"), "other");
  assert.equal(errorKind("Say: The API replied 400: x"), "other");
  assert.equal(errorKind("No answer within 120 seconds, said your notes"), "other");
  assert.equal(errorKind("error_Your notes"), "other");
  assert.equal(errorKind("The agent stopped talking about the spare key"), "other");
});

test("each line is JSON on its own line, numbered by question within the chat", async () => {
  const { record, written } = fakeLog();
  await record({ answer: answered });
  await record({ error: "No answer within 120 seconds" });
  await record({ answer: answered });
  assert.equal(written.length, 3);
  assert.ok(written.every((text) => text.endsWith("\n") && !text.slice(0, -1).includes("\n")));
  const lines = written.map((text) => JSON.parse(text));
  assert.deepEqual(
    lines.map((line) => [line.question, line.ok, line.error, line.chat]),
    [
      [1, true, null, "chat-1"],
      [2, false, "timeout", "chat-1"],
      [3, true, null, "chat-1"],
    ],
  );
});

test("if the log can't be written, it says so once, stops trying, and the chat carries on", async () => {
  const { record, written, warnings, attempts } = fakeLog(apiKeep, 1);
  const outcomes: Outcome[] = [{ answer: answered }, { answer: answered }, { error: "Refused: Read" }];
  for (const outcome of outcomes) await assert.doesNotReject(record(outcome));
  assert.deepEqual(warnings, ["Couldn't write to the answer log, so the rest of this chat won't be logged: EACCES: permission denied"]);
  assert.equal(attempts(), 1);
  assert.deepEqual(written, []);
});

test("a write failure that isn't an Error is still reported", async () => {
  const warnings: string[] = [];
  const { record } = startAnswerLog(apiKeep, {
    append: () => Promise.reject("disk full"),
    now: () => at,
    chat: "c",
    warn: (message) => warnings.push(message),
    costSoFar: () => null,
  });
  await record({ answer: answered });
  assert.deepEqual(warnings, ["Couldn't write to the answer log, so the rest of this chat won't be logged: disk full"]);
});

test("a failed question's cost is what the chat's running total grew by, so the totals include failures", async () => {
  const written: string[] = [];
  const totals: (number | null)[] = [null, 0.001, 0.0025, 0.0025, 0.004];
  let reads = 0;
  const { record } = startAnswerLog(apiKeep, {
    append: async (text) => {
      written.push(text);
    },
    now: () => at,
    chat: "c",
    warn: () => {},
    costSoFar: () => totals[Math.min(reads++, totals.length - 1)],
  });
  await record({ answer: { ...answered, stats: { ...answered.stats!, costUsd: 0.001 } } });
  await record({ error: "Gave up after 10 rounds of tool use" });
  await record({ error: "The API replied 400: bad" });
  await record({ answer: { ...answered, stats: { ...answered.stats!, costUsd: 0.0015 } } });
  assert.deepEqual(
    written.map((text) => JSON.parse(text).costUsd),
    [0.001, 0.0015, 0, 0.0015],
  );
});

test("a failed question's cost is unknown when the chat's cost is", async () => {
  const written: string[] = [];
  const { record } = startAnswerLog(apiKeep, {
    append: async (text) => {
      written.push(text);
    },
    now: () => at,
    chat: "c",
    warn: () => {},
    costSoFar: () => null,
  });
  await record({ error: "No answer within 120 seconds" });
  assert.equal(JSON.parse(written[0]).costUsd, null);
});


test("a rating marks the latest question, as its own line with no words in it", async () => {
  const { record, rate, written } = fakeLog();
  await record({ answer: answered });
  await record({ answer: answered });
  assert.equal(await rate("good"), "saved");
  assert.deepEqual(JSON.parse(written[2]), { v: logVersion, kind: "rating", at: "2026-11-16T18:30:00.000Z", chat: "chat-1", question: 2, rating: "good" });
});

test("rating again adds another line, so the last one counts", async () => {
  const { record, rate, written } = fakeLog();
  await record({ answer: answered });
  await rate("good");
  await rate("bad");
  assert.deepEqual(
    written.slice(1).map((text) => [JSON.parse(text).question, JSON.parse(text).rating]),
    [
      [1, "good"],
      [1, "bad"],
    ],
  );
});

test("there's nothing to rate before the first answer, or when the latest question failed, and the two are told apart", async () => {
  const { record, rate, written } = fakeLog();
  assert.equal(await rate("good"), "nothing to rate");
  await record({ answer: answered });
  await record({ error: "No answer within 120 seconds" });
  assert.equal(await rate("bad"), "last failed");
  assert.equal(written.length, 2);
});

test("a rating isn't saved once the log is broken, and a rating that can't be written breaks it", async () => {
  const broken = fakeLog(apiKeep, 1);
  await broken.record({ answer: answered });
  assert.equal(await broken.rate("good"), "log broken");
  assert.equal(broken.attempts(), 1);
  const warnings: string[] = [];
  const { record, rate } = startAnswerLog(apiKeep, {
    append: async (text) => {
      if (text.includes('"kind":"rating"')) throw new Error("disk full");
    },
    now: () => at,
    chat: "c",
    warn: (message) => warnings.push(message),
    costSoFar: () => null,
  });
  await record({ answer: answered });
  assert.equal(await rate("good"), "log broken");
  assert.equal(await rate("bad"), "log broken");
  assert.equal(warnings.length, 1);
});
