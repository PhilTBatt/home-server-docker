import { logVersion, type LogLine, type NewChatLine, type Rating, type RatingLine } from "./answer-log.js";
import { chatModes, engines, lengthHintModes, thinkingHistories, type ChatMode, type Engine, type LengthHints, type ThinkingHistory } from "./config.js";
import { seconds, summarise } from "./timing.js";

export type ReadLog = { lines: LogLine[]; ratings?: RatingLine[]; newChats?: NewChatLine[]; skipped: number };

export type Group = {
  label: string;
  engine: Engine;
  thinking: ThinkingHistory | null;
  model: string;
  chats: ChatMode;
  lengthHints: LengthHints;
  lines: LogLine[];
};

const numberFields = ["firstWordsMs", "totalMs", "rounds", "toolUses", "inputTokens", "outputTokens", "costUsd", "earlierThinkingBlocks"] as const;
const laterNumberFields = ["cacheWriteTokens", "cacheReadTokens", "largestRequestTokens", "refusedTools"] as const;
const lastQuestionColumn = 6;

function isNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function isLogLine(value: unknown): value is LogLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return (
    line.v === logVersion &&
    typeof line.at === "string" &&
    typeof line.chat === "string" &&
    Number.isInteger(line.question) &&
    (line.question as number) >= 1 &&
    (engines as readonly unknown[]).includes(line.engine) &&
    (line.thinking === null || (thinkingHistories as readonly unknown[]).includes(line.thinking)) &&
    typeof line.model === "string" &&
    (line.chats === undefined || (chatModes as readonly unknown[]).includes(line.chats)) &&
    (line.lengthHints === undefined || (lengthHintModes as readonly unknown[]).includes(line.lengthHints)) &&
    typeof line.ok === "boolean" &&
    (line.error === null || typeof line.error === "string") &&
    numberFields.every((field) => isNumberOrNull(line[field])) &&
    laterNumberFields.every((field) => line[field] === undefined || isNumberOrNull(line[field])) &&
    (line.recovered === null || typeof line.recovered === "boolean") &&
    (line.spokeFirst === undefined || line.spokeFirst === null || typeof line.spokeFirst === "boolean") &&
    (line.retried === undefined || line.retried === null || typeof line.retried === "boolean")
  );
}

export function isRatingLine(value: unknown): value is RatingLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return (
    line.v === logVersion &&
    line.kind === "rating" &&
    typeof line.at === "string" &&
    typeof line.chat === "string" &&
    Number.isInteger(line.question) &&
    (line.question as number) >= 1 &&
    (line.rating === "good" || line.rating === "bad")
  );
}

export function isNewChatLine(value: unknown): value is NewChatLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return (
    line.v === logVersion &&
    line.kind === "new chat" &&
    typeof line.at === "string" &&
    typeof line.chat === "string" &&
    Number.isInteger(line.questions) &&
    (line.questions as number) >= 1 &&
    (line.lastRequestTokens === null || (Number.isInteger(line.lastRequestTokens) && (line.lastRequestTokens as number) >= 0))
  );
}

export function readLog(text: string): ReadLog {
  const lines: LogLine[] = [];
  const ratings: RatingLine[] = [];
  const newChats: NewChatLine[] = [];
  let skipped = 0;
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      skipped++;
      continue;
    }
    if (isRatingLine(parsed)) ratings.push(parsed);
    else if (isNewChatLine(parsed)) newChats.push(parsed);
    else if (isLogLine(parsed)) lines.push(parsed);
    else skipped++;
  }
  return { lines, ratings, newChats, skipped };
}

function settingName(engine: Engine, thinking: ThinkingHistory | null): string {
  if (engine === "sdk") return "Agent SDK";
  return thinking === null ? "API" : `API, ${thinking}`;
}

function order(group: Group): [number, number, string, number, number] {
  return [engines.indexOf(group.engine), group.thinking === null ? -1 : thinkingHistories.indexOf(group.thinking), group.model, chatModes.indexOf(group.chats), lengthHintModes.indexOf(group.lengthHints)];
}

function compareGroups(a: Group, b: Group): number {
  const [engineA, thinkingA, modelA, chatsA, hintsA] = order(a);
  const [engineB, thinkingB, modelB, chatsB, hintsB] = order(b);
  return engineA - engineB || thinkingA - thinkingB || (modelA < modelB ? -1 : modelA > modelB ? 1 : 0) || chatsA - chatsB || hintsA - hintsB;
}

const chatNames: Record<ChatMode, string> = { fresh: "fresh", resume: "resumed" };
const hintNames: Record<LengthHints, string> = { note: "length note", jarvis: "Jarvis says" };

export function groupLines(lines: LogLine[]): Group[] {
  const groups = new Map<string, Group>();
  for (const line of lines) {
    const thinking = line.engine === "api" ? line.thinking : null;
    const chats = line.chats ?? "fresh";
    const lengthHints = line.lengthHints ?? "note";
    const key = JSON.stringify([line.engine, thinking, line.model, chats, lengthHints]);
    const group = groups.get(key) ?? { label: "", engine: line.engine, thinking, model: line.model, chats, lengthHints, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  const models = new Set(lines.map((line) => line.model));
  const chatSettings = new Set(lines.map((line) => line.chats ?? "fresh"));
  const hintSettings = new Set(lines.map((line) => line.lengthHints ?? "note"));
  const label = (group: Group) => {
    const parts = [settingName(group.engine, group.thinking), ...(chatSettings.size > 1 ? [chatNames[group.chats]] : []), ...(hintSettings.size > 1 ? [hintNames[group.lengthHints]] : [])];
    const name = parts.join(", ");
    return models.size > 1 ? `${name} (${group.model})` : name;
  };
  return [...groups.values()].map((group) => ({ ...group, label: label(group) })).sort(compareGroups);
}

function numbers(lines: LogLine[], pick: (line: LogLine) => number | null | undefined): number[] {
  return lines.map(pick).filter((value): value is number => typeof value === "number");
}

function median(values: number[]): number | null {
  return summarise(values)?.median ?? null;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function shown(value: number | null, format: (value: number) => string): string {
  return value === null ? "-" : format(value);
}

export function withCommas(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function dollars(value: number): string {
  return `$${value.toFixed(4)}`;
}

function fineDollars(value: number): string {
  return `$${value.toFixed(5)}`;
}

function oneDecimal(value: number): string {
  return value.toFixed(1);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function table(header: string[], rows: string[][]): string {
  const widths = header.map((cell, column) => Math.max(cell.length, ...rows.map((row) => row[column].length)));
  const render = (cells: string[]) =>
    cells
      .map((cell, column) => (column === 0 ? cell.padEnd(widths[0]) : cell.padStart(widths[column])))
      .join("   ")
      .trimEnd();
  return [render(header), ...rows.map(render)].join("\n");
}

function questionKey(line: { chat: string; question: number }): string {
  return JSON.stringify([line.chat, line.question]);
}

function latestRatings(ratings: RatingLine[]): Map<string, Rating> {
  const latest = new Map<string, Rating>();
  for (const rating of ratings) latest.set(questionKey(rating), rating.rating);
  return latest;
}

function summaryRows(groups: Group[], ratings: Map<string, Rating>, newChats: NewChatLine[]): string[][] {
  const answered = groups.map((group) => group.lines.filter((line) => line.ok));
  const startedAnew = (group: Group) => {
    const chats = new Set(group.lines.map((line) => line.chat));
    return newChats.filter((line) => chats.has(line.chat));
  };
  const row = (label: string, cell: (group: Group, answered: LogLine[]) => string) => [label, ...groups.map((group, index) => cell(group, answered[index]))];
  return [
    row("Answers", (_group, lines) => String(lines.length)),
    row("Failed", (group) => String(group.lines.filter((line) => !line.ok).length)),
    row("Recovered", (group, lines) => (group.engine === "api" ? String(lines.filter((line) => line.recovered === true).length) : "-")),
    row("Retried after a network error", (group, lines) => (group.engine === "api" ? String(lines.filter((line) => line.retried === true).length) : "-")),
    row("Rated good", (_group, lines) => String(lines.filter((line) => ratings.get(questionKey(line)) === "good").length)),
    row("Rated bad", (_group, lines) => String(lines.filter((line) => ratings.get(questionKey(line)) === "bad").length)),
    row("First words, median", (_group, lines) => shown(median(numbers(lines, (line) => line.firstWordsMs)), seconds)),
    row("Full answer, median", (_group, lines) => shown(median(numbers(lines, (line) => line.totalMs)), seconds)),
    row("Rounds, average", (_group, lines) => shown(average(numbers(lines, (line) => line.rounds)), oneDecimal)),
    row("Tool uses, average", (_group, lines) => shown(average(numbers(lines, (line) => line.toolUses)), oneDecimal)),
    row("Refused tool calls, total", (_group, lines) => {
      const refused = numbers(lines, (line) => line.refusedTools);
      return refused.length === 0 ? "-" : String(refused.reduce((sum, count) => sum + count, 0));
    }),
    row("Spoke before first tool", (_group, lines) => {
      const used = lines.filter((line) => typeof line.spokeFirst === "boolean");
      return used.length === 0 ? "-" : `${used.filter((line) => line.spokeFirst).length} of ${used.length}`;
    }),
    row("Input tokens, median", (_group, lines) => shown(median(numbers(lines, (line) => line.inputTokens)), withCommas)),
    row("Largest request, median", (_group, lines) => shown(median(numbers(lines, (line) => line.largestRequestTokens)), withCommas)),
    row("Read from cache, median", (_group, lines) => shown(median(numbers(lines, (line) => line.cacheReadTokens)), withCommas)),
    row("Written to cache, median", (_group, lines) => shown(median(numbers(lines, (line) => line.cacheWriteTokens)), withCommas)),
    row("Output tokens, median", (_group, lines) => shown(median(numbers(lines, (line) => line.outputTokens)), withCommas)),
    row("Earlier thinking blocks, median", (group, lines) => (group.engine === "api" ? shown(median(numbers(lines, (line) => line.earlierThinkingBlocks)), withCommas) : "-")),
    row("New chats started", (group) => String(startedAnew(group).length)),
    row("Size when a new chat was started, median", (group) => shown(median(startedAnew(group).flatMap((line) => (line.lastRequestTokens === null ? [] : [line.lastRequestTokens]))), withCommas)),
    row("Cost per answer, median", (_group, lines) => shown(median(numbers(lines, (line) => line.costUsd)), fineDollars)),
    row("Cost, total", (group) => {
      const costs = numbers(group.lines, (line) => line.costUsd);
      return costs.length === 0 ? "-" : dollars(costs.reduce((sum, cost) => sum + cost, 0));
    }),
  ];
}

function questionColumn(question: number): number {
  return Math.min(question, lastQuestionColumn);
}

function questionRows(groups: Group[]): string[][] {
  return groups.map((group) => [
    group.label,
    ...Array.from({ length: lastQuestionColumn }, (_unused, index) => {
      const lines = group.lines.filter((line) => line.ok && questionColumn(line.question) === index + 1);
      return shown(median(numbers(lines, (line) => line.largestRequestTokens)), withCommas);
    }),
  ]);
}

function failureLines(groups: Group[]): string[] {
  return groups.flatMap((group) => {
    const counts = new Map<string, number>();
    for (const line of group.lines) if (!line.ok) counts.set(line.error ?? "other", (counts.get(line.error ?? "other") ?? 0) + 1);
    if (counts.size === 0) return [];
    const kinds = [...counts.entries()].sort(([kindA, countA], [kindB, countB]) => countB - countA || (kindA < kindB ? -1 : 1));
    return [`  ${group.label}: ${kinds.map(([kind, count]) => `${kind} (${count})`).join(", ")}`];
  });
}

export function compareReport({ lines, ratings = [], newChats = [], skipped }: ReadLog): string {
  const out: string[] = [];
  const skippedNote = `${plural(skipped, "line")} couldn't be read and ${skipped === 1 ? "was" : "were"} left out.`;
  if (lines.length === 0) {
    out.push("No answers logged yet. Set JARVIS_LOG=on, chat for a while, then run this again.");
    if (skipped > 0) out.push(skippedNote);
    return `${out.join("\n")}\n`;
  }
  const days = lines.map((line) => line.at.slice(0, 10)).sort();
  const span = days[0] === days[days.length - 1] ? `on ${days[0]}` : `from ${days[0]} to ${days[days.length - 1]}`;
  const chats = new Set(lines.map((line) => line.chat)).size;
  out.push(`${plural(lines.length, "question")} logged in ${plural(chats, "chat")}, ${span} (UTC).`);
  if (skipped > 0) out.push(skippedNote);
  const groups = groupLines(lines);
  out.push("", table(["", ...groups.map((group) => group.label)], summaryRows(groups, latestRatings(ratings), newChats)));
  out.push("", "Largest single request by question number in the chat, median (tokens):");
  out.push(table(["", ...Array.from({ length: lastQuestionColumn }, (_unused, index) => (index + 1 === lastQuestionColumn ? `${index + 1}+` : String(index + 1)))], questionRows(groups)));
  const uncached = lines.filter((line) => line.ok && (line.cacheReadTokens === undefined || line.cacheWriteTokens === undefined)).length;
  if (uncached > 0) out.push("", `The cache rows leave out ${plural(uncached, "answer")} logged before cache tokens were counted.`);
  const older = lines.filter((line) => line.ok && line.largestRequestTokens === undefined).length;
  if (older > 0) out.push("", `The refused, spoke-first and largest-request numbers leave out ${plural(older, "answer")} logged before they were counted.`);
  const failures = failureLines(groups);
  if (failures.length > 0) out.push("", "Failures:", ...failures);
  out.push("", "Medians and averages leave out failed questions; the total cost includes them. Costs are estimates: the Agent SDK's own (apart from a resumed chat's first answer), and the plain API's from list prices.");
  return `${out.join("\n")}\n`;
}
