import type { WallSettings } from "../../config.js";
import type { Mode, ModeView } from "../modes/modes.js";
import type { Reminder } from "../reminders/reminders.js";
import type { Playing } from "../spotify/client.js";
import type { DoctorReport } from "../system/doctor.js";
import type { Problem } from "../system/alerts.js";
import type { BackupState } from "../system/backup.js";
import { clockMinutes, clockText, londonNow, type AlertSettings } from "../trains/alerts.js";

export const pictureKeptMs = 20_000;
export const wallDoctorMs = 5 * 60_000;
export const wallTrainsMs = 60_000;
export const sourceMs = 5_000;
export const mostTimers = 3;
export const timersAheadMs = 24 * 60 * 60 * 1000;
export const mostValueChars = 28;
export const mostNoteChars = 40;

export type Phase = "morning" | "daytime" | "bedtime";
export type Colour = "mint" | "blue" | "yellow" | "warm" | "grey" | "accent";
export type WallItem = { key: "server" | "train" | "backup" | "deals" | "reminder" | "alerts" | "music"; label: string; value: string; note: string; colour: Colour; needs: boolean };
export type WallTrain = { leaves: string; expected: string; platform: string | null; to: string; cancelled: boolean; late: boolean; inMinutes: number | null };
export type WallTimer = { text: string; due: string; from: string };
export type WallPicture = { at: string; clock: string; day: string; phase: Phase; mode: Mode | null; modeUntil: string | null; speaking: WallSettings["speaking"]; remote: boolean; items: WallItem[]; train: WallTrain | null; timers: WallTimer[]; playing: { title: string; by: string } | null };

export type WallSources = {
  mode?: () => ModeView;
  doctor?: () => Promise<DoctorReport>;
  problems: () => Promise<Problem[]>;
  backup: () => Promise<BackupState>;
  trains?: () => Promise<unknown>;
  reminders?: () => Reminder[];
  deals?: (now: Date) => { alertsToday: number };
  playing?: () => Promise<Playing>;
};

export type PictureSettings = { speaking: WallSettings["speaking"]; remote?: boolean; trainAlerts: AlertSettings | null; waitMs?: number };

const weekdays: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

function cut(text: string, most: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > most ? `${flat.slice(0, most - 1).trimEnd()}…` : flat;
}

function within<Value>(read: () => Promise<Value>, ms = sourceMs): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} seconds`)), ms);
  });
  return Promise.race([Promise.resolve().then(read), late]).finally(() => clearTimeout(timer));
}

function unknown(key: WallItem["key"], label: string): WallItem {
  return { key, label, value: "?", note: "couldn't check", colour: "grey", needs: false };
}

export function partOfDay(minutes: number): string {
  if (minutes < 5 * 60) return "night";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "evening";
}

export function phaseOf(mode: Mode | null, settings: AlertSettings | null, now: Date): Phase {
  if (mode === "bedtime") return "bedtime";
  if (settings === null || settings.days.length === 0) return "daytime";
  const london = londonNow(now);
  if (!settings.days.includes(london.weekday)) return "daytime";
  return london.minutes >= settings.reminder && london.minutes < settings.end ? "morning" : "daytime";
}

function londonClock(iso: string): string | null {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? clockText(londonNow(new Date(time)).minutes) : null;
}

export function serverItem(report: DoctorReport): WallItem {
  const counted = report.checks.filter((check) => check.state !== "off");
  const fine = counted.filter((check) => check.state === "ok").length;
  const worst = counted.find((check) => check.state === "problem") ?? counted.find((check) => check.state === "warn");
  return { key: "server", label: "Server", value: `${fine}/${counted.length}`, note: worst === undefined ? "all good" : cut(`${worst.name.toLowerCase()} needs a look`, mostNoteChars), colour: report.state === "problem" ? "warm" : report.state === "warn" ? "yellow" : "mint", needs: report.state === "problem" };
}

export function backupItem(state: BackupState, now: Date): WallItem {
  const last = state.lastRun;
  if (last === null) return { key: "backup", label: "Backup", value: "never", note: "not run yet", colour: "grey", needs: false };
  if (last.problem !== null) return { key: "backup", label: "Backup", value: "failed", note: cut(last.problem, mostNoteChars), colour: "warm", needs: true };
  const clock = londonClock(last.time);
  if (clock === null) return { key: "backup", label: "Backup", value: "?", note: "couldn't read its time", colour: "grey", needs: false };
  const today = londonNow(now).day;
  const then = londonNow(new Date(Date.parse(last.time)));
  const yesterday = londonNow(new Date(now.getTime() - 24 * 60 * 60 * 1000)).day;
  const note = then.day === today ? "today" : then.day === yesterday ? "last night" : weekdays[then.weekday] ?? then.day;
  return { key: "backup", label: "Backup", value: clock, note, colour: "blue", needs: false };
}

export function alertsItem(problems: Problem[]): WallItem {
  if (problems.length === 0) return { key: "alerts", label: "Alerts", value: "0", note: "nothing waiting", colour: "grey", needs: false };
  return { key: "alerts", label: "Alerts", value: String(problems.length), note: cut(problems[0].message, mostNoteChars), colour: "warm", needs: true };
}

export function dealsItem(alertsToday: number): WallItem {
  return { key: "deals", label: "Deals", value: alertsToday === 0 ? "0" : `${alertsToday} new`, note: alertsToday === 0 ? "nothing today" : "today", colour: "yellow", needs: false };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function minutesUntil(clock: string, now: Date): number | null {
  const at = clockMinutes(clock);
  if (at === null) return null;
  let gap = at - londonNow(now).minutes;
  if (gap < -12 * 60) gap += 24 * 60;
  if (gap > 12 * 60) gap -= 24 * 60;
  return gap;
}

export function trainOf(reply: unknown, now: Date): WallTrain | null {
  const board = record(reply);
  if (board === null) return null;
  const to = text(board.to) ?? "";
  const first = Array.isArray(board.journeys) ? record(board.journeys[0]) : Array.isArray(board.departures) ? record(board.departures[0]) : null;
  if (first === null) return null;
  const leaves = text(first.leaves) ?? text(first.due);
  const expected = text(first.expected);
  if (leaves === null || expected === null || typeof first.cancelled !== "boolean") return null;
  const platform = text(first.platform);
  const cancelled = first.cancelled;
  const late = cancelled || expected !== "On time";
  const when = /^\d\d:\d\d$/.test(expected) ? expected : leaves;
  return { leaves: cut(leaves, 5), expected: cut(expected, mostNoteChars), platform: platform === null ? null : cut(platform, 4), to: cut(to, mostNoteChars), cancelled, late, inMinutes: cancelled ? null : minutesUntil(when, now) };
}

export function trainItem(train: WallTrain | null): WallItem {
  if (train === null) return { key: "train", label: "Next train", value: "none", note: "nothing on the board", colour: "grey", needs: false };
  const state = train.cancelled ? "cancelled" : train.expected === "On time" ? "on time" : /^\d\d:\d\d$/.test(train.expected) ? `expected ${train.expected}` : train.expected.toLowerCase();
  return { key: "train", label: "Next train", value: train.leaves, note: cut(train.platform === null ? state : `${state} · plat ${train.platform}`, mostNoteChars), colour: train.late ? "warm" : "accent", needs: false };
}

export function timersOf(reminders: Reminder[], now: Date): WallTimer[] {
  return reminders
    .filter((reminder) => reminder.kind === "reminder")
    .map((reminder) => {
      const due = reminder.snoozedTo ?? reminder.at;
      const from = reminder.snoozedTo !== null && reminder.firedAt !== null ? reminder.firedAt : reminder.createdAt;
      return { text: cut(reminder.text, mostValueChars), due, from };
    })
    .filter((timer): timer is WallTimer => timer.due !== null && Date.parse(timer.due) > now.getTime() && Date.parse(timer.due) - now.getTime() <= timersAheadMs)
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    .slice(0, mostTimers);
}

export function reminderItem(timers: WallTimer[], now: Date): WallItem {
  const next = timers[0];
  if (next === undefined) return { key: "reminder", label: "Reminder", value: "none", note: "nothing coming up", colour: "grey", needs: false };
  const minutes = Math.max(0, Math.ceil((Date.parse(next.due) - now.getTime()) / 60_000));
  const value = minutes < 60 ? `${minutes}m` : londonClock(next.due) ?? "?";
  return { key: "reminder", label: "Reminder", value, note: next.text, colour: "yellow", needs: false };
}

export async function buildPicture(sources: WallSources, settings: PictureSettings, now: Date): Promise<WallPicture> {
  const ms = settings.waitMs ?? sourceMs;
  const view = sources.mode?.() ?? null;
  const mode = view?.mode ?? null;
  const [doctor, problems, backup, trains, playing] = await Promise.all([
    sources.doctor === undefined ? null : within(sources.doctor, ms).catch(() => "failed" as const),
    within(sources.problems, ms).catch(() => "failed" as const),
    within(sources.backup, ms).catch(() => "failed" as const),
    sources.trains === undefined ? null : within(sources.trains, ms).catch(() => "failed" as const),
    sources.playing === undefined ? null : within(sources.playing, ms).catch(() => null),
  ]);
  const train = trains === null || trains === "failed" ? null : trainOf(trains, now);
  const timers = sources.reminders === undefined ? [] : timersOf(sources.reminders(), now);
  const items: WallItem[] = [];
  if (doctor !== null) items.push(doctor === "failed" ? unknown("server", "Server") : serverItem(doctor));
  if (trains !== null) items.push(trains === "failed" ? unknown("train", "Next train") : trainItem(train));
  items.push(backup === "failed" ? unknown("backup", "Backup") : backupItem(backup, now));
  if (sources.deals !== undefined) items.push(dealsItem(sources.deals(now).alertsToday));
  if (sources.reminders !== undefined) items.push(reminderItem(timers, now));
  items.push(problems === "failed" ? unknown("alerts", "Alerts") : alertsItem(problems));
  const song = playing !== null && playing.playing && playing.item !== null ? { title: cut(playing.item.name, mostValueChars), by: cut(playing.item.by.join(", "), mostNoteChars) } : null;
  if (song !== null) items.push({ key: "music", label: "Now playing", value: song.title, note: song.by, colour: "accent", needs: false });
  const london = londonNow(now);
  return {
    at: now.toISOString(),
    clock: clockText(london.minutes),
    day: `${weekdays[london.weekday] ?? ""} ${partOfDay(london.minutes)}`.trim(),
    phase: phaseOf(mode, settings.trainAlerts, now),
    mode,
    modeUntil: view?.until ?? null,
    speaking: settings.speaking,
    remote: settings.remote === true,
    items,
    train,
    timers,
    playing: song,
  };
}

export function keptPicture(make: () => Promise<WallPicture>, keepMs = pictureKeptMs, clock: () => number = () => performance.now()): () => Promise<WallPicture> {
  let last: { at: number; picture: Promise<WallPicture> } | null = null;
  return () => {
    const at = clock();
    if (last !== null && at - last.at < keepMs) return last.picture;
    const made = { at, picture: make() };
    made.picture.catch(() => {
      if (last === made) last = null;
    });
    last = made;
    return made.picture;
  };
}
