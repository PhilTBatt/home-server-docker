// @ts-check
import { leavesText, trainState } from "./wall-logic.js";

/**
 * @typedef {import("./wall-logic.js").WallPicture} WallPicture
 * @typedef {import("./wall-logic.js").WallItem} WallItem
 * @typedef {{ id: string, title: string, by: "words" | "jarvis" | "here", ageMs: number }} OpenPage
 * @typedef {{ page: OpenPage, seenAt: number, here: boolean }} Opened
 * @typedef {{ opens: number | null, backs: number | null }} Seen
 * @typedef {{ page: { id: string, title: string, by: "words" | "jarvis", ageMs: number } | null, opens: number, backs: number, privateNow: string[] }} PageView
 * @typedef {{ kind: string, title: string, facts: string[], colour: string, empty: boolean, by: string }} Card
 * @typedef {{ left: number, top: number, width: number, height: number }} Box
 * @typedef {{ x: number, y: number }} Spot
 * @typedef {{ x: number, y: number, at: number }} Point
 * @typedef {"left" | "right" | "top" | "bottom"} Side
 */

export const pageShownMs = 120_000;
export const bubbleReach = 28;
export const trailMs = 450;
export const trailMost = 6;
export const pointerIdleMs = 8_000;
export const stepPx = 30;
export const fineStepPx = 10;
export const heldStepPx = 60;
export const wordsWidth = 200;
export const wordsHeight = 72;
export const stageSize = { width: 1280, height: 720 };
export const cardBox = { left: 700, top: 96, width: 520, height: 420 };
export const fitChip = { left: 1080, top: 640, width: 160, height: 44 };

/** @type {Record<string, [number, number]>} */
export const arrowSteps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} view
 * @param {string[]} kept
 * @returns {string[]}
 */
export function privateOf(view, kept) {
  return isObject(view) && Array.isArray(view.privateNow) && view.privateNow.every((id) => typeof id === "string") ? view.privateNow : kept;
}

/**
 * @param {unknown} view
 * @returns {view is PageView}
 */
export function isPageView(view) {
  if (!isObject(view) || typeof view.opens !== "number" || typeof view.backs !== "number" || !Array.isArray(view.privateNow) || !view.privateNow.every((id) => typeof id === "string")) return false;
  const page = view.page;
  if (page === null) return true;
  return isObject(page) && typeof page.id === "string" && typeof page.title === "string" && (page.by === "words" || page.by === "jarvis") && typeof page.ageMs === "number" && Number.isFinite(page.ageMs) && page.ageMs >= 0;
}

/**
 * @param {Opened | null} opened
 * @param {number} now
 * @returns {number}
 */
export function pageLeftMs(opened, now) {
  if (opened === null) return 0;
  return Math.max(0, pageShownMs - opened.page.ageMs - Math.max(0, now - opened.seenAt));
}

/**
 * @param {Opened | null} opened
 * @param {number} now
 * @returns {Opened | null}
 */
export function stillOpen(opened, now) {
  return pageLeftMs(opened, now) > 0 ? opened : null;
}

/**
 * @param {Opened | null} opened
 * @param {PageView} view
 * @param {Seen} seen
 * @param {number} now
 * @returns {{ opened: Opened | null, seen: Seen }}
 */
export function fromHub(opened, view, seen, now) {
  let next = opened;
  if (seen.backs !== null && view.backs !== seen.backs) next = null;
  if (view.page !== null && (seen.opens === null || view.opens !== seen.opens)) next = { page: view.page, seenAt: now, here: false };
  else if (view.page === null && next !== null && !next.here) next = null;
  if (next !== null && next.here && view.privateNow.includes(next.page.id)) next = null;
  return { opened: next, seen: { opens: view.opens, backs: view.backs } };
}

/**
 * @param {WallItem} item
 * @param {string[]} privateNow
 * @param {number} now
 * @returns {Opened | null}
 */
export function openHere(item, privateNow, now) {
  if (privateNow.includes(item.key)) return null;
  return { page: { id: item.key, title: item.label, by: "here", ageMs: 0 }, seenAt: now, here: true };
}

/**
 * @param {"words" | "jarvis" | "here"} by
 * @returns {string}
 */
export function byLine(by) {
  if (by === "words") return "You asked";
  if (by === "jarvis") return "Jarvis";
  return "";
}

/**
 * @param {OpenPage} page
 * @param {WallPicture | null} picture
 * @param {number} sinceMs
 * @returns {Card}
 */
export function cardFor(page, picture, sinceMs) {
  const item = picture?.items.find((one) => one.key === page.id);
  const by = byLine(page.by);
  if (picture === null || item === undefined) return { kind: page.title, title: "Nothing to show", facts: ["It may be switched off on the hub, or there's nothing right now."], colour: "grey", empty: true, by };
  if (page.id === "train" && picture.train !== null) {
    const train = picture.train;
    const facts = [trainState(train), train.platform === null ? "" : `Platform ${train.platform}`, leavesText(train.inMinutes, sinceMs)].filter((one) => one !== "");
    return { kind: item.label, title: train.to === "" ? train.leaves : `${train.leaves} to ${train.to}`, facts, colour: item.colour, empty: false, by };
  }
  if (page.id === "reminder" && item.value !== "none") return { kind: item.label, title: item.note, facts: [item.value], colour: item.colour, empty: false, by };
  return { kind: item.label, title: item.value, facts: item.note === "" ? [] : [item.note], colour: item.colour, empty: false, by };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {Side} side
 * @returns {Box}
 */
export function itemBox(x, y, side) {
  if (side === "right") return { left: x - 10, top: y - 28, width: wordsWidth + 34, height: wordsHeight + 4 };
  if (side === "left") return { left: x - wordsWidth - 24, top: y - 28, width: wordsWidth + 34, height: wordsHeight + 4 };
  if (side === "top") return { left: x - wordsWidth / 2, top: y - wordsHeight - 16, width: wordsWidth, height: wordsHeight + 22 };
  return { left: x - wordsWidth / 2, top: y - 6, width: wordsWidth, height: wordsHeight + 20 };
}

/**
 * @param {Spot} point
 * @param {Box[]} boxes
 * @param {number} [reach]
 * @returns {number | null}
 */
export function bubbleFor(point, boxes, reach = bubbleReach) {
  let best = null;
  let bestDistance = Infinity;
  boxes.forEach((box, i) => {
    const inside = point.x >= box.left - reach && point.x <= box.left + box.width + reach && point.y >= box.top - reach && point.y <= box.top + box.height + reach;
    if (!inside) return;
    const distance = Math.hypot(point.x - (box.left + box.width / 2), point.y - (box.top + box.height / 2));
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * @param {Point[]} points
 * @param {number} now
 * @returns {Point[]}
 */
export function trailOf(points, now) {
  return points.filter((point) => now - point.at <= trailMs).slice(-trailMost);
}

/**
 * @param {Spot} point
 * @param {string} key
 * @param {{ repeat: boolean, shift: boolean }} how
 * @returns {Spot | null}
 */
export function movePointer(point, key, how) {
  const step = arrowSteps[key];
  if (step === undefined) return null;
  const by = how.shift ? fineStepPx : how.repeat ? heldStepPx : stepPx;
  return { x: Math.min(stageSize.width, Math.max(0, point.x + step[0] * by)), y: Math.min(stageSize.height, Math.max(0, point.y + step[1] * by)) };
}

/**
 * @param {number} lastMovedAt
 * @param {number} now
 * @returns {boolean}
 */
export function pointerShown(lastMovedAt, now) {
  return now - lastMovedAt < pointerIdleMs;
}

/**
 * @param {Box} box
 * @param {number} [pad]
 * @returns {Box}
 */
export function bubbleAround(box, pad = 14) {
  return { left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
}

/**
 * @param {number | null} picked
 * @returns {number | "save"}
 */
export function nextCorner(picked) {
  if (picked === null) return 0;
  return picked >= 3 ? "save" : picked + 1;
}

/**
 * @param {boolean} repeat
 * @param {boolean} shift
 * @returns {number}
 */
export function cornerStep(repeat, shift) {
  if (shift) return 10;
  return repeat ? 8 : 1;
}

/**
 * @param {number[]} frames
 * @param {number} now
 * @returns {number}
 */
export function framesASecond(frames, now) {
  return frames.filter((at) => now - at < 1000).length;
}
