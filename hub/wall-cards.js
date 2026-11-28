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
  if (picture !== null && item === undefined && detailPages.includes(page.id)) return { kind: page.title, title: `Reading ${page.title.charAt(0).toLowerCase()}${page.title.slice(1)}`, facts: ["If this stays, the hub couldn't be read just now."], colour: "grey", empty: true, by };
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

export const detailPages = ["train", "server", "switches", "security", "health", "code", "how"];
export const detailEveryMs = 30_000;
export const trainRowsShown = 4;
export const detailKeptMs = 2 * detailEveryMs;

/**
 * @typedef {{ id: string | null, details: unknown, at: string, goodAt: number }} HeldDetails
 */

/**
 * @param {HeldDetails} held
 * @param {string} id
 * @param {{ details: unknown, at: string } | null | undefined} got
 * @param {number} now
 * @returns {HeldDetails}
 */
export function nextDetails(held, id, got, now) {
  if (got !== undefined && got !== null) return { id, details: got.details, at: got.at, goodAt: now };
  if (got === undefined && held.id === id && held.details !== null && now - held.goodAt < detailKeptMs) return { ...held };
  return { id, details: null, at: "", goodAt: -Infinity };
}

/**
 * @param {HeldDetails} held
 * @param {string} id
 * @param {number} now
 * @returns {unknown}
 */
export function detailsShown(held, id, now) {
  return held.id === id && now - held.goodAt <= detailKeptMs ? held.details : null;
}

/**
 * @typedef {{ arrives: string | null, leaves: string, expected: string, platform: string | null, minutes: number | null, bus: boolean }} TrainChange
 * @typedef {{ leaves: string, expected: string, late: boolean, cancelled: boolean, bus: boolean, platform: string | null, destination: string | null, arrives: string | null, arrivesExpected: string | null, change: TrainChange | null, tight: boolean }} TrainRow
 * @typedef {{ kind: "trains", from: string, via: string | null, to: string, rows: TrainRow[], updates: number }} TrainDetails
 * @typedef {{ leaves: string, leavesWas: string | null, arrives: string, arrivesWas: string | null, platform: string, status: string, tone: "good" | "warm" | "muted", second: string }} TrainRowView
 */

/**
 * @param {unknown} value
 * @returns {value is string | null}
 */
function isTextOrNull(value) {
  return value === null || typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is TrainDetails}
 */
export function isTrainDetails(value) {
  if (!isObject(value) || value.kind !== "trains" || typeof value.from !== "string" || !isTextOrNull(value.via) || typeof value.to !== "string" || typeof value.updates !== "number" || !Array.isArray(value.rows)) return false;
  return value.rows.every((row) => {
    if (!isObject(row) || typeof row.leaves !== "string" || typeof row.expected !== "string" || typeof row.late !== "boolean" || typeof row.cancelled !== "boolean" || !isTextOrNull(row.platform) || !isTextOrNull(row.destination) || !isTextOrNull(row.arrives) || !isTextOrNull(row.arrivesExpected)) return false;
    const change = row.change;
    return change === null || (isObject(change) && typeof change.leaves === "string" && typeof change.expected === "string" && isTextOrNull(change.arrives) && isTextOrNull(change.platform) && (change.minutes === null || typeof change.minutes === "number"));
  });
}

/**
 * @param {string} text
 * @returns {number | null}
 */
function minutesOfDay(text) {
  const match = /^(\d\d):(\d\d)$/.exec(text);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/**
 * @param {string} due
 * @param {string} expected
 * @returns {number | null}
 */
export function minutesLate(due, expected) {
  const was = minutesOfDay(due);
  const now = minutesOfDay(expected);
  if (was === null || now === null) return null;
  const late = (now - was + 24 * 60) % (24 * 60);
  return late > 12 * 60 ? null : late;
}

/**
 * @param {string} due
 * @param {string | null} expected
 * @returns {{ shown: string, was: string | null }}
 */
function timeShown(due, expected) {
  if (expected !== null && /^\d\d:\d\d$/.test(expected) && expected !== due) return { shown: expected, was: due };
  return { shown: due, was: null };
}

/**
 * @param {TrainRow} row
 * @param {string | null} via
 * @returns {TrainRowView}
 */
export function trainRowView(row, via) {
  const leaves = timeShown(row.leaves, row.expected);
  const arrives = row.arrives === null ? { shown: "", was: null } : timeShown(row.arrives, row.arrivesExpected);
  const late = minutesLate(row.leaves, row.expected);
  let status = "On time";
  /** @type {"good" | "warm" | "muted"} */
  let tone = "good";
  if (row.cancelled) [status, tone] = ["Cancelled", "warm"];
  else if (row.expected === "Delayed") [status, tone] = ["Delayed", "warm"];
  else if (row.expected === "No time yet") [status, tone] = ["No time yet", "muted"];
  else if (late !== null && late > 0) [status, tone] = [`${late} min late`, "warm"];
  if (row.bus && !row.cancelled) status = `${status}, by bus`;
  let second = row.destination === null ? "" : `To ${row.destination}`;
  const change = row.change;
  if (change !== null && via !== null) {
    const out = timeShown(change.leaves, change.expected).shown;
    const parts = [`Change at ${via}: ${change.arrives === null ? "" : `${change.arrives} to `}${out}`, change.platform === null ? "" : `, platform ${change.platform}`, change.minutes === null ? "" : ` (${change.minutes} min)`, change.bus ? ", by bus" : "", row.tight ? ". An earlier one if you run" : ""];
    second = parts.join("");
  } else if (via !== null) second = row.cancelled ? "" : "No connection on the board yet";
  return { leaves: leaves.shown, leavesWas: leaves.was, arrives: arrives.shown, arrivesWas: arrives.was, platform: row.platform ?? "", status, tone, second };
}

/**
 * @param {TrainDetails} details
 * @param {string} checkedAt
 * @returns {{ title: string, sub: string, empty: string | null, rows: TrainRowView[], plain: boolean }}
 */
export function trainView(details, checkedAt) {
  const sub = [details.via === null ? "" : `Change at ${details.via}`, details.updates === 0 ? "" : details.updates === 1 ? "1 update on the board" : `${details.updates} updates on the board`, checkedAt === "" ? "" : `checked ${checkedAt}`].filter((part) => part !== "").join(" · ");
  const rows = details.rows.slice(0, trainRowsShown).map((row) => trainRowView(row, details.via));
  return { title: `${details.from} → ${details.to}`, sub, empty: rows.length === 0 ? "Nothing on the board right now. It only looks about two hours ahead." : null, rows, plain: details.via === null };
}
