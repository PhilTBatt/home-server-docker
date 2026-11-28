// @ts-check

/**
 * @typedef {object} MorningView
 * @property {string} phase
 * @property {string} day
 * @property {string} at
 * @property {number | null} speakSlot
 * @property {string | null} upAt
 * @property {"phone" | "voice" | null} by
 * @property {string | null} snoozedUntil
 */

/**
 * @typedef {object} MorningShows
 * @property {boolean} shown
 * @property {string} line
 * @property {boolean} up
 * @property {boolean} snooze
 */

const isTime = (/** @type {unknown} */ value) => value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));

/**
 * @param {unknown} reply
 * @returns {reply is MorningView}
 */
export function isMorningView(reply) {
  if (typeof reply !== "object" || reply === null || Array.isArray(reply)) return false;
  const fields = /** @type {Record<string, unknown>} */ (reply);
  return typeof fields.phase === "string" && typeof fields.day === "string" && typeof fields.at === "string" && /^\d\d:\d\d$/.test(fields.at) && (fields.speakSlot === null || typeof fields.speakSlot === "number") && isTime(fields.upAt) && isTime(fields.snoozedUntil) && (fields.by === null || fields.by === "phone" || fields.by === "voice");
}

/**
 * @param {MorningView} view
 * @param {(at: Date) => string} clock
 * @returns {MorningShows}
 */
export function morningShows(view, clock) {
  const hidden = { shown: false, line: "", up: false, snooze: false };
  switch (view.phase) {
    case "early":
      return { shown: true, line: `Wake-up's at ${view.at}. Up already? Tap I'm up and the morning won't start.`, up: true, snooze: false };
    case "brightening":
      return { shown: true, line: `The wall's brightening for ${view.at}.`, up: true, snooze: false };
    case "sound":
      return { shown: true, line: `Jarvis says morning at ${view.at}.`, up: true, snooze: false };
    case "speaking":
      return { shown: true, line: "Jarvis is saying morning, louder each time, until you're up.", up: true, snooze: true };
    case "snoozed":
      return { shown: true, line: view.snoozedUntil === null ? "Five more minutes." : `Five more minutes, till ${clock(new Date(view.snoozedUntil))}.`, up: true, snooze: true };
    case "up":
      return { shown: true, line: view.upAt === null ? "You're up." : `Up at ${clock(new Date(view.upAt))}${view.by === "voice" ? ", by voice" : view.by === "phone" ? ", from the phone" : ""}.`, up: false, snooze: false };
    default:
      return hidden;
  }
}
