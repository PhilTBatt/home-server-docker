import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { brainToolDefinitions, createBrainTools, maxListEntries, maxReadBytes } from "./brain-tools.js";

const base = mkdtempSync(join(tmpdir(), "brain-tools-"));
const root = join(base, "brain");
const outside = join(base, "outside");

mkdirSync(join(root, "areas", "empty"), { recursive: true });
mkdirSync(join(root, ".git"));
mkdirSync(join(root, "many"));
mkdirSync(outside);
writeFileSync(join(root, "index.md"), "# Index\nAll about Phil.");
writeFileSync(join(root, "areas", "jarvis.md"), "Jarvis notes.");
writeFileSync(join(root, ".hidden.md"), "A dot file.");
writeFileSync(join(root, ".git", "config"), "[core]");
writeFileSync(join(root, "empty.md"), "");
writeFileSync(join(root, "binary.bin"), Buffer.from([0x50, 0x00, 0x51]));
writeFileSync(join(root, "big.md"), "a".repeat(60 * 1024));
writeFileSync(join(root, "exact.md"), "b".repeat(maxReadBytes));
writeFileSync(join(outside, "secret.txt"), "outside the brain");
symlinkSync(join(outside, "secret.txt"), join(root, "link-out.md"));
symlinkSync(outside, join(root, "folder-out"));
symlinkSync(join(root, "areas", "jarvis.md"), join(root, "link-in.md"));
symlinkSync(join(root, ".git", "config"), join(root, "git-file.md"));
symlinkSync(join(root, ".git"), join(root, "git-folder"));
symlinkSync("..", join(root, "areas", "up"));
symlinkSync("..", join(root, "parent"));
symlinkSync(root, join(base, "brain-link"));
execFileSync("mkfifo", [join(root, "pipe")]);
writeFileSync(join(root, "slightly-big.md"), "c".repeat(maxReadBytes + 400));
writeFileSync(join(root, "accents.md"), "a" + "é".repeat(maxReadBytes));
for (let i = 0; i < maxListEntries + 5; i++) writeFileSync(join(root, "many", `note-${String(i).padStart(3, "0")}.md`), "x");

after(() => {
  rmSync(base, { recursive: true, force: true });
});

const tools = createBrainTools(root);
const read = (path: unknown) => tools.run("read_file", { path });
const list = (path?: unknown) => tools.run("list_folder", path === undefined ? {} : { path });
const outsideMessage = { content: "That's outside the brain, so it can't be read.", isError: true };

test("there are two tools, each needing a path, both described as Phil's notes", () => {
  assert.deepEqual(
    brainToolDefinitions.map((tool) => tool.name),
    ["read_file", "list_folder"],
  );
  for (const tool of brainToolDefinitions) {
    assert.deepEqual(tool.input_schema.required, ["path"]);
    assert.match(tool.description, /Phil's notes/);
  }
  assert.equal(tools.definitions, brainToolDefinitions);
});

test("reads a file at the top and one in a folder", async () => {
  assert.deepEqual(await read("index.md"), { content: "# Index\nAll about Phil.", isError: false });
  assert.deepEqual(await read("areas/jarvis.md"), { content: "Jarvis notes.", isError: false });
});

test("the same file can be named in other harmless ways", async () => {
  for (const path of ["./index.md", "areas/../index.md", join(root, "index.md"), " index.md "]) {
    assert.deepEqual(await read(path), { content: "# Index\nAll about Phil.", isError: false }, path);
  }
});

test("dot files other than .git can be read", async () => {
  assert.deepEqual(await read(".hidden.md"), { content: "A dot file.", isError: false });
});

test("anything outside the brain is refused, however it's written", async () => {
  for (const path of ["../outside/secret.txt", join(outside, "secret.txt"), "areas/../../outside/secret.txt", "/etc/passwd", ".."]) {
    assert.deepEqual(await read(path), outsideMessage, path);
  }
});

test("a path outside that doesn't exist gets the same refusal, so nothing outside can be probed", async () => {
  assert.deepEqual(await read("../no-such-file.txt"), outsideMessage);
  assert.deepEqual(await read("/no/such/place"), outsideMessage);
});

test("a symlink inside the brain that points outside is refused", async () => {
  assert.deepEqual(await read("link-out.md"), outsideMessage);
  assert.deepEqual(await read("folder-out/secret.txt"), outsideMessage);
  assert.deepEqual(await list("folder-out"), outsideMessage);
});

test("a symlink that stays inside the brain works", async () => {
  assert.deepEqual(await read("link-in.md"), { content: "Jarvis notes.", isError: false });
});

test("the .git folder is off limits, however it's reached", async () => {
  const offLimits = { content: "The .git folder is off limits.", isError: true };
  for (const path of [".git/config", "areas/../.git/config", join(root, ".git", "config"), "git-file.md", "git-folder/config", "git-folder/missing", "git-folder/deeper/missing"]) {
    assert.deepEqual(await read(path), offLimits, path);
  }
  assert.deepEqual(await list(".git"), offLimits);
  assert.deepEqual(await list("git-folder"), offLimits);
});

test("through a symlink that leads outside, missing files get the same refusal as real ones", async () => {
  for (const path of ["folder-out/nope.txt", "folder-out/deeper/nope.txt", "parent/outside/nope.txt", "parent/nope", "areas/up/parent/nope"]) {
    assert.deepEqual(await read(path), outsideMessage, path);
  }
});

test("a symlink to a parent inside the brain is fine", async () => {
  assert.deepEqual(await read("areas/up/index.md"), { content: "# Index\nAll about Phil.", isError: false });
  assert.deepEqual(await read("areas/up/nope.md"), { content: "There's nothing at that path.", isError: true });
});

test("a pipe or other special file is refused without hanging", async () => {
  assert.deepEqual(await read("pipe"), { content: "That isn't a file.", isError: true });
});

test("a brain folder reached through a symlink works, and still keeps everything outside out", async () => {
  const linked = createBrainTools(join(base, "brain-link"));
  assert.deepEqual(await linked.run("read_file", { path: "index.md" }), { content: "# Index\nAll about Phil.", isError: false });
  assert.deepEqual(await linked.run("read_file", { path: "areas/jarvis.md" }), { content: "Jarvis notes.", isError: false });
  assert.deepEqual(await linked.run("read_file", { path: "link-out.md" }), outsideMessage);
  assert.deepEqual(await linked.run("read_file", { path: "../outside/secret.txt" }), outsideMessage);
});

test("refusal messages never show where the brain or anything outside really is", async () => {
  for (const path of ["../outside/secret.txt", "link-out.md", ".git/config", "nope.md"]) {
    const outcome = await read(path);
    assert.ok(!outcome.content.includes(base), path);
  }
});

test("a missing file says there's nothing there", async () => {
  assert.deepEqual(await read("nope.md"), { content: "There's nothing at that path.", isError: true });
  assert.deepEqual(await read("index.md/inside"), { content: "There's nothing at that path.", isError: true });
});

test("a folder isn't read as a file, and a file isn't listed as a folder", async () => {
  assert.deepEqual(await read("areas"), { content: "That's a folder. Use list_folder to see what's in it.", isError: true });
  assert.deepEqual(await list("index.md"), { content: "That's a file. Use read_file to read it.", isError: true });
});

test("a file that isn't text is refused", async () => {
  assert.deepEqual(await read("binary.bin"), { content: "That isn't a text file.", isError: true });
});

test("a file over 50 KB is cut, with a note saying so", async () => {
  const outcome = await read("big.md");
  assert.equal(outcome.isError, false);
  assert.equal(outcome.content, `${"a".repeat(maxReadBytes)}\n[cut at 50 KB of 60 KB]`);
});

test("the size in the cut note rounds up, so a file just over 50 KB doesn't say \"of 50 KB\"", async () => {
  assert.ok((await read("slightly-big.md")).content.endsWith("\n[cut at 50 KB of 51 KB]"));
});

test("a cut through the middle of an accented letter leaves no broken character", async () => {
  const content = (await read("accents.md")).content;
  assert.ok(!content.includes("\uFFFD"));
  assert.ok(content.endsWith("é\n[cut at 50 KB of 101 KB]"));
});

test("a file of exactly 50 KB isn't cut", async () => {
  assert.deepEqual(await read("exact.md"), { content: "b".repeat(maxReadBytes), isError: false });
  assert.equal(maxReadBytes, 50 * 1024);
});

test("an empty file says so", async () => {
  assert.deepEqual(await read("empty.md"), { content: "(empty file)", isError: false });
});

test("read_file needs a path", async () => {
  const needsPath = { content: "Give the file's path, for example index.md.", isError: true };
  for (const input of [{}, { path: "" }, { path: "  " }, { path: 42 }, null, "index.md"]) {
    assert.deepEqual(await tools.run("read_file", input), needsPath, JSON.stringify(input));
  }
});

test("lists the top folder, sorted, with folders marked and .git left out", async () => {
  const outcome = await list(".");
  assert.equal(outcome.isError, false);
  assert.deepEqual(outcome.content.split("\n"), [
    ".hidden.md",
    "accents.md",
    "areas/",
    "big.md",
    "binary.bin",
    "empty.md",
    "exact.md",
    "folder-out",
    "git-file.md",
    "git-folder",
    "index.md",
    "link-in.md",
    "link-out.md",
    "many/",
    "parent",
    "pipe",
    "slightly-big.md",
  ]);
});

test("listing with no path, or a blank one, lists the top folder", async () => {
  const top = await list(".");
  assert.deepEqual(await list(), top);
  assert.deepEqual(await list(" "), top);
});

test("lists a folder inside the brain", async () => {
  assert.deepEqual(await list("areas"), { content: "empty/\njarvis.md\nup", isError: false });
});

test("an empty folder says so", async () => {
  assert.deepEqual(await list("areas/empty"), { content: "(empty folder)", isError: false });
});

test("a very full folder shows the first 500 names and says how many more there are", async () => {
  const lines = (await list("many")).content.split("\n");
  assert.equal(lines.length, maxListEntries + 1);
  assert.equal(lines[0], "note-000.md");
  assert.equal(lines[maxListEntries - 1], "note-499.md");
  assert.equal(lines[maxListEntries], "[5 more not shown]");
});

test("listing outside the brain is refused", async () => {
  assert.deepEqual(await list(".."), outsideMessage);
  assert.deepEqual(await list(outside), outsideMessage);
});

test("an unknown tool is refused by name", async () => {
  assert.deepEqual(await tools.run("delete_file", { path: "index.md" }), { content: "There's no tool called delete_file.", isError: true });
});

test("a brain folder that doesn't exist gives an error result, not a crash", async () => {
  const missing = createBrainTools(join(base, "no-brain"));
  assert.deepEqual(await missing.run("read_file", { path: "index.md" }), { content: "There's nothing at that path.", isError: true });
});