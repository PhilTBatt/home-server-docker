import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";
import { londonTime } from "../notify/daily.js";

const inboxDir = "/memory/inbox";
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

type Note = {
  title: string;
  text: string;
};

const noteSchema = {
  body: {
    type: "object",
    required: ["title", "text"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 80 },
      text: { type: "string", maxLength: 20_000, pattern: "\\S" },
    },
  },
};

export async function countWaiting(dir = inboxDir): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => {
    throw new Error("Couldn't read the brain inbox");
  });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md").length;
}

export function slugFor(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug === "" ? "note" : slug;
}

export async function saveNote(dir: string, note: Note, now: Date): Promise<string> {
  const base = `${londonTime(now).day}-${slugFor(note.title)}`;
  for (let n = 1; n <= 50; n++) {
    const name = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    try {
      await writeFile(join(dir, name), note.text, { flag: "wx" });
      return name;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("Couldn't save the note");
    }
  }
  throw new Error("Couldn't find a free name for the note");
}

export const memory: FastifyPluginAsync<Pick<Config, "features"> & { inboxDir?: string; now?: () => Date }> = async (app, options) => {
  const dir = options.inboxDir ?? inboxDir;
  const now = options.now ?? (() => new Date());

  app.get("/inbox", async (_request, reply) => {
    if (!options.features.memoryInbox) return reply.code(404).send({ error: "The brain inbox is switched off" });
    return { waiting: await countWaiting(dir) };
  });

  app.post<{ Body: Note }>("/inbox", { schema: noteSchema, bodyLimit: 128 * 1024 }, async (request, reply) => {
    if (!options.features.memoryUpload) return reply.code(404).send({ error: "Note uploads are switched off" });
    if (controlCharacters.test(request.body.title) || controlCharacters.test(request.body.text)) {
      return reply.code(400).send({ error: "Notes must be plain text" });
    }
    const saved = await saveNote(dir, request.body, now());
    if (!options.features.memoryInbox) return reply.code(201).send({ saved });
    return reply.code(201).send({ saved, waiting: await countWaiting(dir) });
  });
};