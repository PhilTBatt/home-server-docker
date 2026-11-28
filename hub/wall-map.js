// @ts-check

export const mapEffects = ["plain", "gate", "spokes", "grid", "radar", "wobble", "sound", "listen", "type", "screen", "star", "fall", "scan", "orbit", "heart", "bars", "external"];
export const mapGroups = ["front", "network", "media", "jarvis", "watching", "outside"];
export const mapStates = ["ok", "warn", "problem", "off", "unchecked"];
export const mapTones = ["good", "warn", "warm", "plain"];
export const mapSides = ["left", "right", "above", "below"];
export const mapHost = { x: 640, y: 376, size: 56 };
export const mapHalos = [
  { group: "media", label: "Media", x: 64, y: 128, w: 416, h: 416, lx: 90, ly: 118 },
  { group: "jarvis", label: "Jarvis", x: 792, y: 232, w: 320, h: 336, lx: 816, ly: 238 },
  { group: "watching", label: "Watching", x: 624, y: 544, w: 336, h: 128, lx: 920, ly: 558 },
];

/**
 * @typedef {{ id: string, group: string, x: number, y: number, size: number, fx: string, side: string, note: string, state: string }} MapNode
 * @typedef {{ from: string, to: string, packets: boolean, outside: boolean }} MapLink
 * @typedef {{ text: string, tone: string }} MapChip
 * @typedef {{ kind: "server", host: string, nodes: MapNode[], links: MapLink[], chips: MapChip[], watched: number }} ServerMap
 * @typedef {{ id: string, left: number, top: number, size: number, fx: string, group: string, state: string, lx: number, ly: number, align: "left" | "right" | "center", note: string, delayMs: number }} NodeView
 * @typedef {{ x: number, y: number, len: number, deg: number, dashed: boolean, packet: boolean, seconds: number, offset: number }} LinkView
 * @typedef {{ host: string, nodes: NodeView[], links: LinkView[], chips: MapChip[], watched: string }} MapView
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
 * @returns {boolean}
 */
function isNumberUpTo(value, most) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= most;
}

/**
 * @param {unknown} value
 * @param {number} most
 * @returns {boolean}
 */
function isTextUpTo(value, most) {
  return typeof value === "string" && value.length <= most;
}

/**
 * @param {unknown} value
 * @returns {value is ServerMap}
 */
export function isServerMap(value) {
  if (!isObject(value) || value.kind !== "server" || !isTextUpTo(value.host, 40) || !Array.isArray(value.nodes) || value.nodes.length > 60 || !Array.isArray(value.links) || value.links.length > 120 || !Array.isArray(value.chips) || value.chips.length > 6 || !isNumberUpTo(value.watched, 60)) return false;
  const nodesFit = value.nodes.every((node) => isObject(node) && isTextUpTo(node.id, 40) && node.id !== "" && mapGroups.includes(String(node.group)) && isNumberUpTo(node.x, 1280) && isNumberUpTo(node.y, 720) && isNumberUpTo(node.size, 60) && typeof node.fx === "string" && mapSides.includes(String(node.side)) && isTextUpTo(node.note, 40) && mapStates.includes(String(node.state)));
  const linksFit = value.links.every((link) => isObject(link) && typeof link.from === "string" && typeof link.to === "string" && typeof link.packets === "boolean" && typeof link.outside === "boolean");
  const chipsFit = value.chips.every((chip) => isObject(chip) && isTextUpTo(chip.text, 120) && mapTones.includes(String(chip.tone)));
  return nodesFit && linksFit && chipsFit;
}

/**
 * @param {MapNode} node
 * @returns {{ lx: number, ly: number, align: "left" | "right" | "center" }}
 */
function labelFor(node) {
  const half = node.size / 2;
  if (node.side === "left") return { lx: -134, ly: half - 7, align: "right" };
  if (node.side === "above") return { lx: half - 64, ly: -19, align: "center" };
  if (node.side === "below") return { lx: half - 64, ly: node.size + 6, align: "center" };
  return { lx: node.size + 8, ly: half - 7, align: "left" };
}

/**
 * @param {ServerMap} map
 * @returns {MapView}
 */
export function mapView(map) {
  const at = new Map(map.nodes.map((node) => [node.id, node]));
  const nodes = map.nodes.map((node, index) => ({
    id: node.id,
    left: node.x - node.size / 2,
    top: node.y - node.size / 2,
    size: node.size,
    fx: mapEffects.includes(node.fx) ? node.fx : "plain",
    group: node.group,
    state: node.state,
    ...labelFor(node),
    note: node.note,
    delayMs: index * 25,
  }));
  /** @type {LinkView[]} */
  const links = [];
  map.links.forEach((link, index) => {
    const from = at.get(link.from);
    const to = at.get(link.to);
    if (from === undefined || to === undefined) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    links.push({ x: from.x, y: from.y, len: Math.round(Math.hypot(dx, dy)), deg: Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)), dashed: link.outside, packet: link.packets, seconds: 2 + (index % 4) * 0.5, offset: -(index % 5) * 0.6 });
  });
  return { host: map.host, nodes, links, chips: map.chips, watched: `${map.watched} watched by the hub; the rest aren't checked` };
}

/**
 * @param {string} state
 * @returns {string}
 */
export function stateWord(state) {
  return state === "warn" ? "needs a look" : state === "problem" ? "problem" : state === "off" ? "off" : "";
}
