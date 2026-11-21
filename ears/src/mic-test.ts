import type { Writable } from "node:stream";
import { mostBoostSteps, readMicSettings, readWakeEnd, readWakePause, type MicSettings } from "./config.js";
import { backgroundLevel, frameBytes, frameLevel, frameMs, quietForMs, speakingLevel, speakingTimes } from "./levels.js";
import { applyMicSettings, findMicCard, recorderArgs, recorderCommand, type MicCard, type MicSetters } from "./mic-card.js";
import { bytesPerSecond, startRecording, type Recorder } from "./recorder.js";
import { createDetector, heardSpeech, loadSilero, type SileroStep } from "./silero.js";

export const micTestMs = 10_000;
export const longestWait = 60;
export const skipMs = 300;
export const roomUntilMs = 2_000;
export const quietTimes = 2;
export const soundFollows = "sound follows";

export type MicReport = { ms: number; room: number; line: number; speechMs: number; typical: number; loudest: number; longestPauseMs: number; clipped: number };

export function measuredFrames(sound: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let at = (skipMs / frameMs) * frameBytes; at + frameBytes <= sound.length; at += frameBytes) frames.push(sound.subarray(at, at + frameBytes));
  return frames;
}

export function longestPauseOf(speech: readonly boolean[]): number {
  const heard = speech.flatMap((yes, index) => (yes ? [index] : []));
  let longest = 0;
  for (let index = 1; index < heard.length; index++) longest = Math.max(longest, heard[index] - heard[index - 1] - 1);
  return longest * frameMs;
}

export function measure(sound: Uint8Array): MicReport {
  const whole = sound.length - (sound.length % 2);
  const from = (skipMs / frameMs) * frameBytes;
  const levels = measuredFrames(sound).map(frameLevel);
  const room = backgroundLevel(levels.slice(0, (roomUntilMs - skipMs) / frameMs));
  const line = speakingLevel(room);
  const loud = levels.flatMap((level, index) => (level > line ? [index] : []));
  const spoken = loud.map((index) => levels[index]).sort((a, b) => a - b);
  const view = new DataView(sound.buffer, sound.byteOffset, whole);
  let clipped = 0;
  for (let at = from; at < whole; at += 2) {
    const sample = view.getInt16(at, true);
    if (sample === 32767 || sample === -32768) clipped++;
  }
  return {
    ms: Math.round((whole / bytesPerSecond) * 1000),
    room,
    line,
    speechMs: loud.length * frameMs,
    typical: spoken.length === 0 ? 0 : spoken[Math.floor((spoken.length - 1) / 2)],
    loudest: levels.reduce((most, level) => Math.max(most, level), 0),
    longestPauseMs: longestPauseOf(levels.map((level) => level > line)),
    clipped,
  };
}

export function secondsOf(ms: number): string {
  const value = Math.round(ms / 100) / 10;
  return `${value} second${value === 1 ? "" : "s"}`;
}

export function louder(settings: MicSettings): string {
  if (settings.micLevel === "keep") return "EARS_MIC_LEVEL is keep, so ears leaves the card's level alone: set EARS_MIC_LEVEL=100 in ears/.env and run this again.";
  if (settings.micLevel < 100) return `Raise EARS_MIC_LEVEL in ears/.env from ${settings.micLevel} to 100 and run this again. If that's still not enough, try EARS_MIC_BOOST=1 next.`;
  if (settings.micBoost === "keep") return "EARS_MIC_LEVEL is already 100, so try the boost: set EARS_MIC_BOOST=1 in ears/.env and run this again.";
  if (settings.micBoost < mostBoostSteps) return `EARS_MIC_LEVEL is already 100, so raise the boost a step: set EARS_MIC_BOOST=${settings.micBoost + 1} in ears/.env and run this again. If ${settings.micBoostControl} is already at its top, this microphone is too quiet from there.`;
  return "EARS_MIC_LEVEL and EARS_MIC_BOOST are both as high as they go, so this microphone is too quiet from there.";
}

export const roomAdvice = "Turning the microphone up won't help from there: the line rises with the room, so your voice and the room get louder together. Get closer to the microphone, make the room quieter, or try another microphone.";

function raise(report: MicReport, settings: MicSettings, against: number): string {
  return against < speakingTimes * report.room ? roomAdvice : louder(settings);
}

export function softer(settings: MicSettings): string {
  const knock = "A single knock or cough can clip too, so if that's what it was, just run this again.";
  if (settings.micBoost !== "keep" && settings.micBoost > 0) return `Lower EARS_MIC_BOOST in ears/.env from ${settings.micBoost} to ${settings.micBoost - 1} and run this again. ${knock}`;
  if (settings.micLevel === "keep") return `EARS_MIC_LEVEL is keep, so ears leaves the card's level alone: set EARS_MIC_LEVEL=60 in ears/.env and run this again. ${knock}`;
  return `Lower EARS_MIC_LEVEL in ears/.env from ${settings.micLevel} to ${Math.max(0, settings.micLevel - 10)} and run this again. ${knock}`;
}

export function verdict(report: MicReport, settings: MicSettings): string {
  if (report.speechMs === 0) return `Too quiet: ears wouldn't count this as speech, so a wake-word recording from there would be dropped. ${raise(report, settings, report.loudest - 1)}`;
  if (report.clipped > 0) return `Too loud. ${softer(settings)}`;
  if (report.typical < report.line * quietTimes) return `Quiet: you're above the line, but not by much, so ears may stop a recording while you're still talking. ${raise(report, settings, report.typical / quietTimes)}`;
  return "Clear: your voice is well above the room, so ears can tell when you've finished.";
}

export function describeMic(report: MicReport, settings: MicSettings, pauseMs = quietForMs): string[] {
  const lines = [`The room's background is ${report.room}, so speech is anything above ${report.line}.`];
  if (report.speechMs === 0) lines.push(`Nothing was loud enough to count as speech: the loudest moment was ${report.loudest}.`);
  else {
    lines.push(`You were above that for ${secondsOf(report.speechMs)}, typically at ${report.typical} (${Math.round((report.typical / report.line) * 10) / 10} times the line) and at most ${report.loudest}.`);
    lines.push(`Your longest pause while talking was ${secondsOf(report.longestPauseMs)}. Ears ends a wake-word recording after ${secondsOf(pauseMs)} of quiet${report.longestPauseMs >= pauseMs ? ", so it would have ended one during that pause" : ""}.`);
  }
  lines.push(report.clipped === 0 ? "Nothing clipped." : `${report.clipped} sample${report.clipped === 1 ? "" : "s"} hit the 16-bit limit (clipped), which distorts what Whisper hears.`);
  lines.push(verdict(report, settings));
  return lines;
}

export const markMs = 500;

export function strip(speech: readonly boolean[]): string {
  const per = markMs / frameMs;
  let marks = "";
  for (let at = 0; at < speech.length; at += per) marks += speech.slice(at, at + per).some((yes) => yes) ? "#" : ".";
  return marks;
}

export type DetectorView = { speechMs: number; longestPauseMs: number; speech: boolean[] };

export async function detectorView(sound: Uint8Array, step: SileroStep): Promise<DetectorView> {
  const detector = createDetector(step);
  const speech: boolean[] = [];
  for (const frame of measuredFrames(sound)) speech.push(heardSpeech(await detector.frame(frame)));
  return { speechMs: speech.filter((yes) => yes).length * frameMs, longestPauseMs: longestPauseOf(speech), speech };
}

export function describeDetector(view: DetectorView, report: MicReport, loud: readonly boolean[], pauseMs = quietForMs): string[] {
  const lines =
    view.speechMs === 0
      ? ["The speech detector heard no speech at all, so with EARS_WAKE_END=silero a wake-word recording from there would be dropped."]
      : [`The speech detector heard speech for ${secondsOf(view.speechMs)}, and your longest pause while talking was ${secondsOf(view.longestPauseMs)}${view.longestPauseMs >= pauseMs ? ", so it would have ended a wake-word recording during that pause" : ""}.`];
  return [...lines, `Each mark is half a second, # where each heard you (loudness above ${report.line}):`, `  loudness         ${strip(loud)}`, `  speech detector  ${strip(view.speech)}`];
}

export function readWait(value: string | undefined): number {
  const wait = value?.trim() ?? "";
  if (wait === "") return 0;
  if (/^\d{1,2}$/.test(wait) && Number(wait) <= longestWait) return Number(wait);
  throw new Error(`the wait must be a whole number of seconds from 0 to ${longestWait}, not "${wait}"`);
}

export const busyLine = "The microphone is busy: something else has it open, most likely ears, recording or listening for Hey Jarvis. Mute ears with bash host/ears.sh mute, wait a second, run this again, and unmute it afterwards.";

export function sendSound(out: Writable): (sound: Uint8Array) => Promise<void> {
  return (sound) => new Promise((resolve) => out.write(`${soundFollows}\n`, () => out.write(sound, () => resolve())));
}

export type MicTestDeps = MicSetters & {
  env: Record<string, string | undefined>;
  loadSilero?: () => Promise<SileroStep>;
  say: (line: string) => void;
  send: (sound: Uint8Array) => Promise<void>;
  findCard?: () => Promise<MicCard>;
  recorder?: (card: MicCard) => Recorder;
  sleep?: (ms: number) => Promise<void>;
  limitMs?: number;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runMicTest(deps: MicTestDeps): Promise<number> {
  let settings: MicSettings;
  let wait: number;
  let card: MicCard;
  let level: string;
  let silero: Promise<SileroStep> | null = null;
  let pauseMs: number;
  try {
    settings = readMicSettings(deps.env);
    pauseMs = readWakePause(deps.env.EARS_WAKE_PAUSE);
    wait = readWait(deps.env.EARS_MIC_TEST_WAIT);
    if (readWakeEnd(deps.env.EARS_WAKE_END) === "silero") {
      silero = (deps.loadSilero ?? (() => loadSilero()))();
      silero.catch(() => {});
    }
    card = await (deps.findCard ?? (() => findMicCard()))();
    level = await applyMicSettings(card.number, settings, deps);
  } catch (error) {
    deps.say(`The check didn't start: ${messageOf(error)}.`);
    return 1;
  }
  if (wait > 0) {
    deps.say(`Waiting ${secondsOf(wait * 1000)} so you can get to where you'll talk from.`);
    await (deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(wait * 1000);
  }
  const limitMs = deps.limitMs ?? micTestMs;
  deps.say(`Recording ${secondsOf(limitMs)} from sound card ${card.number}'s microphone (${level}). Stay quiet for the first ${secondsOf(roomUntilMs)}, then talk as you would to Jarvis.`);
  const stopped = await startRecording({ recorder: (deps.recorder ?? ((found) => ({ command: recorderCommand, args: recorderArgs(found) })))(card), limitMs }).ended;
  if (stopped.failed) {
    deps.say(/busy/i.test(stopped.reason) ? busyLine : `The recording didn't work: ${stopped.reason}.`);
    return 1;
  }
  const report = measure(stopped.sound);
  for (const line of describeMic(report, settings, pauseMs)) deps.say(line);
  if (silero !== null) {
    try {
      const view = await detectorView(stopped.sound, await silero);
      const loud = measuredFrames(stopped.sound).map((frame) => frameLevel(frame) > report.line);
      for (const line of describeDetector(view, report, loud, pauseMs)) deps.say(line);
    } catch (error) {
      deps.say(`The speech detector couldn't run: ${messageOf(error)}.`);
    }
  }
  await deps.send(stopped.sound);
  return 0;
}
