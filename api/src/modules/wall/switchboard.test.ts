import assert from "node:assert/strict";
import { test } from "node:test";
import { featureLabels, switchKeys, type Features } from "../../config.js";
import { switchOfJob } from "../chores/chores.js";
import { createJarvisSwitches, flippingOf, jarvisSwitchesKeptMs, jarvisSwitchesShape, mostJarvisSwitches, readJarvisSwitches, switchboardPage } from "./switchboard.js";

const allOn = Object.fromEntries(Object.keys(switchKeys).map((key) => [key, true])) as Features;
const byHand = { dealsAi: false, loginGuard: true };

test("the hub's group is every feature switch, in the settings file's order, with its label and the chore that would flip it", () => {
  const page = switchboardPage({ ...allOn, reminders: false }, byHand, null);
  assert.equal(page.kind, "switches");
  assert.equal(page.flipping, "on");
  const hub = page.groups[0];
  assert.equal(hub.id, "hub");
  assert.deepEqual(hub.rows.map((row) => row.key), Object.values(switchKeys));
  assert.deepEqual(hub.rows.map((row) => row.label), Object.values(featureLabels));
  assert.deepEqual(hub.rows.find((row) => row.key === "REMINDERS"), { key: "REMINDERS", label: "reminders", on: false, value: "off", flip: "switch-on-reminders" });
  assert.deepEqual(hub.rows.find((row) => row.key === "FIND_PHONE"), { key: "FIND_PHONE", label: "find my phone", on: true, value: "on", flip: "switch-off-find-phone" });
  for (const row of hub.rows) assert.deepEqual(switchOfJob(row.flip ?? ""), { key: row.key, on: !row.on }, row.key);
});

test("with chores or switch flipping off, nothing has a chore, and the page says which", () => {
  for (const [features, flipping] of [[{ ...allOn, chores: false }, "chores-off"], [{ ...allOn, chores: false, switches: false }, "chores-off"], [{ ...allOn, switches: false }, "off"]] as const) {
    const page = switchboardPage(features, byHand, null);
    assert.equal(page.flipping, flipping);
    assert.equal(flippingOf(features), flipping);
    assert.deepEqual(page.groups.flatMap((group) => group.rows).filter((row) => row.flip !== null), [], flipping);
  }
});

test("the AI deal checks and the login guard are shown, but are never flipped by a chore", () => {
  const hand = switchboardPage(allOn, { dealsAi: true, loginGuard: false }, null).groups[1];
  assert.deepEqual(hand, {
    id: "hand",
    rows: [
      { key: "DEALS_AI", label: "AI deal checks", on: true, value: "on", flip: null },
      { key: "LOGIN_GUARD", label: "login guard", on: false, value: "off", flip: null },
    ],
  });
});

test("Jarvis's group is what he last told the hub, in his order, and never has a chore", () => {
  const told = createJarvisSwitches();
  assert.deepEqual(told.tell({ switches: { JARVIS_HUB_TOOLS: "on", JARVIS_VOICE: "kokoro", JARVIS_GUEST: "off" } }, 1_000), { count: 3, on: 2, changed: true });
  const page = switchboardPage(allOn, byHand, told.view(4_000));
  assert.deepEqual(page.groups[2], {
    id: "jarvis",
    rows: [
      { key: "JARVIS_HUB_TOOLS", label: "hub tools", on: true, value: "on", flip: null },
      { key: "JARVIS_VOICE", label: "voice", on: true, value: "kokoro", flip: null },
      { key: "JARVIS_GUEST", label: "guest", on: false, value: "off", flip: null },
    ],
  });
  assert.equal(page.jarvisAgeMs, 3_000);
  assert.deepEqual(switchboardPage(allOn, byHand, null).groups[2], { id: "jarvis", rows: [] });
  assert.equal(switchboardPage(allOn, byHand, null).jarvisAgeMs, null);
});

test("what Jarvis tells the hub is kept for a while, says when it changed, and is forgotten after the kept time", () => {
  const told = createJarvisSwitches();
  assert.equal(told.view(0), null);
  told.tell({ switches: { JARVIS_WALL: "on" } }, 0);
  assert.deepEqual(told.tell({ switches: { JARVIS_WALL: "on" } }, 10), { count: 1, on: 1, changed: false });
  assert.deepEqual(told.tell({ switches: { JARVIS_WALL: "off" } }, 20), { count: 1, on: 0, changed: true });
  assert.deepEqual(told.view(20 + jarvisSwitchesKeptMs)?.switches, [["JARVIS_WALL", "off"]]);
  assert.equal(told.view(21 + jarvisSwitchesKeptMs), null);
});

test("only JARVIS_ names with a lower-case word each are taken, and a refusal keeps what was there", () => {
  const told = createJarvisSwitches();
  told.tell({ switches: { JARVIS_WALL: "on" } }, 0);
  const many = Object.fromEntries(Array.from({ length: mostJarvisSwitches + 1 }, (_, i) => [`JARVIS_S${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, "on"]));
  for (const body of [
    null,
    [],
    "switches",
    { switches: [] },
    { switches: { JARVIS_WALL: "on" }, more: 1 },
    { switches: { API_TOKEN: "on" } },
    { switches: { jarvis_wall: "on" } },
    { switches: { JARVIS_W: "on" } },
    { switches: { JARVIS_WALL: "On" } },
    { switches: { JARVIS_WALL: "a persona text" } },
    { switches: { JARVIS_WALL: "sk-ant-12345" } },
    { switches: { JARVIS_WALL: 1 } },
    { switches: { JARVIS_WALL: true } },
    { switches: { JARVIS_LENGTH_CAP: "150000" } },
    { switches: many },
  ]) {
    assert.equal(readJarvisSwitches(body), null, JSON.stringify(body));
    assert.deepEqual(told.tell(body, 5), { refused: jarvisSwitchesShape });
  }
  assert.deepEqual(told.view(5)?.switches, [["JARVIS_WALL", "on"]]);
  assert.equal(readJarvisSwitches({ switches: Object.fromEntries(Object.entries(many).slice(0, mostJarvisSwitches)) })?.length, mostJarvisSwitches);
  assert.deepEqual(readJarvisSwitches({ switches: {} }), []);
});
