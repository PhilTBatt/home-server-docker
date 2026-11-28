import assert from "node:assert/strict";
import { test } from "node:test";
import type { DoctorReport } from "../system/doctor.js";
import { mapEffects, mapGroups, serverLinks, serverMapPage, serverNodes } from "./server-map.js";

const composeServices = ["adguard", "homepage", "kuma", "caddy", "jellyfin", "qbittorrent", "prowlarr", "sonarr", "radarr", "byparr", "seerr", "beszel", "beszel-agent", "api", "mcp", "jarvis", "kokoro", "piper", "ears", "whisper", "openwakeword"];

function report(checks: DoctorReport["checks"], state: DoctorReport["state"] = "ok", summary = "Everything's OK: 9 checks fine."): DoctorReport {
  return { state, summary, checkedAt: "2026-11-30T07:00:00.000Z", checks };
}

test("every service in the compose file, as listed here when the map was drawn, is on the map once, with tailscale on the host and the services out on the internet", () => {
  const ids = serverNodes.map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length, "no node twice");
  for (const service of composeServices) assert.ok(ids.includes(service), service);
  assert.deepEqual(serverNodes.filter((node) => node.group === "outside").map((node) => node.id), ["rail data", "eBay", "Healthchecks.io", "ntfy.sh", "Spotify", "GitHub", "Claude"]);
  assert.ok(ids.includes("tailscale"));
});

test("every node sits on the wall's stage with a known effect and group, and every link joins two nodes", () => {
  for (const node of serverNodes) {
    assert.ok(node.x >= 0 && node.x <= 1280 && node.y >= 0 && node.y <= 720 && node.size > 0 && node.size <= 40, node.id);
    assert.ok((mapEffects as readonly string[]).includes(node.fx) && (mapGroups as readonly string[]).includes(node.group), node.id);
  }
  const ids = new Set(serverNodes.map((node) => node.id));
  for (const link of serverLinks) assert.ok(ids.has(link.from) && ids.has(link.to), `${link.from} to ${link.to}`);
  assert.deepEqual(serverLinks.filter((link) => link.outside).map((link) => link.to).sort(), ["Claude", "GitHub", "Healthchecks.io", "Spotify", "eBay", "ntfy.sh", "rail data"].sort(), "links out to the internet are marked");
  assert.ok(serverLinks.some((link) => link.from === "ears" && link.to === "whisper" && link.packets));
});

test("each node's state is the hub's own check of it, the API and Caddy are answering, and anything the hub can't see isn't checked", () => {
  const map = serverMapPage(report([
    { name: "qBittorrent", state: "problem", detail: "Not answering.", next: "x" },
    { name: "Jellyfin", state: "ok", detail: "Answering.", next: null },
    { name: "Heartbeat", state: "warn", detail: "Late.", next: null },
    { name: "Phone alerts", state: "ok", detail: "Sent.", next: null },
    { name: "Train times", state: "ok", detail: "Answered.", next: null },
    { name: "Deal watcher", state: "off", detail: "Off.", next: null },
  ], "problem", "1 problem: qBittorrent."));
  const state = (id: string) => map.nodes.find((node) => node.id === id)?.state;
  assert.deepEqual([state("qbittorrent"), state("jellyfin"), state("Healthchecks.io"), state("ntfy.sh"), state("rail data"), state("eBay"), state("api"), state("caddy")], ["problem", "ok", "warn", "ok", "ok", "off", "ok", "ok"]);
  for (const id of ["sonarr", "kokoro", "jarvis", "kuma", "Spotify", "Claude", "GitHub"]) assert.equal(state(id), "unchecked", id);
  assert.equal(map.watched, 7, "one switched off isn't watched");
  assert.equal(serverMapPage(report([])).nodes.find((node) => node.id === "qbittorrent")?.state, "unchecked", "a check that isn't in the report isn't made up");
});

test("the chips are the server check's summary, then memory, disk and backups in the hub's own words, toned by how they are", () => {
  const map = serverMapPage(report([
    { name: "Memory", state: "ok", detail: "2.1 of 6.6 GB available.", next: null },
    { name: "Disk", state: "warn", detail: "40 of 230 GB free, under a fifth.", next: null },
    { name: "Backups", state: "off", detail: "No backup has run yet.", next: null },
  ], "warn", "1 thing to look at: Disk."));
  assert.deepEqual(map.chips, [
    { text: "1 thing to look at: Disk.", tone: "warn" },
    { text: "Memory: 2.1 of 6.6 GB available.", tone: "plain" },
    { text: "Disk: 40 of 230 GB free, under a fifth.", tone: "warn" },
  ]);
  const long = serverMapPage(report([{ name: "Memory", state: "problem", detail: `Low\u0007 ${"x".repeat(200)}`, next: null }], "problem", "1 problem: Memory."));
  assert.equal(long.chips[1].tone, "warm");
  assert.ok(long.chips[1].text.length <= 90 && long.chips[1].text.endsWith("…") && !long.chips[1].text.includes("\u0007"));
  assert.equal(serverMapPage(report([], "ok")).chips[0].tone, "good");
});

test("when the server check can't be run, the map still comes, says so, and only the API and Caddy count as answering", () => {
  const map = serverMapPage(null);
  assert.deepEqual(map.chips, [{ text: "Couldn't run the server check just now", tone: "warm" }]);
  assert.deepEqual(map.nodes.filter((node) => node.state !== "unchecked").map((node) => node.id), ["caddy", "api"]);
  assert.equal(map.kind, "server");
  assert.equal(map.host, "home-server");
});

test("the server check's advice, with its commands and paths, never reaches the map", () => {
  const map = serverMapPage(report([
    { name: "Backups", state: "problem", detail: "The last backup failed.", next: "Look at journalctl -u home-hub-backup and /var/lib/home-hub/backup-state" },
    { name: "Disk", state: "warn", detail: "12 of 230 GB free.", next: "Run docker system prune to free space" },
    { name: "qBittorrent", state: "problem", detail: "Not answering.", next: "Check docker compose logs qbittorrent" },
  ], "problem", "2 problems: Backups, qBittorrent."));
  const shown = JSON.stringify(map);
  for (const advice of ["journalctl", "/var/lib/home-hub", "prune", "docker compose logs"]) assert.ok(!shown.includes(advice), advice);
  assert.ok(shown.includes("The last backup failed."), "the detail itself still shows");
});
