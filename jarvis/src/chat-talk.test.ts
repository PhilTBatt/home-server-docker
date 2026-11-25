import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { logLine, type LogContext, type Outcome } from "./answer-log.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { capNote, commandNote, droppedNote, heardPrefix, listeningNote, noListeningNote, notDroppedNote, notSentNote, runChat, talkCommandNote, talkOffNote, type ChatDeps } from "./chat.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Heard, Sent, Started, Talk } from "./talk.js";
import type { Answer } from "./timing.js";

type Script = (listener: AnswerListener) => Promise<Answer>;

const said = (text: string): Script => async (listener) => {
  listener.text?.(text);
  return { text, firstWordsMs: 400, totalMs: 900 };
};

function fakeSession(scripts: Record<string, Script>, events: string[]): AgentSession & { asked: string[] } {
  const asked: string[] = [];
  let stopped: string | null = null;
  return {
    asked,
    ask(question: string, listener: AnswerListener = {}) {
      asked.push(question);
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

const heard: Heard = { text: "Turn the lights on.", recordedMs: 2500, textMs: 1300 };

function fakeTalk(events: string[], replies: { start?: Started[]; send?: Sent[]; drop?: (string | null)[] } = {}) {
  const signals: (AbortSignal | undefined)[] = [];
  const named: string[] = [];
  const talk: Talk = {
    check: async () => "Ears: ready",
    start: async (signal) => {
      events.push("talk start");
      signals.push(signal);
      return replies.start?.shift() ?? { ok: true };
    },
    send: async (signal, _wake, id) => {
      events.push("talk send");
      signals.push(signal);
      named.push(`send ${id}`);
      return replies.send?.shift() ?? { ok: true, heard };
    },
    drop: async (signal, id) => {
      events.push("talk drop");
      signals.push(signal);
      named.push(`drop ${id}`);
      return replies.drop?.shift() ?? null;
    },
  };
  return { talk, signals, named };
}

async function* linesOf(...lines: string[]): AsyncGenerator<string> {
  for (const line of lines) yield line;
}

function chat(lines: string[], scripts: Record<string, Script>, overrides: (events: string[]) => Partial<ChatDeps> = () => ({})) {
  const events: string[] = [];
  const session = fakeSession(scripts, events);
  let output = "";
  const recorded: Outcome[] = [];
  const deps: ChatDeps = {
    lines: linesOf(...lines),
    session,
    write: (text) => {
      output += text;
    },
    prompt: () => {
      output += "You: ";
    },
    questionTimeoutMs: 1000,
    record: async (outcome) => void recorded.push(outcome),
    ...overrides(events),
  };
  return { run: () => runChat(deps), output: () => output, events, session, recorded };
}

test("/talk starts listening and says how to send or drop it; Enter on an empty line sends what was heard, shows it as said, and asks it", async () => {
  const closing = new AbortController().signal;
  let made: ReturnType<typeof fakeTalk> | undefined;
  const { run, output, events, recorded } = chat(["/talk", ""], { "Turn the lights on.": said("Done.") }, (events) => {
    made = fakeTalk(events);
    return { talk: made.talk, closing };
  });
  await run();
  assert.deepEqual(events, ["talk start", "talk send", "ask Turn the lights on."]);
  assert.ok(output().includes(`You:   (${listeningNote})\nYou: ${heardPrefix}Turn the lights on.\nJarvis: Done.`), output());
  assert.equal(listeningNote, "listening for up to 30 seconds: press Enter on an empty line to send what you say, or type anything else to drop it");
  assert.equal(heardPrefix, "You said: ");
  assert.deepEqual(made?.signals, [closing, closing], "starting and sending can be called off when the chat closes");
  assert.deepEqual(recorded.map((outcome) => outcome.heard), [heard]);
});

test("a typed question is logged with no heard times, a spoken one with them, and the log never holds the words that were heard", () => {
  const context: LogContext = { engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "off", kokoroSpeed: 1, speechStart: "sentence", speechStop: "now", speechBundle: "off", spokenStyle: "off", persona: "off", liveFacts: "off" };
  const at = new Date("2026-11-20T20:00:00Z");
  const answer = { text: "Done.", firstWordsMs: 400, totalMs: 900 };
  assert.equal(logLine(context, "c", 1, at, { answer }).heard, undefined);
  const spoken = logLine(context, "c", 1, at, { answer, heard: { ...heard, recordedMs: 2500.4, textMs: 1299.6 } });
  assert.deepEqual(spoken.heard, { recordedMs: 2500, textMs: 1300 });
  assert.deepEqual(logLine(context, "c", 1, at, { error: "The agent stopped", heard }).heard, { recordedMs: 2500, textMs: 1300 });
  assert.equal(JSON.stringify(spoken).includes("lights"), false);
  assert.deepEqual(logLine(context, "c", 1, at, { answer, heard: { ...heard, wake: true, ender: "silero" } }).heard, { recordedMs: 2500, textMs: 1300, wake: true, ender: "silero" });
  assert.deepEqual(logLine(context, "c", 1, at, { answer, heard: { ...heard, wake: true } }).heard, { recordedMs: 2500, textMs: 1300, wake: true });
});

test("anything typed while listening drops the recording first, then is taken as usual", async () => {
  const { run, output, events } = chat(["/talk", "What's the weather?", "/talk", "exit"], { "What's the weather?": said("Sunny.") }, (events) => ({ talk: fakeTalk(events).talk }));
  await run();
  assert.deepEqual(events, ["talk start", "talk drop", "ask What's the weather?", "talk start", "talk drop"]);
  assert.equal(output().split(`(${droppedNote})`).length - 1, 2);
  assert.equal(droppedNote, "dropped that recording");
});

test("the chat names the recording it started when it sends it, drops it, or leaves it at the end", async () => {
  let made: ReturnType<typeof fakeTalk> | undefined;
  const { run } = chat(["/talk", "", "/talk", "never mind", "/talk", "exit", "/talk"], { "Turn the lights on.": said("Done."), "never mind": said("OK.") }, (events) => {
    made = fakeTalk(events, { start: [{ ok: true, id: 11 }, { ok: true, id: 12 }, { ok: true, id: 13 }] });
    return { talk: made.talk };
  });
  await run();
  assert.deepEqual(made?.named, ["send 11", "drop 12", "drop 13"]);
  let ended: ReturnType<typeof fakeTalk> | undefined;
  const { run: runAgain } = chat(["/talk"], {}, (events) => {
    ended = fakeTalk(events, { start: [{ ok: true, id: 14 }] });
    return { talk: ended.talk };
  });
  await runAgain();
  assert.deepEqual(ended?.named, ["drop 14"]);
});

test("a start that gives no number sends and drops without one, as before", async () => {
  let made: ReturnType<typeof fakeTalk> | undefined;
  const { run } = chat(["/talk", "", "/talk", "exit"], { "Turn the lights on.": said("Done.") }, (events) => {
    made = fakeTalk(events);
    return { talk: made.talk };
  });
  await run();
  assert.deepEqual(made?.named, ["send null", "drop null"]);
});

test("the chat says it's ready while it waits for what's typed or heard, and busy while it handles it", async () => {
  const marks: boolean[] = [];
  let during: boolean | null = null;
  const { run } = chat(["hello"], { hello: async (listener) => ((during = marks.at(-1) ?? null), said("Hi.")(listener)) }, () => ({ ready: (yes: boolean) => void marks.push(yes) }));
  await run();
  assert.equal(during, false);
  assert.deepEqual(marks, [true, false, true, false]);
});

test("an empty line typed before the listening prompt came back is ignored, and the next Enter sends", async () => {
  const typedEarly = [true];
  const { run, output, events } = chat(["/talk", "", ""], { "Turn the lights on.": said("Done.") }, (events) => ({
    talk: fakeTalk(events).talk,
    early: () => typedEarly.shift() ?? false,
  }));
  await run();
  assert.deepEqual(events, ["talk start", "talk send", "ask Turn the lights on."]);
  assert.ok(output().includes(`(${listeningNote})\nYou: You: You said: Turn the lights on.`), output());
});

test("a start that's refused says why, leaves nothing listening, and an empty line after it does nothing more", async () => {
  const { run, output, events } = chat(["/talk", ""], {}, (events) => ({ talk: fakeTalk(events, { start: [{ ok: false, why: "ears is muted, so unmute it\u001b[31m" }] }).talk }));
  await run();
  assert.deepEqual(events, ["talk start"]);
  assert.ok(output().includes(`  (${noListeningNote("ears is muted, so unmute it[31m")})\nYou: You: `), output());
  assert.equal(noListeningNote("x"), "couldn't start listening: x");
});

test("when nothing comes back to send, it says why, asks nothing, and the chat carries on", async () => {
  const { run, output, events } = chat(["/talk", "", "Hello"], { Hello: said("Hi.") }, (events) => ({ talk: fakeTalk(events, { send: [{ ok: false, why: "Whisper heard no words" }] }).talk }));
  await run();
  assert.deepEqual(events, ["talk start", "talk send", "ask Hello"]);
  assert.match(output(), /\(nothing was sent: Whisper heard no words\)/);
  assert.equal(notSentNote("x"), "nothing was sent: x");
});

test("what was heard is always asked as a question, even when it reads like exit, new, a rating or a command", async () => {
  const words = ["exit", "new", "+", "/talk"];
  const sends: Sent[] = words.map((text) => ({ ok: true, heard: { ...heard, text } }));
  const scripts = Object.fromEntries(words.map((word) => [word, said("Okay.")]));
  const { run, events } = chat(words.flatMap(() => ["/talk", ""]), scripts, (events) => ({ talk: fakeTalk(events, { send: sends }).talk }));
  await run();
  assert.deepEqual(events.filter((event) => event.startsWith("ask")), words.map((word) => `ask ${word}`));
});

test("what was heard is shown without control characters", async () => {
  const { run, output } = chat(["/talk", ""], { "Lights\u001b[2J on.": said("Done.") }, (events) => ({ talk: fakeTalk(events, { send: [{ ok: true, heard: { ...heard, text: "Lights\u001b[2J on." } }] }).talk }));
  await run();
  assert.match(output(), /You said: Lights\[2J on\.\n/);
});

test("past the cap, what was heard isn't sent either, and the cap note says why", async () => {
  const { run, output, events } = chat(["/talk", ""], {}, (events) => ({ talk: fakeTalk(events).talk, lengthCap: 100, knownSize: 200 }));
  await run();
  assert.deepEqual(events, ["talk start", "talk send"]);
  assert.match(output(), new RegExp(`\\(${capNote(100)}\\)`));
});

test("with push-to-talk off, /talk says how to turn it on, and other / commands keep their note", async () => {
  const { run, output, events } = chat(["/talk", "/TALK", "/help"], {});
  await run();
  assert.deepEqual(events, []);
  assert.equal(output().split(`(${talkOffNote})`).length - 1, 2);
  assert.match(output(), new RegExp(`\\(${commandNote}\\)`));
  assert.equal(talkOffNote, "push-to-talk is off: set JARVIS_EARS=push in jarvis/.env, then start Jarvis with bash host/jarvis.sh");
});

test("with push-to-talk on, other / commands say /talk is the only one", async () => {
  const { run, output } = chat(["/help"], {}, (events) => ({ talk: fakeTalk(events).talk }));
  await run();
  assert.match(output(), new RegExp(`\\(${talkCommandNote}\\)`));
  assert.equal(talkCommandNote, "Jarvis's only / command is /talk. To start a new chat, type new");
});

test("the chat ending while listening drops the recording, without the closing signal so the drop still reaches ears", async () => {
  let made: ReturnType<typeof fakeTalk> | undefined;
  const closing = new AbortController();
  const { run, output, events } = chat(["/talk"], {}, (events) => {
    made = fakeTalk(events);
    return { talk: made.talk, closing: closing.signal };
  });
  closing.abort();
  await run();
  assert.deepEqual(events, ["talk start", "talk drop"]);
  assert.equal(made?.signals[1], undefined);
  assert.match(output(), new RegExp(`\\(${droppedNote}\\)`));
});

test("a drop that fails says why, and that ears ends the recording by itself", async () => {
  const { run, output } = chat(["/talk", "hello"], { hello: said("Hi.") }, (events) => ({ talk: fakeTalk(events, { drop: ["Couldn't reach ears"] }).talk }));
  await run();
  assert.ok(output().includes(`(${notDroppedNote("Couldn't reach ears")})`), output());
  assert.equal(notDroppedNote("x"), "couldn't drop that recording: x. Ears ends it by itself within 30 seconds and turns it into text, which bash host/ears.sh mute clears");
});

const quiet: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: 300, longestSilenceMs: null, spoken: 1, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 1, requestedSentences: 1, problem: null, gaveUp: false, tooLong: false, stopped: false };

test("/talk stops him talking at once before it listens, even when he'd usually finish his sentence, so the microphone doesn't hear him", async () => {
  const events: string[] = [];
  let halted = false;
  let finish = () => {};
  const done = new Promise<void>((resolve) => (finish = resolve));
  const speech: AnswerSpeech = {
    text: () => {},
    gap: () => {},
    tool: () => {},
    restart: () => {},
    end: () => events.push("speech end"),
    stop: () => {
      events.push("speech stop");
      halted = true;
      finish();
    },
    finish: () => {
      events.push("speech finish");
      return true;
    },
    done: () => done,
    report: () => ({ ...quiet, stopped: halted }),
  };
  const { run, output } = chat(["Hello", "/talk", ""], { Hello: said("Hi there."), "Turn the lights on.": said("Done.") }, () => ({
    talk: fakeTalk(events).talk,
    speak: () => speech,
    speechStop: "sentence",
  }));
  await run();
  assert.deepEqual(events.slice(0, 3), ["speech end", "speech stop", "talk start"]);
  assert.equal(events.includes("speech finish"), false);
  assert.match(output(), /\(stopped talking\)\n {2}\(listening/);
});
