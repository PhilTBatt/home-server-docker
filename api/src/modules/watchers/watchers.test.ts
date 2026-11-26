import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finished } from "../media/routes.js";
import type { Notification } from "../notify/notifier.js";
import type { Asked, Disk } from "./kinds.js";
import { checkEveryMs, createWatchers, idPattern, mostWatchers, readWaitMs, type WatchSources } from "./watchers.js";

const start = new Date("2026-11-26T12:00:00Z");
const later = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const download = (name = "Alpha", hours = 24): Asked => ({ watch: { kind: "download-finished", name }, hours });
const disk = (percent = 15, hours = 24): Asked => ({ watch: { kind: "disk-free-below", percent }, hours });
const service = (name: "jellyfin" | "qbittorrent" = "jellyfin", hours = 24): Asked => ({ watch: { kind: "service-answering", service: name }, hours });

function rig(options: { most?: number; waitMs?: number; ids?: string[] } = {}) {
  const reads = { finished: 0, disk: 0, qbittorrent: 0, jellyfin: 0 };
  const state = {
    finished: [] as Finished[] | Error,
    disk: { freeGB: 50, totalGB: 100 } as Disk | Error,
    qbittorrent: true as boolean | "never",
    jellyfin: true as boolean | "never",
    sendFails: false,
  };
  const sent: Notification[] = [];
  const answer = (name: "qbittorrent" | "jellyfin") => async (signal: AbortSignal) => {
    reads[name]++;
    const now = state[name];
    if (now === "never") return new Promise<unknown>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    if (!now) throw new Error(`${name} replied 502`);
    return {};
  };
  const sources: WatchSources = {
    finished: async () => {
      reads.finished++;
      if (state.finished instanceof Error) throw state.finished;
      return state.finished;
    },
    disk: async () => {
      reads.disk++;
      if (state.disk instanceof Error) throw state.disk;
      return state.disk;
    },
    answering: { qbittorrent: answer("qbittorrent"), jellyfin: answer("jellyfin") },
  };
  const ids = [...(options.ids ?? [])];
  let counter = 0;
  const watchers = createWatchers({
    sources,
    send: async (notification) => {
      if (state.sendFails) throw new Error("ntfy replied 500");
      sent.push(notification);
    },
    makeId: () => ids.shift() ?? `0000000${counter++}`.slice(-8),
    most: options.most,
    waitMs: options.waitMs ?? 200,
  });
  return { watchers, reads, state, sent, sources };
}

function added(result: ReturnType<ReturnType<typeof createWatchers>["add"]>) {
  assert.ok("added" in result, JSON.stringify(result));
  return result.added;
}

test("it checks about once a minute, waits up to 8 seconds for a read, and keeps at most 10 at once", () => {
  assert.equal(checkEveryMs, 60_000);
  assert.equal(readWaitMs, 8_000);
  assert.equal(mostWatchers, 10);
  assert.ok(idPattern.test("0a1b2c3d") && !idPattern.test("0A1B2C3D") && !idPattern.test("0a1b2c3") && !idPattern.test("0a1b2c3d4"));
});

test("an added watcher is listed with its id, what it waits for, when it was made and when it gives up", () => {
  const { watchers } = rig({ ids: ["0a1b2c3d"] });
  const view = added(watchers.add(disk(15, 2), start));
  assert.deepEqual(view, { kind: "disk-free-below", percent: 15, id: "0a1b2c3d", what: "free disk space to fall below 15%", hours: 2, createdAt: "2026-11-26T12:00:00.000Z", expiresAt: "2026-11-26T14:00:00.000Z", lastCheck: null, waitingToSend: false });
  added(watchers.add(download("Beta"), later(1)));
  assert.deepEqual(watchers.list().map((watcher) => watcher.what), ["free disk space to fall below 15%", 'a download matching "Beta" to finish']);
});

test("the same watch can't be added twice, and no more than the most at once", () => {
  const { watchers } = rig({ most: 2 });
  added(watchers.add(download("Alpha"), start));
  assert.deepEqual(watchers.add(download("ALPHA", 5), start), { refused: "That's already being watched" });
  added(watchers.add(disk(10), start));
  assert.deepEqual(watchers.add(service(), start), { refused: "2 things are already being watched, the most at once: cancel one first" });
  assert.equal(watchers.list().length, 2);
});

test("ids are 8 lowercase hex characters, never repeated even if the maker repeats one or makes a bad one", () => {
  const { watchers } = rig({ ids: ["0a1b2c3d", "0a1b2c3d", "NOT-AN-ID"] });
  const ids = [added(watchers.add(download("Alpha"), start)).id, added(watchers.add(download("Beta"), start)).id, added(watchers.add(download("Gamma"), start)).id];
  assert.equal(ids[0], "0a1b2c3d");
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.match(id, idPattern);
  const real = createWatchers({ sources: rig().sources, send: async () => undefined });
  assert.match(added(real.add(download(), start)).id, idPattern);
});

test("cancelling takes a watcher away by id, and an unknown id cancels nothing", () => {
  const { watchers } = rig({ ids: ["0a1b2c3d"] });
  added(watchers.add(disk(), start));
  assert.equal(watchers.cancel("ffffffff"), false);
  assert.equal(watchers.cancel("0a1b2c3d"), true);
  assert.equal(watchers.cancel("0a1b2c3d"), false);
  assert.deepEqual(watchers.list(), []);
});

test("with nothing watched a check reads nothing at all", async () => {
  const { watchers, reads } = rig();
  assert.equal(await watchers.run(start), "nothing watched");
  assert.deepEqual(reads, { finished: 0, disk: 0, qbittorrent: 0, jellyfin: 0 });
});

test("a check reads each source it needs once, and only those", async () => {
  const { watchers, reads, state } = rig();
  state.jellyfin = false;
  added(watchers.add(download("Alpha"), start));
  added(watchers.add(download("Beta"), start));
  added(watchers.add(service("jellyfin"), start));
  assert.deepEqual(await watchers.run(later(1)), { fired: 0, expired: 0, unsent: 0, dropped: 0 });
  assert.deepEqual(reads, { finished: 1, disk: 0, qbittorrent: 0, jellyfin: 1 });
});

test("a download finishing after you asked fires one notification and the watcher is gone", async () => {
  const { watchers, state, sent } = rig();
  added(watchers.add(download("alpha"), start));
  state.finished = [{ name: "Alpha old", completedAt: start.getTime() - 60_000 }];
  await watchers.run(later(1));
  assert.equal(sent.length, 0, "one that finished before you asked doesn't count");
  assert.deepEqual(watchers.list()[0].lastCheck, { at: "2026-11-26T12:01:00.000Z", ok: true });
  state.finished = [...state.finished, { name: "The ALPHA one", completedAt: later(2).getTime() }];
  assert.deepEqual(await watchers.run(later(3)), { fired: 1, expired: 0, unsent: 0, dropped: 0 });
  assert.deepEqual(sent, [{ title: "Home Hub: download finished", message: 'A download matching "alpha" has finished.', tags: "bell" }]);
  assert.deepEqual(watchers.list(), []);
  assert.equal(await watchers.run(later(4)), "nothing watched");
  assert.equal(sent.length, 1);
});

test("free disk space falling below the percentage fires, with the numbers it saw", async () => {
  const { watchers, state, sent } = rig();
  added(watchers.add(disk(15), start));
  await watchers.run(later(1));
  assert.equal(sent.length, 0);
  state.disk = { freeGB: 14, totalGB: 100 };
  await watchers.run(later(2));
  assert.deepEqual(sent.map((notification) => notification.message), ["Free disk space is down to 14 of 100 GB (14%), below the 15% you asked about."]);
  assert.deepEqual(watchers.list(), []);
});

test("a service fires once it answers; not answering is a check that worked, not a failed read", async () => {
  const { watchers, state, sent } = rig();
  state.qbittorrent = false;
  added(watchers.add(service("qbittorrent"), start));
  await watchers.run(later(1));
  assert.deepEqual([sent.length, watchers.list()[0].lastCheck], [0, { at: "2026-11-26T12:01:00.000Z", ok: true }]);
  state.qbittorrent = "never";
  await watchers.run(later(2));
  assert.equal(sent.length, 0, "no answer in time isn't answering");
  state.qbittorrent = true;
  await watchers.run(later(3));
  assert.deepEqual(sent.map((notification) => notification.title), ["Home Hub: qBittorrent is answering"]);
});

test("a source that can't be read neither fires nor removes the watcher, and its last check says so", async () => {
  const { watchers, state, sent } = rig();
  added(watchers.add(download("Alpha"), start));
  added(watchers.add(disk(15), start));
  state.finished = new Error("qBittorrent replied 403");
  state.disk = { freeGB: 1, totalGB: 100 };
  assert.deepEqual(await watchers.run(later(1)), { fired: 1, expired: 0, unsent: 0, dropped: 0 });
  assert.deepEqual(sent.map((notification) => notification.title), ["Home Hub: free disk space below 15%"]);
  assert.deepEqual(watchers.list().map((watcher) => [watcher.what, watcher.lastCheck]), [['a download matching "Alpha" to finish', { at: "2026-11-26T12:01:00.000Z", ok: false }]]);
  state.finished = [{ name: "Alpha", completedAt: later(2).getTime() }];
  await watchers.run(later(3));
  assert.equal(sent.length, 2);
});

test("a source that never answers counts as unread within the wait", async () => {
  const { sources } = rig();
  const stuck = createWatchers({ sources: { ...sources, finished: () => new Promise(() => undefined) }, send: async () => undefined, waitMs: 50 });
  added(stuck.add(download("Alpha"), start));
  const began = performance.now();
  await stuck.run(later(1));
  assert.ok(performance.now() - began < 2_000);
  assert.equal(stuck.list()[0].lastCheck?.ok, false);
});

test("a notification that can't be sent is kept and tried again at the next check, without asking again", async () => {
  const { watchers, state, sent, reads } = rig();
  added(watchers.add(disk(15), start));
  state.disk = { freeGB: 10, totalGB: 100 };
  state.sendFails = true;
  assert.deepEqual(await watchers.run(later(1)), { fired: 0, expired: 0, unsent: 1, dropped: 0 });
  assert.equal(watchers.list()[0].waitingToSend, true);
  state.disk = { freeGB: 90, totalGB: 100 };
  state.sendFails = false;
  assert.deepEqual(await watchers.run(later(2)), { fired: 1, expired: 0, unsent: 0, dropped: 0 });
  assert.equal(reads.disk, 1, "it doesn't read the disk again for one that already happened");
  assert.deepEqual(sent.map((notification) => notification.message), ["Free disk space is down to 10 of 100 GB (10%), below the 15% you asked about."]);
  assert.deepEqual(watchers.list(), []);
});

test("a watcher that never happens goes at its time with one low-priority note saying so, and not a minute before", async () => {
  const { watchers, sent } = rig();
  added(watchers.add(disk(15, 1), start));
  assert.deepEqual(await watchers.run(later(59)), { fired: 0, expired: 0, unsent: 0, dropped: 0 });
  assert.equal(watchers.list().length, 1);
  assert.deepEqual(await watchers.run(later(60)), { fired: 0, expired: 1, unsent: 0, dropped: 0 });
  assert.deepEqual(sent, [{ title: "Home Hub: stopped watching", message: "Stopped watching for free disk space to fall below 15%: it didn't happen within 1 hour.", tags: "hourglass", priority: 2 }]);
  assert.deepEqual(watchers.list(), []);
});

test("the note on giving up says when the last check couldn't read the source", async () => {
  const { watchers, state, sent } = rig();
  added(watchers.add(download("Alpha", 1), start));
  state.finished = new Error("qBittorrent replied 403");
  await watchers.run(later(61));
  assert.equal(sent[0].message, 'Stopped watching for a download matching "Alpha" to finish: it didn\'t happen within 1 hour. The last check couldn\'t read qBittorrent.');
});

test("something that happens on the check at its time still fires rather than giving up", async () => {
  const { watchers, state, sent } = rig();
  added(watchers.add(disk(15, 1), start));
  state.disk = { freeGB: 5, totalGB: 100 };
  assert.deepEqual(await watchers.run(later(60)), { fired: 1, expired: 0, unsent: 0, dropped: 0 });
  assert.equal(sent[0].title, "Home Hub: free disk space below 15%");
});

test("one that happened but couldn't be sent by its time is dropped without a note that it didn't happen", async () => {
  const { watchers, state, sent } = rig();
  added(watchers.add(disk(15, 1), start));
  state.disk = { freeGB: 5, totalGB: 100 };
  state.sendFails = true;
  await watchers.run(later(30));
  assert.deepEqual(await watchers.run(later(60)), { fired: 0, expired: 0, unsent: 1, dropped: 1 });
  assert.deepEqual([sent, watchers.list()], [[], []]);
});

test("a note on giving up that can't be sent isn't tried again, and the watcher still goes", async () => {
  const { watchers, state, sent } = rig();
  added(watchers.add(disk(15, 1), start));
  state.sendFails = true;
  assert.deepEqual(await watchers.run(later(60)), { fired: 0, expired: 1, unsent: 1, dropped: 0 });
  state.sendFails = false;
  assert.equal(await watchers.run(later(61)), "nothing watched");
  assert.deepEqual([sent, watchers.list()], [[], []]);
});

function heldDisk(free: number) {
  let release = () => {};
  let wasAsked = () => {};
  const asked = new Promise<void>((resolve) => (wasAsked = resolve));
  let calls = 0;
  const disk = () =>
    new Promise<Disk>((resolve) => {
      if (calls++ > 0) return resolve({ freeGB: free, totalGB: 100 });
      release = () => resolve({ freeGB: free, totalGB: 100 });
      wasAsked();
    });
  return { disk, asked, release: () => release() };
}

test("a check that starts while one is still running does nothing", async () => {
  const held = heldDisk(50);
  const watchers = createWatchers({
    sources: { finished: async () => [], disk: held.disk, answering: { qbittorrent: async () => ({}), jellyfin: async () => ({}) } },
    send: async () => undefined,
  });
  added(watchers.add(disk(15), start));
  const first = watchers.run(later(1));
  await held.asked;
  assert.equal(await watchers.run(later(1)), "busy");
  held.release();
  assert.deepEqual(await first, { fired: 0, expired: 0, unsent: 0, dropped: 0 });
  assert.deepEqual(await watchers.run(later(2)), { fired: 0, expired: 0, unsent: 0, dropped: 0 });
});

test("one cancelled while a check is reading isn't sent", async () => {
  const held = heldDisk(1);
  const sent: Notification[] = [];
  const watchers = createWatchers({
    sources: { finished: async () => [], disk: held.disk, answering: { qbittorrent: async () => ({}), jellyfin: async () => ({}) } },
    send: async (notification) => void sent.push(notification),
    makeId: () => "0a1b2c3d",
  });
  added(watchers.add(disk(15), start));
  const running = watchers.run(later(1));
  await held.asked;
  watchers.cancel("0a1b2c3d");
  held.release();
  assert.deepEqual(await running, { fired: 0, expired: 0, unsent: 0, dropped: 0 });
  assert.deepEqual(sent, []);
});
