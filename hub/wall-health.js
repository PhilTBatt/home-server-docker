// @ts-check

export const healthStates = ["ok", "warn", "problem", "off", "unchecked"];
export const healthGroupIds = ["front", "media", "watching", "jarvis"];
export const healthCardIds = ["kuma", "heartbeat", "backups"];
export const beatWidth = 1248;
export const beatBase = 64;
export const beatGap = 156;
const beatShape = [[0, 0], [6, -5], [13, 0], [18, 6], [22, -35], [29, 22], [35, 0], [48, -6], [61, 0]];

/**
 * @typedef {{ id: string, state: string, line: string, note: string }} HealthTile
 * @typedef {{ id: string, title: string, note: string, tiles: HealthTile[] }} HealthGroup
 * @typedef {{ id: string, title: string, state: string, value: string, note: string }} HealthCard
 * @typedef {{ name: string, state: string }} HealthOther
 * @typedef {{ used: number, total: number }} Use
 * @typedef {{ kind: "health", state: string, headline: string, unchecked: number, groups: HealthGroup[], cards: HealthCard[], others: HealthOther[], memory: Use | null, disk: Use | null, memoryState: string, diskState: string, upSeconds: number | null, beat: boolean }} HealthPage
 * @typedef {{ label: string, value: string, pct: number | null, state: string }} VitalView
 * @typedef {{ headline: string, sub: string, dot: string, groups: HealthGroup[], cards: HealthCard[], others: HealthOther[], vitals: VitalView[], up: string, beat: boolean, points: string }} HealthView
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {number} most
 * @param {boolean} [empty]
 * @returns {boolean}
 */
function isText(value, most, empty = false) {
  return typeof value === "string" && (empty || value.length > 0) && value.length <= most;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUse(value) {
  return value === null || (isObject(value) && typeof value.used === "number" && typeof value.total === "number" && Number.isFinite(value.used) && Number.isFinite(value.total) && value.total > 0 && value.used >= 0 && value.used <= value.total);
}

/**
 * @param {unknown} value
 * @returns {value is HealthPage}
 */
export function isHealthPage(value) {
  if (!isObject(value) || value.kind !== "health" || !["ok", "warn", "problem", "unknown"].includes(String(value.state)) || !isText(value.headline, 60) || typeof value.unchecked !== "number" || typeof value.beat !== "boolean") return false;
  if (!isUse(value.memory) || !isUse(value.disk) || !healthStates.includes(String(value.memoryState)) || !healthStates.includes(String(value.diskState)) || !(value.upSeconds === null || (typeof value.upSeconds === "number" && Number.isFinite(value.upSeconds) && value.upSeconds >= 0))) return false;
  if (!Array.isArray(value.groups) || value.groups.length !== healthGroupIds.length || !Array.isArray(value.cards) || value.cards.length !== healthCardIds.length || !Array.isArray(value.others) || value.others.length > 12) return false;
  const groupsFit = value.groups.every((group, i) => isObject(group) && group.id === healthGroupIds[i] && isText(group.title, 30) && isText(group.note, 30) && Array.isArray(group.tiles) && group.tiles.length <= 7 && group.tiles.every((tile) => isObject(tile) && isText(tile.id, 30) && healthStates.includes(String(tile.state)) && isText(tile.line, 40) && isText(tile.note, 30, true)));
  const cardsFit = value.cards.every((card, i) => isObject(card) && card.id === healthCardIds[i] && isText(card.title, 30) && healthStates.includes(String(card.state)) && isText(card.value, 30) && isText(card.note, 80));
  const othersFit = value.others.every((other) => isObject(other) && isText(other.name, 24) && healthStates.includes(String(other.state)));
  return groupsFit && cardsFit && othersFit;
}

/**
 * @param {number} seconds
 * @returns {string}
 */
export function upWords(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const unit = (/** @type {number} */ count, /** @type {string} */ word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (days > 0) return `Up ${unit(days, "day")}${hours > 0 ? `, ${unit(hours, "hour")}` : ""}`;
  if (hours > 0) return `Up ${unit(hours, "hour")}`;
  return `Up ${unit(minutes, "minute")}`;
}

/**
 * @param {boolean} beat
 * @returns {string}
 */
export function beatPoints(beat) {
  if (!beat) return `0,${beatBase} ${beatWidth},${beatBase}`;
  /** @type {string[]} */
  const points = [`0,${beatBase}`];
  for (let x0 = 40; x0 + 61 < beatWidth; x0 += beatGap) for (const [dx, dy] of beatShape) points.push(`${x0 + dx},${beatBase + dy}`);
  points.push(`${beatWidth},${beatBase}`);
  return points.join(" ");
}

/**
 * @param {HealthPage} page
 * @returns {HealthView}
 */
export function healthView(page) {
  const pct = (/** @type {Use} */ use) => Math.round((use.used / use.total) * 100);
  const memory = page.memory === null ? { label: "Memory", value: "Couldn't read it", pct: null, state: page.memoryState } : { label: "Memory", value: `${(page.memory.used / 1024).toFixed(1)} of ${(page.memory.total / 1024).toFixed(1)} GB in use`, pct: pct(page.memory), state: page.memoryState };
  const disk = page.disk === null ? { label: "Disk", value: "Couldn't read it", pct: null, state: page.diskState } : { label: "Disk", value: `${Math.round(page.disk.used)} of ${Math.round(page.disk.total)} GB in use`, pct: pct(page.disk), state: page.diskState };
  return {
    headline: page.headline,
    sub: page.unchecked === 0 ? "" : `· ${page.unchecked} not checked by the hub`,
    dot: page.state === "ok" ? "ok" : page.state === "warn" ? "warn" : page.state === "problem" ? "problem" : "unknown",
    groups: page.groups,
    cards: page.cards,
    others: page.others,
    vitals: [memory, disk],
    up: page.upSeconds === null ? "Up time unknown" : upWords(page.upSeconds),
    beat: page.beat,
    points: beatPoints(page.beat),
  };
}

export const healthNote = "Only what the hub already checks. It has no Docker access, so a container it doesn't check says so, and the CPU and heat aren't read.";
