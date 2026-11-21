import assert from "node:assert/strict";
import { test } from "node:test";
import type { Speaker } from "./answer-speech.js";
import { chimeFor, chimeMs, chimeSound, playChime } from "./chime.js";
import type { Player } from "./player.js";
import type { SpeechEngine } from "./speech.js";

function fakeSpeaker(rate: number, fail = false) {
  const played: { device: string; rate: number; bytes: number; finished: boolean; stopped: boolean }[] = [];
  let ended: () => void = () => {};
  const engine: SpeechEngine = { name: "Fake", sampleRate: rate, splitsSentences: false, speak: async function* () {}, check: async () => {} };
  const speaker: Speaker = {
    engine,
    device: "plughw:1,0",
    startPlayer(options) {
      const record = { ...options, bytes: 0, finished: false, stopped: false };
      played.push(record);
      const player: Player = {
        write: async (sound) => {
          if (fail) throw new Error("aplay: device busy");
          record.bytes += sound.length;
        },
        finish: async () => {
          record.finished = true;
        },
        stop: () => void (record.stopped = true),
        ended: new Promise<void>((resolve) => (ended = resolve)),
      };
      return player;
    },
    lastPlayer: { ended: Promise.resolve() },
  };
  return { speaker, played, end: () => ended() };
}

test("the chime is two rising notes with a short gap, 250 ms in all, at whatever rate the voice plays", () => {
  assert.equal(chimeMs, 3000);
  assert.equal(chimeSound(16_000).length, 16_000 * 0.25 * 2);
  assert.equal(chimeSound(24_000).length, 24_000 * 0.25 * 2);
  assert.equal(chimeSound(22_050).length, (Math.round(22_050 * 0.09) + Math.round(22_050 * 0.02) + Math.round(22_050 * 0.14)) * 2);
  const view = new DataView(chimeSound(16_000).buffer);
  const gap = Array.from({ length: 320 }, (_, index) => view.getInt16((1440 + index) * 2, true));
  assert.ok(gap.every((sample) => sample === 0));
  const loudest = Math.max(...Array.from({ length: 4000 }, (_, index) => Math.abs(view.getInt16(index * 2, true))));
  assert.ok(loudest > 9000 && loudest <= 32767 * 0.3 + 1, String(loudest));
});

test("the chime plays on the voice's card at the voice's rate, and the next sound waits for its player to end", async () => {
  const { speaker, played, end } = fakeSpeaker(22_050);
  const before = speaker.lastPlayer.ended;
  await playChime(speaker, new AbortController().signal);
  assert.deepEqual(played.map((one) => [one.device, one.rate, one.bytes, one.finished]), [["plughw:1,0", 22_050, chimeSound(22_050).length, true]]);
  assert.notEqual(speaker.lastPlayer.ended, before);
  let over = false;
  void speaker.lastPlayer.ended.then(() => (over = true));
  await Promise.resolve();
  assert.equal(over, false);
  end();
  await speaker.lastPlayer.ended;
});

test("a chime that can't play is let go quietly, since it's only a cue", async () => {
  const { speaker, played } = fakeSpeaker(24_000, true);
  await assert.rejects(playChime(speaker, new AbortController().signal), { message: "aplay: device busy" });
  assert.equal(played[0].stopped, true);
  chimeFor(speaker)();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(played.length, 2);
});

test("a chime that's called off stops its player", async () => {
  const { speaker, played } = fakeSpeaker(24_000);
  const calledOff = new AbortController();
  calledOff.abort();
  await assert.rejects(playChime(speaker, calledOff.signal));
  assert.equal(played.length, 0);
});
