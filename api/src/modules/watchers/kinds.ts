import { couldBeSecret, isPlain } from "../expiry/list.js";
import type { Finished } from "../media/routes.js";
import type { Notification } from "../notify/notifier.js";

export const kinds = ["download-finished", "disk-free-below", "service-answering"] as const;
export const services = ["qbittorrent", "jellyfin"] as const;

export type Kind = (typeof kinds)[number];
export type Service = (typeof services)[number];

export type WatchFor = { kind: "download-finished"; name: string } | { kind: "disk-free-below"; percent: number } | { kind: "service-answering"; service: Service };

export type Asked = { watch: WatchFor; hours: number };

export type Disk = { freeGB: number; totalGB: number };

export type Readings = {
  finished?: Finished[];
  disk?: Disk;
  answering?: Partial<Record<Service, boolean>>;
};

export const nameShortest = 2;
export const nameLongest = 40;
export const percentLowest = 1;
export const percentHighest = 99;
export const hoursDefault = 24;
export const hoursLongest = 7 * 24;

const serviceNames: Record<Service, string> = { qbittorrent: "qBittorrent", jellyfin: "Jellyfin" };
const fieldOf: Record<Kind, string> = { "download-finished": "name", "disk-free-below": "percent", "service-answering": "service" };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWhole(value: unknown, lowest: number, highest: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= lowest && value <= highest;
}

export function readAsked(body: unknown): Asked | { refused: string } {
  if (!isObject(body)) return { refused: "Send a JSON object with a kind" };
  const kind = kinds.find((known) => known === body.kind);
  if (kind === undefined) return { refused: `kind must be one of ${kinds.join(", ")}` };
  const field = fieldOf[kind];
  if (Object.keys(body).some((key) => key !== "kind" && key !== "hours" && key !== field)) return { refused: `A ${kind} watcher takes only kind, ${field} and hours` };
  if (body.hours !== undefined && !isWhole(body.hours, 1, hoursLongest)) return { refused: `hours must be a whole number from 1 to ${hoursLongest}` };
  const hours = body.hours === undefined ? hoursDefault : body.hours;
  if (kind === "download-finished") {
    const name = body.name;
    if (typeof name !== "string" || name.length < nameShortest || !isPlain(name, nameLongest) || name.includes("  ")) return { refused: `name must be ${nameShortest} to ${nameLongest} characters of letters, digits, single spaces and ' - . , ( ) & / + : _, with no space at either end` };
    if (couldBeSecret(name)) return { refused: "name was refused because it could be a key or token" };
    return { watch: { kind, name }, hours };
  }
  if (kind === "disk-free-below") {
    if (!isWhole(body.percent, percentLowest, percentHighest)) return { refused: `percent must be a whole number from ${percentLowest} to ${percentHighest}` };
    return { watch: { kind, percent: body.percent }, hours };
  }
  const service = services.find((known) => known === body.service);
  if (service === undefined) return { refused: `service must be one of ${services.join(", ")}` };
  return { watch: { kind, service }, hours };
}

export function sameWatch(a: WatchFor, b: WatchFor): boolean {
  if (a.kind === "download-finished" && b.kind === "download-finished") return a.name.toLowerCase() === b.name.toLowerCase();
  if (a.kind === "disk-free-below" && b.kind === "disk-free-below") return a.percent === b.percent;
  if (a.kind === "service-answering" && b.kind === "service-answering") return a.service === b.service;
  return false;
}

export function describe(watch: WatchFor): string {
  if (watch.kind === "download-finished") return `a download matching "${watch.name}" to finish`;
  if (watch.kind === "disk-free-below") return `free disk space to fall below ${watch.percent}%`;
  return `${serviceNames[watch.service]} to answer`;
}

export function sourceOf(watch: WatchFor): string {
  if (watch.kind === "download-finished") return "qBittorrent";
  if (watch.kind === "disk-free-below") return "the disk";
  return serviceNames[watch.service];
}

export function freePercent(disk: Disk): number | null {
  return disk.totalGB > 0 ? (disk.freeGB / disk.totalGB) * 100 : null;
}

export function happened(watch: WatchFor, createdAt: number, readings: Readings): boolean | null {
  if (watch.kind === "download-finished") {
    if (readings.finished === undefined) return null;
    const fragment = watch.name.toLowerCase();
    const since = Math.floor(createdAt / 1000) * 1000;
    return readings.finished.some((download) => download.completedAt >= since && download.name.toLowerCase().includes(fragment));
  }
  if (watch.kind === "disk-free-below") {
    if (readings.disk === undefined) return null;
    const free = freePercent(readings.disk);
    return free === null ? null : free < watch.percent;
  }
  const answering = readings.answering?.[watch.service];
  return answering === undefined ? null : answering;
}

export function firedNotification(watch: WatchFor, readings: Readings): Notification {
  if (watch.kind === "download-finished") return { title: "Home Hub: download finished", message: `A download matching "${watch.name}" has finished.`, tags: "bell" };
  if (watch.kind === "disk-free-below") {
    const disk = readings.disk ?? { freeGB: 0, totalGB: 0 };
    const free = Math.floor(freePercent(disk) ?? 0);
    return { title: `Home Hub: free disk space below ${watch.percent}%`, message: `Free disk space is down to ${disk.freeGB} of ${disk.totalGB} GB (${free}%), below the ${watch.percent}% you asked about.`, tags: "bell" };
  }
  const name = serviceNames[watch.service];
  return { title: `Home Hub: ${name} is answering`, message: `${name} answered the hub's check.`, tags: "bell" };
}

export function expiredNotification(watch: WatchFor, hours: number, unread: boolean): Notification {
  const span = hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`;
  const lastCheck = unread ? ` The last check couldn't read ${sourceOf(watch)}.` : "";
  return { title: "Home Hub: stopped watching", message: `Stopped watching for ${describe(watch)}: it didn't happen within ${span}.${lastCheck}`, tags: "hourglass", priority: 2 };
}
