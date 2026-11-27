import { cleanText } from "../deals/source.js";
import { askSpotify, SpotifyProblem, type Answer, type Fetcher, type SpotifyAuth, type SpotifyLog } from "./auth.js";

export const apiHost = "api.spotify.com";
export const apiBase = `https://${apiHost}/v1`;
export const apiMs = 8_000;
export const nameMost = 120;
export const searchTypes = ["track", "album", "artist", "playlist"] as const;
export const searchMost = 10;
export const searchDefault = 5;
export const queueMost = 20;
export const playlistsMost = 50;
export const playlistAddMost = 100;
export const libraryMost = 40;
export const repeatModes = ["off", "track", "context"] as const;

export type SearchType = (typeof searchTypes)[number];
export type RepeatMode = (typeof repeatModes)[number];

export type Item = { kind: "track" | "episode"; name: string; by: string[]; album: string | null; uri: string; durationMs: number | null };
export type Device = { id: string | null; name: string; type: string; active: boolean; volumePercent: number | null; supportsVolume: boolean; restricted: boolean; privateSession: boolean };
export type Playing = { active: boolean; playing: boolean; item: Item | null; progressMs: number | null; device: Device | null; shuffle: boolean | null; repeat: RepeatMode | null; context: { kind: string; uri: string } | null };
export type Album = { name: string; by: string[]; uri: string; year: string | null; tracks: number | null };
export type Artist = { name: string; uri: string };
export type FoundPlaylist = { name: string; by: string; uri: string; tracks: number | null };
export type SearchResults = { tracks?: Item[]; albums?: Album[]; artists?: Artist[]; playlists?: FoundPlaylist[] };
export type Playlist = { id: string; name: string; uri: string; yours: boolean; collaborative: boolean; public: boolean | null; tracks: number | null };
export type Done = { done: true };

export type SpotifyClient = {
  playing(): Promise<Playing>;
  devices(): Promise<{ devices: Device[] }>;
  queue(): Promise<{ current: Item | null; next: Item[] }>;
  search(query: string, types: readonly SearchType[], limit: number): Promise<SearchResults>;
  playlists(limit: number, offset: number): Promise<{ playlists: Playlist[]; total: number; more: boolean }>;
  play(uri: string | undefined, device: string | undefined): Promise<Done>;
  pause(device: string | undefined): Promise<Done>;
  next(device: string | undefined): Promise<Done>;
  previous(device: string | undefined): Promise<Done>;
  seek(positionMs: number, device: string | undefined): Promise<Done>;
  volume(percent: number, device: string | undefined): Promise<Done>;
  shuffle(on: boolean, device: string | undefined): Promise<Done>;
  repeat(mode: RepeatMode, device: string | undefined): Promise<Done>;
  addToQueue(uri: string, device: string | undefined): Promise<Done>;
  transfer(device: string, play: boolean): Promise<Done>;
  addToPlaylist(id: string, uris: string[], position: number | undefined): Promise<{ added: number; playlist: string }>;
  save(uris: string[]): Promise<{ saved: number }>;
};

const reasons: Record<string, string> = {
  NO_PREV_TRACK: "there's no previous track",
  NO_NEXT_TRACK: "there's no next track",
  NO_SPECIFIC_TRACK: "that track can't be played",
  ALREADY_PAUSED: "it's already paused",
  NOT_PAUSED: "it isn't paused",
  NOT_PLAYING_LOCALLY: "it isn't playing on that device",
  NOT_PLAYING_TRACK: "no track is playing",
  NOT_PLAYING_CONTEXT: "nothing is playing from an album or playlist",
  ENDLESS_CONTEXT: "that can't be done while an endless mix is playing",
  CONTEXT_DISALLOW: "that isn't allowed for what's playing",
  ALREADY_PLAYING: "it's already playing that",
  RATE_LIMITED: "too many commands at once, so wait a moment",
  REMOTE_CONTROL_DISALLOW: "that device can't be controlled from elsewhere",
  DEVICE_NOT_CONTROLLABLE: "that device can't be controlled",
  VOLUME_CONTROL_DISALLOW: "that device's volume can't be set",
  NO_ACTIVE_DEVICE: "no Spotify device is active",
  PREMIUM_REQUIRED: "it needs Spotify Premium",
  UNKNOWN: "Spotify didn't say why",
};

export const noDevice = "No Spotify device is active: open Spotify on one, or name one by its id from GET /spotify/devices";
export const devModeHint = "In Development Mode that usually means the account isn't on the app's user list (User Management in the dashboard), or the app's owner has no Premium";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reasonOf(body: unknown): string | null {
  const inner = isObject(body) && isObject(body.error) ? body.error.reason : undefined;
  const outer = isObject(body) ? body.reason : undefined;
  const reason = typeof inner === "string" ? inner : typeof outer === "string" ? outer : null;
  return reason !== null && /^[A-Z_]{1,40}$/.test(reason) ? reason : null;
}

export function refusal(answer: Answer): SpotifyProblem {
  const reason = reasonOf(answer.body);
  const words = reason === null ? null : (reasons[reason] ?? null);
  if (reason === "NO_ACTIVE_DEVICE") return new SpotifyProblem(409, noDevice);
  if (answer.status === 429) return new SpotifyProblem(429, reason === "QUOTA_EXCEEDED" ? "Spotify says the app's quota is used up for now" : "Spotify asked the hub to wait", answer.waitSeconds);
  if (answer.status === 403) return new SpotifyProblem(403, words === null ? `Spotify refused it (403). ${devModeHint}` : `Spotify refused it: ${words}`);
  if (answer.status === 404) return new SpotifyProblem(404, words === null ? "Spotify couldn't find that" : `Spotify couldn't do it: ${words}`);
  if (answer.status === 400) return new SpotifyProblem(400, words === null ? "Spotify said the request wasn't right (400)" : `Spotify couldn't do it: ${words}`);
  if (answer.status === 401) return new SpotifyProblem(502, "Spotify didn't accept the renewed sign-in: sign in again");
  if (answer.status >= 500) return new SpotifyProblem(502, `Spotify had a problem (${answer.status})`);
  return new SpotifyProblem(502, `Spotify answered ${answer.status}`);
}

function text(value: unknown): string {
  return cleanText(value, nameMost);
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.slice(0, 10).flatMap((entry) => (isObject(entry) && text(entry.name) !== "" ? [text(entry.name)] : [])) : [];
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

const uriPattern = /^spotify:(track|episode|album|artist|playlist|show|user):[A-Za-z0-9]{1,64}$/;
const idPattern = /^[A-Za-z0-9]{1,64}$/;

function uriOf(value: unknown): string | null {
  return typeof value === "string" && uriPattern.test(value) ? value : null;
}

function totalOf(value: Record<string, unknown>): number | null {
  const items = isObject(value.items) ? count(value.items.total) : null;
  return items ?? (isObject(value.tracks) ? count(value.tracks.total) : null);
}

export function itemOf(value: unknown): Item | null {
  if (!isObject(value)) return null;
  const uri = uriOf(value.uri);
  if (uri === null) return null;
  if (value.type === "track") return { kind: "track", name: text(value.name), by: names(value.artists), album: isObject(value.album) ? text(value.album.name) || null : null, uri, durationMs: count(value.duration_ms) };
  if (value.type === "episode") return { kind: "episode", name: text(value.name), by: isObject(value.show) && text(value.show.name) !== "" ? [text(value.show.name)] : [], album: null, uri, durationMs: count(value.duration_ms) };
  return null;
}

export function deviceOf(value: unknown): Device | null {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" && value.id.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value.id) ? value.id : null;
  const volume = count(value.volume_percent);
  return {
    id,
    name: text(value.name),
    type: text(value.type).toLowerCase(),
    active: value.is_active === true,
    volumePercent: volume !== null && volume <= 100 ? volume : null,
    supportsVolume: value.supports_volume === true,
    restricted: value.is_restricted === true,
    privateSession: value.is_private_session === true,
  };
}

export function playingOf(body: unknown): Playing {
  if (!isObject(body)) return { active: false, playing: false, item: null, progressMs: null, device: null, shuffle: null, repeat: null, context: null };
  const repeat = repeatModes.find((mode) => mode === body.repeat_state) ?? null;
  const context = isObject(body.context) && uriOf(body.context.uri) !== null && typeof body.context.type === "string" ? { kind: text(body.context.type), uri: uriOf(body.context.uri) as string } : null;
  return {
    active: true,
    playing: body.is_playing === true,
    item: itemOf(body.item),
    progressMs: count(body.progress_ms),
    device: deviceOf(body.device),
    shuffle: typeof body.shuffle_state === "boolean" ? body.shuffle_state : null,
    repeat,
    context,
  };
}

function albumOf(value: unknown): Album | null {
  if (!isObject(value)) return null;
  const uri = uriOf(value.uri);
  if (uri === null || !uri.startsWith("spotify:album:")) return null;
  const year = typeof value.release_date === "string" && /^\d{4}/.test(value.release_date) ? value.release_date.slice(0, 4) : null;
  return { name: text(value.name), by: names(value.artists), uri, year, tracks: count(value.total_tracks) };
}

function artistOf(value: unknown): Artist | null {
  if (!isObject(value)) return null;
  const uri = uriOf(value.uri);
  return uri === null || !uri.startsWith("spotify:artist:") ? null : { name: text(value.name), uri };
}

function foundPlaylistOf(value: unknown): FoundPlaylist | null {
  if (!isObject(value)) return null;
  const uri = uriOf(value.uri);
  if (uri === null || !uri.startsWith("spotify:playlist:")) return null;
  return { name: text(value.name), by: isObject(value.owner) ? text(value.owner.display_name) : "", uri, tracks: totalOf(value) };
}

function listOf<T>(body: unknown, key: string, shape: (value: unknown) => T | null, most: number): T[] {
  const part = isObject(body) ? body[key] : undefined;
  const items = isObject(part) && Array.isArray(part.items) ? part.items : [];
  return items
    .slice(0, most)
    .map(shape)
    .filter((entry): entry is T => entry !== null);
}

export function searchOf(body: unknown, types: readonly SearchType[], limit: number): SearchResults {
  const results: SearchResults = {};
  if (types.includes("track")) results.tracks = listOf(body, "tracks", itemOf, limit);
  if (types.includes("album")) results.albums = listOf(body, "albums", albumOf, limit);
  if (types.includes("artist")) results.artists = listOf(body, "artists", artistOf, limit);
  if (types.includes("playlist")) results.playlists = listOf(body, "playlists", foundPlaylistOf, limit);
  return results;
}

export function playlistOf(value: unknown, me: string): Playlist | null {
  if (!isObject(value) || typeof value.id !== "string" || !idPattern.test(value.id)) return null;
  const uri = uriOf(value.uri);
  if (uri === null) return null;
  const owner = isObject(value.owner) && typeof value.owner.id === "string" ? value.owner.id : null;
  return { id: value.id, name: text(value.name), uri, yours: owner !== null && owner === me, collaborative: value.collaborative === true, public: typeof value.public === "boolean" ? value.public : null, tracks: totalOf(value) };
}

function withDevice(device: string | undefined): Record<string, string> {
  return device === undefined ? {} : { device_id: device };
}

export function playBody(uri: string | undefined): Record<string, unknown> | undefined {
  if (uri === undefined) return undefined;
  return uri.startsWith("spotify:track:") || uri.startsWith("spotify:episode:") ? { uris: [uri] } : { context_uri: uri };
}

export type ClientOptions = { auth: SpotifyAuth; fetcher?: Fetcher; now?: () => number; log?: SpotifyLog; ms?: number };

export function createSpotifyClient(options: ClientOptions): SpotifyClient {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? (() => undefined);
  const ms = options.ms ?? apiMs;
  let me: { signedInAt: string | null; id: string } | null = null;

  async function call(label: string, method: "GET" | "PUT" | "POST", path: string, query: Record<string, string> = {}, body?: Record<string, unknown>): Promise<unknown> {
    const search = new URLSearchParams(query).toString();
    const url = `${apiBase}${path}${search === "" ? "" : `?${search}`}`;
    for (let attempt = 1; ; attempt++) {
      const token = await options.auth.accessToken();
      const started = now();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const answer = await askSpotify(fetcher, url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, ms).catch((error: unknown) => {
        log(`spotify: ${label} failed after ${Math.round(now() - started)} ms: ${error instanceof Error ? error.message : "unknown error"}`);
        throw error;
      });
      const reason = reasonOf(answer.body);
      log(`spotify: ${label} answered ${answer.status} in ${Math.round(now() - started)} ms${reason === null ? "" : ` (${reason})`}${answer.waitSeconds === null ? "" : `, asking for a wait of ${answer.waitSeconds} seconds`}`);
      if (answer.status === 401 && attempt === 1) {
        options.auth.forgetAccess();
        log(`spotify: ${label} is being tried once more with a renewed access token`);
        continue;
      }
      if (answer.status >= 200 && answer.status < 300) return answer.status === 204 ? null : answer.body;
      throw refusal(answer);
    }
  }

  async function done(label: string, method: "PUT" | "POST", path: string, query: Record<string, string>, body?: Record<string, unknown>): Promise<Done> {
    await call(label, method, path, query, body);
    return { done: true };
  }

  async function myId(): Promise<string> {
    const signedInAt = (await options.auth.status()).signedInAt;
    if (me !== null && me.signedInAt === signedInAt) return me.id;
    const body = await call("who's signed in", "GET", "/me");
    const id = isObject(body) && typeof body.id === "string" && body.id.length <= 200 ? body.id : null;
    if (id === null) throw new SpotifyProblem(502, "Spotify didn't say who's signed in");
    me = { signedInAt, id };
    return id;
  }

  return {
    async playing() {
      const playing = playingOf(await call("playback state", "GET", "/me/player", { additional_types: "episode" }));
      log(`spotify: playback state: ${playing.active ? (playing.playing ? "playing" : "paused") : "nothing active"}`);
      return playing;
    },

    async devices() {
      const body = await call("devices", "GET", "/me/player/devices");
      const devices = (isObject(body) && Array.isArray(body.devices) ? body.devices : []).slice(0, 50).map(deviceOf).filter((device): device is Device => device !== null);
      log(`spotify: ${devices.length} devices, ${devices.filter((device) => device.active).length} active`);
      return { devices };
    },

    async queue() {
      const body = await call("queue", "GET", "/me/player/queue");
      const current = isObject(body) ? itemOf(body.currently_playing) : null;
      const next = (isObject(body) && Array.isArray(body.queue) ? body.queue : []).slice(0, queueMost).map(itemOf).filter((item): item is Item => item !== null);
      log(`spotify: queue has ${next.length} items shown`);
      return { current, next };
    },

    async search(query, types, limit) {
      const body = await call("search", "GET", "/search", { q: query, type: types.join(","), limit: String(limit) });
      const results = searchOf(body, types, limit);
      log(`spotify: search found ${Object.values(results).reduce((sum, list) => sum + (list?.length ?? 0), 0)} results across ${types.length} kinds`);
      return results;
    },

    async playlists(limit, offset) {
      const id = await myId();
      const body = await call("playlists", "GET", "/me/playlists", { limit: String(limit), offset: String(offset) });
      const playlists = (isObject(body) && Array.isArray(body.items) ? body.items : []).slice(0, playlistsMost).map((entry) => playlistOf(entry, id)).filter((entry): entry is Playlist => entry !== null);
      const total = isObject(body) ? (count(body.total) ?? playlists.length) : playlists.length;
      log(`spotify: ${playlists.length} playlists shown of ${total}, ${playlists.filter((entry) => entry.yours).length} of them yours`);
      return { playlists, total, more: offset + playlists.length < total };
    },

    play: (uri, device) => done(uri === undefined ? "resume" : `play (${uri.split(":")[1]})`, "PUT", "/me/player/play", withDevice(device), playBody(uri)),
    pause: (device) => done("pause", "PUT", "/me/player/pause", withDevice(device)),
    next: (device) => done("next", "POST", "/me/player/next", withDevice(device)),
    previous: (device) => done("previous", "POST", "/me/player/previous", withDevice(device)),
    seek: (positionMs, device) => done("seek", "PUT", "/me/player/seek", { position_ms: String(positionMs), ...withDevice(device) }),
    volume: (percent, device) => done("volume", "PUT", "/me/player/volume", { volume_percent: String(percent), ...withDevice(device) }),
    shuffle: (on, device) => done("shuffle", "PUT", "/me/player/shuffle", { state: on ? "true" : "false", ...withDevice(device) }),
    repeat: (mode, device) => done("repeat", "PUT", "/me/player/repeat", { state: mode, ...withDevice(device) }),
    addToQueue: (uri, device) => done("add to the queue", "POST", "/me/player/queue", { uri, ...withDevice(device) }),
    transfer: (device, play) => done("move playback", "PUT", "/me/player", {}, { device_ids: [device], play }),

    async addToPlaylist(id, uris, position) {
      const me = await myId();
      const body = await call("playlist owner", "GET", `/playlists/${encodeURIComponent(id)}`, { fields: "id,name,owner(id),collaborative" });
      const owner = isObject(body) && isObject(body.owner) && typeof body.owner.id === "string" ? body.owner.id : null;
      const collaborative = isObject(body) && body.collaborative === true;
      const name = isObject(body) ? text(body.name) : "";
      if (owner !== me && !collaborative) {
        log("spotify: adding to a playlist was refused because it isn't one of yours");
        throw new SpotifyProblem(403, "That playlist isn't one of yours, so nothing was added");
      }
      await call(`add ${uris.length} to a playlist`, "POST", `/playlists/${encodeURIComponent(id)}/items`, {}, position === undefined ? { uris } : { uris, position });
      return { added: uris.length, playlist: name };
    },

    async save(uris) {
      await call(`save ${uris.length} to the library`, "PUT", "/me/library", { uris: uris.join(",") });
      return { saved: uris.length };
    },
  };
}
