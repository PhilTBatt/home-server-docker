import { readFile } from "node:fs/promises";
import { tidy } from "./session-notes.js";

export const introFile = "/app/intro.md";
export const introCharLimit = 2000;

export const introFraming = "An introduction to yourself, from a file Phil keeps for you. When someone asks who or what you are, what you can do or who made you, or asks you to introduce yourself, answer from it in your own words, as briefly as the question needs, and keep to its facts: never add abilities it doesn't give you. Don't recite it unasked, and if it disagrees with anything else in these instructions, the rest of these instructions win.";

export async function readIntro(path = introFile, read: (path: string) => Promise<string> = (at) => readFile(at, "utf8")): Promise<string> {
  let text: string;
  try {
    text = await read(path);
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === "ENOENT") throw new Error("JARVIS_INTRO is on, but there's no jarvis/intro.md to read. Write one, or set JARVIS_INTRO=off");
    throw new Error(`JARVIS_INTRO is on, but jarvis/intro.md couldn't be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const kept = tidy(text);
  if (kept === "") throw new Error("JARVIS_INTRO is on, but jarvis/intro.md is empty. Write a few sentences about him in it, or set JARVIS_INTRO=off");
  if (kept.length > introCharLimit) throw new Error(`JARVIS_INTRO is on, but jarvis/intro.md is ${kept.length} characters long; keep it to ${introCharLimit}, since it goes with every question`);
  return kept;
}

export function withIntro(system: string, intro: string | null): string {
  return intro === null ? system : `${system}\n\n${introFraming}\n${intro}`;
}

export function introLine(intro: string | null): string {
  if (intro === null) return "Intro: off";
  const words = intro.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return `Intro: on, from jarvis/intro.md (${words} word${words === 1 ? "" : "s"})`;
}
