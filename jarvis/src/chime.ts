import type { Speaker } from "./answer-speech.js";
import { beep, joinSound, silence } from "./beep.js";
import { playSound } from "./speech.js";

export const chimeMs = 3_000;

export function chimeSound(rate: number): Uint8Array {
  return joinSound([beep(rate, 784, 90), silence(rate, 20), beep(rate, 1047, 140)]);
}

export function playChime(speaker: Speaker, signal: AbortSignal): Promise<void> {
  const rate = speaker.engine.sampleRate;
  const startPlayer = (options: { device: string; rate: number }) => {
    const player = speaker.startPlayer(options);
    speaker.lastPlayer.ended = player.ended ?? Promise.resolve();
    return player;
  };
  return playSound(chimeSound(rate), speaker.device, rate, startPlayer, signal);
}

export function chimeFor(speaker: Speaker, ms = chimeMs): () => void {
  return () => void playChime(speaker, AbortSignal.timeout(ms)).catch(() => {});
}
