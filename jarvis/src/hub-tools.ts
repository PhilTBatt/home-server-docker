import { existsSync } from "node:fs";
import { tidy } from "./session-notes.js";

export const hubServerFile = "/mcp/dist/server.js";
export const hubServerName = "hub";
export const hubToolPrefix = `mcp__${hubServerName}__`;

export const hubReadTools = ["get_status", "get_alerts", "get_features", "get_downloads", "get_library", "get_wifi_reconnects", "get_backup", "get_watchers"];
export const hubActionTools = ["scan_library", "stop_download", "start_download", "add_watcher", "cancel_watcher"];
export const notDoneNote = "Phil didn't say yes, so it wasn't done";
export const hubApiUrl = "http://api:3000";
export const lookupMs = 5_000;
export const nameLimit = 80;
export const noTorrentError = "No torrent with that hash";
const typeYes = "Type yes to let him, or anything else to stop it";

export type HubServer = { command: string; args: string[]; token: string; actions?: boolean };

export function hubServerFor(token: string, actions = false, file = hubServerFile): HubServer {
  return { command: process.execPath, args: [file], token, actions };
}

export function actionsEnv(server: HubServer): Record<string, string> {
  return { MCP_ACTIONS: server.actions === true ? "on" : "off" };
}

export function hubServerEnv(server: HubServer): Record<string, string> {
  return { API_TOKEN: server.token, ...actionsEnv(server) };
}

export function allowedHubTools(server: HubServer): string[] {
  return server.actions === true ? [...hubReadTools, ...hubActionTools] : hubReadTools;
}

export function isHubAction(name: string): boolean {
  return hubActionTools.includes(name);
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
  const hours = typeof fields.hours === "number" ? fields.hours : 24;
  const span = hours === 1 ? "an hour" : `${hours} hours`;
  let what: string | null = null;
  if (fields.kind === "download-finished" && typeof fields.name === "string" && /^[A-Za-z0-9'\-.,()&/+:_]+( [A-Za-z0-9'\-.,()&/+:_]+)*$/.test(fields.name) && fields.name.length >= 2 && fields.name.length <= 40) what = `a download matching "${fields.name}" to finish`;
  if (fields.kind === "disk-free-below" && whole(fields.percent, 1, 99)) what = `free disk space to fall below ${String(fields.percent)}%`;
  if (fields.kind === "service-answering" && typeof fields.service === "string" && Object.hasOwn(watchedServices, fields.service)) what = `${watchedServices[fields.service]} to answer`;
  return what === null ? null : `watch for ${what}, for up to ${span}, and tell your phone once when it happens`;
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
  };
  return `Jarvis wants to ${what[name] ?? `use ${name}`}. ${typeYes}`;
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
