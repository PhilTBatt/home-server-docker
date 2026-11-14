import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { parseLastRun, readBackupState } from "./backup.js";

const dirs: string[] = [];

async function statusDir(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "backup-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(dir, name), text);
  }
  return dir;
}

after(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

test("parseLastRun returns nothing for an empty file", () => {
  assert.equal(parseLastRun(""), null);
  assert.equal(parseLastRun("\n"), null);
});

test("parseLastRun reads a good run as no problem", () => {
  assert.deepEqual(parseLastRun("2026-11-15T03:31:12Z ok\n"), { time: "2026-11-15T03:31:12Z", problem: null });
});

test("parseLastRun keeps the whole reason for a failed run", () => {
  assert.deepEqual(parseLastRun("2026-11-15T03:31:12Z couldn't open the backup repository\n"), {
    time: "2026-11-15T03:31:12Z",
    problem: "couldn't open the backup repository",
  });
});

test("parseLastRun doesn't treat a line with no result as a good run", () => {
  assert.deepEqual(parseLastRun("2026-11-15T03:31:12Z\n"), { time: "2026-11-15T03:31:12Z", problem: "no result recorded" });
});

test("readBackupState says never run when there are no files", async () => {
  assert.deepEqual(await readBackupState(await statusDir({})), { lastRun: null, lastSuccess: null });
});

test("readBackupState says never run when the folder doesn't exist", async () => {
  assert.deepEqual(await readBackupState(join(tmpdir(), "no-such-backup-status-here")), { lastRun: null, lastSuccess: null });
});

test("readBackupState reads both files", async () => {
  const dir = await statusDir({
    "backup-last-run": "2026-11-16T03:30:05Z couldn't open the backup repository\n",
    "backup-last-success": "2026-11-15T03:31:10Z\n",
  });
  assert.deepEqual(await readBackupState(dir), {
    lastRun: { time: "2026-11-16T03:30:05Z", problem: "couldn't open the backup repository" },
    lastSuccess: "2026-11-15T03:31:10Z",
  });
});

test("readBackupState gives no last success if that file is empty", async () => {
  const dir = await statusDir({ "backup-last-run": "2026-11-16T03:30:05Z it isn't set up yet\n", "backup-last-success": "\n" });
  assert.equal((await readBackupState(dir)).lastSuccess, null);
});

test("readBackupState passes on errors other than a missing file", async () => {
  const dir = await statusDir({});
  await mkdir(join(dir, "backup-last-run"));
  await assert.rejects(readBackupState(dir), { code: "EISDIR" });
});