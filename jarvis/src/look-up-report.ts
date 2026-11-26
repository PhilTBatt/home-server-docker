import type { LookUpLogLine } from "./answer-log.js";
import { engines, voiceModes } from "./config.js";
import { webHelpers } from "./look-up.js";

const endings = ["answered", "nothing", "failed", "timed out", "stopped"];
const modes = ["ask", "auto"];

function whole(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function wholeOrNull(value: unknown): boolean {
  return value === null || whole(value);
}

function textOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

export function isLookUpLine(value: unknown): value is LookUpLogLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    line.kind === "look-up" &&
    typeof line.v === "number" &&
    typeof line.at === "string" &&
    !Number.isNaN(Date.parse(line.at)) &&
    typeof line.chat === "string" &&
    (engines as readonly unknown[]).includes(line.engine) &&
    (voiceModes as readonly unknown[]).includes(line.voice) &&
    modes.includes(line.mode as string) &&
    (webHelpers as readonly unknown[]).includes(line.by) &&
    endings.includes(line.ended as string) &&
    [line.ms, line.questionChars, line.answerChars, line.searches, line.opened, line.refused].every(whole) &&
    [line.steps, line.inputTokens, line.outputTokens, line.costEstimateUsd, line.helperMs, line.startMs].every(wholeOrNull) &&
    [line.credential, line.version, line.error].every(textOrNull) &&
    (line.followsOn === undefined || typeof line.followsOn === "boolean") &&
    (line.judgedMs === undefined || wholeOrNull(line.judgedMs))
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function picked(lines: LookUpLogLine[], pick: (line: LookUpLogLine) => number | null): number[] {
  return lines.map(pick).filter((value): value is number => value !== null);
}

function seconds(ms: number | null): string {
  return ms === null ? "-" : `${(ms / 1000).toFixed(1)} s`;
}

function commas(value: number | null): string {
  return value === null
    ? "-"
    : Math.round(value)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function decimal(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}

function dollars(value: number | null): string {
  return value === null ? "-" : `$${value.toFixed(4)}`;
}

export const signIns: Record<string, string> = { none: "your plan token, no API key", ANTHROPIC_API_KEY: "an API key in Claude Code's environment", "API key": "Jarvis's API key, for the API helper" };

export function signIn(credential: string): string {
  return signIns[credential] ?? credential;
}

function counted(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([value, count]) => `${value} (${count})`)
    .join(", ");
}

export function lookUpReport(lines: LookUpLogLine[], table: (header: string[], rows: string[][]) => string): string[] {
  if (lines.length === 0) return [];
  const groups = new Map<string, LookUpLogLine[]>();
  for (const line of lines) groups.set(`${line.mode}, ${line.by}`, [...(groups.get(`${line.mode}, ${line.by}`) ?? []), line]);
  const rows = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([label, group]) => {
      const answered = group.filter((line) => line.ended === "answered");
      const ended = (how: string) => String(group.filter((line) => line.ended === how).length);
      const times = picked(answered, (line) => line.ms);
      return [
        label,
        String(group.length),
        ended("answered"),
        ended("nothing"),
        ended("failed"),
        ended("timed out"),
        ended("stopped"),
        `${seconds(median(times))} (${seconds(times.length === 0 ? null : Math.max(...times))})`,
        seconds(median(picked(answered, (line) => line.startMs))),
        decimal(median(picked(answered, (line) => line.searches))),
        decimal(median(picked(answered, (line) => line.opened))),
        String(group.reduce((sum, line) => sum + line.refused, 0)),
        commas(median(picked(answered, (line) => line.inputTokens))),
        commas(median(picked(answered, (line) => line.outputTokens))),
        dollars(median(picked(answered, (line) => line.costEstimateUsd))),
        dollars(group.some((line) => line.costEstimateUsd !== null) ? group.reduce((sum, line) => sum + (line.costEstimateUsd ?? 0), 0) : null),
      ];
    });
  const days = lines.map((line) => line.at.slice(0, 10));
  const out = [
    `${lines.length} look-up${lines.length === 1 ? "" : "s"} logged. By day (UTC): ${counted(days)}.`,
    table(["", "Look-ups", "Answered", "Found nothing", "Failed", "Too slow", "Stopped", "Time", "Starting up", "Searches", "Pages opened", "Pages refused", "Tokens in", "Tokens out", "Est. cost each", "Est. cost in all"], rows),
    "Time is from the question being handed over to the answer being ready to say: the median over answered look-ups, with the slowest in brackets. Starting up, searches, pages opened, tokens and the cost of each are medians over answered look-ups too; pages refused and the cost in all are totals. The cost is Claude Code's own estimate at list prices, so on a plan it isn't a bill.",
  ];
  const credentials = lines.flatMap((line) => (line.credential === null ? [] : [signIn(line.credential)]));
  if (credentials.length > 0) out.push(`How each look-up signed in: ${counted(credentials)}.`);
  const following = lines.filter((line) => line.followsOn === true);
  const judged = picked(lines, (line) => line.judgedMs ?? null);
  if (following.length > 0) out.push(`${following.length} followed on from the look-up before, so the helper was also given that one's question and answer${judged.length === 0 ? "" : `. ${judged.length} of them came from what you said after a look-up, picked out by the check in ${seconds(median(judged))} (median)`}.`);
  const errors = lines.flatMap((line) => (line.error === null || line.ended === "stopped" ? [] : [line.error]));
  if (errors.length > 0) out.push(`What went wrong: ${counted(errors)}.`);
  return out;
}
