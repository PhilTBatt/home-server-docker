// @ts-check

/**
 * @typedef {"waiting" | "heard" | "listening" | "thinking" | "looking" | "speaking" | "done" | "needs"} Activity
 * @typedef {"waiting" | "heard" | "listening" | "thinking" | "looking" | "speaking" | "done" | "needs" | "muted" | "sleepy" | "guest" | "off" | "lost"} Pose
 * @typedef {{ text: string, voice: "owner" | "other" | "unknown" | null, slot: number | null, ageMs: number }} WallHeard
 * @typedef {{ seq: number, running: boolean, activity: Activity, muted: boolean | null, heard: WallHeard | null, said: string | null, saidAgeMs: number | null }} JarvisView
 * @typedef {{ key: string, label: string, value: string, note: string, colour: string, needs: boolean }} WallItem
 * @typedef {{ leaves: string, expected: string, platform: string | null, to: string, cancelled: boolean, late: boolean, inMinutes: number | null }} WallTrain
 * @typedef {{ text: string, due: string, from: string }} WallTimer
 * @typedef {{ at: string, clock: string, day: string, phase: "morning" | "daytime" | "bedtime", mode: string | null, modeUntil: string | null, speaking: "wobble" | "string", items: WallItem[], train: WallTrain | null, timers: WallTimer[], playing: { title: string, by: string } | null }} WallPicture
 * @typedef {{ x: number, y: number, side: "left" | "right" | "top" | "bottom" }} Slot
 * @typedef {{ kind: "needs", key: string } | { kind: "timer", timer: WallTimer } | { kind: "arrival", key: string } | { kind: "train" } | null} Middle
 */

export const modeColours = { normal: "#5FD4F4", gaming: "#FF9F5A", coding: "#F5D547", bedtime: "#8FA8FF", guest: "#5EE3B0", away: "#A9B8CA" };
export const itemColours = { mint: "#5EE3B0", blue: "#8FA8FF", yellow: "#F5D547", warm: "#FF9F5A", grey: "#A9B8CA" };
export const voiceColours = ["#F28BC9", "#B49CFF", "#FF7A7A", "#C6F26B", "#FFD6A5"];
export const unknownVoiceColour = "#E4ECF5";
export const poseLabels = { waiting: "Waiting", heard: "Heard you", listening: "Listening", thinking: "Thinking", looking: "Looking it up", speaking: "Speaking", done: "Done", needs: "Needs you", muted: "Muted", sleepy: "Sleepy", guest: "Guest mode", off: "Jarvis is off", lost: "Can't connect" };
export const timerMiddleMs = 3 * 60 * 1000;
export const countdownMostMs = 60 * 60 * 1000;
export const heardShownMs = 8000;
export const saidShownMs = 10000;
export const saidAfterSpeechMs = 6000;
export const arrivalShownMs = 6000;
export const mostCaptionChars = 160;
export const pairRetryMs = 30_000;

/**
 * @param {string} code
 * @returns {string}
 */
export function spacedCode(code) {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : "";
}

/**
 * @param {number} seconds
 * @returns {string}
 */
export function pairingLine(seconds) {
  if (seconds <= 60) return "This code works for less than a minute more. A new one comes after.";
  return `This code works for ${Math.ceil(seconds / 60)} more minutes.`;
}

/**
 * @param {number} status
 * @returns {string}
 */
export function pairRefusedLine(status) {
  if (status === 404) return "The wall is switched off on the hub.";
  if (status === 429) return "Other screens are pairing right now. Trying again in 30 seconds.";
  return `The hub answered ${status}. Trying again in a moment.`;
}

/**
 * @param {string | null} mode
 * @returns {string}
 */
export function modeColour(mode) {
  return mode !== null && Object.hasOwn(modeColours, mode) ? modeColours[/** @type {keyof typeof modeColours} */ (mode)] : modeColours.normal;
}

/**
 * @param {string} colour
 * @param {string} accent
 * @returns {string}
 */
export function itemColour(colour, accent) {
  return Object.hasOwn(itemColours, colour) ? itemColours[/** @type {keyof typeof itemColours} */ (colour)] : accent;
}

/**
 * @param {{ jarvis: JarvisView | null, connected: boolean, mode: string | null, phase: string }} now
 * @returns {Pose}
 */
export function poseFor(now) {
  if (!now.connected) return "lost";
  const jarvis = now.jarvis;
  if (jarvis === null || !jarvis.running) return "off";
  if (jarvis.activity !== "waiting") return jarvis.activity;
  if (jarvis.muted === true) return "muted";
  if (now.mode === "guest") return "guest";
  if (now.phase === "bedtime") return "sleepy";
  return "waiting";
}

/**
 * @param {number} count
 * @param {{ cx: number, cy: number, rx: number, ry: number }} orbit
 * @returns {Slot[]}
 */
export function orbitSlots(count, orbit) {
  /** @type {Slot[]} */
  const slots = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const side = cos > 0.3 ? "right" : cos < -0.3 ? "left" : sin < 0 ? "top" : "bottom";
    slots.push({ x: Math.round(orbit.cx + orbit.rx * cos), y: Math.round(orbit.cy + orbit.ry * sin), side });
  }
  return slots;
}

/**
 * @param {WallTimer[]} timers
 * @param {number} now
 * @returns {{ timer: WallTimer, remainingMs: number, fraction: number } | null}
 */
export function countdownOf(timers, now) {
  for (const timer of timers) {
    const due = Date.parse(timer.due);
    if (!Number.isFinite(due) || due <= now) continue;
    const remainingMs = due - now;
    if (remainingMs > countdownMostMs) return null;
    const started = Date.parse(timer.from);
    const total = Math.min(countdownMostMs, Number.isFinite(started) && started < due ? due - started : countdownMostMs);
    return { timer, remainingMs, fraction: Math.max(0, Math.min(1, remainingMs / Math.max(total, remainingMs))) };
  }
  return null;
}

/**
 * @param {{ items: WallItem[], phase: string, train: WallTrain | null, timers: WallTimer[], arrival: string | null, now: number }} state
 * @returns {Middle}
 */
export function middleFor(state) {
  const needing = state.items.find((item) => item.needs);
  if (needing !== undefined) return { kind: "needs", key: needing.key };
  const counting = countdownOf(state.timers, state.now);
  if (counting !== null && counting.remainingMs <= timerMiddleMs) return { kind: "timer", timer: counting.timer };
  if (state.arrival !== null && state.items.some((item) => item.key === state.arrival)) return { kind: "arrival", key: state.arrival };
  if (state.phase === "morning" && state.train !== null) return { kind: "train" };
  return null;
}

/**
 * @param {Middle} middle
 * @returns {string | null}
 */
export function middleKey(middle) {
  if (middle === null) return null;
  if (middle.kind === "needs" || middle.kind === "arrival") return middle.key;
  if (middle.kind === "train") return "train";
  return "reminder";
}

/**
 * @param {string} value
 * @returns {number | null}
 */
function countIn(value) {
  const match = /^(\d+)/.exec(value);
  return match === null ? null : Number(match[1]);
}

/**
 * @param {WallItem[] | null} before
 * @param {WallItem[]} after
 * @returns {string[]}
 */
export function arrivalsBetween(before, after) {
  if (before === null) return [];
  const was = new Map(before.map((item) => [item.key, item]));
  return after
    .filter((item) => {
      const old = was.get(item.key);
      if (old === undefined) return true;
      if (item.key !== "deals" && item.key !== "alerts") return false;
      const now = countIn(item.value);
      const then = countIn(old.value);
      return now !== null && then !== null && now > then;
    })
    .map((item) => item.key);
}

/**
 * @param {WallHeard} heard
 * @param {string} accent
 * @returns {string}
 */
export function voiceColour(heard, accent) {
  if (heard.voice === "other" && heard.slot !== null) return voiceColours[heard.slot % voiceColours.length];
  if (heard.voice === "unknown") return unknownVoiceColour;
  return accent;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function lastWords(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= mostCaptionChars) return flat;
  const tail = flat.slice(flat.length - mostCaptionChars);
  const start = tail.search(/[.!?]\s+\S/);
  if (start !== -1 && start < tail.length - 20) return tail.slice(start + 1).trim();
  const space = tail.indexOf(" ");
  return `…${space === -1 ? tail : tail.slice(space + 1)}`;
}

/**
 * @param {JarvisView | null} jarvis
 * @param {number} sinceMs
 * @param {string} accent
 * @param {number} [speakingAgoMs]
 * @returns {{ who: "you" | "them" | "him", text: string, colour: string } | null}
 */
export function captionFor(jarvis, sinceMs, accent, speakingAgoMs = Infinity) {
  if (jarvis === null || !jarvis.running) return null;
  const heard = jarvis.heard;
  const heardAge = heard === null ? Infinity : heard.ageMs + sinceMs;
  const saidAge = jarvis.said === null || jarvis.saidAgeMs === null ? Infinity : jarvis.saidAgeMs + sinceMs;
  if (jarvis.said !== null && (saidAge < saidShownMs || speakingAgoMs < saidAfterSpeechMs) && saidAge <= heardAge) return { who: "him", text: lastWords(jarvis.said), colour: accent };
  if (heard !== null && heardAge < heardShownMs) return { who: heard.voice === "other" || heard.voice === "unknown" ? "them" : "you", text: heard.text, colour: voiceColour(heard, accent) };
  return null;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function countdownText(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
}

/**
 * @param {number | null} inMinutes
 * @param {number} sinceMs
 * @returns {string}
 */
export function leavesText(inMinutes, sinceMs) {
  if (inMinutes === null) return "";
  const left = Math.round(inMinutes - sinceMs / 60000);
  if (left <= 0) return "Leaving now";
  return left === 1 ? "Leaves in 1 minute" : `Leaves in ${left} minutes`;
}

/**
 * @param {WallTrain} train
 * @returns {string}
 */
export function trainState(train) {
  if (train.cancelled) return "Cancelled";
  if (train.expected === "On time") return "On time";
  if (/^\d\d:\d\d$/.test(train.expected)) return `Expected ${train.expected}`;
  return train.expected;
}

/**
 * @param {WallPicture} picture
 * @returns {string}
 */
export function bedtimeLine(picture) {
  const parts = [picture.items.some((item) => item.needs) ? "Something needs a look" : "All good"];
  const next = picture.timers[0];
  if (next !== undefined) {
    const when = new Date(Date.parse(next.due)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    parts.push(`${next.text} ${when}`);
  }
  if (picture.train !== null) parts.push(`Next train ${picture.train.leaves}, ${trainState(picture.train).toLowerCase()}`);
  return parts.join(" · ");
}

/**
 * @param {Date} now
 * @returns {string}
 */
export function londonClock(now) {
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" });
}
