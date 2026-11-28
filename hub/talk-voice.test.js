// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { onArrival, slotFor, voicePieces, voiceUrl } from "./talk-voice.js";

test("an answer's voice is as many pieces as the hub says, or one whole voice from an older hub, or none", () => {
  assert.equal(voicePieces({ voices: 3, voice: true }), 3);
  assert.equal(voicePieces({ voices: 0, voice: false }), 0);
  assert.equal(voicePieces({ voice: true }), 1);
  assert.equal(voicePieces({ voice: false }), 0);
});

test("each piece is asked for by its place, which an older hub ignores and answers with the whole voice", () => {
  assert.equal(voiceUrl("00000000000000a1", 0), "/api/talk/00000000000000a1/voice?part=0");
  assert.equal(voiceUrl("00000000000000a1", 7), "/api/talk/00000000000000a1/voice?part=7");
});

test("a piece plays straight away when nothing is playing, and straight after the one before when it is", () => {
  assert.deepEqual(slotFor(10, 0, 2), { at: 10, next: 12 });
  assert.deepEqual(slotFor(10, 12, 3), { at: 12, next: 15 });
  assert.deepEqual(slotFor(16, 15, 1), { at: 16, next: 17 }, "a piece that came after the last one ended starts now, not in the past");
});

test("playing it all again from now, as Play again does, starts each piece after the one before, with no gaps and no overlaps", () => {
  let playAt = 5;
  const starts = [2, 1.5, 3].map((duration) => {
    const slot = slotFor(5, playAt, duration);
    playAt = slot.next;
    return slot.at;
  });
  assert.deepEqual(starts, [5, 7, 8.5]);
});

test("the first piece to come starts his voice; later ones play on while it's playing, and are kept otherwise", () => {
  assert.equal(onArrival(false, false), "start");
  assert.equal(onArrival(false, true), "start");
  assert.equal(onArrival(true, true), "play");
  assert.equal(onArrival(true, false), "keep");
});
