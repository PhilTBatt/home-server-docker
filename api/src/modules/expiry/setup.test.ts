import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { expiryCheckerFor } from "./setup.js";

afterEach(() => {
  mock.restoreAll();
});

test("the checker reads items.json from its folder, sends through ntfy to the topic, and keeps what it sent in sent.json beside it", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const dir = await mkdtemp(join(tmpdir(), "expiry-"));
  await writeFile(join(dir, "items.json"), JSON.stringify({ items: [{ name: "Alpha", date: "2026-12-03" }] }));
  const checker = expiryCheckerFor({ ntfyTopic: "test-topic" }, {}, dir);
  assert.equal(await checker.run(new Date("2026-11-26T08:00:00Z")), "sent");
  assert.equal(String(fetchMock.mock.calls[0].arguments[0]), "https://ntfy.sh/test-topic");
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.body, "Alpha expires in 7 days, on 3 Dec 2026.");
  assert.equal(await readFile(join(dir, "sent.json"), "utf8"), '{"sent":{"Alpha":{"date":"2026-12-03","stage":7}}}');
  assert.equal(await expiryCheckerFor({ ntfyTopic: "test-topic" }, {}, dir).run(new Date("2026-11-26T09:00:00Z")), "nothing due");
});

test("a missing list is passed to the log's hook, naming the file, and nothing is sent", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const dir = await mkdtemp(join(tmpdir(), "expiry-"));
  const reported: (string | null)[] = [];
  const checker = expiryCheckerFor({ ntfyTopic: "test-topic" }, { listProblem: (message) => reported.push(message) }, dir);
  assert.equal(await checker.run(new Date("2026-11-26T08:00:00Z")), "list problem");
  assert.deepEqual(reported, ["The expiry list has a problem: there's no expiry/items.json yet: copy api/src/modules/expiry/items.example.json there to start"]);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("without a folder given, the checker looks in /expiry", async () => {
  const reported: (string | null)[] = [];
  await expiryCheckerFor({ ntfyTopic: "test-topic" }, { listProblem: (message) => reported.push(message) }).run(new Date("2026-11-26T08:00:00Z"));
  assert.equal(reported.length, 1);
  assert.match(String(reported[0]), /^The expiry list has a problem: /);
});
