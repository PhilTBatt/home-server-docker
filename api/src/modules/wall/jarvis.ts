import { tidyText } from "../talk/desk.js";
import { pageShownMs, type PageBy } from "./pages.js";

export const activities = ["waiting", "heard", "listening", "thinking", "looking", "speaking", "done", "needs"] as const;
export const voices = ["owner", "other", "unknown"] as const;
export const mostSlot = 4;
export const mostHeardChars = 300;
export const mostSaidChars = 600;
export const runningMs = 45_000;
export const wordsKeptMs = 60_000;

export type Activity = (typeof activities)[number];
export type Voice = (typeof voices)[number];
export type Heard = { text: string; voice: Voice | null; slot: number | null };
export type JarvisReport = { activity: Activity; muted: boolean | null; heard: Heard | null; said: string | null };
export type OpenPage = { id: string; by: PageBy; ageMs: number };
export type JarvisView = { seq: number; running: boolean; activity: Activity; muted: boolean | null; heard: (Heard & { ageMs: number }) | null; said: string | null; saidAgeMs: number | null; page: OpenPage | null; opens: number; backs: number };

const fields = ["activity", "muted", "heard", "said"];
const heardFields = ["text", "voice", "slot"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function words(value: unknown, most: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const tidied = tidyText(value, most);
  return tidied === "" ? null : tidied;
}

function readHeard(value: unknown): Heard | null | { refused: string } {
  if (value === null) return null;
  if (!isRecord(value) || Object.keys(value).some((key) => !heardFields.includes(key))) return { refused: "heard must be null or an object with text, voice and slot" };
  const text = words(value.text, mostHeardChars);
  if (typeof text !== "string") return { refused: "heard.text must be what was heard" };
  const voice = value.voice === null || value.voice === undefined ? null : voices.find((one) => one === value.voice);
  if (voice === undefined) return { refused: `heard.voice must be null or one of ${voices.join(", ")}` };
  const slot = value.slot === null || value.slot === undefined ? null : value.slot;
  if (slot !== null && (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > mostSlot)) return { refused: `heard.slot must be null or a whole number from 0 to ${mostSlot}` };
  if (slot !== null && voice !== "other") return { refused: "heard.slot is only for another known voice" };
  return { text, voice, slot };
}

export function readReport(body: unknown): JarvisReport | { refused: string } {
  if (!isRecord(body)) return { refused: "Send a JSON object with activity, muted, heard and said" };
  if (Object.keys(body).some((key) => !fields.includes(key))) return { refused: `Only ${fields.join(", ")} are allowed` };
  const activity = activities.find((one) => one === body.activity);
  if (activity === undefined) return { refused: `activity must be one of ${activities.join(", ")}` };
  const muted = body.muted === undefined ? null : body.muted;
  if (muted !== null && typeof muted !== "boolean") return { refused: "muted must be true, false or null" };
  const heard = readHeard(body.heard ?? null);
  if (heard !== null && "refused" in heard) return heard;
  const said = words(body.said ?? null, mostSaidChars);
  if (said === undefined) return { refused: "said must be null or Jarvis's words" };
  return { activity, muted, heard, said };
}

type Kept = { report: JarvisReport; heardAt: number | null; saidAt: number | null };
type Forgotten = { heard: Heard | null; said: string | null };

export type JarvisDesk = {
  report(report: JarvisReport, at: number): number;
  view(at: number): JarvisView;
  waitForChange(after: number, ms: number, signal: AbortSignal): Promise<void>;
  openPage(id: string, by: PageBy, at: number): number;
  closePage(at: number): boolean;
};

const nothing: JarvisReport = { activity: "waiting", muted: null, heard: null, said: null };

function sameHeard(a: Heard | null, b: Heard | null): boolean {
  return a === b || (a !== null && b !== null && a.text === b.text && a.voice === b.voice && a.slot === b.slot);
}

export function createJarvisDesk(): JarvisDesk {
  let seq = 0;
  let kept: Kept = { report: nothing, heardAt: null, saidAt: null };
  let lastAt: number | null = null;
  let wasRunning = false;
  let forgotten: Forgotten = { heard: null, said: null };
  let page: { id: string; by: PageBy; at: number } | null = null;
  let opens = 0;
  let backs = 0;
  const waiters = new Set<() => void>();

  const stir = () => {
    for (const waiter of [...waiters]) waiter();
  };

  const forget = (at: number) => {
    const heardOld = kept.heardAt !== null && at - kept.heardAt > wordsKeptMs;
    const saidOld = kept.saidAt !== null && at - kept.saidAt > wordsKeptMs;
    if (!heardOld && !saidOld) return;
    forgotten = { heard: heardOld ? kept.report.heard : forgotten.heard, said: saidOld ? kept.report.said : forgotten.said };
    kept = { report: { ...kept.report, heard: heardOld ? null : kept.report.heard, said: saidOld ? null : kept.report.said }, heardAt: heardOld ? null : kept.heardAt, saidAt: saidOld ? null : kept.saidAt };
  };

  const running = (at: number) => lastAt !== null && at - lastAt <= runningMs;

  const pageOver = (at: number) => {
    if (page === null || at - page.at < pageShownMs) return;
    page = null;
    seq++;
    stir();
  };

  return {
    report(given, at) {
      forget(at);
      const report = { ...given, heard: given.heard !== null && sameHeard(given.heard, forgotten.heard) ? null : given.heard, said: given.said !== null && given.said === forgotten.said ? null : given.said };
      if (report.heard === null && given.heard === null) forgotten = { ...forgotten, heard: null };
      if (report.said === null && given.said === null) forgotten = { ...forgotten, said: null };
      const was = kept.report;
      const changed = !wasRunning || was.activity !== report.activity || was.muted !== report.muted || !sameHeard(was.heard, report.heard) || was.said !== report.said;
      const heardAt = report.heard === null ? null : sameHeard(was.heard, report.heard) && kept.heardAt !== null ? kept.heardAt : at;
      const saidAt = report.said === null ? null : was.said === report.said && kept.saidAt !== null ? kept.saidAt : at;
      kept = { report, heardAt, saidAt };
      lastAt = at;
      wasRunning = true;
      if (changed) {
        seq++;
        stir();
      }
      return seq;
    },
    view(at) {
      forget(at);
      pageOver(at);
      if (wasRunning && !running(at)) {
        wasRunning = false;
        kept = { report: nothing, heardAt: null, saidAt: null };
        seq++;
        stir();
      }
      const { report, heardAt, saidAt } = kept;
      return {
        seq,
        running: running(at),
        activity: report.activity,
        muted: report.muted,
        heard: report.heard === null || heardAt === null ? null : { ...report.heard, ageMs: at - heardAt },
        said: report.said,
        saidAgeMs: report.said === null || saidAt === null ? null : at - saidAt,
        page: page === null ? null : { id: page.id, by: page.by, ageMs: Math.max(0, at - page.at) },
        opens,
        backs,
      };
    },
    openPage(id, by, at) {
      page = { id, by, at };
      opens++;
      seq++;
      stir();
      return seq;
    },
    closePage(at) {
      pageOver(at);
      const was = page !== null;
      page = null;
      backs++;
      seq++;
      stir();
      return was;
    },
    waitForChange(after, ms, signal) {
      if (seq !== after || signal.aborted) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        waiters.add(done);
        signal.addEventListener("abort", done, { once: true });
      });
    },
  };
}
