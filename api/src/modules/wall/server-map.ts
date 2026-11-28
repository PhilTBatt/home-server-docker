import type { DoctorReport } from "../system/doctor.js";

export const mapEffects = ["plain", "gate", "spokes", "grid", "radar", "wobble", "sound", "listen", "type", "screen", "star", "fall", "scan", "orbit", "heart", "bars", "external"] as const;
export const mapGroups = ["front", "network", "media", "jarvis", "watching", "outside"] as const;
export const mapStates = ["ok", "warn", "problem", "off", "unchecked"] as const;

export type MapEffect = (typeof mapEffects)[number];
export type MapGroup = (typeof mapGroups)[number];
export type MapState = (typeof mapStates)[number];
export type MapSide = "left" | "right" | "above" | "below";
export type MapNodeSpec = { id: string; group: MapGroup; x: number; y: number; size: number; fx: MapEffect; side: MapSide; note?: string; check?: string; answering?: true };
export type MapNode = { id: string; group: MapGroup; x: number; y: number; size: number; fx: MapEffect; side: MapSide; note: string; state: MapState };
export type MapLink = { from: string; to: string; packets: boolean; outside: boolean };
export type MapChip = { text: string; tone: "good" | "warn" | "warm" | "plain" };
export type ServerMap = { kind: "server"; host: string; nodes: MapNode[]; links: MapLink[]; chips: MapChip[]; watched: number };

export const serverNodes: readonly MapNodeSpec[] = [
  { id: "caddy", group: "front", x: 512, y: 376, size: 11, fx: "gate", side: "left", answering: true },
  { id: "api", group: "front", x: 640, y: 264, size: 16, fx: "spokes", side: "right", answering: true },
  { id: "homepage", group: "front", x: 528, y: 496, size: 11, fx: "grid", side: "right" },
  { id: "mcp", group: "front", x: 716, y: 216, size: 8, fx: "plain", side: "right", note: "runs when used" },
  { id: "adguard", group: "network", x: 424, y: 496, size: 11, fx: "radar", side: "left" },
  { id: "tailscale", group: "network", x: 352, y: 616, size: 8, fx: "plain", side: "right", note: "on the host" },
  { id: "jarvis", group: "jarvis", x: 848, y: 352, size: 19, fx: "wobble", side: "left" },
  { id: "kokoro", group: "jarvis", x: 976, y: 280, size: 32, fx: "sound", side: "right" },
  { id: "piper", group: "jarvis", x: 1032, y: 384, size: 14, fx: "plain", side: "right", note: "instead of Kokoro" },
  { id: "ears", group: "jarvis", x: 936, y: 456, size: 21, fx: "listen", side: "left" },
  { id: "whisper", group: "jarvis", x: 1040, y: 504, size: 22, fx: "type", side: "right" },
  { id: "openwakeword", group: "jarvis", x: 872, y: 528, size: 10, fx: "star", side: "below" },
  { id: "jellyfin", group: "media", x: 344, y: 200, size: 19, fx: "screen", side: "right", check: "Jellyfin" },
  { id: "seerr", group: "media", x: 208, y: 176, size: 10, fx: "star", side: "left" },
  { id: "qbittorrent", group: "media", x: 416, y: 296, size: 13, fx: "fall", side: "right", check: "qBittorrent" },
  { id: "sonarr", group: "media", x: 184, y: 280, size: 14, fx: "scan", side: "left" },
  { id: "radarr", group: "media", x: 304, y: 328, size: 14, fx: "scan", side: "right" },
  { id: "prowlarr", group: "media", x: 160, y: 400, size: 13, fx: "orbit", side: "left" },
  { id: "byparr", group: "media", x: 264, y: 472, size: 10, fx: "plain", side: "right" },
  { id: "kuma", group: "watching", x: 672, y: 592, size: 11, fx: "heart", side: "below" },
  { id: "beszel", group: "watching", x: 768, y: 616, size: 10, fx: "bars", side: "below" },
  { id: "beszel-agent", group: "watching", x: 848, y: 640, size: 6, fx: "plain", side: "right" },
  { id: "rail data", group: "outside", x: 448, y: 96, size: 13, fx: "external", side: "above", check: "Train times" },
  { id: "eBay", group: "outside", x: 576, y: 88, size: 13, fx: "external", side: "above", check: "Deal watcher" },
  { id: "Healthchecks.io", group: "outside", x: 704, y: 84, size: 13, fx: "external", side: "above", check: "Heartbeat" },
  { id: "ntfy.sh", group: "outside", x: 824, y: 92, size: 13, fx: "external", side: "above", check: "Phone alerts" },
  { id: "Spotify", group: "outside", x: 936, y: 112, size: 13, fx: "external", side: "above" },
  { id: "GitHub", group: "outside", x: 1048, y: 140, size: 13, fx: "external", side: "right" },
  { id: "Claude", group: "outside", x: 1160, y: 216, size: 13, fx: "external", side: "below" },
];

export const serverLinks: readonly MapLink[] = (
  [
    ["caddy", "api", true], ["caddy", "homepage"], ["caddy", "jellyfin"], ["caddy", "seerr"], ["caddy", "kuma"], ["caddy", "beszel"], ["caddy", "adguard"],
    ["api", "qbittorrent", true], ["api", "jellyfin"], ["mcp", "api"],
    ["api", "rail data"], ["api", "eBay"], ["api", "Healthchecks.io"], ["api", "ntfy.sh", true], ["api", "Spotify"], ["api", "GitHub"],
    ["jarvis", "api", true], ["jarvis", "kokoro", true], ["jarvis", "piper"], ["jarvis", "ears"], ["ears", "whisper", true], ["ears", "openwakeword"], ["jarvis", "Claude", true],
    ["seerr", "sonarr"], ["seerr", "radarr"], ["sonarr", "prowlarr"], ["radarr", "prowlarr"], ["prowlarr", "byparr"], ["sonarr", "qbittorrent"], ["radarr", "qbittorrent"],
    ["beszel-agent", "beszel"], ["tailscale", "adguard"],
  ] as const
).map(([from, to, packets]) => ({ from, to, packets: packets === true, outside: serverNodes.find((node) => node.id === to)?.group === "outside" || serverNodes.find((node) => node.id === from)?.group === "outside" }));

const mostChip = 90;

function chipText(text: string): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > mostChip ? `${flat.slice(0, mostChip - 1)}…` : flat;
}

function toneOf(state: string): MapChip["tone"] {
  return state === "ok" ? "good" : state === "warn" ? "warn" : state === "problem" ? "warm" : "plain";
}

export function serverMapPage(report: DoctorReport | null): ServerMap {
  const checks = new Map((report?.checks ?? []).map((check) => [check.name, check]));
  const nodes = serverNodes.map((spec): MapNode => {
    const check = spec.check === undefined ? undefined : checks.get(spec.check);
    const state: MapState = spec.answering === true ? "ok" : check === undefined ? "unchecked" : check.state;
    return { id: spec.id, group: spec.group, x: spec.x, y: spec.y, size: spec.size, fx: spec.fx, side: spec.side, note: spec.note ?? "", state };
  });
  const chips: MapChip[] = [];
  if (report === null) chips.push({ text: "Couldn't run the server check just now", tone: "warm" });
  else {
    chips.push({ text: chipText(report.summary), tone: toneOf(report.state) });
    for (const name of ["Memory", "Disk", "Backups"]) {
      const check = checks.get(name);
      if (check !== undefined && check.state !== "off") chips.push({ text: chipText(`${name}: ${check.detail}`), tone: check.state === "ok" ? "plain" : toneOf(check.state) });
    }
  }
  return { kind: "server", host: "home-server", nodes, links: serverLinks.map((link) => ({ ...link })), chips, watched: nodes.filter((node) => node.state !== "unchecked" && node.state !== "off").length };
}
