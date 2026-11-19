import assert from "node:assert/strict";
import { test } from "node:test";
import { playLimitMs, playSpareMs, slowPlayerMessage, speakerParts, speechNotes, startAnswerSpeech, type AnswerSpeechDeps } from "./answer-speech.js";
import type { Player } from "./player.js";
import type { SpeechEngine } from "./speech.js";
import type { SpeechReport } from "./speech-queue.js";

function setUp(options: Partial<AnswerSpeechDeps> = {}) {
  const made: string[] = [];
  const played: number[][] = [];
  const signals: AbortSignal[] = [];
  const clock = { at: 9000 };
  const speech = startAnswerSpeech({
    make: async (sentence, signal) => {
      made.push(sentence);
      signals.push(signal);
      return Uint8Array.of(made.length);
    },
    play: async (sound) => {
      played.push([...sound]);
    },
    now: () => clock.at,
    start: "sentence",
    ...options,
  });
  return { speech, made, played, signals, clock };
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

const quiet: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, left: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };

test("an answer's text, fed in as it arrives, is spoken a sentence at a time, cleaned up, with the last one said when the answer ends", async () => {
  const { speech, made, played } = setUp();
  speech.text("**Sure.** The disk ");
  speech.text("is half full. See `areas/server.md` ");
  await turn();
  assert.deepEqual(made, ["Sure.", "The disk is half full."]);
  speech.text("for more");
  await turn();
  assert.deepEqual(made, ["Sure.", "The disk is half full."]);
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["Sure.", "The disk is half full.", "See for more"]);
  assert.deepEqual(played, [[1], [2], [3]]);
  assert.equal(speech.report().spoken, 3);
});

test("a gap hands over what was held back at once, and what follows starts a new sentence", async () => {
  const { speech, made } = setUp();
  speech.text("Let me look.");
  await turn();
  assert.deepEqual(made, []);
  speech.gap();
  await turn();
  assert.deepEqual(made, ["Let me look."]);
  speech.text("I read it. It's");
  speech.gap();
  speech.gap();
  speech.text("fine");
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["Let me look.", "I read it.", "It's", "fine"]);
});

test("a gap closes a block of code left open, and with the first-clause setting what follows it can start early again", async () => {
  const code = setUp();
  code.speech.text("Run this:\n```\ndocker ps");
  code.speech.gap();
  code.speech.text("That listed them.");
  code.speech.end();
  await code.speech.done();
  assert.deepEqual(code.made, ["Run this:", "That listed them."]);
  const early = setUp({ start: "clause" });
  early.speech.text("Let me look at the server.");
  early.speech.gap();
  early.speech.text("Well, that depends on the weather, which");
  await turn();
  assert.deepEqual(early.made, ["Let me look at the server.", "Well, that depends on the weather"]);
  early.speech.stop();
});

test("a gap after the end or after stopping does nothing", async () => {
  const ended = setUp();
  ended.speech.text("One.");
  ended.speech.end();
  ended.speech.gap();
  await ended.speech.done();
  assert.deepEqual(ended.made, ["One."]);
  const stopped = setUp();
  stopped.speech.text("Held back");
  stopped.speech.stop();
  stopped.speech.gap();
  await stopped.speech.done();
  assert.deepEqual(stopped.made, []);
});

test("the setting for how an answer's speech starts is passed on, so a first clause can go early", async () => {
  const early = setUp({ start: "clause" });
  early.speech.text("Well, that depends on the weather, which");
  await turn();
  assert.deepEqual(early.made, ["Well, that depends on the weather"]);
  early.speech.stop();
  const whole = setUp({ start: "sentence" });
  whole.speech.text("Well, that depends on the weather, which");
  await turn();
  assert.deepEqual(whole.made, []);
  whole.speech.stop();
});

test("the times are counted from when the answer's speech was set up, which is when the question is sent", async () => {
  const { speech, clock } = setUp();
  clock.at += 1200;
  speech.text("Hello there. ");
  speech.text("More.");
  await turn();
  assert.deepEqual([speech.report().firstSentenceMs, speech.report().firstSoundMadeMs, speech.report().firstSoundMs], [1200, 1200, 1200]);
  speech.stop();
});

test("the queue's limits can be set from here", async () => {
  const { speech, made } = setUp({ limit: 1 });
  speech.text("One. Two. Three.");
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["One."]);
  assert.deepEqual([speech.report().tooLong, speech.report().left], [true, 2]);
});

test("stopping calls off the sound and nothing fed in afterwards is spoken", async () => {
  const stuck = new Promise<Uint8Array>(() => {});
  const { speech, made, signals } = setUp();
  const slow = setUp({ make: (_sentence, signal) => (slow.signals.push(signal), stuck) });
  slow.speech.text("One. Two. ");
  await turn();
  assert.equal(slow.signals[0].aborted, false);
  slow.speech.stop();
  assert.equal(slow.signals[0].aborted, true);
  await slow.speech.done();
  slow.speech.text("Three. Four.");
  slow.speech.end();
  await turn();
  assert.equal(slow.signals.length, 1);
  assert.equal(slow.speech.report().stopped, true);
  speech.stop();
  speech.text("Late. Later.");
  speech.end();
  await speech.done();
  assert.deepEqual([made, signals.length], [[], 0]);
});

test("finishing lets the sentence that's playing end and says so, and nothing fed in afterwards is spoken", async () => {
  let ended = () => {};
  const played: number[][] = [];
  const { speech, made } = setUp({
    play: (sound) => {
      played.push([...sound]);
      return new Promise<void>((resolve) => (ended = resolve));
    },
  });
  speech.text("One. Two. ");
  await turn();
  assert.deepEqual(played, [[1]]);
  assert.equal(speech.finish(), true);
  speech.text("Three. Four.");
  speech.restart();
  speech.end();
  await turn();
  assert.equal(await Promise.race([speech.done().then(() => "done"), turn().then(() => "playing")]), "playing");
  ended();
  await speech.done();
  assert.deepEqual([made, played], [["One."], [[1]]]);
  assert.deepEqual([speech.report().spoken, speech.report().stopped], [1, true]);
  const idle = setUp();
  assert.equal(idle.speech.finish(), false);
  await idle.speech.done();
  assert.equal(idle.speech.report().stopped, true);
});

test("the first sound waits for the last answer's speech, even after starting again", async () => {
  let over = () => {};
  const after = new Promise<void>((resolve) => (over = resolve));
  const { speech, played } = setUp({ after });
  speech.text("One. ");
  speech.restart();
  speech.text("Again. Two.");
  speech.end();
  await turn();
  await turn();
  assert.deepEqual(played, []);
  over();
  await speech.done();
  assert.equal(played.length, 2);
});

test("once the answer has ended, anything more fed in is ignored, and ending twice is harmless", async () => {
  const { speech, made } = setUp();
  speech.text("One.");
  speech.end();
  speech.text(" Two. Three.");
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["One."]);
});

test("when the answer starts again, what was being said is called off, what was held is dropped, and the new text is spoken from the top", async () => {
  const signals: AbortSignal[] = [];
  const made: string[] = [];
  const { speech, clock } = setUp({
    make: (sentence, signal) => {
      made.push(sentence);
      signals.push(signal);
      return made.length === 1 ? new Promise<Uint8Array>(() => {}) : Promise.resolve(Uint8Array.of(made.length));
    },
  });
  speech.text("First try. Half a sent");
  await turn();
  assert.deepEqual(made, ["First try."]);
  const before = speech.done();
  clock.at += 2000;
  speech.restart();
  assert.equal(signals[0].aborted, true);
  await before;
  speech.text("Second try. Its end.");
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["First try.", "Second try.", "Its end."]);
  assert.deepEqual([speech.report().spoken, speech.report().stopped, speech.report().firstSentenceMs], [2, false, 2000]);
});

test("starting again after the end or after stopping does nothing", async () => {
  const { speech, made } = setUp();
  speech.text("One.");
  speech.end();
  const done = speech.done();
  speech.restart();
  assert.equal(speech.done(), done);
  await done;
  assert.deepEqual(made, ["One."]);
  const stopped = setUp();
  stopped.speech.stop();
  const over = stopped.speech.done();
  stopped.speech.restart();
  assert.equal(stopped.speech.done(), over);
});

test("a speaker's parts ask its engine for one sentence at a time and play each sound through a player of its own, on its device at the engine's rate", async () => {
  const asked: string[] = [];
  const steps: string[] = [];
  const players: { device: string; rate: number }[] = [];
  const engine: SpeechEngine = {
    name: "Pretend",
    sampleRate: 22_050,
    splitsSentences: false,
    async *speak(text) {
      for await (const piece of text) {
        asked.push(piece);
        yield Uint8Array.of(1, 2);
        yield Uint8Array.of(3, 4);
      }
    },
    check: async () => {},
  };
  const player: Player = {
    write: async (sound) => {
      steps.push(`write ${[...sound].join(" ")}`);
    },
    finish: async () => {
      steps.push("finish");
    },
    stop: () => {
      steps.push("stop");
    },
  };
  const parts = speakerParts({
    engine,
    device: "plughw:3,0",
    startPlayer: (options) => {
      players.push(options);
      steps.push("start");
      return player;
    },
  });
  const never = new AbortController().signal;
  const sound = await parts.make("Hello there.", never);
  assert.deepEqual([...sound], [1, 2, 3, 4]);
  assert.deepEqual(asked, ["Hello there."]);
  await parts.play(sound, never);
  assert.deepEqual(steps, ["start", "write 1 2 3 4", "finish"]);
  assert.deepEqual(players, [{ device: "plughw:3,0", rate: 22_050 }]);
  const stop = new AbortController();
  stop.abort(new Error("Speech was stopped"));
  await assert.rejects(parts.make("Again.", stop.signal), { message: "Speech was stopped" });
  await assert.rejects(parts.play(sound, stop.signal), { message: "Speech was stopped" });
  assert.deepEqual([asked.length, players.length], [1, 1]);
});

function stuckSpeaker(steps: string[], rate = 24_000) {
  const engine: SpeechEngine = {
    name: "Pretend",
    sampleRate: rate,
    splitsSentences: false,
    async *speak() {
      yield Uint8Array.of(1, 2);
    },
    check: async () => {},
  };
  const player: Player = {
    write: async () => {
      steps.push("write");
    },
    finish: () => new Promise(() => {}),
    stop: () => {
      steps.push("stop");
    },
  };
  return { engine, device: "plughw:1,0", startPlayer: () => player };
}

test("a sentence gets twice its own length to play, plus ten seconds", () => {
  assert.equal(playSpareMs, 10_000);
  assert.equal(playLimitMs(48_000, 24_000), 12_000);
  assert.equal(playLimitMs(48_000, 12_000), 14_000);
  assert.equal(playLimitMs(0, 24_000), 10_000);
  assert.equal(playLimitMs(2, 24_000), 10_001);
});

test("a player that never finishes a sentence is stopped at the limit for that sound, and the reason says so", async () => {
  const steps: string[] = [];
  const asked: number[][] = [];
  const parts = speakerParts(stuckSpeaker(steps, 22_050), (bytes, rate) => {
    asked.push([bytes, rate]);
    return 40;
  });
  const began = Date.now();
  await assert.rejects(parts.play(Uint8Array.of(1, 2, 3, 4, 5, 6), new AbortController().signal), { message: "A sentence's player didn't finish in time, so it was stopped" });
  assert.equal(Date.now() - began >= 30, true);
  assert.deepEqual(asked, [[6, 22_050]]);
  assert.deepEqual(steps.slice(0, 2), ["write", "stop"]);
  assert.equal(slowPlayerMessage, "A sentence's player didn't finish in time, so it was stopped");
});

test("a stop while a sentence is playing reads as the stop, not as a slow player", async () => {
  const steps: string[] = [];
  const parts = speakerParts(stuckSpeaker(steps), () => 60_000);
  const stop = new AbortController();
  const playing = parts.play(Uint8Array.of(1, 2), stop.signal);
  await turn();
  stop.abort(new Error("Speech was stopped"));
  await assert.rejects(playing, { message: "Speech was stopped" });
  assert.deepEqual(steps.slice(0, 2), ["write", "stop"]);
});

test("a player that fails for its own reasons keeps its own reason", async () => {
  const speaker = stuckSpeaker([]);
  const parts = speakerParts({ ...speaker, startPlayer: () => ({ write: async () => {}, finish: () => Promise.reject(new Error("aplay stopped with code 1")), stop: () => {} }) }, () => 60_000);
  await assert.rejects(parts.play(Uint8Array.of(1, 2), new AbortController().signal), { message: "aplay stopped with code 1" });
});

test("the limit used unless told otherwise is the one worked out from the sound", async () => {
  const steps: string[] = [];
  const parts = speakerParts(stuckSpeaker(steps));
  const stop = new AbortController();
  const playing = parts.play(Uint8Array.of(1, 2), stop.signal);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(steps, ["write"]);
  stop.abort(new Error("Speech was stopped"));
  await assert.rejects(playing, { message: "Speech was stopped" });
});

test("an answer that was spoken in full, or that you stopped, has nothing to note", () => {
  assert.deepEqual(speechNotes({ ...quiet, spoken: 3 }), []);
  assert.deepEqual(speechNotes({ ...quiet, spoken: 1, left: 4, stopped: true }), []);
  assert.deepEqual(speechNotes(quiet), []);
});

test("sentences that couldn't be spoken are counted in a note, with the first reason", () => {
  assert.deepEqual(speechNotes({ ...quiet, spoken: 3, failed: 1, problem: "Kokoro took longer than 30 seconds over one piece of speech" }), ["1 sentence of the last answer wasn't spoken: Kokoro took longer than 30 seconds over one piece of speech"]);
  assert.deepEqual(speechNotes({ ...quiet, spoken: 3, failed: 2, problem: "Kokoro replied 500" }), ["2 sentences of the last answer weren't spoken: Kokoro replied 500"]);
  assert.deepEqual(speechNotes({ ...quiet, spoken: 3, failed: 1 }), ["1 sentence of the last answer wasn't spoken"]);
});

test("speech that was given up on says so, and whether any of the answer was heard first", () => {
  const reason = "Couldn't reach Kokoro at http://kokoro:8880 (ECONNREFUSED)";
  assert.deepEqual(speechNotes({ ...quiet, failed: 2, left: 3, problem: reason, gaveUp: true }), [`the last answer wasn't spoken: ${reason}`]);
  assert.deepEqual(speechNotes({ ...quiet, spoken: 2, failed: 2, left: 3, problem: reason, gaveUp: true }), [`the rest of the last answer wasn't spoken: ${reason}`]);
  assert.deepEqual(speechNotes({ ...quiet, spoken: 2, failed: 2, left: 3, problem: reason, gaveUp: true, tooLong: true, stopped: true }), [`the rest of the last answer wasn't spoken: ${reason}`]);
});

test("an answer too long to speak in full says how much is spoken, as well as anything that failed", () => {
  assert.deepEqual(speechNotes({ ...quiet, spoken: 40, left: 5, tooLong: true }), ["only the first 40 sentences of the last answer were spoken"]);
  assert.deepEqual(speechNotes({ ...quiet, spoken: 2, left: 5, tooLong: true }, 2), ["only the first 2 sentences of the last answer were spoken"]);
  assert.deepEqual(speechNotes({ ...quiet, spoken: 39, failed: 1, left: 5, problem: "Kokoro replied 500", tooLong: true }), ["1 sentence of the last answer wasn't spoken: Kokoro replied 500", "only the first 40 sentences of the last answer were spoken"]);
});

test("a reason is tidied and cut short before it goes in a note", () => {
  const [note] = speechNotes({ ...quiet, failed: 1, problem: `bad\u0007 thing\n${"x".repeat(400)}` });
  assert.equal(note.startsWith("1 sentence of the last answer wasn't spoken: bad thing xxx"), true);
  assert.equal(note.length, "1 sentence of the last answer wasn't spoken: ".length + 300);
});
