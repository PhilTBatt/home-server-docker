import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { logLine, type LogContext, type Outcome } from "./answer-log.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { buttonListeningNote, chatInputs, hushNotes, neverMindNote, droppedNote, lateNote, otherChatNote, turnNote, stoppedWatchingLine, followGapMs, followLimitNote, followListeningNote, followUpsInARow, heardPrefix, listeningNote, fromWebNote, lookUpFailedNote, followingOnNote, lookingUpNote, lookUpsOffReply, lookUpStoppedNote, type WebDeps, noFollowHeardNote, noFollowUpNote, notSentNote, runChat, wakeListeningNote, wakeStatusNote, type ChatDeps, type ChatInput } from "./chat.js";
import { earsStoppedWhy, hubOffNote } from "./code-words.js";
import { foundNothing, lookingUp, lookUpFailed, noNumbers, noQuestion, withEarlier, type Earlier, type Helped, type Helper, type LookedUp } from "./look-up.js";
import { followOnMs, followOnNote, type FollowOnCheck, type FollowVerdict } from "./look-up-follow.js";
import type { EarsAnswer } from "./ears-client.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Heard, HeardBy, Sent, Talk } from "./talk.js";
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
  const sent: { signal: AbortSignal | undefined; wake: HeardBy | undefined }[] = [];
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
      return sends.shift() ?? { ok: true, heard: wake === true ? { ...typedHeard, wake: true } : wake === "follow" ? { ...typedHeard, follow: true } : wake === "button" ? { ...typedHeard, button: true } : typedHeard };
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
  const finished = Promise.resolve();
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
    done: () => finished,
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

test("what the quick check said about whether you'd finished is noted while that recording is still on, and not for any other", { timeout: 5_000 }, async () => {
  assert.equal(turnNote("done", 430, true), "asked whether you'd finished: yes (0.4 s)");
  assert.equal(turnNote("more", 1180, true), "asked whether you'd finished: not yet (1.2 s)");
  assert.equal(turnNote("done", 960, false), "asked whether you'd finished: yes (1 s), too late for ears to use");
  assert.equal(turnNote(null, 1204, false), "asked whether you'd finished, but got no answer in time (1.2 s), so ears kept to its usual pause");
  const chat = wakeChat({});
  chat.wake.push({ kind: "turn", id: 4, verdict: "done", ms: 430, counted: true });
  await settled();
  assert.equal(chat.output().includes("finished"), false, "nothing is being recorded");
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "turn", id: 3, verdict: "done", ms: 430, counted: true });
  await settled();
  assert.equal(chat.output().includes("finished"), false, "that was about another recording");
  const before = chat.events.length;
  chat.wake.push({ kind: "turn", id: 4, verdict: "more", ms: 1180, counted: true });
  await settled();
  assert.ok(chat.output().endsWith(`  (${turnNote("more", 1180, true)})\nYou: `), chat.output());
  assert.deepEqual(chat.events.slice(before), ["interrupt"]);
  chat.lines.close();
  await chat.running;
});

test("a wake that cut in shows that he stopped talking and plays no chime, and an ordinary wake after speech that was already stopped chimes and says nothing about it", { timeout: 5_000 }, async () => {
  for (const cut of [true, false]) {
    const speech = fakeSpeech([]);
    speech.report().firstSoundMs = 100;
    const chat = wakeChat({ "First?": said("An answer.") }, [], { speak: () => speech });
    chat.lines.push("First?");
    await settled();
    speech.stop();
    chat.wake.push(cut ? { kind: "wake", id: 4, cut: true } : { kind: "wake", id: 4 });
    await settled();
    assert.equal(chat.output().endsWith(`${cut ? `  (${hushNotes.talking})\n` : ""}  (${wakeListeningNote})\nYou: `), true, chat.output());
    assert.equal(chat.output().includes(hushNotes.talking), cut);
    assert.equal(chat.events.includes("chime"), !cut);
    chat.lines.close();
    await chat.running;
  }
});

test("told to hush because another chat took what was said, the chat stops its speech and says why, and says nothing when it wasn't speaking", { timeout: 5_000 }, async () => {
  const log: string[] = [];
  const speech = fakeSpeech(log);
  speech.report().firstSoundMs = 100;
  const chat = wakeChat({ "First?": said("An answer.") }, [], { speak: () => speech });
  chat.lines.push("First?");
  await settled();
  chat.wake.push({ kind: "hush", id: 9 });
  await settled();
  assert.equal(chat.output().endsWith(`  (${hushNotes.talking})\n  (${otherChatNote})\nYou: `), true, chat.output());
  assert.deepEqual(log, ["speech stop"]);
  assert.equal(otherChatNote, "ears heard you cut in, and another chat took what you said");
  const before = chat.output();
  chat.wake.push({ kind: "hush", id: 10 });
  await settled();
  assert.equal(chat.output(), `${before}You: `);
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

test("a talk-button recording is taken like a wake, with its own note and the chime, and what's heard is asked and logged as the button's", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "What's the time?": said("Ten past nine.") });
  chat.wake.push({ kind: "wake", id: 6, button: true });
  await settled();
  assert.deepEqual(chat.events, ["interrupt", "chime"]);
  assert.ok(chat.output().endsWith(`You:   (${buttonListeningNote})\nYou: `), chat.output());
  assert.equal(buttonListeningNote, "the talk button was pressed, so listening: it sends when you stop talking, or press Enter on an empty line, or the button again once you've spoken, to send it now, or type anything else to drop it");
  chat.wake.push({ kind: "done", id: 6, answer: earsDone("What's the time?", { last: { seconds: 2.1, reason: "it went quiet for 2.5 seconds after you spoke", text: "What's the time?", textProblem: null, ender: "loudness", pauseMs: 2500 } }), textMs: 800 });
  await settled();
  assert.deepEqual(chat.events, ["interrupt", "chime", "interrupt", "ask What's the time?"]);
  assert.deepEqual(chat.recorded.map((outcome) => outcome.heard), [{ text: "What's the time?", recordedMs: 2100, textMs: 800, button: true, ender: "loudness", pauseMs: 2500 }]);
  chat.wake.push({ kind: "wake", id: 7 });
  await settled();
  assert.ok(chat.output().endsWith(`You:   (${wakeListeningNote})\nYou: `), "a wake after a press is a wake again");
  chat.lines.push("");
  await settled();
  chat.wake.push({ kind: "wake", id: 8, button: true });
  await settled();
  chat.lines.push("");
  await settled();
  assert.deepEqual(chat.sent.map((sent) => sent.wake), [true, "button"], "Enter sends each as what started it");
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
  const context: LogContext = { engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "off", kokoroSpeed: 1, speechStart: "sentence", speechStop: "now", speechBundle: "off", spokenStyle: "off", persona: "off", liveFacts: "off" };
  const at = new Date("2026-11-20T22:00:00Z");
  const answer = { text: "Ten past nine.", firstWordsMs: 400, totalMs: 900 };
  const spoken: Heard = { text: "What's the time?", recordedMs: 3400.4, textMs: 949.6, wake: true };
  const line = logLine(context, "c", 1, at, { answer, heard: spoken });
  assert.deepEqual(line.heard, { recordedMs: 3400, textMs: 950, wake: true });
  assert.equal(JSON.stringify(line).includes("time?"), false);
  assert.deepEqual(logLine(context, "c", 2, at, { answer, heard: typedHeard }).heard, { recordedMs: 2500, textMs: 1300 });
});

test("a question asked with the talk button is logged with button true and the times, never the words", () => {
  const context: LogContext = { engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "off", kokoroSpeed: 1, speechStart: "sentence", speechStop: "now", speechBundle: "off", spokenStyle: "off", persona: "off", liveFacts: "off" };
  const at = new Date("2026-11-22T22:00:00Z");
  const answer = { text: "Ten past nine.", firstWordsMs: 400, totalMs: 900 };
  const pressed: Heard = { text: "What's the time?", recordedMs: 2100.4, textMs: 799.6, button: true, ender: "silero", pauseMs: 2500 };
  const line = logLine(context, "c", 1, at, { answer, heard: pressed });
  assert.deepEqual(line.heard, { recordedMs: 2100, textMs: 800, button: true, ender: "silero", pauseMs: 2500 });
  assert.equal(JSON.stringify(line).includes("time?"), false);
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

test("an answer to a talk-button question opens a follow-up too, and a press starts the count of follow-ups in a row again", { timeout: 5_000 }, async () => {
  const chat = followChat({ "What's the time?": said("Ten past nine."), "And tomorrow?": said("Nine again.") });
  chat.wake.push({ kind: "wake", id: 4, button: true });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  assert.deepEqual(chat.asks, ["ask"]);
  for (let id = 5; id < 5 + followUpsInARow; id++) {
    chat.wake.push({ kind: "wake", id, follow: true });
    await settled();
    chat.wake.push({ kind: "done", id, answer: earsDone("And tomorrow?"), textMs: 700 });
    await pause(20);
  }
  assert.equal(chat.asks.length, followUpsInARow, "the follow-up after the fifth isn't asked for");
  chat.wake.push({ kind: "wake", id: 20, button: true });
  await settled();
  chat.wake.push({ kind: "done", id: 20, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  assert.equal(chat.asks.length, followUpsInARow + 1, "a press counts from nought again, as the wake word does");
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
  const context: LogContext = { engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "off", kokoroSpeed: 1, speechStart: "sentence", speechStop: "now", speechBundle: "off", spokenStyle: "off", persona: "off", liveFacts: "off" };
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

test("a spoken code word is handled without asking Claude: a note is saved and Jarvis says so, out loud too, and nothing is logged or followed up", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  const notes: string[] = [];
  const chat = followChat({}, 0, {
    speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text) }),
    codeWords: { note: async (text) => (notes.push(text), { say: "Noted.", note: "saved in the brain's inbox as 2026-11-22-voice-note.md" }), phone: async () => ({ say: "unused" }), trains: async () => ({ say: "unused" }) },
  });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Note this: buy more coffee."), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}Note this: buy more coffee.\nJarvis: Noted.\n  (saved in the brain's inbox as 2026-11-22-voice-note.md)\n`), chat.output());
  assert.deepEqual([notes, spoken, chat.events.filter((event) => event.startsWith("ask")), chat.recorded, chat.asks], [["buy more coffee."], ["Noted."], [], [], []]);
  chat.lines.close();
  await chat.running;
});

test("find my phone asks the hub through its action, and never mind just leaves it there, ending the follow-ups", { timeout: 5_000 }, async () => {
  let found = 0;
  const chat = followChat({ "What's the time?": said("Ten past nine.") }, 0, { codeWords: { note: async () => ({ say: "unused" }), phone: async () => (found++, { say: "I've sent your phone a notification." }), trains: async () => ({ say: "unused" }) } });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Hey Jarvis, find my phone."), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}Hey Jarvis, find my phone.\nJarvis: I've sent your phone a notification.\n`), chat.output());
  assert.equal(found, 1);
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  assert.deepEqual(chat.asks, ["ask"]);
  chat.wake.push({ kind: "wake", id: 6, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 6, answer: earsDone("That's all, thanks."), textMs: 700 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}That's all, thanks.\n  (${neverMindNote})\n`), chat.output());
  assert.equal(neverMindNote, "left there, so nothing was asked");
  assert.deepEqual([chat.asks, chat.events.filter((event) => event.startsWith("ask"))], [["ask"], ["ask What's the time?"]], "no follow-up after never mind, and only the real question was asked");
  chat.lines.close();
  await chat.running;
});

test("a code word in a chat with no way to the hub says how to get one, and typed words are never code words", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "Find my phone.": said("I can't do that.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Note this: buy more coffee."), textMs: 900 });
  await settled();
  assert.ok(chat.output().includes(`Jarvis: I couldn't save that note.\n  (${hubOffNote})\n`), chat.output());
  chat.lines.push("Find my phone.");
  await settled();
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")), ["ask Find my phone."]);
  chat.lines.close();
  await chat.running;
});

test("train times are asked of the hub through their action and said like any code word, with the reasons as a note", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  const chat = wakeChat({}, [], {
    speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text) }),
    codeWords: { note: async () => ({ say: "unused" }), phone: async () => ({ say: "unused" }), trains: async () => ({ say: "Trains from Alpha to Beta: the 08:14 is on time, platform 16.", note: "08:44: a fault" }) },
  });
  chat.wake.push({ kind: "wake", id: 4, button: true });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Train times."), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}Train times.\nJarvis: Trains from Alpha to Beta: the 08:14 is on time, platform 16.\n  (08:44: a fault)\n`), chat.output());
  assert.deepEqual([spoken, chat.events.filter((event) => event.startsWith("ask"))], [["Trains from Alpha to Beta: the 08:14 is on time, platform 16."], []]);
  chat.lines.close();
  await chat.running;
});

test("a server check is asked of the hub through its action and said like any code word, with what to try as a note", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  let checks = 0;
  const chat = wakeChat({}, [], {
    speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text) }),
    codeWords: { note: async () => ({ say: "unused" }), phone: async () => ({ say: "unused" }), trains: async () => ({ say: "unused" }), server: async () => (checks++, { say: "1 problem: Heartbeat. Heartbeat: The last ping failed.", note: "Heartbeat: check the API's log" }) },
  });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Hey Jarvis, how's the server?"), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}Hey Jarvis, how's the server?\nJarvis: 1 problem: Heartbeat. Heartbeat: The last ping failed.\n  (Heartbeat: check the API's log)\n`), chat.output());
  assert.deepEqual([checks, spoken, chat.events.filter((event) => event.startsWith("ask"))], [1, ["1 problem: Heartbeat. Heartbeat: The last ping failed."], []]);
  chat.lines.close();
  await chat.running;
});

test("a server check with no way to ask the hub for it says how to get one, and is never asked of Claude", { timeout: 5_000 }, async () => {
  const chat = wakeChat({}, [], { codeWords: { note: async () => ({ say: "unused" }), phone: async () => ({ say: "unused" }), trains: async () => ({ say: "unused" }) } });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Server check."), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`Jarvis: I couldn't check the server.\n  (${hubOffNote})\n`), chat.output());
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")), []);
  chat.lines.close();
  await chat.running;
});

test("when ears mutes itself on stop listening, Jarvis says so out loud, and a near miss is told how instead of being asked", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  const chat = followChat({}, 0, { speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text) }) });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone(null, { last: { seconds: 2, reason: "it went quiet for 1.5 seconds after you spoke", text: null, textProblem: "you said stop listening, so ears muted itself. Unmute it on the server with bash host/ears.sh unmute" } }), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes("Jarvis: I've stopped listening.\n  (ears muted itself, so unmute it on the server with bash host/ears.sh unmute)\n"), chat.output());
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("You can stop listening now."), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}You can stop listening now.\nJarvis: Say just stop listening, and ears will stop.\n`), chat.output());
  assert.deepEqual([spoken, chat.events.filter((event) => event.startsWith("ask")), chat.asks], [["I've stopped listening.", "Say just stop listening, and ears will stop."], [], []]);
  chat.lines.close();
  await chat.running;
});

test("That's all? as a follow-up is a question, not never mind", { timeout: 5_000 }, async () => {
  const chat = followChat({ "That's all?": said("Yes, two downloads.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("That's all?"), textMs: 900 });
  await pause(20);
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")), ["ask That's all?"]);
  chat.lines.close();
  await chat.running;
});

test("a /talk recording ears muted itself on gets the same spoken reply when Enter sends it", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  const chat = wakeChat({}, [{ ok: false, why: earsStoppedWhy }], { speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text) }) });
  chat.lines.push("/talk");
  await settled();
  chat.lines.push("");
  await settled();
  assert.ok(chat.output().includes("Jarvis: I've stopped listening.\n"), chat.output());
  assert.deepEqual([spoken, chat.events.filter((event) => event.startsWith("ask"))], [["I've stopped listening."], []]);
  chat.lines.close();
  await chat.running;
});

test("train times in a chat with no way to the hub say how to get one", { timeout: 5_000 }, async () => {
  const chat = wakeChat({});
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Train times."), textMs: 900 });
  await settled();
  assert.ok(chat.output().includes(`Jarvis: I couldn't get the train times.\n  (${hubOffNote})\n`), chat.output());
  chat.lines.close();
  await chat.running;
});

test("with the clock on, every question goes to Claude with the time line after it, before the size line when there is one, and without the clock it goes as before", { timeout: 5_000 }, async () => {
  const at = new Date("2026-11-26T13:52:40Z");
  const line = "[Time now: 13:52 on Thursday 26 November 2026, in London.]";
  const on = wakeChat({ [`Is it too late to ring?\n\n${line}`]: said("Not at all.") }, [], { clock: () => at });
  on.lines.push("Is it too late to ring?");
  await pause(20);
  on.lines.close();
  await on.running;
  assert.deepEqual(on.events.filter((event) => event.startsWith("ask")), [`ask Is it too late to ring?\n\n${line}`]);
  assert.ok(on.output().includes("Not at all."), on.output());
  assert.ok(!on.output().includes("Time now"), "the line is for Claude, never shown");
  const sized = wakeChat({ [`Is it too late to ring?\n\n${line}\n\n[Chat size: big]`]: said("Not at all.") }, [], { clock: () => at, sizeLine: () => "[Chat size: big]" });
  sized.lines.push("Is it too late to ring?");
  await pause(20);
  sized.lines.close();
  await sized.running;
  assert.deepEqual(sized.events.filter((event) => event.startsWith("ask")), [`ask Is it too late to ring?\n\n${line}\n\n[Chat size: big]`]);
  const off = wakeChat({ "Is it too late to ring?": said("Not at all.") });
  off.lines.push("Is it too late to ring?");
  await pause(20);
  off.lines.close();
  await off.running;
  assert.deepEqual(off.events.filter((event) => event.startsWith("ask")), ["ask Is it too late to ring?"]);
});

test("with the clock on, asking the time or the date out loud is answered by his own code from the clock, with no hub, and never asked of Claude", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  const chat = wakeChat({}, [], { clock: () => new Date("2026-11-26T13:52:40Z"), speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text) }) });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Hey Jarvis, what time is it?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("What's the date today?"), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}Hey Jarvis, what time is it?\nJarvis: It's 13:52.\n`), chat.output());
  assert.ok(chat.output().includes(`${heardPrefix}What's the date today?\nJarvis: It's Thursday the 26th of November.\n`), chat.output());
  assert.deepEqual(spoken, ["It's 13:52.", "It's Thursday the 26th of November."]);
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")), []);
  chat.lines.close();
  await chat.running;
});

test("without the clock, asking the time or the date out loud goes to Claude exactly as it always did", { timeout: 5_000 }, async () => {
  const chat = wakeChat({ "Hey Jarvis, what time is it?": said("I have no clock."), "What's the date today?": said("I can't say.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Hey Jarvis, what time is it?"), textMs: 900 });
  await pause(20);
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("What's the date today?"), textMs: 900 });
  await pause(20);
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")), ["ask Hey Jarvis, what time is it?", "ask What's the date today?"]);
  assert.ok(chat.output().includes("I have no clock.") && chat.output().includes("I can't say."), chat.output());
  assert.ok(!chat.output().includes("It's "), chat.output());
  chat.lines.close();
  await chat.running;
});

function fakeWeb(verdicts: Array<FollowVerdict | null | "throw"> = []) {
  const judged: Array<[string, Earlier]> = [];
  const seen: string[] = [];
  const stopped: string[] = [];
  const recorded: Array<[string, LookedUp]> = [];
  const waiting = new Map<string, (helped: Helped) => void>();
  let at = 0;
  const found = (answer: string | null, error: string | null = null): Helped => ({ answer, error, numbers: { ...noNumbers, searches: 1 }, found: ["example.org", "example.com"], opened: [], refused: [] });
  const helper: Helper = (question, signal) =>
    new Promise((resolve) => {
      seen.push(question);
      waiting.set(question, resolve);
      signal.addEventListener("abort", () => {
        stopped.push(question);
        resolve(found(null, "stopped"));
      });
    });
  const followOn: FollowOnCheck = async (said, earlier) => {
    judged.push([said, earlier]);
    at += 250;
    const verdict = verdicts.shift() ?? null;
    if (verdict === "throw") throw new Error("no answer");
    return verdict;
  };
  const web: WebDeps = { helper, now: () => at, record: async (mode, looked) => void recorded.push([mode, looked]), followOn };
  return { web, seen, stopped, recorded, found, judged, tick: (ms: number) => (at += ms), answer: (question: string, helped: Helped, tookMs = 2_300) => ((at += tookMs), waiting.get(question)?.(helped)), answerLast: (helped: Helped, tookMs = 2_300) => ((at += tookMs), waiting.get(seen[seen.length - 1])?.(helped)) };
}

test("a spoken look up is handed to the helper without asking Claude: he says he's looking, then the answer with where it came from, it's recorded once, and a follow-up is listened for", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  const looking = fakeWeb();
  const chat = followChat({}, 0, { speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text) }), web: looking.web });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Hey Jarvis, look up the latest Node version."), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes(`${heardPrefix}Hey Jarvis, look up the latest Node version.\n  (${lookingUpNote("the latest Node version.")})\nJarvis: ${lookingUp}\n`), chat.output());
  assert.deepEqual([looking.seen, spoken, looking.recorded], [["the latest Node version."], [lookingUp], []]);
  looking.answer("the latest Node version.", looking.found("It is **26**, per [the Node site](https://nodejs.org)."));
  await pause(20);
  assert.ok(chat.output().includes("Jarvis: It is 26, per the Node site.\n  (from the web in 2.30 s: example.org, example.com)\n"), chat.output());
  assert.deepEqual(spoken, [lookingUp, "It is 26, per the Node site."]);
  assert.deepEqual(looking.recorded.map(([mode, looked]) => [mode, looked.ended, looked.question, looked.ms]), [["ask", "answered", "the latest Node version.", 2_300]]);
  assert.deepEqual([chat.events.filter((event) => event.startsWith("ask")), chat.recorded, chat.asks, looking.stopped], [[], [], ["ask"], []]);
  chat.lines.close();
  await chat.running;
});

test("the chat stays free while a look-up runs: a typed question stops the look-up, is answered, and the late result is recorded but never said", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const chat = wakeChat({ "What's two plus two?": said("Four.") }, [], { web: looking.web });
  chat.lines.push("/lookup the weather in Paris");
  await pause(20);
  assert.ok(chat.output().includes(`  (${lookingUpNote("the weather in Paris")})\nJarvis: ${lookingUp}\n`), chat.output());
  chat.lines.push("What's two plus two?");
  await pause(20);
  assert.ok(chat.output().includes(`  (${lookUpStoppedNote})\nJarvis: Four.`), chat.output());
  assert.deepEqual(looking.stopped, ["the weather in Paris"]);
  await pause(20);
  assert.deepEqual(looking.recorded.map(([mode, looked]) => [mode, looked.ended, looked.say]), [["ask", "stopped", null]]);
  assert.ok(!chat.output().includes("from the web"), chat.output());
  chat.lines.close();
  await chat.running;
});

test("saying Hey Jarvis during a look-up stops it, and a rating or an empty line typed during one doesn't", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const chat = wakeChat({ "First question": said("First answer.") }, [], { web: looking.web });
  chat.lines.push("First question");
  await pause(20);
  chat.lines.push("/lookup something slow");
  await pause(20);
  chat.lines.push("+");
  await pause(20);
  chat.lines.push("");
  await pause(20);
  chat.lines.push("   ");
  await pause(20);
  assert.deepEqual(looking.stopped, []);
  assert.ok(!chat.output().includes(lookUpStoppedNote), chat.output());
  chat.wake.push({ kind: "wake", id: 9 });
  await pause(20);
  assert.deepEqual(looking.stopped, ["something slow"]);
  assert.ok(chat.output().includes(`  (${lookUpStoppedNote})\n`), chat.output());
  chat.lines.close();
  await chat.running;
});

test("a second look-up takes the place of the first, and only the second's answer is said", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const chat = wakeChat({}, [], { web: looking.web });
  chat.lines.push("/lookup first thing");
  await pause(20);
  chat.lines.push("/LOOKUP   second thing  ");
  await pause(20);
  assert.deepEqual([looking.seen, looking.stopped], [["first thing", "second thing"], ["first thing"]]);
  looking.answer("first thing", looking.found("The first answer."));
  looking.answer("second thing", looking.found("The second answer."));
  await pause(20);
  assert.ok(chat.output().includes("Jarvis: The second answer.\n"), chat.output());
  assert.ok(!chat.output().includes("The first answer."), chat.output());
  assert.deepEqual(looking.recorded.map(([, looked]) => looked.ended).sort(), ["answered", "stopped"]);
  chat.lines.close();
  await chat.running;
});

test("the first look-up's late ending doesn't lose track of the second: typing still stops it, and its answer is never said", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const chat = wakeChat({ "What's two plus two?": said("Four.") }, [], { web: looking.web });
  chat.lines.push("/lookup first thing");
  await pause(20);
  chat.lines.push("/lookup second thing");
  await pause(20);
  assert.deepEqual(looking.stopped, ["first thing"]);
  chat.lines.push("What's two plus two?");
  await pause(20);
  assert.deepEqual(looking.stopped, ["first thing", "second thing"]);
  looking.answer("second thing", looking.found("The second answer."));
  await pause(20);
  assert.ok(chat.output().includes("Jarvis: Four."), chat.output());
  assert.ok(!chat.output().includes("The second answer."), chat.output());
  assert.deepEqual(looking.recorded.map(([, looked]) => looked.ended), ["stopped", "stopped"]);
  chat.lines.close();
  await chat.running;
});

test("a look-up that fails gets a plain line with why underneath, one that finds nothing gets a plain line, neither gets a source note, and one with no question asks for one without starting", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const chat = wakeChat({}, [], { web: looking.web });
  chat.lines.push("/lookup a thing");
  await pause(20);
  looking.answer("a thing", looking.found(null, "Claude Code ended without a result."));
  await pause(20);
  assert.ok(chat.output().includes(`Jarvis: ${lookUpFailed}\n  (look-up failed: Claude Code ended without a result.)\nYou: `), chat.output());
  chat.lines.push("/lookup another thing");
  await pause(20);
  looking.answer("another thing", looking.found(""));
  await pause(20);
  assert.ok(chat.output().includes(`Jarvis: ${foundNothing}\nYou: `), chat.output());
  chat.lines.push("/lookup");
  await pause(20);
  chat.lines.push("/lookup    ");
  await pause(20);
  assert.equal(chat.output().split(`Jarvis: ${noQuestion}\n`).length - 1, 2, chat.output());
  assert.deepEqual(looking.seen, ["a thing", "another thing"]);
  assert.ok(!chat.output().includes("from the web"), chat.output());
  chat.lines.close();
  await chat.running;
});

test("with look-ups off, look up said out loud goes to Claude like anything else and the typed command isn't one", { timeout: 5_000 }, async () => {
  const chat = followChat({ "Look up the latest Node version.": said("I can't look things up.") });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Look up the latest Node version."), textMs: 900 });
  await pause(20);
  assert.ok(chat.output().includes("Jarvis: I can't look things up."), chat.output());
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")), ["ask Look up the latest Node version."]);
  chat.lines.push("/lookup the weather");
  await pause(20);
  assert.ok(!chat.output().includes(lookingUp), chat.output());
  assert.ok(!chat.output().includes(lookUpsOffReply.say), chat.output());
  chat.lines.close();
  await chat.running;
});

test("ending the chat during a look-up stops the helper and the chat closes cleanly", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const chat = wakeChat({}, [], { web: looking.web });
  chat.lines.push("/lookup something slow");
  await pause(20);
  chat.lines.push("exit");
  await chat.running;
  assert.deepEqual(looking.stopped, ["something slow"]);
  assert.ok(!chat.output().includes("from the web"), chat.output());
  await pause(20);
  assert.deepEqual(looking.recorded.map(([mode, looked]) => [mode, looked.ended, looked.question]), [["ask", "stopped", "something slow"]], "a look-up stopped by exit is still logged");
});

test("a look-up stopped by new is logged in the chat that started it, not the new one", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const fresh = fakeWeb();
  const chat = wakeChat({}, [], { web: looking.web, newChat: async () => ({ session: fakeSession({}, []), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [], web: fresh.web }) });
  chat.lines.push("/lookup something slow");
  await pause(20);
  chat.lines.push("new");
  await pause(20);
  assert.deepEqual(looking.stopped, ["something slow"]);
  assert.deepEqual([looking.recorded.map(([, looked]) => looked.ended), fresh.recorded.length], [["stopped"], 0]);
  chat.lines.close();
  await chat.running;
});

test("the note under a web answer names up to four sites, opened pages first, and just the time when there are none", () => {
  const looked = (helped: Partial<Helped>): LookedUp => ({ ended: "answered", say: "x", question: "q", ms: 12_668, helped: { answer: "x", error: null, numbers: noNumbers, found: [], opened: [], refused: [], ...helped } });
  assert.equal(fromWebNote(looked({ found: ["a.example", "b.example"], opened: ["b.example", "c.example"] })), "from the web in 12.67 s: b.example, c.example, a.example");
  assert.equal(fromWebNote(looked({ found: ["1.example", "2.example", "3.example", "4.example", "5.example"] })), "from the web in 12.67 s: 1.example, 2.example, 3.example, 4.example");
  assert.equal(fromWebNote(looked({})), "from the web in 12.67 s");
  assert.equal(fromWebNote({ ended: "answered", say: "x", question: "q", ms: 900, helped: null }), "from the web in 0.90 s");
});

test("a failed look-up's note says why in the helper's own words, and no other ending gets one", () => {
  const ended = (how: LookedUp["ended"], error: string | null): LookedUp => ({ ended: how, say: "x", question: "q", ms: 900, helped: { answer: null, error, numbers: noNumbers, found: [], opened: [], refused: [] } });
  assert.equal(lookUpFailedNote(ended("failed", "Claude Code ended without a result. It exited with 1. Not logged in")), "look-up failed: Claude Code ended without a result. It exited with 1. Not logged in");
  assert.equal(lookUpFailedNote(ended("failed", null)), undefined);
  assert.equal(lookUpFailedNote({ ended: "failed", say: "x", question: "q", ms: 1, helped: null }), undefined);
  for (const how of ["answered", "nothing", "timed out", "stopped"] as const) assert.equal(lookUpFailedNote(ended(how, "stopped")), undefined, how);
});

test("when Jarvis uses his look-up tool, the question he sent is shown and he says he's looking it up, on either engine's name for the tool", { timeout: 5_000 }, async () => {
  for (const name of ["look_up", "mcp__web__look_up"]) {
    const spoken: string[] = [];
    const script: Script = async (listener) => {
      listener.text?.("Let me check.");
      listener.tool?.(name, { question: "latest Node.js version" });
      listener.text?.("It's 26.");
      return { text: "It's 26.", firstWordsMs: 300, totalMs: 2000 };
    };
    const chat = wakeChat({ "What's the latest Node?": script }, [], { speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text), tool: () => void spoken.push("<tool>") }) });
    chat.lines.push("What's the latest Node?");
    await pause(20);
    assert.ok(chat.output().includes("Jarvis: Let me check.\n  (looking up: latest Node.js version)\nIt's 26.\n"), chat.output());
    assert.deepEqual(spoken, ["Let me check.", ` ${lookingUp} `, "<tool>", "It's 26."], name);
    chat.lines.close();
    await chat.running;
  }
});

test("any other tool is noted as before and brings no spoken notice", { timeout: 5_000 }, async () => {
  const spoken: string[] = [];
  const script: Script = async (listener) => {
    listener.tool?.("Read", { file_path: "/brain/index.md" });
    listener.text?.("Done.");
    return { text: "Done.", firstWordsMs: 300, totalMs: 2000 };
  };
  const chat = wakeChat({ "Read it": script }, [], { speak: () => ({ ...fakeSpeech([]), text: (text: string) => void spoken.push(text), tool: () => void spoken.push("<tool>") }) });
  chat.lines.push("Read it");
  await pause(20);
  assert.ok(chat.output().includes("  (reading index.md)\n"), chat.output());
  assert.deepEqual(spoken, ["<tool>", "Done."]);
  chat.lines.close();
  await chat.running;
});

test("a look-up within five minutes of an answered one carries that one's question and answer to the helper and says so, but not after five minutes, after one that wasn't answered, or after new", { timeout: 5_000 }, async () => {
  let fresh = fakeWeb();
  const looking = fakeWeb();
  const chat = followChat({}, 0, {
    web: looking.web,
    newChat: async () => ((fresh = fakeWeb()), fresh.tick(looking.web.now() + 1_000), { session: fakeSession({}, []), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [], web: fresh.web }),
  });
  chat.lines.push("/lookup the latest Node version");
  await pause(20);
  looking.answerLast(looking.found("Node 26 is the latest."));
  await pause(20);
  chat.lines.push("/lookup who released it");
  await pause(20);
  const earlier = { question: "the latest Node version", answer: "Node 26 is the latest.", at: 2_300 };
  assert.deepEqual(looking.seen, ["the latest Node version", withEarlier("who released it", earlier)]);
  assert.ok(chat.output().includes(`  (looking up: who released it)\n  (${followingOnNote(earlier)})\nJarvis: ${lookingUp}\n`), chat.output());
  assert.equal(followingOnNote(earlier), "following on from the last look-up: the latest Node version");
  looking.answerLast(looking.found("Its maintainers did."));
  await pause(20);
  const second = { question: "who released it", answer: "Its maintainers did.", at: 4_600 };
  chat.lines.push("/lookup something new");
  await pause(20);
  assert.equal(looking.seen[2], withEarlier("something new", second));
  looking.answerLast(looking.found(null, "Claude Code ended without a result."));
  await pause(20);
  chat.lines.push("/lookup and again");
  await pause(20);
  assert.equal(looking.seen[3], withEarlier("and again", second), "a failed look-up isn't one to follow on from, so the last answered one is used while it's recent");
  looking.answerLast(looking.found("Again."));
  await pause(20);
  looking.tick(followOnMs + 1);
  chat.lines.push("/lookup much later");
  await pause(20);
  assert.equal(looking.seen[4], "much later");
  assert.ok(!chat.output().split("(looking up: much later)")[1].startsWith("\n  (following on"), chat.output());
  looking.answerLast(looking.found("Later."));
  await pause(20);
  chat.lines.push("new");
  await pause(20);
  chat.lines.push("/lookup after new");
  await pause(20);
  assert.deepEqual([fresh.seen, looking.seen.length], [["after new"], 5], "a new chat starts with nothing to follow on from, and its look-ups go to its own helper");
  assert.deepEqual(looking.recorded.map(([, looked]) => looked.followsOn === true), [false, true, true, true, false]);
  assert.deepEqual(chat.asks, [], "typed look-ups open no follow-up");
  chat.lines.close();
  await chat.running;
});

async function spokenLookUp(chat: ReturnType<typeof followChat>, looking: ReturnType<typeof fakeWeb>, id: number, said: string, answer: string) {
  chat.wake.push({ kind: "wake", id });
  await settled();
  chat.wake.push({ kind: "done", id, answer: earsDone(said), textMs: 900 });
  await pause(20);
  looking.answerLast(looking.found(answer));
  await pause(20);
}

async function followSaid(chat: ReturnType<typeof followChat>, id: number, said: string) {
  chat.wake.push({ kind: "wake", id, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id, answer: earsDone(said), textMs: 700 });
  await pause(20);
}

test("what's said in the follow-up after a spoken look-up is checked: look sends it to the helper following on, chat sends it to Jarvis, and the next window after his answer isn't checked", { timeout: 5_000 }, async () => {
  const looking = fakeWeb(["look", "chat"]);
  const chat = followChat({ "Thanks, that's great.": said("You're welcome."), "What else is new?": said("Not much.") }, 0, { web: looking.web });
  await spokenLookUp(chat, looking, 4, "Hey Jarvis, look up the latest Node version.", "Node 26 is the latest.");
  assert.deepEqual(chat.asks, ["ask"], "a spoken look-up's answer opens a follow-up");
  await followSaid(chat, 5, "Who released it?");
  const earlier = { question: "the latest Node version.", answer: "Node 26 is the latest.", at: 2_300 };
  assert.deepEqual(looking.judged, [["Who released it?", earlier]]);
  assert.ok(chat.output().includes(`${heardPrefix}Who released it?\n  (${followOnNote("look", 250)})\n  (looking up: Who released it?)\n  (${followingOnNote(earlier)})\nJarvis: ${lookingUp}\n`), chat.output());
  assert.equal(looking.seen[1], withEarlier("Who released it?", earlier));
  looking.answerLast(looking.found("Its maintainers did."));
  await pause(20);
  assert.deepEqual([looking.recorded[1][1].followsOn, looking.recorded[1][1].judgedMs], [true, 250]);
  assert.deepEqual(chat.asks, ["ask", "ask"]);
  await followSaid(chat, 6, "Thanks, that's great.");
  assert.equal(looking.judged.length, 2);
  assert.ok(chat.output().includes(`${heardPrefix}Thanks, that's great.\n  (${followOnNote("chat", 250)})\nJarvis: You're welcome.`), chat.output());
  assert.equal(looking.seen.length, 2);
  await followSaid(chat, 7, "What else is new?");
  assert.equal(looking.judged.length, 2, "a window after one of his own answers goes to him without a check");
  assert.ok(chat.output().includes(`${heardPrefix}What else is new?\nJarvis: Not much.`), chat.output());
  assert.deepEqual(chat.events.filter((event) => event.startsWith("ask")).length, 2);
  chat.lines.close();
  await chat.running;
});

test("a check that gives no verdict, or fails, sends what was said to Jarvis, and saying look up in the window looks it up following on without a check", { timeout: 5_000 }, async () => {
  const looking = fakeWeb([null, "throw"]);
  const chat = followChat({ "Hmm, interesting.": said("Isn't it."), "Right then.": said("Indeed.") }, 0, { web: looking.web });
  await spokenLookUp(chat, looking, 4, "Hey Jarvis, look up the latest Node version.", "Node 26 is the latest.");
  await followSaid(chat, 5, "Hmm, interesting.");
  assert.ok(chat.output().includes(`  (${followOnNote(null, 250)})\nJarvis: Isn't it.`), chat.output());
  await spokenLookUp(chat, looking, 6, "Hey Jarvis, look up the latest Deno version.", "Deno 3 is the latest.");
  await followSaid(chat, 7, "Right then.");
  assert.ok(chat.output().includes(`${heardPrefix}Right then.\n  (${followOnNote(null, 250)})\nJarvis: Indeed.`), chat.output());
  await spokenLookUp(chat, looking, 8, "Hey Jarvis, look up the latest Bun version.", "Bun 2 is the latest.");
  await followSaid(chat, 9, "Look up who makes it.");
  assert.equal(looking.judged.length, 2, "look up said out loud is a look-up already, so it isn't checked");
  assert.equal(looking.seen[looking.seen.length - 1], withEarlier("who makes it.", { question: "the latest Bun version.", answer: "Bun 2 is the latest.", at: looking.web.now() }));
  chat.lines.close();
  await chat.running;
});

test("without a check to ask, what's said after a look-up goes to Jarvis, and a look-up that isn't answered opens no follow-up", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const web = { ...looking.web, followOn: undefined };
  const chat = followChat({ "Who released it?": said("I don't know.") }, 0, { web });
  await spokenLookUp(chat, looking, 4, "Hey Jarvis, look up the latest Node version.", "Node 26 is the latest.");
  await followSaid(chat, 5, "Who released it?");
  assert.ok(chat.output().includes(`  (${followOnNote(null, 0)})\nJarvis: I don't know.`), chat.output());
  const asked = chat.asks.length;
  chat.wake.push({ kind: "wake", id: 6 });
  await settled();
  chat.wake.push({ kind: "done", id: 6, answer: earsDone("Hey Jarvis, look up nothing at all."), textMs: 900 });
  await pause(20);
  looking.answerLast(looking.found(""));
  await pause(20);
  assert.equal(chat.asks.length, asked, "a look-up that found nothing opens no follow-up");
  chat.lines.close();
  await chat.running;
});

test("only what's heard in the follow-up straight after a look-up is checked: a Hey Jarvis question after that window has gone goes to Jarvis unchecked", { timeout: 5_000 }, async () => {
  const looking = fakeWeb(["look"]);
  const chat = followChat({ "What's the time?": said("Ten past nine.") }, 0, { web: looking.web });
  await spokenLookUp(chat, looking, 4, "Hey Jarvis, look up the latest Node version.", "Node 26 is the latest.");
  chat.wake.push({ kind: "no follow-up", why: "nothing was said" });
  await pause(20);
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("What's the time?"), textMs: 900 });
  await pause(20);
  assert.deepEqual(looking.judged, []);
  assert.ok(chat.output().includes(`${heardPrefix}What's the time?\nJarvis: Ten past nine.`), chat.output());
  chat.lines.close();
  await chat.running;
});

test("look-ups said in follow-ups count towards the follow-ups in a row, like any other question", { timeout: 5_000 }, async () => {
  const looking = fakeWeb();
  const chat = followChat({}, 0, { web: looking.web });
  await spokenLookUp(chat, looking, 4, "Hey Jarvis, look up the latest Node version.", "Node 26 is the latest.");
  for (let id = 5; id < 5 + followUpsInARow; id++) {
    await followSaid(chat, id, `Look up thing ${id}.`);
    looking.answerLast(looking.found(`Answer ${id}.`));
    await pause(20);
  }
  assert.equal(chat.asks.length, followUpsInARow);
  assert.ok(chat.output().includes(`  (${followLimitNote})`), chat.output());
  chat.lines.close();
  await chat.running;
});
