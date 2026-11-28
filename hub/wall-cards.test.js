// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { bubbleAround, bubbleFor, byLine, cardFor, cornerStep, framesASecond, fromHub, isPageView, itemBox, movePointer, nextCorner, openHere, pageLeftMs, pageShownMs, pointerIdleMs, pointerShown, privateOf, stillOpen, trailOf } from "./wall-cards.js";

/** @type {import("./wall-cards.js").OpenPage} */
const page = { id: "server", title: "The server", by: "words", ageMs: 0 };

/**
 * @param {Partial<import("./wall-cards.js").OpenPage>} fields
 * @param {number} seenAt
 * @returns {import("./wall-cards.js").Opened}
 */
function opened(fields = {}, seenAt = 0) {
  return { page: { ...page, ...fields }, seenAt, here: fields.by === "here" };
}

/**
 * @param {Partial<import("./wall-cards.js").PageView>} fields
 * @returns {import("./wall-cards.js").PageView}
 */
function view(fields = {}) {
  return { page: null, opens: 0, backs: 0, privateNow: [], ...fields };
}

/**
 * @param {Partial<import("./wall-logic.js").WallPicture>} fields
 * @returns {import("./wall-logic.js").WallPicture}
 */
function picture(fields = {}) {
  return { at: "2026-11-28T08:00:00.000Z", clock: "08:00", day: "Saturday morning", phase: "morning", mode: "normal", modeUntil: null, speaking: "wobble", items: [], train: null, timers: [], playing: null, ...fields };
}

const deals = { key: "deals", label: "Deals", value: "2 deals", note: "ends tomorrow", colour: "accent", needs: false };

test("a page shows for two minutes from when it was opened, counting the time since the screen heard", () => {
  assert.equal(pageShownMs, 120_000);
  assert.equal(pageLeftMs(opened({}, 1000), 1000), 120_000);
  assert.equal(pageLeftMs(opened({ ageMs: 30_000 }, 1000), 31_000), 60_000);
  assert.equal(pageLeftMs(opened({ ageMs: 100_000 }, 0), 25_000), 0);
  assert.equal(pageLeftMs(null, 0), 0);
  assert.equal(pageLeftMs(opened({}, 5000), 1000), 120_000, "a clock that goes back counts as no time passing");
  const one = opened();
  assert.equal(stillOpen(one, 119_999), one);
  assert.equal(stillOpen(one, 120_000), null);
});

test("what the hub says is checked before it's used", () => {
  assert.ok(isPageView(view()));
  assert.ok(isPageView(view({ page: { id: "server", title: "The server", by: "jarvis", ageMs: 10 } })));
  for (const bad of [null, {}, { ...view(), opens: "1" }, { ...view(), privateNow: [3] }, { ...view(), privateNow: undefined }, view({ page: /** @type {never} */ ({ id: "server", title: "x", by: "here", ageMs: 0 }) }), view({ page: /** @type {never} */ ({ id: "server", title: "x", by: "words", ageMs: -1 }) }), view({ page: /** @type {never} */ ({ id: "server", by: "words", ageMs: 0 }) })]) assert.equal(isPageView(bad), false, JSON.stringify(bad));
});

test("which pages are private is taken from what the hub says even when the rest of it is refused, so the screen never asks with an old list", () => {
  const badPage = { ...view({ page: /** @type {never} */ ({ id: "server", title: "x", by: "words", ageMs: -1 }) }), privateNow: ["deals"] };
  assert.equal(isPageView(badPage), false);
  assert.deepEqual(privateOf(badPage, []), ["deals"]);
  for (const bad of [null, {}, { privateNow: [3] }, { privateNow: "deals" }]) assert.deepEqual(privateOf(bad, ["kept"]), ["kept"], JSON.stringify(bad));
});

test("a page the hub opens shows at once, even over one opened here, and a repeat of the same opening doesn't restart it", () => {
  const hubPage = { id: "backup", title: "The backup", by: /** @type {const} */ ("words"), ageMs: 0 };
  const first = fromHub(null, view({ page: hubPage, opens: 1 }), { opens: null, backs: null }, 1000);
  assert.deepEqual(first.opened, { page: hubPage, seenAt: 1000, here: false }, "one already open when the screen starts shows too");
  const again = fromHub(first.opened, view({ page: { ...hubPage, ageMs: 20_000 }, opens: 1 }), first.seen, 21_000);
  assert.equal(pageLeftMs(again.opened, 21_000), 100_000);
  const mine = /** @type {import("./wall-cards.js").Opened} */ (openHere(deals, [], 30_000));
  const kept = fromHub(mine, view({ page: { ...hubPage, ageMs: 30_000 }, opens: 1 }), again.seen, 31_000);
  assert.equal(kept.opened, mine, "the hub's older page doesn't take over one opened here");
  const newer = fromHub(mine, view({ page: { ...hubPage, id: "server", ageMs: 0 }, opens: 2 }), kept.seen, 32_000);
  assert.equal(newer.opened?.page.id, "server");
});

test("back closes whatever's open, the hub's or one opened here, and the hub's page closing closes only its own", () => {
  const mine = /** @type {import("./wall-cards.js").Opened} */ (openHere(deals, [], 0));
  assert.equal(fromHub(mine, view({ backs: 1 }), { opens: 0, backs: 0 }, 10).opened, null);
  assert.equal(fromHub(mine, view(), { opens: 0, backs: 0 }, 10).opened, mine, "nothing open on the hub doesn't close one opened here");
  const hubs = opened({ id: "alerts", by: "jarvis" });
  assert.equal(fromHub(hubs, view(), { opens: 1, backs: 0 }, 10).opened, null, "the hub's page timing out or being hidden closes it");
  const both = fromHub(hubs, view({ page: { id: "server", title: "The server", by: "words", ageMs: 0 }, opens: 2, backs: 1 }), { opens: 1, backs: 0 }, 10);
  assert.equal(both.opened?.page.id, "server", "a back and a new opening together leave the new one");
  assert.deepEqual(both.seen, { opens: 2, backs: 1 });
});

test("a page opened here closes when guest mode makes it private, and a private one can't be opened here in guest mode", () => {
  const mine = /** @type {import("./wall-cards.js").Opened} */ (openHere(deals, [], 0));
  assert.deepEqual(mine, { page: { id: "deals", title: "Deals", by: "here", ageMs: 0 }, seenAt: 0, here: true });
  assert.equal(fromHub(mine, view({ privateNow: ["deals"] }), { opens: 0, backs: 0 }, 10).opened, null);
  assert.equal(openHere(deals, ["deals"], 0), null);
  assert.ok(openHere(deals, ["server"], 0) !== null);
});

test("a page's card is made from what the wall already shows, under the item's own name, saying who opened it", () => {
  const items = [
    { key: "server", label: "Server", value: "11/12", note: "disk needs a look", colour: "yellow", needs: false },
    { key: "reminder", label: "Reminder", value: "19:30", note: "Take the bins out", colour: "yellow", needs: false },
    { key: "music", label: "Now playing", value: "Song", note: "Band", colour: "accent", needs: false },
    { key: "train", label: "Next train", value: "07:14", note: "on time · plat 2", colour: "accent", needs: false },
  ];
  const shown = picture({ items, train: { leaves: "07:14", expected: "On time", platform: "2", to: "Midtown", cancelled: false, late: false, inMinutes: 20 } });
  assert.deepEqual(cardFor(page, shown, 0), { kind: "Server", title: "11/12", facts: ["disk needs a look"], colour: "yellow", empty: false, by: "You asked" });
  assert.deepEqual(cardFor({ ...page, id: "reminder", title: "Reminders", by: "jarvis" }, shown, 0), { kind: "Reminder", title: "Take the bins out", facts: ["19:30"], colour: "yellow", empty: false, by: "Jarvis" });
  assert.deepEqual(cardFor({ ...page, id: "music", title: "Now playing", by: "here" }, shown, 0), { kind: "Now playing", title: "Song", facts: ["Band"], colour: "accent", empty: false, by: "" });
  assert.deepEqual(cardFor({ ...page, id: "train", title: "Your next train" }, shown, 5 * 60_000), { kind: "Next train", title: "07:14 to Midtown", facts: ["On time", "Platform 2", "Leaves in 15 minutes"], colour: "accent", empty: false, by: "You asked" });
  assert.deepEqual(["words", "jarvis", "here"].map((by) => byLine(/** @type {"words"} */ (by))), ["You asked", "Jarvis", ""]);
});

test("a page with nothing on the wall behind it says so, under the page's title, rather than showing an empty card", () => {
  const empty = { kind: "Deals", title: "Nothing to show", facts: ["It may be switched off on the hub, or there's nothing right now."], colour: "grey", empty: true, by: "You asked" };
  assert.deepEqual(cardFor({ ...page, id: "deals", title: "Deals" }, picture(), 0), empty);
  assert.deepEqual(cardFor({ ...page, id: "deals", title: "Deals" }, null, 0), empty);
  const none = picture({ items: [{ key: "reminder", label: "Reminder", value: "none", note: "nothing coming up", colour: "grey", needs: false }] });
  assert.deepEqual(cardFor({ ...page, id: "reminder", title: "Reminders" }, none, 0).title, "none");
});

test("each item's box, for the pointer, covers its dot and its words on whichever side they sit", () => {
  assert.deepEqual(itemBox(1000, 300, "right"), { left: 990, top: 272, width: 234, height: 76 });
  assert.deepEqual(itemBox(300, 300, "left"), { left: 76, top: 272, width: 234, height: 76 });
  assert.deepEqual(itemBox(640, 130, "top"), { left: 540, top: 42, width: 200, height: 94 });
  assert.deepEqual(itemBox(640, 620, "bottom"), { left: 540, top: 614, width: 200, height: 92 });
  for (const side of /** @type {const} */ (["right", "left", "top", "bottom"])) {
    const box = itemBox(500, 400, side);
    assert.ok(500 >= box.left && 500 <= box.left + box.width && 400 >= box.top && 400 <= box.top + box.height, `${side} covers the dot`);
  }
  assert.deepEqual(bubbleAround({ left: 100, top: 100, width: 50, height: 20 }), { left: 86, top: 86, width: 78, height: 48 });
});

test("the pointer's bubble goes to the nearest thing within reach, and to nothing when there's nothing near", () => {
  const boxes = [
    { left: 100, top: 100, width: 40, height: 20 },
    { left: 150, top: 100, width: 40, height: 20 },
    { left: 700, top: 40, width: 500, height: 400 },
  ];
  assert.equal(bubbleFor({ x: 110, y: 110 }, boxes), 0);
  assert.equal(bubbleFor({ x: 160, y: 110 }, boxes), 1);
  assert.equal(bubbleFor({ x: 145, y: 110 }, boxes), 0, "between two, the nearer centre wins");
  assert.equal(bubbleFor({ x: 90, y: 90 }, boxes), 0, "a little outside still reaches it");
  assert.equal(bubbleFor({ x: 50, y: 50 }, boxes), null);
  assert.equal(bubbleFor({ x: 900, y: 200 }, boxes), 2, "a card is reached anywhere on it");
  assert.equal(bubbleFor({ x: 90, y: 90 }, boxes, 0), null);
});

test("the trail keeps the last few points of the last half second", () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i, at: 1000 + i * 50 }));
  assert.deepEqual(trailOf(points, 1450).map((point) => point.x), [4, 5, 6, 7, 8, 9]);
  assert.deepEqual(trailOf(points, 2000), []);
});

test("the remote's arrows move the pointer, faster when held and finer with Shift, and never off the wall", () => {
  assert.deepEqual(movePointer({ x: 640, y: 360 }, "ArrowRight", { repeat: false, shift: false }), { x: 670, y: 360 });
  assert.deepEqual(movePointer({ x: 640, y: 360 }, "ArrowUp", { repeat: true, shift: false }), { x: 640, y: 300 });
  assert.deepEqual(movePointer({ x: 640, y: 360 }, "ArrowLeft", { repeat: true, shift: true }), { x: 630, y: 360 });
  assert.deepEqual(movePointer({ x: 10, y: 710 }, "ArrowLeft", { repeat: true, shift: false }), { x: 0, y: 710 });
  assert.deepEqual(movePointer({ x: 1270, y: 710 }, "ArrowDown", { repeat: false, shift: false }), { x: 1270, y: 720 });
  assert.equal(movePointer({ x: 0, y: 0 }, "Enter", { repeat: false, shift: false }), null);
});

test("the pointer shows while it's being moved and fades after a while", () => {
  assert.equal(pointerShown(0, pointerIdleMs - 1), true);
  assert.equal(pointerShown(0, pointerIdleMs), false);
  assert.equal(pointerShown(-Infinity, 0), false, "before it's ever moved");
});

test("with a remote, OK picks each corner in turn and then the save button, and held arrows go faster", () => {
  assert.equal(nextCorner(null), 0);
  assert.deepEqual([0, 1, 2].map(nextCorner), [1, 2, 3]);
  assert.equal(nextCorner(3), "save");
  assert.deepEqual([cornerStep(false, false), cornerStep(true, false), cornerStep(false, true), cornerStep(true, true)], [1, 8, 10, 10]);
});

test("the debug counter counts the frames drawn in the last second", () => {
  assert.equal(framesASecond([0, 100, 500, 999, 1000, 1500], 1500), 3, "a frame exactly a second ago is out");
  assert.equal(framesASecond([], 0), 0);
});
