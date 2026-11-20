import type { Microphone } from "./config.js";
import type { Recording, Stopped } from "./recorder.js";

export type EarsState = "muted" | "idle" | "recording" | "failed";

export type LastRecording = { seconds: number; reason: string };

export type EarsView = { state: EarsState; reason: string | null; microphone: Microphone | null; last: LastRecording | null };

export type Refused = { ok: false; error: string };

export type EarsDeps = { microphone: Microphone | null; record: () => Recording; log: (line: string) => void };

export type Ears = {
  view(): EarsView;
  start(): { ok: true; view: EarsView } | Refused;
  stop(): Promise<{ ok: true; seconds: number; view: EarsView } | Refused>;
  mute(why: string | null): Promise<void>;
  unmute(): Promise<void>;
};

export const startsMuted = "ears starts muted after every start, and waits to be unmuted";

function seconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

function stoppedLine(stopped: Stopped): string {
  return `Recording ${stopped.failed ? "failed" : "stopped"} after ${seconds(stopped.ms)} seconds: ${stopped.reason}.`;
}

export function createEars(deps: EarsDeps): Ears {
  let state: EarsState = "muted";
  let reason: string | null = startsMuted;
  let recording: Recording | null = null;
  let last: LastRecording | null = null;
  let ending: Promise<Stopped> | null = null;
  const view = (): EarsView => ({ state, reason, microphone: deps.microphone, last });
  const refuse = (error: string): Refused => ({ ok: false, error });
  const finished = (stopped: Stopped) => {
    last = { seconds: seconds(stopped.ms), reason: stopped.reason };
    deps.log(stoppedLine(stopped));
  };
  const settle = (stopped: Stopped) => {
    if (state !== "recording" || recording !== null) return;
    state = stopped.failed ? "failed" : "idle";
    reason = stopped.failed ? stopped.reason : null;
  };
  const end = async (current: Recording, why: string): Promise<Stopped> => {
    const promise = current.stop(why);
    ending = promise;
    const stopped = await promise;
    if (ending === promise) ending = null;
    finished(stopped);
    return stopped;
  };

  return {
    view,
    start() {
      if (state === "muted") return refuse("ears is muted");
      if (state === "failed") return refuse(`ears failed (${reason}), so it records nothing until it's unmuted again`);
      if (state === "recording") return refuse("ears is already recording");
      if (ending !== null) return refuse("ears is still ending the last recording");
      if (deps.microphone === null) return refuse("no microphone is set, so there's nothing to record from");
      let current: Recording;
      try {
        current = deps.record();
      } catch (error) {
        state = "failed";
        reason = `the recorder couldn't start: ${error instanceof Error ? error.message : String(error)}`;
        deps.log(`Recording failed to start: ${reason}.`);
        return refuse(`ears failed (${reason})`);
      }
      recording = current;
      state = "recording";
      reason = null;
      deps.log("Recording started.");
      void current.ended.then((stopped) => {
        if (recording !== current) return;
        recording = null;
        finished(stopped);
        settle(stopped);
      });
      return { ok: true, view: view() };
    },
    async stop() {
      const current = recording;
      if (state !== "recording" || current === null) return refuse("ears isn't recording");
      recording = null;
      const stopped = await end(current, "asked to stop");
      settle(stopped);
      return { ok: true, seconds: seconds(stopped.ms), view: view() };
    },
    async mute(why) {
      const current = recording;
      recording = null;
      const was = state;
      state = "muted";
      reason = why;
      if (was !== "muted") deps.log(why === null ? "Muted." : `Muted: ${why}.`);
      if (current !== null) await end(current, "muted");
      else if (ending !== null) await ending;
    },
    async unmute() {
      if (state === "muted" || state === "failed") {
        state = "idle";
        reason = null;
        deps.log("Unmuted.");
        return;
      }
      const current = recording;
      if (current === null) return;
      recording = null;
      settle(await end(current, "the switch was flipped while it was recording, so a mute may have come and gone"));
    },
  };
}
