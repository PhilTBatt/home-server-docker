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
  hash: string;
};

type JellyfinCounts = {
  MovieCount: number;
  SeriesCount: number;
  EpisodeCount: number;
};

type TorrentAction = {
  hash: string;
  action: "stop" | "start";
};

const torrentActionSchema = {
  params: {
    type: "object",
    required: ["hash", "action"],
    properties: {
      hash: { type: "string", pattern: "^[0-9a-f]{40}$" },
      action: { type: "string", enum: ["stop", "start"] },
    },
  },
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
      hash: t.hash
    }));
  });

  app.post<{ Params: TorrentAction }>(
    "/downloads/:hash/:action",
    { schema: torrentActionSchema },
    async (request) => {
      const { hash, action } = request.params;
      const response = await fetch(`http://qbittorrent:8081/api/v2/torrents/${action}`, {
        method: "POST",
        headers: { Authorization: qbitAuth },
        body: new URLSearchParams({ hashes: hash }),
      });
      if (!response.ok) {
        throw new Error(`qBittorrent replied ${response.status}`);
      }
      return { status: action === "stop" ? "stopped" : "started" };
    },
  );

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