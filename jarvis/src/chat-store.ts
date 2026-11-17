import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatMode, Engine } from "./config.js";
import type { Turn } from "./direct.js";

export const chatsFolder = fileURLToPath(new URL("../data/chats/", import.meta.url));
export const apiChatFile = join(chatsFolder, "plain-api.json");
export const sdkChatsFolder = join(chatsFolder, "agent-sdk");
export const savedChatVersion = 1;

export type LoadedChat = { turns: Turn[]; size: number | null; problem: string | null; canSave: boolean };
export type SaveChat = (turns: Turn[], size?: number | null) => Promise<string | null>;

export type ChatSetup = {
  chats: ChatMode;
  history: Turn[];
  earlierQuestions: number | null;
  save?: SaveChat;
  savedChats?: string;
  problem: string | null;
  failureHint: string | null;
  movedTo?: string;
  knownSize?: number;
  rememberSize?: (tokens: number) => Promise<void>;
};

export type Retired = { problem: string | null; movedTo: string | null };

export type ChatPlaces = { apiChatFile: string; sdkChatsFolder: string };

function blocksOf(turn: unknown, type: string): Record<string, unknown>[] {
  const content = (turn as { content?: unknown } | undefined)?.content;
  return Array.isArray(content) ? content.filter((block: { type?: unknown }) => block.type === type) : [];
}

function sameIds(asked: string[], answered: string[]): boolean {
  return asked.length === answered.length && asked.every((id) => answered.includes(id));
}

function isBlock(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { type?: unknown }).type === "string";
}

export function isSavedTurns(value: unknown): value is Turn[] {
  if (!Array.isArray(value) || value.length % 2 !== 0) return false;
  const shaped = value.every((turn: unknown, index) => {
    if (typeof turn !== "object" || turn === null || Array.isArray(turn)) return false;
    const { role, content } = turn as { role?: unknown; content?: unknown };
    if (role !== (index % 2 === 0 ? "user" : "assistant")) return false;
    return typeof content === "string" || (Array.isArray(content) && content.length > 0 && content.every(isBlock));
  });
  if (!shaped) return false;
  const paired = value.every((turn: unknown, index) => {
    if (index % 2 === 1) return true;
    const asked = blocksOf(value[index - 1], "tool_use").map((block) => String(block.id));
    const answered = blocksOf(turn, "tool_result").map((block) => String(block.tool_use_id));
    return sameIds(asked, answered);
  });
  return paired && blocksOf(value.at(-1), "tool_use").length === 0;
}

export function questionsIn(turns: Turn[]): number {
  return turns.filter((turn) => turn.role === "user" && typeof turn.content === "string").length;
}

export async function loadChat(file: string): Promise<LoadedChat> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { turns: [], size: null, problem: null, canSave: true };
    return { turns: [], size: null, problem: `The saved chat couldn't be read (${code ?? "unknown error"}), so this chat won't be saved, to leave that one alone`, canSave: false };
  }
  try {
    const saved: unknown = JSON.parse(text);
    const { v, turns, size } = (saved ?? {}) as { v?: unknown; turns?: unknown; size?: unknown };
    if (v === savedChatVersion && isSavedTurns(turns)) return { turns, size: Number.isSafeInteger(size) && (size as number) >= 0 ? (size as number) : null, problem: null, canSave: true };
  } catch {
    return setAside(file);
  }
  return setAside(file);
}

async function setAside(file: string): Promise<LoadedChat> {
  const aside = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    await rename(file, aside);
    return { turns: [], size: null, problem: `The saved chat isn't one Jarvis can read, so it was moved aside as ${basename(aside)}`, canSave: true };
  } catch {
    return { turns: [], size: null, problem: "The saved chat isn't one Jarvis can read and couldn't be moved aside, so this chat won't be saved, to leave that one alone", canSave: false };
  }
}

export function startChatSaver(file: string): SaveChat {
  let broken = false;
  return async (turns, size = null) => {
    if (broken) return null;
    const saving = `${file}.${randomUUID()}.saving`;
    try {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(saving, `${JSON.stringify({ v: savedChatVersion, turns, ...(size === null ? {} : { size }) })}\n`, { mode: 0o600 });
      await rename(saving, file);
      return null;
    } catch (error) {
      broken = true;
      await rm(saving, { force: true }).catch(() => {});
      return `Couldn't save the chat, so the rest of it won't be saved: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
}

export async function savedSdkChats(folder: string): Promise<number> {
  const entries = await readdir(join(folder, "projects"), { recursive: true }).catch(() => []);
  return entries.filter((entry) => entry.endsWith(".jsonl")).length;
}

function sizeFile(places: ChatPlaces): string {
  return `${places.sdkChatsFolder}-size.json`;
}

async function newestTranscript(folder: string): Promise<string | null> {
  const projects = join(folder, "projects");
  const entries = await readdir(projects, { recursive: true }).catch(() => []);
  let newest: { name: string; changed: number } | null = null;
  for (const name of entries.filter((entry) => entry.endsWith(".jsonl"))) {
    const changed = await stat(join(projects, name)).then((info) => info.mtimeMs, () => null);
    if (changed !== null && (newest === null || changed > newest.changed)) newest = { name, changed };
  }
  return newest?.name ?? null;
}

async function sdkKnownSize(places: ChatPlaces): Promise<number | null> {
  try {
    const saved: unknown = JSON.parse(await readFile(sizeFile(places), "utf8"));
    const { transcript, tokens } = (saved ?? {}) as { transcript?: unknown; tokens?: unknown };
    if (typeof transcript !== "string" || !Number.isSafeInteger(tokens) || (tokens as number) < 0) return null;
    return transcript === (await newestTranscript(places.sdkChatsFolder)) ? (tokens as number) : null;
  } catch {
    return null;
  }
}

function startSdkSizeSaver(places: ChatPlaces): (tokens: number) => Promise<void> {
  return async (tokens) => {
    const file = sizeFile(places);
    const saving = `${file}.${randomUUID()}.saving`;
    try {
      const transcript = await newestTranscript(places.sdkChatsFolder);
      if (transcript === null) return;
      await writeFile(saving, `${JSON.stringify({ transcript, tokens })}\n`, { mode: 0o600 });
      await rename(saving, file);
    } catch {
      await rm(saving, { force: true }).catch(() => {});
    }
  };
}

export const oldChatsKept = 10;
export const startOverHint = "This chat carries on a saved one. If every question fails, the saved chat may be why: type new to start a new one";

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function keepNewest(folder: string, prefix: string, keep: number): Promise<void> {
  const names = (await readdir(folder)).filter((name) => name.startsWith(prefix)).sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) await rm(join(folder, name), { recursive: true, force: true });
}

export async function retireChat(engine: Engine, places: ChatPlaces, keep = oldChatsKept): Promise<Retired> {
  const old = join(dirname(places.apiChatFile), "old");
  try {
    await mkdir(old, { recursive: true, mode: 0o700 });
    if (engine === "api") {
      const name = `plain-api-${stamp()}.json`;
      let movedTo: string | null = `old/${name}`;
      try {
        await rename(places.apiChatFile, join(old, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        movedTo = null;
      }
      await keepNewest(old, "plain-api-", keep);
      return { problem: null, movedTo };
    }
    const projects = join(places.sdkChatsFolder, "projects");
    const transcripts = (await readdir(projects, { recursive: true }).catch(() => [])).filter((name) => name.endsWith(".jsonl"));
    let movedTo: string | null = null;
    if (transcripts.length > 0) {
      const name = `agent-sdk-${stamp()}`;
      for (const transcript of transcripts) {
        await mkdir(dirname(join(old, name, transcript)), { recursive: true, mode: 0o700 });
        await rename(join(projects, transcript), join(old, name, transcript));
      }
      movedTo = `old/${name}`;
    }
    await keepNewest(old, "agent-sdk-", keep);
    return { problem: null, movedTo };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
    return { problem: `The old chat couldn't be moved aside (${code}), so this new chat won't be saved, to leave that one alone`, movedTo: null };
  }
}

export async function setUpNewChat(chats: ChatMode, engine: Engine, places: ChatPlaces = { apiChatFile, sdkChatsFolder }): Promise<ChatSetup> {
  if (chats === "fresh") return setUpChats("fresh", engine, places);
  let setAside: string | null = null;
  if (engine === "api") {
    const loaded = await loadChat(places.apiChatFile);
    if (!loaded.canSave) return { chats: "fresh", history: [], earlierQuestions: 0, problem: loaded.problem, failureHint: null };
    setAside = loaded.problem;
  }
  const retired = await retireChat(engine, places);
  if (retired.problem !== null) return { chats: "fresh", history: [], earlierQuestions: 0, problem: retired.problem, failureHint: null };
  const setup = await setUpChats("resume", engine, places);
  return { ...setup, problem: setup.problem ?? setAside, ...(retired.movedTo === null ? {} : { movedTo: retired.movedTo }) };
}

export async function setUpChats(chats: ChatMode, engine: Engine, places: ChatPlaces = { apiChatFile, sdkChatsFolder }): Promise<ChatSetup> {
  if (chats === "fresh") return { chats, history: [], earlierQuestions: 0, problem: null, failureHint: null };
  if (engine === "sdk") {
    try {
      await mkdir(places.sdkChatsFolder, { recursive: true, mode: 0o700 });
      await access(places.sdkChatsFolder, constants.W_OK);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
      return { chats: "fresh", history: [], earlierQuestions: 0, problem: `The saved chats folder can't be written to (${code}), so this chat won't be saved`, failureHint: null };
    }
    const saved = await savedSdkChats(places.sdkChatsFolder);
    const knownSize = await sdkKnownSize(places);
    return {
      chats,
      history: [],
      earlierQuestions: saved > 0 ? null : 0,
      savedChats: places.sdkChatsFolder,
      problem: null,
      failureHint: saved > 0 ? startOverHint : null,
      rememberSize: startSdkSizeSaver(places),
      ...(knownSize === null ? {} : { knownSize }),
    };
  }
  const loaded = await loadChat(places.apiChatFile);
  if (!loaded.canSave) return { chats: "fresh", history: [], earlierQuestions: 0, problem: loaded.problem, failureHint: null };
  return {
    chats,
    history: loaded.turns,
    earlierQuestions: questionsIn(loaded.turns),
    save: startChatSaver(places.apiChatFile),
    problem: loaded.problem,
    failureHint: loaded.turns.length > 0 ? startOverHint : null,
    ...(loaded.size === null ? {} : { knownSize: loaded.size }),
  };
}
