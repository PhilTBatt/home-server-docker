import { readFile, statfs } from "node:fs/promises";
import { freemem, totalmem, uptime } from "node:os";
import type { FastifyPluginAsync } from "fastify";

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

export const system: FastifyPluginAsync = async (app) => {
  app.get("/wifi-reconnects", async () => {
    const text = await readFile(reconnectLog, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    });

    return parseReconnects(text);
  });
  
  app.get("/status", async () => {
    const disk = await statfs("/");
    return {
      uptimeSeconds: Math.round(uptime()),
      memoryTotalMB: Math.round(totalmem() / 1024 ** 2),
      memoryAvailableMB: Math.round(freemem() / 1024 ** 2),
      diskTotalGB: Math.round((disk.blocks * disk.bsize) / 1024 ** 3),
      diskAvailableGB: Math.round((disk.bavail * disk.bsize) / 1024 ** 3),
    };
  });
};