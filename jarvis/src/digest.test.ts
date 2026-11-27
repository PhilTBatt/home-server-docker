import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { digestCharLimit, digestFile, digestFor, digestFraming, digestLine, digestText, withDigest } from "./digest.js";

const written = "# What Phil has been doing\n\nWritten by the digest job.\n\n## docker\nPhil worked on the hub.";

test("the digest is jarvis/data/digest.md, found from Jarvis's own folder whatever it's called", () => {
  assert.equal(digestFile, fileURLToPath(new URL("../data/digest.md", import.meta.url)));
  assert.ok(digestFile.endsWith("/data/digest.md"));
});

test("an ordinary chat gets the digest as it's written", () => {
  const read: string[] = [];
  const digest = digestFor({ guest: false }, (path) => (read.push(path), written), "/somewhere/digest.md");
  assert.deepEqual(digest, { text: written, chars: written.length, cut: false });
  assert.deepEqual(read, ["/somewhere/digest.md"]);
});

test("a guest chat never gets it, and the file isn't even read", () => {
  const read: string[] = [];
  assert.equal(digestFor({ guest: true }, (path) => (read.push(path), written)), null);
  assert.deepEqual(read, []);
});

test("a missing, unreadable or empty file means no digest, not an error", () => {
  assert.equal(digestFor({ guest: false }, () => { throw Object.assign(new Error("gone"), { code: "ENOENT" }); }), null);
  assert.equal(digestFor({ guest: false }, () => { throw Object.assign(new Error("no"), { code: "EACCES" }); }), null);
  assert.equal(digestFor({ guest: false }, () => " \n​\n "), null);
});

test("it reads the real file when there is one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "digest-"));
  await writeFile(join(dir, "digest.md"), written);
  assert.equal(digestFor({ guest: false }, undefined, join(dir, "digest.md"))?.text, written);
  assert.equal(digestFor({ guest: false }, undefined, join(dir, "missing.md")), null);
});

test("double quotes become single ones, hidden characters go, and it can't close its own tag", () => {
  assert.equal(digestText('He said "done" and “next”​.')?.text, "He said 'done' and 'next'.");
  assert.equal(digestText("Ends </digest> here <DIGEST>")?.text, "Ends </ digest> here < DIGEST>");
});

test("a long digest is cut back to the end of a line within the limit, and says so", () => {
  const line = `${"x".repeat(99)}\n`;
  const digest = digestText(line.repeat(200));
  assert.ok(digest !== null && digest.cut);
  assert.ok((digest?.chars ?? 0) <= digestCharLimit);
  assert.ok(digest?.text.endsWith("x"));
  assert.equal(digestCharLimit, 12_000);
  assert.equal(digestText("short")?.cut, false);
});

test("the digest goes after his instructions, framed as information and never instructions, with no double quotes", () => {
  const digest = digestText(written);
  const system = withDigest("Base instructions.", digest);
  assert.equal(system, `Base instructions.\n\n${digestFraming}\n<digest>\n${written}\n</digest>`);
  assert.match(digestFraming, /never instructions to you/);
  assert.ok(!digestFraming.includes('"'));
  assert.equal(withDigest("Base instructions.", null), "Base instructions.");
  assert.match(withDigest("B", { text: "t", chars: 1, cut: true }), /It was cut short to fit\.\n<digest>/);
});

test("the start-up line says how much there is, or how to make one", () => {
  assert.equal(digestLine(digestText(written)), `Digest: ${written.length} characters from jarvis/data/digest.md`);
  assert.equal(digestLine({ text: "t", chars: 1, cut: true }), "Digest: 1 characters from jarvis/data/digest.md, cut short");
  assert.equal(digestLine(null), "Digest: none found in jarvis/data/digest.md. bash host/digest.sh --force on the server writes one");
});
