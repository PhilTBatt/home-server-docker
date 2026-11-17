import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatMode, Engine } from "./config.js";
import type { Turn } from "./direct.js";

export const chatsFolder = fileURLToPath(new URL("../data/chats/", import.meta.url));
export const apiChatFile = join(chatsFolder, "plain-api.json");
export const sdkChatsFolder = join(chatsFolder, "agent-sdk");
export const savedChatVersion = 1;

export type LoadedChat = { turns: Turn[]; problem: string | null; canSave: boolean };
export type SaveChat = (turns: Turn[]) => Promise<string | null>;

export type ChatSetup = {
  chats: ChatMode;
  history: Turn[];
  earlierQuestions: number | null;
  save?: SaveChat;
  savedChats?: string;
  problem: string | null;
  failureHint: string | null;
};

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
    if (code === "ENOENT") return { turns: [], problem: null, canSave: true };
    return { turns: [], problem: `The saved chat couldn't be read (${code ?? "unknown error"}), so this chat won't be saved, to leave that one alone`, canSave: false };
  }
  try {
    const saved: unknown = JSON.parse(text);
    const { v, turns } = (saved ?? {}) as { v?: unknown; turns?: unknown };
    if (v === savedChatVersion && isSavedTurns(turns)) return { turns, problem: null, canSave: true };
  } catch {
    return setAside(file);
  }
  return setAside(file);
}

async function setAside(file: string): Promise<LoadedChat> {
  const aside = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    await rename(file, aside);
    return { turns: [], problem: `The saved chat isn't one Jarvis can read, so it was moved aside as ${basename(aside)}`, canSave: true };
  } catch {
    return { turns: [], problem: "The saved chat isn't one Jarvis can read and couldn't be moved aside, so this chat won't be saved, to leave that one alone", canSave: false };
  }
}

export function startChatSaver(file: string): SaveChat {
  let broken = false;
  return async (turns) => {
    if (broken) return null;
    const saving = `${file}.${randomUUID()}.saving`;
    try {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(saving, `${JSON.stringify({ v: savedChatVersion, turns })}\n`, { mode: 0o600 });
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

function startOverHint(place: string): string {
  return `This chat carries on a saved one. If every question fails, the saved chat may be why: delete jarvis/data/chats/${basename(place)} to start a new one`;
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
    return { chats, history: [], earlierQuestions: saved > 0 ? null : 0, savedChats: places.sdkChatsFolder, problem: null, failureHint: saved > 0 ? startOverHint(places.sdkChatsFolder) : null };
  }
  const loaded = await loadChat(places.apiChatFile);
  if (!loaded.canSave) return { chats: "fresh", history: [], earlierQuestions: 0, problem: loaded.problem, failureHint: null };
  return {
    chats,
    history: loaded.turns,
    earlierQuestions: questionsIn(loaded.turns),
    save: startChatSaver(places.apiChatFile),
    problem: loaded.problem,
    failureHint: loaded.turns.length > 0 ? startOverHint(places.apiChatFile) : null,
  };
}
