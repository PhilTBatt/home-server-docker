import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { chatInputs, runChat, type ChatDeps, type ChatInput } from "./chat.js";
import type { Outcome } from "./answer-log.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Talk } from "./talk.js";
import type { Answer } from "./timing.js";
import type { TrainEvent } from "./train-news.js";
import type { WakeEvent } from "./wake.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function settled() {
  for (let round = 0; round < 10; round++) await tick();
}

function channel<T>() {
  const waiting: T[] = [];
  let over = false;
  let wake = () => {};
  async function* read(): AsyncGenerator<T> {
    for (;;) {
      while (waiting.length === 0 && !over) await new Promise<void>((resolve) => (wake = resolve));
      const next = waiting.shift();
      if (next === undefined) return;
      yield next;
    }
  }
  return {
    items: read(),
    push(item: T) {
      waiting.push(item);
      wake();
    },
    close() {
      over = true;
      wake();
    },
  };
}

function fakeSession(answers: Record<string, string>, events: string[]): AgentSession {
  let stopped: string | null = null;
  return {
    async ask(question: string, listener: AnswerListener = {}): Promise<Answer> {
      events.push(`ask ${question}`);
      const text = answers[question];
      if (text === undefined) throw new Error(`Unexpected question: ${question}`);
      listener.text?.(text);
      return { text, firstWordsMs: 400, totalMs: 900 };
    },
    readyMs: () => null,
    costUsd: () => 0.001,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
}

function heldSpeech(log: string[]) {
  let finish = () => {};
  let over = false;
  const done = new Promise<void>((resolve) => (finish = () => ((over = true), resolve())));
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  const speech: AnswerSpeech = {
    text: (delta) => void log.push(`say ${delta}`),
    gap: () => {},
    tool: () => {},
    restart: () => {},
    end: () => {},
    stop: () => {
      if (over) return;
      log.push("speech stop");
      report.stopped = true;
      finish();
    },
    finish: () => false,
    done: () => done,
    report: () => report,
  };
  return { speech, report, finish: () => finish() };
}

function fakeTrains() {
  const events = channel<TrainEvent>();
  let waiting: string[] = [];
  return {
    news: {
      events: events.items,
      take() {
        const taken = waiting;
        waiting = [];
        return taken;
      },
    },
    add(...lines: string[]) {
      waiting.push(...lines);
      events.push({ kind: "trains" });
    },
    nudge() {
      events.push({ kind: "trains" });
    },
    note(line: string) {
      events.push({ kind: "trains note", line });
    },
    waiting: () => waiting,
  };
}

function trainChat(answers: Record<string, string> = {}, extra: Partial<ChatDeps> = {}) {
  const events: string[] = [];
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const trains = fakeTrains();
  const speeches: ReturnType<typeof heldSpeech>[] = [];
  const recorded: Outcome[] = [];
  let output = "";
  const talk: Talk = {
    check: async () => "Ears: ready",
    start: async () => (events.push("talk start"), { ok: true, id: 20 }),
    send: async () => ({ ok: true, heard: { text: "What's the time?", recordedMs: 2000, textMs: 800 } }),
    drop: async () => null,
  };
  const deps: ChatDeps = {
    lines: lines.items,
    session: fakeSession(answers, events),
    write: (text) => {
      output += text;
    },
    prompt: () => {
      output += "You: ";
    },
    questionTimeoutMs: 1000,
    record: async (outcome) => void recorded.push(outcome),
    speak: () => {
      const made = heldSpeech(events);
      speeches.push(made);
      return made.speech;
    },
    talk,
    wake: wake.items,
    closing: new AbortController().signal,
    interrupt: () => void events.push("interrupt"),
    trains: trains.news,
    ...extra,
  };
  const running = runChat(deps);
  return { lines, wake, trains, events, speeches, recorded, output: () => output, running, deps };
}

test("train news comes in with typed lines, with or without wake events, and its end ends nothing else", { timeout: 5_000 }, async () => {
  for (const withWake of [false, true]) {
    const lines = channel<string>();
    const wake = channel<WakeEvent>();
    const news = channel<TrainEvent>();
    const got: ChatInput[] = [];
    const reading = (async () => {
      for await (const input of chatInputs(lines.items, withWake ? wake.items : undefined, undefined, news.items)) got.push(input);
    })();
    lines.push("hello");
    await settled();
    news.push({ kind: "trains" });
    await settled();
    news.push({ kind: "trains note", line: "train changes: the hub is answering again" });
    await settled();
    news.close();
    await settled();
    if (withWake) wake.push({ kind: "wake", id: 1 });
    await settled();
    lines.push("bye");
    await settled();
    lines.close();
    await reading;
    assert.deepEqual(got, [{ kind: "line", text: "hello" }, { kind: "trains" }, { kind: "trains note", line: "train changes: the hub is answering again" }, ...(withWake ? [{ kind: "wake", id: 1 } as const] : []), { kind: "line", text: "bye" }], `with wake ${withWake}`);
  }
});

test("with the chat quiet, waiting train changes are said and shown at once, in one line, and the prompt comes back", { timeout: 5_000 }, async () => {
  const chat = trainChat();
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  assert.ok(chat.output().endsWith("You: Jarvis: Train change: The 07:14 is cancelled.\nYou: "), chat.output());
  assert.deepEqual(chat.events, ["interrupt", "say Train change: The 07:14 is cancelled."]);
  chat.trains.add("The 07:44 is now expected 07:54, 10 minutes late.", "The 08:14 now leaves from platform 2, not 1.");
  await settled();
  assert.ok(chat.output().endsWith("Jarvis: Train change: The 07:14 is cancelled.\nYou: "), "not while the last change is still being said");
  chat.speeches[0].finish();
  await settled();
  chat.trains.nudge();
  await settled();
  assert.ok(chat.output().endsWith("Jarvis: Train changes: The 07:44 is now expected 07:54, 10 minutes late. The 08:14 now leaves from platform 2, not 1.\nYou: "), chat.output());
  assert.deepEqual(chat.trains.waiting(), []);
  chat.lines.close();
  await chat.running;
});

test("train changes are never asked of Claude, logged, or followed by listening for a follow-up", { timeout: 5_000 }, async () => {
  const asks: string[] = [];
  const chat = trainChat({}, { followUp: { seconds: 5, ask: () => void asks.push("ask"), gapMs: 0 } });
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  chat.speeches[0].finish();
  await pause(30);
  assert.deepEqual([chat.events.filter((event) => event.startsWith("ask")), chat.recorded, asks], [[], [], []]);
  chat.lines.close();
  await chat.running;
});

test("while an answer is still being spoken, train changes wait, and are said at the next nudge after it ends, never cutting it off", { timeout: 5_000 }, async () => {
  const chat = trainChat({ "What's the time?": "Ten past nine." });
  chat.lines.push("What's the time?");
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  assert.ok(!chat.output().includes("Train change"), chat.output());
  assert.ok(!chat.events.includes("speech stop"), chat.events.join(" | "));
  chat.trains.nudge();
  await settled();
  assert.ok(!chat.output().includes("Train change"), "not while he's speaking");
  chat.speeches[0].finish();
  await settled();
  assert.ok(!chat.output().includes("Train change"), "nothing until the next nudge");
  chat.trains.nudge();
  await settled();
  assert.ok(chat.output().endsWith("Jarvis: Train change: The 07:14 is cancelled.\nYou: "), chat.output());
  chat.lines.close();
  await chat.running;
});

test("while a recording is going on, train changes wait until it has been sent and the answer spoken", { timeout: 5_000 }, async () => {
  const chat = trainChat({ "What's the time?": "Ten past nine." });
  chat.lines.push("/talk");
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  assert.ok(!chat.output().includes("Train change"), "not while listening");
  chat.lines.push("");
  await settled();
  chat.trains.nudge();
  await settled();
  assert.ok(!chat.output().includes("Train change"), "not while the answer is spoken");
  chat.speeches[0].finish();
  await settled();
  chat.trains.nudge();
  await settled();
  assert.ok(chat.output().endsWith("Jarvis: Train change: The 07:14 is cancelled.\nYou: "), chat.output());
  chat.lines.close();
  await chat.running;
});

test("while a follow-up is on its way or open, train changes wait, so his speech doesn't take its place", { timeout: 5_000 }, async () => {
  const asks: string[] = [];
  const chat = trainChat({ "What's the time?": "Ten past nine." }, { followUp: { seconds: 5, ask: () => void asks.push("ask"), gapMs: 60 } });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: { status: 200, state: "idle", reason: null, error: null, seconds: null, last: { seconds: 3, reason: "it went quiet", text: "What's the time?", textProblem: null } }, textMs: 900 });
  await settled();
  chat.speeches[0].finish();
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  assert.ok(!chat.output().includes("Train change"), "not in the gap before the follow-up");
  await pause(100);
  assert.deepEqual(asks, ["ask"]);
  chat.trains.nudge();
  await settled();
  assert.ok(!chat.output().includes("Train change"), "not while the follow-up is asked for");
  chat.wake.push({ kind: "no follow-up", why: "ears is busy" });
  await settled();
  chat.trains.nudge();
  await settled();
  assert.ok(chat.output().endsWith("Jarvis: Train change: The 07:14 is cancelled.\nYou: "), chat.output());
  chat.lines.close();
  await chat.running;
});

test("an answer's speech notes, like one that couldn't be spoken, are shown before a train change rather than lost", { timeout: 5_000 }, async () => {
  const chat = trainChat({ "What's the time?": "Ten past nine." });
  chat.lines.push("What's the time?");
  await settled();
  Object.assign(chat.speeches[0].report, { gaveUp: true, problem: "Kokoro didn't answer" });
  chat.speeches[0].finish();
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  assert.ok(chat.output().endsWith("You:   (the last answer wasn't spoken: Kokoro didn't answer)\nJarvis: Train change: The 07:14 is cancelled.\nYou: "), chat.output());
  chat.lines.close();
  await chat.running;
});

test("a new question while a train change is being said stops it, like any of his speech", { timeout: 5_000 }, async () => {
  const chat = trainChat({ "What's the time?": "Ten past nine." });
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  chat.lines.push("What's the time?");
  await settled();
  assert.ok(chat.events.includes("speech stop"), chat.events.join(" | "));
  assert.ok(chat.events.includes("ask What's the time?"), chat.events.join(" | "));
  chat.lines.close();
  await chat.running;
});

test("with his voice off, train changes are only shown, as soon as he isn't answering", { timeout: 5_000 }, async () => {
  const chat = trainChat({}, { speak: undefined });
  await settled();
  chat.trains.add("The 07:14 is cancelled.");
  await settled();
  assert.ok(chat.output().endsWith("Jarvis: Train change: The 07:14 is cancelled.\nYou: "), chat.output());
  assert.deepEqual(chat.events, ["interrupt"]);
  chat.lines.close();
  await chat.running;
});

test("a train note is shown as a note, never said, and a nudge with nothing waiting does nothing", { timeout: 5_000 }, async () => {
  const chat = trainChat();
  await settled();
  chat.trains.note("train changes: the hub is answering again");
  await settled();
  chat.trains.nudge();
  await settled();
  assert.ok(chat.output().endsWith("You:   (train changes: the hub is answering again)\nYou: "), chat.output());
  assert.deepEqual(chat.events, ["interrupt"]);
  chat.lines.close();
  await chat.running;
});
