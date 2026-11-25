import assert from "node:assert/strict";
import { test } from "node:test";
import { createChangeFeed, keptChanges } from "./changes.js";

const at = (iso: string) => new Date(iso);
const monday = (time: string) => at(`2026-11-23T${time}:00Z`);

test("with nothing added, the feed gives its run, 0 as the latest, and no changes", () => {
  const feed = createChangeFeed("run-1");
  assert.deepEqual(feed.since(null, null, monday("07:00")), { run: "run-1", latest: 0, changes: [] });
});

test("each check's lines become one change, numbered from 1, with when it was found", () => {
  const feed = createChangeFeed("run-1");
  feed.add(["The 07:14 is cancelled."], monday("06:47"));
  feed.add(["The 07:44 is now expected 07:54, 10 minutes late.", "The 08:14 now leaves from platform 2, not 1."], monday("06:49"));
  assert.deepEqual(feed.since(null, null, monday("07:00")), {
    run: "run-1",
    latest: 2,
    changes: [
      { id: 1, at: "2026-11-23T06:47:00.000Z", lines: ["The 07:14 is cancelled."] },
      { id: 2, at: "2026-11-23T06:49:00.000Z", lines: ["The 07:44 is now expected 07:54, 10 minutes late.", "The 08:14 now leaves from platform 2, not 1."] },
    ],
  });
});

test("an empty check adds nothing", () => {
  const feed = createChangeFeed("run-1");
  feed.add([], monday("06:47"));
  assert.deepEqual(feed.since(null, null, monday("07:00")).latest, 0);
});

test("asking after a number, with this run, gives only the changes after it", () => {
  const feed = createChangeFeed("run-1");
  for (const time of ["06:47", "06:49", "06:51"]) feed.add([`At ${time}.`], monday(time));
  assert.deepEqual(feed.since(1, "run-1", monday("07:00")).changes.map((change) => change.id), [2, 3]);
  assert.deepEqual(feed.since(3, "run-1", monday("07:00")).changes, []);
  assert.deepEqual(feed.since(9, "run-1", monday("07:00")), { run: "run-1", latest: 3, changes: [] });
});

test("asking with another run, as after the hub starts again, gives all of today's changes, since its numbers started again", () => {
  const feed = createChangeFeed("run-2");
  feed.add(["The 07:14 is cancelled."], monday("06:47"));
  assert.deepEqual(feed.since(40, "run-1", monday("07:00")).changes.map((change) => change.id), [1]);
  assert.deepEqual(feed.since(40, null, monday("07:00")).changes.map((change) => change.id), [1]);
});

test("only today's changes are kept, by London's day, while the numbers carry on", () => {
  const feed = createChangeFeed("run-1");
  feed.add(["Monday."], monday("06:47"));
  assert.deepEqual(feed.since(0, "run-1", at("2026-11-24T00:30:00Z")).changes, []);
  feed.add(["Tuesday."], at("2026-11-24T06:47:00Z"));
  assert.deepEqual(feed.since(0, "run-1", at("2026-11-24T07:00:00Z")), { run: "run-1", latest: 2, changes: [{ id: 2, at: "2026-11-24T06:47:00.000Z", lines: ["Tuesday."] }] });
  const summer = createChangeFeed("run-1");
  summer.add(["Late."], at("2026-06-01T22:30:00Z"));
  assert.deepEqual(summer.since(0, "run-1", at("2026-06-01T23:40:00Z")).changes, [], "already the 2nd in London");
  assert.equal(summer.since(0, "run-1", at("2026-06-01T22:50:00Z")).changes.length, 1, "still the 1st in London");
});

test("at most the last 50 changes of a day are kept", () => {
  const feed = createChangeFeed("run-1");
  for (let index = 1; index <= keptChanges + 5; index++) feed.add([`Change ${index}.`], monday("07:00"));
  const kept = feed.since(null, null, monday("07:10"));
  assert.equal(keptChanges, 50);
  assert.equal(kept.latest, 55);
  assert.deepEqual([kept.changes.length, kept.changes[0].id, kept.changes.at(-1)?.id], [50, 6, 55]);
});

test("changing what was given or added afterwards doesn't change the feed", () => {
  const feed = createChangeFeed("run-1");
  const lines = ["The 07:14 is cancelled."];
  feed.add(lines, monday("06:47"));
  lines.push("Added later.");
  feed.since(null, null, monday("07:00")).changes[0].lines.push("Changed.");
  assert.deepEqual(feed.since(null, null, monday("07:00")).changes[0].lines, ["The 07:14 is cancelled."]);
});

test("each feed has its own run by default", () => {
  assert.notEqual(createChangeFeed().since(null, null, monday("07:00")).run, createChangeFeed().since(null, null, monday("07:00")).run);
});
