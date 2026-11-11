import type { FastifyPluginAsync } from "fastify";

const qbitApiKey = process.env.QBIT_API_KEY;
if (!qbitApiKey) {
  throw new Error("QBIT_API_KEY is not set");
  
}
const qbitAuth = `Bearer ${qbitApiKey}`;

const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
if (!jellyfinApiKey) {
  throw new Error("JELLYFIN_API_KEY is not set");
}
const jellyfinAuth = `MediaBrowser Token="${jellyfinApiKey}"`;

const qbitNoEta = 8640000;

type QbitTorrent = {
  name: string;
  progress: number;
  dlspeed: number;
  eta: number;
  state: string;
};

type JellyfinCounts = {
  MovieCount: number;
  SeriesCount: number;
  EpisodeCount: number;
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
      etaSeconds: t.eta === qbitNoEta ? null : t.eta,
      state: t.state,
    }));
  });

  app.get("/library", async () => {
    const response = await fetch("http://jellyfin:8096/Items/Counts", {
      headers: { Authorization: jellyfinAuth },
    });
    if (!response.ok) {
      throw new Error(`Jellyfin replied ${response.status}`);
    }
    
    const counts = (await response.json()) as JellyfinCounts;
    return {
      movies: counts.MovieCount,
      series: counts.SeriesCount,
      episodes: counts.EpisodeCount,
    };
  });

  app.post("/library/scan", async () => {
    const response = await fetch("http://jellyfin:8096/Library/Refresh", {
      method: "POST",
      headers: { Authorization: jellyfinAuth },
    });
    if (!response.ok) {
      throw new Error(`Jellyfin replied ${response.status}`);
    }
    return { status: "scan started" };
  });
};