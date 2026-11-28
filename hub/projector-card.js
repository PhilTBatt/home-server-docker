// @ts-check

/**
 * @typedef {object} ProjectorView
 * @property {boolean} paired
 * @property {string | null} pairedAt
 * @property {"asking" | "code" | "sending" | null} busy
 * @property {boolean | null} on
 * @property {string | null} onSeenAt
 * @property {string | null} problem
 */

export const busyCheckMs = 2_000;
export const forgetConfirmMs = 5_000;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} reply
 * @returns {reply is ProjectorView}
 */
export function isProjectorView(reply) {
  return (
    isObject(reply) &&
    typeof reply.paired === "boolean" &&
    (reply.pairedAt === null || typeof reply.pairedAt === "string") &&
    (reply.busy === null || ["asking", "code", "sending"].includes(String(reply.busy))) &&
    (reply.on === null || typeof reply.on === "boolean") &&
    (reply.onSeenAt === null || (typeof reply.onSeenAt === "string" && Number.isFinite(Date.parse(reply.onSeenAt)))) &&
    (reply.problem === null || typeof reply.problem === "string")
  );
}

/**
 * @param {ProjectorView} view
 * @param {(at: string) => string} timeOf
 * @returns {string}
 */
export function projectorLine(view, timeOf) {
  if (view.busy === "asking") return "Asking the projector for a code...";
  if (view.busy === "code") return "Type the code the projector shows.";
  if (view.busy === "sending") return "Sending...";
  if (!view.paired) return "Not paired with the hub yet.";
  if (view.problem !== null) return `${view.problem}.`;
  if (view.on === null || view.onSeenAt === null) return "Paired. Whether it's on shows after the first press.";
  return `${view.on ? "On" : "Off, or asleep"}, when the hub last heard at ${timeOf(view.onSeenAt)}.`;
}

/**
 * @param {ProjectorView} view
 * @returns {{ power: boolean, pair: boolean, code: boolean, forget: boolean, pairWords: string, checkAgain: boolean }}
 */
export function projectorShows(view) {
  const pairing = view.busy === "asking" || view.busy === "code";
  return { power: view.paired && !pairing, pair: !pairing, code: view.busy === "code", forget: view.paired && !pairing, pairWords: view.paired ? "Pair again" : "Pair", checkAgain: view.busy !== null };
}

/**
 * @param {boolean} on
 * @param {Record<string, unknown>} reply
 * @returns {string}
 */
export function powerLine(on, reply) {
  if (reply.sent === false) return `It's already ${on ? "on" : "off"}.`;
  if (reply.on === on) return on ? "It's on." : "It's off.";
  if (reply.on === !on) return `Sent, but the projector says it's still ${on ? "off" : "on"}.`;
  return `Sent, but the projector didn't say it's ${on ? "on" : "off"}, so it may not have got it.`;
}
