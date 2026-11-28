import type { Check, DoctorReport } from "../system/doctor.js";
import type { Status } from "../system/alerts.js";
import { serverNodes, type MapState } from "./server-map.js";

export const healthGroups = [
  { id: "front", title: "Front door", note: "and the network", from: ["front", "network"] },
  { id: "media", title: "Media", note: "films and shows", from: ["media"] },
  { id: "watching", title: "Watching", note: "keeps an eye out", from: ["watching"] },
  { id: "jarvis", title: "Jarvis", note: "his services", from: ["jarvis"] },
] as const;
export const shownElsewhere = ["Disk", "Memory", "Backups", "Heartbeat", "qBittorrent", "Jellyfin"];
export const mostLine = 50;
export const mostOthers = 12;

export type HealthTile = { id: string; state: MapState; line: string; note: string };
export type HealthGroup = { id: string; title: string; note: string; tiles: HealthTile[] };
export type HealthCard = { id: "kuma" | "heartbeat" | "backups"; title: string; state: MapState; value: string; note: string };
export type HealthOther = { name: string; state: MapState };
export type Use = { used: number; total: number };
export type HealthPage = { kind: "health"; state: "ok" | "warn" | "problem" | "unknown"; headline: string; unchecked: number; groups: HealthGroup[]; cards: HealthCard[]; others: HealthOther[]; memory: Use | null; disk: Use | null; memoryState: MapState; diskState: MapState; upSeconds: number | null; beat: boolean };

function cut(text: string, most: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > most ? `${flat.slice(0, most - 1)}…` : flat;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function headlineOf(report: DoctorReport | null): { state: HealthPage["state"]; headline: string } {
  if (report === null) return { state: "unknown", headline: "Couldn't run the server check" };
  const problems = report.checks.filter((check) => check.state === "problem").length;
  const looks = report.checks.filter((check) => check.state === "warn").length;
  if (problems > 0) return { state: "problem", headline: plural(problems, "problem", "problems") };
  if (looks > 0) return { state: "warn", headline: plural(looks, "thing to look at", "things to look at") };
  return { state: "ok", headline: "Everything's healthy" };
}

function cardFrom(id: "heartbeat" | "backups", title: string, check: Check | undefined, ran: boolean, words: Record<Check["state"], string>): HealthCard {
  if (check === undefined) return { id, title, state: "unchecked", value: "Not checked", note: ran ? "The server check didn't include it" : "The server check couldn't be run" };
  return { id, title, state: check.state, value: words[check.state], note: cut(check.detail, 70) };
}

export function healthPage(report: DoctorReport | null, status: Status | null): HealthPage {
  const checks = new Map((report?.checks ?? []).map((check) => [check.name, check]));
  const tileOf = (id: string): HealthTile => {
    const spec = serverNodes.find((node) => node.id === id);
    const note = spec?.note ?? "";
    if (spec?.answering === true) return { id, state: "ok", line: "Answering", note };
    const check = spec?.check === undefined ? undefined : checks.get(spec.check);
    if (check === undefined) return { id, state: "unchecked", line: "Not checked", note };
    if (check.state === "off") return { id, state: "off", line: "Switched off", note };
    return { id, state: check.state, line: cut(check.detail, mostLine), note };
  };
  const groups = healthGroups.map((group) => ({
    id: group.id,
    title: group.title,
    note: group.note,
    tiles: serverNodes.filter((node) => (group.from as readonly string[]).includes(node.group) && node.id !== "tailscale").map((node) => tileOf(node.id)),
  }));
  const cards: HealthCard[] = [
    { id: "kuma", title: "Uptime Kuma", state: "unchecked", value: "Not read by the hub", note: "Its own page, uptime.home, has every monitor" },
    cardFrom("heartbeat", "Heartbeat", checks.get("Heartbeat"), report !== null, { ok: "Pinging", warn: "Waiting", problem: "Failed", off: "Switched off" }),
    cardFrom("backups", "Backups", checks.get("Backups"), report !== null, { ok: "OK", warn: "Needs a look", problem: "Failed", off: "None yet" }),
  ];
  const others = (report?.checks ?? []).filter((check) => !shownElsewhere.includes(check.name)).slice(0, mostOthers).map((check) => ({ name: cut(check.name, 24), state: check.state }));
  const use = (total: number, available: number): Use | null => (Number.isFinite(total) && Number.isFinite(available) && total > 0 && available >= 0 && available <= total ? { used: total - available, total } : null);
  return {
    kind: "health",
    ...headlineOf(report),
    unchecked: groups.reduce((sum, group) => sum + group.tiles.filter((tile) => tile.state === "unchecked").length, 0),
    groups,
    cards,
    others,
    memory: status === null ? null : use(status.memoryTotalMB, status.memoryAvailableMB),
    disk: status === null ? null : use(status.diskTotalGB, status.diskAvailableGB),
    memoryState: checks.get("Memory")?.state ?? "unchecked",
    diskState: checks.get("Disk")?.state ?? "unchecked",
    upSeconds: status === null || !Number.isFinite(status.uptimeSeconds) || status.uptimeSeconds < 0 ? null : status.uptimeSeconds,
    beat: checks.get("Heartbeat")?.state === "ok",
  };
}
