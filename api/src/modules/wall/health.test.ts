import assert from "node:assert/strict";
import { test } from "node:test";
import type { DoctorReport } from "../system/doctor.js";
import { healthPage, mostOthers } from "./health.js";
import { serverNodes } from "./server-map.js";

function report(checks: DoctorReport["checks"], state: DoctorReport["state"] = "ok"): DoctorReport {
  return { state, summary: "", checkedAt: "2026-11-30T07:00:00.000Z", checks };
}
const status = { uptimeSeconds: 4 * 86400 + 3600, memoryTotalMB: 7800, memoryAvailableMB: 2600, diskTotalGB: 230, diskAvailableGB: 180 };
const fine = report([
  { name: "Disk", state: "ok", detail: "180 of 230 GB free.", next: null },
  { name: "Memory", state: "ok", detail: "2.5 of 7.6 GB available.", next: null },
  { name: "Wi-Fi", state: "ok", detail: "No reconnects in the last 24 hours.", next: null },
  { name: "Backups", state: "ok", detail: "The last good backup was today at 03:10.", next: null },
  { name: "Heartbeat", state: "ok", detail: "The last ping to Healthchecks.io went today at 06:55.", next: null },
  { name: "Phone alerts", state: "ok", detail: "The last alert check, today at 06:58, worked.", next: null },
  { name: "qBittorrent", state: "ok", detail: "Answering, 2 downloads.", next: null },
  { name: "Jellyfin", state: "ok", detail: "Answering, 120 films.", next: null },
]);
const tile = (page: ReturnType<typeof healthPage>, id: string) => page.groups.flatMap((group) => group.tiles).find((one) => one.id === id);

test("every container on the server map is a tile, in four groups, and only what the hub checks has a state", () => {
  const page = healthPage(fine, status);
  assert.equal(page.kind, "health");
  assert.deepEqual(page.groups.map((group) => [group.id, group.title]), [["front", "Front door"], ["media", "Media"], ["watching", "Watching"], ["jarvis", "Jarvis"]]);
  const ids = page.groups.flatMap((group) => group.tiles.map((one) => one.id));
  assert.deepEqual([...ids].sort(), serverNodes.filter((node) => node.group !== "outside" && node.id !== "tailscale").map((node) => node.id).sort());
  assert.deepEqual(tile(page, "caddy"), { id: "caddy", state: "ok", line: "Answering", note: "" });
  assert.deepEqual(tile(page, "jellyfin"), { id: "jellyfin", state: "ok", line: "Answering, 120 films.", note: "" });
  assert.deepEqual(tile(page, "sonarr"), { id: "sonarr", state: "unchecked", line: "Not checked", note: "" });
  assert.deepEqual(tile(page, "mcp"), { id: "mcp", state: "unchecked", line: "Not checked", note: "runs when used" });
  assert.equal(page.unchecked, ids.length - 4);
  assert.deepEqual([page.state, page.headline, page.beat], ["ok", "Everything's healthy", true]);
});

test("the three cards: Uptime Kuma, which the hub doesn't read, and the heartbeat and backups from the server check", () => {
  const page = healthPage(fine, status);
  assert.deepEqual(page.cards, [
    { id: "kuma", title: "Uptime Kuma", state: "unchecked", value: "Not read by the hub", note: "Its own page, uptime.home, has every monitor" },
    { id: "heartbeat", title: "Heartbeat", state: "ok", value: "Pinging", note: "The last ping to Healthchecks.io went today at 06:55." },
    { id: "backups", title: "Backups", state: "ok", value: "OK", note: "The last good backup was today at 03:10." },
  ]);
  assert.deepEqual(page.others, [{ name: "Wi-Fi", state: "ok" }, { name: "Phone alerts", state: "ok" }], "the rest of the server check, without what's shown elsewhere");
});

test("memory, disk and up time are the hub's own readings, as used and total", () => {
  const page = healthPage(fine, status);
  assert.deepEqual([page.memory, page.disk, page.upSeconds, page.memoryState, page.diskState], [{ used: 5200, total: 7800 }, { used: 50, total: 230 }, 4 * 86400 + 3600, "ok", "ok"]);
  const low = healthPage(report([...fine.checks.filter((check) => check.name !== "Disk" && check.name !== "Memory"), { name: "Disk", state: "warn", detail: "40 of 230 GB free, under a fifth.", next: "x" }, { name: "Memory", state: "problem", detail: "Low.", next: "y" }], "problem"), status);
  assert.deepEqual([low.diskState, low.memoryState], ["warn", "problem"], "a disk or memory warning shows on its own row");
  assert.deepEqual([healthPage(null, status).diskState, healthPage(null, status).memoryState], ["unchecked", "unchecked"]);
  const none = healthPage(fine, null);
  assert.deepEqual([none.memory, none.disk, none.upSeconds], [null, null, null]);
  const odd = healthPage(fine, { ...status, memoryAvailableMB: 9000, diskTotalGB: 0, uptimeSeconds: -1 });
  assert.deepEqual([odd.memory, odd.disk, odd.upSeconds], [null, null, null], "readings that can't be right show as unknown, never as a wrong bar");
});

test("problems and things to look at set the headline, and the heartbeat line goes flat when it isn't pinging", () => {
  const warn = healthPage(report([...fine.checks.filter((check) => check.name !== "Heartbeat"), { name: "Heartbeat", state: "warn", detail: "No ping to Healthchecks.io has finished since the API started.", next: "x" }], "warn"), status);
  assert.deepEqual([warn.state, warn.headline, warn.beat], ["warn", "1 thing to look at", false]);
  assert.deepEqual(warn.cards[1], { id: "heartbeat", title: "Heartbeat", state: "warn", value: "Waiting", note: "No ping to Healthchecks.io has finished since the API started." });
  const bad = healthPage(report([...fine.checks.filter((check) => check.name !== "qBittorrent" && check.name !== "Wi-Fi"), { name: "qBittorrent", state: "problem", detail: "Didn't answer: connect ECONNREFUSED 172.18.0.5:8081", next: "docker compose logs qbittorrent" }, { name: "Wi-Fi", state: "warn", detail: "2 reconnects.", next: null }], "problem"), status);
  assert.deepEqual([bad.state, bad.headline], ["problem", "1 problem"]);
  assert.deepEqual(tile(bad, "qbittorrent"), { id: "qbittorrent", state: "problem", line: "Didn't answer: connect ECONNREFUSED 172.18.0.5:80…", note: "" });
  assert.equal(tile(healthPage(report([{ name: "qBittorrent", state: "problem", detail: "Didn't answer: qBittorrent replied 401.", next: null }], "problem"), status), "qbittorrent")?.line, "Didn't answer: qBittorrent replied 401.", "a short reason is kept whole");
  assert.ok(!JSON.stringify(bad).includes("docker compose logs"), "the server check's advice never reaches the page");
  const short = healthPage(report([{ name: "qBittorrent", state: "problem", detail: "Down.", next: "docker compose logs qbittorrent" }, { name: "Heartbeat", state: "problem", detail: "Failed.", next: "docker compose logs api" }, { name: "Backups", state: "problem", detail: "Failed.", next: "journalctl -u home-hub-backup" }], "problem"), status);
  for (const advice of ["docker", "journalctl"]) assert.ok(!JSON.stringify(short).includes(advice), `${advice}, even when the line has room for it`);
  assert.deepEqual(healthPage(report([...fine.checks.filter((check) => check.name !== "qBittorrent"), { name: "qBittorrent", state: "off", detail: "Switched off (X).", next: null }]), status).groups[1].tiles.find((one) => one.id === "qbittorrent"), { id: "qbittorrent", state: "off", line: "Switched off", note: "" });
});

test("with no server check, every tile but the two that answered is unchecked, and the cards say so", () => {
  const page = healthPage(null, status);
  assert.deepEqual([page.state, page.headline], ["unknown", "Couldn't run the server check"]);
  assert.equal(tile(page, "jellyfin")?.state, "unchecked");
  assert.equal(tile(page, "api")?.state, "ok");
  assert.deepEqual(page.cards.slice(1).map((card) => [card.value, card.note]), [["Not checked", "The server check couldn't be run"], ["Not checked", "The server check couldn't be run"]]);
  assert.deepEqual(healthPage(report([]), status).cards.slice(1).map((card) => card.note), ["The server check didn't include it", "The server check didn't include it"]);
  assert.deepEqual(page.others, []);
  const many = healthPage(report(Array.from({ length: 20 }, (_, i) => ({ name: `Check ${i}`, state: "ok" as const, detail: "Fine.", next: null }))), status);
  assert.equal(many.others.length, mostOthers);
});
