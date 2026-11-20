import type { Speaker } from "./answer-speech.js";
import { printable } from "./chat.js";
import type { Config, VoiceMode } from "./config.js";
import { createKokoro } from "./kokoro.js";
import { createPiper } from "./piper.js";
import { startPlayer } from "./player.js";
import { findSoundCard, MicrophonePassedIn, setVolume, soundDir, type SoundCard } from "./sound-card.js";
import { volumeLine } from "./sound-test.js";
import { say, type SpeechEngine, type StartPlayer } from "./speech.js";

export const readySentence = "Jarvis is ready when you are.";
export const voiceStartHint = "Start Jarvis with bash host/jarvis.sh, which passes them in";
export const voiceSayMs = 45_000;

export type VoiceParts = {
  engine: SpeechEngine;
  voice: string;
  volume: number;
  findCard: () => Promise<SoundCard>;
  setVolume: (card: number, volume: number) => Promise<void>;
  startPlayer: StartPlayer;
  signal: AbortSignal;
  sayMs?: number;
};

export type Voice = { on: true; line: string; speaker: Speaker } | { on: false; line: string };

export type ChatVoice = { mode: VoiceMode; speaker: Speaker | null };

export function voiceOnLine(engine: string, voice: string, card: SoundCard, volume: number): string {
  return `Voice: ${engine}, voice ${voice}, on sound card ${card.number} (${volumeLine(volume)})`;
}

export function voiceOffLine(reason: string): string {
  return `Voice: off, so this chat is text only. ${reason}`;
}

export function voiceParts(config: Pick<Config, "voice" | "kokoroVoice" | "kokoroSpeed" | "piperVoice" | "volume">, signal: AbortSignal, dir = soundDir): VoiceParts {
  const piper = config.voice === "piper";
  return {
    engine: piper ? createPiper({ voice: config.piperVoice }) : createKokoro({ voice: config.kokoroVoice, speed: config.kokoroSpeed }),
    voice: piper ? config.piperVoice : config.kokoroVoice,
    volume: config.volume,
    findCard: () => findSoundCard(dir, undefined, voiceStartHint),
    setVolume: (card, volume) => setVolume(card, volume),
    startPlayer: (options) => startPlayer(options),
    signal,
  };
}

export async function startVoice(parts: VoiceParts): Promise<Voice> {
  const sayMs = parts.sayMs ?? voiceSayMs;
  let tooLong: AbortSignal | null = null;
  try {
    const card = await parts.findCard();
    await parts.setVolume(card.number, parts.volume);
    await parts.engine.check(parts.signal);
    tooLong = AbortSignal.timeout(sayMs);
    await say(parts.engine, readySentence, card.device, parts.startPlayer, AbortSignal.any([parts.signal, tooLong]));
    return { on: true, line: voiceOnLine(parts.engine.name, parts.voice, card, parts.volume), speaker: { engine: parts.engine, device: card.device, startPlayer: parts.startPlayer } };
  } catch (error) {
    if (error instanceof MicrophonePassedIn || parts.signal.aborted) throw error;
    if (tooLong?.aborted === true) return { on: false, line: voiceOffLine(`His first sentence wasn't said within ${sayMs / 1000} seconds, so it was stopped`) };
    return { on: false, line: voiceOffLine(error instanceof Error ? error.message : String(error)) };
  }
}

export async function voiceFor(config: Pick<Config, "voice" | "kokoroVoice" | "kokoroSpeed" | "piperVoice" | "volume">, signal: AbortSignal, write: (line: string) => void, start: (parts: VoiceParts) => Promise<Voice> = startVoice, dir = soundDir): Promise<ChatVoice> {
  if (config.voice === "off") return { mode: "off", speaker: null };
  const voice = await start(voiceParts(config, signal, dir));
  write(printable(voice.line));
  return voice.on ? { mode: config.voice, speaker: voice.speaker } : { mode: "off", speaker: null };
}
