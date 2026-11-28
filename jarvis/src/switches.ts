import type { Config } from "./config.js";
import { hubApiUrl } from "./hub-tools.js";
import { wallOffWhy } from "./wall.js";

export const switchesEveryMs = 5 * 60_000;
export const switchesTimeoutMs = 5_000;

export type Switches = Record<string, string>;
export type SwitchesSend = (switches: Switches, signal: AbortSignal) => Promise<void>;
export type SwitchesTeller = { close(): void };

const onOff = (on: boolean): string => (on ? "on" : "off");

export function switchesOf(config: Config): Switches {
  return {
    JARVIS_HUB_TOOLS: onOff(config.hubToken !== null),
    JARVIS_HUB_ACTIONS: onOff(config.hubActions),
    JARVIS_SESSION_NOTES: onOff(config.sessionNotes),
    JARVIS_VOICE: config.voice,
    JARVIS_SPEECH_BUNDLE: onOff(config.speechBundle),
    JARVIS_SPOKEN_STYLE: onOff(config.spokenStyle),
    JARVIS_PERSONA: onOff(config.persona !== null),
    JARVIS_LIVE_FACTS: onOff(config.liveFacts),
    JARVIS_FILLER: onOff(config.filler),
    JARVIS_EARS: config.ears,
    JARVIS_FOLLOW_UP: onOff(config.followUp !== null),
    JARVIS_TURN_CHECK: onOff(config.turnCheck),
    JARVIS_TRAIN_ALERTS: onOff(config.trainAlerts),
    JARVIS_BRAIN_QUESTIONS: onOff(config.brainQuestions),
    JARVIS_CLOCK: onOff(config.clock),
    JARVIS_INTRO: onOff(config.intro),
    JARVIS_GUEST: onOff(config.guest),
    JARVIS_MODES: onOff(config.modes),
    JARVIS_REMINDERS: onOff(config.reminders),
    JARVIS_MORNING: onOff(config.morning),
    JARVIS_VOICES: onOff(config.voices),
    JARVIS_SESSIONS: onOff(config.sessions),
    JARVIS_DIGEST: onOff(config.digest),
    JARVIS_PHONE: onOff(config.phone),
    JARVIS_WALL: onOff(config.wall),
    JARVIS_PROJECTOR: onOff(config.projector),
    JARVIS_WALL_PAGES: config.wallPages,
    JARVIS_WEB: config.web,
    JARVIS_WEB_LOG: onOff(config.webLog),
    JARVIS_LOG: onOff(config.log),
  };
}

export function switchesToHub(token: string, url = hubApiUrl): SwitchesSend {
  return async (switches, signal) => {
    const response = await fetch(`${url}/wall/jarvis/switches`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ switches }), redirect: "error", signal });
    await response.body?.cancel().catch(() => {});
    if (response.status === 404) throw new Error(wallOffWhy);
    if (response.status === 401) throw new Error("the hub refused his token");
    if (response.status === 400) throw new Error("the hub didn't take the list, so the API may be older than Jarvis");
    if (response.status !== 200) throw new Error(`the hub answered ${response.status}`);
  };
}

export function tellSwitches(options: { send: SwitchesSend; switches: Switches; note: (line: string) => void; everyMs?: number; timeoutMs?: number }): SwitchesTeller {
  const every = options.everyMs ?? switchesEveryMs;
  const closing = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failing: string | null = null;
  const once = async () => {
    try {
      await options.send(options.switches, AbortSignal.any([closing.signal, AbortSignal.timeout(options.timeoutMs ?? switchesTimeoutMs)]));
      if (failing !== null && failing !== wallOffWhy) options.note("told the hub his switches again, for the switches page");
      failing = null;
    } catch (error) {
      if (closing.signal.aborted) return;
      const why = error instanceof Error && error.name !== "TimeoutError" ? error.message : "the hub didn't answer in time";
      const minutes = Math.max(1, Math.round(every / 60_000));
      if (why !== failing && why !== wallOffWhy) options.note(`couldn't tell the hub his switches for the switches page: ${why}; trying again every ${minutes === 1 ? "minute" : `${minutes} minutes`}`);
      failing = why;
    }
    if (!closing.signal.aborted) timer = setTimeout(() => void once(), every);
  };
  void once();
  return {
    close() {
      closing.abort();
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
