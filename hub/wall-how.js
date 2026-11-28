// @ts-check

import { poseLabels } from "./wall-logic.js";

export const stepIds = ["mic", "wake", "stop", "whisper", "words", "claude", "sentences", "voice", "speakers"];
export const reachIds = ["tools", "brain", "notes", "lookups", "wall", "phone", "modes", "trains", "reminders", "morning", "sessions", "opens"];
export const wordIds = ["notes", "phone", "trains", "server", "clock", "lookup", "projector", "pages", "modes", "guest"];
export const partStates = ["on", "off", "blocked", "untold"];
export const choiceWords = ["wake", "push", "on", "off", "sdk", "api", "kokoro", "piper", "ask", "auto"];
export const lineY = 384;
export const howCentre = { x: 720, y: 384 };

const stepSpots = { mic: [80, 13, "soft"], wake: [208, 14, "mint"], stop: [336, 14, "mint"], whisper: [464, 18, "mint"], words: [592, 14, "yellow"], claude: [720, 43, "accent"], sentences: [864, 14, "soft"], voice: [992, 21, "accent"], speakers: [1136, 13, "soft"] };
const satSpots = { tools: [560, 200, "yellow"], brain: [720, 160, "purple"], notes: [872, 200, "purple"], lookups: [1032, 168, "blue"], wall: [576, 576, "accent"], phone: [720, 608, "accent"], modes: [864, 576, "blue"], unasked: [1060, 576, "warm"] };
const wordNames = { notes: "notes", phone: "phone", trains: "trains", server: "server", clock: "the time", lookup: "look up", projector: "projector", pages: "pages", modes: "modes", guest: "guest" };
const guestWords = ["clock", "lookup", "pages", "guest"];
const unaskedNames = { reminders: "reminders", trains: "train changes", morning: "the morning", sessions: "a waiting session", opens: "opening pages" };
const guestless = ["tools", "brain", "notes", "phone"];

/**
 * @typedef {"on" | "off" | "blocked" | "untold"} PartState
 * @typedef {{ id: string, state: PartState, value: string | null, blockedBy: string[] }} Part
 * @typedef {{ kind: "how", told: boolean, ageMs: number | null, steps: Part[], reach: Part[], words: Part[] }} HowPage
 * @typedef {{ id: string, name: string, note: string, x: number, y: number, size: number, tone: string, state: PartState, lit: boolean, muted: boolean }} SpotView
 * @typedef {{ steps: SpotView[], sats: SpotView[], flow: string, pills: { text: string, tone: string }[], note: string }} HowView
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} parts
 * @param {string[]} ids
 * @returns {boolean}
 */
function isParts(parts, ids) {
  return (
    Array.isArray(parts) &&
    parts.length === ids.length &&
    parts.every(
      (part, i) =>
        isObject(part) &&
        part.id === ids[i] &&
        partStates.includes(String(part.state)) &&
        (part.value === null || choiceWords.includes(String(part.value))) &&
        Array.isArray(part.blockedBy) &&
        part.blockedBy.length <= 4 &&
        part.blockedBy.every((key) => typeof key === "string" && /^[A-Z][A-Z_]{1,30}$/.test(key)),
    )
  );
}

/**
 * @param {unknown} value
 * @returns {value is HowPage}
 */
export function isHowPage(value) {
  return (
    isObject(value) &&
    value.kind === "how" &&
    typeof value.told === "boolean" &&
    (value.ageMs === null || (typeof value.ageMs === "number" && Number.isFinite(value.ageMs) && value.ageMs >= 0)) &&
    isParts(value.steps, stepIds) &&
    isParts(value.reach, reachIds) &&
    isParts(value.words, wordIds)
  );
}

/**
 * @param {string[]} items
 * @returns {string}
 */
function listed(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * @param {Part} part
 * @param {boolean} [many]
 * @returns {string}
 */
function needs(part, many = false) {
  return `${many ? "need" : "needs"} ${listed(part.blockedBy)}`;
}

/**
 * @param {number | null} ageMs
 * @returns {string}
 */
export function agoWords(ageMs) {
  if (ageMs === null) return "";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
}

/**
 * @param {Part} part
 * @param {Record<string, Part>} steps
 * @param {Part[]} words
 * @param {boolean} guest
 * @returns {{ name: string, note: string }}
 */
function stepWords(part, steps, words, guest) {
  const untold = part.state === "untold";
  const off = part.state === "off";
  switch (part.id) {
    case "mic":
      return { name: "Mic", note: off ? "ears is off: he's typed to" : "owned by ears, never by him" };
    case "wake":
      return { name: "Wake word", note: off ? (steps.mic.value === "push" ? "the talk button instead" : "off") : "“Hey Jarvis”" };
    case "stop":
      return { name: "You stop", note: off ? "off" : steps.stop.value === "on" ? "ears hears you finish; Claude checks" : "it hears you finish" };
    case "whisper":
      return { name: "Whisper", note: off ? "off" : "speech into words" };
    case "words": {
      if (off) return { name: "Code words", note: "only for speech" };
      if (untold) return { name: "Code words", note: "notes, find my phone, train times: his own code" };
      const on = words.filter((word) => word.state === "on" && (!guest || guestWords.includes(word.id))).map((word) => wordNames[/** @type {keyof typeof wordNames} */ (word.id)]);
      return { name: "Code words", note: on.length === 0 ? "never mind, stop listening" : `his own code: ${on.join(", ")}` };
    }
    case "claude":
      return { name: "Claude", note: part.value === "sdk" ? "thinks: the Agent SDK" : part.value === "api" ? "thinks: the plain API" : "thinks: Agent SDK or the plain API" };
    case "sentences":
      return { name: "Sentences", note: off ? "his voice is off: text only" : part.value === "on" ? "spoken as they arrive, bundled" : "spoken as they arrive" };
    case "voice":
      return { name: part.value === "kokoro" ? "Kokoro" : part.value === "piper" ? "Piper" : "His voice", note: off ? "off" : untold ? "Kokoro or Piper" : "his voice" };
    default:
      return { name: "Speakers", note: off ? "quiet" : "aplay, through the laptop" };
  }
}

/**
 * @param {Part} part
 * @param {Record<string, Part>} reach
 * @param {boolean} guest
 * @returns {{ name: string, note: string }}
 */
function satWords(part, reach, guest) {
  const untold = part.state === "untold";
  const off = part.state === "off";
  const blocked = part.state === "blocked";
  switch (part.id) {
    case "tools":
      return { name: "Hub tools", note: off ? "off" : untold ? "read only, or actions that ask" : part.value === "on" ? "most actions ask your yes" : reach.opens.state === "on" ? "read only, bar opening pages" : "read only" };
    case "brain":
      return { name: "The brain", note: "read only" };
    case "notes":
      return { name: "Session notes", note: off ? "off" : "what the Claude Code chats remember" };
    case "lookups":
      return { name: "Look-ups", note: off ? "off" : part.value === "ask" ? "when you say look up: a guarded helper" : part.value === "auto" ? "when you ask or he decides: a guarded helper" : "a separate, guarded helper" };
    case "wall":
      return { name: "The wall", note: off ? "off" : blocked ? needs(part) : "what he's doing, live" };
    case "phone":
      return { name: "Your phone", note: off ? "off" : blocked ? needs(part) : "hold to talk, answers back" };
    default:
      return { name: "Modes", note: off ? "off" : blocked ? needs(part) : guest ? "can't be changed in guest mode" : "quiet when he should be" };
  }
}

/**
 * @param {Part[]} parts
 * @returns {{ state: PartState, note: string }}
 */
export function unaskedOf(parts) {
  if (parts.some((part) => part.state === "untold")) return { state: "untold", note: "only reminders, train changes, the morning, a waiting session and opening pages" };
  const on = parts.filter((part) => part.state === "on");
  const blocked = parts.filter((part) => part.state === "blocked");
  const names = (/** @type {Part[]} */ list) => list.map((part) => unaskedNames[/** @type {keyof typeof unaskedNames} */ (part.id)]);
  const many = blocked.length > 1 || blocked.some((part) => part.id === "trains" || part.id === "reminders");
  const waiting = blocked.length === 0 ? "" : `; ${listed(names(blocked))} ${needs({ id: "", state: "blocked", value: null, blockedBy: [...new Set(blocked.flatMap((part) => part.blockedBy))] }, many)}`;
  if (on.length > 0) return { state: "on", note: `only ${listed(names(on))}${waiting}` };
  if (blocked.length > 0) return { state: "blocked", note: `nothing yet${waiting}` };
  return { state: "off", note: "nothing: he only answers" };
}

/**
 * @param {string} pose
 * @returns {{ flow: string, lit: string[] }}
 */
export function liveOf(pose) {
  if (pose === "heard" || pose === "listening") return { flow: "ask", lit: ["mic", "wake", "stop"] };
  if (pose === "thinking") return { flow: "think", lit: ["whisper", "words", "claude"] };
  if (pose === "looking") return { flow: "think", lit: ["claude", "lookups"] };
  if (pose === "needs") return { flow: "think", lit: ["claude", "tools"] };
  if (pose === "speaking") return { flow: "reply", lit: ["sentences", "voice", "speakers"] };
  if (pose === "off" || pose === "lost") return { flow: "still", lit: [] };
  return { flow: "demo", lit: [] };
}

/**
 * @param {HowPage} page
 * @param {string} pose
 * @param {string | null} mode
 * @returns {HowView}
 */
export function howView(page, pose, mode) {
  const steps = Object.fromEntries(page.steps.map((part) => [part.id, part]));
  const found = liveOf(pose);
  const live = found.flow === "reply" && steps.voice.state === "off" ? { flow: "still", lit: [] } : found;
  const reach = Object.fromEntries(page.reach.map((part) => [part.id, part]));
  const guest = mode === "guest";
  /** @type {SpotView[]} */
  const stepViews = page.steps.map((part) => {
    const [x, size, tone] = stepSpots[/** @type {keyof typeof stepSpots} */ (part.id)];
    const words = stepWords(part, steps, page.words, guest);
    const muted = part.id === "mic" && pose === "muted";
    return { id: part.id, ...words, note: muted ? "muted: ears isn't listening" : words.note, x: /** @type {number} */ (x), y: lineY, size: /** @type {number} */ (size), tone: /** @type {string} */ (tone), state: part.state, lit: live.lit.includes(part.id) && part.state !== "off", muted };
  });
  const unasked = guest ? { state: /** @type {PartState} */ ("off"), note: "nothing while a guest is here" } : unaskedOf([reach.reminders, reach.trains, reach.morning, reach.sessions, reach.opens]);
  /** @type {SpotView[]} */
  const satViews = ["tools", "brain", "notes", "lookups", "wall", "phone", "modes", "unasked"].map((id) => {
    const [x, y, tone] = satSpots[/** @type {keyof typeof satSpots} */ (id)];
    const words = id === "unasked" ? { name: "Unasked", note: unasked.note } : satWords(reach[id], reach, guest);
    const state = id === "unasked" ? unasked.state : reach[id].state;
    const away = guest && guestless.includes(id) && state !== "off";
    return { id, name: words.name, note: away ? "not in a guest chat" : words.note, x: /** @type {number} */ (x), y: /** @type {number} */ (y), size: 13, tone: /** @type {string} */ (tone), state: away ? "off" : state, lit: live.lit.includes(id) && state !== "off" && !away, muted: false };
  });
  const label = poseLabels[/** @type {keyof typeof poseLabels} */ (pose)] ?? "";
  const pills = [
    { text: label === "" ? "" : `Now: ${label}`, tone: live.flow === "demo" || live.flow === "still" ? "plain" : "good" },
    page.told ? { text: `His switches, told ${agoWords(page.ageMs)}`, tone: "plain" } : { text: "Jarvis hasn't told the hub his switches", tone: "warn" },
  ].filter((pill) => pill.text !== "");
  const ears = "He never touches the mic: ears owns it.";
  const note = page.told ? `Drawn from the switches Jarvis last told the hub, and what he's doing now. ${ears}` : `This is how he's built. Which parts are on shows once Jarvis tells the hub his switches, with JARVIS_WALL on. ${ears}`;
  return { steps: stepViews, sats: satViews, flow: live.flow, pills, note };
}
