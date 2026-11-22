import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { childEnv, shortError } from "./player.js";

export const soundDir = "/dev/snd";
export const volumeControl = "Master";
export const mixerCommand = "amixer";
export const mixerTimeoutMs = 10_000;

export type SoundCard = { number: number; device: string; speakers: string; mixer: string };

export class MicrophonePassedIn extends Error {}

export const soundTestHint = "Start the sound test with bash host/jarvis.sh sound-test";

export type Run = (command: string, args: readonly string[]) => Promise<void>;

function named(names: string[]): string {
  return names.map((name) => shortError(name)).join(", ");
}

export async function findSoundCard(dir = soundDir, list: (dir: string) => Promise<string[]> = (dir) => readdir(dir), hint = soundTestHint): Promise<SoundCard> {
  let names: string[];
  try {
    names = await list(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`No sound devices were passed in, so there's nothing to play on. ${hint}`);
    throw new Error(`Couldn't read ${dir}: ${shortError(error instanceof Error ? error.message : String(error))}`);
  }
  const microphones = names.filter((name) => /^pcmC\d+D\d+c$/.test(name)).sort();
  if (microphones.length > 0) throw new MicrophonePassedIn(`A microphone device was passed in (${named(microphones)}). Jarvis must never have one, so this stops here. Check docker-compose.sound.yaml`);
  const mixers = names
    .map((name) => /^controlC(\d+)$/.exec(name))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
  if (mixers.length === 0) throw new Error("No sound card's mixer was passed in, and the speakers can't be opened without it");
  if (mixers.length > 1) throw new Error(`More than one sound card was passed in (${mixers.map((number) => `controlC${number}`).join(", ")}), so it isn't clear which to use`);
  const number = mixers[0];
  const speakers = `pcmC${number}D0p`;
  if (!names.includes(speakers)) throw new Error(`Sound card ${number}'s mixer was passed in, but not its speakers (${speakers})`);
  return { number, device: `plughw:${number},0`, speakers, mixer: `controlC${number}` };
}

export function volumeArgs(card: number, volume: number): string[] {
  return ["-q", "-c", String(card), "sset", volumeControl, `${volume}%`, volume === 0 ? "mute" : "unmute"];
}

export function runCommand(command: string, args: readonly string[], timeoutMs = mixerTimeoutMs): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, env: childEnv() }, (error, _stdout, stderr) => {
      if (error === null) return resolve();
      const said = shortError(String(stderr));
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return reject(new Error(`${command} isn't installed here. Sound plays from Jarvis's own image, which bash host/jarvis.sh sound-test builds`));
      if (error.killed) return reject(new Error(`${command} took longer than ${timeoutMs / 1000} seconds`));
      reject(new Error(said === "" ? shortError(error.message) : said));
    });
  });
}

export async function setVolume(card: number, volume: number, run: Run = runCommand): Promise<void> {
  if (!Number.isSafeInteger(card) || card < 0) throw new Error(`A sound card's number must be a whole number from 0, not ${card}`);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new Error(`The volume must be a whole number from 0 to 100, not ${volume}`);
  try {
    await run(mixerCommand, volumeArgs(card, volume));
  } catch (error) {
    throw new Error(`Couldn't set ${volumeControl} on sound card ${card}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
