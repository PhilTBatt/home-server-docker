import assert from "node:assert/strict";
import { test } from "node:test";
import { playerGoneMs, playLimitMs, playSpareMs, slowPlayerMessage, speakerParts, speechNotes, startAnswerSpeech, type AnswerSpeechDeps, type Filler } from "./answer-speech.js";
import { killAfterMs, type Player } from "./player.js";
import type { SpeechEngine } from "./speech.js";
import type { SpeechReport } from "./speech-queue.js";
import { spokenOf } from "./wake.js";

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

const quiet: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };

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

test("with bundling on, an answer's first sentence is spoken alone and the sentences waiting behind it are joined, counted one by one", async () => {
  const { speech, made } = setUp({ bundle: true });
  speech.text("Hello there. Yes. Now. Then more. Later on, again. End.");
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["Hello there.", "Yes. Now. Then more.", "Later on, again. End."]);
  assert.equal(speech.report().spoken, 6);
  const apart = setUp();
  apart.speech.text("Hello there. Yes. Now. Then more. Later on, again. End.");
  apart.speech.end();
  await apart.speech.done();
  assert.equal(apart.made.length, 6);
});

test("with bundling and the first clause early, the clause is spoken alone and the next piece can be up to twice its length", async () => {
  const { speech, made } = setUp({ bundle: true, start: "clause" });
  speech.text("Well, that depends on the weather, which");
  await turn();
  speech.text(" is fine today. Yes, and that is good. Ok, then. Done. Bye now.");
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["Well, that depends on the weather", "which is fine today. Yes, and that is good. Ok, then. Done.", "Bye now."]);
  assert.equal(speech.report().spoken, 6);
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

test("requests made before an answer started again still count, each time it starts again, so the engine's work isn't missing from the log", async () => {
  const made: string[] = [];
  const { speech } = setUp({
    bundle: true,
    make: (sentence) => {
      made.push(sentence);
      return made.length <= 2 ? new Promise<Uint8Array>(() => {}) : Promise.resolve(Uint8Array.of(made.length));
    },
  });
  speech.text("First try. Half");
  await turn();
  speech.restart();
  speech.text("Second try. More");
  await turn();
  speech.restart();
  speech.text("Third try. Its end. And more.");
  speech.end();
  await speech.done();
  assert.deepEqual(made, ["First try.", "Second try.", "Third try.", "Its end. And more."]);
  const report = speech.report();
  assert.deepEqual([report.requests, report.requestedSentences, report.spoken, report.stopped], [4, 5, 3, false]);
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
    lastPlayer: { ended: Promise.resolve() },
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
  return { engine, device: "plughw:1,0", startPlayer: () => player, lastPlayer: { ended: Promise.resolve() } };
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

function playersThatEndLate(starts: number[], engine: SpeechEngine) {
  const ends: (() => void)[] = [];
  const speaker = {
    engine,
    device: "plughw:1,0",
    startPlayer: (): Player => {
      starts.push(ends.length + 1);
      let end = () => {};
      const ended = new Promise<void>((resolve) => (end = resolve));
      ends.push(end);
      return { write: async () => {}, finish: () => new Promise<void>(() => {}), stop: () => {}, ended };
    },
    lastPlayer: { ended: Promise.resolve() },
  };
  return { speaker, ends };
}

async function stoppedWhilePlaying(parts: ReturnType<typeof speakerParts>): Promise<void> {
  const stop = new AbortController();
  const playing = parts.play(Uint8Array.of(1, 2), stop.signal);
  await turn();
  stop.abort(new Error("Speech was stopped"));
  await assert.rejects(playing, { message: "Speech was stopped" });
}

test("a stopped player gets up to 3 seconds to end before the next starts, longer than the 2 it gets before being killed", () => {
  assert.equal(playerGoneMs, 3000);
  assert.ok(playerGoneMs > killAfterMs);
});

const timers = () => process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;

async function settled(promise: Promise<unknown>): Promise<string> {
  return Promise.race([promise.then(() => "done", (error: Error) => `failed: ${error.message}`), new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 15))]);
}

test("before the next sound, the speaker waits until the last player has ended, even in the next answer, so two never hold the speakers at once", async () => {
  const starts: number[] = [];
  const { speaker, ends } = playersThatEndLate(starts, stuckSpeaker([]).engine);
  await stoppedWhilePlaying(speakerParts(speaker, () => 60_000));
  const next = speakerParts(speaker, () => 60_000);
  const waiting = next.beforePlay?.(new AbortController().signal) ?? Promise.reject(new Error("no beforePlay"));
  assert.equal(await settled(waiting), "waiting");
  ends[0]();
  assert.equal(await settled(waiting), "done");
  assert.deepEqual(starts, [1]);
});

test("playing itself doesn't wait: the waiting is done before, so it isn't part of a sound's time to play", async () => {
  const starts: number[] = [];
  const { speaker } = playersThatEndLate(starts, stuckSpeaker([]).engine);
  const parts = speakerParts(speaker, () => 60_000);
  await stoppedWhilePlaying(parts);
  await stoppedWhilePlaying(parts);
  assert.deepEqual(starts, [1, 2]);
});

test("a last player that still hasn't ended when its time is up doesn't hold the next one up for ever, and leaves no timer behind", async () => {
  const starts: number[] = [];
  const { speaker } = playersThatEndLate(starts, stuckSpeaker([]).engine);
  const parts = speakerParts(speaker, () => 60_000, 40);
  await stoppedWhilePlaying(parts);
  const before = timers();
  const began = Date.now();
  await parts.beforePlay?.(new AbortController().signal);
  assert.ok(Date.now() - began >= 35, String(Date.now() - began));
  assert.ok(timers() <= before, `${timers()} timers, ${before} before`);
});

test("a stop while waiting for the last player to end comes back at once with the stop's reason, and leaves no timer behind", async () => {
  const starts: number[] = [];
  const { speaker } = playersThatEndLate(starts, stuckSpeaker([]).engine);
  const parts = speakerParts(speaker, () => 60_000);
  await stoppedWhilePlaying(parts);
  const before = timers();
  const stop = new AbortController();
  const waiting = parts.beforePlay?.(stop.signal) ?? Promise.reject(new Error("no beforePlay"));
  await turn();
  const began = Date.now();
  stop.abort(new Error("Speech was stopped"));
  await assert.rejects(waiting, { message: "Speech was stopped" });
  assert.ok(Date.now() - began < 500, String(Date.now() - began));
  assert.ok(timers() <= before, `${timers()} timers, ${before} before`);
  assert.deepEqual(starts, [1]);
});

test("waiting for a last player that has already ended takes no time and leaves no timer running", async () => {
  const starts: number[] = [];
  const { speaker, ends } = playersThatEndLate(starts, stuckSpeaker([]).engine);
  const parts = speakerParts(speaker, () => 60_000);
  await stoppedWhilePlaying(parts);
  ends[0]();
  const before = timers();
  const waiting = parts.beforePlay?.(new AbortController().signal) ?? Promise.reject(new Error("no beforePlay"));
  assert.equal(await Promise.race([waiting.then(() => "done"), turn().then(() => turn()).then(() => "waiting")]), "done");
  assert.ok(timers() <= before, `${timers()} timers, ${before} before`);
});

test("a player that can't say when it has ended counts as ended, so there's nothing to wait for", async () => {
  const steps: string[] = [];
  const parts = speakerParts(stuckSpeaker(steps), () => 60_000);
  await stoppedWhilePlaying(parts);
  const waiting = parts.beforePlay?.(new AbortController().signal) ?? Promise.reject(new Error("no beforePlay"));
  assert.equal(await Promise.race([waiting.then(() => "done"), turn().then(() => turn()).then(() => "waiting")]), "done");
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

test("the setting to skip code is passed on to the sentences", async () => {
  const skipping = setUp({ skipCode: true });
  skipping.speech.text("Run `npm test` to check. Then rest.");
  skipping.speech.end();
  await skipping.speech.done();
  assert.deepEqual(skipping.made, ["Run to check.", "Then rest."]);
  const saying = setUp();
  saying.speech.text("Run `npm test` to check. Then rest.");
  saying.speech.end();
  await saying.speech.done();
  assert.deepEqual(saying.made, ["Run npm test to check.", "Then rest."]);
});

test("the setting to skip code is kept when the answer starts again", async () => {
  const skipping = setUp({ skipCode: true });
  skipping.speech.text("Run `npm test` to check. Then");
  await turn();
  skipping.speech.restart();
  skipping.speech.text("Run `npm start` to begin. Then rest.");
  skipping.speech.end();
  await skipping.speech.done();
  assert.deepEqual(skipping.made.slice(-2), ["Run to begin.", "Then rest."]);
  assert.equal(skipping.made.some((sentence) => sentence.includes("npm")), false);
});

function pretendFiller(waitMs = 1000) {
  const plays: AbortSignal[] = [];
  const state = { quiet: true, asked: 0 };
  let release = () => {};
  const filler: Filler = {
    waitMs,
    checkMs: 2,
    quiet: () => {
      state.asked++;
      return state.quiet;
    },
    play: (signal) => {
      plays.push(signal);
      return new Promise<void>((resolve) => (release = resolve));
    },
  };
  const until = async (done: () => boolean) => {
    const by = Date.now() + 3000;
    while (!done()) {
      if (Date.now() > by) throw new Error("waited too long");
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  };
  const ticks = (count = 3) => {
    const from = state.asked;
    return until(() => state.asked >= from + count);
  };
  return { filler, plays, state, release: () => release(), until, ticks };
}

const checks = () => new Promise((resolve) => setTimeout(resolve, 30));

test("after a tool starts, a filler plays once his speech has been quiet for the filler's wait, and only once however long the tool runs", async () => {
  const { filler, plays, state, release, until, ticks } = pretendFiller();
  const { speech, made, clock } = setUp({ filler });
  speech.text("Let me look.");
  speech.tool();
  await ticks();
  assert.deepEqual(made, ["Let me look."], "what he said before the tool is spoken first");
  clock.at = 9999;
  await ticks();
  assert.equal(plays.length, 0, "not before the wait is up");
  clock.at = 10_000;
  await until(() => plays.length === 1);
  const asked = state.asked;
  await checks();
  assert.equal(state.asked, asked, "it stops checking once it has played");
  clock.at = 30_000;
  await checks();
  assert.equal(plays.length, 1, "never twice for one tool");
  speech.text("Found it.");
  speech.end();
  release();
  await speech.done();
  assert.deepEqual(made, ["Let me look.", "Found it."]);
  assert.equal(plays[0].aborted, false, "an answer that ends normally lets the filler finish");
});

test("the filler's wait starts when his speech goes quiet, not when the tool starts", async () => {
  const { filler, plays, release, until, ticks } = pretendFiller();
  let made = () => {};
  const { speech, played, clock } = setUp({ filler, make: () => new Promise<Uint8Array>((resolve) => (made = () => resolve(Uint8Array.of(7)))) });
  speech.text("Let me look.");
  speech.tool();
  await checks();
  clock.at = 20_000;
  await checks();
  assert.equal(plays.length, 0, "not while the sentence before the tool is still being made");
  made();
  await ticks();
  assert.deepEqual(played, [[7]]);
  clock.at = 20_999;
  await ticks();
  assert.equal(plays.length, 0);
  clock.at = 21_000;
  await until(() => plays.length === 1);
  speech.stop();
  release();
});

test("words arriving before the wait is up mean the answer is back, so no filler plays, but spaces alone don't", async () => {
  const { filler, plays, ticks } = pretendFiller();
  const { speech, clock } = setUp({ filler });
  speech.tool();
  await ticks();
  clock.at += 500;
  speech.text("Found");
  clock.at += 5000;
  await checks();
  assert.equal(plays.length, 0);
  speech.stop();
  const spaces = pretendFiller();
  const other = setUp({ filler: spaces.filler });
  other.speech.tool();
  await spaces.ticks();
  other.speech.text(" \n ");
  other.clock.at += 1000;
  await spaces.until(() => spaces.plays.length === 1);
  other.speech.stop();
  spaces.release();
});

test("a gap, a restart, the end, a finish or a stop before the wait is up means no filler", async () => {
  for (const action of ["gap", "restart", "end", "finish", "stop"] as const) {
    const { filler, plays, ticks } = pretendFiller();
    const { speech, clock } = setUp({ filler });
    speech.tool();
    await ticks();
    speech[action]();
    clock.at += 5000;
    await checks();
    assert.equal(plays.length, 0, action);
    speech.stop();
  }
});

test("a stop while the filler plays cuts it off", async () => {
  const { filler, plays, release, until, ticks } = pretendFiller();
  const { speech, clock } = setUp({ filler });
  speech.tool();
  await ticks();
  clock.at += 1000;
  await until(() => plays.length === 1);
  assert.equal(plays[0].aborted, false);
  speech.stop();
  assert.equal(plays[0].aborted, true);
  release();
});

test("each tool gets one chance: one that starts before the last one's filler played starts the wait again, and one after it can have its own", async () => {
  const { filler, plays, release, until, ticks } = pretendFiller();
  const { speech, clock } = setUp({ filler });
  speech.tool();
  await ticks();
  clock.at = 9600;
  speech.tool();
  await ticks();
  clock.at = 10_500;
  await ticks();
  assert.equal(plays.length, 0);
  clock.at = 10_600;
  await until(() => plays.length === 1);
  release();
  speech.tool();
  await ticks();
  clock.at = 11_600;
  await until(() => plays.length === 2);
  speech.stop();
  release();
});

test("no filler plays while another sound is still playing or the last answer is still being spoken, and the wait starts once both are done", async () => {
  const { filler, plays, state, release, until, ticks } = pretendFiller();
  const { speech, clock } = setUp({ filler });
  speech.tool();
  await ticks();
  clock.at += 500;
  state.quiet = false;
  await ticks();
  clock.at += 5000;
  await ticks();
  assert.equal(plays.length, 0);
  state.quiet = true;
  await ticks();
  assert.equal(plays.length, 0, "a sound in between starts the wait again");
  clock.at += 1000;
  await until(() => plays.length === 1);
  speech.stop();
  release();
  const behind = pretendFiller();
  let finished = () => {};
  const after = new Promise<void>((resolve) => (finished = resolve));
  const later = setUp({ filler: behind.filler, after });
  later.speech.tool();
  await checks();
  later.clock.at += 5000;
  await checks();
  assert.equal(behind.plays.length, 0);
  assert.equal(behind.state.asked, 0, "not even asked while the last answer is being spoken");
  finished();
  await behind.ticks();
  later.clock.at += 1000;
  await behind.until(() => behind.plays.length === 1);
  later.speech.stop();
  behind.release();
});

test("without a filler, or once the answer has ended, a tool only hands over what was held back", async () => {
  const { speech, made } = setUp();
  speech.text("Let me look");
  speech.tool();
  await turn();
  assert.deepEqual(made, ["Let me look"]);
  speech.end();
  await speech.done();
  const { filler, plays, state } = pretendFiller();
  const ended = setUp({ filler });
  ended.speech.end();
  ended.speech.tool();
  await checks();
  ended.clock.at += 5000;
  await checks();
  assert.equal(plays.length, 0);
  assert.equal(state.asked, 0);
});

test("once his speech has been given up, as after two sentences that couldn't be made, no filler plays, since the wake word is no longer held", async () => {
  const { filler, plays, state } = pretendFiller();
  const failing = setUp({ filler, make: async () => Promise.reject(new Error("Kokoro timed out")) });
  failing.speech.text("One. Two. Three.");
  failing.speech.tool();
  await failing.speech.done();
  assert.equal(failing.speech.report().gaveUp, true);
  failing.speech.tool();
  await checks();
  failing.clock.at += 5000;
  await checks();
  assert.equal(plays.length, 0);
  assert.equal(state.asked, 0);
  const later = pretendFiller();
  let fail = (_error: Error) => {};
  const giving = setUp({ filler: later.filler, make: (sentence) => (sentence === "Fine." ? Promise.resolve(Uint8Array.of(1)) : new Promise<Uint8Array>((_resolve, reject) => (fail = reject))) });
  giving.speech.text("Fine.");
  giving.speech.tool();
  await later.ticks();
  giving.speech.text("One. Two.");
  giving.speech.tool();
  await checks();
  assert.equal(later.plays.length, 0);
  fail(new Error("Kokoro timed out"));
  await turn();
  fail(new Error("Kokoro timed out"));
  await giving.speech.done();
  const asked = later.state.asked;
  giving.clock.at += 5000;
  await checks();
  assert.equal(later.plays.length, 0, "a wait already under way is called off too");
  assert.ok(later.state.asked <= asked + 1);
});

test("done waits for a filler that's playing, and gives the same promise while nothing changes, so the wake word's hold can wait on it", async () => {
  const { filler, release, until, ticks, plays } = pretendFiller();
  const { speech, clock } = setUp({ filler });
  assert.equal(speech.done(), speech.done());
  speech.tool();
  await ticks();
  clock.at += 1000;
  await until(() => plays.length === 1);
  speech.end();
  const done = speech.done();
  assert.equal(speech.done(), done);
  const spoken = spokenOf(speech)();
  let over = false;
  void spoken.then(() => (over = true));
  await checks();
  assert.equal(over, false);
  release();
  await spoken;
  await done;
});
