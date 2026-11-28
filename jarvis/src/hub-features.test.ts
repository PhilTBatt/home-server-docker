import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { changedFeatures, factsTold, featuresChangeLine, featuresLine, featuresUnreachableNote, hubFeatureNames, hubFeaturesReader, readHubFeatures, relevantFeatures, watchHubFeatures, withFactsChange, type FeaturesEvent, type HubFeatures } from "./hub-features.js";

const allOn: HubFeatures = { reminders: true, spotify: true, talk: true, wall: true, modes: true, trainAlerts: true };
const hubReply = { alerts: true, heartbeat: false, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: false, findPhone: true, trains: true, trainAlerts: false, expiryAlerts: false, watchers: true, catchUp: false, modes: true, reminders: false, chores: false, sessions: false, spotify: true, talk: true, wall: true };

test("the hub's switches are read strictly: every one Jarvis words facts from must be true or false", () => {
  assert.deepEqual(readHubFeatures(hubReply), { reminders: false, spotify: true, talk: true, wall: true, modes: true, trainAlerts: false });
  for (const name of hubFeatureNames) {
    assert.equal(readHubFeatures({ ...hubReply, [name]: "on" }), null, name);
    const { [name]: _gone, ...without } = hubReply;
    assert.equal(readHubFeatures(without), null, name);
  }
});

test("the reader asks GET /system/features with the token and refuses a reply it can't read", { timeout: 5_000 }, async () => {
  let reply: [number, unknown] = [200, hubReply];
  const seen: string[] = [];
  const server = createServer((request, response: ServerResponse) => {
    seen.push(`${request.method} ${request.url} ${request.headers.authorization}`);
    response.writeHead(reply[0], { "content-type": "application/json" });
    response.end(JSON.stringify(reply[1]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const read = hubFeaturesReader("test-token", `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    assert.equal((await read(new AbortController().signal)).reminders, false);
    assert.deepEqual(seen, ["GET /system/features Bearer test-token"]);
    reply = [200, { reminders: 1 }];
    await assert.rejects(read(new AbortController().signal), /couldn't be read/);
    reply = [401, { error: "Unauthorized" }];
    await assert.rejects(read(new AbortController().signal), /the hub said: Unauthorized/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the start-up line names each switch, or says they're taken as on when they couldn't be read", () => {
  assert.equal(featuresLine({ ...allOn, reminders: false }), "hub switches: reminders off, spotify on, talk on, wall on, modes on, trainAlerts on");
  assert.match(featuresLine(null), /couldn't be read, so the live facts take .* as on/);
});

test("a change is only what differs among the switches that matter, with unknown counting as on", () => {
  assert.deepEqual(changedFeatures(allOn, { ...allOn, reminders: false, wall: false }, ["reminders", "spotify"]), ["reminders"]);
  assert.deepEqual(changedFeatures(null, { ...allOn, spotify: false }, hubFeatureNames), ["spotify"]);
  assert.deepEqual(changedFeatures(null, allOn, hubFeatureNames), []);
  assert.deepEqual(changedFeatures(allOn, null, hubFeatureNames), [], "nothing new to go on");
});

test("the line for Claude says which switches changed and that it outranks the live facts, after the question", () => {
  const line = featuresChangeLine(["reminders", "spotify"], { ...allOn, reminders: false });
  assert.equal(line, "[From your own code: since this chat started, the hub's switches changed: the hub's reminders now off, Spotify now on. Go by this over what your live facts say about them.]");
  assert.equal(featuresChangeLine([], allOn), null);
  assert.equal(withFactsChange("What's next?", "[line]"), "What's next?\n\n[line]");
  assert.equal(withFactsChange("What's next?", null), "What's next?");
});

test("a change is told once, and told again when it changes back, so Claude's last word is always right", () => {
  const off = { ...allOn, reminders: false };
  const told = factsTold(allOn);
  assert.equal(told.line(allOn, ["reminders"]), null);
  assert.match(told.line(off, ["reminders"]) ?? "", /the hub's reminders now off/);
  assert.equal(told.line(off, ["reminders"]), null, "said once");
  assert.match(told.line(allOn, ["reminders"]) ?? "", /the hub's reminders now on/, "back on is said too");
  assert.equal(told.line(allOn, ["reminders"]), null);
  assert.equal(told.line({ ...allOn, spotify: false }, ["reminders"]), null, "a switch that doesn't matter here is never told");
  const unknown = factsTold(null);
  assert.equal(unknown.line(allOn, hubFeatureNames), null, "facts written with unknown switches took them as on");
  assert.match(unknown.line(off, hubFeatureNames) ?? "", /reminders now off/);
});

test("which switches matter follows what his facts mention: a guest chat only cares about the wall", () => {
  const settings = { guest: false, reminders: true, hubActions: false, musicChanges: true, phone: false, wall: true, modes: true, trainAlerts: false };
  assert.deepEqual(relevantFeatures(settings), ["reminders", "wall", "modes"]);
  assert.deepEqual(relevantFeatures({ ...settings, reminders: false, hubActions: true }), ["reminders", "spotify", "wall", "modes"]);
  assert.deepEqual(relevantFeatures({ ...settings, guest: true }), ["wall"]);
  assert.deepEqual(relevantFeatures({ ...settings, guest: true, wall: false }), []);
});

test("the watcher reads once at start, then every minute, with a line when they change, fail or come back", { timeout: 5_000 }, async () => {
  const replies: Array<HubFeatures | Error> = [allOn, allOn, { ...allOn, wall: false }, new Error("fetch failed"), new Error("fetch failed"), { ...allOn, wall: false }];
  const stop = new AbortController();
  const waits: number[] = [];
  const watch = watchHubFeatures({
    read: async () => {
      const next = replies.shift();
      if (next === undefined) {
        stop.abort();
        throw new Error("done");
      }
      if (next instanceof Error) throw next;
      return next;
    },
    signal: stop.signal,
    wait: async (ms) => void waits.push(ms),
  });
  await watch.first(new AbortController().signal);
  assert.deepEqual(watch.latest(), allOn);
  const seen: FeaturesEvent[] = [];
  const latestAt: Array<HubFeatures | null> = [];
  for await (const event of watch.events) {
    seen.push(event);
    latestAt.push(watch.latest());
  }
  assert.deepEqual(seen.map((one) => one.line), [featuresLine({ ...allOn, wall: false }), featuresUnreachableNote("fetch failed"), featuresLine({ ...allOn, wall: false })]);
  assert.deepEqual(latestAt, [{ ...allOn, wall: false }, { ...allOn, wall: false }, { ...allOn, wall: false }], "a failure keeps the last ones");
  assert.ok(waits.every((ms) => ms === 60_000));
});

test("a start-up read that fails or takes too long leaves them unknown rather than holding Jarvis up", { timeout: 5_000 }, async () => {
  const failing = watchHubFeatures({ read: async () => Promise.reject(new Error("no")), signal: new AbortController().signal });
  await failing.first(new AbortController().signal);
  assert.equal(failing.latest(), null);
  const slow = watchHubFeatures({ read: (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("slow")))), signal: new AbortController().signal, firstMs: 20 });
  const started = Date.now();
  await slow.first(new AbortController().signal);
  assert.equal(slow.latest(), null);
  assert.ok(Date.now() - started < 1_000);
});
