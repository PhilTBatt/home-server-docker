import { existsSync } from "node:fs";
import type { MusicYes } from "./config.js";
import { tidy } from "./session-notes.js";

export const hubServerFile = "/mcp/dist/server.js";
export const hubServerName = "hub";
export const hubToolPrefix = `mcp__${hubServerName}__`;

export const hubMusicReadTools = ["get_spotify_playing", "get_spotify_devices", "get_spotify_queue", "get_spotify_search", "get_spotify_playlists"];
export const hubMusicControls = ["spotify_play", "spotify_pause", "spotify_next", "spotify_previous", "spotify_seek", "spotify_volume", "spotify_shuffle", "spotify_repeat", "spotify_queue_add", "spotify_transfer"];
export const hubMusicChanges = ["spotify_playlist_add", "spotify_save"];
export const hubReadTools = ["get_status", "get_alerts", "get_features", "get_downloads", "get_library", "get_wifi_reconnects", "get_backup", "get_watchers", "get_expiries", "get_doctor", "get_mode", "get_reminders", "get_chore", "get_sessions", "get_deal_status", "get_deal_searches", "get_catch_up", "get_deal_matches", "get_deal_listing", "get_deal_hidden", ...hubMusicReadTools];
export const hubActionTools = ["scan_library", "stop_download", "start_download", "add_watcher", "cancel_watcher", "cancel_reminder", "run_chore", ...hubMusicControls, ...hubMusicChanges];
export const hubNoYesTools = ["set_reminder", "snooze_reminder"];
export const defaultMusicYes: MusicYes = "changes";
export const notDoneNote = "Phil didn't say yes, so it wasn't done";
export const hubApiUrl = "http://api:3000";
export const lookupMs = 5_000;
export const nameLimit = 80;
export const noTorrentError = "No torrent with that hash";
const typeYes = "Type yes to let him, or anything else to stop it";

export type HubServer = { command: string; args: string[]; token: string; actions?: boolean; musicYes?: MusicYes };

export function hubServerFor(token: string, actions = false, file = hubServerFile, musicYes: MusicYes = defaultMusicYes): HubServer {
  return { command: process.execPath, args: [file], token, actions, musicYes };
}

export function actionsEnv(server: HubServer): Record<string, string> {
  return { MCP_ACTIONS: server.actions === true ? "on" : "off" };
}

export function hubServerEnv(server: HubServer): Record<string, string> {
  return { API_TOKEN: server.token, ...actionsEnv(server) };
}

export function allowedHubTools(server: HubServer): string[] {
  return server.actions === true ? [...hubReadTools, ...hubNoYesTools, ...hubActionTools] : hubReadTools;
}

export function isHubAction(name: string): boolean {
  return hubActionTools.includes(name);
}

export function needsHubYes(server: Pick<HubServer, "musicYes"> | undefined, name: string): boolean {
  if (!isHubAction(name)) return false;
  return !hubMusicControls.includes(name) || (server?.musicYes ?? defaultMusicYes) === "all";
}

const deviceIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const musicUriPattern = /^spotify:(track|episode|album|artist|playlist|show):[A-Za-z0-9]{22}$/;
const musicKinds: Record<string, string> = { track: "the track", episode: "the episode", album: "the album", artist: "music by the artist", playlist: "the playlist", show: "the show" };

function fieldsOf(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function musicThing(uri: unknown): string | null {
  if (typeof uri !== "string" || !musicUriPattern.test(uri)) return null;
  const [, kind] = uri.split(":");
  return `${musicKinds[kind]} ${uri}`;
}

function onDevice(input: unknown): string {
  const device = fieldsOf(input).device;
  if (device === undefined) return "";
  return typeof device === "string" && deviceIdPattern.test(device) ? ` on the device whose id starts ${device.slice(0, 8)}` : " on a device the hub won't accept";
}

function minutes(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function counted(items: unknown, one: string, most: number): string | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > most || !items.every((item) => typeof item === "string" && musicUriPattern.test(item))) return null;
  return items.length === 1 ? `1 ${one}` : `${items.length} ${one}s`;
}

export function musicText(name: string, input: unknown): string | null {
  const fields = fieldsOf(input);
  const where = onDevice(input);
  const whole = (value: unknown, lowest: number, highest: number) => typeof value === "number" && Number.isInteger(value) && value >= lowest && value <= highest;
  switch (name) {
    case "spotify_play":
      if (fields.uri === undefined) return `carry on playing Spotify${where}`;
      return musicThing(fields.uri) === null ? null : `play ${musicThing(fields.uri)} on Spotify${where}`;
    case "spotify_pause":
      return `pause Spotify${where}`;
    case "spotify_next":
      return `skip to the next track${where}`;
    case "spotify_previous":
      return `go back to the previous track${where}`;
    case "spotify_seek":
      return whole(fields.positionMs, 0, 86_400_000) ? `jump to ${minutes(fields.positionMs as number)} in what's playing${where}` : null;
    case "spotify_volume":
      return whole(fields.percent, 0, 100) ? `set Spotify's volume to ${String(fields.percent)}%${where}` : null;
    case "spotify_shuffle":
      return typeof fields.on === "boolean" ? `turn shuffle ${fields.on ? "on" : "off"}${where}` : null;
    case "spotify_repeat":
      return fields.mode === "off" || fields.mode === "track" || fields.mode === "context" ? `set repeat to ${fields.mode === "off" ? "off" : fields.mode === "track" ? "this track" : "the album or playlist"}${where}` : null;
    case "spotify_queue_add":
      return musicThing(fields.uri) === null ? null : `add ${musicThing(fields.uri)} to the queue${where}`;
    case "spotify_transfer": {
      const device = fields.device;
      return typeof device === "string" && deviceIdPattern.test(device) ? `move the music to the device whose id starts ${device.slice(0, 8)}${fields.play === true ? " and play it there" : ""}` : null;
    }
    case "spotify_playlist_add": {
      const what = counted(fields.uris, "track or episode", 100);
      return what === null || typeof fields.playlist !== "string" || !/^[A-Za-z0-9]{22}$/.test(fields.playlist) ? null : `add ${what} to your playlist ${fields.playlist}`;
    }
    case "spotify_save": {
      const what = counted(fields.uris, "item", 40);
      return what === null ? null : `save ${what} to your Spotify library`;
    }
    default:
      return null;
  }
}

function download(input: unknown): string {
  const hash = typeof input === "object" && input !== null ? (input as Record<string, unknown>).hash : undefined;
  if (typeof hash !== "string" || !/^[0-9a-f]+$/i.test(hash)) return "a download";
  return hash.length > 8 ? `the download whose hash starts ${hash.slice(0, 8)}` : `the download ${hash}`;
}

const watchedServices: Record<string, string> = { qbittorrent: "qBittorrent", jellyfin: "Jellyfin" };

export function watchText(input: unknown): string | null {
  const fields = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const whole = (value: unknown, lowest: number, highest: number) => typeof value === "number" && Number.isInteger(value) && value >= lowest && value <= highest;
  if (fields.hours !== undefined && !whole(fields.hours, 1, 168)) return null;
  const own: Record<string, string> = { "download-finished": "name", "disk-free-below": "percent", "service-answering": "service" };
  if (typeof fields.kind !== "string" || !Object.hasOwn(own, fields.kind) || Object.keys(fields).some((key) => key !== "kind" && key !== "hours" && key !== own[fields.kind as string])) return null;
  const hours = typeof fields.hours === "number" ? fields.hours : 24;
  const span = hours === 1 ? "an hour" : `${hours} hours`;
  let what: string | null = null;
  if (fields.kind === "download-finished" && typeof fields.name === "string" && /^[A-Za-z0-9'\-.,()&/+:_]+( [A-Za-z0-9'\-.,()&/+:_]+)*$/.test(fields.name) && fields.name.length >= 2 && fields.name.length <= 40) what = `a download matching "${fields.name}" to finish`;
  if (fields.kind === "disk-free-below" && whole(fields.percent, 1, 99)) what = `free disk space to fall below ${String(fields.percent)}%`;
  if (fields.kind === "service-answering" && typeof fields.service === "string" && Object.hasOwn(watchedServices, fields.service)) what = `${watchedServices[fields.service]} to answer`;
  return what === null ? null : `watch for ${what}, for up to ${span}, and tell your phone once when it happens`;
}

const choreText: Record<string, string> = {
  "rebuild-api": "rebuild the API and restart it",
  "run-tests": "run the hub's tests in throwaway containers",
  "pull-images": "download newer images for the services, without restarting anything",
};

function chore(input: unknown): string {
  const job = typeof input === "object" && input !== null ? (input as Record<string, unknown>).job : undefined;
  if (typeof job === "string" && Object.hasOwn(choreText, job)) return `${choreText[job]} (the ${job} chore)`;
  const session = typeof job === "string" ? /^session-(start|stop)-([a-z0-9-]{1,20})$/.exec(job) : null;
  if (session !== null) return `${session[1]} the Claude Code session ${session[2]}`;
  return "run a chore the runner won't accept";
}

function reminderId(input: unknown): string {
  const id = typeof input === "object" && input !== null ? (input as Record<string, unknown>).id : undefined;
  return typeof id === "string" && /^[0-9a-f]{8}$/.test(id) ? `the reminder ${id}` : "a reminder";
}

function watcherId(input: unknown): string {
  const id = typeof input === "object" && input !== null ? (input as Record<string, unknown>).id : undefined;
  return typeof id === "string" && /^[0-9a-f]{8}$/.test(id) ? `the watcher ${id}` : "a watcher";
}

export function actionQuestion(name: string, input: unknown): string {
  const what: Record<string, string> = {
    scan_library: "scan the library",
    stop_download: `stop ${download(input)}`,
    start_download: `start ${download(input)} again`,
    add_watcher: watchText(input) ?? "add a watcher with details the hub won't accept",
    cancel_watcher: `cancel ${watcherId(input)}`,
    cancel_reminder: `cancel ${reminderId(input)}`,
    run_chore: chore(input),
  };
  const music = name.startsWith("spotify_") ? (musicText(name, input) ?? "change Spotify with details the hub won't accept") : undefined;
  return `Jarvis wants to ${what[name] ?? music ?? `use ${name}`}. ${typeYes}`;
}

export type Download = { name: string; percent: number };
export type Lookup = (hash: string, signal: AbortSignal) => Promise<Download | null>;

export function fullHash(input: unknown): string | null {
  const hash = typeof input === "object" && input !== null ? (input as Record<string, unknown>).hash : undefined;
  return typeof hash === "string" && /^[0-9a-f]{40}$/.test(hash) ? hash : null;
}

export function shownName(name: string): string {
  const characters = [...tidy(name).replace(/\s+/g, " ").replace(/["\u201c-\u201f\u2033\u2036\u301d-\u301f\uff02]/g, "'")];
  return characters.length > nameLimit ? `${characters.slice(0, nameLimit - 1).join("").trimEnd()}…` : characters.join("");
}

export async function lookUpDownload(hash: string, token: string, signal: AbortSignal, url = hubApiUrl): Promise<Download | null> {
  const response = await fetch(`${url}/media/downloads/${hash}`, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal });
  const body: unknown = await response.json().catch(() => null);
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (response.status === 404 && fields.error === noTorrentError) return null;
  if (!response.ok) throw new Error(`The hub replied ${response.status}`);
  if (typeof fields.name !== "string" || typeof fields.percent !== "number" || fields.hash !== hash) throw new Error("The hub's reply wasn't that download");
  return { name: fields.name, percent: fields.percent };
}

function untilStopped<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return Promise.race([promise, new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))]);
}

export async function describeAction(name: string, input: unknown, lookup: Lookup, signal?: AbortSignal, ms = lookupMs): Promise<string> {
  if (name !== "stop_download" && name !== "start_download") return actionQuestion(name, input);
  const verb = name === "stop_download" ? "stop" : "start";
  const again = name === "start_download" ? " again" : "";
  const hash = fullHash(input);
  if (hash === null) return `Jarvis wants to ${verb} ${download(input)}${again} (not a full hash, so it can't be looked up). ${typeYes}`;
  const start = hash.slice(0, 8);
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(new Error("The hub didn't answer in time")), ms);
  const stop = signal === undefined ? limit.signal : AbortSignal.any([signal, limit.signal]);
  const found = await untilStopped(lookup(hash, stop), stop)
    .catch(() => undefined)
    .finally(() => clearTimeout(timer));
  const what =
    found === undefined
      ? `${verb} the download whose hash starts ${start}${again} (couldn't look up its name)`
      : found === null
        ? `${verb} a download the hub doesn't have (hash starts ${start})`
        : `${verb} the download whose hash starts ${start}${again} (${found.percent}% done), named "${shownName(found.name)}"`;
  return `Jarvis wants to ${what}. ${typeYes}`;
}

export function describeWithHub(token: string): (tool: string, input: unknown, signal: AbortSignal) => Promise<string> {
  return (tool, input, signal) => describeAction(tool, input, (hash, lookupSignal) => lookUpDownload(hash, token, lookupSignal), signal);
}

export function withHubToken(env: Record<string, string | undefined>, hub: HubServer | undefined): Record<string, string | undefined> {
  const { API_TOKEN: _, EARS_TOKEN: _ears, ...rest } = env;
  return hub === undefined ? rest : { ...rest, API_TOKEN: hub.token };
}

export function hubNotBuilt(file: string): string {
  return `JARVIS_HUB_TOOLS is on, but the MCP server isn't built: there's no ${file}. Build it with npm ci and npm test in mcp/, as the README says`;
}

export function checkHubServer(file: string, exists: (path: string) => boolean = existsSync): void {
  if (!exists(file)) throw new Error(hubNotBuilt(file));
}

export function hubProblemNote(status: string): string {
  return `The hub's tools didn't load (${status}), so in this chat Jarvis can only read the brain`;
}
