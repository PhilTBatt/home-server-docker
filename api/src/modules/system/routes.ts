import { readFile, statfs } from "node:fs/promises";
import { freemem, totalmem, uptime } from "node:os";
import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";
import { findProblems, type Problem, type Status } from "./alerts.js";
import { readBackupState } from "./backup.js";
import { runDoctor, type DoctorSources } from "./doctor.js";

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

export async function currentProblems(backupDir?: string, more: Problem[] = []) {
  const status = await readStatus();
  const reconnects = parseReconnects(await readReconnectLog());
  const backup = await readBackupState(backupDir).catch(() => null);
  const problems = findProblems(
    status,
    reconnects.recent.map((r) => r.time),
    backup?.lastRun ?? null,
    new Date(),
  );
  return [...problems, ...more];
}

export function doctorReads(backupDir?: string, moreProblems?: () => Problem[]) {
  return {
    problems: () => currentProblems(backupDir, moreProblems?.()),
    status: readStatus,
    backup: () => readBackupState(backupDir),
  };
}

export const system: FastifyPluginAsync<Pick<Config, "features"> & { backupDir?: string; moreProblems?: () => Problem[]; doctor?: DoctorSources; now?: () => Date }> = async (app, options) => {
  app.get("/wifi-reconnects", async () => {
    return parseReconnects(await readReconnectLog());
  });

  app.get("/status", async () => {
    return readStatus();
  });

  app.get("/alerts", async () => {
    const problems = await currentProblems(options.backupDir, options.moreProblems?.());
    return { ok: problems.length === 0, problems };
  });

  app.get("/features", async () => {
    return options.features;
  });

  app.get("/backup", async () => {
    return readBackupState(options.backupDir);
  });

  app.get("/doctor", async (_request, reply) => {
    if (options.doctor === undefined) return reply.code(404).send({ error: "The server doctor isn't set up" });
    return runDoctor(options.features, options.doctor, doctorReads(options.backupDir, options.moreProblems), options.now?.() ?? new Date());
  });
};