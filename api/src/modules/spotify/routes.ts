import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Features } from "../../config.js";
import { SpotifyProblem, type SpotifyAuth } from "./auth.js";
import { libraryMost, playlistAddMost, playlistsMost, repeatModes, searchDefault, searchMost, searchTypes, type RepeatMode, type SearchType, type SpotifyClient } from "./client.js";

export const switchedOffError = "Spotify is switched off";
export const queryMost = 200;
export const seekMostMs = 24 * 60 * 60 * 1000;

const devicePattern = "^[A-Za-z0-9_-]{1,128}$";
const playablePattern = "^spotify:(track|episode|album|artist|playlist):[A-Za-z0-9]{22}$";
const queueablePattern = "^spotify:(track|episode):[A-Za-z0-9]{22}$";
const savablePattern = "^spotify:(track|episode|album|show|playlist):[A-Za-z0-9]{22}$";
const playlistIdPattern = "^[A-Za-z0-9]{22}$";
const device = { type: "string", pattern: devicePattern };

function bodySchema(properties: Record<string, unknown>, required: string[] = []) {
  return { body: { type: "object", additionalProperties: false, required, properties } };
}

const deviceOnly = { schema: bodySchema({ device }) };

type DeviceBody = { device?: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function one(query: unknown, key: string): string | undefined | null {
  const value = isObject(query) ? query[key] : undefined;
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

export type SearchAsk = { query: string; types: SearchType[]; limit: number };

export function readSearch(query: unknown): SearchAsk | string {
  const q = one(query, "q");
  if (q === undefined || q === null || q.trim() === "" || [...q].length > queryMost || /[\u0000-\u001F\u007F]/.test(q)) return `q must be what to search for, 1 to ${queryMost} characters of plain text`;
  const typesText = one(query, "types");
  if (typesText === null) return "types must be given once";
  const types = typesText === undefined || typesText === "" ? [...searchTypes] : typesText.split(",");
  const known = types.filter((type): type is SearchType => (searchTypes as readonly string[]).includes(type));
  if (known.length !== types.length || new Set(known).size !== known.length) return `types must be some of ${searchTypes.join(", ")}, with commas between`;
  const limitText = one(query, "limit");
  if (limitText === null) return "limit must be given once";
  const limit = limitText === undefined || limitText === "" ? searchDefault : /^\d{1,2}$/.test(limitText) ? Number(limitText) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > searchMost) return `limit must be a whole number from 1 to ${searchMost}`;
  return { query: q.trim(), types: known, limit };
}

export function readPage(query: unknown): { limit: number; offset: number } | string {
  const limitText = one(query, "limit");
  const offsetText = one(query, "offset");
  if (limitText === null || offsetText === null) return "limit and offset must be given once each";
  const limit = limitText === undefined || limitText === "" ? 20 : /^\d{1,2}$/.test(limitText) ? Number(limitText) : NaN;
  const offset = offsetText === undefined || offsetText === "" ? 0 : /^\d{1,4}$/.test(offsetText) ? Number(offsetText) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > playlistsMost) return `limit must be a whole number from 1 to ${playlistsMost}`;
  if (!Number.isInteger(offset) || offset > 1000) return "offset must be a whole number from 0 to 1000";
  return { limit, offset };
}

async function answer(reply: FastifyReply, work: () => Promise<unknown>): Promise<unknown> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SpotifyProblem) {
      if (error.waitSeconds !== null) reply.header("retry-after", String(error.waitSeconds));
      return reply.code(error.status).send(error.waitSeconds === null ? { error: error.message } : { error: error.message, waitSeconds: error.waitSeconds });
    }
    return reply.code(500).send({ error: "Something went wrong talking to Spotify" });
  }
}

export type SpotifyParts = { auth: SpotifyAuth; client: SpotifyClient };

export const spotify: FastifyPluginAsync<{ features: Features; spotify?: SpotifyParts }> = async (app, options) => {
  const parts = options.features.spotify ? options.spotify : undefined;

  app.addHook("onRequest", async (_request, reply) => {
    if (parts === undefined) return reply.code(404).send({ error: switchedOffError });
  });

  app.addHook("preValidation", async (request) => {
    if (request.method === "POST" && (request.body === undefined || request.body === null)) request.body = {};
  });

  const use = () => parts as SpotifyParts;

  app.get("/status", async (_request, reply) => answer(reply, () => use().auth.status()));

  app.post("/sign-in", async (_request, reply) => answer(reply, async () => use().auth.startSignIn()));

  app.post<{ Body: { code?: string; state: string; error?: string } }>(
    "/callback",
    {
      schema: bodySchema(
        {
          code: { type: "string", minLength: 1, maxLength: 2000, pattern: "^[\\x21-\\x7E]+$" },
          state: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" },
          error: { type: "string", minLength: 1, maxLength: 100 },
        },
        ["state"],
      ),
    },
    async (request, reply) => answer(reply, () => use().auth.finishSignIn(request.body)),
  );

  app.post("/sign-out", async (_request, reply) =>
    answer(reply, async () => {
      await use().auth.signOut();
      return { signedIn: false };
    }),
  );

  app.get("/playing", async (_request, reply) => answer(reply, () => use().client.playing()));
  app.get("/devices", async (_request, reply) => answer(reply, () => use().client.devices()));
  app.get("/queue", async (_request, reply) => answer(reply, () => use().client.queue()));

  app.get("/search", { logLevel: "warn" }, async (request, reply) => {
    const asked = readSearch(request.query);
    if (typeof asked === "string") return reply.code(400).send({ error: asked });
    return answer(reply, () => use().client.search(asked.query, asked.types, asked.limit));
  });

  app.get("/playlists", async (request, reply) => {
    const page = readPage(request.query);
    if (typeof page === "string") return reply.code(400).send({ error: page });
    return answer(reply, () => use().client.playlists(page.limit, page.offset));
  });

  app.post<{ Body: { uri?: string; device?: string } }>("/play", { schema: bodySchema({ uri: { type: "string", pattern: playablePattern }, device }) }, async (request, reply) =>
    answer(reply, () => use().client.play(request.body?.uri, request.body?.device)),
  );
  app.post<{ Body: DeviceBody }>("/pause", deviceOnly, async (request, reply) => answer(reply, () => use().client.pause(request.body?.device)));
  app.post<{ Body: DeviceBody }>("/next", deviceOnly, async (request, reply) => answer(reply, () => use().client.next(request.body?.device)));
  app.post<{ Body: DeviceBody }>("/previous", deviceOnly, async (request, reply) => answer(reply, () => use().client.previous(request.body?.device)));

  app.post<{ Body: { positionMs: number; device?: string } }>("/seek", { schema: bodySchema({ positionMs: { type: "integer", minimum: 0, maximum: seekMostMs }, device }, ["positionMs"]) }, async (request, reply) =>
    answer(reply, () => use().client.seek(request.body.positionMs, request.body.device)),
  );

  app.post<{ Body: { percent: number; device?: string } }>("/volume", { schema: bodySchema({ percent: { type: "integer", minimum: 0, maximum: 100 }, device }, ["percent"]) }, async (request, reply) =>
    answer(reply, () => use().client.volume(request.body.percent, request.body.device)),
  );

  app.post<{ Body: { on: boolean; device?: string } }>("/shuffle", { schema: bodySchema({ on: { type: "boolean" }, device }, ["on"]) }, async (request, reply) =>
    answer(reply, () => use().client.shuffle(request.body.on, request.body.device)),
  );

  app.post<{ Body: { mode: RepeatMode; device?: string } }>("/repeat", { schema: bodySchema({ mode: { type: "string", enum: [...repeatModes] }, device }, ["mode"]) }, async (request, reply) =>
    answer(reply, () => use().client.repeat(request.body.mode, request.body.device)),
  );

  app.post<{ Body: { uri: string; device?: string } }>("/queue", { schema: bodySchema({ uri: { type: "string", pattern: queueablePattern }, device }, ["uri"]) }, async (request, reply) =>
    answer(reply, () => use().client.addToQueue(request.body.uri, request.body.device)),
  );

  app.post<{ Body: { device: string; play?: boolean } }>("/transfer", { schema: bodySchema({ device, play: { type: "boolean" } }, ["device"]) }, async (request, reply) =>
    answer(reply, () => use().client.transfer(request.body.device, request.body.play ?? false)),
  );

  app.post<{ Params: { id: string }; Body: { uris: string[]; position?: number } }>(
    "/playlists/:id/add",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", pattern: playlistIdPattern } } },
        ...bodySchema({ uris: { type: "array", minItems: 1, maxItems: playlistAddMost, uniqueItems: true, items: { type: "string", pattern: queueablePattern } }, position: { type: "integer", minimum: 0, maximum: 10_000 } }, ["uris"]),
      },
    },
    async (request, reply) => answer(reply, () => use().client.addToPlaylist(request.params.id, request.body.uris, request.body.position)),
  );

  app.post<{ Body: { uris: string[] } }>("/library/save", { schema: bodySchema({ uris: { type: "array", minItems: 1, maxItems: libraryMost, uniqueItems: true, items: { type: "string", pattern: savablePattern } } }, ["uris"]) }, async (request, reply) =>
    answer(reply, () => use().client.save(request.body.uris)),
  );
};
