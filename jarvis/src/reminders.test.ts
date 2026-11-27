import assert from "node:assert/strict";
import { test } from "node:test";
import { answeredSay, dueOf, hubReminders, reminderAnswerIn, reminderSay, remindersBackNote, remindersOffNote, remindersOldHubNote, watchReminders, type DueReply } from "./reminders.js";

const due = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, text, at: "2026-11-27T10:00:00.000Z", late: false, urgent: false, ...extra });

test("the due list is read strictly, its text tidied and capped, and an empty one dropped", () => {
  assert.deepEqual(dueOf({ seq: 4, due: [due("a1", " Take\\nthe   bins out "), due("b2", "Call back", { late: true, urgent: true }), due("c3", "  ")] }), { seq: 4, due: [{ id: "a1", text: "Take\\nthe bins out", at: "2026-11-27T10:00:00.000Z", late: false, urgent: false }, { id: "b2", text: "Call back", at: "2026-11-27T10:00:00.000Z", late: true, urgent: true }] });
  assert.equal(dueOf({ seq: 1, due: [due("a", "x".repeat(300))] })?.due[0].text.length, 200);
  for (const fields of [{}, { seq: -1, due: [] }, { seq: 1 }, { seq: 1, due: [due("bad id!", "x")] }, { seq: 1, due: [due("a", "x", { at: "soon" })] }, { seq: 1, due: ["x"] }]) assert.equal(dueOf(fields), null, JSON.stringify(fields));
});

test("watching asks after the last seq, skips what was due long before he started, and keeps nudging while something's waiting", async () => {
  const asked: number[] = [];
  const stop = new AbortController();
  const replies: DueReply[] = [
    { status: 200, fields: { seq: 3, due: [due("old", "Old one", { at: "2026-11-27T09:00:00.000Z" }), due("new", "Fresh one", { at: "2026-11-27T09:59:30.000Z" })] } },
    { status: 200, fields: { seq: 5, due: [due("next", "Next one")] } },
  ];
  const news = watchReminders({
    ask: async (after) => {
      asked.push(after);
      const reply = replies.shift();
      if (reply === undefined) {
        stop.abort();
        throw new Error("done");
      }
      return reply;
    },
    signal: stop.signal,
    pollMs: 4,
    nudgeMs: 2,
    wait: async () => {},
    now: () => Date.parse("2026-11-27T10:00:00.000Z"),
  });
  const seen: string[] = [];
  for await (const event of news.events) {
    seen.push(event.kind);
    if (seen.length === 1) assert.deepEqual(news.take().map((one) => one.id), ["new"]);
  }
  assert.deepEqual(asked, [0, 3, 5]);
  assert.equal(seen[0], "reminders");
  assert.ok(seen.filter((kind) => kind === "reminders").length >= 3, seen.join(","));
  assert.deepEqual(news.take().map((one) => one.id), ["next"]);
});

test("the hub being off, old or unreachable is noted once, and its coming back is noted", async () => {
  const stop = new AbortController();
  const replies: Array<DueReply | Error> = [{ status: 404, fields: { error: "Reminders are switched off" } }, { status: 404, fields: { error: "Reminders are switched off" } }, { status: 404, fields: { error: "Not Found" } }, new Error("connect refused"), { status: 200, fields: { seq: 0, due: [] } }];
  const news = watchReminders({
    ask: async () => {
      const next = replies.shift();
      if (next === undefined) {
        stop.abort();
        throw new Error("done");
      }
      if (next instanceof Error) throw next;
      return next;
    },
    signal: stop.signal,
    pollMs: 2,
    nudgeMs: 2,
    wait: async () => {},
  });
  const lines: string[] = [];
  for await (const event of news.events) if (event.kind === "reminders note") lines.push(event.line);
  assert.deepEqual(lines, [remindersOffNote, remindersOldHubNote, "reminders: couldn't ask the hub (connect refused), so trying again every 10 seconds", remindersBackNote]);
});

test("what he says for one reminder or several ends each with a full stop, and says sorry for a late one", () => {
  assert.equal(reminderSay([{ id: "a", text: "Take the bins out", at: "", late: false, urgent: false }]), "Reminder: Take the bins out.");
  assert.equal(reminderSay([{ id: "a", text: "Stretch!", at: "", late: false, urgent: false }, { id: "b", text: "Water the plants", at: "", late: true, urgent: false }]), "Reminders: Stretch! Water the plants. Sorry, I couldn't say this when it was due.");
});

test("snooze, done and cancel are read from what he says straight after, with the minutes in digits or words", () => {
  const cases: Array<[string, unknown]> = [
    ["Snooze.", { kind: "snooze", minutes: 10 }],
    ["Snooze it for 20 minutes.", { kind: "snooze", minutes: 20 }],
    ["snooze five minutes", { kind: "snooze", minutes: 5 }],
    ["Remind me again in half an hour", { kind: "snooze", minutes: 30 }],
    ["Snooze for an hour please", { kind: "snooze", minutes: 60 }],
    ["snooze 2 hours", { kind: "snooze", minutes: 120 }],
    ["Thanks, done.", { kind: "done" }],
    ["I've done it", { kind: "done" }],
    ["Cancel that reminder.", { kind: "cancel" }],
    ["Stop reminding me", { kind: "cancel" }],
  ];
  for (const [said, expected] of cases) assert.deepEqual(reminderAnswerIn(said), expected, said);
  for (const said of ["Snooze for 5 hours", "snooze 0 minutes", "What's the weather?", "done with the dishes, what next?", "cancel my subscription"]) assert.equal(reminderAnswerIn(said), null, said);
});

test("the answer goes to the hub as snooze, done or a delete for that reminder, with the token, and a refusal is an error", async () => {
  const asked: Array<[string, string, string | null, string | null]> = [];
  const replies = [204, 200, 200, 404];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    asked.push([init.method ?? "GET", url, init.body === undefined ? null : String(init.body), new Headers(init.headers).get("authorization")]);
    const status = replies.shift() ?? 500;
    return new Response(status === 204 ? null : JSON.stringify(status === 404 ? { error: "No such reminder" } : { ok: true }), { status });
  }) as typeof fetch;
  try {
    const hub = hubReminders("a-token", "http://hub");
    const signal = new AbortController().signal;
    await hub.answer("a1", { kind: "cancel" }, signal);
    await hub.answer("a1", { kind: "snooze", minutes: 15 }, signal);
    await hub.answer("a1", { kind: "done" }, signal);
    await assert.rejects(hub.answer("a1", { kind: "done" }, signal), { message: "the hub said: No such reminder" });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(asked.slice(0, 3), [["DELETE", "http://hub/reminders/a1", null, "Bearer a-token"], ["POST", "http://hub/reminders/a1/snooze", '{"minutes":15}', "Bearer a-token"], ["POST", "http://hub/reminders/a1/done", "{}", "Bearer a-token"]]);
  assert.equal(answeredSay({ kind: "snooze", minutes: 1 }), "Snoozed for 1 minute.");
  assert.equal(answeredSay({ kind: "snooze", minutes: 60 }), "Snoozed for an hour.");
  assert.equal(answeredSay({ kind: "snooze", minutes: 120 }), "Snoozed for 2 hours.");
  assert.equal(answeredSay({ kind: "done" }), "Marked as done.");
});
