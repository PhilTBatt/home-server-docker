import { readFile } from "node:fs/promises";
import type { BackupState } from "../system/backup.js";
import { clockText, londonNow } from "../trains/alerts.js";
import { backupItem } from "./picture.js";

export const lanPorts = [53, 80, 443, 6881, 8096];
export const serverOnlyPorts = [8090];
export const dockerSocket = ["beszel-agent"];
export const hostNetwork = ["beszel-agent"];
export const privileged: string[] = [];
export const isolatedNetworks = ["speech", "ears"];
export const mostKnocks = 5;

export type Tone = "good" | "warn" | "plain";
export type SecurityRow = { k: string; v: string; tone: Tone };
export type SecurityCard = { id: string; title: string; rows: SecurityRow[]; look: boolean };
export type SecurityRing = { id: string; label: string; tone: Tone };
export type SecurityPage = { kind: "security"; quiet: boolean; wrong: number; look: number; rings: SecurityRing[]; cards: SecurityCard[]; knocks: number };
export type TallyKind = "token" | "login" | "pairing";
export type TallyView = { token: number; login: number; pairing: number; since: string | null };
export type Tally = { add(kind: TallyKind, at: Date): void; view(at: Date): TallyView };
export type SecurityInput = { guard: boolean; wallOn: boolean; tally: TallyView; backup: BackupState | null; bootAt: Date | null; apiAt: Date; now: Date };

export function createTally(startedAt: Date): Tally {
  let day = londonNow(startedAt).day;
  let since: string | null = clockText(londonNow(startedAt).minutes);
  let counts = { token: 0, login: 0, pairing: 0 };
  const roll = (at: Date) => {
    const today = londonNow(at).day;
    if (today === day) return;
    day = today;
    since = null;
    counts = { token: 0, login: 0, pairing: 0 };
  };
  return {
    add(kind, at) {
      roll(at);
      counts[kind]++;
    },
    view(at) {
      roll(at);
      return { ...counts, since };
    },
  };
}

export async function readBootTime(now: Date, path = "/proc/uptime"): Promise<Date | null> {
  const text = await readFile(path, "utf8").catch(() => "");
  const seconds = Number(text.split(" ")[0]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Math.floor((now.getTime() - seconds * 1000) / 60_000) * 60_000);
}

const dayWords = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });

function sinceWords(at: Date, now: Date): string {
  const clock = clockText(londonNow(at).minutes);
  return londonNow(at).day === londonNow(now).day ? `today, ${clock}` : `${dayWords.format(at)}, ${clock}`;
}

function countWords(count: number): string {
  return count === 0 ? "None" : count.toLocaleString("en-GB");
}

export function securityPage(input: SecurityInput): SecurityPage {
  const { guard, wallOn, tally, backup, bootAt, apiAt, now } = input;
  const tokens = tally.token + tally.login;
  const wrong = tokens + tally.pairing;
  const named = (list: string[]) => (list.length === 0 ? "None" : list.join(", "));
  const listTone = (list: string[]): Tone => (list.length === 0 ? "good" : "warn");
  const backupRow = (): SecurityRow => {
    if (backup === null) return { k: "Last backup", v: "Couldn't read it", tone: "plain" };
    const item = backupItem(backup, now);
    if (item.value === "failed") return { k: "Last backup", v: "Failed", tone: "warn" };
    if (item.value === "never") return { k: "Last backup", v: "None yet", tone: "warn" };
    if (item.value === "?") return { k: "Last backup", v: "Couldn't read its time", tone: "plain" };
    return { k: "Last backup", v: `${item.value} · ${item.note}`, tone: "good" };
  };
  const drafts: SecurityCard[] = [
    {
      id: "ways",
      title: "Ways in",
      rows: [
        { k: "From the internet", v: "No ports forwarded", tone: "plain" },
        { k: "From anywhere else", v: "Tailscale only", tone: "plain" },
        { k: "Docker's ports at home", v: lanPorts.join(", "), tone: "plain" },
      ],
      look: false,
    },
    {
      id: "keys",
      title: "Keys",
      rows: [
        { k: "Hub token · everything", v: "Set", tone: "good" },
        { k: "Wall token · reads the wall", v: wallOn ? "Set" : "Wall off", tone: wallOn ? "good" : "plain" },
        { k: "Login guard", v: guard ? "On" : "Off", tone: guard ? "good" : "warn" },
      ],
      look: false,
    },
    {
      id: "risky",
      title: "Risky settings, from the compose file",
      rows: [
        { k: "Docker socket mounted", v: named(dockerSocket), tone: listTone(dockerSocket) },
        { k: "The server's own network", v: named(hostNetwork), tone: listTone(hostNetwork) },
        { k: "Privileged containers", v: named(privileged), tone: listTone(privileged) },
      ],
      look: false,
    },
    {
      id: "secrets",
      title: "Secrets",
      rows: [
        { k: "The .env files", v: "Git ignores them", tone: "good" },
        { k: "Every push", v: "Scanned for secrets", tone: "good" },
        { k: "The repo", v: "Public, so it matters", tone: "plain" },
      ],
      look: false,
    },
    {
      id: "today",
      title: "Today",
      rows: [
        { k: "Wrong tokens tried", v: countWords(tokens), tone: tokens === 0 ? "good" : "warn" },
        { k: "Wrong pairing codes", v: countWords(tally.pairing), tone: tally.pairing === 0 ? "good" : "warn" },
        { k: "Counting since", v: tally.since === null ? "midnight" : `the hub started, ${tally.since}`, tone: "plain" },
      ],
      look: false,
    },
    {
      id: "running",
      title: "Backups and running time",
      rows: [
        backupRow(),
        { k: "Server running since", v: bootAt === null ? "Couldn't read it" : sinceWords(bootAt, now), tone: "plain" },
        { k: "The hub running since", v: sinceWords(apiAt, now), tone: "plain" },
      ],
      look: false,
    },
  ];
  const cards = drafts.map((card) => ({ ...card, look: card.rows.some((row) => row.tone === "warn") }));
  const rings: SecurityRing[] = [
    { id: "internet", label: "Internet: no way in", tone: "plain" },
    { id: "tailscale", label: "Tailscale", tone: "plain" },
    { id: "home", label: "Home network", tone: "plain" },
    { id: "caddy", label: guard ? "Caddy · https" : "Caddy · login guard off", tone: guard ? "good" : "warn" },
    { id: "tokens", label: wrong === 0 ? "Tokens" : `Tokens · ${countWords(wrong)} wrong today`, tone: wrong === 0 ? "good" : "warn" },
    { id: "networks", label: "Separate networks", tone: "good" },
  ];
  return {
    kind: "security",
    quiet: wrong === 0,
    wrong,
    look: cards.reduce((sum, card) => sum + card.rows.filter((row) => row.tone === "warn").length, 0),
    rings,
    cards,
    knocks: Math.min(mostKnocks, wrong),
  };
}
