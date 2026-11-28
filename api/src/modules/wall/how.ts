import { switchKeys, type Features } from "../../config.js";
import type { JarvisSwitchesView } from "./switchboard.js";

export type PartState = "on" | "off" | "blocked" | "untold";
export type Part = { id: string; state: PartState; value: string | null; blockedBy: string[] };
export type HowPage = { kind: "how"; told: boolean; ageMs: number | null; steps: Part[]; reach: Part[]; words: Part[] };

type Rule = { id: string; when?: [string, readonly string[]]; value?: [string, readonly string[]]; needs?: string[]; hub?: (keyof Features)[] };

const listening = ["push", "wake"] as const;
const voices = ["kokoro", "piper"] as const;
const onOnly = ["on"] as const;
const onOff = ["on", "off"] as const;

export const stepRules: readonly Rule[] = [
  { id: "mic", when: ["JARVIS_EARS", listening], value: ["JARVIS_EARS", listening] },
  { id: "wake", when: ["JARVIS_EARS", ["wake"]] },
  { id: "stop", when: ["JARVIS_EARS", listening], value: ["JARVIS_TURN_CHECK", onOff] },
  { id: "whisper", when: ["JARVIS_EARS", listening] },
  { id: "words", when: ["JARVIS_EARS", listening] },
  { id: "claude", value: ["JARVIS_ENGINE", ["sdk", "api"]] },
  { id: "sentences", when: ["JARVIS_VOICE", voices], value: ["JARVIS_SPEECH_BUNDLE", onOff] },
  { id: "voice", when: ["JARVIS_VOICE", voices], value: ["JARVIS_VOICE", voices] },
  { id: "speakers", when: ["JARVIS_VOICE", voices] },
];

export const reachRules: readonly Rule[] = [
  { id: "tools", when: ["JARVIS_HUB_TOOLS", onOnly], value: ["JARVIS_HUB_ACTIONS", onOff] },
  { id: "brain" },
  { id: "notes", when: ["JARVIS_SESSION_NOTES", onOnly] },
  { id: "lookups", when: ["JARVIS_WEB", ["ask", "auto"]], value: ["JARVIS_WEB", ["ask", "auto"]] },
  { id: "wall", when: ["JARVIS_WALL", onOnly], needs: ["JARVIS_HUB_TOOLS"], hub: ["wall"] },
  { id: "phone", when: ["JARVIS_PHONE", onOnly], needs: ["JARVIS_HUB_TOOLS", "JARVIS_EARS"], hub: ["talk"] },
  { id: "modes", when: ["JARVIS_MODES", onOnly], needs: ["JARVIS_HUB_TOOLS"], hub: ["modes"] },
  { id: "trains", when: ["JARVIS_TRAIN_ALERTS", onOnly], needs: ["JARVIS_HUB_TOOLS"], hub: ["trainAlerts"] },
  { id: "reminders", when: ["JARVIS_REMINDERS", onOnly], needs: ["JARVIS_HUB_TOOLS"], hub: ["reminders"] },
  { id: "morning", when: ["JARVIS_MORNING", onOnly], needs: ["JARVIS_HUB_TOOLS"], hub: ["morning"] },
  { id: "sessions", when: ["JARVIS_SESSIONS", onOnly], needs: ["JARVIS_HUB_TOOLS"], hub: ["sessions"] },
  { id: "opens", when: ["JARVIS_WALL_PAGES", onOnly], needs: ["JARVIS_HUB_TOOLS"], hub: ["wall"] },
];

export const wordRules: readonly Rule[] = [
  { id: "notes", when: ["JARVIS_HUB_TOOLS", onOnly], needs: ["JARVIS_EARS"], hub: ["memoryUpload"] },
  { id: "phone", when: ["JARVIS_HUB_TOOLS", onOnly], needs: ["JARVIS_EARS"], hub: ["findPhone"] },
  { id: "trains", when: ["JARVIS_HUB_TOOLS", onOnly], needs: ["JARVIS_EARS"], hub: ["trains"] },
  { id: "server", when: ["JARVIS_HUB_TOOLS", onOnly], needs: ["JARVIS_EARS"] },
  { id: "clock", when: ["JARVIS_CLOCK", onOnly], needs: ["JARVIS_EARS"] },
  { id: "lookup", when: ["JARVIS_WEB", ["ask", "auto"]], needs: ["JARVIS_EARS"] },
  { id: "projector", when: ["JARVIS_PROJECTOR", onOnly], needs: ["JARVIS_HUB_TOOLS", "JARVIS_EARS"], hub: ["projector"] },
  { id: "pages", when: ["JARVIS_WALL_PAGES", ["words", "on"]], needs: ["JARVIS_HUB_TOOLS", "JARVIS_EARS"], hub: ["wall"] },
  { id: "modes", when: ["JARVIS_MODES", onOnly], needs: ["JARVIS_HUB_TOOLS", "JARVIS_EARS"], hub: ["modes"] },
  { id: "guest", when: ["JARVIS_GUEST", onOnly], needs: ["JARVIS_EARS"] },
];

function partOf(rule: Rule, switches: Map<string, string> | null, features: Features): Part {
  const raw = rule.value === undefined || switches === null ? undefined : switches.get(rule.value[0]);
  const value = raw !== undefined && rule.value !== undefined && rule.value[1].includes(raw) ? raw : null;
  if (rule.when === undefined) return { id: rule.id, state: "on", value, blockedBy: [] };
  if (switches === null) return { id: rule.id, state: "untold", value: null, blockedBy: [] };
  const own = switches.get(rule.when[0]);
  if (own === undefined || !rule.when[1].includes(own)) return { id: rule.id, state: "off", value, blockedBy: [] };
  const blockedBy = [
    ...(rule.needs ?? []).filter((key) => {
      const needed = switches.get(key);
      return needed === undefined || needed === "off";
    }),
    ...(rule.hub ?? []).filter((name) => features[name] !== true).map((name) => switchKeys[name]),
  ];
  return { id: rule.id, state: blockedBy.length > 0 ? "blocked" : "on", value, blockedBy };
}

export function howPage(features: Features, jarvis: JarvisSwitchesView | null): HowPage {
  const switches = jarvis === null ? null : new Map(jarvis.switches);
  const parts = (rules: readonly Rule[]) => rules.map((rule) => partOf(rule, switches, features));
  return { kind: "how", told: jarvis !== null, ageMs: jarvis?.ageMs ?? null, steps: parts(stepRules), reach: parts(reachRules), words: parts(wordRules) };
}
