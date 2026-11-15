import { readFile, statfs } from "node:fs/promises";
import { freemem, totalmem, uptime } from "node:os";
import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";
import { findProblems, type Status } from "./alerts.js";
import { readBackupState } from "./backup.js";

const reconnectLog = "/var/log/wifi-watchdog/reconnects.log";

type Reconnect = {
  time: string;
  message: string;
};

export function parseReconnects(text: string) {
  const reconnects: Reconnect[] = text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const space = line.indexOf(" ");
      return { time: line.slice(0, space), message: line.slice(space + 1) };
    });
  return { total: reconnects.length, recent: reconnects.slice(-20).reverse() };
}

async function readReconnectLog() {
  return readFile(reconnectLog, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  });
}

export async function readStatus(): Promise<Status> {
  const disk = await statfs("/");
  return {
    uptimeSeconds: Math.round(uptime()),
    memoryTotalMB: Math.round(totalmem() / 1024 ** 2),
    memoryAvailableMB: Math.round(freemem() / 1024 ** 2),
    diskTotalGB: Math.round((disk.blocks * disk.bsize) / 1024 ** 3),
    diskAvailableGB: Math.round((disk.bavail * disk.bsize) / 1024 ** 3),
  };
}

export async function currentProblems(backupDir?: string) {
  const status = await readStatus();
  const reconnects = parseReconnects(await readReconnectLog());
  const backup = await readBackupState(backupDir).catch(() => null);
  return findProblems(
    status,
    reconnects.recent.map((r) => r.time),
    backup?.lastRun ?? null,
    new Date(),
  );
}

export const system: FastifyPluginAsync<Pick<Config, "features"> & { backupDir?: string }> = async (app, options) => {
  app.get("/wifi-reconnects", async () => {
    return parseReconnects(await readReconnectLog());
  });

  app.get("/status", async () => {
    return readStatus();
  });

  app.get("/alerts", async () => {
    const problems = await currentProblems(options.backupDir);
    return { ok: problems.length === 0, problems };
  });

  app.get("/features", async () => {
    return options.features;
  });

  app.get("/backup", async () => {
    return readBackupState(options.backupDir);
  });
};