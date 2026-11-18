import { startPlayer } from "./player.js";
import { findSoundCard, setVolume } from "./sound-card.js";
import { runSoundTest } from "./sound-test.js";

try {
  await runSoundTest({
    env: process.env,
    findCard: () => findSoundCard(),
    setVolume: (card, volume) => setVolume(card, volume),
    startPlayer: (options) => startPlayer(options),
    write: (text) => process.stdout.write(text),
  });
} catch (error) {
  console.error(`The sound test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
