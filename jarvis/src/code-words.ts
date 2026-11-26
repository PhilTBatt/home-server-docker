import { hubApiUrl } from "./hub-tools.js";

export type CodeWord = { kind: "note"; text: string } | { kind: "phone" } | { kind: "never mind" } | { kind: "trains" } | { kind: "server" } | { kind: "stop listening" } | { kind: "questions" } | { kind: "time" } | { kind: "date" };

const address = /^\s*(?:(?:hey|hi|ok|okay)\b[\s,.!?]*)?(?:\S*vis\b[\s,.!?]*)?/i;
const askingWords = "can you|could you|would you|will you|can u|please|just|jarvis";
const noteStart = new RegExp(`^(?:(?:${askingWords})[\\s,]+)*(?:note this(?: down)?|(?:make|take) a note(?: of this| of that| of it)?)(?: for me)?(?=[\\s,.:;!?\\u2013\\u2014\\u2026]|$)[\\s,.:;!?\\u2013\\u2014\\u2026-]*`, "i");

function plainWords(text: string): string {
  return text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/ {2,}/g, " ").trim();
}

export const fillersBefore = "please|oh|no|actually|thanks|thank you|okay|ok|jarvis";
export const fillersAfter = "please|now|jarvis|thanks|thank you|cheers|then|ok|okay|for now|for a bit|for a while";

function trimmed(text: string): string {
  return plainWords(text).replace(new RegExp(`^(?:(?:${fillersBefore}) )+`), "").replace(new RegExp(`(?: (?:${fillersAfter}))+$`), "");
}

function asked(words: string): string {
  return words.replace(new RegExp(`^(?:(?:${askingWords}) )+`), "").replace(/ for me$/, "");
}

const trainAsking = /^(?:(?:tell me|give me|check|get|show me) (?:the |my )?|(?:what are|what're|what's|what is) (?:the|my) |(?:the|my) )/;

export const neverMindWords = ["never mind", "nevermind", "that's all", "that is all"];
export const phoneWords = ["find my phone", "help me find my phone", "where's my phone", "where is my phone", "ring my phone", "ping my phone"];
export const serverWords = ["server check", "check the server", "how's the server", "how is the server", "how's the server doing", "how is the server doing", "is the server ok", "is the server okay"];
const serverAfter = fillersAfter.split("|").filter((word) => word !== "ok" && word !== "okay").join("|");
export const questionWords = ["brain questions", "any brain questions", "ask me some brain questions", "ask me your brain questions", "any questions for me", "have you got any questions for me", "do you have any questions for me", "got any questions for me"];
export const trainWords = ["train times", "train time", "trains", "next train", "next trains", "when's my train", "when is my train", "when's the next train", "when is the next train", "what time's my train", "what time is my train", "what time's the next train", "what time is the next train", "is my train on time", "are my trains on time", "are the trains on time", "how are the trains", "how are the trains looking"];

export const timeWords = ["what time is it", "what time's it", "what's the time", "what is the time", "tell me the time", "tell me what time it is", "do you know the time", "do you know what time it is"];
export const dateWords = ["what's the date", "what is the date", "what's the date today", "what is the date today", "what's today's date", "what is today's date", "tell me the date", "tell me today's date", "what day is it", "what day is it today", "what day's it", "tell me what day it is", "do you know what day it is"];

function codeWordAlone(said: string, clock: boolean): CodeWord | null {
  const text = said.replace(/[\u2018\u2019]/g, "'").replace(address, "");
  const note = noteStart.exec(text);
  if (note !== null) return { kind: "note", text: text.slice(note[0].length).trim() };
  const words = trimmed(text);
  const request = asked(words);
  if (phoneWords.includes(request)) return { kind: "phone" };
  if (neverMindWords.includes(words) && !/\?\s*$/.test(text)) return { kind: "never mind" };
  if (trainWords.includes(request) || trainWords.includes(request.replace(trainAsking, ""))) return { kind: "trains" };
  const server = asked(plainWords(text).replace(new RegExp(`^(?:(?:${fillersBefore}) )+`), "").replace(new RegExp(`(?: (?:${serverAfter}))+$`), ""));
  if (serverWords.includes(server) || /^(?:do a|run a|give me a) server check$/.test(server)) return { kind: "server" };
  if (clock && timeWords.includes(request)) return { kind: "time" };
  if (clock && dateWords.includes(request)) return { kind: "date" };
  if (questionWords.includes(words.replace(new RegExp(`^(?:(?:${askingWords}) )+`), ""))) return { kind: "questions" };
  if (/^(?:(?:you can|can you|could you|would you|will you|just|please|now) )*stop listening(?: |$)/.test(words)) return { kind: "stop listening" };
  return null;
}

export function lastSentenceOf(said: string): string | null {
  const sentences = said.split(/(?<=[.!?\u2026])\s+/).filter((sentence) => /[a-z0-9]/i.test(sentence));
  return sentences.length > 1 ? sentences[sentences.length - 1] : null;
}

export function codeWordIn(said: string, clock = false): CodeWord | null {
  const whole = codeWordAlone(said, clock);
  if (whole !== null) return whole;
  const last = lastSentenceOf(said);
  return last === null ? null : codeWordAlone(last, false);
}

export type CodeWordReply = { say: string; note?: string };

export const stopMyselfReply: CodeWordReply = { say: "Say just stop listening, and ears will stop.", note: "ears only mutes itself when stop listening is all you say, or mute it on the server with bash host/ears.sh mute" };
export const stoppedReply: CodeWordReply = { say: "I've stopped listening.", note: "ears muted itself, so unmute it on the server with bash host/ears.sh unmute" };
export const earsStoppedWhy = "you said stop listening, so ears muted itself. Unmute it on the server with bash host/ears.sh unmute";

export const hubOffNote = "notes, finding your phone, train times and the server check go through the hub, so set JARVIS_HUB_TOOLS=on in jarvis/.env and start Jarvis again with bash host/jarvis.sh";
export const noteTitle = "voice note";
export const codeWordMs = 12_000;

export function londonStamp(at: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function londonParts(at: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((part) => [part.type, part.value]));
}

export function timeLine(at: Date): string {
  const parts = londonParts(at);
  return `[Time now: ${parts.hour}:${parts.minute} on ${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, in London.]`;
}

export function withTimeLine(message: string, line: string | null): string {
  return line === null ? message : `${message}\n\n${line}`;
}

function ordinal(day: number): string {
  const tens = day % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
}

export function clockReply(kind: "time" | "date", at: Date): CodeWordReply {
  const parts = londonParts(at);
  return { say: kind === "time" ? `It's ${parts.hour}:${parts.minute}.` : `It's ${parts.weekday} the ${ordinal(Number(parts.day))} of ${parts.month}.` };
}

export function voiceNoteText(said: string, at: Date): string {
  return `# Voice note, ${londonStamp(at)}\n\nSaid to Jarvis, and turned into text by Whisper, so a word may be wrong.\n\n> ${said.replace(/\s+/g, " ").trim()}\n`;
}

async function hubPost(path: string, body: unknown, token: string, signal: AbortSignal, url: string): Promise<{ status: number; fields: Record<string, unknown> }> {
  return hubAsk(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }, signal, url);
}

export async function hubAsk(path: string, init: RequestInit, signal: AbortSignal, url: string): Promise<{ status: number; fields: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, { ...init, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(codeWordMs)]) });
  const parsed: unknown = await response.json().catch(() => null);
  return { status: response.status, fields: typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {} };
}

export function errorOf(fields: Record<string, unknown>, status: number): string {
  return typeof fields.error === "string" ? fields.error.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").slice(0, 200) : `the hub replied ${status}`;
}

export function reasonOf(error: unknown): string {
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

export type TrainConnection = { leaves: string; expected: string; platform: string | null; arrives: string; arrivesExpected: string; change: number; bus: boolean };

export type TrainJourney = { leaves: string; expected: string; cancelled: boolean; bus: boolean; reason: string | null; arrives: string; arrivesExpected: string; tight: TrainConnection | null; best: TrainConnection | null; fallback: TrainConnection | null };

export type TrainJourneys = { from: string; via: string; to: string; walk: number; journeys: TrainJourney[]; messages: string[] };

const isOnTime = (value: string) => /^on ?time$/i.test(value.trim());

function connectionOf(value: unknown): TrainConnection | null {
  if (typeof value !== "object" || value === null) return null;
  const fields = value as Record<string, unknown>;
  const leaves = plain(fields.leaves, 10);
  const expected = plain(fields.expected, 20);
  const arrives = plain(fields.arrives, 10);
  const arrivesExpected = plain(fields.arrivesExpected, 20);
  if (leaves === null || expected === null || arrives === null || arrivesExpected === null || typeof fields.change !== "number" || !Number.isSafeInteger(fields.change)) return null;
  return { leaves, expected, platform: plain(fields.platform, 10), arrives, arrivesExpected, change: fields.change, bus: fields.bus === true };
}

function journeysOf(fields: Record<string, unknown>): TrainJourneys | null {
  const from = plain(fields.from);
  const via = plain(fields.via);
  const to = plain(fields.to);
  if (from === null || via === null || to === null || typeof fields.walk !== "number" || !Array.isArray(fields.journeys) || !Array.isArray(fields.messages)) return null;
  const journeys = fields.journeys.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const train = item as Record<string, unknown>;
    const leaves = plain(train.leaves, 10);
    const expected = plain(train.expected, 20);
    const arrives = plain(train.arrives, 10);
    const arrivesExpected = plain(train.arrivesExpected, 20);
    if (leaves === null || expected === null || arrives === null || arrivesExpected === null) return [];
    return [{ leaves, expected, cancelled: train.cancelled === true, bus: train.bus === true, reason: plain(train.reason, 200), arrives, arrivesExpected, tight: connectionOf(train.tight), best: connectionOf(train.best), fallback: connectionOf(train.fallback) }];
  });
  return { from, via, to, walk: fields.walk, journeys, messages: fields.messages.flatMap((message: unknown) => (plain(message, 300) === null ? [] : [plain(message, 300) as string])) };
}

function minutesSaid(count: number): string {
  return `${count} minute${count === 1 ? "" : "s"}`;
}

function arrivalSaid(times: { arrives: string; arrivesExpected: string }): string {
  return /^\d{1,2}:\d{2}$/.test(times.arrivesExpected) ? times.arrivesExpected : times.arrives;
}

function journeyLine(journey: TrainJourney, seen: TrainJourneys): string {
  const name = `the ${journey.leaves}${journey.bus ? " bus" : ""}`;
  if (journey.cancelled) return `${name} is cancelled`;
  const start = isOnTime(journey.expected) ? `${name} is on time` : /^\d{1,2}:\d{2}$/.test(journey.expected) ? `${name} is expected at ${journey.expected}` : journey.expected.toLowerCase() === "delayed" ? `${name} is delayed, with no time yet` : `${name} shows ${journey.expected}`;
  const platform = (connection: TrainConnection) => (connection.platform === null ? "" : `, platform ${connection.platform}`);
  const said = (connection: TrainConnection, where: string) => `${minutesSaid(connection.change)}${where} for the ${connection.leaves}${connection.bus ? " bus" : ""}${platform(connection)}, into ${seen.to} at ${arrivalSaid(connection)}`;
  const known = /^\d{1,2}:\d{2}$/.test(journey.arrivesExpected) || isOnTime(journey.arrivesExpected);
  const change = journey.tight !== null ? `, with only ${minutesSaid(journey.tight.change)} at ${seen.via} for the ${journey.tight.leaves}${journey.best === null ? "" : `, else ${said(journey.best, "")}`}` : journey.best !== null ? `, with ${said(journey.best, ` at ${seen.via}`)}` : known ? ", with no connection on the board yet" : "";
  const fallback = journey.fallback === null ? "" : `, then the ${journey.fallback.leaves}, in at ${arrivalSaid(journey.fallback)}`;
  return `${start}${change}${fallback}`;
}

export function spokenJourneys(seen: TrainJourneys): CodeWordReply {
  const shown = seen.journeys.slice(0, spokenTrainsMost);
  const reasons = shown.flatMap((journey) => (journey.reason === null || (!journey.cancelled && isOnTime(journey.expected)) ? [] : [`${journey.leaves}: ${journey.reason}`]));
  const notes = [...reasons, ...seen.messages];
  const say = shown.length > 0 ? `From ${seen.from}: ${shown.map((journey) => journeyLine(journey, seen)).join("; ")}.` : `There are no trains from ${seen.from} to ${seen.via} on the board right now.`;
  return notes.length === 0 ? { say } : { say, note: notes.join("; ") };
}

function trainLine(train: TrainBoard["departures"][number]): string {
  if (train.cancelled) return `the ${train.due} is cancelled`;
  const platform = train.platform === null ? "" : `, platform ${train.platform}`;
  if (isOnTime(train.expected)) return `the ${train.due} is on time${platform}`;
  if (/^\d{1,2}:\d{2}$/.test(train.expected)) return `the ${train.due} is expected at ${train.expected}${platform}`;
  if (train.expected.toLowerCase() === "delayed") return `the ${train.due} is delayed, with no time yet${platform}`;
  return `the ${train.due} shows ${train.expected}${platform}`;
}

export function spokenTrains(board: TrainBoard): CodeWordReply {
  const shown = board.departures.slice(0, spokenTrainsMost);
  const reasons = shown.flatMap((train) => (train.reason === null || (!train.cancelled && isOnTime(train.expected)) ? [] : [`${train.due}: ${train.reason}`]));
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
    const journeys = journeysOf(fields);
    if (journeys !== null) return spokenJourneys(journeys);
    const board = boardOf(fields);
    return board === null ? { say: "I couldn't get the train times.", note: "the hub's reply wasn't a train board" } : spokenTrains(board);
  } catch (error) {
    return { say: "I couldn't get the train times.", note: `couldn't reach the hub: ${reasonOf(error)}` };
  }
}

export type DoctorCheck = { name: string; state: "ok" | "warn" | "problem" | "off"; detail: string; next: string | null };

export type DoctorReport = { summary: string; checks: DoctorCheck[] };

export const spokenChecksMost = 3;

const spokenStates = ["problem", "warn"] as const;

function plainCut(value: unknown, limit: number): string | null {
  const text = plain(value, Infinity);
  if (text === null || text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:(]+$/, "")}\u2026`;
}

function doctorOf(fields: Record<string, unknown>): DoctorReport | null {
  const summary = plain(fields.summary, 300);
  if (summary === null || !Array.isArray(fields.checks)) return null;
  const checks = fields.checks.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const check = item as Record<string, unknown>;
    const name = plain(check.name, 40);
    const detail = plainCut(check.detail, 300);
    const state = spokenStates.find((known) => known === check.state);
    if (name === null || detail === null || state === undefined) return [];
    return [{ name, state, detail, next: plain(check.next, 300) }];
  });
  return { summary, checks };
}

export function spokenDoctor(report: DoctorReport): CodeWordReply {
  const notOk = [...report.checks.filter((check) => check.state === "problem"), ...report.checks.filter((check) => check.state === "warn")];
  const shown = notOk.slice(0, spokenChecksMost);
  const say = [report.summary, ...shown.map((check) => `${check.name}: ${check.detail}`)].join(" ");
  const notes = [...shown.flatMap((check) => (check.next === null ? [] : [`${check.name}: ${check.next.replace(/\.$/, "")}`])), ...(notOk.length > shown.length ? [`${notOk.length - shown.length} more on the hub page`] : [])];
  return notes.length === 0 ? { say } : { say, note: notes.join("; ") };
}

export async function serverCheck(token: string | null, signal: AbortSignal, url = hubApiUrl): Promise<CodeWordReply> {
  if (token === null) return { say: "I couldn't check the server.", note: hubOffNote };
  try {
    const { status, fields } = await hubAsk("/system/doctor", { headers: { Authorization: `Bearer ${token}` } }, signal, url);
    if (status === 404) return { say: "I couldn't check the server.", note: "the hub has no server doctor yet, so update it and rebuild the API" };
    if (status !== 200) return { say: "I couldn't check the server.", note: `the hub said: ${errorOf(fields, status)}` };
    const report = doctorOf(fields);
    return report === null ? { say: "I couldn't check the server.", note: "the hub's reply wasn't a server check" } : spokenDoctor(report);
  } catch (error) {
    return { say: "I couldn't check the server.", note: `couldn't reach the hub: ${reasonOf(error)}` };
  }
}
