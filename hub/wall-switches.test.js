// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { flipShownMs, howWords, isSwitchboard, switchboardView } from "./wall-switches.js";

/** @returns {import("./wall-switches.js").Switchboard} */
function board(reminders = false, jarvis = true) {
  return {
    kind: "switches",
    flipping: "on",
    groups: [
      {
        id: "hub",
        rows: [
          { key: "ALERTS", label: "alerts", on: true, value: "on", flip: "switch-off-alerts" },
          { key: "REMINDERS", label: "reminders", on: reminders, value: reminders ? "on" : "off", flip: reminders ? "switch-off-reminders" : "switch-on-reminders" },
        ],
      },
      { id: "hand", rows: [{ key: "LOGIN_GUARD", label: "login guard", on: true, value: "on", flip: null }] },
      { id: "jarvis", rows: jarvis ? [{ key: "JARVIS_VOICE", label: "voice", on: true, value: "kokoro", flip: null }, { key: "JARVIS_GUEST", label: "guest", on: false, value: "off", flip: null }] : [] },
    ],
    jarvisAgeMs: jarvis ? 1000 : null,
  };
}

test("the hub's switches page is checked before it's drawn", () => {
  assert.equal(isSwitchboard(board()), true);
  const good = board();
  for (const bad of [
    null,
    [],
    { ...good, kind: "server" },
    { ...good, flipping: "maybe" },
    { ...good, groups: good.groups.slice(0, 2) },
    { ...good, groups: [good.groups[1], good.groups[0], good.groups[2]] },
    { ...good, jarvisAgeMs: -1 },
    { ...good, jarvisAgeMs: "1" },
    { ...good, groups: [{ id: "hub", rows: [{ ...good.groups[0].rows[0], key: "alerts" }] }, good.groups[1], good.groups[2]] },
    { ...good, groups: [{ id: "hub", rows: [{ ...good.groups[0].rows[0], value: "a long persona" }] }, good.groups[1], good.groups[2]] },
    { ...good, groups: [{ id: "hub", rows: [{ ...good.groups[0].rows[0], flip: "rebuild-api" }] }, good.groups[1], good.groups[2]] },
    { ...good, groups: [{ id: "hub", rows: [{ ...good.groups[0].rows[0], label: "" }] }, good.groups[1], good.groups[2]] },
    { ...good, groups: [{ id: "hub", rows: [{ ...good.groups[0].rows[0], on: "yes" }] }, good.groups[1], good.groups[2]] },
    { ...good, groups: [{ id: "hub", rows: Array.from({ length: 61 }, () => good.groups[0].rows[0]) }, good.groups[1], good.groups[2]] },
  ]) assert.equal(isSwitchboard(bad), false, JSON.stringify(bad)?.slice(0, 120));
});

test("the hub's panel has its switches then the two by hand, counted together, and Jarvis's panel his own", () => {
  const { view } = switchboardView(board(), {}, 0);
  assert.deepEqual(
    view.panels.map((panel) => [panel.id, panel.title, panel.count, panel.rows.map((row) => [row.label, row.on, row.sub, row.hand])]),
    [
      ["hub", "The hub", "2 of 3 on", [["alerts", true, "ALERTS", false], ["reminders", false, "REMINDERS", false], ["login guard", true, "LOGIN_GUARD · by hand", true]]],
      ["jarvis", "Jarvis", "1 of 2 on", [["voice · kokoro", true, "JARVIS_VOICE", false], ["guest", false, "JARVIS_GUEST", false]]],
    ],
  );
  assert.equal(view.said, "Every switch, and whether it's on");
  assert.deepEqual(view.panels.map((panel) => panel.empty), ["", ""]);
});

test("before Jarvis has told the hub, his panel says why it's empty", () => {
  const jarvis = switchboardView(board(false, false), {}, 0).view.panels[1];
  assert.deepEqual([jarvis.count, jarvis.rows, jarvis.empty], ["", [], "Jarvis hasn't told the hub his switches. He does every 5 minutes while he runs with JARVIS_WALL on."]);
});

test("a switch that changed since the last read flips, for a few seconds, and one seen for the first time doesn't", () => {
  const first = switchboardView(board(false), {}, 1000);
  assert.deepEqual(first.view.panels[0].rows.map((row) => row.flipped), [false, false, false]);
  const second = switchboardView(board(true), first.seen, 31_000);
  assert.deepEqual(second.view.panels[0].rows.map((row) => [row.key, row.on, row.flipped]), [["ALERTS", true, false], ["REMINDERS", true, true], ["LOGIN_GUARD", true, false]]);
  assert.equal(switchboardView(board(true), second.seen, 31_000 + flipShownMs - 1).view.panels[0].rows[1].flipped, true);
  assert.equal(switchboardView(board(true), second.seen, 31_000 + flipShownMs).view.panels[0].rows[1].flipped, false);
  assert.equal(switchboardView(board(true), switchboardView(board(true), second.seen, 40_000).seen, 41_000).view.panels[0].rows[1].flipped, false, "reading it again unchanged doesn't flip it again");
});

test("the words at the bottom say how a switch is flipped, or why nothing is flipped for you", () => {
  assert.match(howWords("on"), /^With JARVIS_HUB_ACTIONS on, say “switch on reminders” and Jarvis asks for your yes first/);
  assert.match(howWords("on"), /putting it back if the hub doesn't come back/);
  assert.match(howWords("chores-off"), /^Dev chores are off \(CHORES\), so nothing here is flipped for you/);
  assert.match(howWords("off"), /^Switch flipping is off \(SWITCHES\), so nothing here is flipped for you/);
  for (const flipping of ["on", "chores-off", "off"]) assert.match(howWords(flipping), /jarvis\/\.env/);
  assert.equal(switchboardView({ ...board(), flipping: "off" }, {}, 0).view.how, howWords("off"));
});
