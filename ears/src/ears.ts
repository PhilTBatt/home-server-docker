import type { Microphone } from "./config.js";
import type { Recording, Stopped } from "./recorder.js";
import type { ToText } from "./whisper.js";

export type EarsState = "muted" | "idle" | "recording" | "working" | "failed";

export type LastRecording = { seconds: number; reason: string; text: string | null; textProblem: string | null };

export type EarsView = { state: EarsState; reason: string | null; microphone: Microphone | null; last: LastRecording | null };

export type Refused = { ok: false; error: string };

export type EarsDeps = { microphone: Microphone | null; record: () => Recording; log: (line: string) => void; toText?: ToText; now?: () => number };

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

function problem(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error)).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/ {2,}/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

function orCalledOff<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = () => reject(signal.reason);
    signal.addEventListener("abort", off, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", off));
  });
}

export const mutedBeforeText = "it was muted before it was turned into text";
export const flippedBeforeText = "the switch was flipped before it was turned into text, so a mute may have come and gone";

export function createEars(deps: EarsDeps): Ears {
  let state: EarsState = "muted";
  let reason: string | null = startsMuted;
  let recording: Recording | null = null;
  let last: LastRecording | null = null;
  let ending: Promise<Stopped> | null = null;
  let working: { calledOff: AbortController; done: Promise<void> } | null = null;
  let flippedWhileStopping = false;
  const now = deps.now ?? (() => performance.now());
  const view = (): EarsView => ({ state, reason, microphone: deps.microphone, last: last === null ? null : { ...last } });
  const refuse = (error: string): Refused => ({ ok: false, error });
  const finished = (stopped: Stopped) => {
    last = { seconds: seconds(stopped.ms), reason: stopped.reason, text: null, textProblem: null };
    deps.log(stoppedLine(stopped));
  };
  const toText = (stopped: Stopped): Promise<void> => {
    const turn = deps.toText;
    const heard = last;
    if (turn === undefined || heard === null) {
      state = "idle";
      return Promise.resolve();
    }
    state = "working";
    const calledOff = new AbortController();
    const began = now();
    const done = (async () => {
      try {
        const text = await orCalledOff(turn(stopped.sound, calledOff.signal), calledOff.signal);
        if (calledOff.signal.aborted) return;
        heard.text = text;
        deps.log(`Turned into text in ${seconds(now() - began)} seconds.`);
      } catch (error) {
        if (calledOff.signal.aborted) return;
        heard.textProblem = problem(error);
        deps.log(`Couldn't turn it into text: ${heard.textProblem}.`);
      } finally {
        if (working?.calledOff === calledOff) {
          working = null;
          if (state === "working") state = "idle";
        }
      }
    })();
    working = { calledOff, done };
    return done;
  };
  const dropText = (why: string) => {
    const current = working;
    if (current === null) return Promise.resolve();
    working = null;
    current.calledOff.abort(new Error(why));
    if (last !== null) last.textProblem = why;
    deps.log(`Not turned into text: ${why}.`);
    return current.done;
  };
  const settle = (stopped: Stopped, heard: boolean): Promise<void> => {
    if (state !== "recording" || recording !== null) return Promise.resolve();
    if (stopped.failed) {
      state = "failed";
      reason = stopped.reason;
      return Promise.resolve();
    }
    reason = null;
    if (!heard) {
      state = "idle";
      return Promise.resolve();
    }
    return toText(stopped);
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
      if (state === "working") return refuse("ears is still turning the last recording into text");
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
        void settle(stopped, true);
      });
      return { ok: true, view: view() };
    },
    async stop() {
      const current = recording;
      if (state !== "recording" || current === null) return refuse("ears isn't recording");
      recording = null;
      flippedWhileStopping = false;
      const stopped = await end(current, "asked to stop");
      const heard = !flippedWhileStopping;
      if (!heard && last !== null) {
        last.textProblem = flippedBeforeText;
        deps.log(`Not turned into text: ${flippedBeforeText}.`);
      }
      await settle(stopped, heard);
      return { ok: true, seconds: seconds(stopped.ms), view: view() };
    },
    async mute(why) {
      const current = recording;
      recording = null;
      const was = state;
      state = "muted";
      reason = why;
      if (was !== "muted") deps.log(why === null ? "Muted." : `Muted: ${why}.`);
      const dropped = dropText(mutedBeforeText);
      if (current !== null) await end(current, "muted");
      else if (ending !== null) await ending;
      await dropped;
    },
    async unmute() {
      if (state === "muted" || state === "failed") {
        state = "idle";
        reason = null;
        deps.log("Unmuted.");
        return;
      }
      if (state === "working") {
        state = "idle";
        await dropText(flippedBeforeText);
        return;
      }
      const current = recording;
      if (current === null) {
        flippedWhileStopping = true;
        return;
      }
      recording = null;
      await settle(await end(current, "the switch was flipped while it was recording, so a mute may have come and gone"), false);
    },
  };
}
