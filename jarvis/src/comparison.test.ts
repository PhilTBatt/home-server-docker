import assert from "node:assert/strict";
import { test } from "node:test";
import { logVersion, type LogLine } from "./answer-log.js";
import { compareReport, groupLines, isLogLine, isRatingLine, readLog, table, withCommas } from "./comparison.js";

function line(overrides: Partial<LogLine> = {}): LogLine {
  return {
    v: logVersion,
    at: "2026-11-16T18:30:00.000Z",
    chat: "chat-1",
    question: 1,
    engine: "api",
    thinking: "keep",
    model: "claude-haiku-5-5",
    ok: true,
    error: null,
    firstWordsMs: 600,
    totalMs: 2000,
    rounds: 1,
    toolUses: 0,
    inputTokens: 3000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 100,
    costUsd: 0.00035,
    earlierThinkingBlocks: 0,
    recovered: false,
    ...overrides,
  };
}

function jsonl(...lines: unknown[]): string {
  return lines.map((value) => `${JSON.stringify(value)}\n`).join("");
}

function rowOf(report: string, label: string): string[] {
  const row = report.split("\n").find((text) => text.startsWith(label) && /^\s{3,}\S/.test(text.slice(label.length)));
  assert.ok(row !== undefined, `no row called ${label}`);
  return row.slice(label.length).trim().split(/\s{3,}/);
}

test("reading the log keeps good lines and counts the rest as skipped", () => {
  const text = `${jsonl(line(), line({ question: 2 }))}\n  \nnot json\n${jsonl({ ...line(), v: 2 }, [1, 2], null, "text")}{"v":1`;
  const { lines, skipped } = readLog(text);
  assert.equal(lines.length, 2);
  assert.equal(skipped, 6);
});

test("reading an empty log finds nothing and skips nothing", () => {
  assert.deepEqual(readLog(""), { lines: [], ratings: [], skipped: 0 });
  assert.deepEqual(readLog("\n\n"), { lines: [], ratings: [], skipped: 0 });
});

test("a line is only trusted if every field has the right shape", () => {
  assert.equal(isLogLine(line()), true);
  assert.equal(isLogLine(line({ engine: "sdk", thinking: null, earlierThinkingBlocks: null, recovered: null, costUsd: null })), true);
  const broken: Record<string, unknown>[] = [
    { v: 2 },
    { at: 5 },
    { chat: null },
    { question: 0 },
    { question: 1.5 },
    { question: "1" },
    { engine: "local" },
    { thinking: "forget" },
    { model: 3 },
    { ok: "yes" },
    { error: 4 },
    { firstWordsMs: "600" },
    { totalMs: Number.NaN },
    { inputTokens: Number.POSITIVE_INFINITY },
    { costUsd: "0.1" },
    { cacheReadTokens: "40" },
    { cacheWriteTokens: Number.NaN },
    { recovered: "no" },
  ];
  for (const change of broken) assert.equal(isLogLine({ ...line(), ...change }), false, JSON.stringify(change));
  const { rounds: _rounds, ...missing } = line();
  assert.equal(isLogLine(missing), false);
});

test("groups come in a fixed order: the Agent SDK, then the plain API keeping, then dropping", () => {
  const groups = groupLines([line({ thinking: "drop" }), line({ engine: "sdk", thinking: null }), line({ thinking: "keep" }), line({ thinking: null })]);
  assert.deepEqual(
    groups.map((group) => group.label),
    ["Agent SDK", "API", "API, keep", "API, drop"],
  );
});

test("a thinking setting logged against the Agent SDK is ignored, since it changes nothing there", () => {
  const groups = groupLines([line({ engine: "sdk", thinking: "keep" }), line({ engine: "sdk", thinking: null })]);
  assert.deepEqual(
    groups.map((group) => [group.label, group.lines.length]),
    [["Agent SDK", 2]],
  );
});

test("the model is only named when there's more than one, and then it splits the groups", () => {
  assert.deepEqual(
    groupLines([line(), line()]).map((group) => group.label),
    ["API, keep"],
  );
  assert.deepEqual(
    groupLines([line({ model: "claude-sonnet-5-5" }), line(), line({ engine: "sdk", thinking: null })]).map((group) => group.label),
    ["Agent SDK (claude-haiku-5-5)", "API, keep (claude-haiku-5-5)", "API, keep (claude-sonnet-5-5)"],
  );
});

test("numbers get commas every three digits", () => {
  assert.equal(withCommas(0), "0");
  assert.equal(withCommas(999), "999");
  assert.equal(withCommas(1000), "1,000");
  assert.equal(withCommas(1234567.4), "1,234,567");
  assert.equal(withCommas(999.6), "1,000");
});

test("a table lines up its columns: labels on the left, numbers on the right", () => {
  assert.equal(
    table(
      ["", "A", "Longer"],
      [
        ["Row", "1", "22"],
        ["Second row", "333", "4"],
      ],
    ),
    ["               A   Longer", "Row            1       22", "Second row   333        4"].join("\n"),
  );
});

test("with nothing logged, the report says how to start", () => {
  assert.equal(compareReport({ lines: [], skipped: 0 }), "No answers logged yet. Set JARVIS_LOG=on, chat for a while, then run this again.\n");
  assert.equal(compareReport({ lines: [], skipped: 1 }), "No answers logged yet. Set JARVIS_LOG=on, chat for a while, then run this again.\n1 line couldn't be read and was left out.\n");
});

test("the report opens with how many questions, chats and days it covers", () => {
  const report = compareReport({ lines: [line(), line({ chat: "chat-2", at: "2026-11-18T09:00:00.000Z" })], skipped: 2 });
  assert.match(report, /^2 questions logged in 2 chats, from 2026-11-16 to 2026-11-18 \(UTC\)\.\n2 lines couldn't be read and were left out\.\n/);
  assert.match(compareReport({ lines: [line()], skipped: 0 }), /^1 question logged in 1 chat, on 2026-11-16 \(UTC\)\.\n\n/);
});

test("each setting gets a column of medians, averages, counts and totals", () => {
  const lines = [
    line({ engine: "sdk", thinking: null, firstWordsMs: 800, totalMs: 3000, rounds: 2, toolUses: 1, inputTokens: 9000, outputTokens: 150, costUsd: 0.002, earlierThinkingBlocks: null }),
    line({ engine: "sdk", thinking: null, firstWordsMs: 1000, totalMs: 5000, rounds: 1, toolUses: 0, inputTokens: 11000, outputTokens: 50, costUsd: 0.001, earlierThinkingBlocks: null }),
    line({ firstWordsMs: 500, totalMs: 1500, inputTokens: 2500, earlierThinkingBlocks: 2, recovered: true, costUsd: 0.0003 }),
    line({ firstWordsMs: 700, totalMs: 2500, inputTokens: 1500, earlierThinkingBlocks: 4, costUsd: 0.0002 }),
    line({ firstWordsMs: 900, totalMs: 1000, inputTokens: 4000, earlierThinkingBlocks: 6, costUsd: 0.0004 }),
    line({ thinking: "drop", firstWordsMs: null, inputTokens: 1000, costUsd: 0.0002 }),
  ];
  const report = compareReport({ lines, skipped: 0 });
  assert.deepEqual(rowOf(report, ""), ["Agent SDK", "API, keep", "API, drop"]);
  assert.deepEqual(rowOf(report, "Answers"), ["2", "3", "1"]);
  assert.deepEqual(rowOf(report, "Failed"), ["0", "0", "0"]);
  assert.deepEqual(rowOf(report, "Recovered"), ["-", "1", "0"]);
  assert.deepEqual(rowOf(report, "First words, median"), ["0.90 s", "0.70 s", "-"]);
  assert.deepEqual(rowOf(report, "Full answer, median"), ["4.00 s", "1.50 s", "2.00 s"]);
  assert.deepEqual(rowOf(report, "Rounds, average"), ["1.5", "1.0", "1.0"]);
  assert.deepEqual(rowOf(report, "Tool uses, average"), ["0.5", "0.0", "0.0"]);
  assert.deepEqual(rowOf(report, "Input tokens, median"), ["10,000", "2,500", "1,000"]);
  assert.deepEqual(rowOf(report, "Output tokens, median"), ["100", "100", "100"]);
  assert.deepEqual(rowOf(report, "Earlier thinking blocks, median"), ["-", "4", "0"]);
  assert.deepEqual(rowOf(report, "Cost per answer, median"), ["$0.00150", "$0.00030", "$0.00020"]);
  assert.deepEqual(rowOf(report, "Cost, total"), ["$0.0030", "$0.0009", "$0.0002"]);
});

test("failed questions are counted and listed by kind, but left out of the medians", () => {
  const lines = [
    line({ inputTokens: 1000 }),
    line({ ok: false, error: "api 529", firstWordsMs: null, totalMs: null, inputTokens: null, costUsd: null, rounds: null, toolUses: null, outputTokens: null, earlierThinkingBlocks: null, recovered: null }),
    line({ ok: false, error: "timeout", firstWordsMs: 100, totalMs: 120000, inputTokens: 999999, costUsd: 1 }),
    line({ ok: false, error: "api 529" }),
    line({ engine: "sdk", thinking: null, ok: false, error: null, costUsd: 0.0002 }),
  ];
  const report = compareReport({ lines, skipped: 0 });
  assert.deepEqual(rowOf(report, "Answers"), ["0", "1"]);
  assert.deepEqual(rowOf(report, "Failed"), ["1", "3"]);
  assert.deepEqual(rowOf(report, "Input tokens, median"), ["-", "1,000"]);
  assert.deepEqual(rowOf(report, "Full answer, median"), ["-", "2.00 s"]);
  assert.deepEqual(rowOf(report, "Cost, total"), ["$0.0002", "$1.0007"]);
  assert.match(report, /\nFailures:\n {2}Agent SDK: other \(1\)\n {2}API, keep: api 529 \(2\), timeout \(1\)\n/);
});

test("with no failures, there's no failures list", () => {
  assert.doesNotMatch(compareReport({ lines: [line()], skipped: 0 }), /Failures/);
});

test("input tokens are shown by question number, so a chat's growth can be compared", () => {
  const lines = [
    line({ question: 1, inputTokens: 1000 }),
    line({ question: 1, inputTokens: 3000 }),
    line({ question: 2, inputTokens: 4000 }),
    line({ question: 6, inputTokens: 9000 }),
    line({ question: 40, inputTokens: 21000 }),
    line({ question: 3, ok: false, inputTokens: 5000 }),
    line({ thinking: "drop", question: 5, inputTokens: 7000 }),
  ];
  const report = compareReport({ lines, skipped: 0 });
  const section = report.slice(report.indexOf("Input tokens by question number"));
  assert.match(section, /^Input tokens by question number in the chat, median:\n/);
  assert.deepEqual(rowOf(section.split("\n").slice(1).join("\n"), ""), ["1", "2", "3", "4", "5", "6+"]);
  assert.deepEqual(rowOf(section.split("\n").slice(1).join("\n"), "API, keep"), ["2,000", "4,000", "-", "-", "-", "15,000"]);
  assert.deepEqual(rowOf(section.split("\n").slice(1).join("\n"), "API, drop"), ["-", "-", "-", "-", "7,000", "-"]);
});

test("the report ends with what its numbers leave out", () => {
  assert.match(compareReport({ lines: [line()], skipped: 0 }), /\n\nMedians and averages leave out failed questions; the total cost includes them\. Costs are estimates: the Agent SDK's own, and the plain API's from list prices\.\n$/);
});


test("cache reads and writes get their own rows, and lines from before they were logged still count", () => {
  const { cacheWriteTokens: _write, cacheReadTokens: _read, ...older } = line({ engine: "sdk", thinking: null, inputTokens: 5000 });
  assert.equal(isLogLine(older), true);
  const lines = [
    older as LogLine,
    line({ engine: "sdk", thinking: null, inputTokens: 9000, cacheReadTokens: 8000, cacheWriteTokens: 600 }),
    line({ inputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 }),
  ];
  const report = compareReport({ lines, skipped: 0 });
  assert.deepEqual(rowOf(report, "Input tokens, median"), ["7,000", "2,000"]);
  assert.deepEqual(rowOf(report, "Read from cache, median"), ["8,000", "0"]);
  assert.deepEqual(rowOf(report, "Written to cache, median"), ["600", "0"]);
  assert.deepEqual(rowOf(compareReport({ lines: [older as LogLine], skipped: 0 }), "Read from cache, median"), ["-"]);
  assert.match(report, /\n\nThe cache rows leave out 1 answer logged before cache tokens were counted\.\n/);
  assert.doesNotMatch(compareReport({ lines: [line()], skipped: 0 }), /cache rows leave out/);
});


function rating(question: number, value: "good" | "bad", chat = "chat-1") {
  return { v: logVersion, kind: "rating" as const, at: "2026-11-16T18:31:00.000Z", chat, question, rating: value };
}

test("reading the log keeps ratings apart from answers", () => {
  const { lines, ratings, skipped } = readLog(jsonl(line(), rating(1, "good"), { ...rating(1, "good"), rating: "great" }, { ...rating(1, "bad"), question: 0 }));
  assert.equal(lines.length, 1);
  assert.deepEqual(ratings, [rating(1, "good")]);
  assert.equal(skipped, 2);
});

test("a rating line is only trusted if every field has the right shape", () => {
  assert.equal(isRatingLine(rating(1, "bad")), true);
  for (const change of [{ v: 2 }, { kind: "rate" }, { at: 1 }, { chat: null }, { question: 1.5 }, { rating: "Good" }]) assert.equal(isRatingLine({ ...rating(1, "good"), ...change }), false, JSON.stringify(change));
  assert.equal(isLogLine(rating(1, "good")), false);
});

test("ratings are counted per setting, the latest rating of each answer counts, and stray ratings are ignored", () => {
  const lines = [
    line({ question: 1 }),
    line({ question: 2 }),
    line({ question: 3 }),
    line({ question: 4, ok: false, error: "timeout" }),
    line({ thinking: "drop", chat: "chat-2", question: 1 }),
  ];
  const ratings = [rating(1, "bad"), rating(1, "good"), rating(2, "bad"), rating(4, "good"), rating(9, "good"), rating(1, "bad", "chat-2"), rating(1, "good", "chat-3")];
  const report = compareReport({ lines, ratings, skipped: 0 });
  assert.deepEqual(rowOf(report, "Rated good"), ["1", "0"]);
  assert.deepEqual(rowOf(report, "Rated bad"), ["1", "1"]);
});

test("with no ratings, the rating rows show zero", () => {
  const report = compareReport({ lines: [line()], skipped: 0 });
  assert.deepEqual(rowOf(report, "Rated good"), ["0"]);
  assert.deepEqual(rowOf(report, "Rated bad"), ["0"]);
});
