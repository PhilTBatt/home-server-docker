import { beep, joinSound, silence } from "./beep.js";
import { readVolume } from "./config.js";
import type { Player } from "./player.js";
import { volumeControl, type SoundCard } from "./sound-card.js";

export const testRate = 24_000;

export function testSound(rate = testRate): Uint8Array {
  return joinSound([beep(rate, 660, 150), silence(rate, 80), beep(rate, 880, 220)]);
}

export function cardLine(card: SoundCard): string {
  return `Sound card ${card.number}: its speakers (${card.speakers}) and mixer (${card.mixer}) were passed in, and no microphone`;
}

export function volumeLine(volume: number): string {
  return volume === 0 ? `${volumeControl} set to 0% and muted` : `${volumeControl} set to ${volume}%`;
}

export type SoundTestParts = {
  env: Record<string, string | undefined>;
  findCard: () => Promise<SoundCard>;
  setVolume: (card: number, volume: number) => Promise<void>;
  startPlayer: (options: { device: string; rate: number }) => Player;
  write: (text: string) => void;
};

export async function runSoundTest(parts: SoundTestParts): Promise<void> {
  const volume = readVolume(parts.env);
  const card = await parts.findCard();
  parts.write(`${cardLine(card)}\n`);
  await parts.setVolume(card.number, volume);
  parts.write(`${volumeLine(volume)}\n`);
  parts.write(`Playing two beeps at ${testRate} Hz on ${card.device}...\n`);
  const player = parts.startPlayer({ device: card.device, rate: testRate });
  try {
    await player.write(testSound());
    await player.finish();
  } catch (error) {
    player.stop();
    throw error;
  }
  parts.write(volume === 0 ? "Done. The volume is 0, so they were silent.\n" : "Done. You should have heard two short beeps, low then high.\n");
}
