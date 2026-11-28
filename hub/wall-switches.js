// @ts-check

export const switchGroups = ["hub", "hand", "jarvis"];
export const flippings = ["on", "chores-off", "off"];
export const flipShownMs = 6000;

/**
 * @typedef {{ key: string, label: string, on: boolean, value: string, flip: string | null }} SwitchRow
 * @typedef {{ id: string, rows: SwitchRow[] }} SwitchGroup
 * @typedef {{ kind: "switches", flipping: string, groups: SwitchGroup[], jarvisAgeMs: number | null }} Switchboard
 * @typedef {{ key: string, label: string, on: boolean, sub: string, hand: boolean, flipped: boolean }} SwitchView
 * @typedef {{ id: string, title: string, count: string, rows: SwitchView[], empty: string }} PanelView
 * @typedef {{ panels: PanelView[], how: string, said: string }} SwitchboardView
 * @typedef {Record<string, { on: boolean, at: number }>} SeenSwitches
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
function isRow(row) {
  return isObject(row) && typeof row.key === "string" && /^[A-Z_]{2,40}$/.test(row.key) && typeof row.label === "string" && row.label.length > 0 && row.label.length <= 40 && typeof row.on === "boolean" && typeof row.value === "string" && /^[a-z]{1,12}$/.test(row.value) && (row.flip === null || (typeof row.flip === "string" && /^switch-(on|off)-[a-z-]{2,30}$/.test(row.flip)));
}

/**
 * @param {unknown} value
 * @returns {value is Switchboard}
 */
export function isSwitchboard(value) {
  if (!isObject(value) || value.kind !== "switches" || !flippings.includes(String(value.flipping)) || !Array.isArray(value.groups) || value.groups.length !== switchGroups.length) return false;
  if (!(value.jarvisAgeMs === null || (typeof value.jarvisAgeMs === "number" && Number.isFinite(value.jarvisAgeMs) && value.jarvisAgeMs >= 0))) return false;
  return value.groups.every((group, i) => isObject(group) && group.id === switchGroups[i] && Array.isArray(group.rows) && group.rows.length <= 60 && group.rows.every(isRow));
}

/**
 * @param {SwitchRow[]} rows
 * @returns {string}
 */
function countOf(rows) {
  return `${rows.filter((row) => row.on).length} of ${rows.length} on`;
}

/**
 * @param {string} flipping
 * @returns {string}
 */
export function howWords(flipping) {
  if (flipping === "on") return "With JARVIS_HUB_ACTIONS on, say “switch on reminders” and Jarvis asks for your yes first; then the server flips it in api/.env and restarts the hub, putting it back if the hub doesn't come back. Jarvis's own switches change in jarvis/.env, and the two marked by hand are never flipped for you.";
  if (flipping === "chores-off") return "Dev chores are off (CHORES), so nothing here is flipped for you: change a switch in api/.env and restart the API. Jarvis's own switches change in jarvis/.env.";
  return "Switch flipping is off (SWITCHES), so nothing here is flipped for you: change a switch in api/.env and restart the API. Jarvis's own switches change in jarvis/.env.";
}

/**
 * @param {Switchboard} board
 * @param {SeenSwitches} seen
 * @param {number} now
 * @returns {{ view: SwitchboardView, seen: SeenSwitches }}
 */
export function switchboardView(board, seen, now) {
  /** @type {SeenSwitches} */
  const next = {};
  /** @type {(row: SwitchRow, hand: boolean) => SwitchView} */
  const viewOf = (row, hand) => {
    const before = seen[row.key];
    const at = before === undefined || before.on === row.on ? (before?.at ?? -Infinity) : now;
    next[row.key] = { on: row.on, at };
    const label = row.value === "on" || row.value === "off" ? row.label : `${row.label} · ${row.value}`;
    return { key: row.key, label, on: row.on, sub: hand ? `${row.key} · by hand` : row.key, hand, flipped: now - at < flipShownMs };
  };
  const [hub, hand, jarvis] = board.groups;
  const hubRows = [...hub.rows.map((row) => viewOf(row, false)), ...hand.rows.map((row) => viewOf(row, true))];
  const jarvisRows = jarvis.rows.map((row) => viewOf(row, false));
  return {
    view: {
      panels: [
        { id: "hub", title: "The hub", count: countOf([...hub.rows, ...hand.rows]), rows: hubRows, empty: "" },
        { id: "jarvis", title: "Jarvis", count: jarvis.rows.length === 0 ? "" : countOf(jarvis.rows), rows: jarvisRows, empty: jarvis.rows.length === 0 ? "Jarvis hasn't told the hub his switches. He does every 5 minutes while he runs with JARVIS_WALL on." : "" },
      ],
      how: howWords(board.flipping),
      said: "Every switch, and whether it's on",
    },
    seen: next,
  };
}
