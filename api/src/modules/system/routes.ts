import { readFile, statfs } from "node:fs/promises";
import { freemem, totalmem, uptime } from "node:os";
import type { FastifyPluginAsync } from "fastify";
import { findProblems, type Status } from "./alerts.js";

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

async function readStatus(): Promise<Status> {
  const disk = await statfs("/");
  return {
    uptimeSeconds: Math.round(uptime()),
    memoryTotalMB: Math.round(totalmem() / 1024 ** 2),
    memoryAvailableMB: Math.round(freemem() / 1024 ** 2),
    diskTotalGB: Math.round((disk.blocks * disk.bsize) / 1024 ** 3),
    diskAvailableGB: Math.round((disk.bavail * disk.bsize) / 1024 ** 3),
  };
}

export const system: FastifyPluginAsync = async (app) => {
  app.get("/wifi-reconnects", async () => {
    return parseReconnects(await readReconnectLog());
  });

  app.get("/status", async () => {
    return readStatus();
  });

  app.get("/alerts", async () => {
    const status = await readStatus();
    const reconnects = parseReconnects(await readReconnectLog());
    const problems = findProblems(
      status,
      reconnects.recent.map((r) => r.time),
      new Date(),
    );
    return { ok: problems.length === 0, problems };
  });
};