import { hubApiUrl } from "./hub-tools.js";

export type CodeWord = { kind: "note"; text: string } | { kind: "phone" } | { kind: "never mind" } | { kind: "trains" } | { kind: "stop listening" };

const address = /^\s*(?:(?:hey|hi|ok|okay)\b[\s,.!?]*)?(?:\S*vis\b[\s,.!?]*)?/i;
const noteStart = /^note this(?: down)?\b[\s,.:;!?\u2013\u2014\u2026-]*/i;

function plainWords(text: string): string {
  return text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/ {2,}/g, " ").trim();
}

export const fillersBefore = "please|oh|no|actually|thanks|thank you|okay|ok|jarvis";
export const fillersAfter = "please|now|jarvis|thanks|thank you|cheers|then|ok|okay|for now|for a bit|for a while";

function trimmed(text: string): string {
  return plainWords(text).replace(new RegExp(`^(?:(?:${fillersBefore}) )+`), "").replace(new RegExp(`(?: (?:${fillersAfter}))+$`), "");
}

export const neverMindWords = ["never mind", "nevermind", "that's all", "that is all"];
export const phoneWords = ["find my phone"];
export const trainWords = ["train times", "train time", "trains", "next train", "next trains", "when's my train", "when is my train", "when's the next train", "when is the next train"];

export function codeWordIn(said: string): CodeWord | null {
  const text = said.replace(/[\u2018\u2019]/g, "'").replace(address, "");
  const note = noteStart.exec(text);
  if (note !== null) return { kind: "note", text: text.slice(note[0].length).trim() };
  const words = trimmed(text);
  if (phoneWords.includes(words)) return { kind: "phone" };
  if (neverMindWords.includes(words) && !/\?\s*$/.test(text)) return { kind: "never mind" };
  if (trainWords.includes(words)) return { kind: "trains" };
  if (/^(?:(?:you can|can you|could you|would you|will you|just|please|now) )*stop listening(?: |$)/.test(words)) return { kind: "stop listening" };
  return null;
}

export type CodeWordReply = { say: string; note?: string };

export const stopMyselfReply: CodeWordReply = { say: "Say just stop listening, and ears will stop.", note: "ears only mutes itself when stop listening is all you say, or mute it on the server with bash host/ears.sh mute" };
export const stoppedReply: CodeWordReply = { say: "I've stopped listening.", note: "ears muted itself, so unmute it on the server with bash host/ears.sh unmute" };
export const earsStoppedWhy = "you said stop listening, so ears muted itself. Unmute it on the server with bash host/ears.sh unmute";

export const hubOffNote = "notes, finding your phone and train times go through the hub, so set JARVIS_HUB_TOOLS=on in jarvis/.env and start Jarvis again with bash host/jarvis.sh";
export const noteTitle = "voice note";
export const codeWordMs = 12_000;

export function londonStamp(at: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function voiceNoteText(said: string, at: Date): string {
  return `# Voice note, ${londonStamp(at)}\n\nSaid to Jarvis, and turned into text by Whisper, so a word may be wrong.\n\n> ${said.replace(/\s+/g, " ").trim()}\n`;
}

async function hubPost(path: string, body: unknown, token: string, signal: AbortSignal, url: string): Promise<{ status: number; fields: Record<string, unknown> }> {
  return hubAsk(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }, signal, url);
}

async function hubAsk(path: string, init: RequestInit, signal: AbortSignal, url: string): Promise<{ status: number; fields: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, { ...init, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(codeWordMs)]) });
  const parsed: unknown = await response.json().catch(() => null);
  return { status: response.status, fields: typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {} };
}

function errorOf(fields: Record<string, unknown>, status: number): string {
  return typeof fields.error === "string" ? fields.error.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").slice(0, 200) : `the hub replied ${status}`;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function saveVoiceNote(said: string, token: string | null, signal: AbortSignal, at = new Date(), url = hubApiUrl): Promise<CodeWordReply> {
  if (said.trim() === "") return { say: "Say note this, then what to note." };
  if (token === null) return { say: "I couldn't save that note.", note: hubOffNote };
  try {
    const { status, fields } = await hubPost("/memory/inbox", { title: noteTitle, text: voiceNoteText(said, at) }, token, signal, url);
    if (status === 201 && typeof fields.saved === "string") return { say: "Noted.", note: `saved in the brain's inbox as ${fields.saved.replace(/[^\w.-]/g, "")}` };
    if (status === 404 && fields.error === "Note uploads are switched off") return { say: "I couldn't save that note.", note: "note uploads are off in the hub, so set MEMORY_UPLOAD=on in api/.env and restart the hub" };
    return { say: "I couldn't save that note.", note: `the hub said: ${errorOf(fields, status)}` };
  } catch (error) {
    return { say: "I couldn't save that note.", note: `couldn't reach the hub: ${reasonOf(error)}` };
  }
}

export async function findPhone(token: string | null, signal: AbortSignal, url = hubApiUrl): Promise<CodeWordReply> {
  if (token === null) return { say: "I couldn't reach your phone.", note: hubOffNote };
  try {
    const { status, fields } = await hubPost("/phone/find", {}, token, signal, url);
    if (status === 200) return { say: "I've sent your phone a notification." };
    if (status === 429) return { say: "I sent your phone one a moment ago, so I didn't send another." };
    if (status === 404 && fields.error === "Finding the phone is switched off") return { say: "I couldn't reach your phone.", note: "finding your phone is off in the hub, so set FIND_PHONE=on in api/.env and restart the hub" };
    return { say: "I couldn't reach your phone.", note: `the hub said: ${errorOf(fields, status)}` };
  } catch (error) {
    return { say: "I couldn't reach your phone.", note: `couldn't reach the hub: ${reasonOf(error)}` };
  }
}

export type TrainBoard = { from: string; to: string; departures: { due: string; expected: string; platform: string | null; cancelled: boolean; reason: string | null }[]; buses: number; messages: string[] };

export const spokenTrainsMost = 3;

function plain(value: unknown, limit = 120): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, limit) : null;
}

function boardOf(fields: Record<string, unknown>): TrainBoard | null {
  const from = plain(fields.from);
  const to = plain(fields.to);
  if (from === null || to === null || !Array.isArray(fields.departures) || !Array.isArray(fields.messages)) return null;
  const departures = fields.departures.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const train = item as Record<string, unknown>;
    const due = plain(train.due, 10);
    const expected = plain(train.expected, 20);
    if (due === null || expected === null) return [];
    return [{ due, expected, platform: plain(train.platform, 10), cancelled: train.cancelled === true, reason: plain(train.reason, 200) }];
  });
  return { from, to, departures, buses: typeof fields.buses === "number" && Number.isSafeInteger(fields.buses) && fields.buses > 0 ? fields.buses : 0, messages: fields.messages.flatMap((message: unknown) => (plain(message, 300) === null ? [] : [plain(message, 300) as string])) };
}

function trainLine(train: TrainBoard["departures"][number]): string {
  if (train.cancelled) return `the ${train.due} is cancelled`;
  const platform = train.platform === null ? "" : `, platform ${train.platform}`;
  if (train.expected.toLowerCase() === "on time") return `the ${train.due} is on time${platform}`;
  if (/^\d{1,2}:\d{2}$/.test(train.expected)) return `the ${train.due} is expected at ${train.expected}${platform}`;
  if (train.expected.toLowerCase() === "delayed") return `the ${train.due} is delayed, with no time yet${platform}`;
  return `the ${train.due} shows ${train.expected}${platform}`;
}

export function spokenTrains(board: TrainBoard): CodeWordReply {
  const shown = board.departures.slice(0, spokenTrainsMost);
  const reasons = shown.flatMap((train) => (train.reason === null || (!train.cancelled && train.expected.toLowerCase() === "on time") ? [] : [`${train.due}: ${train.reason}`]));
  const buses = board.buses === 1 ? "a bus" : `${board.buses} buses`;
  const notes = [...reasons, ...(board.buses === 0 || shown.length === 0 ? [] : [`the board also lists ${buses}`]), ...board.messages];
  const say = shown.length > 0 ? `Trains from ${board.from} to ${board.to}: ${shown.map(trainLine).join("; ")}.` : board.buses > 0 ? `There are no trains from ${board.from} to ${board.to} on the board right now, but it lists ${buses}.` : `There are no trains from ${board.from} to ${board.to} on the board right now.`;
  return notes.length === 0 ? { say } : { say, note: notes.join("; ") };
}

export async function trainTimes(token: string | null, signal: AbortSignal, url = hubApiUrl): Promise<CodeWordReply> {
  if (token === null) return { say: "I couldn't get the train times.", note: hubOffNote };
  try {
    const { status, fields } = await hubAsk("/trains", { headers: { Authorization: `Bearer ${token}` } }, signal, url);
    if (status === 404 && fields.error === "Train times are switched off") return { say: "I couldn't get the train times.", note: "train times are off in the hub, so set TRAINS=on and its settings in api/.env and restart the hub" };
    if (status !== 200) return { say: "I couldn't get the train times.", note: `the hub said: ${errorOf(fields, status)}` };
    const board = boardOf(fields);
    return board === null ? { say: "I couldn't get the train times.", note: "the hub's reply wasn't a train board" } : spokenTrains(board);
  } catch (error) {
    return { say: "I couldn't get the train times.", note: `couldn't reach the hub: ${reasonOf(error)}` };
  }
}
