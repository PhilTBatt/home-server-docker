import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";

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

const hashProperty = { type: "string", pattern: "^[0-9a-f]{40}$" };

const torrentSchema = {
  params: {
    type: "object",
    required: ["hash"],
    properties: {
      hash: hashProperty,
    },
  },
};

const torrentActionSchema = {
  params: {
    type: "object",
    required: ["hash", "action"],
    properties: {
      hash: hashProperty,
      action: { type: "string", enum: ["stop", "start"] },
    },
  },
};

function toDownload(t: QbitTorrent) {
  return {
    name: t.name,
    percent: Math.round(t.progress * 100),
    speedKBps: Math.round(t.dlspeed / 1024),
    etaSeconds: t.eta === qbitNoEta ? null : t.eta,
    state: t.state,
    hash: t.hash
  };
}

export const media: FastifyPluginAsync<Pick<Config, "qbitApiKey" | "jellyfinApiKey">> = async (app, options) => {
  const qbitAuth = `Bearer ${options.qbitApiKey}`;
  const jellyfinAuth = `MediaBrowser Token="${options.jellyfinApiKey}"`;
  app.get("/downloads", async () => {
    const response = await fetch(
      "http://qbittorrent:8081/api/v2/torrents/info?filter=downloading",
      { headers: { Authorization: qbitAuth } },
    );
    if (!response.ok) {
      throw new Error(`qBittorrent replied ${response.status}`);
    }
    const torrents = (await response.json()) as QbitTorrent[];
    return torrents.map(toDownload);
  });

  app.get<{ Params: Pick<TorrentAction, "hash"> }>(
    "/downloads/:hash",
    { schema: torrentSchema },
    async (request, reply) => {
      const { hash } = request.params;
      const response = await fetch(
        `http://qbittorrent:8081/api/v2/torrents/info?hashes=${hash}`,
        { headers: { Authorization: qbitAuth } },
      );
      if (!response.ok) {
        throw new Error(`qBittorrent replied ${response.status}`);
      }
      const torrents = (await response.json()) as QbitTorrent[];
      const torrent = torrents.find((t) => t.hash === hash);
      if (torrent === undefined) return reply.code(404).send({ error: "No torrent with that hash" });
      return toDownload(torrent);
    },
  );

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