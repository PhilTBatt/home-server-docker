// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { modeColours, arrivalsBetween, bedtimeLine, captionFor, countdownMostMs, countdownOf, countdownText, heardShownMs, itemColour, lastWords, leavesText, londonClock, middleFor, middleKey, modeColour, mostCaptionChars, orbitSlots, poseFor, poseLabels, saidShownMs, timerMiddleMs, trainState, unknownVoiceColour, voiceColour, voiceColours } from "./wall-logic.js";

/** @type {import("./wall-logic.js").JarvisView} */
const running = { seq: 1, running: true, activity: "waiting", muted: false, heard: null, said: null, saidAgeMs: null };

/**
 * @param {Partial<import("./wall-logic.js").WallItem>} fields
 * @returns {import("./wall-logic.js").WallItem}
 */
const item = (fields) => ({ key: "server", label: "Server", value: "2/2", note: "all good", colour: "mint", needs: false, ...fields });

const train = { leaves: "07:14", expected: "On time", platform: "2", to: "B", cancelled: false, late: false, inMinutes: 12 };
const now = Date.parse("2026-11-30T07:02:00Z");

test("every mode has its colour, and an unknown one is normal's", () => {
  assert.equal(modeColour("gaming"), "#FF9F5A");
  assert.equal(modeColour("coding"), "#F5D547");
  assert.equal(modeColour("bedtime"), "#8FA8FF");
  assert.equal(modeColour("guest"), "#5EE3B0");
  assert.equal(modeColour(null), "#5FD4F4");
  assert.equal(modeColour("toString"), "#5FD4F4");
  assert.equal(itemColour("mint", "#000"), "#5EE3B0");
  assert.equal(itemColour("accent", "#123456"), "#123456");
  assert.equal(itemColour("constructor", "#123456"), "#123456");
});

test("the pose follows what he's doing first, then the mic, the mode and the phase", () => {
  assert.equal(poseFor({ jarvis: running, connected: false, mode: null, phase: "daytime" }), "lost");
  assert.equal(poseFor({ jarvis: null, connected: true, mode: null, phase: "daytime" }), "off");
  assert.equal(poseFor({ jarvis: { ...running, running: false }, connected: true, mode: null, phase: "daytime" }), "off");
  assert.equal(poseFor({ jarvis: { ...running, activity: "speaking", muted: true }, connected: true, mode: "guest", phase: "bedtime" }), "speaking");
  assert.equal(poseFor({ jarvis: { ...running, muted: true }, connected: true, mode: "guest", phase: "bedtime" }), "muted");
  assert.equal(poseFor({ jarvis: running, connected: true, mode: "guest", phase: "bedtime" }), "guest");
  assert.equal(poseFor({ jarvis: running, connected: true, mode: "bedtime", phase: "bedtime" }), "sleepy");
  assert.equal(poseFor({ jarvis: running, connected: true, mode: "normal", phase: "morning" }), "waiting");
  assert.equal(Object.keys(poseLabels).length, 13);
});

test("orbit slots are spread evenly, starting at the top and going clockwise", () => {
  const orbit = { cx: 640, cy: 390, rx: 440, ry: 265 };
  assert.deepEqual(orbitSlots(0, orbit), []);
  assert.deepEqual(orbitSlots(1, orbit), [{ x: 640, y: 125, side: "top" }]);
  assert.deepEqual(orbitSlots(4, orbit), [{ x: 640, y: 125, side: "top" }, { x: 1080, y: 390, side: "right" }, { x: 640, y: 655, side: "bottom" }, { x: 200, y: 390, side: "left" }]);
  const six = orbitSlots(6, orbit);
  assert.equal(six.length, 6);
  assert.deepEqual(six.map((slot) => slot.side), ["top", "right", "right", "bottom", "left", "left"]);
});

test("the countdown is the next timer inside the hour, as a part of its time that's left", () => {
  assert.equal(countdownOf([], now), null);
  assert.equal(countdownOf([{ text: "Later", due: "2026-11-30T09:00:00Z", from: "2026-11-30T06:00:00Z" }], now), null);
  const counting = countdownOf([{ text: "Gone", due: "2026-11-30T07:00:00Z", from: "" }, { text: "Stretch", due: "2026-11-30T07:12:00Z", from: "2026-11-30T06:52:00Z" }], now);
  assert.equal(counting?.timer.text, "Stretch");
  assert.equal(counting?.remainingMs, 10 * 60 * 1000);
  assert.equal(counting?.fraction, 0.5);
  const long = countdownOf([{ text: "Long", due: "2026-11-30T07:32:00Z", from: "2026-11-29T07:00:00Z" }], now);
  assert.equal(long?.fraction, 30 / 60, "a long one counts its last hour");
  const odd = countdownOf([{ text: "Odd", due: "2026-11-30T07:12:00Z", from: "nonsense" }], now);
  assert.equal(odd?.fraction, 10 / 60);
  assert.equal(countdownMostMs, 3_600_000);
});

test("what drifts to the middle: what needs you, then a timer's last minutes, then something new, then the morning train", () => {
  const timers = [{ text: "Stretch", due: new Date(now + timerMiddleMs).toISOString(), from: new Date(now - 60_000).toISOString() }];
  const base = { items: [item({}), item({ key: "deals", value: "2 new" })], phase: "morning", train, timers: [], arrival: null, now };
  assert.deepEqual(middleFor(base), { kind: "train" });
  assert.equal(middleFor({ ...base, phase: "daytime" }), null);
  assert.equal(middleFor({ ...base, train: null }), null);
  assert.deepEqual(middleFor({ ...base, arrival: "deals" }), { kind: "arrival", key: "deals" });
  assert.deepEqual(middleFor({ ...base, arrival: "gone" }), { kind: "train" });
  assert.deepEqual(middleFor({ ...base, arrival: "deals", timers }), { kind: "timer", timer: timers[0] });
  assert.deepEqual(middleFor({ ...base, timers: [{ ...timers[0], due: new Date(now + timerMiddleMs + 1000).toISOString() }] }), { kind: "train" });
  assert.deepEqual(middleFor({ ...base, timers, items: [...base.items, item({ key: "alerts", needs: true })] }), { kind: "needs", key: "alerts" });
});

test("the middle's key is the orbit item it takes away", () => {
  assert.equal(middleKey(null), null);
  assert.equal(middleKey({ kind: "train" }), "train");
  assert.equal(middleKey({ kind: "needs", key: "alerts" }), "alerts");
  assert.equal(middleKey({ kind: "arrival", key: "music" }), "music");
  assert.equal(middleKey({ kind: "timer", timer: { text: "", due: "", from: "" } }), "reminder");
});

test("something arrives when a part is new, or more deals or alerts come", () => {
  const before = [item({}), item({ key: "deals", value: "1 new" }), item({ key: "alerts", value: "0" }), item({ key: "backup", value: "03:00" })];
  assert.deepEqual(arrivalsBetween(null, before), [], "nothing arrives on the first picture");
  assert.deepEqual(arrivalsBetween(before, before), []);
  assert.deepEqual(arrivalsBetween(before, [...before, item({ key: "music" })]), ["music"]);
  assert.deepEqual(arrivalsBetween(before, [item({}), item({ key: "deals", value: "2 new" }), item({ key: "alerts", value: "1" }), item({ key: "backup", value: "04:00" })]), ["deals", "alerts"]);
  assert.deepEqual(arrivalsBetween(before, [item({ key: "deals", value: "0" })]), []);
});

test("each voice has its colour: yours is the mode's, another's its slot's, one not known plain white, and none is a mode's colour", () => {
  for (const colour of [...voiceColours, unknownVoiceColour]) assert.ok(!Object.values(modeColours).includes(colour), colour);
  assert.equal(new Set(voiceColours).size, 5);
  assert.equal(voiceColour({ text: "", voice: "owner", slot: null, ageMs: 0 }, "#abc"), "#abc");
  assert.equal(voiceColour({ text: "", voice: null, slot: null, ageMs: 0 }, "#abc"), "#abc");
  assert.equal(voiceColour({ text: "", voice: "other", slot: 2, ageMs: 0 }, "#abc"), voiceColours[2]);
  assert.equal(voiceColour({ text: "", voice: "other", slot: 7, ageMs: 0 }, "#abc"), voiceColours[2]);
  assert.equal(voiceColour({ text: "", voice: "unknown", slot: null, ageMs: 0 }, "#abc"), unknownVoiceColour);
});

test("long words keep as many whole sentences from the end as fit, or their end", () => {
  assert.equal(lastWords("  Short  and   sweet. "), "Short and sweet.");
  const long = `${"First part goes on and on. ".repeat(8)}And this is the last sentence he said.`;
  const kept = lastWords(long);
  assert.ok(kept.startsWith("First part goes"), kept);
  assert.ok(kept.endsWith("And this is the last sentence he said."));
  assert.ok(kept.length <= mostCaptionChars);
  const noStops = "word ".repeat(60).trim();
  const cut = lastWords(noStops);
  assert.ok(cut.startsWith("…word"));
  assert.ok(cut.length <= mostCaptionChars + 1);
});

test("the caption is his words while they're fresh, else yours, coloured by voice", () => {
  const heard = { text: "what's on", voice: /** @type {const} */ ("other"), slot: 1, ageMs: 1000 };
  assert.equal(captionFor(null, 0, "#abc"), null);
  assert.equal(captionFor({ ...running, running: false, heard }, 0, "#abc"), null);
  assert.deepEqual(captionFor({ ...running, heard }, 0, "#abc"), { who: "them", text: "what's on", colour: voiceColours[1] });
  assert.deepEqual(captionFor({ ...running, heard: { ...heard, voice: "unknown", slot: null } }, 0, "#abc"), { who: "them", text: "what's on", colour: unknownVoiceColour });
  assert.deepEqual(captionFor({ ...running, heard: { ...heard, voice: "owner", slot: null } }, 0, "#abc"), { who: "you", text: "what's on", colour: "#abc" });
  assert.deepEqual(captionFor({ ...running, heard: { ...heard, voice: null, slot: null } }, 0, "#abc")?.who, "you");
  assert.equal(captionFor({ ...running, heard }, heardShownMs, "#abc"), null);
  assert.deepEqual(captionFor({ ...running, heard, said: "Bins.", saidAgeMs: 500 }, 0, "#abc"), { who: "him", text: "Bins.", colour: "#abc" });
  assert.deepEqual(captionFor({ ...running, heard: { ...heard, ageMs: 100 }, said: "Old.", saidAgeMs: 5000 }, 0, "#abc")?.who, "them", "words heard after his last answer come first");
  assert.equal(captionFor({ ...running, said: "Old.", saidAgeMs: saidShownMs }, 0, "#abc"), null);
});

test("times are written plainly", () => {
  assert.equal(countdownText(0), "0:00");
  assert.equal(countdownText(61_000), "1:01");
  assert.equal(countdownText(59_001), "1:00");
  assert.equal(countdownText(3_725_000), "1:02:05");
  assert.equal(leavesText(null, 0), "");
  assert.equal(leavesText(12, 0), "Leaves in 12 minutes");
  assert.equal(leavesText(12, 11 * 60_000), "Leaves in 1 minute");
  assert.equal(leavesText(1, 60_000), "Leaving now");
  assert.equal(trainState(train), "On time");
  assert.equal(trainState({ ...train, expected: "07:20" }), "Expected 07:20");
  assert.equal(trainState({ ...train, cancelled: true }), "Cancelled");
  assert.equal(trainState({ ...train, expected: "Delayed" }), "Delayed");
  assert.equal(londonClock(new Date("2026-06-01T06:02:00Z")), "07:02");
  assert.equal(londonClock(new Date("2026-11-30T00:05:00Z")), "00:05");
});

test("bedtime's line says all's well, what's next and the train", () => {
  /** @type {import("./wall-logic.js").WallPicture} */
  const picture = { at: "", clock: "23:41", day: "Monday night", phase: "bedtime", mode: "bedtime", modeUntil: null, speaking: "wobble", items: [item({})], train: null, timers: [], playing: null };
  assert.equal(bedtimeLine(picture), "All good");
  assert.equal(bedtimeLine({ ...picture, items: [item({ needs: true })], timers: [{ text: "Alarm", due: "2026-12-01T06:40:00Z", from: "" }], train: { ...train, expected: "07:20" } }), "Something needs a look · Alarm 06:40 · Next train 07:14, expected 07:20");
});
