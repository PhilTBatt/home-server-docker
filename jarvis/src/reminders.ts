import { errorOf, hubAsk, reasonOf, requestIn } from "./code-words.js";
import { hubApiUrl } from "./hub-tools.js";
import { pause } from "./wake.js";

export type DueReminder = { id: string; text: string; at: string; late: boolean; urgent: boolean };
export type ReminderEvent = { kind: "reminders" } | { kind: "reminders note"; line: string };
export type ReminderNews = { events: AsyncIterable<ReminderEvent>; take(): DueReminder[] };
export type DueReply = { status: number; fields: Record<string, unknown> };
export type ReminderWatchDeps = { ask: (after: number, signal: AbortSignal) => Promise<DueReply>; signal: AbortSignal; pollMs?: number; nudgeMs?: number; wait?: (ms: number, signal: AbortSignal) => Promise<void>; now?: () => number };

export const reminderPollMs = 10_000;
export const reminderNudgeMs = 2_000;
export const reminderAnswerMs = 5 * 60_000;
export const reminderTextChars = 200;
export const remindersKept = 10;
export const freshOnStartMs = 2 * 60_000;
export const snoozeDefault = 10;
export const snoozeMost = 240;

export const remindersOffNote = "reminders: the hub's reminders are off, so set REMINDERS=on in api/.env and restart the hub, then start Jarvis again";
export const remindersBackNote = "reminders: the hub is answering again";
export const remindersOldHubNote = "reminders: this hub doesn't have them yet, so rebuild it with docker compose up --build --wait api, then start Jarvis again";

export function remindersUnreachableNote(why: string): string {
  return `reminders: couldn't ask the hub (${why}), so trying again every 10 seconds`;
}

function tidy(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim().slice(0, reminderTextChars);
}

export function dueOf(fields: Record<string, unknown>): { seq: number; due: DueReminder[] } | null {
  const { seq, due } = fields;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || !Array.isArray(due)) return null;
  const read: DueReminder[] = [];
  for (const one of due) {
    if (typeof one !== "object" || one === null) return null;
    const { id, text, at, late, urgent } = one as Record<string, unknown>;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof text !== "string" || typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
    const kept = tidy(text);
    if (kept === "") continue;
    read.push({ id, text: kept, at, late: late === true, urgent: urgent === true });
  }
  return { seq, due: read };
}

export function askHubForDue(token: string, url = hubApiUrl): ReminderWatchDeps["ask"] {
  return (after, signal) => hubAsk(`/reminders/due?after=${after}`, { headers: { Authorization: `Bearer ${token}` } }, signal, url);
}

export function watchReminders(deps: ReminderWatchDeps): ReminderNews {
  const wait = deps.wait ?? pause;
  const now = deps.now ?? (() => Date.now());
  let waiting: DueReminder[] = [];
  async function* events(): AsyncGenerator<ReminderEvent> {
    let after: number | null = null;
    let failing: string | null = null;
    while (!deps.signal.aborted) {
      let reply: DueReply | null = null;
      let why: string | null = null;
      try {
        reply = await deps.ask(after ?? 0, deps.signal);
      } catch (error) {
        if (deps.signal.aborted) return;
        why = remindersUnreachableNote(reasonOf(error));
      }
      if (reply !== null) {
        const read = reply.status === 200 ? dueOf(reply.fields) : null;
        if (reply.status === 404 && typeof reply.fields.error === "string" && /switched off/i.test(reply.fields.error)) why = remindersOffNote;
        else if (reply.status === 404) why = remindersOldHubNote;
        else if (read === null) why = remindersUnreachableNote(reply.status === 200 ? "its answer couldn't be read" : errorOf(reply.fields, reply.status));
        else {
          if (failing !== null) yield { kind: "reminders note", line: remindersBackNote };
          failing = null;
          const fresh = after === null ? read.due.filter((one) => now() - Date.parse(one.at) <= freshOnStartMs) : read.due;
          after = read.seq;
          if (fresh.length > 0) {
            waiting = [...waiting, ...fresh].slice(-remindersKept);
            yield { kind: "reminders" };
          }
        }
      }
      if (why !== null && why !== failing) yield { kind: "reminders note", line: why };
      if (why !== null) failing = why;
      const nudgeMs = deps.nudgeMs ?? reminderNudgeMs;
      for (let waited = 0; waited < (deps.pollMs ?? reminderPollMs) && !deps.signal.aborted; waited += nudgeMs) {
        await wait(nudgeMs, deps.signal).catch(() => {});
        if (waiting.length > 0 && !deps.signal.aborted) yield { kind: "reminders" };
      }
    }
  }
  return {
    events: events(),
    take() {
      const taken = waiting;
      waiting = [];
      return taken;
    },
  };
}

function ended(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function reminderSay(due: DueReminder[]): string {
  const late = due.some((one) => one.late) ? " Sorry, I couldn't say this when it was due." : "";
  return due.length === 1 ? `Reminder: ${ended(due[0].text)}${late}` : `Reminders: ${due.map((one) => ended(one.text)).join(" ")}${late}`;
}

export type ReminderAnswer = { kind: "snooze"; minutes: number } | { kind: "done" } | { kind: "cancel" };

const numberWords: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, "twenty five": 25, thirty: 30, forty: 40, "forty five": 45, fifty: 50, sixty: 60, ninety: 90 };

function minutesIn(words: string): number | null {
  if (words === "") return snoozeDefault;
  if (/^(?:for )?half an hour$/.test(words)) return 30;
  if (/^(?:for )?an hour$/.test(words)) return 60;
  const match = /^(?:for |another )?(\d{1,3}|[a-z]+(?: [a-z]+)?) (minutes?|mins?|hours?)$/.exec(words);
  if (match === null) return null;
  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : numberWords[match[1]];
  if (count === undefined) return null;
  const minutes = match[2].startsWith("hour") ? count * 60 : count;
  return minutes >= 1 && minutes <= snoozeMost ? minutes : null;
}

export function reminderAnswerIn(said: string): ReminderAnswer | null {
  const words = requestIn(said).replace(/^(?:ok|okay|thanks|thank you|cheers) /, "");
  const snooze = /^(?:snooze(?: it)?|remind me again(?: in)?)(?: (.+))?$/.exec(words);
  if (snooze !== null) {
    const minutes = minutesIn((snooze[1] ?? "").replace(/^in /, ""));
    return minutes === null ? null : { kind: "snooze", minutes };
  }
  if (/^(?:done|i've done it|i have done it|it's done|that's done|got it|did it)$/.test(words)) return { kind: "done" };
  if (/^(?:cancel(?: it| that| the reminder| that reminder)?|stop reminding me|forget it)$/.test(words)) return { kind: "cancel" };
  return null;
}

export type ReminderHub = { answer(id: string, answer: ReminderAnswer, signal: AbortSignal): Promise<void> };

export function hubReminders(token: string, url = hubApiUrl): ReminderHub {
  return {
    async answer(id, answer, signal) {
      const path = answer.kind === "cancel" ? `/reminders/${encodeURIComponent(id)}` : `/reminders/${encodeURIComponent(id)}/${answer.kind}`;
      const init: RequestInit = answer.kind === "cancel" ? { method: "DELETE", headers: { Authorization: `Bearer ${token}` } } : { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(answer.kind === "snooze" ? { minutes: answer.minutes } : {}) };
      const { status, fields } = await hubAsk(path, init, signal, url);
      if (status < 200 || status > 299) throw new Error(`the hub said: ${errorOf(fields, status)}`);
    },
  };
}

export function answeredSay(answer: ReminderAnswer): string {
  return answer.kind === "snooze" ? `Snoozed for ${answer.minutes === 60 ? "an hour" : answer.minutes % 60 === 0 ? `${answer.minutes / 60} hours` : `${answer.minutes} minute${answer.minutes === 1 ? "" : "s"}`}.` : answer.kind === "done" ? "Marked as done." : "Cancelled.";
}
export const reminderAnswerFailedSay = "I couldn't reach the hub about that reminder.";
export const guestRemindersNote = "a reminder came in; it isn't said in guest mode";
