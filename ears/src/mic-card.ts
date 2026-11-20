import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { recordingRate } from "./recorder.js";

export const soundDir = "/dev/snd";
export const mixerCommand = "amixer";
export const recorderCommand = "arecord";
export const mixerTimeoutMs = 10_000;

export type MicCard = { number: number; device: string; capture: string; mixer: string };

export type Run = (command: string, args: readonly string[]) => Promise<void>;

export const startHint = "Start ears with bash host/ears.sh start, which passes in the card that EARS_SOUND_CARD names";

export class SpeakersPassedIn extends Error {}

function tidy(text: string): string {
  const line = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/ {2,}/g, " ").trim();
  return line.length > 300 ? `${line.slice(0, 299)}…` : line;
}

export async function findMicCard(dir = soundDir, list: (dir: string) => Promise<string[]> = (dir) => readdir(dir)): Promise<MicCard> {
  let names: string[];
  try {
    names = await list(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`No sound devices were passed in, so there's nothing to record from. ${startHint}`);
    throw new Error(`Couldn't read ${dir}: ${tidy(error instanceof Error ? error.message : String(error))}`);
  }
  const speakers = names.filter((name) => /^pcmC\d+D\d+p$/.test(name)).sort();
  if (speakers.length > 0) throw new SpeakersPassedIn(`A speaker device was passed in (${speakers.map(tidy).join(", ")}). Ears only ever gets a microphone, so this stops here. Check docker-compose.mic.yaml`);
  const mixers = names
    .map((name) => /^controlC(\d+)$/.exec(name))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
  if (mixers.length === 0) throw new Error(`No sound card's mixer was passed in, and its microphone can't be opened without it. ${startHint}`);
  if (mixers.length > 1) throw new Error(`More than one sound card was passed in (${mixers.map((number) => `controlC${number}`).join(", ")}), so it isn't clear which to record from`);
  const number = mixers[0];
  const capture = `pcmC${number}D0c`;
  if (!names.includes(capture)) throw new Error(`Sound card ${number}'s mixer was passed in, but not its microphone (${capture})`);
  return { number, device: `plughw:${number},0`, capture, mixer: `controlC${number}` };
}

export function recorderArgs(card: MicCard): string[] {
  return ["-q", "-D", card.device, "-t", "raw", "-f", "S16_LE", "-r", String(recordingRate), "-c", "1"];
}

export function micLevelArgs(card: number, control: string, level: number): string[] {
  return ["-q", "-c", String(card), "sset", control, `${level}%`, level === 0 ? "nocap" : "cap"];
}

export function runCommand(command: string, args: readonly string[], timeoutMs = mixerTimeoutMs): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" } }, (error, _stdout, stderr) => {
      if (error === null) return resolve();
      const said = tidy(String(stderr));
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(new Error(`${command} isn't installed here. It comes with ears's own image, which bash host/ears.sh start builds`));
      if (error.killed) return reject(new Error(`${command} took longer than ${timeoutMs / 1000} seconds`));
      reject(new Error(said === "" ? tidy(error.message) : said));
    });
  });
}

export async function setMicLevel(card: number, control: string, level: number, run: Run = runCommand): Promise<void> {
  if (!Number.isSafeInteger(card) || card < 0) throw new Error(`A sound card's number must be a whole number from 0, not ${card}`);
  if (!Number.isInteger(level) || level < 0 || level > 100) throw new Error(`The microphone's level must be a whole number from 0 to 100, not ${level}`);
  try {
    await run(mixerCommand, micLevelArgs(card, control, level));
  } catch (error) {
    throw new Error(`Couldn't set ${control} on sound card ${card}: ${error instanceof Error ? error.message : String(error)}. Set EARS_MIC_CONTROL to one of the card's controls, or EARS_MIC_LEVEL=keep to leave its level alone`);
  }
}
