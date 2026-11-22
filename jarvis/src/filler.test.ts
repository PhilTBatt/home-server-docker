import assert from "node:assert/strict";
import { test } from "node:test";
import type { Speaker } from "./answer-speech.js";
import { chimeSound } from "./chime.js";
import { fillerCheckMs, fillerFor, fillerLimitMs, fillerSound, fillerWaitMs } from "./filler.js";
import type { Player } from "./player.js";
import type { SpeechEngine } from "./speech.js";

function fakeSpeaker(rate: number, options: { fail?: boolean; stuck?: boolean } = {}) {
  const played: { device: string; rate: number; bytes: number; finished: boolean; stopped: boolean }[] = [];
  let ended: () => void = () => {};
  const engine: SpeechEngine = { name: "Fake", sampleRate: rate, splitsSentences: false, speak: async function* () {}, check: async () => {} };
  const speaker: Speaker = {
    engine,
    device: "plughw:1,0",
    startPlayer(options_) {
      const record = { ...options_, bytes: 0, finished: false, stopped: false };
      played.push(record);
      const player: Player = {
        write: async (sound) => {
          if (options.fail === true) throw new Error("aplay: device busy");
          record.bytes += sound.length;
        },
        finish: () => (options.stuck === true ? new Promise<void>(() => {}) : Promise.resolve().then(() => void (record.finished = true))),
        stop: () => void (record.stopped = true),
        ended: new Promise<void>((resolve) => (ended = resolve)),
      };
      return player;
    },
    lastPlayer: { ended: Promise.resolve() },
  };
  return { speaker, played, end: () => ended() };
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

test("the filler waits 1.2 seconds of quiet, checked every tenth of a second, and is two short low notes, 230 ms in all, unlike the chime", () => {
  assert.deepEqual([fillerWaitMs, fillerCheckMs, fillerLimitMs], [1200, 100, 3000]);
  assert.equal(fillerSound(16_000).length, 16_000 * 0.23 * 2);
  assert.equal(fillerSound(22_050).length, (Math.round(22_050 * 0.07) * 2 + Math.round(22_050 * 0.09)) * 2);
  assert.notDeepEqual(fillerSound(16_000), chimeSound(16_000));
  const view = new DataView(fillerSound(16_000).buffer);
  const gap = Array.from({ length: 1440 }, (_, index) => view.getInt16((1120 + index) * 2, true));
  assert.ok(gap.every((sample) => sample === 0));
  const first = Array.from({ length: 1120 }, (_, index) => view.getInt16(index * 2, true));
  const crossings = first.filter((sample, index) => index > 0 && Math.sign(sample) !== Math.sign(first[index - 1]) && sample !== 0).length;
  assert.ok(crossings >= 55 && crossings <= 65, `about 440 Hz: ${crossings} sign changes in 70 ms`);
});

test("the filler plays on the voice's card at the voice's rate, and the next sound waits for its player to end", async () => {
  const { speaker, played, end } = fakeSpeaker(22_050);
  const filler = fillerFor(speaker);
  assert.deepEqual([filler.waitMs, filler.checkMs], [fillerWaitMs, fillerCheckMs]);
  const before = speaker.lastPlayer.ended;
  await filler.play(new AbortController().signal);
  assert.deepEqual(played.map((one) => [one.device, one.rate, one.bytes, one.finished]), [["plughw:1,0", 22_050, fillerSound(22_050).length, true]]);
  assert.notEqual(speaker.lastPlayer.ended, before);
  end();
  await speaker.lastPlayer.ended;
});

test("the filler counts as quiet only once the last sound's player has ended, whichever sound that was", async () => {
  const { speaker, end } = fakeSpeaker(24_000);
  const filler = fillerFor(speaker, 50, 5);
  assert.deepEqual([filler.waitMs, filler.checkMs], [50, 5]);
  assert.equal(filler.quiet(), false, "not until it has seen the last player end");
  await turn();
  assert.equal(filler.quiet(), true);
  let other = () => {};
  speaker.lastPlayer.ended = new Promise<void>((resolve) => (other = resolve));
  assert.equal(filler.quiet(), false, "a sentence or the chime started since");
  await turn();
  assert.equal(filler.quiet(), false);
  other();
  await turn();
  assert.equal(filler.quiet(), true);
  let older = () => {};
  speaker.lastPlayer.ended = new Promise<void>((resolve) => (older = resolve));
  assert.equal(filler.quiet(), false);
  let newer = () => {};
  speaker.lastPlayer.ended = new Promise<void>((resolve) => (newer = resolve));
  assert.equal(filler.quiet(), false);
  older();
  await turn();
  assert.equal(filler.quiet(), false, "an older player ending doesn't count while a newer one plays");
  newer();
  await turn();
  assert.equal(filler.quiet(), true);
  await filler.play(new AbortController().signal);
  assert.equal(filler.quiet(), false, "nor while its own sound plays");
  end();
  await turn();
  assert.equal(filler.quiet(), true);
});

test("a filler that's called off, can't play or gets stuck stops its player, and is let go", { timeout: 5_000 }, async () => {
  const off = fakeSpeaker(24_000);
  const calledOff = new AbortController();
  calledOff.abort();
  await assert.rejects(fillerFor(off.speaker).play(calledOff.signal));
  assert.equal(off.played.length, 0);
  const busy = fakeSpeaker(24_000, { fail: true });
  await assert.rejects(fillerFor(busy.speaker).play(new AbortController().signal), { message: "aplay: device busy" });
  assert.equal(busy.played[0].stopped, true);
  const stuck = fakeSpeaker(24_000, { stuck: true });
  const began = Date.now();
  await assert.rejects(fillerFor(stuck.speaker, fillerWaitMs, fillerCheckMs, 50).play(new AbortController().signal));
  assert.ok(Date.now() - began < 1000);
  assert.equal(stuck.played[0].stopped, true);
});
