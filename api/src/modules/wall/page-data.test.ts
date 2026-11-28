import assert from "node:assert/strict";
import { test } from "node:test";
import { mostNameChars, mostTrainRows, trainPage } from "./page-data.js";

const journeys = {
  from: "Northgate",
  via: "Midtown",
  to: "Southfield",
  walk: 5,
  messages: ["Engineering works", "Strike"],
  journeys: [
    { leaves: "06:44", expected: "On time", cancelled: false, bus: false, reason: null, arrives: "06:54", arrivesExpected: "On time", platform: "3", tight: null, best: { leaves: "07:01", expected: "On time", platform: "17", destination: "Southfield", arrives: "07:58", arrivesExpected: "On time", change: 7, bus: false, reason: null }, fallback: null },
    { leaves: "07:44", expected: "07:51", cancelled: false, bus: false, reason: "a signal fault", arrives: "08:01", arrivesExpected: "08:08", platform: "1", tight: { leaves: "08:03", expected: "On time", platform: "16", destination: "Eastbrook", arrives: "08:55", arrivesExpected: "On time", change: 2, bus: false, reason: null }, best: { leaves: "08:10", expected: "08:12", platform: "16", destination: "Southfield", arrives: "08:52", arrivesExpected: "08:59", change: 9, bus: false, reason: null }, fallback: null },
    { leaves: "08:14", expected: "Cancelled", cancelled: true, bus: false, reason: null, arrives: "08:24", arrivesExpected: "Cancelled", platform: null, tight: null, best: null, fallback: null },
  ],
};

test("a journey with a change gives each row its first train, when it's in at the end, and the change at the station between", () => {
  const page = trainPage(journeys);
  assert.deepEqual([page.kind, page.from, page.via, page.to, page.updates], ["trains", "Northgate", "Midtown", "Southfield", 2]);
  assert.deepEqual(page.rows[0], { leaves: "06:44", expected: "On time", late: false, cancelled: false, bus: false, platform: "3", destination: null, arrives: "07:58", arrivesExpected: "On time", change: { arrives: "06:54", leaves: "07:01", expected: "On time", platform: "17", minutes: 7, bus: false }, tight: false });
  assert.deepEqual([page.rows[1].late, page.rows[1].expected, page.rows[1].arrivesExpected, page.rows[1].tight, page.rows[1].change?.expected], [true, "07:51", "08:59", true, "08:12"]);
  assert.deepEqual([page.rows[2].cancelled, page.rows[2].change, page.rows[2].arrives], [true, null, null], "a cancelled train has no change to show");
  assert.ok(!JSON.stringify(page).includes("signal fault"), "why a train is late isn't passed on: it's the rail company's words");
  assert.ok(!JSON.stringify(page).includes("Engineering"), "and the board's messages are only counted");
});

test("a plain board, with no change, gives each departure's time, platform and where it's going", () => {
  const page = trainPage({ from: "Northgate", to: "Midtown", buses: 0, messages: [], departures: [{ due: "07:14", expected: "07:20", platform: "2", cancelled: false, reason: null, destination: "Midtown" }, { due: "07:44", expected: "Cancelled", platform: null, cancelled: true, reason: null, destination: "Westby" }] });
  assert.deepEqual([page.via, page.updates], [null, 0]);
  assert.deepEqual(page.rows.map((row) => [row.leaves, row.expected, row.late, row.cancelled, row.platform, row.destination, row.change]), [["07:14", "07:20", true, false, "2", "Midtown", null], ["07:44", "Cancelled", false, true, null, "Westby", null]]);
});

test("anything odd in the board is tidied or left out, and only six rows are kept", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ due: `07:${String(10 + i)}`, expected: "On time", platform: "2", cancelled: false, reason: null, destination: "Midtown" }));
  assert.equal(trainPage({ from: "A", to: "B", messages: [], departures: many }).rows.length, mostTrainRows);
  const odd = trainPage({ from: "North\u0007 Gate", to: "x".repeat(80), messages: "none", departures: [{ due: "7:14", expected: "soon" }, { due: "07:14", expected: "<b>late</b>", platform: "platform two", destination: "\n\n" }] });
  assert.equal(odd.from, "North Gate");
  assert.equal(odd.to.length, mostNameChars);
  assert.equal(odd.updates, 0);
  assert.deepEqual(odd.rows.map((row) => [row.leaves, row.expected, row.platform, row.destination]), [["07:14", "No time yet", null, null]], "a time that isn't a clock time is dropped, and unknown words aren't shown");
});

test("a journey is late when it's delayed or expected at another time, cancelled when it says so either way, and only six are kept", () => {
  const journey = (leaves: string, expected: string, cancelled = false) => ({ leaves, expected, cancelled, bus: false, reason: null, arrives: "08:00", arrivesExpected: "On time", tight: null, best: null, fallback: null });
  const page = trainPage({ from: "Northgate", via: "Midtown", to: "Southfield", messages: [], journeys: [journey("07:14", "Delayed"), journey("07:14", "07:14"), journey("07:44", "Cancelled"), journey("08:14", "On time", true), journey("08:44", "08:50"), journey("09:14", "On time"), journey("09:44", "On time")] });
  assert.deepEqual(page.rows.map((row) => [row.late, row.cancelled]), [[true, false], [false, false], [false, true], [false, true], [true, false], [false, false]]);
  assert.equal(page.rows.length, mostTrainRows);
});

test("a journey row keeps the first train's platform, and is by bus only when the board says so exactly", () => {
  const one = (fields: Record<string, unknown>) => trainPage({ from: "A", via: "B", to: "C", messages: [], journeys: [{ leaves: "07:14", expected: "On time", arrives: "07:30", best: null, ...fields }] }).rows[0];
  assert.deepEqual([one({ platform: "3" }).platform, one({ platform: "platform 3" }).platform, one({}).platform], ["3", null, null]);
  assert.deepEqual([one({ bus: true }).bus, one({ bus: "yes" }).bus, one({}).bus], [true, false, false]);
});

test("a change's minutes are only kept as a whole number under ten hours", () => {
  const withChange = (change: unknown) => trainPage({ from: "A", via: "B", to: "C", messages: [], journeys: [{ leaves: "07:14", expected: "On time", arrives: "07:30", best: { leaves: "07:40", expected: "On time", platform: "2", arrives: "08:10", arrivesExpected: "On time", change } }] }).rows[0].change?.minutes;
  assert.deepEqual([withChange(0), withChange(9), withChange(599)], [0, 9, 599]);
  for (const bad of [-1, 600, 2.5, "9", null, Number.NaN]) assert.equal(withChange(bad), null, String(bad));
});

test("a reply that isn't a board is refused, so the page says it couldn't read the trains", () => {
  for (const bad of [null, "board", [], { journeys: "x" }, { from: "A" }]) assert.throws(() => trainPage(bad), /the train times weren't a board/, JSON.stringify(bad));
});
