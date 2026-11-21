import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { logLine, type LogContext, type Outcome } from "./answer-log.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { chatInputs, droppedNote, heardPrefix, listeningNote, notSentNote, runChat, wakeListeningNote, wakeStatusNote, type ChatDeps, type ChatInput } from "./chat.js";
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
  const sent: { signal: AbortSignal | undefined; wake: boolean | undefined }[] = [];
  const talk: Talk = {
    check: async () => "Ears: ready",
    start: async () => {
      events.push("talk start");
      return { ok: true };
    },
    send: async (signal, wake) => {
      events.push("talk send");
      sent.push({ signal, wake });
      return sends.shift() ?? { ok: true, heard: wake === true ? { ...typedHeard, wake: true } : typedHeard };
    },
    drop: async () => {
      events.push("talk drop");
      return null;
    },
  };
  return { talk, sent };
}

function earsDone(text: string | null, fields: Partial<EarsAnswer> = {}): EarsAnswer {
  return { status: 200, state: "idle", reason: null, error: null, seconds: null, last: { seconds: 3.4, reason: "it went quiet for 1.5 seconds after you spoke", text, textProblem: null }, ...fields };
}

function fakeSpeech(log: string[]): AnswerSpeech {
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  return {
    text: () => {},
    gap: () => {},
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

function wakeChat(scripts: Record<string, Script>, sends: Sent[] = []) {
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
  };
  const running = runChat(deps);
  return { lines, wake, events, output: () => output, recorded, sent: made.sent, closing, running, deps };
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

test("without wake events, only the lines come, and when the events end or fail the lines carry on", { timeout: 5_000 }, async () => {
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
  assert.deepEqual(more, [{ kind: "line", text: "still here" }]);
  const failing = (async function* (): AsyncGenerator<WakeEvent> {
    throw new Error("the watcher broke");
  })();
  const after: ChatInput[] = [];
  for await (const input of chatInputs((async function* () {
    await tick();
    yield "x";
  })(), failing)) after.push(input);
  assert.deepEqual(after, [{ kind: "line", text: "x" }]);
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
