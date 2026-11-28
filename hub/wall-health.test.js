// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { beatBase, beatPoints, beatWidth, healthView, isHealthPage, upWords } from "./wall-health.js";

/** @returns {import("./wall-health.js").HealthPage} */
function page() {
  return {
    kind: "health",
    state: "ok",
    headline: "Everything's healthy",
    unchecked: 17,
    groups: ["front", "media", "watching", "jarvis"].map((id) => ({ id, title: id, note: "a note", tiles: [{ id: `${id}-one`, state: "ok", line: "Answering", note: "" }, { id: `${id}-two`, state: "unchecked", line: "Not checked", note: "runs when used" }] })),
    cards: ["kuma", "heartbeat", "backups"].map((id) => ({ id, title: id, state: "ok", value: "OK", note: "Fine." })),
    others: [{ name: "Wi-Fi", state: "ok" }],
    memory: { used: 5222, total: 7987 },
    disk: { used: 50, total: 230 },
    memoryState: "ok",
    diskState: "warn",
    upSeconds: 4 * 86400 + 3 * 3600,
    beat: true,
  };
}

test("the hub's health page is checked before it's drawn", () => {
  assert.equal(isHealthPage(page()), true);
  const good = page();
  for (const bad of [
    null,
    { ...good, kind: "server" },
    { ...good, state: "fine" },
    { ...good, beat: "yes" },
    { ...good, memory: { used: 9, total: 8 } },
    { ...good, disk: { used: 1, total: 0 } },
    { ...good, upSeconds: -1 },
    { ...good, diskState: "full" },
    { ...good, memoryState: undefined },
    { ...good, groups: good.groups.slice(1) },
    { ...good, groups: [good.groups[1], good.groups[0], ...good.groups.slice(2)] },
    { ...good, groups: good.groups.map((group) => ({ ...group, tiles: [{ ...group.tiles[0], state: "fine" }] })) },
    { ...good, groups: good.groups.map((group) => ({ ...group, tiles: [{ ...group.tiles[0], line: "x".repeat(41) }] })) },
    { ...good, groups: good.groups.map((group) => ({ ...group, tiles: Array.from({ length: 8 }, () => group.tiles[0]) })) },
    { ...good, cards: good.cards.slice(0, 2) },
    { ...good, cards: good.cards.map((card) => ({ ...card, note: "x".repeat(81) })) },
    { ...good, others: Array.from({ length: 13 }, () => good.others[0]) },
  ]) assert.equal(isHealthPage(bad), false, JSON.stringify(bad)?.slice(0, 100));
  assert.equal(isHealthPage({ ...good, memory: null, disk: null, upSeconds: null }), true);
});

test("memory and disk are shown as used of total with a bar, and say so when they couldn't be read", () => {
  const view = healthView(page());
  assert.deepEqual(view.vitals, [{ label: "Memory", value: "5.1 of 7.8 GB in use", pct: 65, state: "ok" }, { label: "Disk", value: "50 of 230 GB in use", pct: 22, state: "warn" }], "each carries the server check's state for it, so a warning shows on its row");
  assert.deepEqual(healthView({ ...page(), memory: null, disk: null, upSeconds: null }).vitals.map((vital) => [vital.value, vital.pct]), [["Couldn't read it", null], ["Couldn't read it", null]]);
  assert.equal(healthView({ ...page(), upSeconds: null }).up, "Up time unknown");
  assert.equal(view.sub, "· 17 not checked by the hub");
  assert.equal(healthView({ ...page(), unchecked: 0 }).sub, "");
  assert.deepEqual(["ok", "warn", "problem", "unknown"].map((state) => healthView({ ...page(), state }).dot), ["ok", "warn", "problem", "unknown"]);
});

test("up time reads as days and hours, hours, or minutes", () => {
  assert.equal(upWords(4 * 86400 + 3 * 3600 + 59), "Up 4 days, 3 hours");
  assert.equal(upWords(86400), "Up 1 day");
  assert.equal(upWords(86400 + 3600), "Up 1 day, 1 hour");
  assert.equal(upWords(5 * 3600 + 120), "Up 5 hours");
  assert.equal(upWords(60), "Up 1 minute");
  assert.equal(upWords(0), "Up 0 minutes");
});

test("the heartbeat line beats while the heartbeat is pinging, and is flat when it isn't", () => {
  assert.equal(beatPoints(false), `0,${beatBase} ${beatWidth},${beatBase}`);
  const points = beatPoints(true).split(" ").map((point) => point.split(",").map(Number));
  assert.deepEqual(points[0], [0, beatBase]);
  assert.deepEqual(points.at(-1), [beatWidth, beatBase]);
  assert.ok(points.every(([x, y]) => x >= 0 && x <= beatWidth && y >= 0 && y <= 96), "every point is inside the line's box");
  assert.ok(points.slice(1).every(([x], i) => x >= points[i][0]), "the line only goes forward");
  assert.ok(points.some(([, y]) => y < beatBase - 30), "with a spike in each beat");
  assert.equal(healthView(page()).points, beatPoints(true));
  assert.equal(healthView({ ...page(), beat: false }).points, beatPoints(false));
});
