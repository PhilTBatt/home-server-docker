import assert from "node:assert/strict";
import { test } from "node:test";
import { speechAhead, speechFailureLimit, speechSentenceLimit, startSpeechQueue, type SpeechQueueDeps } from "./speech-queue.js";

type Asked<Given, Result> = { given: Given; signal: AbortSignal; resolve: (result: Result) => void; reject: (error: unknown) => void };

function setUp(options: Partial<SpeechQueueDeps> = {}) {
  const makes: Asked<string, Uint8Array>[] = [];
  const plays: Asked<number[], void>[] = [];
  const clock = { at: 5000 };
  const queue = startSpeechQueue({
    make: (given, signal) => new Promise((resolve, reject) => makes.push({ given, signal, resolve, reject })),
    play: (sound, signal) => new Promise((resolve, reject) => plays.push({ given: [...sound], signal, resolve, reject })),
    now: () => clock.at,
    since: 5000,
    ...options,
  });
  return { queue, makes, plays, clock };
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

function orStillWaiting<T>(work: Promise<T>, ms = 2000): Promise<T | "still waiting"> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<"still waiting">((resolve) => {
    timer = setTimeout(() => resolve("still waiting"), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function settled(work: Promise<unknown>): Promise<boolean> {
  return (await Promise.race([work.then(() => true), turn().then(() => false)])) as boolean;
}

const nothing = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, left: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };

test("speech is made two sentences ahead at most, an answer is spoken up to 40 sentences, and two failures in a row end it", () => {
  assert.equal(speechAhead, 2);
  assert.equal(speechSentenceLimit, 40);
  assert.equal(speechFailureLimit, 2);
});

test("sentences are made and played in the order they were added, each with its own sound", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  queue.add("Two.");
  queue.end();
  await turn();
  assert.deepEqual(makes.map((make) => make.given), ["One."]);
  makes[0].resolve(Uint8Array.of(1, 1));
  await turn();
  assert.deepEqual(plays.map((play) => play.given), [[1, 1]]);
  assert.deepEqual(makes.map((make) => make.given), ["One.", "Two."]);
  makes[1].resolve(Uint8Array.of(2, 2));
  await turn();
  assert.equal(plays.length, 1);
  plays[0].resolve();
  await turn();
  assert.deepEqual(plays.map((play) => play.given), [[1, 1], [2, 2]]);
  assert.equal(await settled(queue.done), false);
  plays[1].resolve();
  await queue.done;
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, longestSilenceMs: 0, spoken: 2 });
});

test("only one sentence is being made at a time, and only one sound is playing", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  queue.end();
  await turn();
  assert.equal(makes.length, 1);
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  assert.equal(makes.length, 2);
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  assert.equal(makes.length, 3);
  assert.equal(plays.length, 1);
  makes[2].resolve(Uint8Array.of(3));
  await turn();
  assert.equal(plays.length, 1);
  plays[0].resolve();
  await turn();
  assert.equal(plays.length, 2);
});

test("making runs ahead of playing by two sounds and then waits for room", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three.", "Four.", "Five."]) queue.add(sentence);
  queue.end();
  for (let made = 0; made < 3; made++) {
    await turn();
    makes[made].resolve(Uint8Array.of(made + 1));
  }
  await turn();
  assert.equal(plays.length, 1);
  assert.equal(makes.length, 3);
  plays[0].resolve();
  await turn();
  assert.equal(makes.length, 4);
  assert.deepEqual(makes[3].given, "Four.");
});

test("the room ahead can be set: with room for one, the third sentence isn't made until the first has been played", async () => {
  const { queue, makes, plays } = setUp({ ahead: 1 });
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  assert.equal(makes.length, 2);
  plays[0].resolve();
  await turn();
  assert.equal(makes.length, 3);
});

test("a sentence added later is picked up, and the queue isn't done until it's told no more are coming", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  plays[0].resolve();
  await turn();
  assert.equal(await settled(queue.done), false);
  queue.add("Two.");
  await turn();
  assert.equal(makes.length, 2);
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  plays[1].resolve();
  await turn();
  assert.equal(await settled(queue.done), false);
  queue.end();
  await queue.done;
  assert.equal(queue.report().spoken, 2);
});

test("with nothing to say, ending finishes at once, with nothing made or played", async () => {
  const { queue, makes, plays } = setUp();
  assert.equal(await settled(queue.done), false);
  queue.end();
  await queue.done;
  assert.deepEqual([makes.length, plays.length], [0, 0]);
  assert.deepEqual(queue.report(), nothing);
});

test("the times are counted from when the question was sent: first sentence asked for, its sound back, and that sound handed to the player", async () => {
  const { queue, makes, plays, clock } = setUp();
  clock.at += 700;
  queue.add("One.");
  await turn();
  clock.at += 900;
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 700, firstSoundMadeMs: 1600 });
  clock.at += 400;
  queue.add("Two.");
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  plays[0].resolve();
  await turn();
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 700, firstSoundMadeMs: 1600, firstSoundMs: 1600, spoken: 1 });
});

test("the first sound's time is when it reached the player, which can be later than when it was made", async () => {
  const { queue, makes, plays, clock } = setUp({ failureLimit: 5 });
  queue.add("One.");
  queue.add("Two.");
  await turn();
  makes[0].reject(new Error("Kokoro replied 500"));
  await turn();
  clock.at += 300;
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  assert.equal(plays.length, 1);
  clock.at += 2000;
  plays[0].resolve();
  await turn();
  assert.deepEqual([queue.report().firstSentenceMs, queue.report().firstSoundMadeMs, queue.report().firstSoundMs], [0, 300, 300]);
});

test("a sound that couldn't be played isn't the first sound: the first one that plays is", async () => {
  const { queue, makes, plays, clock } = setUp({ ahead: 5, failureLimit: 5 });
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  queue.end();
  for (let made = 0; made < 3; made++) {
    await turn();
    makes[made].resolve(Uint8Array.of(made + 1));
  }
  await turn();
  clock.at += 100;
  plays[0].reject(new Error("aplay stopped with code 1"));
  await turn();
  assert.equal(queue.report().firstSoundMs, null);
  clock.at += 100;
  plays[1].resolve();
  await turn();
  assert.equal(queue.report().firstSoundMs, 100);
  plays[2].resolve();
  await queue.done;
  assert.deepEqual([queue.report().firstSoundMs, queue.report().spoken, queue.report().failed], [100, 2, 1]);
});

test("when no sound could be played at all, there's no first sound", async () => {
  const { queue, makes, plays } = setUp({ ahead: 5 });
  for (const sentence of ["One.", "Two."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  plays[0].reject(new Error("aplay stopped with code 1"));
  await turn();
  plays[1].reject(new Error("aplay stopped with code 1"));
  await queue.done;
  assert.deepEqual([queue.report().firstSoundMs, queue.report().longestSilenceMs, queue.report().spoken, queue.report().gaveUp], [null, null, 0, true]);
});

test("a sound that was playing when the speech was stopped still counts as the first sound", async () => {
  const { queue, makes, clock } = setUp();
  queue.add("One.");
  await turn();
  clock.at += 250;
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  clock.at += 1000;
  queue.stop();
  await queue.done;
  assert.deepEqual([queue.report().firstSoundMs, queue.report().spoken, queue.report().left, queue.report().stopped], [250, 0, 1, true]);
});

test("the longest silence is the longest wait between one sound finishing and the next one reaching the player", async () => {
  const { queue, makes, plays, clock } = setUp({ ahead: 5, failureLimit: 5 });
  for (const sentence of ["One.", "Two.", "Three.", "Four.", "Five."]) queue.add(sentence);
  for (let made = 0; made < 3; made++) {
    await turn();
    makes[made].resolve(Uint8Array.of(made + 1));
  }
  await turn();
  clock.at += 500;
  plays[0].resolve();
  await turn();
  assert.equal(queue.report().longestSilenceMs, null);
  clock.at += 400;
  plays[1].resolve();
  await turn();
  assert.equal(queue.report().longestSilenceMs, 0);
  clock.at += 400;
  plays[2].reject(new Error("aplay stopped with code 1"));
  await turn();
  clock.at += 300;
  makes[3].resolve(Uint8Array.of(4));
  await turn();
  clock.at += 900;
  plays[3].resolve();
  await turn();
  assert.equal(queue.report().longestSilenceMs, 700);
  clock.at += 100;
  makes[4].resolve(Uint8Array.of(5));
  await turn();
  queue.end();
  plays[4].resolve();
  await queue.done;
  assert.deepEqual([queue.report().longestSilenceMs, queue.report().spoken, queue.report().failed], [700, 4, 1]);
});

test("with one sound, or none, there's no silence to measure", async () => {
  const { queue, makes, plays, clock } = setUp();
  queue.add("One.");
  queue.end();
  await turn();
  clock.at += 500;
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  clock.at += 500;
  plays[0].resolve();
  await queue.done;
  assert.equal(queue.report().longestSilenceMs, null);
});

test("the report handed out is a copy, so nothing outside can change the queue's own", async () => {
  const { queue } = setUp();
  queue.report().spoken = 9;
  assert.equal(queue.report().spoken, 0);
});

test("stopping calls off the sentence being made and the sound being played, drops the rest, and is done at once even if neither ever answers", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three.", "Four.", "Five."]) queue.add(sentence);
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  assert.deepEqual([makes.length, plays.length], [3, 1]);
  assert.deepEqual([makes[2].signal.aborted, plays[0].signal.aborted], [false, false]);
  queue.stop();
  assert.deepEqual([makes[2].signal.aborted, plays[0].signal.aborted], [true, true]);
  assert.equal(await orStillWaiting(queue.done.then(() => "done")), "done");
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, left: 5, stopped: true });
  await turn();
  assert.deepEqual([makes.length, plays.length], [3, 1]);
});

test("stopping before anything was made is done at once too, with no first sound", async () => {
  const { queue, makes } = setUp();
  queue.add("One.");
  await turn();
  queue.stop();
  assert.equal(await orStillWaiting(queue.done.then(() => "done")), "done");
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, left: 1, stopped: true });
  assert.equal(makes[0].signal.aborted, true);
});

test("a sound or a failure that turns up after stopping changes nothing and isn't left unhandled", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  queue.add("Two.");
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  queue.stop();
  await queue.done;
  const before = queue.report();
  makes[1].reject(new Error("Kokoro took longer than 30 seconds over one piece of speech"));
  plays[0].reject(new Error("aplay was stopped by SIGTERM"));
  await turn();
  await turn();
  assert.deepEqual(queue.report(), before);
  assert.equal(plays.length, 1);
});

test("stopping twice, or after everything has been said, does nothing more", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  plays[0].resolve();
  await queue.done;
  queue.stop();
  queue.stop();
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, spoken: 1 });
  assert.equal(plays[0].signal.aborted, false);
  const second = setUp();
  second.queue.add("One.");
  await turn();
  second.queue.stop();
  second.queue.stop();
  await second.queue.done;
  assert.equal(second.queue.report().left, 1);
});

test("nothing added after stopping, or after the end, is taken", async () => {
  const stopped = setUp();
  stopped.queue.stop();
  stopped.queue.add("Late.");
  await stopped.queue.done;
  assert.deepEqual([stopped.makes.length, stopped.queue.report().left], [0, 0]);
  const ended = setUp();
  ended.queue.end();
  ended.queue.add("Late.");
  await ended.queue.done;
  ended.queue.add("Later still.");
  await turn();
  assert.deepEqual([ended.makes.length, ended.queue.report().left], [0, 0]);
});

test("a sentence that can't be made is skipped, its reason kept, and the next one is still spoken", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].reject(new Error("Kokoro took longer than 30 seconds over one piece of speech"));
  await turn();
  makes[2].resolve(Uint8Array.of(3));
  await turn();
  plays[0].resolve();
  await turn();
  assert.deepEqual(plays.map((play) => play.given), [[1], [3]]);
  plays[1].resolve();
  await queue.done;
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, longestSilenceMs: 0, spoken: 2, failed: 1, problem: "Kokoro took longer than 30 seconds over one piece of speech" });
});

test("the first reason is the one kept, and something thrown that isn't an error still gives one", async () => {
  const { queue, makes } = setUp({ failureLimit: 5 });
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].reject("no answer");
  await turn();
  makes[1].reject(new Error("a later reason"));
  await turn();
  makes[2].reject(new Error("the last reason"));
  await queue.done;
  assert.deepEqual([queue.report().failed, queue.report().problem, queue.report().gaveUp], [3, "no answer", false]);
});

test("two sentences in a row that can't be made end the speech: the rest is left, but a sound already made is still played", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three.", "Four.", "Five."]) queue.add(sentence);
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].reject(new Error("Couldn't reach Kokoro at http://kokoro:8880 (ECONNREFUSED)"));
  await turn();
  makes[2].reject(new Error("Couldn't reach Kokoro at http://kokoro:8880 (ECONNREFUSED)"));
  await turn();
  assert.equal(makes.length, 3);
  assert.equal(plays[0].signal.aborted, false);
  queue.add("Six.");
  await turn();
  assert.equal(makes.length, 3);
  assert.equal(await settled(queue.done), false);
  plays[0].resolve();
  await queue.done;
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, spoken: 1, failed: 2, left: 3, problem: "Couldn't reach Kokoro at http://kokoro:8880 (ECONNREFUSED)", gaveUp: true });
});

test("a sound that was made and is waiting its turn is still played after the speech is given up on", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three.", "Four.", "Five."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  makes[2].reject(new Error("Kokoro replied 500"));
  await turn();
  makes[3].reject(new Error("Kokoro replied 500"));
  await turn();
  assert.deepEqual([makes.length, plays.length, queue.report().gaveUp], [4, 1, true]);
  plays[0].resolve();
  await turn();
  assert.deepEqual(plays.map((play) => play.given), [[1], [2]]);
  plays[1].resolve();
  await queue.done;
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, longestSilenceMs: 0, spoken: 2, failed: 2, left: 1, problem: "Kokoro replied 500", gaveUp: true });
});

test("a sentence that arrives after the speech was given up on is counted as left, even once the queue has finished", async () => {
  const { queue, makes } = setUp();
  queue.add("One.");
  queue.add("Two.");
  await turn();
  makes[0].reject(new Error("Kokoro replied 500"));
  await turn();
  makes[1].reject(new Error("Kokoro replied 500"));
  await queue.done;
  queue.add("Three.");
  queue.add("Four.");
  queue.end();
  await turn();
  assert.deepEqual([queue.report().left, queue.report().failed, makes.length], [2, 2, 2]);
  queue.stop();
  assert.equal(queue.report().stopped, false);
});

test("a failure, a success, then a failure aren't two in a row", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three.", "Four."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].reject(new Error("first"));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  makes[2].reject(new Error("second"));
  await turn();
  makes[3].resolve(Uint8Array.of(4));
  await turn();
  plays[0].resolve();
  await turn();
  plays[1].resolve();
  await queue.done;
  assert.deepEqual([queue.report().spoken, queue.report().failed, queue.report().gaveUp, queue.report().left], [2, 2, false, 0]);
});

test("the number of failures in a row that ends the speech can be set", async () => {
  const { queue, makes } = setUp({ failureLimit: 1 });
  queue.add("One.");
  queue.add("Two.");
  await turn();
  makes[0].reject(new Error("no"));
  await queue.done;
  assert.deepEqual([queue.report().gaveUp, queue.report().failed, queue.report().left, makes.length], [true, 1, 1, 1]);
});

test("a sound that can't be played is skipped and the next is tried", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  plays[0].reject(new Error("aplay stopped with code 1: audio open error: Device or resource busy"));
  await turn();
  assert.deepEqual(plays.map((play) => play.given), [[1], [2]]);
  plays[1].resolve();
  await queue.done;
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, spoken: 1, failed: 1, problem: "aplay stopped with code 1: audio open error: Device or resource busy" });
});

test("two sounds in a row that can't be played end the speech, drop everything and call off the sentence being made", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three.", "Four.", "Five."]) queue.add(sentence);
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  makes[2].resolve(Uint8Array.of(3));
  await turn();
  plays[0].reject(new Error("aplay stopped with code 1"));
  await turn();
  assert.equal(makes.length, 4);
  assert.equal(makes[3].signal.aborted, false);
  plays[1].reject(new Error("aplay stopped with code 1"));
  await turn();
  assert.equal(makes[3].signal.aborted, true);
  assert.equal(await orStillWaiting(queue.done.then(() => "done")), "done");
  assert.equal(plays.length, 2);
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, failed: 2, left: 3, problem: "aplay stopped with code 1", gaveUp: true });
});

test("a sound that comes back in the same moment the speech is given up on is counted as left, not lost", async () => {
  const { queue, makes, plays } = setUp({ ahead: 5, failureLimit: 1 });
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  assert.deepEqual([makes.length, plays.length], [3, 1]);
  plays[0].reject(new Error("aplay stopped with code 1"));
  makes[2].resolve(Uint8Array.of(3));
  await queue.done;
  assert.deepEqual([queue.report().spoken, queue.report().failed, queue.report().left, queue.report().gaveUp, plays.length], [0, 1, 2, true, 1]);
});

test("giving up on playing also ends a maker that was waiting for room, with nobody stopping or ending the queue", async () => {
  const { queue, makes, plays } = setUp({ ahead: 1 });
  for (const sentence of ["One.", "Two.", "Three.", "Four."]) queue.add(sentence);
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  plays[0].reject(new Error("aplay stopped with code 1"));
  await turn();
  makes[2].resolve(Uint8Array.of(3));
  await turn();
  assert.deepEqual([makes.length, plays.length], [3, 2]);
  plays[1].reject(new Error("aplay stopped with code 1"));
  assert.equal(await orStillWaiting(queue.done.then(() => "done"), 500), "done");
  assert.deepEqual([queue.report().gaveUp, queue.report().failed, queue.report().left, makes.length], [true, 2, 2, 3]);
});

test("a failed sound between two that play isn't two in a row either", async () => {
  const { queue, makes, plays } = setUp({ ahead: 5 });
  for (const sentence of ["One.", "Two.", "Three.", "Four."]) queue.add(sentence);
  queue.end();
  for (let made = 0; made < 4; made++) {
    await turn();
    makes[made].resolve(Uint8Array.of(made + 1));
  }
  await turn();
  plays[0].reject(new Error("first"));
  await turn();
  plays[1].resolve();
  await turn();
  plays[2].reject(new Error("second"));
  await turn();
  plays[3].resolve();
  await queue.done;
  assert.deepEqual([queue.report().spoken, queue.report().failed, queue.report().gaveUp], [2, 2, false]);
});

test("stopping after the speech was given up on isn't counted as stopped by you", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  plays[0].reject(new Error("aplay stopped with code 1"));
  await turn();
  plays[1].reject(new Error("aplay stopped with code 1"));
  await turn();
  queue.stop();
  assert.equal(await orStillWaiting(queue.done.then(() => "done")), "done");
  queue.stop();
  assert.deepEqual([queue.report().gaveUp, queue.report().stopped, queue.report().left], [true, false, 1]);
});

test("stopping after making was given up on, while a made sound is still playing, calls that sound off without calling it stopped by you", async () => {
  const { queue, makes, plays } = setUp();
  for (const sentence of ["One.", "Two.", "Three."]) queue.add(sentence);
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].reject(new Error("Kokoro replied 500"));
  await turn();
  makes[2].reject(new Error("Kokoro replied 500"));
  await turn();
  assert.equal(plays[0].signal.aborted, false);
  queue.stop();
  assert.equal(plays[0].signal.aborted, true);
  assert.equal(await orStillWaiting(queue.done.then(() => "done")), "done");
  assert.deepEqual([queue.report().gaveUp, queue.report().stopped, queue.report().spoken], [true, true, 0]);
});

test("an answer longer than the limit is spoken up to the limit, and the rest is left and noted as too long", async () => {
  const { queue, makes, plays } = setUp({ limit: 2, ahead: 5 });
  for (const sentence of ["One.", "Two.", "Three.", "Four."]) queue.add(sentence);
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  assert.equal(makes.length, 2);
  plays[0].resolve();
  await turn();
  plays[1].resolve();
  await queue.done;
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, longestSilenceMs: 0, spoken: 2, left: 2, tooLong: true });
});

test("left to its defaults, the forty-first sentence is the first one left out", async () => {
  const { queue } = setUp();
  for (let sentence = 1; sentence <= 40; sentence++) queue.add(`Sentence ${sentence}.`);
  assert.equal(queue.report().tooLong, false);
  queue.add("Sentence 41.");
  assert.deepEqual([queue.report().tooLong, queue.report().left], [true, 1]);
  queue.stop();
  await queue.done;
});

test("each sentence is handed a signal that stopping or finishing fires, and each sound one that only stopping fires", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  assert.notEqual(makes[0].signal, plays[0].signal);
  plays[0].resolve();
  await queue.done;
  assert.deepEqual([makes[0].signal.aborted, plays[0].signal.aborted], [false, false]);
  for (const how of ["stop", "finish"] as const) {
    const next = setUp();
    next.queue.add("One.");
    next.queue.add("Two.");
    await turn();
    next.makes[0].resolve(Uint8Array.of(1));
    await turn();
    if (how === "stop") next.queue.stop();
    else next.queue.finish();
    assert.deepEqual([next.makes[1].signal.aborted, next.plays[0].signal.aborted], [true, how === "stop"], how);
    next.plays[0].resolve();
    await next.queue.done;
  }
});

test("finishing lets the sentence that's playing end, plays nothing after it, and calls off what's being made", async () => {
  const { queue, makes, plays, clock } = setUp();
  queue.add("One.");
  queue.add("Two.");
  queue.add("Three.");
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  assert.deepEqual([plays.length, makes.length], [1, 2]);
  assert.equal(queue.finish(), true);
  assert.equal(makes[1].signal.aborted, true);
  queue.add("Four.");
  queue.end();
  await turn();
  assert.equal(await settled(queue.done), false);
  clock.at += 1500;
  plays[0].resolve();
  await queue.done;
  assert.deepEqual([plays.length, makes.length], [1, 2]);
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, firstSoundMadeMs: 0, firstSoundMs: 0, spoken: 1, left: 2, stopped: true });
});

test("finishing with nothing playing says so and ends the speech at once", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  await turn();
  assert.equal(queue.finish(), false);
  await queue.done;
  assert.equal(makes[0].signal.aborted, true);
  assert.equal(plays.length, 0);
  assert.deepEqual(queue.report(), { ...nothing, firstSentenceMs: 0, left: 1, stopped: true });
  const between = setUp();
  between.queue.add("One.");
  between.queue.add("Two.");
  await turn();
  between.makes[0].resolve(Uint8Array.of(1));
  await turn();
  between.plays[0].resolve();
  await turn();
  assert.equal(between.plays.length, 1);
  assert.equal(between.queue.finish(), false);
  await between.queue.done;
  assert.deepEqual([between.queue.report().spoken, between.queue.report().left, between.queue.report().stopped], [1, 1, true]);
});

test("finishing after everything has been said does nothing and isn't counted as a stop", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  plays[0].resolve();
  await queue.done;
  assert.equal(queue.finish(), false);
  assert.equal(queue.report().stopped, false);
});

test("stopping after finishing cuts the sentence short, and finishing twice still says a sentence is playing", async () => {
  const { queue, makes, plays, clock } = setUp();
  queue.add("One.");
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  clock.at += 700;
  assert.equal(queue.finish(), true);
  assert.equal(queue.finish(), true);
  assert.equal(plays[0].signal.aborted, false);
  queue.stop();
  assert.equal(plays[0].signal.aborted, true);
  assert.equal(await orStillWaiting(queue.done), undefined);
  assert.deepEqual([queue.report().spoken, queue.report().left, queue.report().firstSoundMs, queue.report().stopped], [0, 1, 0, true]);
});

test("a sentence that fails to play after a finish counts as a failure, with its reason, and nothing more is played", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  queue.add("Two.");
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  assert.equal(queue.finish(), true);
  plays[0].reject(new Error("aplay stopped with code 1"));
  await queue.done;
  assert.equal(plays.length, 1);
  assert.deepEqual([queue.report().failed, queue.report().left, queue.report().problem, queue.report().spoken], [1, 1, "aplay stopped with code 1", 0]);
});

test("finishing during the last sentence, with nothing after it, isn't a stop", async () => {
  const { queue, makes, plays } = setUp();
  queue.add("One.");
  queue.end();
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  assert.equal(queue.finish(), true);
  assert.equal(queue.report().stopped, false);
  plays[0].resolve();
  await queue.done;
  assert.deepEqual([queue.report().stopped, queue.report().spoken, queue.report().left], [false, 1, 0]);
  const making = setUp();
  making.queue.add("One.");
  making.queue.end();
  await turn();
  assert.equal(making.queue.finish(), false);
  assert.equal(making.queue.report().stopped, true);
  await making.queue.done;
});

test("the first sound waits for the last answer's speech to be over, while sentences are made ahead, and is timed from when it plays", async () => {
  let over = () => {};
  const after = new Promise<void>((resolve) => (over = resolve));
  const { queue, makes, plays, clock } = setUp({ after });
  queue.add("One.");
  queue.add("Two.");
  queue.add("Three.");
  await turn();
  makes[0].resolve(Uint8Array.of(1));
  await turn();
  makes[1].resolve(Uint8Array.of(2));
  await turn();
  assert.deepEqual([plays.length, makes.length], [0, 2]);
  clock.at += 3000;
  over();
  await turn();
  assert.deepEqual(plays.map((play) => play.given), [[1]]);
  assert.equal(makes.length, 3);
  plays[0].resolve();
  await turn();
  assert.deepEqual(plays.map((play) => play.given), [[1], [2]]);
  assert.equal(queue.report().firstSoundMs, 3000);
  queue.stop();
  await queue.done;
});

test("waiting for the last answer can be stopped or finished, and ends without playing anything", async () => {
  for (const how of ["stop", "finish"] as const) {
    const { queue, makes, plays } = setUp({ after: new Promise<void>(() => {}) });
    queue.add("One.");
    await turn();
    makes[0].resolve(Uint8Array.of(1));
    await turn();
    if (how === "stop") queue.stop();
    else assert.equal(queue.finish(), false);
    assert.equal(await orStillWaiting(queue.done), undefined, how);
    assert.deepEqual([plays.length, queue.report().left, queue.report().firstSoundMs], [0, 1, null], how);
  }
});

test("a last answer whose speech failed doesn't hold the next one up, and nothing to say ends without waiting", async () => {
  const failed = setUp({ after: Promise.reject(new Error("broke")) });
  failed.queue.add("One.");
  failed.queue.end();
  await turn();
  failed.makes[0].resolve(Uint8Array.of(1));
  await turn();
  assert.equal(failed.plays.length, 1);
  failed.plays[0].resolve();
  await failed.queue.done;
  const empty = setUp({ after: new Promise<void>(() => {}) });
  empty.queue.end();
  assert.equal(await orStillWaiting(empty.queue.done), undefined);
});
