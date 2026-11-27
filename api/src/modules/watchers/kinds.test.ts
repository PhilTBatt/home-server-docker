import assert from "node:assert/strict";
import { test } from "node:test";
import { describe, expiredNotification, firedNotification, freePercent, happened, hoursDefault, hoursLongest, kinds, readAsked, sameWatch, services, sourceOf, type WatchFor } from "./kinds.js";

const created = Date.parse("2026-11-26T12:00:00.500Z");

test("there are exactly three kinds of watcher and two services, fixed in the code", () => {
  assert.deepEqual(kinds, ["download-finished", "disk-free-below", "service-answering"]);
  assert.deepEqual(services, ["qbittorrent", "jellyfin"]);
  assert.equal(hoursDefault, 24);
  assert.equal(hoursLongest, 168);
});

test("each kind is read with its one field, and lasts 24 hours unless hours says otherwise", () => {
  assert.deepEqual(readAsked({ kind: "download-finished", name: "Alpha Beta" }), { watch: { kind: "download-finished", name: "Alpha Beta" }, hours: 24 });
  assert.deepEqual(readAsked({ kind: "disk-free-below", percent: 15, hours: 1 }), { watch: { kind: "disk-free-below", percent: 15 }, hours: 1 });
  assert.deepEqual(readAsked({ kind: "service-answering", service: "jellyfin", hours: 168 }), { watch: { kind: "service-answering", service: "jellyfin" }, hours: 168 });
  assert.deepEqual(readAsked({ kind: "service-answering", service: "qbittorrent" }), { watch: { kind: "service-answering", service: "qbittorrent" }, hours: 24 });
  assert.deepEqual(readAsked({ kind: "disk-free-below", percent: 1 }), { watch: { kind: "disk-free-below", percent: 1 }, hours: 24 });
  assert.deepEqual(readAsked({ kind: "disk-free-below", percent: 99 }), { watch: { kind: "disk-free-below", percent: 99 }, hours: 24 });
  assert.deepEqual(readAsked({ kind: "download-finished", name: "Ab" }), { watch: { kind: "download-finished", name: "Ab" }, hours: 24 });
  assert.deepEqual(readAsked({ kind: "download-finished", name: "A".repeat(20) + " " + "B".repeat(19) }), { watch: { kind: "download-finished", name: "A".repeat(20) + " " + "B".repeat(19) }, hours: 24 });
});

test("anything but an object with a known kind is refused", () => {
  for (const body of [null, undefined, "kind=disk-free-below", 5, [{ kind: "disk-free-below", percent: 10 }]]) assert.deepEqual(readAsked(body), { refused: "Send a JSON object with a kind" }, String(body));
  for (const kind of [undefined, "", "run-command", "Disk-free-below", "download-finished ", 1]) assert.deepEqual(readAsked({ kind, percent: 10 }), { refused: "kind must be one of download-finished, disk-free-below, service-answering" }, String(kind));
});

test("a field another kind takes, or any other field, is refused without repeating it", () => {
  assert.deepEqual(readAsked({ kind: "disk-free-below", percent: 10, name: "Alpha" }), { refused: "A disk-free-below watcher takes only kind, percent and hours" });
  assert.deepEqual(readAsked({ kind: "download-finished", name: "Alpha", service: "jellyfin" }), { refused: "A download-finished watcher takes only kind, name and hours" });
  assert.deepEqual(readAsked({ kind: "service-answering", service: "jellyfin", command: "rm" }), { refused: "A service-answering watcher takes only kind, service and hours" });
  const refused = readAsked({ kind: "disk-free-below", percent: 10, "$(reboot)": 1 });
  assert.ok("refused" in refused && !refused.refused.includes("reboot"));
});

test("hours must be a whole number from 1 to 168", () => {
  for (const hours of [0, 169, 1.5, -1, "24", null, Number.NaN, Infinity]) assert.deepEqual(readAsked({ kind: "disk-free-below", percent: 10, hours }), { refused: "hours must be a whole number from 1 to 168" }, String(hours));
});

test("percent must be a whole number from 1 to 99", () => {
  for (const percent of [0, 100, 15.5, -5, "15", undefined, null]) assert.deepEqual(readAsked({ kind: "disk-free-below", percent }), { refused: "percent must be a whole number from 1 to 99" }, String(percent));
});

test("service must be one of the two the hub already asks", () => {
  for (const service of ["sonarr", "Jellyfin", "", undefined, "http://jellyfin:8096"]) assert.deepEqual(readAsked({ kind: "service-answering", service }), { refused: "service must be one of qbittorrent, jellyfin" }, String(service));
});

test("a download's name is short plain text only, never anything a shell would read, and the refusal never repeats it", () => {
  const plain = "name must be 2 to 40 characters of letters, digits, single spaces and ' - . , ( ) & / + : _, with no space at either end";
  for (const name of ["A", "", "A".repeat(41), " Alpha", "Alpha ", "Alpha; reboot", "$(reboot)", "`id`", "Alpha\nBeta", 'Say "hi"', "Alpha|Beta", "Alpha>out", "Alpha*", "Ünïcode", "Alpha  Beta", 42, null, ["Alpha"]]) {
    const refused = readAsked({ kind: "download-finished", name });
    assert.deepEqual(refused, { refused: plain }, String(name));
  }
});

test("a download's name that could be a pasted key or token is refused", () => {
  for (const name of ["ghp_abc123def456ghi789", "tskey abcdef123456", "A".repeat(21)]) assert.deepEqual(readAsked({ kind: "download-finished", name }), { refused: "name was refused because it could be a key or token" }, name);
  assert.ok("watch" in readAsked({ kind: "download-finished", name: "Alpha 1080p" }));
});

test("the same watch is spotted whatever the case of a name, and different numbers or kinds are different", () => {
  const download: WatchFor = { kind: "download-finished", name: "Alpha" };
  assert.equal(sameWatch(download, { kind: "download-finished", name: "ALPHA" }), true);
  assert.equal(sameWatch(download, { kind: "download-finished", name: "Alpha 2" }), false);
  assert.equal(sameWatch({ kind: "disk-free-below", percent: 10 }, { kind: "disk-free-below", percent: 10 }), true);
  assert.equal(sameWatch({ kind: "disk-free-below", percent: 10 }, { kind: "disk-free-below", percent: 11 }), false);
  assert.equal(sameWatch({ kind: "service-answering", service: "jellyfin" }, { kind: "service-answering", service: "jellyfin" }), true);
  assert.equal(sameWatch({ kind: "service-answering", service: "jellyfin" }, { kind: "service-answering", service: "qbittorrent" }), false);
  assert.equal(sameWatch(download, { kind: "disk-free-below", percent: 10 }), false);
  assert.equal(sameWatch({ kind: "disk-free-below", percent: 10 }, { kind: "service-answering", service: "jellyfin" }), false);
  assert.equal(sameWatch({ kind: "service-answering", service: "jellyfin" }, download), false);
});

test("each watch is described in plain words, with where it's read from", () => {
  assert.equal(describe({ kind: "download-finished", name: "Alpha" }), 'a download matching "Alpha" to finish');
  assert.equal(describe({ kind: "disk-free-below", percent: 15 }), "free disk space to fall below 15%");
  assert.equal(describe({ kind: "service-answering", service: "jellyfin" }), "Jellyfin to answer");
  assert.equal(describe({ kind: "service-answering", service: "qbittorrent" }), "qBittorrent to answer");
  assert.deepEqual([sourceOf({ kind: "download-finished", name: "Alpha" }), sourceOf({ kind: "disk-free-below", percent: 15 }), sourceOf({ kind: "service-answering", service: "jellyfin" })], ["qBittorrent", "the disk", "Jellyfin"]);
});

test("a download has finished when one whose name holds the words, in any case, completed in or after the second the watcher was made", () => {
  const watch: WatchFor = { kind: "download-finished", name: "alpha beta" };
  const finishedAt = (completedAt: number, name = "The Alpha Beta Show") => happened(watch, created, { finished: [{ name, completedAt }] });
  assert.equal(finishedAt(Date.parse("2026-11-26T12:05:00Z")), true);
  assert.equal(finishedAt(Date.parse("2026-11-26T12:00:00Z")), true, "qBittorrent counts in whole seconds");
  assert.equal(finishedAt(Date.parse("2026-11-26T11:59:59Z")), false, "one that finished before you asked doesn't count");
  assert.equal(finishedAt(Date.parse("2026-11-26T12:05:00Z"), "Alpha Gamma Beta"), false);
  assert.equal(happened(watch, created, { finished: [] }), false);
  assert.equal(happened(watch, created, {}), null, "qBittorrent couldn't be read");
});

test("free disk space has fallen when it's under the percentage, not at it, and can't be told without a total", () => {
  const watch: WatchFor = { kind: "disk-free-below", percent: 15 };
  assert.equal(happened(watch, created, { disk: { freeGB: 14, totalGB: 100 } }), true);
  assert.equal(happened(watch, created, { disk: { freeGB: 15, totalGB: 100 } }), false);
  assert.equal(happened(watch, created, { disk: { freeGB: 40, totalGB: 100 } }), false);
  assert.equal(happened(watch, created, { disk: { freeGB: 0, totalGB: 0 } }), null);
  assert.equal(happened(watch, created, {}), null);
  assert.equal(freePercent({ freeGB: 1, totalGB: 8 }), 12.5);
});

test("a service has answered when its check came back, hasn't when it failed, and can't be told when it wasn't asked", () => {
  const watch: WatchFor = { kind: "service-answering", service: "jellyfin" };
  assert.equal(happened(watch, created, { answering: { jellyfin: true } }), true);
  assert.equal(happened(watch, created, { answering: { jellyfin: false, qbittorrent: true } }), false);
  assert.equal(happened(watch, created, { answering: { qbittorrent: true } }), null);
  assert.equal(happened(watch, created, {}), null);
});

test("a fired watch sends one notification in plain words, naming only what you asked about", () => {
  assert.deepEqual(firedNotification({ kind: "download-finished", name: "Alpha" }, { finished: [{ name: "Alpha.Secret.Release.Name", completedAt: created }] }), { title: "Home Hub: download finished", message: 'A download matching "Alpha" has finished.', tags: "bell" });
  assert.deepEqual(firedNotification({ kind: "disk-free-below", percent: 15 }, { disk: { freeGB: 149, totalGB: 1000 } }), { title: "Home Hub: free disk space below 15%", message: "Free disk space is down to 149 of 1000 GB (14%), below the 15% you asked about.", tags: "bell" });
  assert.deepEqual(firedNotification({ kind: "disk-free-below", percent: 15 }, {}), { title: "Home Hub: free disk space below 15%", message: "Free disk space is down to 0 of 0 GB (0%), below the 15% you asked about.", tags: "bell" });
  assert.deepEqual(firedNotification({ kind: "service-answering", service: "qbittorrent" }, {}), { title: "Home Hub: qBittorrent is answering", message: "qBittorrent answered the hub's check.", tags: "bell" });
});

test("an expired watch says it didn't happen in days or hours, low priority, and whether the last check couldn't read its source", () => {
  const disk: WatchFor = { kind: "disk-free-below", percent: 15 };
  assert.deepEqual(expiredNotification(disk, 24, false), { title: "Home Hub: stopped watching", message: "Stopped watching for free disk space to fall below 15%: it didn't happen within 1 day.", tags: "hourglass", priority: 2 });
  const message = (hours: number) => expiredNotification(disk, hours, false).message.split("within ")[1];
  assert.deepEqual([1, 5, 36, 48, 168].map(message), ["1 hour.", "5 hours.", "36 hours.", "2 days.", "7 days."]);
  assert.equal(expiredNotification({ kind: "download-finished", name: "Alpha" }, 2, true).message, 'Stopped watching for a download matching "Alpha" to finish: it didn\'t happen within 2 hours. The last check couldn\'t read qBittorrent.');
});
