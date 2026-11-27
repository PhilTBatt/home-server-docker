import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ToolDefinition } from "./direct.js";

export const maxReadBytes = 50 * 1024;
export const maxListEntries = 500;
export const maxSearchResults = 50;
export const maxSearchFiles = 2000;
export const maxSearchText = 200;
export const maxLineChars = 200;

export type ToolOutcome = { content: string; isError: boolean; refused?: true };

export type BrainTools = {
  definitions: ToolDefinition[];
  run(name: string, input: unknown): Promise<ToolOutcome>;
  needsYes?(name: string): boolean;
};

export const brainToolDefinitions: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a text file from Phil's notes, which he calls his brain. Give the path from the brain's top folder, for example index.md or areas/jarvis.md. Files over 50 KB are cut short, with a note saying so.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "The file's path from the brain's top folder." } },
      required: ["path"],
    },
  },
  {
    name: "list_folder",
    description: "List what's in a folder of Phil's notes. Folders end with /. Use . for the top folder.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "The folder's path from the brain's top folder, or . for the top folder." } },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search inside Phil's notes for some words, ignoring capitals. Gives each matching line with its file's path and line number, up to 50 lines. Only the first 50 KB of each file is searched. Use path to search one folder only.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The words to look for, exactly as they'd appear in the notes." },
        path: { type: "string", description: "Optional: a folder's path from the brain's top folder, to search only there." },
      },
      required: ["text"],
    },
  },
  {
    name: "find_files",
    description: "Find files in Phil's notes whose path contains some text, ignoring capitals, looking in every folder. Gives up to 100 paths. Use path to look in one folder only.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Text the file's path should contain, for example jarvis or .md." },
        path: { type: "string", description: "Optional: a folder's path from the brain's top folder, to look only there." },
      },
      required: ["name"],
    },
  },
];

export const maxFoundFiles = 100;

class Refusal extends Error {}

function ok(content: string): ToolOutcome {
  return { content, isError: false };
}

function toolError(content: string): ToolOutcome {
  return { content, isError: true };
}

function textField(input: unknown, field: string): string | null {
  if (typeof input !== "object" || input === null || !(field in input)) return null;
  const value = (input as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function pathOf(input: unknown): string | null {
  return textField(input, "path");
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function inGit(root: string, path: string): boolean {
  return relative(root, path).split(sep).includes(".git");
}

export const outsideRefusal = "That's outside the brain, so it can't be read.";
export const gitRefusal = "The .git folder is off limits.";

function check(root: string, path: string) {
  if (!inside(root, path)) throw new Refusal(outsideRefusal);
  if (inGit(root, path)) throw new Refusal(gitRefusal);
}

async function refuseIfNearestIsOutside(top: string, path: string) {
  const realTop = await realpath(top).catch(() => null);
  if (realTop === null) return;
  for (let current = dirname(path); ; current = dirname(current)) {
    const real = await realpath(current).catch(() => null);
    if (real !== null) {
      check(realTop, real);
      return;
    }
    if (dirname(current) === current) return;
  }
}

async function locate(root: string, asked: string): Promise<string> {
  const top = resolve(root);
  const wanted = resolve(top, asked);
  check(top, wanted);
  const real = await realpath(wanted).catch(async (error: unknown) => {
    await refuseIfNearestIsOutside(top, wanted);
    throw error;
  });
  check(await realpath(top), real);
  return real;
}

export function safeName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function kilobytes(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KB`;
}

async function readFileTool(root: string, input: unknown): Promise<ToolOutcome> {
  const asked = pathOf(input);
  if (asked === null) return toolError("Give the file's path, for example index.md.");
  const real = await locate(root, asked);
  const info = await stat(real);
  if (info.isDirectory()) return toolError("That's a folder. Use list_folder to see what's in it.");
  if (!info.isFile()) return toolError("That isn't a file.");
  const handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const buffer = Buffer.alloc(Math.min(info.size, maxReadBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    if (bytes.includes(0)) return toolError("That isn't a text file.");
    if (info.size > maxReadBytes) {
      const start = new TextDecoder().decode(bytes, { stream: true });
      return ok(`${start}\n[cut at ${kilobytes(maxReadBytes)} of ${kilobytes(info.size)}]`);
    }
    const text = new TextDecoder().decode(bytes);
    return ok(text === "" ? "(empty file)" : text);
  } finally {
    await handle.close();
  }
}

async function listFolderTool(root: string, input: unknown): Promise<ToolOutcome> {
  const real = await locate(root, pathOf(input) ?? ".");
  const info = await stat(real);
  if (!info.isDirectory()) return toolError("That's a file. Use read_file to read it.");
  const entries = await readdir(real, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.name !== ".git")
    .map((entry) => (entry.isDirectory() ? `${safeName(entry.name)}/` : safeName(entry.name)))
    .sort();
  if (names.length === 0) return ok("(empty folder)");
  const shown = names.slice(0, maxListEntries).join("\n");
  return ok(names.length > maxListEntries ? `${shown}\n[${names.length - maxListEntries} more not shown]` : shown);
}

type Walked = { files: string[]; stopped: boolean; unreadable: number };

async function entriesOf(folder: string) {
  try {
    return (await readdir(folder, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch {
    return null;
  }
}

async function filesUnder(folder: string): Promise<Walked> {
  const files: string[] = [];
  const waiting = [folder];
  let unreadable = 0;
  while (waiting.length > 0) {
    const current = waiting.shift() as string;
    const entries = await entriesOf(current);
    if (entries === null) {
      unreadable++;
      continue;
    }
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      if (entry.isDirectory()) waiting.push(join(current, entry.name));
      else if (entry.isFile()) {
        if (files.length === maxSearchFiles) return { files, stopped: true, unreadable };
        files.push(join(current, entry.name));
      }
    }
  }
  return { files, stopped: false, unreadable };
}

function walkNotes(walked: Walked): string {
  const notes: string[] = [];
  if (walked.unreadable > 0) notes.push(`[${walked.unreadable} ${walked.unreadable === 1 ? "folder" : "folders"} couldn't be read]`);
  if (walked.stopped) notes.push(`[stopped after ${maxSearchFiles} files]`);
  return notes.map((note) => `\n${note}`).join("");
}

async function searchStart(root: string, input: unknown): Promise<{ top: string; folder: string } | ToolOutcome> {
  const folder = await locate(root, pathOf(input) ?? ".");
  const info = await stat(folder);
  if (!info.isDirectory()) return toolError("That's a file, not a folder. Use read_file to read it.");
  return { top: await realpath(resolve(root)), folder };
}

async function textStart(path: string): Promise<string | null> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => null);
  if (handle === null) return null;
  try {
    const buffer = Buffer.alloc(maxReadBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxReadBytes, 0);
    const bytes = buffer.subarray(0, bytesRead);
    return bytes.includes(0) ? null : new TextDecoder().decode(bytes, { stream: true });
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

function shortLine(line: string): string {
  const characters = Array.from(line.trim());
  return characters.length > maxLineChars ? `${characters.slice(0, maxLineChars).join("")}…` : characters.join("");
}

async function searchFilesTool(root: string, input: unknown): Promise<ToolOutcome> {
  const text = textField(input, "text");
  if (text === null) return toolError("Give the words to search for.");
  if (text.length > maxSearchText) return toolError(`Search for ${maxSearchText} characters or fewer.`);
  const start = await searchStart(root, input);
  if ("isError" in start) return start;
  const wanted = text.toLowerCase();
  const walked = await filesUnder(start.folder);
  const found: string[] = [];
  for (const file of walked.files) {
    const content = await textStart(file);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].toLowerCase().includes(wanted)) continue;
      if (found.length === maxSearchResults) return ok(`${found.join("\n")}\n[more matches not shown]`);
      found.push(`${safeName(relative(start.top, file))}:${index + 1}: ${shortLine(lines[index])}`);
    }
  }
  const note = walkNotes(walked);
  return ok(found.length === 0 ? `No matches.${note}` : `${found.join("\n")}${note}`);
}

async function findFilesTool(root: string, input: unknown): Promise<ToolOutcome> {
  const name = textField(input, "name");
  if (name === null) return toolError("Give some text the file's path should contain.");
  if (name.length > maxSearchText) return toolError(`Look for ${maxSearchText} characters or fewer.`);
  const start = await searchStart(root, input);
  if ("isError" in start) return start;
  const wanted = name.toLowerCase();
  const walked = await filesUnder(start.folder);
  const paths = walked.files.map((file) => relative(start.top, file)).filter((path) => path.toLowerCase().includes(wanted)).map(safeName);
  const note = walkNotes(walked);
  if (paths.length === 0) return ok(`No files match.${note}`);
  const shown = paths.slice(0, maxFoundFiles).join("\n");
  return ok(paths.length > maxFoundFiles ? `${shown}\n[${paths.length - maxFoundFiles} more not shown]${note}` : `${shown}${note}`);
}

function failure(error: unknown): ToolOutcome {
  if (error instanceof Refusal) return { content: error.message, isError: true, refused: true };
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOTDIR") return toolError("There's nothing at that path.");
  return toolError("That couldn't be read.");
}

export function createBrainTools(root: string): BrainTools {
  return {
    definitions: brainToolDefinitions,
    async run(name, input) {
      try {
        if (name === "read_file") return await readFileTool(root, input);
        if (name === "list_folder") return await listFolderTool(root, input);
        if (name === "search_files") return await searchFilesTool(root, input);
        if (name === "find_files") return await findFilesTool(root, input);
        return toolError(`There's no tool called ${name}.`);
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export const noBrainTools: BrainTools = { definitions: [], run: async () => ({ content: "There are no tools in guest mode.", isError: true }), needsYes: () => false };
