import assert from "node:assert/strict";
import { test } from "node:test";
import { beep, joinSound, silence } from "./beep.js";
import type { Player } from "./player.js";
import type { SoundCard } from "./sound-card.js";
import { cardLine, runSoundTest, testRate, testSound, volumeLine } from "./sound-test.js";

const card: SoundCard = { number: 1, device: "plughw:1,0", speakers: "pcmC1D0p", mixer: "controlC1" };

type Seen = { steps: string[]; written: Uint8Array[]; output: string; players: { device: string; rate: number }[] };

function parts(options: { env?: Record<string, string | undefined>; findCard?: () => Promise<SoundCard>; setVolume?: () => Promise<void>; write?: () => Promise<void>; finish?: () => Promise<void> } = {}) {
  const seen: Seen = { steps: [], written: [], output: "", players: [] };
  const player: Player = {
    write: async (sound) => {
      seen.steps.push("write");
      seen.written.push(sound);
      await options.write?.();
    },
    finish: async () => {
      seen.steps.push("finish");
      await options.finish?.();
    },
    stop: () => {
      seen.steps.push("stop");
    },
  };
  return {
    seen,
    parts: {
      env: options.env ?? {},
      findCard: async () => {
        seen.steps.push("find");
        return options.findCard ? options.findCard() : card;
      },
      setVolume: async (number: number, volume: number) => {
        seen.steps.push(`volume ${number} ${volume}`);
        await options.setVolume?.();
      },
      startPlayer: (given: { device: string; rate: number }) => {
        seen.steps.push("start");
        seen.players.push(given);
        return player;
      },
      write: (text: string) => {
        seen.output += text;
      },
    },
  };
}

test("the test sound is two beeps, low then high, with a gap, at Kokoro's rate", () => {
  assert.equal(testRate, 24_000);
  assert.deepEqual(testSound(), joinSound([beep(24_000, 660, 150), silence(24_000, 80), beep(24_000, 880, 220)]));
  assert.equal(testSound().length, (3600 + 1920 + 5280) * 2);
  assert.equal(testSound(22_050).length, joinSound([beep(22_050, 660, 150), silence(22_050, 80), beep(22_050, 880, 220)]).length);
});

test("the card line names its speakers and mixer, and says there's no microphone", () => {
  assert.equal(cardLine(card), "Sound card 1: its speakers (pcmC1D0p) and mixer (controlC1) were passed in, and no microphone");
});

test("the volume line says the level, or that it's muted at 0", () => {
  assert.equal(volumeLine(80), "Master set to 80%");
  assert.equal(volumeLine(0), "Master set to 0% and muted");
});

test("it finds the card, sets the volume, then plays the test sound once and finishes", async () => {
  const { seen, parts: given } = parts();
  await runSoundTest(given);
  assert.deepEqual(seen.steps, ["find", "volume 1 80", "start", "write", "finish"]);
  assert.deepEqual(seen.players, [{ device: "plughw:1,0", rate: 24_000 }]);
  assert.deepEqual(seen.written, [testSound()]);
});

test("it says what it found and did, line by line", async () => {
  const { seen, parts: given } = parts();
  await runSoundTest(given);
  assert.equal(
    seen.output,
    [
      "Sound card 1: its speakers (pcmC1D0p) and mixer (controlC1) were passed in, and no microphone",
      "Master set to 80%",
      "Playing two beeps at 24000 Hz on plughw:1,0...",
      "Done. You should have heard two short beeps, low then high.",
      "",
    ].join("\n"),
  );
});

test("the volume and the player use whichever card was found", async () => {
  const { seen, parts: given } = parts({ findCard: async () => ({ number: 3, device: "plughw:3,0", speakers: "pcmC3D0p", mixer: "controlC3" }) });
  await runSoundTest(given);
  assert.deepEqual(seen.steps.slice(0, 2), ["find", "volume 3 80"]);
  assert.deepEqual(seen.players, [{ device: "plughw:3,0", rate: 24_000 }]);
  assert.match(seen.output, /^Sound card 3: its speakers \(pcmC3D0p\) and mixer \(controlC3\)/);
});

test("JARVIS_VOLUME sets the level", async () => {
  const { seen, parts: given } = parts({ env: { JARVIS_VOLUME: "35" } });
  await runSoundTest(given);
  assert.deepEqual(seen.steps.slice(0, 2), ["find", "volume 1 35"]);
  assert.match(seen.output, /^Master set to 35%$/m);
});

test("at volume 0 it still plays, and says the beeps were silent", async () => {
  const { seen, parts: given } = parts({ env: { JARVIS_VOLUME: "0" } });
  await runSoundTest(given);
  assert.deepEqual(seen.steps, ["find", "volume 1 0", "start", "write", "finish"]);
  assert.match(seen.output, /Master set to 0% and muted\n/);
  assert.match(seen.output, /Done\. The volume is 0, so they were silent\.\n$/);
});

test("a bad JARVIS_VOLUME stops it before it touches the sound card", async () => {
  const { seen, parts: given } = parts({ env: { JARVIS_VOLUME: "loud" } });
  await assert.rejects(runSoundTest(given), { message: 'JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "loud"' });
  assert.deepEqual(seen.steps, []);
  assert.equal(seen.output, "");
});

test("no card found stops it before the volume is touched", async () => {
  const { seen, parts: given } = parts({
    findCard: async () => {
      throw new Error("no card");
    },
  });
  await assert.rejects(runSoundTest(given), { message: "no card" });
  assert.deepEqual(seen.steps, ["find"]);
});

test("the volume failing stops it before anything plays", async () => {
  const { seen, parts: given } = parts({
    setVolume: async () => {
      throw new Error("no Master");
    },
  });
  await assert.rejects(runSoundTest(given), { message: "no Master" });
  assert.deepEqual(seen.steps, ["find", "volume 1 80"]);
  assert.doesNotMatch(seen.output, /Playing/);
});

test("the player failing while writing stops it, and the failure comes through", async () => {
  const { seen, parts: given } = parts({
    write: async () => {
      throw new Error("aplay stopped with code 1");
    },
  });
  await assert.rejects(runSoundTest(given), { message: "aplay stopped with code 1" });
  assert.deepEqual(seen.steps, ["find", "volume 1 80", "start", "write", "stop"]);
  assert.doesNotMatch(seen.output, /Done/);
});

test("the player failing as it finishes stops it, and the failure comes through", async () => {
  const { seen, parts: given } = parts({
    finish: async () => {
      throw new Error("aplay stopped with code 1: audio open error");
    },
  });
  await assert.rejects(runSoundTest(given), { message: "aplay stopped with code 1: audio open error" });
  assert.deepEqual(seen.steps, ["find", "volume 1 80", "start", "write", "finish", "stop"]);
  assert.doesNotMatch(seen.output, /Done/);
});
