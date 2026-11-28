import { featureLabels, switchKeys, type Features } from "../../config.js";
import { switchJobOf } from "../chores/chores.js";

export const jarvisSwitchesKeptMs = 15 * 60_000;
export const mostJarvisSwitches = 60;
export const jarvisKeyPattern = /^JARVIS_[A-Z_]{2,30}$/;
export const jarvisValuePattern = /^[a-z]{1,12}$/;

export type SwitchRow = { key: string; label: string; on: boolean; value: string; flip: string | null };
export type SwitchGroup = { id: "hub" | "hand" | "jarvis"; rows: SwitchRow[] };
export type Flipping = "on" | "chores-off" | "off";
export type SwitchboardPage = { kind: "switches"; flipping: Flipping; groups: SwitchGroup[]; jarvisAgeMs: number | null };
export type JarvisSwitchesView = { switches: [string, string][]; ageMs: number };
export type JarvisSwitches = {
  tell(body: unknown, at: number): { count: number; on: number; changed: boolean } | { refused: string };
  view(at: number): JarvisSwitchesView | null;
};
export type ByHand = { dealsAi: boolean; loginGuard: boolean };

export const jarvisSwitchesShape = `Send {"switches": {...}} with at most ${mostJarvisSwitches} of Jarvis's switches, each a JARVIS_ name and a lower-case word like on, off or kokoro`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJarvisSwitches(body: unknown): [string, string][] | null {
  if (!isRecord(body) || Object.keys(body).some((key) => key !== "switches") || !isRecord(body.switches)) return null;
  const pairs = Object.entries(body.switches);
  if (pairs.length > mostJarvisSwitches) return null;
  if (!pairs.every(([key, value]) => jarvisKeyPattern.test(key) && typeof value === "string" && jarvisValuePattern.test(value))) return null;
  return pairs as [string, string][];
}

export function createJarvisSwitches(keptMs = jarvisSwitchesKeptMs): JarvisSwitches {
  let kept: { switches: [string, string][]; at: number } | null = null;
  return {
    tell(body, at) {
      const switches = readJarvisSwitches(body);
      if (switches === null) return { refused: jarvisSwitchesShape };
      const changed = kept === null || JSON.stringify(kept.switches) !== JSON.stringify(switches);
      kept = { switches, at };
      return { count: switches.length, on: switches.filter(([, value]) => value !== "off").length, changed };
    },
    view(at) {
      if (kept === null || at - kept.at > keptMs) return null;
      return { switches: kept.switches, ageMs: Math.max(0, at - kept.at) };
    },
  };
}

export function flippingOf(features: Features): Flipping {
  if (!features.chores) return "chores-off";
  return features.switches ? "on" : "off";
}

function jarvisLabel(key: string): string {
  return key.slice("JARVIS_".length).toLowerCase().replace(/_/g, " ");
}

export function switchboardPage(features: Features, byHand: ByHand, jarvis: JarvisSwitchesView | null): SwitchboardPage {
  const flipping = flippingOf(features);
  const onOff = (on: boolean) => (on ? "on" : "off");
  const hub: SwitchRow[] = (Object.keys(switchKeys) as (keyof Features)[]).map((name) => {
    const key = switchKeys[name];
    const on = features[name] === true;
    return { key, label: featureLabels[name], on, value: onOff(on), flip: flipping === "on" ? switchJobOf(key, !on) : null };
  });
  const hand: SwitchRow[] = [
    { key: "DEALS_AI", label: "AI deal checks", on: byHand.dealsAi, value: onOff(byHand.dealsAi), flip: null },
    { key: "LOGIN_GUARD", label: "login guard", on: byHand.loginGuard, value: onOff(byHand.loginGuard), flip: null },
  ];
  const jarvisRows: SwitchRow[] = (jarvis?.switches ?? []).map(([key, value]) => ({ key, label: jarvisLabel(key), on: value !== "off", value, flip: null }));
  return {
    kind: "switches",
    flipping,
    groups: [
      { id: "hub", rows: hub },
      { id: "hand", rows: hand },
      { id: "jarvis", rows: jarvisRows },
    ],
    jarvisAgeMs: jarvis?.ageMs ?? null,
  };
}
