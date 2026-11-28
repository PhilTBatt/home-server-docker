// @ts-check

export const brightenMinutes = 15;
export const soundMinutes = 5;
export const speakEveryMinutes = 2;
export const morningPhases = ["brightening", "sound", "speaking", "snoozed"];

/**
 * @typedef {{ phase: string, at: string, snoozedUntil: string | null }} WallMorning
 * @typedef {{ time: string, what: string, state: "done" | "now" | "next" }} MorningStep
 * @typedef {{ text: string, tone: "yellow" | "mint" | "plain" }} MorningChip
 * @typedef {{ wake: string, glow: number, steps: MorningStep[], chips: MorningChip[] }} MorningView
 * @typedef {{ leaves: string, expected: string, platform: string | null, to: string, cancelled: boolean, late: boolean, inMinutes: number | null }} MorningTrain
 * @typedef {{ main: string, sub: string, tone: "good" | "warm" }} MorningTrainCard
 */

/**
 * @param {string} text
 * @returns {number | null}
 */
function minutesOf(text) {
  const match = /^(\d\d):(\d\d)$/.exec(text);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/**
 * @param {number} minutes
 * @returns {string}
 */
function clockOf(minutes) {
  const inDay = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
}

/**
 * @param {unknown} value
 * @returns {value is WallMorning}
 */
export function isWallMorning(value) {
  if (typeof value !== "object" || value === null) return false;
  const fields = /** @type {Record<string, unknown>} */ (value);
  return typeof fields.phase === "string" && typeof fields.at === "string" && minutesOf(fields.at) !== null && (fields.snoozedUntil === null || typeof fields.snoozedUntil === "string");
}

/**
 * @param {unknown} morning
 * @param {number} now
 * @param {string} snoozedClock
 * @param {MorningTrain | null} train
 * @returns {MorningView | null}
 */
export function morningView(morning, now, snoozedClock, train) {
  if (!isWallMorning(morning) || !morningPhases.includes(morning.phase)) return null;
  const at = /** @type {number} */ (minutesOf(morning.at));
  const start = at - brightenMinutes;
  const glow = morning.phase === "brightening" ? Math.min(1, Math.max(0.05, (now - start) / brightenMinutes)) : 1;
  const speaking = morning.phase === "speaking" || morning.phase === "snoozed";
  const current = morning.phase === "brightening" ? 0 : morning.phase === "sound" ? 1 : now < at + speakEveryMinutes ? 2 : 3;
  const steps = [
    { time: clockOf(start), what: "The wall starts to brighten" },
    { time: clockOf(at - soundMinutes), what: "A soft sound" },
    { time: clockOf(at), what: "Jarvis says morning" },
    { time: clockOf(at + speakEveryMinutes), what: "Again, louder, every 2 min" },
  ].map((step, index) => ({ ...step, state: /** @type {"done" | "now" | "next"} */ (index < current ? "done" : index === current ? "now" : "next") }));
  /** @type {MorningChip[]} */
  const chips = [];
  if (train !== null && !train.cancelled && train.inMinutes !== null && train.inMinutes >= 0) chips.push({ text: `Train in ${train.inMinutes} min`, tone: "yellow" });
  if (morning.phase === "snoozed" && snoozedClock !== "") chips.push({ text: `Five more minutes, till ${snoozedClock}`, tone: "yellow" });
  if (speaking) {
    chips.push({ text: "Say “I'm up”", tone: "mint" });
    if (morning.phase === "speaking") chips.push({ text: "or “five more minutes”", tone: "plain" });
  } else chips.push({ text: "Tap “I'm up” on your phone", tone: "mint" });
  return { wake: `Wake-up at ${morning.at}`, glow, steps, chips };
}

/**
 * @param {MorningTrain | null} train
 * @param {string} change
 * @returns {MorningTrainCard | null}
 */
export function morningTrainCard(train, change) {
  if (train === null) return null;
  const status = train.cancelled ? "cancelled" : /^\d\d:\d\d$/.test(train.expected) && train.expected !== train.leaves ? `expected ${train.expected}` : train.expected.toLowerCase() === "on time" ? "on time" : train.expected.toLowerCase();
  const platform = train.platform === null ? "" : `Platform ${train.platform}`;
  return { main: `${train.leaves} · ${status}`, sub: change !== "" ? change : platform, tone: train.cancelled || train.late ? "warm" : "good" };
}
