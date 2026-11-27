import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { systemFor } from "./chat.js";
import { introCharLimit, introFile, introFraming, introLine, readIntro, withIntro } from "./intro.js";

const shipped = fileURLToPath(new URL("../intro.md", import.meta.url));

test("the intro is read from jarvis/intro.md in the container, tidied, and refused when missing, unreadable, empty or too long", async () => {
  assert.equal(introFile, "/app/intro.md");
  const asked: string[] = [];
  assert.equal(await readIntro("/x/intro.md", async (path) => (asked.push(path), "\n# Jarvis\n\nI'm Jarvis.\n\nPhil built me.\n\n")), "# Jarvis\n\nI'm Jarvis.\n\nPhil built me.");
  assert.deepEqual(asked, ["/x/intro.md"]);
  const missing = Object.assign(new Error("no such file"), { code: "ENOENT" });
  await assert.rejects(readIntro("/x", async () => Promise.reject(missing)), { message: "JARVIS_INTRO is on, but there's no jarvis/intro.md to read. Write one, or set JARVIS_INTRO=off" });
  await assert.rejects(readIntro("/x", async () => Promise.reject(new Error("permission denied"))), { message: "JARVIS_INTRO is on, but jarvis/intro.md couldn't be read: permission denied" });
  await assert.rejects(readIntro("/x", async () => " \n \n"), { message: "JARVIS_INTRO is on, but jarvis/intro.md is empty. Write a few sentences about him in it, or set JARVIS_INTRO=off" });
  assert.equal((await readIntro("/x", async () => "a".repeat(introCharLimit))).length, introCharLimit);
  await assert.rejects(readIntro("/x", async () => "a".repeat(introCharLimit + 1)), { message: `JARVIS_INTRO is on, but jarvis/intro.md is ${introCharLimit + 1} characters long; keep it to ${introCharLimit}, since it goes with every question` });
});

test("the intro goes after the persona and before the live facts, under a line saying when to use it, and nothing is added without one", () => {
  assert.equal(withIntro("Base.", null), "Base.");
  assert.equal(withIntro("Base.", "I'm Jarvis."), `Base.\n\n${introFraming}\nI'm Jarvis.`);
  const system = systemFor("Base.", { persona: "Calm.", intro: "I'm Jarvis.", facts: "A fact.", spoken: false, notes: [], clock: false });
  const persona = system.indexOf("Calm.");
  const intro = system.indexOf("I'm Jarvis.");
  const facts = system.indexOf("A fact.");
  assert.ok(persona > 0 && intro > persona && facts > intro, system);
  assert.equal(systemFor("Base.", { persona: null, facts: null, spoken: false, notes: [], clock: false }), "Base.");
  assert.equal(systemFor("Base.", { persona: null, intro: null, facts: null, spoken: false, notes: [], clock: false }), "Base.");
});

test("the line saying when to use the intro keeps him to its facts, never recites it unasked, lets the rest of his instructions win, and has no double quotes", () => {
  for (const part of ["who or what you are", "introduce yourself", "in your own words", "never add abilities", "Don't recite it unasked", "the rest of these instructions win"]) assert.ok(introFraming.includes(part), part);
  assert.ok(!introFraming.includes('"'));
});

test("the start-up line says the intro is on with its word count, or off", () => {
  assert.equal(introLine(null), "Intro: off");
  assert.equal(introLine("# Jarvis\n\nI'm Jarvis, built at home."), "Intro: on, from jarvis/intro.md (6 words)");
  assert.equal(introLine("One"), "Intro: on, from jarvis/intro.md (1 word)");
});

test("the intro that comes with the repo fits, has no double quotes, and names nothing private", async () => {
  const text = await readIntro(shipped);
  assert.ok(text.length > 200 && text.length <= introCharLimit, String(text.length));
  assert.ok(!text.includes('"'));
  for (const word of ["Leeds", "York", "192.168", "100.64", "@"]) assert.ok(!text.includes(word), word);
});
