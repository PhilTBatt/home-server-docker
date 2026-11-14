import { readFile } from "node:fs/promises";
import { join } from "node:path";

const backupDir = "/var/lib/home-hub";

export type BackupRun = {
  time: string;
  problem: string | null;
};

export type BackupState = {
  lastRun: BackupRun | null;
  lastSuccess: string | null;
};

export function parseLastRun(text: string): BackupRun | null {
  const line = text.trim();
  if (line === "") return null;
  const space = line.indexOf(" ");
  if (space === -1) return { time: line, problem: "no result recorded" };
  const result = line.slice(space + 1);
  return { time: line.slice(0, space), problem: result === "ok" ? null : result };
}

async function readIfThere(path: string): Promise<string> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

export async function readBackupState(dir = backupDir): Promise<BackupState> {
  const lastRun = parseLastRun(await readIfThere(join(dir, "backup-last-run")));
  const lastSuccess = (await readIfThere(join(dir, "backup-last-success"))).trim();
  return { lastRun, lastSuccess: lastSuccess === "" ? null : lastSuccess };
}