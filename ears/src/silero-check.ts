import { frameBytes } from "./levels.js";
import { createDetector, sileroThreshold, type SileroStep } from "./silero.js";

export const checkSounds = ["silence", "noise", "a steady tone"] as const;

export function checkSound(name: (typeof checkSounds)[number], seconds = 1): Uint8Array {
  const samples = Math.round(seconds * 16_000);
  const sound = new Uint8Array(samples * 2);
  const view = new DataView(sound.buffer);
  let seed = 7;
  for (let index = 0; index < samples; index++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const value = name === "silence" ? 0 : name === "noise" ? Math.round(((seed / 2147483648) * 2 - 1) * 300) : Math.round(Math.sin((2 * Math.PI * 440 * index) / 16_000) * 3000);
    view.setInt16(index * 2, value, true);
  }
  return sound;
}

export async function sileroCheck(step: SileroStep, say: (line: string) => void): Promise<number> {
  let speechless = true;
  for (const name of checkSounds) {
    const detector = createDetector(step);
    const sound = checkSound(name);
    let highest = 0;
    for (let at = 0; at + frameBytes <= sound.length; at += frameBytes) for (const chance of await detector.frame(sound.subarray(at, at + frameBytes))) highest = Math.max(highest, chance);
    if (highest >= sileroThreshold) speechless = false;
    say(`A second of ${name}: its highest chance of being speech was ${highest.toFixed(2)}.`);
  }
  say(speechless ? `The speech detector loaded and runs, and none of them reached ${sileroThreshold}, where it counts something as speech.` : `The speech detector runs, but took something that isn't speech for speech, which it shouldn't.`);
  return speechless ? 0 : 1;
}
