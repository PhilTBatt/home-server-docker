import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { countWaiting, memory } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true };
const made: string[] = [];

after(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});

async function inboxWith(files: string[], folders: string[] = []) {
  const dir = await mkdtemp(join(tmpdir(), "inbox-"));
  made.push(dir);
  for (const name of files) await writeFile(join(dir, name), "# a note\n");
  for (const name of folders) await mkdir(join(dir, name));
  return dir;
}

function buildApp(inboxDir: string, features = allOn) {
  const app = Fastify();
  app.register(memory, { prefix: "/memory", features, inboxDir });
  return app;
}

test("counts the notes waiting", async () => {
  assert.equal(await countWaiting(await inboxWith(["2026-11-14-one.md", "2026-11-14-two.md"])), 2);
});

test("an empty inbox has nothing waiting", async () => {
  assert.equal(await countWaiting(await inboxWith([])), 0);
});

test("the inbox's README isn't a note", async () => {
  assert.equal(await countWaiting(await inboxWith(["README.md"])), 0);
  assert.equal(await countWaiting(await inboxWith(["README.md", "2026-11-14-one.md"])), 1);
});

test("only markdown files count", async () => {
  assert.equal(await countWaiting(await inboxWith([".gitkeep", "notes.txt", "photo.jpg", "2026-11-14-one.md"])), 1);
});

test("a folder is never counted, even one named like a note", async () => {
  assert.equal(await countWaiting(await inboxWith(["2026-11-14-one.md"], ["drafts", "old.md"])), 1);
});

test("a missing inbox is a clear error, not a raw file system one", async () => {
  await assert.rejects(countWaiting(join(tmpdir(), "no-such-inbox-here")), { message: "Couldn't read the brain inbox" });
});

test("GET /memory/inbox returns the count", async () => {
  const dir = await inboxWith(["README.md", "a.md", "b.md", "c.md"]);
  const response = await buildApp(dir).inject({ method: "GET", url: "/memory/inbox" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { waiting: 3 });
});

test("the reply never includes a note's name or contents", async () => {
  const dir = await inboxWith(["2026-11-14-something-private.md"]);
  const response = await buildApp(dir).inject({ method: "GET", url: "/memory/inbox" });
  assert.deepEqual(Object.keys(response.json()), ["waiting"]);
  assert.doesNotMatch(response.body, /private|a note/);
});

test("it counts again on every request", async () => {
  const dir = await inboxWith(["a.md"]);
  const app = buildApp(dir);
  assert.deepEqual((await app.inject({ method: "GET", url: "/memory/inbox" })).json(), { waiting: 1 });
  await writeFile(join(dir, "b.md"), "# another\n");
  assert.deepEqual((await app.inject({ method: "GET", url: "/memory/inbox" })).json(), { waiting: 2 });
});

test("switched off, the route says so and doesn't touch the inbox", async () => {
  const app = buildApp(join(tmpdir(), "no-such-inbox-here"), { ...allOn, memoryInbox: false });
  const response = await app.inject({ method: "GET", url: "/memory/inbox" });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "The brain inbox is switched off" });
});

test("switched on with no inbox mounted, the route fails with the clear error", async () => {
  const response = await buildApp(join(tmpdir(), "no-such-inbox-here")).inject({ method: "GET", url: "/memory/inbox" });
  assert.equal(response.statusCode, 500);
  assert.match(response.body, /Couldn't read the brain inbox/);
  assert.doesNotMatch(response.body, /no-such-inbox-here/);
});

test("the inbox is never written to: only GET is offered", async () => {
  const dir = await inboxWith(["a.md"]);
  for (const method of ["POST", "PUT", "DELETE"] as const) {
    const response = await buildApp(dir).inject({ method, url: "/memory/inbox" });
    assert.equal(response.statusCode, 404);
  }
});