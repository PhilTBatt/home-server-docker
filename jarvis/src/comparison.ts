import { logVersion, type LogLine, type NewChatLine, type Rating, type RatingLine, type SpeechLine } from "./answer-log.js";
import { chatModes, engines, hubActionsModes, hubToolsModes, lengthHintModes, sessionNotesModes, speechStarts, thinkingHistories, voiceModes, type ChatMode, type Engine, type HubActionsMode, type HubToolsMode, type LengthHints, type SessionNotesMode, type SpeechStart, type ThinkingHistory, type VoiceMode } from "./config.js";
import { seconds, summarise } from "./timing.js";

export type ReadLog = { lines: LogLine[]; ratings?: RatingLine[]; newChats?: NewChatLine[]; speech?: SpeechLine[]; skipped: number };

export type Group = {
  label: string;
  engine: Engine;
  thinking: ThinkingHistory | null;
  model: string;
  chats: ChatMode;
  lengthHints: LengthHints;
  hubTools: HubToolsMode;
  hubActions: HubActionsMode;
  sessionNotes: SessionNotesMode;
  voice: VoiceMode;
  speechStart: SpeechStart | null;
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
    (line.hubTools === undefined || (hubToolsModes as readonly unknown[]).includes(line.hubTools)) &&
    (line.hubActions === undefined || (hubActionsModes as readonly unknown[]).includes(line.hubActions)) &&
    (line.sessionNotes === undefined || (sessionNotesModes as readonly unknown[]).includes(line.sessionNotes)) &&
    (line.voice === undefined || (voiceModes as readonly unknown[]).includes(line.voice)) &&
    (line.speechStart === undefined || (speechStarts as readonly unknown[]).includes(line.speechStart)) &&
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

export function isSpeechLine(value: unknown): value is SpeechLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return (
    line.v === logVersion &&
    line.kind === "speech" &&
    typeof line.at === "string" &&
    typeof line.chat === "string" &&
    Number.isInteger(line.question) &&
    (line.question as number) >= 1 &&
    ["firstSentenceMs", "firstSoundMadeMs", "firstSoundMs", "longestSilenceMs"].every((field) => isNumberOrNull(line[field])) &&
    ["spoken", "failed", "left"].every((field) => Number.isInteger(line[field]) && (line[field] as number) >= 0) &&
    ["stopped", "gaveUp", "tooLong"].every((field) => typeof line[field] === "boolean")
  );
}

export function readLog(text: string): ReadLog {
  const lines: LogLine[] = [];
  const ratings: RatingLine[] = [];
  const newChats: NewChatLine[] = [];
  const speech: SpeechLine[] = [];
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
    else if (isSpeechLine(parsed)) speech.push(parsed);
    else if (isLogLine(parsed)) lines.push(parsed);
    else skipped++;
  }
  return { lines, ratings, newChats, speech, skipped };
}

function settingName(engine: Engine, thinking: ThinkingHistory | null): string {
  if (engine === "sdk") return "Agent SDK";
  return thinking === null ? "API" : `API, ${thinking}`;
}

function order(group: Group): [number, number, string, number, number, number, number, number, number, number] {
  return [engines.indexOf(group.engine), group.thinking === null ? -1 : thinkingHistories.indexOf(group.thinking), group.model, chatModes.indexOf(group.chats), lengthHintModes.indexOf(group.lengthHints), hubToolsModes.indexOf(group.hubTools), hubActionsModes.indexOf(group.hubActions), sessionNotesModes.indexOf(group.sessionNotes), voiceModes.indexOf(group.voice), group.speechStart === null ? -1 : speechStarts.indexOf(group.speechStart)];
}

function compareGroups(a: Group, b: Group): number {
  const [engineA, thinkingA, modelA, chatsA, hintsA, hubA, actionsA, notesA, voiceA, startA] = order(a);
  const [engineB, thinkingB, modelB, chatsB, hintsB, hubB, actionsB, notesB, voiceB, startB] = order(b);
  return engineA - engineB || thinkingA - thinkingB || (modelA < modelB ? -1 : modelA > modelB ? 1 : 0) || chatsA - chatsB || hintsA - hintsB || hubA - hubB || actionsA - actionsB || notesA - notesB || voiceA - voiceB || startA - startB;
}

const chatNames: Record<ChatMode, string> = { fresh: "fresh", resume: "resumed" };
const hintNames: Record<LengthHints, string> = { note: "length note", jarvis: "Jarvis says" };
const hubNames: Record<HubToolsMode, string> = { off: "no hub tools", on: "hub tools" };
const actionNames: Record<HubActionsMode, string> = { off: "no hub actions", on: "hub actions" };
const notesNames: Record<SessionNotesMode, string> = { off: "no session notes", on: "session notes" };
const voiceNames: Record<VoiceMode, string> = { off: "no voice", kokoro: "Kokoro voice" };
const startNames: Record<SpeechStart, string> = { sentence: "whole first sentence", clause: "first clause early" };

export function groupLines(lines: LogLine[]): Group[] {
  const groups = new Map<string, Group>();
  for (const line of lines) {
    const thinking = line.engine === "api" ? line.thinking : null;
    const chats = line.chats ?? "fresh";
    const lengthHints = line.lengthHints ?? "note";
    const hubTools = line.hubTools ?? "off";
    const hubActions = line.hubActions ?? "off";
    const sessionNotes = line.sessionNotes ?? "off";
    const voice = line.voice ?? "off";
    const speechStart = voice === "off" ? null : (line.speechStart ?? "sentence");
    const key = JSON.stringify([line.engine, thinking, line.model, chats, lengthHints, hubTools, hubActions, sessionNotes, voice, speechStart]);
    const group = groups.get(key) ?? { label: "", engine: line.engine, thinking, model: line.model, chats, lengthHints, hubTools, hubActions, sessionNotes, voice, speechStart, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  const models = new Set(lines.map((line) => line.model));
  const chatSettings = new Set(lines.map((line) => line.chats ?? "fresh"));
  const hintSettings = new Set(lines.map((line) => line.lengthHints ?? "note"));
  const hubSettings = new Set(lines.map((line) => line.hubTools ?? "off"));
  const actionSettings = new Set(lines.map((line) => line.hubActions ?? "off"));
  const notesSettings = new Set(lines.map((line) => line.sessionNotes ?? "off"));
  const voiceSettings = new Set(lines.map((line) => line.voice ?? "off"));
  const startSettings = new Set(lines.flatMap((line) => ((line.voice ?? "off") === "off" ? [] : [line.speechStart ?? "sentence"])));
  const label = (group: Group) => {
    const parts = [
      settingName(group.engine, group.thinking),
      ...(chatSettings.size > 1 ? [chatNames[group.chats]] : []),
      ...(hintSettings.size > 1 ? [hintNames[group.lengthHints]] : []),
      ...(hubSettings.size > 1 ? [hubNames[group.hubTools]] : []),
      ...(actionSettings.size > 1 ? [actionNames[group.hubActions]] : []),
      ...(notesSettings.size > 1 ? [notesNames[group.sessionNotes]] : []),
      ...(voiceSettings.size > 1 ? [voiceNames[group.voice]] : []),
      ...(startSettings.size > 1 && group.speechStart !== null ? [startNames[group.speechStart]] : []),
    ];
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

function latestSpeech(speech: SpeechLine[]): Map<string, SpeechLine> {
  const latest = new Map<string, SpeechLine>();
  for (const line of speech) latest.set(questionKey(line), line);
  return latest;
}

function summaryRows(groups: Group[], ratings: Map<string, Rating>, newChats: NewChatLine[], speech: Map<string, SpeechLine>): string[][] {
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
    row("First sound, median", (_group, lines) => shown(median(numbers(lines, (line) => speech.get(questionKey(line))?.firstSoundMs)), seconds)),
    row("Speech stopped early", (group, lines) => {
      const spoken = lines.flatMap((line) => speech.get(questionKey(line)) ?? []).filter((line) => line.firstSoundMs !== null);
      return group.voice === "off" || spoken.length === 0 ? "-" : `${spoken.filter((line) => line.stopped).length} of ${spoken.length}`;
    }),
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

type Spoken = { line: LogLine; speech: SpeechLine };

function spokenAnswers(group: Group, speech: Map<string, SpeechLine>): Spoken[] {
  return group.lines.flatMap((line) => {
    const said = speech.get(questionKey(line));
    return line.ok && said !== undefined && said.firstSoundMs !== null ? [{ line, speech: said }] : [];
  });
}

function speechRows(groups: Group[], speech: Map<string, SpeechLine>): string[][] {
  const cell = (answers: Spoken[], pick: (answer: Spoken) => number | null) => {
    const summary = summarise(answers.map(pick).filter((value): value is number => value !== null));
    return summary === null ? "-" : `${seconds(summary.median)} (${seconds(summary.max)})`;
  };
  return groups.flatMap((group) =>
    [
      { when: "first question", answers: spokenAnswers(group, speech).filter((answer) => answer.line.question === 1) },
      { when: "later questions", answers: spokenAnswers(group, speech).filter((answer) => answer.line.question > 1) },
    ].flatMap(({ when, answers }) =>
      answers.length === 0 ? [] : [[`${group.label}, ${when}`, String(answers.length), cell(answers, (answer) => answer.line.firstWordsMs), cell(answers, (answer) => answer.speech.firstSentenceMs), cell(answers, (answer) => answer.speech.firstSoundMadeMs), cell(answers, (answer) => answer.speech.firstSoundMs), cell(answers, (answer) => answer.speech.longestSilenceMs)]],
    ),
  );
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

export function compareReport({ lines, ratings = [], newChats = [], speech = [], skipped }: ReadLog): string {
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
  const said = latestSpeech(speech);
  out.push("", table(["", ...groups.map((group) => group.label)], summaryRows(groups, latestRatings(ratings), newChats, said)));
  out.push("", "Largest single request by question number in the chat, median (tokens):");
  out.push(table(["", ...Array.from({ length: lastQuestionColumn }, (_unused, index) => (index + 1 === lastQuestionColumn ? `${index + 1}+` : String(index + 1)))], questionRows(groups)));
  const spoken = speechRows(groups, said);
  if (spoken.length > 0) {
    out.push("", "Speech, timed from the question being sent, and the longest silence between two sentences: the median, with the slowest in brackets.");
    out.push(table(["", "Answers", "First words", "First sentence sent", "Its sound made", "First sound", "Longest silence"], spoken));
    const silent = groups.reduce((sum, group) => sum + (group.voice === "off" ? 0 : group.lines.filter((line) => line.ok).length - spokenAnswers(group, said).length), 0);
    if (silent > 0) out.push(`${plural(silent, "answer")} with the voice on had no sound and ${silent === 1 ? "is" : "are"} left out of this table.`);
  }
  const uncached = lines.filter((line) => line.ok && (line.cacheReadTokens === undefined || line.cacheWriteTokens === undefined)).length;
  if (uncached > 0) out.push("", `The cache rows leave out ${plural(uncached, "answer")} logged before cache tokens were counted.`);
  const older = lines.filter((line) => line.ok && line.largestRequestTokens === undefined).length;
  if (older > 0) out.push("", `The refused, spoke-first and largest-request numbers leave out ${plural(older, "answer")} logged before they were counted.`);
  const failures = failureLines(groups);
  if (failures.length > 0) out.push("", "Failures:", ...failures);
  out.push("", "Medians and averages leave out failed questions; the total cost includes them. Costs are estimates: the Agent SDK's own (apart from a resumed chat's first answer), and the plain API's from list prices.");
  return `${out.join("\n")}\n`;
}
