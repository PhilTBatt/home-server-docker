import { readFile } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";

const reconnectLog = "/var/log/wifi-watchdog/reconnects.log";

type Reconnect = {
  time: string;
  message: string;
};

export const system: FastifyPluginAsync = async (app) => {
  app.get("/wifi-reconnects", async () => {
    const text = await readFile(reconnectLog, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    });
    const reconnects: Reconnect[] = text
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => {
        const space = line.indexOf(" ");
        return { time: line.slice(0, space), message: line.slice(space + 1) };
      });
    return { total: reconnects.length, recent: reconnects.slice(-20).reverse() };
  });
};