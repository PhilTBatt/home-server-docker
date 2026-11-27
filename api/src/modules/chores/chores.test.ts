import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { choreJobFor, createChores, outputLines, pickUpMs, readResult } from "./chores.js";
import { chores } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true };
const now = new Date("2026-11-27T12:00:00.000Z");

async function folder() {
  const dir = await mkdtemp(join(tmpdir(), "chores-"));
  await mkdir(join(dir, "requests"));
  await mkdir(join(dir, "results"));
  return dir;
}

function setUp(dir: string, ids = ["0123456789abcdef", "fedcba9876543210", "00000000000000aa"]) {
  const logs: { level: string; message: string; fields: Record<string, unknown> }[] = [];
  const made = [...ids];
  const kept = createChores({
    dir,
    makeId: () => made.shift() ?? "ffffffffffffffff",
    log: { info: (fields, message) => logs.push({ level: "info", message, fields }), warn: (fields, message) => logs.push({ level: "warn", message, fields }) },
  });
  return { kept, logs };
}

test("a request writes one file naming only the job, readable only by the API's user, and answers with its id", async () => {
  const dir = await folder();
  const { kept, logs } = setUp(dir);
  const asked = await kept.request("rebuild-api", new Date());
  assert.deepEqual(Object.keys(asked), ["id", "job", "requestedAt"]);
  assert.deepEqual(await readdir(join(dir, "requests")), ["0123456789abcdef.job"]);
  assert.equal(await readFile(join(dir, "requests", "0123456789abcdef.job"), "utf8"), "rebuild-api\n");
  assert.equal((await stat(join(dir, "requests", "0123456789abcdef.job"))).mode & 0o777, 0o600);
  assert.deepEqual(logs.at(-1), { level: "info", message: "chore requested", fields: { id: "0123456789abcdef", job: "rebuild-api" } });
});

test("a job that isn't on the list is never written", async () => {
  const dir = await folder();
  const { kept } = setUp(dir);
  for (const job of ["reboot", "rebuild-api\nrun-tests", "../x", ""]) assert.deepEqual(await kept.request(job, now), { refused: "That isn't a chore", status: 409 }, job);
  assert.deepEqual(await readdir(join(dir, "requests")), []);
});

test("while a request waits for the runner, another is refused", async () => {
  const dir = await folder();
  const { kept, logs } = setUp(dir);
  await kept.request("run-tests", new Date());
  assert.deepEqual(await kept.request("pull-images", new Date()), { refused: "A chore is already waiting for the runner to pick it up", status: 409 });
  assert.ok(logs.some((line) => line.message === "chore refused: one is waiting for the runner"));
  assert.deepEqual((await kept.result("0123456789abcdef"))?.state, "waiting");
});

test("a request the runner never picks up is removed after 2 minutes, says why, and lets the next through", async () => {
  const dir = await folder();
  const { kept, logs } = setUp(dir);
  await kept.request("run-tests", new Date());
  const old = (Date.now() - pickUpMs - 1000) / 1000;
  await utimes(join(dir, "requests", "0123456789abcdef.job"), old, old);
  const next = await kept.request("pull-images", new Date());
  assert.equal("id" in next && next.id, "fedcba9876543210");
  assert.deepEqual(await readdir(join(dir, "requests")), ["fedcba9876543210.job"]);
  const dropped = await kept.result("0123456789abcdef");
  assert.deepEqual([dropped?.state, dropped?.why], ["dropped", "the runner didn't pick it up within 2 minutes: is home-hub-runner@<user>.path enabled?"]);
  assert.ok(logs.some((line) => line.level === "warn" && line.message.includes("never picked up")));
});

test("while the runner says one is running, another is refused, until its time limit is well past", async () => {
  const dir = await folder();
  const { kept } = setUp(dir);
  await writeFile(join(dir, "results", "aaaaaaaaaaaaaaaa.json"), JSON.stringify({ id: "aaaaaaaaaaaaaaaa", job: "rebuild-api", state: "running", startedAt: "2026-11-27T11:50:00Z", limitSeconds: 900 }));
  assert.deepEqual(await kept.request("run-tests", now), { refused: "rebuild-api is already running, since 2026-11-27T11:50:00Z: one at a time", status: 409 });
  const after = await kept.request("run-tests", new Date("2026-11-27T12:07:01.000Z"));
  assert.equal("id" in after, true, "a run that never finished doesn't block for ever");
});

test("a finished result is read back with its numbers and the last lines of its output", async () => {
  const dir = await folder();
  const { kept } = setUp(dir);
  await writeFile(join(dir, "results", "0123456789abcdef.json"), JSON.stringify({ id: "0123456789abcdef", job: "run-tests", state: "done", exit: 1, timedOut: false, seconds: 312, startedAt: "2026-11-27T11:50:00Z", endedAt: "2026-11-27T11:55:12Z", limitSeconds: 2400 }));
  await writeFile(join(dir, "results", "0123456789abcdef.out"), "== api\n\u001b[1mℹ tests 10\u001b[0m\n\nℹ fail 1\u0007\n");
  assert.deepEqual(await kept.result("0123456789abcdef"), { id: "0123456789abcdef", state: "done", job: "run-tests", exit: 1, timedOut: false, seconds: 312, startedAt: "2026-11-27T11:50:00Z", endedAt: "2026-11-27T11:55:12Z", limitSeconds: 2400, why: null, output: ["== api", "ℹ tests 10", "ℹ fail 1"] });
  assert.equal(await kept.result("1111111111111111"), null);
});

test("a refused result and one that can't be read say so", async () => {
  const dir = await folder();
  const { kept } = setUp(dir);
  await writeFile(join(dir, "results", "0123456789abcdef.json"), JSON.stringify({ id: "0123456789abcdef", state: "refused", why: "that job isn't on the runner's list", endedAt: "2026-11-27T11:55:12Z" }));
  assert.deepEqual([(await kept.result("0123456789abcdef"))?.state, (await kept.result("0123456789abcdef"))?.why], ["refused", "that job isn't on the runner's list"]);
  await writeFile(join(dir, "results", "fedcba9876543210.json"), "{broken");
  assert.deepEqual((await kept.result("fedcba9876543210"))?.why, "the result file couldn't be read");
});

test("readResult takes only a result for the id asked, and only known jobs, states and numbers", () => {
  const id = "0123456789abcdef";
  assert.equal(readResult(id, JSON.stringify({ id: "fedcba9876543210", state: "done" })), null);
  assert.equal(readResult(id, JSON.stringify({ id, state: "exploded" })), null);
  assert.deepEqual(readResult(id, JSON.stringify({ id, state: "done", job: "rm -rf /", exit: -1, seconds: 1.5, startedAt: "yesterday", why: "a\u0000b‮c" }))?.job, null);
  const odd = readResult(id, JSON.stringify({ id, state: "done", job: "rm -rf /", exit: -1, seconds: 1.5, startedAt: "yesterday", why: "a\u0000b‮c" }));
  assert.deepEqual([odd?.exit, odd?.seconds, odd?.startedAt, odd?.why], [null, null, null, "abc"]);
});

test("outputLines keeps at most 4,000 bytes and 40 lines, with control and hidden characters taken out", () => {
  const lines = outputLines(Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"));
  assert.equal(lines.length, 40);
  assert.equal(lines.at(-1), "line 99");
  assert.ok(Buffer.byteLength(outputLines("x".repeat(10_000)).join("\n")) <= 4_000);
  assert.deepEqual(outputLines("ok‮hidden​\n"), ["okhidden"]);
});

test("a request can't be written when the folder isn't there, and says so", async () => {
  const { kept, logs } = setUp(join(tmpdir(), "no-such-chores-folder"));
  assert.deepEqual(await kept.request("rebuild-api", now), { refused: "Couldn't write the request: is chores/requests there and mounted?", status: 500 });
  assert.ok(logs.some((line) => line.level === "warn"));
});

async function buildApp(dir: string, features = allOn) {
  const { kept } = setUp(dir);
  const app = Fastify();
  app.register(chores, { prefix: "/chores", features, chores: kept, now: () => new Date() });
  return app;
}

test("POST /chores/<job> asks for a job on the list and GET /chores/<id> reads its result", async () => {
  const dir = await folder();
  const app = await buildApp(dir);
  const asked = await app.inject({ method: "POST", url: "/chores/pull-images" });
  assert.deepEqual([asked.statusCode, asked.json().id, asked.json().job], [200, "0123456789abcdef", "pull-images"]);
  assert.deepEqual((await app.inject({ method: "GET", url: "/chores/0123456789abcdef" })).json().state, "waiting");
  const again = await app.inject({ method: "POST", url: "/chores/run-tests" });
  assert.deepEqual([again.statusCode, again.json()], [409, { error: "A chore is already waiting for the runner to pick it up" }]);
});

test("the routes refuse a job not on the list, an odd id, and an unknown one, and say when they're switched off", async () => {
  const dir = await folder();
  const app = await buildApp(dir);
  const odd = await app.inject({ method: "POST", url: "/chores/reboot" });
  assert.deepEqual([odd.statusCode, odd.json()], [400, { error: "job must be one of rebuild-api, run-tests, pull-images, or session-start-<name> or session-stop-<name> for a session the runner knows" }]);
  assert.deepEqual((await app.inject({ method: "GET", url: "/chores/xyz" })).json(), { error: "id must be a chore's id, as POST /chores/<job> gave it" });
  assert.deepEqual((await app.inject({ method: "GET", url: "/chores/1111111111111111" })).json(), { error: "No chore with that id" });
  assert.deepEqual(await readdir(join(dir, "requests")), []);
  const off = await buildApp(dir, { ...allOn, chores: false });
  for (const [method, url] of [["POST", "/chores/rebuild-api"], ["GET", "/chores/0123456789abcdef"]] as const) {
    const reply = await off.inject({ method, url });
    assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Chores are switched off" }]);
  }
  assert.deepEqual(await readdir(join(dir, "requests")), []);
});

test("session jobs are chores only while sessions are on, and only with a plain name", () => {
  const off = choreJobFor(false);
  const on = choreJobFor(true);
  assert.deepEqual(["rebuild-api", "session-start-docker", "session-stop-brain"].map(off), [true, false, false]);
  assert.deepEqual(["rebuild-api", "session-start-docker", "session-stop-brain", "session-start-a-b-9"].map(on), [true, true, true, true]);
  for (const job of ["session-start-", "session-start-Docker", "session-start-x y", "session-restart-docker", "session-start-docker;ls", `session-start-${"a".repeat(21)}`, "session-start-../x"]) assert.equal(on(job), false, job);
});

test("with sessions on, a session job is written like any chore, and with them off it's a 400 naming only the fixed jobs", async () => {
  const dir = await folder();
  const app = Fastify();
  app.register(chores, { prefix: "/chores", features: allOn, chores: createChores({ dir, jobs: choreJobFor(true), makeId: () => "0123456789abcdef" }) });
  assert.equal((await app.inject({ method: "POST", url: "/chores/session-start-docker" })).json().job, "session-start-docker");
  assert.equal(await readFile(join(dir, "requests", "0123456789abcdef.job"), "utf8"), "session-start-docker\n");
  const offDir = await folder();
  const off = Fastify();
  off.register(chores, { prefix: "/chores", features: { ...allOn, sessions: false }, chores: createChores({ dir: offDir, jobs: choreJobFor(false) }) });
  const refused = await off.inject({ method: "POST", url: "/chores/session-start-docker" });
  assert.deepEqual([refused.statusCode, refused.json()], [400, { error: "job must be one of rebuild-api, run-tests, pull-images" }]);
  assert.deepEqual(await readdir(join(offDir, "requests")), []);
});

test("a session job's result keeps its name, and a job no list has is dropped from a result", () => {
  const id = "0123456789abcdef";
  assert.equal(readResult(id, JSON.stringify({ id, state: "done", job: "session-stop-brain" }))?.job, "session-stop-brain");
  assert.equal(readResult(id, JSON.stringify({ id, state: "done", job: "session-stop-Brain!" }))?.job, null);
});
