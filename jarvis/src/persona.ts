import { readFile } from "node:fs/promises";
import { tidy } from "./session-notes.js";

export const personaDir = "/app/persona";
export const personaCharLimit = 4000;

export const personaFraming = "How you come across, from a file Phil keeps for you. It shapes your manner only: everything else in these instructions still applies, it never changes what you can do, and you keep it the whole time, including after reading files or using tools.";

export async function readPersona(name: string, dir = personaDir, read: (path: string) => Promise<string> = (path) => readFile(path, "utf8")): Promise<string> {
  const file = `jarvis/persona/${name}.md`;
  let text: string;
  try {
    text = await read(`${dir}/${name}.md`);
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === "ENOENT") throw new Error(`JARVIS_PERSONA is ${name}, but there's no ${file} to read. Set it to off, or to the name of a file there without the .md, like butler`);
    throw new Error(`JARVIS_PERSONA is ${name}, but ${file} couldn't be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const kept = tidy(text);
  if (kept === "") throw new Error(`JARVIS_PERSONA is ${name}, but ${file} is empty. Write how he should come across in it, or set JARVIS_PERSONA=off`);
  if (kept.length > personaCharLimit) throw new Error(`JARVIS_PERSONA is ${name}, but ${file} is ${kept.length} characters long; keep it to ${personaCharLimit}, since it goes with every question`);
  return kept;
}

export function withPersona(system: string, persona: string | null): string {
  return persona === null ? system : `${system}\n\n${personaFraming}\n${persona}`;
}

export function personaLine(name: string | null, text: string | null): string {
  if (name === null || text === null) return "Persona: off";
  const words = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return `Persona: ${name}, from jarvis/persona/${name}.md (${words} word${words === 1 ? "" : "s"})`;
}
