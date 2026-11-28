import { errorOf, hubAsk, reasonOf } from "./code-words.js";
import { hubApiUrl } from "./hub-tools.js";
import { pause } from "./wake.js";

export const hubFeatureNames = ["reminders", "spotify", "talk", "wall", "modes", "trainAlerts"] as const;
export type HubFeature = (typeof hubFeatureNames)[number];
export type HubFeatures = Record<HubFeature, boolean>;
export type FeaturesEvent = { kind: "features note"; line: string };

export const featuresPollMs = 60_000;
export const featuresFirstMs = 3_000;

const spoken: Record<HubFeature, string> = {
  reminders: "the hub's reminders",
  spotify: "Spotify",
  talk: "talking from his phone",
  wall: "the wall's screen",
  modes: "the hub's modes",
  trainAlerts: "the hub's train alerts",
};

export function readHubFeatures(fields: Record<string, unknown>): HubFeatures | null {
  const read: Partial<HubFeatures> = {};
  for (const name of hubFeatureNames) {
    const value = fields[name];
    if (typeof value !== "boolean") return null;
    read[name] = value;
  }
  return read as HubFeatures;
}

export function hubFeaturesReader(token: string, url = hubApiUrl): (signal: AbortSignal) => Promise<HubFeatures> {
  return async (signal) => {
    const { status, fields } = await hubAsk("/system/features", { headers: { Authorization: `Bearer ${token}` } }, signal, url);
    if (status !== 200) throw new Error(`the hub said: ${errorOf(fields, status)}`);
    const features = readHubFeatures(fields);
    if (features === null) throw new Error("the hub's list of switches couldn't be read");
    return features;
  };
}

export function featuresLine(features: HubFeatures | null): string {
  if (features === null) return "hub switches: couldn't be read, so the live facts take the hub's reminders, Spotify, phone, wall, modes and train alerts as on";
  return `hub switches: ${hubFeatureNames.map((name) => `${name} ${features[name] ? "on" : "off"}`).join(", ")}`;
}

export function changedFeatures(before: HubFeatures | null, now: HubFeatures | null, relevant: readonly HubFeature[]): HubFeature[] {
  if (now === null) return [];
  return relevant.filter((name) => (before === null ? true : before[name]) !== now[name]);
}

export function featuresChangeLine(changed: readonly HubFeature[], now: HubFeatures): string | null {
  if (changed.length === 0) return null;
  const said = changed.map((name) => `${spoken[name]} ${now[name] ? "now on" : "now off"}`);
  return `[From your own code: since this chat started, the hub's switches changed: ${said.join(", ")}. Go by this over what your live facts say about them.]`;
}

export function withFactsChange(message: string, line: string | null): string {
  return line === null ? message : `${message}\n\n${line}`;
}

export type FeatureWatch = {
  first(signal: AbortSignal): Promise<void>;
  latest(): HubFeatures | null;
  events: AsyncIterable<FeaturesEvent>;
};

export type FeatureWatchDeps = { read: (signal: AbortSignal) => Promise<HubFeatures>; signal: AbortSignal; pollMs?: number; firstMs?: number; wait?: (ms: number, signal: AbortSignal) => Promise<void> };

export function featuresUnreachableNote(why: string): string {
  return `hub switches: couldn't ask the hub (${why}), so keeping the last ones and trying again every minute`;
}

export function watchHubFeatures(deps: FeatureWatchDeps): FeatureWatch {
  const wait = deps.wait ?? pause;
  let latest: HubFeatures | null = null;
  let failing: string | null = null;
  async function* events(): AsyncGenerator<FeaturesEvent> {
    while (!deps.signal.aborted) {
      await wait(deps.pollMs ?? featuresPollMs, deps.signal).catch(() => {});
      if (deps.signal.aborted) return;
      try {
        const now = await deps.read(deps.signal);
        const changed = changedFeatures(latest, now, hubFeatureNames);
        latest = now;
        if (failing !== null || changed.length > 0) yield { kind: "features note", line: featuresLine(now) };
        failing = null;
      } catch (error) {
        if (deps.signal.aborted) return;
        const why = featuresUnreachableNote(reasonOf(error));
        if (why !== failing) yield { kind: "features note", line: why };
        failing = why;
      }
    }
  }
  return {
    async first(signal) {
      try {
        latest = await deps.read(AbortSignal.any([signal, deps.signal, AbortSignal.timeout(deps.firstMs ?? featuresFirstMs)]));
      } catch {
        latest = null;
      }
    },
    latest: () => latest,
    events: events(),
  };
}

export function relevantFeatures(settings: { guest: boolean; reminders: boolean; hubActions: boolean; musicChanges: boolean; phone: boolean; wall: boolean; modes: boolean; trainAlerts: boolean }): HubFeature[] {
  if (settings.guest) return settings.wall ? ["wall"] : [];
  const wanted: Record<HubFeature, boolean> = {
    reminders: settings.reminders || settings.hubActions,
    spotify: settings.hubActions && settings.musicChanges,
    talk: settings.phone,
    wall: settings.wall,
    modes: settings.modes,
    trainAlerts: settings.trainAlerts,
  };
  return hubFeatureNames.filter((name) => wanted[name]);
}

export function factsTold(written: HubFeatures | null): { line(now: HubFeatures | null, relevant: readonly HubFeature[]): string | null } {
  let told = written;
  return {
    line(now, relevant) {
      if (now === null) return null;
      const changed = changedFeatures(told, now, relevant);
      if (changed.length === 0) return null;
      told = now;
      return featuresChangeLine(changed, now);
    },
  };
}
