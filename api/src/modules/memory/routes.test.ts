import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { countWaiting, memory, saveNote, slugFor } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true, morning: true };
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

const lateJulyNight = new Date("2026-07-01T23:30:00Z");

function buildApp(inboxDir: string, features = allOn) {
  const app = Fastify();
  app.register(memory, { prefix: "/memory", features, inboxDir, now: () => lateJulyNight });
  return app;
}

function upload(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.inject({ method: "POST", url: "/memory/inbox", payload: body as Record<string, unknown> });
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

test("nothing can replace or delete a note: only GET and POST are offered", async () => {
  const dir = await inboxWith(["a.md"]);
  for (const method of ["PUT", "PATCH", "DELETE"] as const) {
    const response = await buildApp(dir).inject({ method, url: "/memory/inbox" });
    assert.equal(response.statusCode, 404);
  }
});

test("slugFor keeps letters and numbers, and joins everything else with single hyphens", () => {
  assert.equal(slugFor("Leeds v Burnley: notes!"), "leeds-v-burnley-notes");
  assert.equal(slugFor("  House plans -- April 2028  "), "house-plans-april-2028");
});

test("slugFor turns accented letters into plain ones", () => {
  assert.equal(slugFor("Café crème"), "cafe-creme");
});

test("slugFor can never produce a path", () => {
  assert.equal(slugFor("../../etc/passwd"), "etc-passwd");
  assert.equal(slugFor("..\\windows\\notes"), "windows-notes");
  assert.equal(slugFor("/absolute/path"), "absolute-path");
});

test("slugFor falls back to note when nothing usable is left", () => {
  assert.equal(slugFor("!!!"), "note");
  assert.equal(slugFor("..."), "note");
  assert.equal(slugFor("日本語"), "note");
});

test("slugFor keeps names short and never ends on a hyphen", () => {
  const slug = slugFor("a".repeat(59) + " b" + "c".repeat(30));
  assert.ok(slug.length <= 60);
  assert.ok(!slug.endsWith("-"));
});

test("saveNote names the file after the London date and the title, and writes the text exactly", async () => {
  const dir = await inboxWith([]);
  const name = await saveNote(dir, { title: "Test note", text: "# Test\n\nLine two\n" }, lateJulyNight);
  assert.equal(name, "2026-07-02-test-note.md");
  assert.equal(await readFile(join(dir, name), "utf8"), "# Test\n\nLine two\n");
});

test("saveNote never overwrites: a taken name gets -2, then -3", async () => {
  const dir = await inboxWith(["2026-07-02-test-note.md"]);
  const second = await saveNote(dir, { title: "Test note", text: "second" }, lateJulyNight);
  const third = await saveNote(dir, { title: "Test note", text: "third" }, lateJulyNight);
  assert.deepEqual([second, third], ["2026-07-02-test-note-2.md", "2026-07-02-test-note-3.md"]);
  assert.equal(await readFile(join(dir, "2026-07-02-test-note.md"), "utf8"), "# a note\n");
});

test("saveNote gives a clear error when the inbox can't be written to", async () => {
  await assert.rejects(saveNote(join(tmpdir(), "no-such-inbox-here"), { title: "x", text: "y" }, lateJulyNight), {
    message: "Couldn't save the note",
  });
});

test("POST /memory/inbox saves the note and says what it was called and how many are waiting", async () => {
  const dir = await inboxWith(["README.md", "older.md"]);
  const response = await upload(buildApp(dir), { title: "From my phone", text: "Remember the bins." });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), { saved: "2026-07-02-from-my-phone.md", waiting: 2 });
  assert.equal(await readFile(join(dir, "2026-07-02-from-my-phone.md"), "utf8"), "Remember the bins.");
});

test("with the inbox count switched off, the reply leaves the count out", async () => {
  const dir = await inboxWith([]);
  const response = await upload(buildApp(dir, { ...allOn, memoryInbox: false }), { title: "x", text: "y" });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), { saved: "2026-07-02-x.md" });
});

test("switched off, uploads are refused and nothing is written", async () => {
  const dir = await inboxWith([]);
  const response = await upload(buildApp(dir, { ...allOn, memoryUpload: false, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true }), { title: "x", text: "y" });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "Note uploads are switched off" });
  assert.deepEqual(await readdir(dir), []);
});

for (const [label, body] of Object.entries({
  "no title": { text: "y" },
  "no text": { title: "x" },
  "an empty title": { title: "", text: "y" },
  "text that's only spaces": { title: "x", text: "   \n  " },
  "a title over 80 characters": { title: "t".repeat(81), text: "y" },
  "text over 20,000 characters": { title: "x", text: "y".repeat(20_001) },
  "a null byte": { title: "x", text: "before\u0000after" },
  "an escape character": { title: "x", text: "\u001b[31mred" },
  "a list instead of a note": [{ title: "x", text: "y" }],
})) {
  test(`an upload with ${label} is refused and nothing is written`, async () => {
    const dir = await inboxWith([]);
    const response = await upload(buildApp(dir), body);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(await readdir(dir), []);
  });
}

test("tabs and newlines are fine in a note", async () => {
  const dir = await inboxWith([]);
  const response = await upload(buildApp(dir), { title: "x", text: "a\tb\r\nc\n" });
  assert.equal(response.statusCode, 201);
});

test("text of exactly 20,000 characters is allowed", async () => {
  const dir = await inboxWith([]);
  const response = await upload(buildApp(dir), { title: "x", text: "y".repeat(20_000) });
  assert.equal(response.statusCode, 201);
});

test("a body much bigger than any note is refused before it's read", async () => {
  const dir = await inboxWith([]);
  const response = await upload(buildApp(dir), { title: "x", text: "y".repeat(200_000) });
  assert.equal(response.statusCode, 413);
  assert.deepEqual(await readdir(dir), []);
});

test("an upload can't choose its own file name or folder", async () => {
  const dir = await inboxWith([]);
  const response = await upload(buildApp(dir), { title: "../../outside", text: "y", name: "../evil.md", path: "/tmp" });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(await readdir(dir), ["2026-07-02-outside.md"]);
});

test("the same title twice makes two notes rather than replacing the first", async () => {
  const dir = await inboxWith([]);
  const app = buildApp(dir);
  await upload(app, { title: "Same", text: "first" });
  await upload(app, { title: "Same", text: "second" });
  assert.deepEqual((await readdir(dir)).sort(), ["2026-07-02-same-2.md", "2026-07-02-same.md"]);
  assert.equal(await readFile(join(dir, "2026-07-02-same.md"), "utf8"), "first");
});