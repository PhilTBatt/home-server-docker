import assert from "node:assert/strict";
import { test } from "node:test";
import type { TrainSettings } from "./board.js";
import { arrivalRows, connectionRows, connectionsFor, detailedBoardUrl, expectedOffset, fetchJourneyBoards, fetchJourneys, journeyRows, journeysFrom, offset, readArrivals, readDepartures, type FirstLeg, type SecondLeg } from "./journeys.js";

const settings: TrainSettings = {
  key: "test-rail-key",
  from: "AAA",
  to: "BBB",
  boardUrl: "https://api1.raildata.org.uk/test-board/GetDepartureBoard",
  journey: { at: "CCC", walk: 3, arrivalsKey: "test-arrivals-key", arrivalsUrl: "https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails", detailsUrl: "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails" },
};

const at = (hours: number, minutes: number) => hours * 60 + minutes;

const arrivals = {
  generatedAt: "2026-11-26T08:20:00+00:00",
  locationName: "Gamma",
  crs: "CCC",
  filterLocationName: "Alpha",
  filtercrs: "AAA",
  filterType: "from",
  nrccMessages: [{ Value: "Engineering works near <b>Gamma</b>." }],
  trainServices: [
    { sta: "08:42", eta: "08:44", platform: "8", isCancelled: false, delayReason: "This train has been delayed by a fault", destination: [{ locationName: "Gamma", crs: "CCC" }], previousCallingPoints: [{ callingPoint: [{ locationName: "Omega", crs: "OOO", st: "08:20", et: "On time" }, { locationName: "Alpha", crs: "AAA", st: "08:33", et: "08:35" }] }] },
    { sta: "08:53", eta: "Ontime", platform: "9", previousCallingPoints: [{ callingPoint: [{ locationName: "Alpha", crs: "AAA", st: "08:44", et: "Ontime" }] }] },
    { sta: "08:22", eta: "08:26", platform: "8", previousCallingPoints: [{ callingPoint: [{ locationName: "Alpha", crs: "AAA", st: "08:13", at: "08:16" }] }] },
  ],
  busServices: [{ sta: "09:20", eta: "On time", serviceType: "bus", previousCallingPoints: [{ callingPoint: [{ locationName: "Alpha", crs: "AAA", st: "09:00", et: "On time" }] }] }],
};

const departures = {
  generatedAt: "2026-11-26T08:20:01+00:00",
  locationName: "Gamma",
  crs: "CCC",
  filterLocationName: "Beta",
  nrccMessages: [{ Value: "Engineering works near Gamma." }, { Value: "Busy at Beta." }],
  trainServices: [
    { std: "08:42", etd: "On time", platform: "9D", destination: [{ locationName: "Delta" }], subsequentCallingPoints: [{ callingPoint: [{ locationName: "Beta", crs: "BBB", st: "10:01", et: "On time" }] }] },
    { std: "08:45", etd: "On time", platform: "16", destination: [{ locationName: "Epsilon" }], subsequentCallingPoints: [{ callingPoint: [{ locationName: "Xi", crs: "XXX", st: "09:00", et: "On time" }, { locationName: "Beta", crs: "BBB", st: "09:36", et: "On time" }] }] },
    { std: "09:00", etd: "09:02", platform: "16", destination: [{ locationName: "Zeta" }], delayReason: "This train has been delayed by a late crew", subsequentCallingPoints: [{ callingPoint: [{ locationName: "Beta", crs: "BBB", st: "09:52", et: "09:54" }] }] },
    { std: "09:12", etd: "On time", platform: "5B", destination: [{ locationName: "Beta" }], subsequentCallingPoints: [{ callingPoint: [{ locationName: "Beta", crs: "BBB", st: "10:29", et: "On time" }] }] },
  ],
};

function first(leaves: string, arrives: string, more: Partial<FirstLeg> = {}): FirstLeg {
  return { leaves, expected: "On time", cancelled: false, bus: false, reason: null, arrives, arrivesExpected: "On time", platform: null, ...more };
}

function second(leaves: string, arrives: string, more: Partial<SecondLeg> = {}): SecondLeg {
  return { leaves, expected: "On time", platform: "16", destination: "Epsilon", arrives, arrivesExpected: "On time", cancelled: false, bus: false, reason: null, ...more };
}

test("times are worked out from now, across midnight, with On time, Ontime or a clock time as the expected time", () => {
  assert.equal(offset(at(23, 50), "00:10"), 20);
  assert.equal(offset(at(0, 10), "23:50"), -20);
  assert.equal(offset(at(8, 0), "8:05"), null);
  assert.equal(expectedOffset(at(8, 0), "08:33", "On time"), 33);
  assert.equal(expectedOffset(at(8, 0), "08:33", "Ontime"), 33);
  assert.equal(expectedOffset(at(8, 0), "08:33", "08:36"), 36);
  for (const unknown of ["Delayed", "Cancelled", "No report", ""]) assert.equal(expectedOffset(at(8, 0), "08:33", unknown), null, unknown);
});

test("the arrival board gives each train and bus from the first station, with its time there, when it's due in, the platform and why it's late", () => {
  const read = readArrivals(arrivals, { from: "AAA", at: "CCC" });
  assert.deepEqual([read.from, read.via, read.messages], ["Alpha", "Gamma", ["Engineering works near Gamma."]]);
  assert.deepEqual(read.legs, [
    { leaves: "08:33", expected: "08:35", cancelled: false, bus: false, reason: "This train has been delayed by a fault", arrives: "08:42", arrivesExpected: "08:44", platform: "8" },
    { leaves: "08:44", expected: "On time", cancelled: false, bus: false, reason: null, arrives: "08:53", arrivesExpected: "On time", platform: "9" },
    { leaves: "08:13", expected: "08:16", cancelled: false, bus: false, reason: null, arrives: "08:22", arrivesExpected: "08:26", platform: "8" },
    { leaves: "09:00", expected: "On time", cancelled: false, bus: true, reason: null, arrives: "09:20", arrivesExpected: "On time", platform: null },
  ]);
});

test("a train is cancelled on the arrival board however the board says so, and one that doesn't call at the first station, or has odd times, is left out", () => {
  const point = (more: object = {}) => [{ callingPoint: { crs: "AAA", st: "08:33", et: "On time", ...more } }];
  const read = readArrivals({ crs: "CCC", trainServices: { service: [
    { sta: "08:42", eta: "On time", isCancelled: true, cancelReason: "This train has been cancelled", previousCallingPoints: point() },
    { sta: "08:42", eta: "On time", filterLocationCancelled: true, previousCallingPoints: point() },
    { sta: "08:42", eta: "On time", previousCallingPoints: point({ isCancelled: true }) },
    { sta: "08:42", eta: "Cancelled", previousCallingPoints: point() },
    { sta: "08:42", eta: "On time", previousCallingPoints: point({ et: "Cancelled" }) },
    { sta: "08:42", eta: "On time", previousCallingPoints: point({ at: "No report", et: "08:34" }) },
    { sta: "08:42", eta: "On time", previousCallingPoints: [{ callingPoint: [{ crs: "OOO", st: "08:20", et: "On time" }] }] },
    { sta: "8:42", eta: "On time", previousCallingPoints: point() },
    { eta: "On time", previousCallingPoints: point() },
    "odd",
  ] } }, { from: "AAA", at: "CCC" });
  assert.deepEqual(read.legs.map((leg) => [leg.cancelled, leg.expected]), [[true, "On time"], [true, "On time"], [true, "On time"], [true, "On time"], [true, "Cancelled"], [false, "08:34"]]);
  assert.equal(read.legs[0].reason, "This train has been cancelled");
  assert.deepEqual([read.from, read.via], ["AAA", "CCC"], "with no names on the board, the station codes are used");
});

test("the detailed departure board gives each train on to the last station, with its time and platform here and when it's due in there", () => {
  const read = readDepartures(departures, { at: "CCC", to: "BBB" });
  assert.equal(read.to, "Beta");
  assert.deepEqual(read.messages, ["Engineering works near Gamma.", "Busy at Beta."]);
  assert.deepEqual(read.legs[2], { leaves: "09:00", expected: "09:02", platform: "16", destination: "Zeta", arrives: "09:52", arrivesExpected: "09:54", cancelled: false, bus: false, reason: "This train has been delayed by a late crew" });
  assert.deepEqual(read.legs.map((leg) => leg.leaves), ["08:42", "08:45", "09:00", "09:12"]);
  const odd = readDepartures({ crs: "CCC", trainServices: [
    { std: "09:00", etd: "On time", subsequentCallingPoints: [{ callingPoint: [{ crs: "BBB", st: "09:52", et: "On time", isCancelled: true }] }] },
    { std: "09:05", etd: "Ontime", subsequentCallingPoints: [{ callingPoint: [{ crs: "XXX", st: "09:52", et: "On time" }] }] },
    { std: "09:10", etd: "On time" },
  ], busServices: [{ std: "09:15", etd: "On time", subsequentCallingPoints: [{ callingPoint: [{ crs: "BBB", st: "10:40", et: "On time" }] }] }] }, { at: "CCC", to: "BBB" });
  assert.deepEqual(odd.legs.map((leg) => [leg.leaves, leg.cancelled, leg.bus]), [["09:00", true, false], ["09:15", false, true]], "a train cancelled at the last station can't be taken, and one not calling there is left out");
});

test("a reply that isn't the board asked for is an error, naming which board", () => {
  for (const body of [null, "board", [], {}, { crs: "AAA" }]) {
    assert.throws(() => readArrivals(body, { from: "AAA", at: "CCC" }), { message: "the arrival board's reply wasn't an arrival board" }, JSON.stringify(body));
    assert.throws(() => readDepartures(body, { at: "CCC", to: "BBB" }), { message: "the detailed departure board's reply wasn't a departure board" }, JSON.stringify(body));
  }
  assert.throws(() => readArrivals({ crs: "CCC", busServices: "lots" }, { from: "AAA", at: "CCC" }), { message: "the arrival board's trains weren't a list" });
  assert.throws(() => readDepartures({ crs: "CCC", trainServices: 5 }, { at: "CCC", to: "BBB" }), { message: "the detailed departure board's trains weren't a list" });
});

test("the best connection is the one that gets in soonest, not the first to leave, and the fallback is the best of those leaving after it", () => {
  const options = [second("08:42", "10:01", { destination: "Delta" }), second("08:45", "09:36"), second("09:00", "09:52", { expected: "09:02", arrivesExpected: "09:54" }), second("09:12", "10:29")];
  const found = connectionsFor(first("08:13", "08:22", { arrivesExpected: "08:26" }), options, 3, at(8, 20));
  assert.deepEqual([found.tight, found.best?.leaves, found.best?.change, found.fallback?.leaves], [null, "08:45", 19, "09:00"]);
  assert.deepEqual(found.best, { leaves: "08:45", expected: "On time", platform: "16", destination: "Epsilon", arrives: "09:36", arrivesExpected: "On time", change: 19, bus: false, reason: null });
  const missed = connectionsFor(first("08:33", "08:42"), [second("08:46", "09:50"), second("08:48", "09:36"), second("09:00", "09:58")], 3, at(8, 20));
  assert.deepEqual([missed.best?.leaves, missed.fallback?.leaves], ["08:48", "09:00"], "the 08:46 gets in sooner than the 09:00, but it's gone by the time you've missed the 08:48");
});

test("a sooner connection with less than the walk is shown as tight, and one that leaves before you're in isn't shown at all", () => {
  const options = [second("08:42", "10:01"), second("08:45", "09:36"), second("09:00", "09:52", { expected: "09:02", arrivesExpected: "09:54" }), second("09:12", "10:29")];
  const found = connectionsFor(first("08:33", "08:42", { expected: "08:35", arrivesExpected: "08:44" }), options, 3, at(8, 20));
  assert.deepEqual([found.tight?.leaves, found.tight?.change, found.best?.leaves, found.best?.change, found.fallback?.leaves], ["08:45", 1, "09:00", 18, "09:12"]);
  const exact = connectionsFor(first("08:33", "08:42"), options, 3, at(8, 20));
  assert.deepEqual([exact.tight, exact.best?.leaves, exact.best?.change], [null, "08:45", 3], "exactly the walk is enough");
  const slower = connectionsFor(first("08:33", "08:42"), [second("08:44", "09:58"), second("09:00", "09:52")], 3, at(8, 20));
  assert.deepEqual([slower.tight, slower.best?.leaves], [null, "09:00"], "a tight one that gets in later than the best isn't worth running for");
  const level = connectionsFor(first("08:33", "08:42"), [second("08:45", "09:36", { expected: "08:42" })], 3, at(8, 20));
  assert.deepEqual([level.tight, level.best], [null, null], "nothing leaves after you're in");
});

test("cancelled connections are skipped, a delayed one with no time counts from when it was due, and one with no time in is due in as late as it leaves", () => {
  const options = [second("08:45", "09:36", { cancelled: true }), second("09:00", "09:52", { expected: "Delayed", arrivesExpected: "Delayed" }), second("09:12", "10:29", { expected: "09:20", arrivesExpected: "Delayed" })];
  const found = connectionsFor(first("08:33", "08:42"), options, 3, at(8, 20));
  assert.deepEqual([found.best?.leaves, found.best?.change, found.fallback?.leaves], ["09:00", 18, "09:12"]);
  assert.deepEqual(connectionsFor(first("08:33", "08:42", { cancelled: true }), options, 3, at(8, 20)), { tight: null, best: null, fallback: null }, "a cancelled first train has no connection");
  assert.deepEqual(connectionsFor(first("08:33", "08:42", { arrivesExpected: "Delayed" }), options, 3, at(8, 20)), { tight: null, best: null, fallback: null }, "nor does one with no time in");
  const late = connectionsFor(first("08:33", "08:42"), [second("09:00", "09:52", { expected: "09:10", arrivesExpected: "Delayed" }), second("09:05", "09:58")], 3, at(8, 20));
  assert.deepEqual([late.best?.leaves, late.fallback?.leaves], ["09:05", "09:00"], "the late one is due in at 10:02, after the 09:05");
});

test("journeys are the next three from the first station by when they leave, still counting one that's left but isn't in yet, across midnight too", () => {
  const boards = { arrivals: readArrivals(arrivals, { from: "AAA", at: "CCC" }), departures: readDepartures(departures, { at: "CCC", to: "BBB" }) };
  const seen = journeysFrom(boards, 3, at(8, 20));
  assert.deepEqual([seen.from, seen.via, seen.to, seen.walk], ["Alpha", "Gamma", "Beta", 3]);
  assert.deepEqual(seen.journeys.map((journey) => [journey.leaves, journey.tight?.leaves ?? null, journey.best?.leaves ?? null, journey.fallback?.leaves ?? null]), [["08:13", null, "08:45", "09:00"], ["08:33", "08:45", "09:00", "09:12"], ["08:44", null, "09:00", "09:12"]]);
  assert.deepEqual(seen.messages, ["Engineering works near Gamma.", "Busy at Beta."], "a message on both boards is said once");
  assert.equal(journeysFrom(boards, 3, at(8, 20), 10).journeys.length, 4);
  const late = journeysFrom({ arrivals: { from: "Alpha", via: "Gamma", legs: [first("00:05", "00:20"), first("23:50", "00:05")], messages: [] }, departures: { to: "Beta", legs: [second("00:30", "01:30")], messages: [] } }, 3, at(23, 45));
  assert.deepEqual(late.journeys.map((journey) => [journey.leaves, journey.best?.change]), [["23:50", 25], ["00:05", 10]]);
  assert.equal(journeyRows, 3);
});

test("the detailed board's address is the plain one's with its last part changed, and nothing else will do", () => {
  assert.equal(detailedBoardUrl("https://api1.raildata.org.uk/x/LDBWS/api/20220120/GetDepartureBoard"), "https://api1.raildata.org.uk/x/LDBWS/api/20220120/GetDepBoardWithDetails");
  assert.equal(detailedBoardUrl("https://api1.raildata.org.uk/x/LDBWS/api/20220120/GetDepBoardWithDetails"), "https://api1.raildata.org.uk/x/LDBWS/api/20220120/GetDepBoardWithDetails");
  for (const other of ["https://api1.raildata.org.uk/x/GetArrivalBoard", "https://api1.raildata.org.uk/test-board", ""]) assert.equal(detailedBoardUrl(other), null, other);
});

test("both boards are asked at the change station, each with its own key, no redirects, and the arrival board for trains from the first station", async () => {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => (asked.push({ url, init }), new Response(JSON.stringify(url.includes("arrivals") ? arrivals : departures), { status: 200 }))) as typeof fetch;
  const seen = await fetchJourneys(settings, undefined, fetcher, () => new Date("2026-11-26T08:20:00Z"));
  assert.deepEqual(seen.journeys.map((journey) => journey.leaves), ["08:13", "08:33", "08:44"]);
  assert.deepEqual(asked.map((one) => one.url).sort(), ["https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails/CCC?numRows=5&filterCrs=AAA&filterType=from", "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails/CCC?numRows=10&filterCrs=BBB&filterType=to"]);
  const keyFor = (part: string) => (asked.find((one) => one.url.includes(part))?.init?.headers as Record<string, string>)["x-apikey"];
  assert.deepEqual([keyFor("arrivals"), keyFor("test-board")], ["test-arrivals-key", "test-rail-key"]);
  assert.ok(asked.every((one) => one.init?.redirect === "error"));
  assert.deepEqual([arrivalRows, connectionRows], [5, 10]);
  await fetchJourneyBoards(settings, undefined, fetcher, 8_000, 10);
  assert.ok(asked.some((one) => one.url.includes("GetArrBoardWithDetails/CCC?numRows=10&")), "the alerts ask for more");
});

test("a board that fails says which board and which setting to check, never the key", async () => {
  const failingOn = (part: string, status: number) => (async (url: string) => new Response(url.includes(part) ? "test-arrivals-key test-rail-key" : JSON.stringify(url.includes("arrivals") ? arrivals : departures), { status: url.includes(part) ? status : 200 })) as unknown as typeof fetch;
  await assert.rejects(fetchJourneys(settings, undefined, failingOn("arrivals", 401)), { message: "the arrival board refused the key, or the address isn't the product the key is for (401)" });
  await assert.rejects(fetchJourneys(settings, undefined, failingOn("arrivals", 404)), { message: "the arrival board replied 404, so check TRAINS_ARRIVALS_URL ends just before the station code" });
  await assert.rejects(fetchJourneys(settings, undefined, failingOn("test-board", 403)), { message: "the detailed departure board refused the key, or the address isn't the product the key is for (403)" });
  await assert.rejects(fetchJourneys(settings, undefined, failingOn("test-board", 404)), { message: "the detailed departure board replied 404, so check TRAINS_BOARD_URL ends just before the station code" });
  const redirected = (async () => {
    throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") });
  }) as unknown as typeof fetch;
  await assert.rejects(fetchJourneys(settings, undefined, redirected), { message: /^the (arrival|detailed departure) board's address redirected somewhere else, so check TRAINS_(ARRIVALS|BOARD)_URL$/ });
  const { journey: _journey, ...direct } = settings;
  await assert.rejects(fetchJourneyBoards(direct), { message: "no change station is set" });
});
