import type { Filler, Speaker } from "./answer-speech.js";
import { beep, joinSound, silence } from "./beep.js";
import { playSound } from "./speech.js";

export const fillerWaitMs = 1_200;
export const fillerCheckMs = 100;
export const fillerLimitMs = 3_000;

export function fillerSound(rate: number): Uint8Array {
  return joinSound([beep(rate, 440, 70), silence(rate, 90), beep(rate, 440, 70)]);
}

export function fillerFor(speaker: Speaker, waitMs = fillerWaitMs, checkMs = fillerCheckMs, limitMs = fillerLimitMs): Filler {
  let watched: Promise<void> | null = null;
  let ended = false;
  const startPlayer = (options: { device: string; rate: number }) => {
    const player = speaker.startPlayer(options);
    speaker.lastPlayer.ended = player.ended ?? Promise.resolve();
    return player;
  };
  return {
    waitMs,
    checkMs,
    quiet() {
      const latest = speaker.lastPlayer.ended;
      if (latest !== watched) {
        watched = latest;
        ended = false;
        const over = () => {
          if (watched === latest) ended = true;
        };
        void latest.then(over, over);
      }
      return ended;
    },
    play: (signal) => playSound(fillerSound(speaker.engine.sampleRate), speaker.device, speaker.engine.sampleRate, startPlayer, AbortSignal.any([signal, AbortSignal.timeout(limitMs)])),
  };
}
