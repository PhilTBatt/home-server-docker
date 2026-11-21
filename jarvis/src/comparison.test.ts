import assert from "node:assert/strict";
import { test } from "node:test";
import { logVersion, speechLine, type LogLine, type NewChatLine, type SpeechLine } from "./answer-log.js";
import { compareReport, isNewChatLine, groupLines, isLogLine, isRatingLine, isSpeechLine, readLog, table, withCommas } from "./comparison.js";

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
    largestRequestTokens: 3000,
    refusedTools: 0,
    spokeFirst: null,
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
  assert.deepEqual(readLog(""), { lines: [], ratings: [], newChats: [], speech: [], skipped: 0 });
  assert.deepEqual(readLog("\n\n"), { lines: [], ratings: [], newChats: [], speech: [], skipped: 0 });
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

test("the largest single request is shown by question number, so a chat's growth can be compared", () => {
  const lines = [
    line({ question: 1, largestRequestTokens: 1000, inputTokens: 99000 }),
    line({ question: 1, largestRequestTokens: 3000 }),
    line({ question: 2, largestRequestTokens: 4000 }),
    line({ question: 6, largestRequestTokens: 9000 }),
    line({ question: 40, largestRequestTokens: 21000 }),
    line({ question: 3, ok: false, largestRequestTokens: 5000 }),
    line({ thinking: "drop", question: 5, largestRequestTokens: 7000 }),
  ];
  const report = compareReport({ lines, skipped: 0 });
  const section = report.slice(report.indexOf("Largest single request by question number"));
  assert.match(section, /^Largest single request by question number in the chat, median \(tokens\):\n/);
  assert.deepEqual(rowOf(section.split("\n").slice(1).join("\n"), ""), ["1", "2", "3", "4", "5", "6+"]);
  assert.deepEqual(rowOf(section.split("\n").slice(1).join("\n"), "API, keep"), ["2,000", "4,000", "-", "-", "-", "15,000"]);
  assert.deepEqual(rowOf(section.split("\n").slice(1).join("\n"), "API, drop"), ["-", "-", "-", "-", "7,000", "-"]);
});

test("refused tools, speaking before the first tool, and the largest request get their own rows", () => {
  const lines = [
    line({ engine: "sdk", thinking: null, refusedTools: 1, spokeFirst: false, largestRequestTokens: 9000 }),
    line({ engine: "sdk", thinking: null, refusedTools: 0, spokeFirst: true, largestRequestTokens: 7000 }),
    line({ engine: "sdk", thinking: null, refusedTools: 2, spokeFirst: null, largestRequestTokens: 8000 }),
    line({ refusedTools: 0, spokeFirst: null, largestRequestTokens: 3000 }),
    line({ ok: false, refusedTools: null, spokeFirst: null, largestRequestTokens: null }),
  ];
  const report = compareReport({ lines, skipped: 0 });
  assert.deepEqual(rowOf(report, "Refused tool calls, total"), ["3", "0"]);
  assert.deepEqual(rowOf(report, "Spoke before first tool"), ["1 of 2", "-"]);
  assert.deepEqual(rowOf(report, "Largest request, median"), ["8,000", "3,000"]);
});

test("retries after a network error are counted for the plain API call, and not shown for the Agent SDK, which retries by itself", () => {
  const lines = [line({ engine: "sdk", thinking: null, retried: null }), line({ retried: true }), line({ retried: false }), line({ retried: true }), line({ ok: false, retried: true })];
  const report = compareReport({ lines, skipped: 0 });
  assert.deepEqual(rowOf(report, "Retried after a network error"), ["-", "2"]);
  assert.equal(isLogLine({ ...line(), retried: "yes" }), false);
  const { retried: _retried, ...older } = line();
  assert.equal(isLogLine(older), true);
});

test("lines from before the new numbers were logged still count, and the report says what they leave out", () => {
  const { largestRequestTokens: _largest, refusedTools: _refused, spokeFirst: _spoke, ...older } = line({ engine: "sdk", thinking: null });
  assert.equal(isLogLine(older), true);
  const report = compareReport({ lines: [older as LogLine, line()], skipped: 0 });
  assert.deepEqual(rowOf(report, "Answers"), ["1", "1"]);
  assert.deepEqual(rowOf(report, "Refused tool calls, total"), ["-", "0"]);
  assert.match(report, /\n\nThe refused, spoke-first and largest-request numbers leave out 1 answer logged before they were counted\.\n/);
  assert.equal(isLogLine({ ...line(), spokeFirst: "yes" }), false);
  assert.equal(isLogLine({ ...line(), refusedTools: "1" }), false);
  assert.equal(isLogLine({ ...line(), largestRequestTokens: Number.NaN }), false);
});

test("the report ends with what its numbers leave out", () => {
  assert.match(compareReport({ lines: [line()], skipped: 0 }), /\n\nMedians and averages leave out failed questions; the total cost includes them\. Costs are estimates: the Agent SDK's own \(apart from a resumed chat's first answer\), and the plain API's from list prices\.\n$/);
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

test("fresh and resumed chats are compared side by side, named only when both are in the log", () => {
  const both = [line({ engine: "sdk", thinking: null, chats: "resume" }), line({ engine: "sdk", thinking: null, chats: "fresh" }), line({ chats: "resume" }), line()];
  assert.deepEqual(rowOf(compareReport({ lines: both, skipped: 0 }), ""), ["Agent SDK, fresh", "Agent SDK, resumed", "API, keep, fresh", "API, keep, resumed"]);
  const { chats: _chats, ...older } = line({ engine: "sdk", thinking: null });
  assert.equal(isLogLine(older), true);
  assert.deepEqual(rowOf(compareReport({ lines: [older as LogLine, line({ engine: "sdk", thinking: null, chats: "fresh" })], skipped: 0 }), ""), ["Agent SDK"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ chats: "resume" })], skipped: 0 }), ""), ["API, keep"]);
  assert.equal(isLogLine({ ...line(), chats: "continue" }), false);
});

const newChatLine: NewChatLine = { v: logVersion, kind: "new chat", at: "2026-11-17T20:00:00.000Z", chat: "chat-1", questions: 4, lastRequestTokens: 61_000 };

test("a new-chat line is read only when every field is the right kind", () => {
  assert.equal(isNewChatLine(newChatLine), true);
  assert.equal(isNewChatLine({ ...newChatLine, lastRequestTokens: null }), true);
  for (const bad of [{ ...newChatLine, kind: "rating" }, { ...newChatLine, questions: 0 }, { ...newChatLine, questions: 1.5 }, { ...newChatLine, lastRequestTokens: -1 }, { ...newChatLine, lastRequestTokens: "61000" }, { ...newChatLine, chat: 3 }, { ...newChatLine, v: 2 }, null, [newChatLine]]) {
    assert.equal(isNewChatLine(bad), false, JSON.stringify(bad));
  }
  const read = readLog([JSON.stringify(line()), JSON.stringify(newChatLine)].join("\n"));
  assert.deepEqual(read.newChats, [newChatLine]);
  assert.equal(read.lines.length, 1);
});

test("compare counts the new chats started from each setting's chats, and the median size they were started at", () => {
  const lines = [line({ chat: "sdk-1", engine: "sdk", thinking: null }), line({ chat: "sdk-2", engine: "sdk", thinking: null }), line({ chat: "api-1" }), line({ chat: "api-2" })];
  const newChats: NewChatLine[] = [
    { ...newChatLine, chat: "sdk-1", lastRequestTokens: 40_000 },
    { ...newChatLine, chat: "sdk-2", lastRequestTokens: 90_000 },
    { ...newChatLine, chat: "api-1", lastRequestTokens: null },
    { ...newChatLine, chat: "somewhere-else", lastRequestTokens: 5 },
  ];
  const report = compareReport({ lines, newChats, skipped: 0 });
  assert.deepEqual(rowOf(report, "New chats started"), ["2", "1"]);
  assert.deepEqual(rowOf(report, "Size when a new chat was started, median"), ["65,000", "-"]);
  assert.deepEqual(rowOf(compareReport({ lines, skipped: 0 }), "New chats started"), ["0", "0"]);
});

test("the length-hints setting is compared side by side, named only when both are in the log, and older lines count as the note", () => {
  const { lengthHints: _hints, ...older } = line();
  const both = [older as LogLine, line({ lengthHints: "jarvis" }), line({ engine: "sdk", thinking: null, lengthHints: "jarvis" })];
  assert.deepEqual(rowOf(compareReport({ lines: both, skipped: 0 }), ""), ["Agent SDK, Jarvis says", "API, keep, length note", "API, keep, Jarvis says"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ lengthHints: "jarvis" })], skipped: 0 }), ""), ["API, keep"]);
  const all = [line({ chats: "resume", lengthHints: "jarvis" }), line({ chats: "fresh" })];
  assert.deepEqual(rowOf(compareReport({ lines: all, skipped: 0 }), ""), ["API, keep, fresh, length note", "API, keep, resumed, Jarvis says"]);
  assert.equal(isLogLine({ ...line(), lengthHints: "both" }), false);
  assert.equal(isLogLine(older), true);
});

test("hub actions on and off are compared side by side, off first, named only when both are in the log, and older lines count as off", () => {
  const older = line();
  const mixed = [line({ hubTools: "on", hubActions: "on" }), line({ hubTools: "on" }), older, line({ engine: "sdk", thinking: null, hubTools: "on", hubActions: "on" })];
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), ""), ["Agent SDK, hub tools, hub actions", "API, keep, no hub tools, no hub actions", "API, keep, hub tools, no hub actions", "API, keep, hub tools, hub actions"]);
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), "Answers"), ["1", "1", "1", "1"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ hubTools: "on", hubActions: "on" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [older, line({ hubActions: "off" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ hubTools: "on", hubActions: "on", sessionNotes: "on" }), line({ hubTools: "on" })], skipped: 0 }), ""), ["API, keep, no hub actions, no session notes", "API, keep, hub actions, session notes"]);
  assert.equal(isLogLine({ ...line(), hubActions: "yes" }), false);
  assert.equal(isLogLine({ ...line(), hubActions: "on" }), true);
  assert.equal(isLogLine(older), true);
});

test("session notes on and off are compared side by side, off first, named only when both are in the log, and older lines count as off", () => {
  const { sessionNotes: _notes, ...older } = line();
  const mixed = [line({ sessionNotes: "on" }), older as LogLine, line({ engine: "sdk", thinking: null, sessionNotes: "on" })];
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), ""), ["Agent SDK, session notes", "API, keep, no session notes", "API, keep, session notes"]);
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), "Answers"), ["1", "1", "1"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ sessionNotes: "on" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [older as LogLine, line({ sessionNotes: "off" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ hubTools: "on", sessionNotes: "on" }), line({})], skipped: 0 }), ""), ["API, keep, no hub tools, no session notes", "API, keep, hub tools, session notes"]);
  assert.equal(isLogLine({ ...line(), sessionNotes: "yes" }), false);
  assert.equal(isLogLine({ ...line(), sessionNotes: "on" }), true);
  assert.equal(isLogLine(older), true);
});

test("answers with and without a voice are compared side by side, without first, named only when both are in the log, and older lines count as without", () => {
  const older = line();
  const mixed = [line({ voice: "kokoro" }), older, line({ engine: "sdk", thinking: null, voice: "kokoro" })];
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), ""), ["Agent SDK, Kokoro voice", "API, keep, no voice", "API, keep, Kokoro voice"]);
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), "Answers"), ["1", "1", "1"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ voice: "kokoro" }), line({ voice: "kokoro" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [older, line({ voice: "off" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [older, line({ voice: "off" })], skipped: 0 }), "Answers"), ["2"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ sessionNotes: "on", voice: "kokoro" }), line({})], skipped: 0 }), ""), ["API, keep, no session notes, no voice", "API, keep, session notes, Kokoro voice"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ sessionNotes: "on", voice: "kokoro" }), line({ sessionNotes: "on" }), line({ voice: "kokoro" })], skipped: 0 }), ""), ["API, keep, no session notes, Kokoro voice", "API, keep, session notes, no voice", "API, keep, session notes, Kokoro voice"]);
  assert.deepEqual(
    groupLines([line({ voice: "kokoro" }), older]).map((group) => [group.voice, group.lines.length]),
    [
      ["off", 1],
      ["kokoro", 1],
    ],
  );
  assert.equal(isLogLine({ ...line(), voice: "on" }), false);
  assert.equal(isLogLine({ ...line(), voice: "wyoming" }), false);
  assert.equal(isLogLine({ ...line(), voice: null }), false);
  assert.equal(isLogLine({ ...line(), voice: "piper" }), true);
  assert.equal(isLogLine({ ...line(), voice: "kokoro" }), true);
  assert.equal(isLogLine({ ...line(), voice: "off" }), true);
  assert.equal(isLogLine(older), true);
});

test("hub tools on and off are compared side by side, off first, named only when both are in the log, and older lines count as off", () => {
  const { hubTools: _hub, ...older } = line();
  const mixed = [line({ hubTools: "on" }), older as LogLine, line({ engine: "sdk", thinking: null, hubTools: "on" })];
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), ""), ["Agent SDK, hub tools", "API, keep, no hub tools", "API, keep, hub tools"]);
  assert.deepEqual(rowOf(compareReport({ lines: mixed, skipped: 0 }), "Answers"), ["1", "1", "1"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ hubTools: "on" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [older as LogLine, line({ hubTools: "off" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [line({ lengthHints: "jarvis", hubTools: "on" }), line({})], skipped: 0 }), ""), ["API, keep, length note, no hub tools", "API, keep, Jarvis says, hub tools"]);
  assert.equal(isLogLine({ ...line(), hubTools: "yes" }), false);
  assert.equal(isLogLine({ ...line(), hubTools: "on" }), true);
  assert.equal(isLogLine(older), true);
});

test("length-hint groups come note first then Jarvis, whatever order the log is in, and older lines join the note group without adding a label", () => {
  const { lengthHints: _hints, ...older } = line();
  const reversed = [line({ lengthHints: "jarvis" }), line({ lengthHints: "note" }), older as LogLine];
  assert.deepEqual(rowOf(compareReport({ lines: reversed, skipped: 0 }), ""), ["API, keep, length note", "API, keep, Jarvis says"]);
  assert.deepEqual(rowOf(compareReport({ lines: reversed, skipped: 0 }), "Answers"), ["2", "1"]);
  assert.deepEqual(rowOf(compareReport({ lines: [older as LogLine, line({ lengthHints: "note" })], skipped: 0 }), ""), ["API, keep"]);
});

const voiced = (overrides: Partial<LogLine> = {}) => line({ voice: "kokoro", speechStart: "sentence", speechStop: "now", ...overrides });

function said(overrides: Partial<SpeechLine> = {}): SpeechLine {
  return { v: logVersion, kind: "speech", at: "2026-11-16T18:30:09.000Z", chat: "chat-1", question: 1, firstSentenceMs: 1200, firstSoundMadeMs: 2500, firstSoundMs: 2600, longestSilenceMs: 400, spoken: 3, failed: 0, left: 0, stopped: false, gaveUp: false, tooLong: false, ...overrides };
}

test("a speech line is read from the log as its own kind, checked field by field", () => {
  assert.equal(isSpeechLine(said()), true);
  assert.equal(isSpeechLine(said({ firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, spoken: 0, gaveUp: true })), true);
  assert.equal(isSpeechLine({ ...said(), kind: "rating" }), false);
  assert.equal(isSpeechLine({ ...said(), v: logVersion + 1 }), false);
  assert.equal(isSpeechLine({ ...said(), question: 0 }), false);
  assert.equal(isSpeechLine({ ...said(), chat: 7 }), false);
  assert.equal(isSpeechLine({ ...said(), at: null }), false);
  for (const field of ["firstSentenceMs", "firstSoundMadeMs", "firstSoundMs", "longestSilenceMs"]) {
    assert.equal(isSpeechLine({ ...said(), [field]: "soon" }), false, field);
    assert.equal(isSpeechLine({ ...said(), [field]: null }), true, field);
  }
  const { longestSilenceMs: _left, ...withoutSilence } = said();
  assert.equal(isSpeechLine(withoutSilence), false);
  for (const field of ["spoken", "failed", "left"]) {
    assert.equal(isSpeechLine({ ...said(), [field]: -1 }), false, field);
    assert.equal(isSpeechLine({ ...said(), [field]: 1.5 }), false, field);
    assert.equal(isSpeechLine({ ...said(), [field]: null }), false, field);
  }
  for (const field of ["stopped", "gaveUp", "tooLong"]) assert.equal(isSpeechLine({ ...said(), [field]: "yes" }), false, field);
  assert.equal(isSpeechLine(null), false);
  assert.equal(isSpeechLine([said()]), false);
  const read = readLog(jsonl(voiced(), said(), { ...said(), spoken: "three" }, rating(1, "good")));
  assert.deepEqual([read.lines.length, read.speech?.length, read.ratings?.length, read.skipped], [1, 1, 1, 1]);
  assert.equal(isLogLine(said()), false);
});

test("an answer line's way of starting speech is checked like its other settings", () => {
  assert.equal(isLogLine(voiced({ speechStart: "clause" })), true);
  assert.equal(isLogLine({ ...voiced(), speechStart: "word" }), false);
  assert.equal(isLogLine({ ...voiced(), speechStart: null }), false);
});

test("an answer line's way of stopping speech is checked like its other settings, and may be missing from older lines", () => {
  assert.equal(isLogLine(voiced({ speechStop: "sentence" })), true);
  assert.equal(isLogLine(voiced({ speechStop: "now" })), true);
  const { speechStop, ...older } = voiced();
  assert.equal(speechStop, "now");
  assert.equal(isLogLine(older), true);
  assert.equal(isLogLine({ ...voiced(), speechStop: "later" }), false);
  assert.equal(isLogLine({ ...voiced(), speechStop: null }), false);
  assert.equal(isLogLine({ ...voiced(), speechStop: "clause" }), false);
});

test("the summary has the median time to first sound for each setting, from the speech lines, and a dash where nothing was spoken", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3, ok: false, error: "timeout" }), line({ chat: "chat-2" })];
  const speech = [said({ firstSoundMs: 2600 }), said({ question: 2, firstSoundMs: 3000 }), said({ question: 3, firstSoundMs: 9000 })];
  const report = compareReport({ lines, speech, skipped: 0 });
  assert.deepEqual(rowOf(report, ""), ["API, keep, no voice", "API, keep, Kokoro voice"]);
  assert.deepEqual(rowOf(report, "First sound, median"), ["-", "2.80 s"]);
  assert.equal(report.split("\n").findIndex((text) => text.startsWith("First sound, median")), report.split("\n").findIndex((text) => text.startsWith("Full answer, median")) + 1);
  assert.deepEqual(rowOf(compareReport({ lines, skipped: 0 }), "First sound, median"), ["-", "-"]);
});

test("a speech line belongs to the answer with the same chat and question number, and the latest one counts", () => {
  const lines = [voiced(), voiced({ chat: "chat-2" })];
  const speech = [said({ firstSoundMs: 1000 }), said({ firstSoundMs: 2000 }), said({ chat: "chat-3", firstSoundMs: 9000 }), said({ chat: "chat-2", question: 2, firstSoundMs: 9000 })];
  assert.deepEqual(rowOf(compareReport({ lines, speech, skipped: 0 }), "First sound, median"), ["2.00 s"]);
});

test("the summary says how many spoken answers were stopped before the end", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3 }), voiced({ question: 4 }), line({ chat: "chat-2" })];
  const speech = [said({ stopped: true }), said({ question: 2 }), said({ question: 3, stopped: true, firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, spoken: 0 }), said({ question: 4 })];
  const report = compareReport({ lines, speech, skipped: 0 });
  assert.deepEqual(rowOf(report, "Speech stopped early"), ["-", "1 of 3"]);
  assert.deepEqual(rowOf(compareReport({ lines, skipped: 0 }), "Speech stopped early"), ["-", "-"]);
});

test("answers with each way of starting speech are compared side by side, whole sentence first, named only when both are in the log", () => {
  const both = [voiced({ speechStart: "clause" }), voiced(), line()];
  assert.deepEqual(rowOf(compareReport({ lines: both, skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice, whole first sentence", "API, keep, Kokoro voice, first clause early"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechStart: "clause" }), voiced({ speechStart: "clause" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechStart: "clause" }), line()], skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechStart: "clause" }), line({ voice: "kokoro" })], skipped: 0 }), ""), ["API, keep, whole first sentence", "API, keep, first clause early"]);
  assert.deepEqual(
    groupLines([voiced({ speechStart: "clause" }), voiced(), line({ voice: "kokoro" }), line({ speechStart: "clause" }), line()]).map((group) => [group.voice, group.speechStart, group.lines.length]),
    [
      ["off", null, 2],
      ["kokoro", "sentence", 2],
      ["kokoro", "clause", 1],
    ],
  );
});

test("answers with each way of stopping speech are compared side by side, stopping at once first, named only when both are in the log", () => {
  const both = [voiced({ speechStop: "sentence" }), voiced(), line()];
  assert.deepEqual(rowOf(compareReport({ lines: both, skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice, stops at once", "API, keep, Kokoro voice, finishes the sentence"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechStop: "sentence" }), voiced({ speechStop: "sentence" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechStop: "sentence" }), line()], skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechStop: "sentence" }), line({ voice: "kokoro" })], skipped: 0 }), ""), ["API, keep, stops at once", "API, keep, finishes the sentence"]);
  assert.deepEqual(
    groupLines([voiced({ speechStop: "sentence" }), voiced(), line({ voice: "kokoro" }), line({ speechStop: "sentence" }), line()]).map((group) => [group.voice, group.speechStop, group.lines.length]),
    [
      ["off", null, 2],
      ["kokoro", "now", 2],
      ["kokoro", "sentence", 1],
    ],
  );
});

test("both settings of his speech are named when both vary, starting first, and each pair keeps its own row", () => {
  const lines = [voiced({ speechStart: "clause", speechStop: "sentence" }), voiced({ speechStop: "sentence" }), voiced({ speechStart: "clause" }), voiced()];
  assert.deepEqual(rowOf(compareReport({ lines, skipped: 0 }), ""), [
    "API, keep, whole first sentence, stops at once",
    "API, keep, whole first sentence, finishes the sentence",
    "API, keep, first clause early, stops at once",
    "API, keep, first clause early, finishes the sentence",
  ]);
});

test("the speech table keeps a chat's first question apart from its later ones, with the median and the slowest of each time", () => {
  const lines = [voiced({ firstWordsMs: 600 }), voiced({ chat: "chat-2", firstWordsMs: 800 }), voiced({ question: 2, firstWordsMs: 500 }), voiced({ question: 3, firstWordsMs: 700 }), voiced({ question: 4, firstWordsMs: 900 })];
  const speech = [
    said({ firstSentenceMs: 1200, firstSoundMadeMs: 2500, firstSoundMs: 2600, longestSilenceMs: 300 }),
    said({ chat: "chat-2", firstSentenceMs: 1400, firstSoundMadeMs: 2900, firstSoundMs: 3400, longestSilenceMs: 500 }),
    said({ question: 2, firstSentenceMs: 1000, firstSoundMadeMs: 1900, firstSoundMs: 2000, longestSilenceMs: null }),
    said({ question: 3, firstSentenceMs: 1100, firstSoundMadeMs: 2100, firstSoundMs: 2200, longestSilenceMs: 100 }),
    said({ question: 4, firstSentenceMs: 1600, firstSoundMadeMs: 2700, firstSoundMs: 4000, longestSilenceMs: 1200 }),
  ];
  const report = compareReport({ lines, speech, skipped: 0 });
  assert.equal(report.includes("\n\nSpeech, timed from the question being sent, and the longest silence between one sound ending and the next starting: the median, with the slowest in brackets.\n"), true);
  assert.deepEqual(rowOf(report, "API, keep, first question"), ["2", "0.70 s (0.80 s)", "1.30 s (1.40 s)", "2.70 s (2.90 s)", "3.00 s (3.40 s)", "0.40 s (0.50 s)"]);
  assert.deepEqual(rowOf(report, "API, keep, later questions"), ["3", "0.70 s (0.90 s)", "1.10 s (1.60 s)", "2.10 s (2.70 s)", "2.20 s (4.00 s)", "0.65 s (1.20 s)"]);
  const header = report.split("\n").find((text) => text.includes("First sentence sent"));
  assert.deepEqual(header?.trim().split(/\s{3,}/), ["Answers", "First words", "First sentence sent", "Its sound made", "First sound", "Longest silence"]);
});

test("the speech table has a row for each setting that spoke, and leaves out the ones that didn't", () => {
  const lines = [voiced({ engine: "sdk", thinking: null }), voiced({ chat: "chat-2", speechStart: "clause", question: 2 }), line({ chat: "chat-3" })];
  const report = compareReport({ lines, speech: [said(), said({ chat: "chat-2", question: 2 })], skipped: 0 });
  const table = report.slice(report.indexOf("Speech, timed"));
  assert.equal(table.includes("Agent SDK, Kokoro voice, whole first sentence, first question"), true);
  assert.equal(table.includes("API, keep, Kokoro voice, first clause early, later questions"), true);
  assert.equal(table.includes("no voice"), false);
  assert.equal(table.includes("first clause early, first question"), false);
});

test("answers with the voice on that made no sound are counted under the speech table, and failed ones aren't in it", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3 }), voiced({ question: 5, ok: false, error: "timeout" }), line({ chat: "chat-2" })];
  const silent = said({ question: 2, firstSentenceMs: 400, firstSoundMadeMs: null, firstSoundMs: null, spoken: 0, failed: 2, gaveUp: true });
  const report = compareReport({ lines, speech: [said(), silent, said({ question: 5 })], skipped: 0 });
  assert.equal(report.includes("\n2 answers with the voice on had no sound and are left out of this table.\n"), true);
  assert.deepEqual(rowOf(report, "API, keep, Kokoro voice, first question")[0], "1");
  assert.equal(report.includes("later questions"), false);
  const one = compareReport({ lines: [voiced(), voiced({ question: 2 })], speech: [said()], skipped: 0 });
  assert.equal(one.includes("\n1 answer with the voice on had no sound and is left out of this table.\n"), true);
  assert.equal(compareReport({ lines: [voiced()], speech: [said()], skipped: 0 }).includes("had no sound"), false);
});

test("with nothing spoken in the log, there's no speech table at all", () => {
  assert.equal(compareReport({ lines: [line(), voiced({ chat: "chat-2" })], skipped: 0 }).includes("Speech, timed"), false);
  assert.equal(compareReport({ lines: [voiced()], speech: [said({ firstSoundMs: null })], skipped: 0 }).includes("Speech, timed"), false);
});

test("a log line's bundle setting is checked like the other settings, and an older line without one counts as off", () => {
  assert.equal(isLogLine(voiced({ speechBundle: "on" })), true);
  assert.equal(isLogLine(voiced({ speechBundle: "off" })), true);
  assert.equal(isLogLine({ ...voiced(), speechBundle: "yes" }), false);
  assert.equal(isLogLine({ ...voiced(), speechBundle: null }), false);
  assert.equal(isLogLine({ ...voiced(), speechBundle: true }), false);
  assert.deepEqual(groupLines([voiced({ speechBundle: "off" }), voiced()]).map((group) => [group.speechBundle, group.lines.length]), [["off", 2]]);
  assert.deepEqual(groupLines([line({ speechBundle: "on" })]).map((group) => group.speechBundle), [null]);
});

test("bundled sentences are compared with a sentence at a time side by side, a sentence at a time first, named only when both are in the log with the voice on, before the style", () => {
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechBundle: "on" }), voiced(), line()], skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice, a sentence at a time", "API, keep, Kokoro voice, sentences bundled"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechBundle: "on" }), voiced({ speechBundle: "on" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechBundle: "on" }), line({ speechBundle: "off" })], skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ speechBundle: "on", spokenStyle: "on" }), voiced({ spokenStyle: "on" }), voiced({ speechBundle: "on", speechStop: "sentence" }), voiced({ speechStop: "sentence" })], skipped: 0 }), ""), [
    "API, keep, stops at once, a sentence at a time, written for the ear",
    "API, keep, stops at once, sentences bundled, written for the ear",
    "API, keep, finishes the sentence, a sentence at a time, usual style",
    "API, keep, finishes the sentence, sentences bundled, usual style",
  ]);
});

test("a log line's spoken style is checked like the other settings, and an older line without one counts as off", () => {
  assert.equal(isLogLine(voiced({ spokenStyle: "on" })), true);
  assert.equal(isLogLine(voiced({ spokenStyle: "off" })), true);
  assert.equal(isLogLine(voiced()), true);
  assert.equal(isLogLine({ ...voiced(), spokenStyle: "yes" }), false);
  assert.equal(isLogLine({ ...voiced(), spokenStyle: null }), false);
  assert.equal(isLogLine({ ...voiced(), spokenStyle: true }), false);
  assert.deepEqual(groupLines([voiced({ spokenStyle: "off" }), voiced()]).map((group) => [group.spokenStyle, group.lines.length]), [["off", 2]]);
  assert.deepEqual(groupLines([line({ spokenStyle: "on" })]).map((group) => group.spokenStyle), [null]);
});

test("answers written for the ear are compared with the usual style side by side, usual first, named only when both are in the log with the voice on", () => {
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ spokenStyle: "on" }), voiced(), line()], skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice, usual style", "API, keep, Kokoro voice, written for the ear"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ spokenStyle: "on" }), voiced({ spokenStyle: "on" })], skipped: 0 }), ""), ["API, keep"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ spokenStyle: "on" }), line({ spokenStyle: "off" })], skipped: 0 }), ""), ["API, keep, no voice", "API, keep, Kokoro voice"]);
  assert.deepEqual(rowOf(compareReport({ lines: [voiced({ spokenStyle: "on", speechStop: "sentence" }), voiced({ speechStop: "sentence" }), voiced({ spokenStyle: "on" }), voiced()], skipped: 0 }), ""), [
    "API, keep, stops at once, usual style",
    "API, keep, stops at once, written for the ear",
    "API, keep, finishes the sentence, usual style",
    "API, keep, finishes the sentence, written for the ear",
  ]);
});

const countsHeading = "Speech, added up for each setting: sentences played to the end, sentences that failed, and sentences not played in full (cut off or dropped when he stopped, or past the 40-sentence limit). Then how many answers made no sound, were stopped (before or after any sound), were given up on because two sentences in a row couldn't be made or couldn't be played, or went over 40 sentences.";

test("a speech line's failures split into couldn't be made and couldn't be played are read when they add up, and older lines without the split still are", () => {
  assert.equal(isSpeechLine(said({ failed: 3, failedMaking: 1, failedPlaying: 2 })), true);
  assert.equal(isSpeechLine(said({ failed: 0, failedMaking: 0, failedPlaying: 0 })), true);
  assert.equal(isSpeechLine(said({ failed: 3 })), true);
  assert.equal(isSpeechLine(said({ failed: 3, failedMaking: 1, failedPlaying: 1 })), false);
  assert.equal(isSpeechLine(said({ failed: 1, failedMaking: 1 })), false);
  assert.equal(isSpeechLine(said({ failed: 1, failedPlaying: 1 })), false);
  for (const [field, other] of [["failedMaking", "failedPlaying"], ["failedPlaying", "failedMaking"]]) {
    assert.equal(isSpeechLine({ ...said({ failed: 0 }), [field]: -1, [other]: 1 }), false, field);
    assert.equal(isSpeechLine({ ...said({ failed: 2 }), [field]: 0.5, [other]: 1.5 }), false, field);
    assert.equal(isSpeechLine({ ...said({ failed: 1 }), [field]: null, [other]: 1 }), false, field);
    assert.equal(isSpeechLine({ ...said({ failed: 1 }), [field]: true, [other]: 0 }), false, field);
  }
});

test("a speech line's requests and the sentences in them are read when they make sense, and older lines without them still are", () => {
  assert.equal(isSpeechLine(said({ requests: 2, requestedSentences: 5 })), true);
  assert.equal(isSpeechLine(said({ requests: 3, requestedSentences: 3 })), true);
  assert.equal(isSpeechLine(said({ requests: 0, requestedSentences: 0 })), true);
  assert.equal(isSpeechLine(said()), true);
  assert.equal(isSpeechLine(said({ requests: 4, requestedSentences: 3 })), false);
  assert.equal(isSpeechLine(said({ requests: 0, requestedSentences: 2 })), false);
  assert.equal(isSpeechLine(said({ requests: 2 })), false);
  assert.equal(isSpeechLine(said({ requestedSentences: 2 })), false);
  assert.equal(isSpeechLine(said({ requests: -1, requestedSentences: -1 })), false);
  assert.equal(isSpeechLine(said({ requests: -2, requestedSentences: -1 })), false);
  for (const [field, other] of [["requests", "requestedSentences"], ["requestedSentences", "requests"]]) {
    assert.equal(isSpeechLine({ ...said(), [field]: -1, [other]: 0 }), false, field);
    assert.equal(isSpeechLine({ ...said(), [field]: 1.5, [other]: 2 }), false, field);
    assert.equal(isSpeechLine({ ...said(), [field]: null, [other]: 1 }), false, field);
    assert.equal(isSpeechLine({ ...said(), [field]: "1", [other]: 1 }), false, field);
  }
});

test("a speech line as Jarvis writes it is read back by compare, failures, their split and the requests included", () => {
  const report = { firstSentenceMs: 900.4, firstSoundMadeMs: 1700.6, firstSoundMs: 1750.2, longestSilenceMs: 320.6, spoken: 2, failed: 3, failedMaking: 1, failedPlaying: 2, left: 1, requests: 4, requestedSentences: 6, problem: "Kokoro replied 500", gaveUp: false, tooLong: false, stopped: false };
  assert.equal(isSpeechLine(JSON.parse(JSON.stringify(speechLine("chat-1", 2, new Date("2026-11-19T21:00:00Z"), report)))), true);
  assert.equal(isSpeechLine(JSON.parse(JSON.stringify(speechLine("chat-1", 2, new Date("2026-11-19T21:00:00Z"), { ...report, failed: 0, failedMaking: 0, failedPlaying: 0 })))), true);
  assert.equal(isSpeechLine(JSON.parse(JSON.stringify(speechLine("chat-1", 2, new Date("2026-11-19T21:00:00Z"), { ...report, requests: 0, requestedSentences: 0 })))), true);
});

test("a second speech table adds up each setting's sentences, and counts the answers with no sound, stopped, given up on or over 40", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3 }), voiced({ question: 4, ok: false, error: "timeout" }), line({ chat: "chat-2" })];
  const speech = [
    said({ spoken: 1 }),
    said({ spoken: 3 }),
    said({ question: 2, firstSoundMadeMs: null, firstSoundMs: null, spoken: 0, failed: 2, left: 4, gaveUp: true }),
    said({ question: 3, spoken: 5, failed: 1, left: 6, stopped: true, tooLong: true }),
    said({ question: 4, spoken: 9 }),
  ];
  const report = compareReport({ lines, speech, skipped: 0 });
  assert.equal(report.includes(`\n\n${countsHeading}\n`), true);
  const table = report.slice(report.indexOf(countsHeading));
  assert.deepEqual(rowOf(table, "API, keep, Kokoro voice"), ["3", "8", "3", "10", "1", "1", "1", "1"]);
  assert.equal(table.includes("no voice"), false);
  const header = table.split("\n").find((text) => text.includes("Not played in full"));
  assert.deepEqual(header?.trim().split(/\s{3,}/), ["Answers", "Played", "Failed", "Not played in full", "No sound", "Stopped", "Given up", "Over 40"]);
  assert.ok(report.indexOf(countsHeading) > report.indexOf("Speech, timed"));
  assert.equal(table.includes("had no speech line"), false);
});

test("an answer stopped before any sound counts as stopped and as no sound, and one stopped in its first sentence only as stopped", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3 })];
  const speech = [
    said({ firstSoundMadeMs: 900, firstSoundMs: null, spoken: 0, left: 3, stopped: true }),
    said({ question: 2, firstSoundMs: 2600, spoken: 0, left: 3, stopped: true }),
    said({ question: 3, firstSoundMadeMs: null, firstSoundMs: null, spoken: 0, left: 2, stopped: true }),
  ];
  const report = compareReport({ lines, speech, skipped: 0 });
  assert.deepEqual(rowOf(report.slice(report.indexOf(countsHeading)), "API, keep"), ["3", "0", "0", "8", "2", "3", "0", "0"]);
});

test("the second speech table has a row for each setting with speech lines, even when nothing in it made a sound, and isn't there without any", () => {
  const silent = compareReport({ lines: [voiced()], speech: [said({ firstSoundMadeMs: null, firstSoundMs: null, spoken: 0, failed: 2, gaveUp: true })], skipped: 0 });
  assert.equal(silent.includes("Speech, timed"), false);
  assert.deepEqual(rowOf(silent.slice(silent.indexOf(countsHeading)), "API, keep"), ["1", "0", "2", "0", "1", "0", "1", "0"]);
  const two = compareReport({ lines: [voiced({ engine: "sdk", thinking: null }), voiced({ chat: "chat-2", speechStart: "clause" })], speech: [said(), said({ chat: "chat-2", spoken: 2, left: 1, stopped: true })], skipped: 0 });
  const counts = two.slice(two.indexOf(countsHeading));
  assert.deepEqual(rowOf(counts, "Agent SDK, whole first sentence"), ["1", "3", "0", "0", "0", "0", "0", "0"]);
  assert.deepEqual(rowOf(counts, "API, keep, first clause early"), ["1", "2", "0", "1", "0", "1", "0", "0"]);
  assert.equal(compareReport({ lines: [voiced(), line({ chat: "chat-2" })], skipped: 0 }).includes(countsHeading), false);
  assert.equal(compareReport({ lines: [line()], speech: [said()], skipped: 0 }).includes(countsHeading), false);
});

test("answers with the voice on but no speech line yet are named under the second table, apart from failed and voice-off ones", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3 }), voiced({ question: 4, ok: false, error: "timeout" }), line({ chat: "chat-2" })];
  const report = compareReport({ lines, speech: [said()], skipped: 0 });
  assert.equal(report.includes(`${countsHeading}\n`), true);
  assert.equal(report.includes("\n2 answers with the voice on had no speech line in the log, so aren't in this table: still being spoken when this ran, or the chat ended first.\n"), true);
  const one = compareReport({ lines: [voiced(), voiced({ question: 2 })], speech: [said()], skipped: 0 });
  assert.equal(one.includes("\n1 answer with the voice on had no speech line in the log, so isn't in this table: still being spoken when this ran, or the chat ended first.\n"), true);
});

test("under the second speech table, each setting where sentences failed gets a line saying how many couldn't be made and how many couldn't be played", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3 }), voiced({ question: 4 }), voiced({ chat: "chat-2", speechStart: "clause" }), voiced({ chat: "chat-2", question: 2, speechStart: "clause" }), voiced({ chat: "chat-3", engine: "sdk", thinking: null }), voiced({ chat: "chat-4", ok: false, error: "timeout" })];
  const speech = [
    said({ failed: 2, failedMaking: 2, failedPlaying: 0 }),
    said({ question: 2, failed: 1, failedMaking: 0, failedPlaying: 1 }),
    said({ question: 3, failed: 0, failedMaking: 0, failedPlaying: 0 }),
    said({ chat: "chat-2", failed: 1 }),
    said({ chat: "chat-2", question: 2, failed: 3, failedMaking: 1, failedPlaying: 2 }),
    said({ chat: "chat-3", failed: 0, failedMaking: 0, failedPlaying: 0 }),
    said({ chat: "chat-4", failed: 5, failedMaking: 5, failedPlaying: 0 }),
  ];
  const report = compareReport({ lines, speech, skipped: 0 });
  const after = report.slice(report.indexOf(countsHeading));
  const first = "\nAPI, keep, whole first sentence: 3 sentences failed, 2 couldn't be made and 1 couldn't be played.\n";
  const second = "\nAPI, keep, first clause early: 4 sentences failed, 1 couldn't be made, 2 couldn't be played and 1 is from older log lines that don't say which.\n";
  const unlogged = "\n1 answer with the voice on had no speech line in the log";
  assert.equal(after.includes(first), true);
  assert.equal(after.includes(second), true);
  assert.equal(after.includes("Agent SDK, whole first sentence:"), false);
  const rows = after.split("\n");
  const lastRow = rows.findIndex((text) => text.startsWith("API, keep, first clause early "));
  assert.ok(lastRow > 0 && rows[lastRow + 1].startsWith("API, keep, whole first sentence:") && rows[lastRow + 2].startsWith("API, keep, first clause early:"));
  assert.ok(after.indexOf(second) < after.indexOf(unlogged));
  const older = compareReport({ lines: [voiced(), voiced({ question: 2 })], speech: [said({ failed: 1 }), said({ question: 2, failed: 1 })], skipped: 0 });
  assert.equal(older.includes("\nAPI, keep: 2 sentences failed, all from older log lines that don't say which.\n"), true);
  const olderOne = compareReport({ lines: [voiced(), voiced({ question: 2 })], speech: [said({ failed: 1 }), said({ question: 2, failed: 0, failedMaking: 0, failedPlaying: 0 })], skipped: 0 });
  assert.equal(olderOne.includes("\nAPI, keep: 1 sentence failed, from an older log line that doesn't say which.\n"), true);
  const one = compareReport({ lines: [voiced()], speech: [said({ failed: 1, failedMaking: 0, failedPlaying: 1 })], skipped: 0 });
  assert.equal(one.includes("\nAPI, keep: 1 sentence failed, 0 couldn't be made and 1 couldn't be played.\n"), true);
  const none = compareReport({ lines: [voiced()], speech: [said({ failed: 0, failedMaking: 0, failedPlaying: 0 })], skipped: 0 });
  assert.equal(/\d sentences? failed, /.test(none), false);
});

test("under the second speech table, each setting gets a line saying how many sentences Kokoro was asked for in how many requests, from the answers that log it", () => {
  const lines = [voiced(), voiced({ question: 2 }), voiced({ question: 3 }), voiced({ chat: "chat-2", speechBundle: "on" }), voiced({ chat: "chat-2", question: 2, speechBundle: "on" }), voiced({ chat: "chat-3", engine: "sdk", thinking: null })];
  const speech = [
    said({ requests: 3, requestedSentences: 3 }),
    said({ question: 2, requests: 2, requestedSentences: 2 }),
    said({ question: 3 }),
    said({ chat: "chat-2", requests: 2, requestedSentences: 7 }),
    said({ chat: "chat-2", question: 2, requests: 1, requestedSentences: 1 }),
    said({ chat: "chat-3", requests: 0, requestedSentences: 0 }),
  ];
  const report = compareReport({ lines, speech, skipped: 0 });
  const after = report.slice(report.indexOf(countsHeading));
  assert.equal(after.includes("\nAPI, keep, a sentence at a time: Kokoro was asked for 5 sentences in 5 requests, 1.0 a request, from the 2 of 3 answers that log it.\n"), true);
  assert.equal(after.includes("\nAPI, keep, sentences bundled: Kokoro was asked for 8 sentences in 3 requests, 2.7 a request.\n"), true);
  assert.equal(after.includes("Agent SDK, a sentence at a time: Kokoro was asked"), false);
  const rows = after.split("\n");
  const lastRow = rows.findIndex((text) => text.startsWith("API, keep, sentences bundled "));
  assert.ok(lastRow > 0 && rows[lastRow + 1].startsWith("API, keep, a sentence at a time: Kokoro") && rows[lastRow + 2].startsWith("API, keep, sentences bundled: Kokoro"));
  const one = compareReport({ lines: [voiced()], speech: [said({ requests: 1, requestedSentences: 1 })], skipped: 0 });
  assert.equal(one.includes("\nAPI, keep: Kokoro was asked for 1 sentence in 1 request, 1.0 a request.\n"), true);
  assert.equal(compareReport({ lines: [voiced()], speech: [said()], skipped: 0 }).includes("Kokoro was asked"), false);
  const failedFirst = compareReport({ lines: [voiced()], speech: [said({ failed: 1, failedMaking: 1, failedPlaying: 0, requests: 2, requestedSentences: 2 })], skipped: 0 });
  assert.ok(failedFirst.indexOf("1 sentence failed") < failedFirst.indexOf("Kokoro was asked"));
});

test("Piper's answers are their own setting, named Piper voice, and its requests line names Piper, beside Kokoro's and the answers with no voice", () => {
  const lines = [voiced(), voiced({ chat: "chat-2", voice: "piper" }), voiced({ chat: "chat-2", question: 2, voice: "piper" }), line({ chat: "chat-3" })];
  const speech = [said({ requests: 2, requestedSentences: 2 }), said({ chat: "chat-2", requests: 1, requestedSentences: 3 }), said({ chat: "chat-2", question: 2, requests: 2, requestedSentences: 2 })];
  const report = compareReport({ lines, speech, skipped: 0 });
  assert.deepEqual(rowOf(report, ""), ["API, keep, no voice", "API, keep, Kokoro voice", "API, keep, Piper voice"]);
  assert.deepEqual(rowOf(report, "Answers"), ["1", "1", "2"]);
  assert.equal(report.includes("\nAPI, keep, Kokoro voice: Kokoro was asked for 2 sentences in 2 requests, 1.0 a request.\n"), true);
  assert.equal(report.includes("\nAPI, keep, Piper voice: Piper was asked for 5 sentences in 3 requests, 1.7 a request.\n"), true);
  const piperFirst = compareReport({ lines: [voiced({ chat: "chat-2", voice: "piper" }), line({ chat: "chat-3" }), voiced()], skipped: 0 });
  assert.deepEqual(rowOf(piperFirst, ""), ["API, keep, no voice", "API, keep, Kokoro voice", "API, keep, Piper voice"]);
  const piperOnly = compareReport({ lines: [voiced({ voice: "piper" })], speech: [said({ requests: 1, requestedSentences: 1 })], skipped: 0 });
  assert.equal(piperOnly.includes("\nAPI, keep: Piper was asked for 1 sentence in 1 request, 1.0 a request.\n"), true);
  assert.equal(piperOnly.includes("Kokoro"), false);
  assert.equal(isLogLine({ ...voiced(), voice: "piper" }), true);
  assert.equal(isLogLine({ ...voiced(), voice: "Piper" }), false);
});

test("a line's heard times are trusted only when both are whole, finite and not below zero, and older lines without them still are", () => {
  assert.equal(isLogLine(line()), true);
  assert.equal(isLogLine(line({ heard: { recordedMs: 2500, textMs: 1300 } })), true);
  assert.equal(isLogLine(line({ heard: { recordedMs: 0, textMs: 0 } })), true);
  for (const heard of [null, "2500", [2500, 1300], { recordedMs: 2500 }, { textMs: 1300 }, { recordedMs: -1, textMs: 1 }, { recordedMs: 1, textMs: Number.POSITIVE_INFINITY }, { recordedMs: "1", textMs: 1 }]) {
    assert.equal(isLogLine({ ...line(), heard }), false, JSON.stringify(heard));
  }
});

test("questions asked through ears get a line of their own, with how long was recorded and how long the text took once it ended, and none without them", () => {
  const lines = [line({ heard: { recordedMs: 2000, textMs: 1000 } }), line({ question: 2, heard: { recordedMs: 4000, textMs: 3000 } }), line({ question: 3, ok: false, error: "timeout", heard: { recordedMs: 6000, textMs: 1200 } }), line({ question: 4 })];
  const report = compareReport({ lines, skipped: 0 });
  assert.equal(report.includes("\n3 questions were asked through ears. Recording 4.00 s (6.00 s), and the text back once it ended 1.20 s (3.00 s): the median, with the slowest in brackets.\n"), true, report);
  const one = compareReport({ lines: [line({ heard: { recordedMs: 2500, textMs: 1300 } })], skipped: 0 });
  assert.equal(one.includes("\n1 question was asked through ears. Recording 2.50 s (2.50 s), and the text back once it ended 1.30 s (1.30 s)"), true, one);
  assert.equal(compareReport({ lines: [line()], skipped: 0 }).includes("through ears"), false);
});

test("the ears line says how many questions came through the wake word, and a wake that isn't exactly true makes the line untrusted", () => {
  const woken = (question: number, recordedMs: number) => line({ question, heard: { recordedMs, textMs: 900, wake: true } });
  const mixed = compareReport({ lines: [line({ heard: { recordedMs: 2000, textMs: 1000 } }), woken(2, 3000), woken(3, 5000)], skipped: 0 });
  assert.equal(mixed.includes("\n3 questions were asked through ears, 2 of them with the wake word. Recording 3.00 s (5.00 s), and the text back once it ended 0.90 s (1.00 s)"), true, mixed);
  const all = compareReport({ lines: [woken(1, 3000), woken(2, 5000)], skipped: 0 });
  assert.equal(all.includes("\n2 questions were asked through ears, all of them with the wake word. Recording"), true, all);
  const single = compareReport({ lines: [woken(1, 3000)], skipped: 0 });
  assert.equal(single.includes("\n1 question was asked through ears, with the wake word. Recording 3.00 s"), true, single);
  assert.equal(isLogLine(line({ heard: { recordedMs: 1, textMs: 1, wake: true } })), true);
  for (const wake of [false, "yes", 1, null]) assert.equal(isLogLine({ ...line(), heard: { recordedMs: 1, textMs: 1, wake } }), false, JSON.stringify(wake));
});

test("wake questions are split by how ears was set to end them once both appear: loudness or the speech detector, with their recording times", () => {
  const woken = (question: number, recordedMs: number, ender?: "loudness" | "silero") => line({ question, heard: { recordedMs, textMs: 900, wake: true, ...(ender === undefined ? {} : { ender }) } });
  const both = compareReport({ lines: [woken(1, 3000, "loudness"), woken(2, 5000, "loudness"), woken(3, 2000, "silero"), woken(4, 4000)], skipped: 0 });
  assert.equal(both.includes(" Split by how ears was set to end them: 2 wake questions on loudness, recording 4.00 s (5.00 s); 1 wake question on the speech detector, recording 2.00 s (2.00 s).\n"), true, both);
  const one = compareReport({ lines: [woken(1, 3000, "silero"), woken(2, 5000, "silero")], skipped: 0 });
  assert.equal(one.includes("Split by"), false, one);
  assert.equal(isLogLine(line({ heard: { recordedMs: 1, textMs: 1, wake: true, ender: "silero" } })), true);
  assert.equal(isLogLine(line({ heard: { recordedMs: 1, textMs: 1, wake: true, ender: "loudness" } })), true);
  for (const ender of ["Silero", "vad", 1, null, true]) assert.equal(isLogLine({ ...line(), heard: { recordedMs: 1, textMs: 1, wake: true, ender } }), false, JSON.stringify(ender));
});
