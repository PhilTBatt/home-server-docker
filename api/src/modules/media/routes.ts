import type { FastifyPluginAsync } from "fastify";

const qbitApiKey = process.env.QBIT_API_KEY;
if (!qbitApiKey) {
  throw new Error("QBIT_API_KEY is not set");
}
const qbitAuth = `Bearer ${qbitApiKey}`;

type QbitTorrent = {
  name: string;
  progress: number;
  dlspeed: number;
  eta: number;
  state: string;
};

export const media: FastifyPluginAsync = async (app) => {
  app.get("/downloads", async () => {
    const response = await fetch(
      "http://qbittorrent:8081/api/v2/torrents/info?filter=downloading",
      { headers: { Authorization: qbitAuth } },
    );
    if (!response.ok) {
      throw new Error(`qBittorrent replied ${response.status}`);
    }
    const torrents = (await response.json()) as QbitTorrent[];
    return torrents.map((t) => ({
      name: t.name,
      percent: Math.round(t.progress * 100),
      speedKBps: Math.round(t.dlspeed / 1024),
      etaSeconds: t.eta,
      state: t.state,
    }));
  });
};