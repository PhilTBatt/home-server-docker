import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ToolDefinition } from "./direct.js";

export const maxReadBytes = 50 * 1024;
export const maxListEntries = 500;

export type ToolOutcome = { content: string; isError: boolean };

export type BrainTools = {
  definitions: ToolDefinition[];
  run(name: string, input: unknown): Promise<ToolOutcome>;
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
];

class Refusal extends Error {}

function ok(content: string): ToolOutcome {
  return { content, isError: false };
}

function refused(content: string): ToolOutcome {
  return { content, isError: true };
}

function pathOf(input: unknown): string | null {
  if (typeof input !== "object" || input === null || !("path" in input)) return null;
  return typeof input.path === "string" && input.path.trim() !== "" ? input.path.trim() : null;
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function inGit(root: string, path: string): boolean {
  return relative(root, path).split(sep).includes(".git");
}

function check(root: string, path: string) {
  if (!inside(root, path)) throw new Refusal("That's outside the brain, so it can't be read.");
  if (inGit(root, path)) throw new Refusal("The .git folder is off limits.");
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

function kilobytes(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KB`;
}

async function readFileTool(root: string, input: unknown): Promise<ToolOutcome> {
  const asked = pathOf(input);
  if (asked === null) return refused("Give the file's path, for example index.md.");
  const real = await locate(root, asked);
  const info = await stat(real);
  if (info.isDirectory()) return refused("That's a folder. Use list_folder to see what's in it.");
  if (!info.isFile()) return refused("That isn't a file.");
  const handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const buffer = Buffer.alloc(Math.min(info.size, maxReadBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    if (bytes.includes(0)) return refused("That isn't a text file.");
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
  if (!info.isDirectory()) return refused("That's a file. Use read_file to read it.");
  const entries = await readdir(real, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.name !== ".git")
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .sort();
  if (names.length === 0) return ok("(empty folder)");
  const shown = names.slice(0, maxListEntries).join("\n");
  return ok(names.length > maxListEntries ? `${shown}\n[${names.length - maxListEntries} more not shown]` : shown);
}

function failure(error: unknown): ToolOutcome {
  if (error instanceof Refusal) return refused(error.message);
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOTDIR") return refused("There's nothing at that path.");
  return refused("That couldn't be read.");
}

export function createBrainTools(root: string): BrainTools {
  return {
    definitions: brainToolDefinitions,
    async run(name, input) {
      try {
        if (name === "read_file") return await readFileTool(root, input);
        if (name === "list_folder") return await listFolderTool(root, input);
        return refused(`There's no tool called ${name}.`);
      } catch (error) {
        return failure(error);
      }
    },
  };
}