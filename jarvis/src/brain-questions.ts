import { stat } from "node:fs/promises";
import { join } from "node:path";
import { brainDir } from "./config.js";
import { errorOf, fillersAfter, fillersBefore, hubAsk, londonStamp, neverMindWords, reasonOf, type CodeWordReply } from "./code-words.js";
import { hubApiUrl } from "./hub-tools.js";

export type QuestionKind = "gap" | "mistake";

export type BrainQuestion = { ask: string; files: string[]; kind: QuestionKind; wrong: string };

export type Asked = { question: BrainQuestion; answer: { text: string; by: "typed" | "spoken" } | null; at: Date };

export type QuestionsRun = { found: BrainQuestion[]; at: number; asked: Asked[]; confirming: boolean };

export type FiledReply = CodeWordReply & { saved: boolean };

export type BrainQuestions = { exists(path: string): Promise<boolean>; file(text: string, signal: AbortSignal): Promise<FiledReply>; now?: () => Date };

export const questionsWord = "/questions";
export const questionsMost = 2;
export const filesMost = 5;
export const fieldMost = 300;
export const pathMost = 200;
export const answerMost = 4000;
export const questionsTitle = "brain questions";
export const beginLine = "BEGIN QUESTIONS";
export const endLine = "END QUESTIONS";

export function findInstruction(today: string): string {
  return [
    `This message comes from your own code, not from Phil, and he doesn't see it or your reply. He asked for brain questions. Today is ${today}.`,
    `Look through his brain with your read-only tools and find up to ${questionsMost} things worth asking him about: two files that contradict each other, a dated fact that looks out of date, or something mentioned but never explained.`,
    "Don't change anything, don't answer the questions yourself, and don't ask about anything you haven't read in a file.",
    "Reply with this block and nothing after it, written exactly like this, one line per field:",
    beginLine,
    "question: the one question to ask Phil, short and in plain words, as you'd say it to him",
    "files: the brain files it's about, as paths from the brain's top folder, separated by commas",
    "kind: mistake if something looks wrong, or gap if something is missing",
    "wrong: in one sentence, what looks wrong or missing",
    endLine,
    `For a second question, repeat the four lines from question to wrong straight after the first, before ${endLine}. If you find nothing worth asking, write ${beginLine} and ${endLine} with nothing between them.`,
  ].join("\n");
}

const fieldNames = ["question", "files", "kind", "wrong"] as const;

function cleanPath(path: string): string | null {
  const bare = path.startsWith(`${brainDir}/`) ? path.slice(brainDir.length + 1) : path;
  if (bare.length > pathMost) return null;
  return bare.split("/").every((part) => /^[\w][\w .()&'+-]*$/.test(part) && !part.endsWith(" ")) ? bare : null;
}

function fieldOf(line: string, name: (typeof fieldNames)[number], number: number): string {
  const start = `${name}:`;
  if (!line.startsWith(start)) throw new Error(`question ${number} has a line that should start with ${start}`);
  const value = line.slice(start.length).trim();
  if (value === "") throw new Error(`question ${number} has nothing after ${start}`);
  if (value.length > fieldMost) throw new Error(`question ${number}'s ${name} is over ${fieldMost} characters`);
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new Error(`question ${number}'s ${name} has control characters in it`);
  return value;
}

function questionFrom(lines: string[], number: number): BrainQuestion {
  const [ask, files, kind, wrong] = fieldNames.map((name, index) => fieldOf(lines[index], name, number));
  if (kind !== "gap" && kind !== "mistake") throw new Error(`question ${number}'s kind is neither gap nor mistake`);
  const paths = files.split(",").map((path) => path.trim());
  if (paths.length > filesMost) throw new Error(`question ${number} names more than ${filesMost} files`);
  const clean = paths.map(cleanPath);
  const bad = clean.indexOf(null);
  if (bad !== -1) throw new Error(`question ${number} names a file that isn't a plain path in the brain: ${paths[bad].slice(0, pathMost)}`);
  return { ask, files: [...new Set(clean as string[])], kind, wrong };
}

export function questionsIn(reply: string): BrainQuestion[] | string {
  const lines = reply.split(/\r?\n/).map((line) => line.trim());
  const begin = lines.lastIndexOf(beginLine);
  if (begin === -1) return `there was no ${beginLine} line`;
  const end = lines.indexOf(endLine, begin + 1);
  if (end === -1) return `there was no ${endLine} line after ${beginLine}`;
  const body = lines.slice(begin + 1, end).filter((line) => line !== "");
  if (body.length % fieldNames.length !== 0) return `its lines didn't come in fours: question, files, kind and wrong`;
  const count = body.length / fieldNames.length;
  if (count > questionsMost) return `it had ${count} questions, and the most is ${questionsMost}`;
  try {
    return Array.from({ length: count }, (_, index) => questionFrom(body.slice(index * fieldNames.length), index + 1));
  } catch (error) {
    return reasonOf(error);
  }
}

export async function readQuestions(reply: string, exists: (path: string) => Promise<boolean>): Promise<BrainQuestion[] | string> {
  const found = questionsIn(reply);
  if (typeof found === "string") return found;
  for (const [index, question] of found.entries()) {
    for (const path of question.files) if (!(await exists(path).catch(() => false))) return `question ${index + 1} names a file that isn't in the brain: ${path}`;
  }
  return found;
}

export function brainFileExists(dir = brainDir): (path: string) => Promise<boolean> {
  return async (path) => {
    if (cleanPath(path) !== path) return false;
    return stat(join(dir, path)).then(
      (found) => found.isFile(),
      () => false,
    );
  };
}

function wordsOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .replace(new RegExp(`^(?:(?:${fillersBefore}) )+`), "")
    .replace(new RegExp(`(?: (?:${fillersAfter}))+$`), "");
}

export const skipWords = ["skip", "skip it", "skip that", "skip this", "skip this one", "skip that one"];
export const yesWords = ["yes", "yeah", "yep", "yes please", "file it", "yes file it"];

export function isSkip(text: string): boolean {
  return skipWords.includes(wordsOf(text));
}

export function isEnd(text: string): boolean {
  return neverMindWords.includes(wordsOf(text)) && !/\?\s*$/.test(text);
}

export function isYes(text: string): boolean {
  return yesWords.includes(wordsOf(text));
}

const kindNames: Record<QuestionKind, string> = { gap: "a gap", mistake: "a suspected mistake" };

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function answerLine(asked: Asked): string {
  if (asked.answer === null) return `- Phil didn't answer, but said yes to filing it as a suspected mistake, ${londonStamp(asked.at)}.`;
  return `- Phil answered (${asked.answer.by === "typed" ? "typed" : "spoken, as Whisper heard it"}), ${londonStamp(asked.at)}:\n\n> ${oneLine(asked.answer.text)}`;
}

export function questionsNoteText(asked: Asked[], at: Date): string {
  const sections = asked.map((item, index) =>
    [`## ${index + 1}. ${kindNames[item.question.kind].replace(/^a/, "A")}`, "", `- Jarvis asked: ${oneLine(item.question.ask)}`, `- About: ${item.question.files.map((path) => `\`${path}\``).join(", ")}`, `- What looked wrong to Jarvis: ${oneLine(item.question.wrong)}`, answerLine(item)].join("\n"),
  );
  return `# Brain questions, ${londonStamp(at)}\n\nJarvis asked these when Phil asked him for brain questions. The questions, the files and what looked wrong come from the AI, which can be wrong. A typed answer is exactly as typed; a spoken one is as Whisper heard it, so a word may be wrong.\n\n${sections.join("\n\n")}\n`;
}

export const questionsOffNote = "brain questions are off, so set JARVIS_BRAIN_QUESTIONS=on in jarvis/.env, with JARVIS_HUB_TOOLS=on, and start Jarvis again with bash host/jarvis.sh";
export const notFiledSay = "I couldn't file your answers.";

export async function fileBrainQuestions(text: string, token: string | null, signal: AbortSignal, url = hubApiUrl): Promise<FiledReply> {
  if (token === null) return { say: notFiledSay, note: questionsOffNote, saved: false };
  try {
    const { status, fields } = await hubAsk("/memory/inbox", { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ title: questionsTitle, text }) }, signal, url);
    if (status === 201 && typeof fields.saved === "string") return { say: "I've filed that in the brain's inbox.", note: `saved in the brain's inbox as ${fields.saved.replace(/[^\w.-]/g, "")}`, saved: true };
    if (status === 404 && fields.error === "Note uploads are switched off") return { say: notFiledSay, note: "note uploads are off in the hub, so set MEMORY_UPLOAD=on in api/.env and restart the hub", saved: false };
    return { say: notFiledSay, note: `the hub said: ${errorOf(fields, status)}`, saved: false };
  } catch (error) {
    return { say: notFiledSay, note: `couldn't reach the hub: ${reasonOf(error)}`, saved: false };
  }
}
