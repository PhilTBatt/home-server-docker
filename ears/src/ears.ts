import type { Microphone } from "./config.js";
import type { Ender, SpeechHeard } from "./levels.js";
import type { Recording, Stopped, WordsJudged } from "./recorder.js";
import type { By } from "./tap.js";
import { blocksRecording, describeVoice, type VoiceCheck, type VoiceResult } from "./voice-id.js";
import type { ToText } from "./whisper.js";

export type EarsState = "muted" | "idle" | "recording" | "working" | "failed";

export type LastRecording = { seconds: number; reason: string; text: string | null; textProblem: string | null; ender?: Ender; pauseMs?: number };

export type VoiceGate = { check: VoiceCheck; mode: "observe" | "require"; threshold: number; limitMs?: number };

export type EarsView = { state: EarsState; reason: string | null; microphone: Microphone | null; last: LastRecording | null };

export type Refused = { ok: false; error: string; gone?: true };

export type Current = { id: number; by: By; claimed: boolean };

export type EarsDeps = { microphone: Microphone | null; record: (by: By) => Recording; log: (line: string) => void; toText?: ToText; now?: () => number; changed?: () => void; claimMs?: number; idsAfter?: number; voice?: VoiceGate };

export type Ears = {
  view(): EarsView;
  start(by?: By): { ok: true; view: EarsView; id: number } | Refused;
  stop(id?: number): Promise<{ ok: true; seconds: number; view: EarsView } | Refused>;
  cancel(id?: number): Promise<{ ok: true; seconds: number; view: EarsView } | Refused>;
  mute(why: string | null): Promise<void>;
  unmute(): Promise<void>;
  claim(id: number): { ok: true; view: EarsView } | Refused;
  fail(why: string): void;
  current(): Current | null;
  lastId(): number | null;
  speechHeard(): boolean;
  stopping(): boolean;
};

export const startsMuted = "ears starts muted after every start, and waits to be unmuted";

function seconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

export function secondsText(ms: number): string {
  const value = seconds(ms);
  return `${value} second${value === 1 ? "" : "s"}`;
}

function stoppedLine(stopped: Stopped): string {
  return `Recording ${stopped.failed ? "failed" : "stopped"} after ${secondsText(stopped.ms)}: ${stopped.reason}.`;
}

export function speechLine(speech: SpeechHeard): string {
  return `Speech in it: first heard after ${secondsText(speech.firstMs)}, ${secondsText(speech.speechMs)} of speech, longest pause between words ${secondsText(speech.longestPauseMs)}.`;
}

export function wordsLine(words: WordsJudged): string {
  if (words.looks === 0) return "Your words weren't looked at: it ended before a pause long enough to look.";
  const looks = `${words.looks} look${words.looks === 1 ? "" : "s"}`;
  if (words.verdict === null) return `Your words weren't judged in time (${looks}).`;
  return `Judged by your words: ${words.verdict === "done" ? "finished" : words.verdict === "more" ? "more to come" : "unsure"}, by ${words.by === "chat" ? "a Jarvis chat" : "the rules"} (${looks}).`;
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

function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`it took longer than ${secondsText(ms)}`)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export const mutedBeforeText = "it was muted before it was turned into text";
export const flippedBeforeText = "the switch was flipped before it was turned into text, so a mute may have come and gone";
export const cancelledBeforeText = "it was cancelled before it was turned into text";
export const clearedByMute = "it was cleared by a mute";
export const clearedByCancel = "it was cancelled after it was turned into text, so it was cleared";
export const failedBeforeText = "the microphone failed before it was turned into text";
export const claimMs = 2_000;
export const notTakenWhy = `no Jarvis chat took it within ${claimMs / 1000} seconds`;
export const movedOn = "ears has moved on to a newer recording, so that one is gone";
export const thatOneEnded = "that recording has already ended";
export const notYourVoice = "the voice in it didn't match the voiceprint";
export const voiceNotChecked = "the voice in it couldn't be checked against the voiceprint, and voice ID is required";
export const voiceTooQuiet = "the speech in it was too quiet to check against the voiceprint, and voice ID is required";
export const voiceCheckMs = 10_000;
export const stopListeningWhy = "it heard its spoken code word to stop";
export const stoppedListening = "you said stop listening, so ears muted itself. Unmute it on the server with bash host/ears.sh unmute";

export const fillersBefore = "please|oh|no|actually|thanks|thank you|okay|ok|jarvis";
export const fillersAfter = "please|now|jarvis|thanks|thank you|cheers|then|ok|okay|for now|for a bit|for a while";

export function saysStopListening(text: string): boolean {
  const plain = text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/ {2,}/g, " ").trim();
  const words = plain.replace(/^(?:(?:hey|hi|ok|okay) )?(?:[a-z']*vis )?/, "").replace(new RegExp(`^(?:(?:${fillersBefore}) )+`), "").replace(new RegExp(`(?: (?:${fillersAfter}))+$`), "");
  return words === "stop listening";
}

export function createEars(deps: EarsDeps): Ears {
  let state: EarsState = "muted";
  let reason: string | null = startsMuted;
  let recording: Recording | null = null;
  let last: LastRecording | null = null;
  let ending: Promise<Stopped> | null = null;
  let working: { calledOff: AbortController; done: Promise<void> } | null = null;
  let notHeardWhy: string | null = null;
  let stopping: Promise<{ ok: true; seconds: number; view: EarsView }> | null = null;
  let count = deps.idsAfter ?? 0;
  let underway: Current | null = null;
  let lastId: number | null = null;
  let lastBy: By | null = null;
  let claimTimer: ReturnType<typeof setTimeout> | null = null;
  let muteSelf: (why: string) => Promise<void> = async () => {};
  const ids = new WeakMap<Recording, number>();
  const changed = () => deps.changed?.();
  const now = deps.now ?? (() => performance.now());
  const view = (): EarsView => ({ state, reason, microphone: deps.microphone, last: last === null ? null : { ...last } });
  const refuse = (error: string): Refused => ({ ok: false, error });
  const aimedAt = (): number | null => underway?.id ?? lastId;
  const notThatOne = (id: number | undefined): Refused | null => {
    if (id === undefined || aimedAt() === id) return null;
    return lastId === id ? refuse(thatOneEnded) : { ok: false, error: movedOn, gone: true };
  };
  const finished = (stopped: Stopped, of: Recording) => {
    last = { seconds: seconds(stopped.ms), reason: stopped.reason, text: null, textProblem: null, ...(stopped.ender === undefined ? {} : { ender: stopped.ender }), ...(stopped.pauseMs === undefined ? {} : { pauseMs: stopped.pauseMs }) };
    lastId = ids.get(of) ?? null;
    lastBy = underway === null ? null : underway.by;
    if (underway !== null && underway.id === lastId) underway = null;
    if (claimTimer !== null && underway === null) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
    deps.log(stoppedLine(stopped));
    if (stopped.speech !== undefined) deps.log(speechLine(stopped.speech));
    if (stopped.words !== undefined && stopped.speech !== undefined) deps.log(wordsLine(stopped.words));
    changed();
  };
  const toText = (stopped: Stopped): Promise<void> => {
    const made = stopped.text;
    const turn = deps.toText === undefined || made === undefined ? deps.toText : async () => made;
    const heard = last;
    if (turn === undefined || heard === null) {
      state = "idle";
      return Promise.resolve();
    }
    state = "working";
    changed();
    const calledOff = new AbortController();
    const by = lastBy;
    const done = (async () => {
      try {
        if (deps.voice !== undefined) {
          const gate = deps.voice;
          const judged: VoiceResult | string = await orCalledOff(within(gate.limitMs ?? voiceCheckMs, gate.check(stopped.sound)), calledOff.signal).catch((error: unknown) => problem(error));
          if (calledOff.signal.aborted) return;
          const result = typeof judged === "string" ? null : judged;
          deps.log(result === null ? `Voice: couldn't be checked (${judged}).` : `Voice: ${describeVoice(result, gate.threshold)}`);
          if (blocksRecording(gate.mode, result, by)) {
            heard.textProblem = result === null ? voiceNotChecked : result.verdict === "no speech" ? voiceTooQuiet : notYourVoice;
            deps.log(`Not turned into text: ${heard.textProblem}.`);
            return;
          }
        }
        const began = now();
        const text = await orCalledOff(turn(stopped.sound, calledOff.signal), calledOff.signal);
        if (calledOff.signal.aborted) return;
        deps.log(made === undefined ? `Turned into text in ${secondsText(now() - began)}.` : "Turned into text in 0 seconds: the text made while you paused was used.");
        if (saysStopListening(text)) {
          heard.textProblem = stoppedListening;
          deps.log("Heard its spoken code word to stop, so ears is muting itself.");
          void Promise.resolve().then(() => muteSelf(stopListeningWhy));
          return;
        }
        heard.text = text;
      } catch (error) {
        if (calledOff.signal.aborted) return;
        heard.textProblem = problem(error);
        deps.log(`Couldn't turn it into text: ${heard.textProblem}.`);
      } finally {
        if (working?.calledOff === calledOff) {
          working = null;
          if (state === "working") state = "idle";
        }
        changed();
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
    changed();
    return current.done;
  };
  const settle = (stopped: Stopped, heard: boolean): Promise<void> => {
    if (state !== "recording" || recording !== null) return Promise.resolve();
    if (stopped.failed) {
      state = "failed";
      reason = stopped.reason;
      changed();
      return Promise.resolve();
    }
    reason = null;
    if (!heard) {
      state = "idle";
      changed();
      return Promise.resolve();
    }
    return toText(stopped);
  };
  const end = async (of: Recording, why: string): Promise<Stopped> => {
    const promise = of.stop(why);
    ending = promise;
    const stopped = await promise;
    if (ending === promise) ending = null;
    finished(stopped, of);
    return stopped;
  };
  const drop = async (of: Recording, why: string) => {
    recording = null;
    const stopped = await end(of, why);
    await settle(stopped, false);
    return stopped;
  };

  const ears: Ears = {
    view,
    start(by = "push") {
      if (state === "muted") return refuse("ears is muted");
      if (state === "failed") return refuse(`ears failed (${reason}), so it records nothing until it's unmuted again`);
      if (state === "recording") return refuse("ears is already recording");
      if (state === "working") return refuse("ears is still turning the last recording into text");
      if (ending !== null) return refuse("ears is still ending the last recording");
      if (deps.microphone === null) return refuse("no microphone is set, so there's nothing to record from");
      let started: Recording;
      try {
        started = deps.record(by);
      } catch (error) {
        state = "failed";
        reason = `the recorder couldn't start: ${error instanceof Error ? error.message : String(error)}`;
        deps.log(`Recording failed to start: ${reason}.`);
        changed();
        return refuse(`ears failed (${reason})`);
      }
      count++;
      const id = count;
      ids.set(started, id);
      underway = { id, by, claimed: by !== "wake" && by !== "button" };
      recording = started;
      state = "recording";
      reason = null;
      deps.log(by === "wake" ? "Recording started by the wake word." : by === "follow" ? "Recording started to hear a follow-up." : by === "button" ? "Recording started by the talk button." : "Recording started.");
      if (by === "wake" || by === "button") {
        claimTimer = setTimeout(() => {
          claimTimer = null;
          if (underway?.id === id && !underway.claimed && recording === started) void drop(started, notTakenWhy);
        }, deps.claimMs ?? claimMs);
      }
      void started.ended.then((stopped) => {
        if (recording !== started) return;
        recording = null;
        finished(stopped, started);
        void settle(stopped, stopped.unheard !== true);
      });
      changed();
      return { ok: true, view: view(), id };
    },
    stop(id) {
      const other = notThatOne(id);
      if (other !== null) return Promise.resolve(other);
      const current = recording;
      if (state !== "recording" || current === null) return Promise.resolve(refuse("ears isn't recording"));
      recording = null;
      notHeardWhy = null;
      const run = (async () => {
        const stopped = await end(current, "asked to stop");
        const why = notHeardWhy;
        if (why !== null && last !== null) {
          last.textProblem = why;
          deps.log(`Not turned into text: ${why}.`);
        }
        await settle(stopped, why === null);
        return { ok: true as const, seconds: seconds(stopped.ms), view: view() };
      })();
      stopping = run;
      void run.finally(() => {
        if (stopping === run) stopping = null;
      });
      return run;
    },
    async cancel(id) {
      const other = notThatOne(id);
      if (other !== null) return other;
      if (state === "working") {
        state = "idle";
        await dropText(cancelledBeforeText);
        return { ok: true, seconds: last?.seconds ?? 0, view: view() };
      }
      if (state === "idle" && last !== null && last.text !== null) {
        last.text = null;
        last.textProblem = clearedByCancel;
        deps.log("Cleared the last recording's text, since it was cancelled.");
        changed();
        return { ok: true, seconds: last.seconds, view: view() };
      }
      const current = recording;
      if (state === "recording" && current === null && stopping !== null) {
        notHeardWhy ??= cancelledBeforeText;
        const stopped = await stopping;
        return { ok: true, seconds: stopped.seconds, view: view() };
      }
      if (state !== "recording" || current === null) return refuse("ears isn't recording");
      const stopped = await drop(current, "asked to cancel");
      return { ok: true, seconds: seconds(stopped.ms), view: view() };
    },
    async mute(why) {
      const current = recording;
      recording = null;
      const was = state;
      state = "muted";
      reason = why;
      if (was !== "muted") deps.log(why === null ? "Muted." : `Muted: ${why}.`);
      if (last !== null && last.text !== null) {
        last.text = null;
        last.textProblem = clearedByMute;
        deps.log("Cleared the last recording's text, since it was muted.");
      }
      changed();
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
        changed();
        return;
      }
      if (state === "working") {
        state = "idle";
        await dropText(flippedBeforeText);
        return;
      }
      const current = recording;
      if (current === null) {
        notHeardWhy ??= flippedBeforeText;
        return;
      }
      recording = null;
      await settle(await end(current, "the switch was flipped while it was recording, so a mute may have come and gone"), false);
    },
    claim(id) {
      if (underway === null || underway.id !== id || underway.claimed || recording === null) return refuse("that wake-word recording isn't waiting to be taken");
      underway.claimed = true;
      deps.log(underway.by === "button" ? "A Jarvis chat took the talk-button recording." : "A Jarvis chat took the wake-word recording.");
      changed();
      return { ok: true, view: view() };
    },
    fail(why) {
      if (state === "muted" || state === "failed" || state === "recording") return;
      const was = state;
      state = "failed";
      reason = why;
      deps.log(`The microphone failed: ${why}.`);
      changed();
      if (was === "working") void dropText(failedBeforeText);
    },
    current: () => (underway === null ? null : { ...underway }),
    lastId: () => lastId,
    speechHeard: () => recording?.speechHeard?.() === true,
    stopping: () => state === "recording" && recording === null,
  };
  muteSelf = (why) => ears.mute(why);
  return ears;
}
