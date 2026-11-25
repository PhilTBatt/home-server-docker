import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { askHubForChanges, changesOf, trainAlertsOffNote, trainsOldHubNote, trainLineChars, trainLinesKept, trainNudgeMs, trainPollMs, trainSay, trainsBackNote, trainsUnreachableNote, watchTrainChanges, type ChangesReply, type TrainEvent } from "./train-news.js";

const ok = (latest: number, lines: string[][] = [], run = "run-1"): ChangesReply => ({ status: 200, fields: { run, latest, changes: lines.map((group, index) => ({ id: latest - lines.length + index + 1, at: "2026-11-23T06:47:00.000Z", lines: group })) } });

function scripted(replies: Array<ChangesReply | Error>) {
  const asked: string[] = [];
  const waits: number[] = [];
  const stop = new AbortController();
  const news = watchTrainChanges({
    ask: async (query) => {
      asked.push(query);
      const next = replies.shift();
      if (next === undefined) {
        stop.abort();
        throw new Error("aborted");
      }
      if (next instanceof Error) throw next;
      return next;
    },
    signal: stop.signal,
    wait: async (ms) => void waits.push(ms),
  });
  const reader = news.events[Symbol.asyncIterator]();
  return { news, reader, asked, waits, stop };
}

async function rest(reader: AsyncIterator<TrainEvent>): Promise<TrainEvent[]> {
  const got: TrainEvent[] = [];
  for (;;) {
    const next = await reader.next();
    if (next.done === true) return got;
    got.push(next.value);
  }
}

test("it asks every 30 seconds, and nudges every 2 seconds while a change waits", () => {
  assert.equal(trainPollMs, 30_000);
  assert.equal(trainNudgeMs, 2_000);
});

test("the first answer is only where to start, so changes found before the chat began aren't passed on", async () => {
  const run = scripted([ok(3, [["The 07:14 is cancelled."]])]);
  assert.deepEqual(await rest(run.reader), []);
  assert.deepEqual(run.news.take(), []);
  assert.deepEqual(run.asked, ["", "?after=3&run=run-1"]);
  assert.deepEqual(run.waits, [30_000]);
});

test("later changes are kept for the chat to take, with a nudge every 2 seconds until it does, and the next ask goes on from the latest", async () => {
  const run = scripted([ok(3), ok(5, [["The 07:14 is cancelled."], ["The 07:44 is now expected 07:54, 10 minutes late.", "The 08:14 now leaves from platform 2, not 1."]]), ok(5)]);
  assert.deepEqual(await run.reader.next(), { done: false, value: { kind: "trains" } });
  assert.deepEqual(run.asked, ["", "?after=3&run=run-1"]);
  assert.deepEqual(await run.reader.next(), { done: false, value: { kind: "trains" } });
  assert.deepEqual(run.waits, [30_000, 2_000]);
  assert.deepEqual(run.news.take(), ["The 07:14 is cancelled.", "The 07:44 is now expected 07:54, 10 minutes late.", "The 08:14 now leaves from platform 2, not 1."]);
  assert.deepEqual(run.news.take(), []);
  assert.deepEqual(await rest(run.reader), []);
  assert.deepEqual(run.waits, [30_000, 2_000, 28_000, 30_000]);
  assert.deepEqual(run.asked, ["", "?after=3&run=run-1", "?after=5&run=run-1", "?after=5&run=run-1"]);
});

test("after the hub starts again it asks with the old run, which gets all the new run's changes, and then goes on with the new run", async () => {
  const run = scripted([ok(40), ok(1, [["The 07:14 is cancelled."]], "run-2"), ok(1, [], "run-2")]);
  assert.deepEqual(await run.reader.next(), { done: false, value: { kind: "trains" } });
  assert.deepEqual(run.news.take(), ["The 07:14 is cancelled."]);
  await rest(run.reader);
  assert.deepEqual(run.asked, ["", "?after=40&run=run-1", "?after=1&run=run-2", "?after=1&run=run-2"]);
});

test("with the hub's train alerts off, it says so once and stops asking", async () => {
  const run = scripted([{ status: 404, fields: { error: "Train alerts are switched off" } }, ok(3)]);
  assert.deepEqual(await rest(run.reader), [{ kind: "trains note", line: trainAlertsOffNote }]);
  assert.deepEqual(run.asked, [""]);
  assert.equal(trainAlertsOffNote, "train changes: the hub's train alerts are off, so set TRAIN_ALERTS=on and its settings in api/.env and restart the hub, then start Jarvis again");
});

test("a hub too old to know the route says how to update it, and stops asking", async () => {
  const run = scripted([{ status: 404, fields: { message: "Route GET:/trains/changes not found", error: "Not Found", statusCode: 404 } }, ok(3)]);
  assert.deepEqual(await rest(run.reader), [{ kind: "trains note", line: trainsOldHubNote }]);
  assert.deepEqual(run.asked, [""]);
});

test("a hub it can't ask is noted once, kept trying every 30 seconds, and noted again when it answers", async () => {
  const run = scripted([new Error("fetch failed"), { status: 500, fields: { error: "Internal Server Error" } }, { status: 200, fields: { run: "run-1" } }, { status: 401, fields: { error: "Unauthorized" } }, ok(3), ok(4, [["The 07:14 is cancelled."]]), new Error("fetch failed")]);
  const got = await rest(run.reader);
  assert.deepEqual(got.filter((event) => event.kind === "trains note"), [{ kind: "trains note", line: trainsUnreachableNote("fetch failed") }, { kind: "trains note", line: trainsBackNote }, { kind: "trains note", line: trainsUnreachableNote("fetch failed") }]);
  assert.equal(got.filter((event) => event.kind === "trains").length, 30, "a nudge every 2 seconds for two polls, with nothing taken");
  assert.deepEqual(run.asked.length, 8);
  assert.deepEqual(run.news.take(), ["The 07:14 is cancelled."], "the first good answer was where to start");
  assert.equal(trainsUnreachableNote("fetch failed"), "train changes: couldn't ask the hub (fetch failed), so trying again every 30 seconds");
  assert.equal(trainsBackNote, "train changes: the hub is answering again");
  const notes = scripted([{ status: 500, fields: { error: "Internal\u0007 Server Error" } }]);
  assert.deepEqual(await rest(notes.reader), [{ kind: "trains note", line: trainsUnreachableNote("Internal  Server Error") }]);
  const shape = scripted([{ status: 200, fields: { run: "run-1", latest: -1, changes: [] } }]);
  assert.deepEqual(await rest(shape.reader), [{ kind: "trains note", line: trainsUnreachableNote("its reply wasn't a list of train changes") }]);
});

test("changes are tidied: control characters become spaces, long lines are cut, empty ones dropped, and only the newest 20 are kept", async () => {
  const long = "x".repeat(trainLineChars + 50);
  const many = Array.from({ length: trainLinesKept + 5 }, (_, index) => `Change ${index + 1}.`);
  const run = scripted([ok(1), ok(3, [["The 07:14\u0007 is\ncancelled.", long, " \u0000 "], many])]);
  await run.reader.next();
  const taken = run.news.take();
  assert.equal(trainLinesKept, 20);
  assert.equal(taken.length, trainLinesKept);
  assert.deepEqual(taken.slice(0, 2), ["Change 6.", "Change 7."]);
  assert.equal(taken.at(-1), "Change 25.");
  const kept = scripted([ok(1), ok(2, [["The 07:14\u0007 is\ncancelled.", long, " \u0000 "]])]);
  await kept.reader.next();
  assert.deepEqual(kept.news.take(), ["The 07:14 is cancelled.", "x".repeat(trainLineChars)]);
  await rest(run.reader);
  await rest(kept.reader);
});

test("only a whole, well-formed answer counts as changes", () => {
  assert.deepEqual(changesOf({ run: "run-1", latest: 2, changes: [{ id: 2, lines: ["A.", "B."] }] }), { run: "run-1", latest: 2, lines: ["A.", "B."] });
  for (const fields of [{}, { run: "", latest: 0, changes: [] }, { run: "r".repeat(101), latest: 0, changes: [] }, { run: "run-1", latest: 1.5, changes: [] }, { run: "run-1", latest: "2", changes: [] }, { run: "run-1", latest: 2, changes: {} }, { run: "run-1", latest: 2, changes: [null] }, { run: "run-1", latest: 2, changes: [{ lines: "A." }] }, { run: "run-1", latest: 2, changes: [{ lines: ["A.", 3] }] }]) {
    assert.equal(changesOf(fields), null, JSON.stringify(fields));
  }
});

test("changes are said as one line, after Train change or Train changes", () => {
  assert.equal(trainSay(["The 07:14 is cancelled."]), "Train change: The 07:14 is cancelled.");
  assert.equal(trainSay(["The 07:14 is cancelled.", "The 07:44 is back on time."]), "Train changes: The 07:14 is cancelled. The 07:44 is back on time.");
});

test("it asks the hub's /trains/changes with the hub's token, and stops when the chat closes", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ run: "run-1", latest: 0, changes: [] }), { status: 200 }));
  try {
    const reply = await askHubForChanges("hub-token", "http://hub.test")("?after=2&run=run-1", new AbortController().signal);
    assert.deepEqual(reply, { status: 200, fields: { run: "run-1", latest: 0, changes: [] } });
    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, "http://hub.test/trains/changes?after=2&run=run-1");
    assert.deepEqual(init.headers, { Authorization: "Bearer hub-token" });
    assert.equal(init.redirect, "error");
  } finally {
    fetchMock.mock.restore();
  }
  const stop = new AbortController();
  let asked = 0;
  const news = watchTrainChanges({ ask: async () => (asked++, ok(1)), signal: stop.signal, wait: async () => stop.abort() });
  assert.deepEqual(await rest(news.events[Symbol.asyncIterator]()), []);
  assert.equal(asked, 1);
});
