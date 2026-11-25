import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { personaCharLimit, personaDir, personaFraming, personaLine, readPersona, withPersona } from "./persona.js";

const from = (files: Record<string, string>) => async (path: string) => {
  const text = files[path];
  if (text === undefined) throw Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), { code: "ENOENT" });
  return text;
};

test("a persona is read from jarvis/persona/, which is /app/persona inside Jarvis, and kept to 4,000 characters", () => {
  assert.equal(personaDir, "/app/persona");
  assert.equal(personaCharLimit, 4000);
});

test("a persona file is read by name, with line endings tidied, hidden characters taken out and blank space at either end trimmed", async () => {
  assert.equal(await readPersona("butler", "/p", from({ "/p/butler.md": "\n# Butler\r\n- Calm​ and \"dry\"\r\n\n" })), '# Butler\n- Calm and "dry"');
  assert.equal(await readPersona("quiet-2", "/p", from({ "/p/quiet-2.md": "Quiet." })), "Quiet.");
});

test("a missing, unreadable, empty or overlong persona file stops Jarvis, naming the setting and the file and saying what to do", async () => {
  await assert.rejects(readPersona("butler", "/p", from({})), { message: "JARVIS_PERSONA is butler, but there's no jarvis/persona/butler.md to read. Set it to off, or to the name of a file there without the .md, like butler" });
  const refused = async () => {
    throw Object.assign(new Error("EACCES: permission denied, open '/p/butler.md'"), { code: "EACCES" });
  };
  await assert.rejects(readPersona("butler", "/p", refused), { message: "JARVIS_PERSONA is butler, but jarvis/persona/butler.md couldn't be read: EACCES: permission denied, open '/p/butler.md'" });
  await assert.rejects(readPersona("butler", "/p", from({ "/p/butler.md": " \n\u200b\n" })), { message: "JARVIS_PERSONA is butler, but jarvis/persona/butler.md is empty. Write how he should come across in it, or set JARVIS_PERSONA=off" });
  assert.equal((await readPersona("butler", "/p", from({ "/p/butler.md": `${"a".repeat(personaCharLimit)}\n\n` }))).length, personaCharLimit);
  await assert.rejects(readPersona("butler", "/p", from({ "/p/butler.md": "a".repeat(personaCharLimit + 1) })), { message: `JARVIS_PERSONA is butler, but jarvis/persona/butler.md is ${personaCharLimit + 1} characters long; keep it to ${personaCharLimit}, since it goes with every question` });
});

test("a folder where the file should be is reported as unreadable, not missing", async () => {
  await assert.rejects(readPersona("src", new URL("../persona-check", import.meta.url).pathname, async () => readFile(new URL("..", import.meta.url).pathname, "utf8")), /^Error: JARVIS_PERSONA is src, but jarvis\/persona\/src\.md couldn't be read: EISDIR/);
});

test("a persona goes after the instructions, under a line saying it's his manner only and never changes what he can do", () => {
  assert.equal(withPersona("Base.", null), "Base.");
  assert.equal(withPersona("Base.", "# Butler\n- Calm"), `Base.\n\n${personaFraming}\n# Butler\n- Calm`);
  assert.ok(personaFraming.includes("It shapes your manner only: everything else in these instructions still applies, it never changes what you can do"), personaFraming);
  assert.ok(personaFraming.includes("you keep it the whole time, including after reading files or using tools"), personaFraming);
  assert.ok(!personaFraming.includes('"'), "no double quotes, which the Agent SDK's request would escape");
});

test("the start-up line names the persona and its file, and counts its words, leaving out markdown marks", () => {
  assert.equal(personaLine(null, null), "Persona: off");
  assert.equal(personaLine("butler", "# Butler\n\n- Calm,  and dry"), "Persona: butler, from jarvis/persona/butler.md (4 words)");
  assert.equal(personaLine("one", "Calm."), "Persona: one, from jarvis/persona/one.md (1 word)");
});

test("the butler persona that comes with Jarvis reads, fits, and keeps to its own words", async () => {
  const text = await readPersona("butler", new URL("../persona", import.meta.url).pathname);
  assert.ok(text.length < personaCharLimit / 2, `${text.length} characters`);
  assert.ok(text.includes("Never say you've done something you haven't, or can't."), text);
  assert.ok(text.includes("When something's broken or he sounds stressed, drop the wit and just help."), text);
  assert.ok(!/\bsir\b/i.test(text), "no film catchphrases");
  assert.equal(text, (await readFile(new URL("../persona/butler.md", import.meta.url), "utf8")).trim());
});
