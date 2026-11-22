import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { logLine, type LogContext, type Outcome } from "./answer-log.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { chatInputs, droppedNote, lateNote, stoppedWatchingLine, followGapMs, followLimitNote, followListeningNote, followUpsInARow, heardPrefix, listeningNote, noFollowHeardNote, noFollowUpNote, notSentNote, runChat, wakeListeningNote, wakeStatusNote, type ChatDeps, type ChatInput } from "./chat.js";
import type { EarsAnswer } from "./ears-client.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Heard, Sent, Talk } from "./talk.js";
import type { Answer } from "./timing.js";
import type { WakeEvent } from "./wake.js";

type Script = (listener: AnswerListener) => Promise<Answer>;

const said = (text: string): Script => async (listener) => {
  listener.text?.(text);
  return { text, firstWordsMs: 400, totalMs: 900 };
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

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

function fakeSession(scripts: Record<string, Script>, events: string[]): AgentSession {
  let stopped: string | null = null;
  return {
    ask(question: string, listener: AnswerListener = {}) {
      events.push(`ask ${question}`);
      const script = scripts[question];
      return script === undefined ? Promise.reject(new Error(`Unexpected question: ${question}`)) : script(listener);
    },
    readyMs: () => null,
    costUsd: () => 0.001,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
}

const typedHeard: Heard = { text: "Turn the lights on.", recordedMs: 2500, textMs: 1300 };

function fakeTalk(events: string[], sends: Sent[] = []) {
  const sent: { signal: AbortSignal | undefined; wake: boolean | "follow" | undefined }[] = [];
  const named: string[] = [];
  const talk: Talk = {
    check: async () => "Ears: ready",
    start: async () => {
      events.push("talk start");
      return { ok: true, id: 20 };
    },
    send: async (signal, wake, id) => {
      events.push("talk send");
      sent.push({ signal, wake });
      named.push(`send ${id}`);
      return sends.shift() ?? { ok: true, heard: wake === true ? { ...typedHeard, wake: true } : wake === "follow" ? { ...typedHeard, follow: true } : typedHeard };
    },
    drop: async (_signal, id) => {
      events.push("talk drop");
      named.push(`drop ${id}`);
      return null;
    },
  };
  return { talk, sent, named };
}

function earsDone(text: string | null, fields: Partial<EarsAnswer> = {}): EarsAnswer {
  return { status: 200, state: "idle", reason: null, error: null, seconds: null, last: { seconds: 3.4, reason: "it went quiet for 1.5 seconds after you spoke", text, textProblem: null }, ...fields };
}

function fakeSpeech(log: string[]): AnswerSpeech {
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  return {
    text: () => {},
    gap: () => {},
    tool: () => {},
    restart: () => {},
    end: () => {},
    stop: () => {
      log.push("speech stop");
      report.stopped = true;
    },
    finish: () => false,
    done: () => Promise.resolve(),
    report: () => report,
  };
}

function wakeChat(scripts: Record<string, Script>, sends: Sent[] = [], extra: Partial<ChatDeps> = {}) {
  const events: string[] = [];
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const made = fakeTalk(events, sends);
  let output = "";
  const recorded: Outcome[] = [];
  const closing = new AbortController().signal;
  const deps: ChatDeps = {
    lines: lines.items,
    session: fakeSession(scripts, events),
    write: (text) => {
      output += text;
    },
    prompt: () => {
      output += "You: ";
    },
    questionTimeoutMs: 1000,
    record: async (outcome) => void recorded.push(outcome),
    talk: made.talk,
    closing,
    wake: wake.items,
    chime: () => void events.push("chime"),
    interrupt: () => void events.push("interrupt"),
    ...extra,
  };
  const running = runChat(deps);
  return { lines, wake, events, output: () => output, recorded, sent: made.sent, named: made.named, closing, running, deps };
}

test("typed lines and wake events come in the order they arrive, and when the lines end the watcher is told to stop", { timeout: 5_000 }, async () => {
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const got: ChatInput[] = [];
  const reading = (async () => {
    for await (const input of chatInputs(lines.items, wake.items)) got.push(input);
  })();
  lines.push("hello");
  await settled();
  wake.push({ kind: "status", line: "on: say Hey Jarvis" });
  await settled();
  wake.push({ kind: "wake", id: 1 });
  await settled();
  lines.push("");
  await settled();
  lines.close();
  await reading;
  assert.deepEqual(got, [{ kind: "line", text: "hello" }, { kind: "status", line: "on: say Hey Jarvis" }, { kind: "wake", id: 1 }, { kind: "line", text: "" }]);
  const asked: string[] = [];
  const stuck: AsyncIterable<WakeEvent> = {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise<IteratorResult<WakeEvent>>(() => {}),
      return: async () => {
        asked.push("return");
        return { done: true, value: undefined };
      },
    }),
  };
  for await (const input of chatInputs((async function* () {
    yield "only";
  })(), stuck)) assert.deepEqual(input, { kind: "line", text: "only" });
  assert.deepEqual(asked, ["return"]);
});

test("without wake events, only the lines come, and when the events end or fail the lines carry on, saying so unless the chat is closing", { timeout: 5_000 }, async () => {
  const got: ChatInput[] = [];
  for await (const input of chatInputs((async function* () {
    yield "a";
    yield "b";
  })())) got.push(input);
  assert.deepEqual(got, [{ kind: "line", text: "a" }, { kind: "line", text: "b" }]);
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const more: ChatInput[] = [];
  const reading = (async () => {
    for await (const input of chatInputs(lines.items, wake.items)) more.push(input);
  })();
  wake.close();
  await settled();
  lines.push("still here");
  await settled();
  lines.close();
  await reading;
  assert.deepEqual(more, [{ kind: "status", line: stoppedWatchingLine("it stopped with no reason given") }, { kind: "line", text: "still here" }]);
  const failing = (async function* (): AsyncGenerator<WakeEvent> {
    throw new Error("the watcher broke");
  })();
  const after: ChatInput[] = [];
  for await (const input of chatInputs((async function* () {
    await tick();
    yield "x";
  })(), failing)) after.push(input);
  assert.deepEqual(after, [{ kind: "status", line: stoppedWatchingLine("the watcher broke") }, { kind: "line", text: "x" }]);
  assert.equal(stoppedWatchingLine("the watcher broke"), "off: this chat stopped watching ears (the watcher broke), so start the chat again to use it");
  const closing = new AbortController();
  closing.abort();
  const quiet: ChatInput[] = [];
  for await (const input of chatInputs((async function* () {
    await tick();
    yield "y";
  })(), (async function* (): AsyncGenerator<WakeEvent> {
    throw new Error("closed");
  })(), closing.signal)) quiet.push(input);
  assert.deepEqual(quiet, [{ kind: "line", text: "y" }], "a watcher that stops because the chat is closing isn't news");
});

test("a chat that's closing doesn't say it stopped watching ears when its watcher stops with it", { timeout: 5_000 }, async () => {
  const closing = new AbortController();
  const chat = wakeChat({}, [], { closing: closing.signal });
  closing.abort();
  chat.wake.close();
  await settled();
  assert.equal(chat.output().includes("stopped watching"), false, chat.output());
  chat.lines.close();
  await chat.running;
  const open = wakeChat({});
  open.wake.close();
  await settled();
  assert.ok(open.output().includes(stoppedWatchingLine("it stopped with no reason given")), open.output());
  open.lines.close();
  await open.running;
});

test("a wake word ears ignored as too late is noted on a line of its own, with how far behind it was", { timeout: 5_000 }, async () => {
  const chat = wakeChat({});
  chat.wake.push({ kind: "late", behindMs: 2909 });
  await settled();
  assert.ok(chat.output().endsWith(`You:   (${lateNote(2909)})\nYou: `), chat.output());
  assert.equal(lateNote(2909), "heard Hey Jarvis, but 2.91 s behind the sound, so ears ignored it rather than record from the wrong moment. If this keeps happening, docker compose logs ears shows each one");
  assert.equal(lateNote(null), "heard Hey Jarvis, but ears couldn't match it to the sound, so ears ignored it rather than record from the wrong moment. If this keeps happening, docker compose logs ears shows each one");
  assert.deepEqual(chat.events, ["interrupt"]);
  chat.lines.close();
  await chat.running;
});

test("a wake-word status is shown on a line of its own, clearing what was half typed, and the prompt comes back", { timeout: 5_000 }, async () => {
  const chat = wakeChat({});
  chat.wake.push({ kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" });
  await settled();
  assert.deepEqual(chat.events, ["interrupt"]);
  assert.ok(chat.output().endsWith(`You:   (${wakeStatusNote("off while ears is muted, so unmute it on the server with bash host/ears.sh unmute")})\nYou: `), chat.output());
  assert.equal(wakeStatusNote("on: say Hey Jarvis"), "wake word on: say Hey Jarvis");
  chat.lines.close();
  await chat.running;
});

test("a wake starts listening with a note and a chime, and when ears has the text it's shown as said and asked, logged as the wake word's", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "What's the time?": said("Ten past nine.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  assert.deepEqual(chat.events, ["interrupt", "chime"]);
  assert.ok(chat.output().endsWith(`You:   (${wakeListeningNote})\nYou: `), chat.output());
  assert.equal(wakeListeningNote, "heard Hey Jarvis, so listening: it sends when you stop talking, or press Enter on an empty line to send it now, or type anything else to drop it");
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("  What's the time?  "), textMs: 950 });
  await settled();
  assert.deepEqual(chat.events, ["interrupt", "chime", "interrupt", "ask What's the time?"]);
  assert.ok(chat.output().includes(`(${wakeListeningNote})\nYou: ${heardPrefix}What's the time?\nJarvis: Ten past nine.`), chat.output());
  assert.ok(chat.output().endsWith("You: "));
  assert.deepEqual(chat.recorded.map((outcome) => outcome.heard), [{ text: "What's the time?", recordedMs: 3400, textMs: 950, wake: true }]);
  chat.lines.close();
  await chat.running;
});

test("a wake's recording that comes back without text says why, and nothing is asked", { timeout: 5_000 }, async () => {
  const chat = wakeChat({});
  chat.wake.push({ kind: "wake", id: 1 });
  await settled();
  chat.wake.push({ kind: "done", id: 1, answer: earsDone("   "), textMs: 1 });
  await settled();
  assert.ok(chat.output().includes(`(${notSentNote("Whisper heard no words")})\nYou: `), chat.output());
  chat.wake.push({ kind: "wake", id: 2 });
  await settled();
  chat.wake.push({ kind: "done", id: 2, answer: { status: 503, state: null, reason: null, error: "Couldn't reach ears at http://ears:8090", seconds: null, last: null }, textMs: 1 });
  await settled();
  assert.ok(chat.output().includes(`(${notSentNote("Couldn't reach ears at http://ears:8090")})`), chat.output());
  assert.equal(chat.events.filter((event) => event.startsWith("ask")).length, 0);
  chat.lines.close();
  await chat.running;
});

test("a done for another recording, or when nothing is listening, is passed over", { timeout: 5_000 }, async () => {
  const chat = wakeChat({});
  chat.wake.push({ kind: "done", id: 9, answer: earsDone("Stray."), textMs: 1 });
  await settled();
  chat.wake.push({ kind: "wake", id: 3 });
  await settled();
  chat.wake.push({ kind: "done", id: 2, answer: earsDone("Old."), textMs: 1 });
  await settled();
  assert.deepEqual(chat.events, ["interrupt", "chime"]);
  assert.equal(chat.output().includes("Stray") || chat.output().includes("Old"), false);
  chat.lines.close();
  await chat.running;
});

test("Enter on an empty line sends a wake's recording at once, marked as the wake word's, and the later done is passed over", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "Turn the lights on.": said("Done.") });
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.lines.push("");
  await settled();
  assert.deepEqual(chat.sent, [{ signal: chat.closing, wake: true }]);
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("Turn the lights on."), textMs: 1 });
  await settled();
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")), ["ask Turn the lights on."]);
  assert.deepEqual(chat.recorded.map((outcome) => outcome.heard?.wake), [true]);
  chat.lines.close();
  await chat.running;
});

test("typing while a wake's recording goes on drops it, then the typed line is taken", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "What's the weather?": said("Sunny.") });
  chat.wake.push({ kind: "wake", id: 6 });
  await settled();
  chat.lines.push("What's the weather?");
  await settled();
  assert.deepEqual(chat.events, ["interrupt", "chime", "talk drop", "ask What's the weather?"]);
  assert.ok(chat.output().includes(`(${droppedNote})`));
  chat.wake.push({ kind: "done", id: 6, answer: earsDone(null, { last: { seconds: 1, reason: "asked to cancel", text: null, textProblem: null } }), textMs: 1 });
  await settled();
  assert.equal(chat.output().includes("nothing was sent"), false);
  chat.lines.close();
  await chat.running;
});

test("a wake while /talk is still listening takes over, since ears only ever holds the latest recording, and its Enter is the wake's", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "Turn the lights on.": said("Done.") });
  chat.lines.push("/talk");
  await settled();
  chat.wake.push({ kind: "wake", id: 8 });
  await settled();
  assert.deepEqual(chat.events, ["talk start", "interrupt", "chime"]);
  assert.ok(chat.output().includes(`(${listeningNote})`));
  assert.ok(chat.output().endsWith(`(${wakeListeningNote})\nYou: `), chat.output());
  chat.lines.push("");
  await settled();
  assert.deepEqual(chat.sent, [{ signal: chat.closing, wake: true }]);
  chat.lines.close();
  await chat.running;
});

test("/talk's Enter is a push one", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "Turn the lights on.": said("Done.") });
  chat.lines.push("/talk");
  await settled();
  chat.lines.push("");
  await settled();
  assert.deepEqual(chat.sent, [{ signal: chat.closing, wake: false }]);
  assert.deepEqual(chat.recorded.map((outcome) => outcome.heard), [typedHeard]);
  chat.lines.close();
  await chat.running;
});

test("a wake stops him talking first", { timeout: 5_000 }, async () => {
  const log: string[] = [];
  const chat = wakeChat({ "First?": said("A long answer.") });
  chat.deps.speak = () => fakeSpeech(log);
  chat.lines.push("First?");
  await settled();
  chat.wake.push({ kind: "wake", id: 1 });
  await settled();
  assert.deepEqual(log, ["speech stop"]);
  assert.ok(chat.events.indexOf("chime") > chat.events.indexOf("ask First?"));
  chat.lines.close();
  await chat.running;
});

test("a chat that ends while a wake's recording goes on drops it", { timeout: 5_000 }, async () => {
  const chat = wakeChat({});
  chat.wake.push({ kind: "wake", id: 2 });
  await settled();
  chat.lines.close();
  await chat.running;
  assert.equal(chat.events.at(-1), "talk drop");
});

test("an answer to a spoken question that stops the session ends the chat", { timeout: 5_000 }, async () => {
  const events: string[] = [];
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  let stopped: string | null = null;
  let output = "";
  const session: AgentSession = {
    ask: async (question) => {
      events.push(`ask ${question}`);
      stopped = "The agent stopped";
      return { text: "Bye.", firstWordsMs: 1, totalMs: 2 };
    },
    readyMs: () => null,
    costUsd: () => 0,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
  const running = runChat({ lines: lines.items, session, write: (text) => void (output += text), prompt: () => void (output += "You: "), questionTimeoutMs: 1000, talk: fakeTalk(events).talk, wake: wake.items });
  wake.push({ kind: "wake", id: 1 });
  await settled();
  wake.push({ kind: "done", id: 1, answer: earsDone("Goodbye."), textMs: 1 });
  await running;
  assert.deepEqual(events, ["ask Goodbye."]);
  assert.ok(output.includes("Jarvis has stopped."), output);
});

test("a question asked through the wake word is logged with wake true and the times, never the words", () => {
  const context: LogContext = { engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "off", speechStart: "sentence", speechStop: "now", speechBundle: "off", spokenStyle: "off" };
  const at = new Date("2026-11-20T22:00:00Z");
  const answer = { text: "Ten past nine.", firstWordsMs: 400, totalMs: 900 };
  const spoken: Heard = { text: "What's the time?", recordedMs: 3400.4, textMs: 949.6, wake: true };
  const line = logLine(context, "c", 1, at, { answer, heard: spoken });
  assert.deepEqual(line.heard, { recordedMs: 3400, textMs: 950, wake: true });
  assert.equal(JSON.stringify(line).includes("time?"), false);
  assert.deepEqual(logLine(context, "c", 2, at, { answer, heard: typedHeard }).heard, { recordedMs: 2500, textMs: 1300 });
});

test("a wake recording is sent or dropped by its own number, and one that takes over a /talk recording uses the wake's", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "Turn the lights on.": said("Done."), "stop that": said("OK.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.lines.push("");
  await settled();
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.lines.push("stop that");
  await settled();
  chat.lines.push("/talk");
  await settled();
  chat.wake.push({ kind: "wake", id: 6 });
  await settled();
  chat.lines.push("");
  await settled();
  chat.lines.push("/talk");
  await settled();
  chat.lines.close();
  await chat.running;
  assert.deepEqual(chat.named, ["send 4", "drop 5", "send 6", "drop 20"]);
});

test("a wake that takes over a /talk recording is the one dropped when something's typed", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "never mind": said("OK.") });
  chat.lines.push("/talk");
  await settled();
  chat.wake.push({ kind: "wake", id: 7 });
  await settled();
  chat.lines.push("never mind");
  await settled();
  chat.lines.close();
  await chat.running;
  assert.deepEqual(chat.named, ["drop 7"]);
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function heldSpeech() {
  let over = false;
  let finish = () => {};
  const done = new Promise<void>((resolve) => (finish = () => ((over = true), resolve())));
  const plain = fakeSpeech([]);
  const speech: AnswerSpeech = { ...plain, stop: () => void (over || plain.stop()), done: () => done };
  return { speech, finish };
}

function followChat(scripts: Record<string, Script>, gapMs = 0, extra: Partial<ChatDeps> = {}) {
  const chat = wakeChat(scripts, [], extra);
  const asks: string[] = [];
  chat.deps.followUp = { seconds: 5, ask: () => void asks.push("ask"), gapMs };
  return { ...chat, asks };
}

const unheardDone = (id: number) => earsDone(null, { lastId: id, last: { seconds: 5, reason: "nothing loud enough to be speech came within 5 seconds, so it wasn't sent to Whisper", text: null, textProblem: null } });

test("once the answer to a wake question has been spoken and a short gap has passed, a follow-up is asked for, and ears starting one shows its note with no chime", { timeout: 5_000 }, async () => {
  assert.equal(followGapMs, 500);
  const chat = followChat({ "What's the time?": said("Ten past nine.") }, 80);
  const held = heldSpeech();
  chat.deps.speak = () => held.speech;
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(120);
  assert.deepEqual(chat.asks, [], "not while he's still speaking");
  held.finish();
  await pause(20);
  assert.deepEqual(chat.asks, [], "nor straight after");
  await pause(120);
  assert.deepEqual(chat.asks, ["ask"]);
  chat.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  assert.ok(chat.output().endsWith(`You:   (${followListeningNote(5)})\nYou: `), chat.output());
  assert.equal(followListeningNote(5), "listening for a follow-up, no Hey Jarvis needed: start within 5 seconds and it sends when you stop, or press Enter on an empty line to send it now, or type anything else to drop it");
  assert.deepEqual(chat.events.filter((event) => event === "chime"), ["chime"], "only the wake word chimes");
  chat.lines.close();
  await chat.running;
});

test("what's heard in a follow-up is shown as said, asked, logged as a follow-up, and opens the next one", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine."), "And tomorrow?": said("Nine again.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("And tomorrow?", { last: { seconds: 2, reason: "the speech detector heard no speech for 1.5 seconds after you spoke", text: "And tomorrow?", textProblem: null, ender: "silero" } }), textMs: 700 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}And tomorrow?\nJarvis: Nine again.`), chat.output());
  assert.deepEqual(chat.recorded.map((outcome) => outcome.heard), [{ text: "What's the time?", recordedMs: 3400, textMs: 900, wake: true }, { text: "And tomorrow?", recordedMs: 2000, textMs: 700, follow: true, ender: "silero" }]);
  assert.deepEqual(chat.asks, ["ask", "ask"]);
  chat.lines.close();
  await chat.running;
});

test("a follow-up that hears no speech in time says so quietly, sends nothing and opens no other, while one that fails says why", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: unheardDone(5), textMs: 1 });
  await pause(20);
  assert.ok(chat.output().endsWith(`You:   (${noFollowHeardNote})\nYou: `), chat.output());
  assert.equal(noFollowHeardNote, "no follow-up heard, so say Hey Jarvis to ask again");
  assert.deepEqual([chat.asks, chat.events.filter((event) => event.startsWith("ask"))], [["ask"], ["ask What's the time?"]]);
  chat.wake.push({ kind: "wake", id: 6 });
  await settled();
  chat.wake.push({ kind: "done", id: 6, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "wake", id: 7, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 7, answer: earsDone(null, { state: "muted", lastId: 7, last: { seconds: 1, reason: "muted", text: null, textProblem: null } }), textMs: 1 });
  await settled();
  assert.ok(chat.output().includes(`(${notSentNote("ears was muted, so the recording was dropped")})`), chat.output());
  chat.lines.close();
  await chat.running;
});

test("anything typed before the follow-up is asked for calls it off, and a follow-up ears starts after he typed is dropped by its number, with no note", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine."), thanks: said("Any time.") }, 60);
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await settled();
  chat.lines.push("thanks");
  await pause(120);
  assert.deepEqual(chat.asks, [], "the typed question came first, and it wasn't spoken, so no follow-up");
  const late = followChat({ "What's the time?": said("Ten past nine."), thanks: said("Any time.") });
  late.wake.push({ kind: "wake", id: 4 });
  await settled();
  late.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  assert.deepEqual(late.asks, ["ask"]);
  late.lines.push("thanks");
  await settled();
  late.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  assert.deepEqual(late.named, ["drop 5"]);
  assert.equal(late.output().includes(followListeningNote(5)), false);
  chat.lines.close();
  late.lines.close();
  await Promise.all([chat.running, late.running]);
});

test("a follow-up ears refused is said while it still matters, and not once something else has happened", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine."), thanks: said("Any time.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "no follow-up", why: "a Jarvis chat is still speaking, so ears can't listen for a follow-up yet" });
  await settled();
  assert.ok(chat.output().endsWith(`You:   (${noFollowUpNote("a Jarvis chat is still speaking, so ears can't listen for a follow-up yet")})\nYou: `), chat.output());
  chat.wake.push({ kind: "no follow-up", why: "once more" });
  await settled();
  assert.equal(chat.output().includes("once more"), false, "said once for each ask");
  chat.wake.push({ kind: "wake", id: 6 });
  await settled();
  chat.wake.push({ kind: "done", id: 6, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  chat.lines.push("thanks");
  await settled();
  chat.wake.push({ kind: "no follow-up", why: "too late" });
  await settled();
  assert.equal(chat.output().includes("too late"), false);
  chat.lines.close();
  await chat.running;
});

test("typed questions and /talk ones open no follow-up, and Enter on a follow-up sends it as one", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine."), "Turn the lights on.": said("Done.") });
  chat.lines.push("What's the time?");
  await settled();
  chat.lines.push("/talk");
  await settled();
  chat.lines.push("");
  await pause(20);
  assert.deepEqual(chat.asks, []);
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  chat.lines.push("");
  await pause(20);
  assert.deepEqual(chat.sent.at(-1), { signal: chat.closing, wake: "follow" });
  assert.deepEqual(chat.recorded.at(-1)?.heard, { ...typedHeard, follow: true });
  assert.deepEqual(chat.named.at(-1), "send 5");
  assert.deepEqual(chat.asks, ["ask", "ask"]);
  chat.lines.close();
  await chat.running;
});

test("without follow-ups, a follow-up's events from ears are passed over safely, and one ears started is dropped", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "What's the time?": said("Ten past nine.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "no follow-up", why: "stray" });
  chat.wake.push({ kind: "wake", id: 9, follow: true });
  await settled();
  assert.equal(chat.output().includes("stray") || chat.output().includes("follow-up, no Hey"), false, chat.output());
  assert.deepEqual(chat.named, ["drop 9"]);
  chat.lines.close();
  await chat.running;
});

test("a question asked as a follow-up is logged with follow true, how it was set to end and its pause, never the words", () => {
  const context: LogContext = { engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "off", speechStart: "sentence", speechStop: "now", speechBundle: "off", spokenStyle: "off" };
  const answer = { text: "Nine again.", firstWordsMs: 400, totalMs: 900 };
  const spoken: Heard = { text: "And tomorrow?", recordedMs: 2000.2, textMs: 700.4, follow: true, ender: "silero", pauseMs: 2500 };
  const line = logLine(context, "c", 2, new Date("2026-11-21T20:00:00Z"), { answer, heard: spoken });
  assert.deepEqual(line.heard, { recordedMs: 2000, textMs: 700, follow: true, ender: "silero", pauseMs: 2500 });
  assert.equal(JSON.stringify(line).includes("tomorrow"), false);
});

test("after 5 follow-ups in a row no other is asked for, saying so, until the wake word starts again", { timeout: 5_000 }, async () => {
  assert.equal(followUpsInARow, 5);
  assert.equal(followLimitNote, "that's 5 follow-ups in a row, so say Hey Jarvis to ask again");
  const chat = followChat({ "What's the time?": said("Ten past nine."), "And?": said("Yes.") });
  chat.wake.push({ kind: "wake", id: 1 });
  await settled();
  chat.wake.push({ kind: "done", id: 1, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  for (let id = 2; id <= 6; id++) {
    chat.wake.push({ kind: "wake", id, follow: true });
    await settled();
    chat.wake.push({ kind: "done", id, answer: earsDone("And?"), textMs: 900 });
    await pause(20);
  }
  assert.equal(chat.asks.length, 5, "one after the wake question and one after each of the first four follow-ups");
  assert.ok(chat.output().endsWith(`  (${followLimitNote})\nYou: `), chat.output());
  chat.wake.push({ kind: "wake", id: 7 });
  await settled();
  chat.wake.push({ kind: "done", id: 7, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  assert.equal(chat.asks.length, 6);
  chat.lines.close();
  await chat.running;
});

test("a wake word before the follow-up is asked for calls it off, and an answer that stops the session asks for none", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine.") }, 60);
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await settled();
  chat.wake.push({ kind: "wake", id: 5 });
  await pause(120);
  assert.deepEqual(chat.asks, []);
  chat.lines.close();
  await chat.running;
  const events: string[] = [];
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  let stopped: string | null = null;
  const asks: string[] = [];
  const session: AgentSession = {
    ask: async () => {
      stopped = "The agent stopped";
      return { text: "Bye.", firstWordsMs: 1, totalMs: 2 };
    },
    readyMs: () => null,
    costUsd: () => 0,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
  const running = runChat({ lines: lines.items, session, write: () => {}, prompt: () => {}, questionTimeoutMs: 1000, talk: fakeTalk(events).talk, wake: wake.items, followUp: { seconds: 5, ask: () => void asks.push("ask"), gapMs: 0 } });
  wake.push({ kind: "wake", id: 1 });
  await settled();
  wake.push({ kind: "done", id: 1, answer: earsDone("Goodbye."), textMs: 1 });
  await running;
  await pause(20);
  assert.deepEqual(asks, []);
});

test("an answer that failed, or a question over the length cap, opens no follow-up", { timeout: 5_000 }, async () => {
  const chat = followChat({});
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the weather?"), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes("What's the weather?"), chat.output());
  assert.deepEqual(chat.asks, []);
  const capped = followChat({ "What's the time?": said("Ten past nine.") }, 0, { lengthCap: 1, knownSize: 5 });
  capped.wake.push({ kind: "wake", id: 4 });
  await settled();
  capped.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  assert.deepEqual(capped.events.filter((event) => event.startsWith("ask")), []);
  assert.deepEqual(capped.asks, []);
  chat.lines.close();
  capped.lines.close();
  await Promise.all([chat.running, capped.running]);
});

test("an Enter left over from while he was answering doesn't call a follow-up off, since the chat ignores it", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine.") }, 60);
  chat.deps.early = () => true;
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await settled();
  chat.lines.push("");
  await pause(120);
  assert.deepEqual(chat.asks, ["ask"]);
  chat.lines.close();
  await chat.running;
});
