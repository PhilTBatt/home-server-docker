import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { runChat, type ChatDeps, type NewChat } from "./chat.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Talk } from "./talk.js";
import type { Answer } from "./timing.js";
import type { WakeEvent } from "./wake.js";
import { morningFailedSay, morningHint, morningSnoozeSay, morningTrainMs, morningUpSay, type MorningAnswer, type MorningEvent, type MorningPhase } from "./morning.js";
import type { ModeEvent, ModeHub, ModeState } from "./modes.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function settled() {
  for (let round = 0; round < 12; round++) await tick();
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

function fakeSession(label: string, asked: string[]): AgentSession {
  let stopped: string | null = null;
  return {
    async ask(question: string, listener: AnswerListener = {}): Promise<Answer> {
      asked.push(`${label}: ${question}`);
      listener.text?.("OK.");
      return { text: "OK.", firstWordsMs: 1, totalMs: 2 };
    },
    readyMs: () => null,
    costUsd: () => 0,
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
  return { speech, finish: () => finish() };
}

function morningChat(options: { fail?: string; modes?: boolean; guest?: boolean; train?: (signal: AbortSignal) => Promise<string | null> } = {}) {
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const news = channel<MorningEvent>();
  const modeEvents = channel<ModeEvent>();
  const events: string[] = [];
  const asked: string[] = [];
  const told: MorningAnswer[] = [];
  const loud: (number | null)[] = [];
  const modeSets: string[] = [];
  const speeches: ReturnType<typeof heldSpeech>[] = [];
  let heard = "I'm up";
  let output = "";
  const talk: Talk = {
    check: async () => "Ears: ready",
    start: async () => ({ ok: true, id: 20 }),
    send: async () => ({ ok: true, heard: { text: heard, recordedMs: 1500, textMs: 500 } }),
    drop: async () => null,
  };
  const hub: ModeHub = {
    get: async () => ({ mode: "normal", until: null, by: "start" }),
    set: async (mode, until, by) => (modeSets.push(`${mode} ${by}`), { mode, until: until?.toISOString() ?? null, by }),
    schedule: async () => {},
  };
  const chatFor = (label: string): NewChat => ({ session: fakeSession(label, asked), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [] });
  const deps: ChatDeps = {
    lines: lines.items,
    session: fakeSession("normal", asked),
    write: (text) => void (output += text),
    prompt: () => void (output += "You: "),
    questionTimeoutMs: 1000,
    speak: () => {
      const made = heldSpeech(events);
      speeches.push(made);
      return made.speech;
    },
    talk,
    wake: wake.items,
    clock: () => new Date("2026-11-30T06:45:00Z"),
    closing: new AbortController().signal,
    interrupt: () => void events.push("interrupt"),
    morning: {
      news: { events: news.items },
      hub: {
        async answer(kind) {
          told.push(kind);
          if (options.fail !== undefined) throw new Error(options.fail);
          return { phase: kind === "up" ? "up" : "snoozed", day: "2026-11-30", at: "06:45", speakSlot: null };
        },
      },
      loud: async (level) => void loud.push(level),
      sound: async () => void events.push("sound"),
      train: options.train ?? (async () => "From Northgate: the 07:14 is on time."),
      volume: 80,
    },
    ...(options.modes === true ? { modes: { hub, events: modeEvents.items } } : {}),
    ...(options.guest === true ? { guest: { open: async () => chatFor("guest") } } : {}),
  };
  const running = runChat(deps);
  return {
    lines,
    events,
    asked,
    told,
    loud,
    modeSets,
    speeches,
    output: () => output,
    async morning(phase: MorningPhase, speakSlot: number | null = null, day = "2026-11-30") {
      news.push({ kind: "morning", view: { phase, day, at: "06:45", speakSlot } });
      await settled();
    },
    async note(line: string) {
      news.push({ kind: "morning note", line });
      await settled();
    },
    async mode(state: ModeState) {
      modeEvents.push({ kind: "mode", state });
      await settled();
    },
    async say(text: string) {
      heard = text;
      lines.push("/talk");
      await settled();
      lines.push("");
      await settled();
    },
    async type(text: string) {
      lines.push(text);
      await settled();
    },
    finishAll() {
      for (const one of speeches) one.finish();
    },
    async end() {
      lines.close();
      await running;
    },
  };
}

test("the soft sound plays once a morning, 30 under his usual level, and the level goes back after", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.morning("brightening");
  assert.deepEqual([chat.events, chat.loud], [[], []], "nothing while the wall only brightens");
  await chat.morning("sound");
  assert.deepEqual([chat.events, chat.loud], [["sound"], [50, null]]);
  await chat.morning("sound");
  assert.deepEqual(chat.events, ["sound"], "not twice the same morning");
  await chat.morning("sound", null, "2026-12-01");
  assert.deepEqual(chat.events, ["sound", "sound"], "but again the next");
  await chat.end();
});

test("the first time he says morning it's good morning, the time, the first train and how to stop it; then just the time, 10 louder each time, with the level put back after each", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.morning("speaking", 0);
  assert.ok(chat.output().includes(`Jarvis: Good morning. It's 06:45. From Northgate: the 07:14 is on time. ${morningHint}\n`), chat.output());
  assert.deepEqual(chat.loud, [50]);
  chat.finishAll();
  await settled();
  assert.deepEqual(chat.loud, [50, null], "back to his usual level once it's said");
  await chat.morning("speaking", 1);
  chat.finishAll();
  await chat.morning("speaking", 7);
  chat.finishAll();
  await settled();
  assert.ok(chat.output().includes("Jarvis: It's 06:45. Time to get up.\n"));
  assert.deepEqual(chat.loud, [50, null, 60, null, 100, null]);
  assert.deepEqual(chat.asked, [], "none of it goes to Claude");
  await chat.end();
});

test("he never talks over himself: a slot that comes while he's speaking is skipped, and the next one is the first line if none was said", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.type("What's on today?");
  await chat.morning("speaking", 0);
  assert.ok(!chat.output().includes("Good morning"), chat.output());
  chat.finishAll();
  await settled();
  await chat.morning("speaking", 0);
  assert.ok(chat.output().includes("Jarvis: Good morning."), "the same slot again, now he's quiet");
  chat.finishAll();
  await chat.morning("speaking", 0);
  assert.equal(chat.output().split("Good morning.").length, 2, "but never twice");
  assert.ok(!chat.output().includes("Time to get up"), "not even the shorter line");
  await chat.end();
});

test("if the first train takes more than 3 seconds to find, he says good morning without it", { timeout: 8_000 }, async () => {
  const chat = morningChat({ train: (signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve(null), { once: true })) });
  await settled();
  const started = Date.now();
  await chat.morning("speaking", 0);
  while (!chat.output().includes("Good morning.") && Date.now() - started < 6_000) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(Date.now() - started >= morningTrainMs - 100 && Date.now() - started < morningTrainMs + 1_500, `took ${Date.now() - started} ms`);
  assert.ok(chat.output().includes(`Jarvis: Good morning. It's 06:45. ${morningHint}\n`), chat.output());
  await chat.end();
});

test("saying I'm up tells the hub by voice, puts his level back and he says good morning; five more minutes puts it off", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.morning("speaking", 0);
  await chat.say("Five more minutes.");
  assert.deepEqual(chat.told, ["snooze"]);
  assert.ok(chat.output().includes(`Jarvis: ${morningSnoozeSay}\n`));
  assert.ok(chat.events.includes("speech stop"), "his morning line stops when he's answered");
  await chat.morning("speaking", 5);
  chat.finishAll();
  await chat.say("I'm up.");
  assert.deepEqual(chat.told, ["snooze", "up"]);
  assert.ok(chat.output().endsWith(`Jarvis: ${morningUpSay}\n`) || chat.output().includes(`Jarvis: ${morningUpSay}\n`), chat.output());
  assert.ok(chat.loud.filter((level) => level === null).length >= 2, "the level is put back when he's answered");
  assert.deepEqual(chat.asked, []);
  await chat.say("I'm up.");
  assert.deepEqual(chat.told, ["snooze", "up"], "once the hub says he's up, I'm up isn't the morning's any more");
  assert.equal(chat.asked.length, 1);
  await chat.end();
});

test("before Jarvis speaks, I'm up works but five more minutes isn't the morning's; outside the morning neither is", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.say("I'm up.");
  await chat.morning("before");
  await chat.say("Five more minutes.");
  assert.deepEqual([chat.told, chat.asked.length], [[], 2], "nothing before the morning starts");
  await chat.morning("brightening");
  await chat.say("Five more minutes.");
  assert.deepEqual([chat.told, chat.asked.length], [[], 3]);
  await chat.say("I'm up.");
  assert.deepEqual(chat.told, ["up"]);
  await chat.end();
});

test("in the two hours before wake-up time, I'm up stops the day's morning, but five more minutes is still nothing to put off", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.morning("early");
  await chat.say("Five more minutes.");
  assert.deepEqual([chat.told, chat.asked.length], [[], 1]);
  await chat.say("I'm up.");
  assert.deepEqual([chat.told, chat.asked.length], [["up"], 1]);
  await chat.end();
});

test("typed, I'm up is never the morning's", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.morning("speaking", 0);
  chat.finishAll();
  await chat.type("I'm up");
  assert.deepEqual([chat.told, chat.asked.map((one) => one.split("\n")[0])], [[], ["normal: I'm up"]]);
  await chat.end();
});

test("if the hub can't be told, he says so, with why in the terminal", { timeout: 5_000 }, async () => {
  const chat = morningChat({ fail: "the hub said: The morning is switched off" });
  await settled();
  await chat.morning("speaking", 0);
  await chat.say("I'm up.");
  assert.ok(chat.output().includes(`  (the morning: the hub said: The morning is switched off)\nJarvis: ${morningFailedSay}\n`), chat.output());
  await chat.end();
});

test("in bedtime mode, I'm up also tells the hub he's up and then switches back to normal, as it always has", { timeout: 5_000 }, async () => {
  const chat = morningChat({ modes: true });
  await settled();
  await chat.mode({ mode: "bedtime", until: null, by: "voice" });
  await chat.morning("speaking", 0);
  chat.finishAll();
  await chat.say("I'm up.");
  assert.deepEqual([chat.told, chat.modeSets], [["up"], ["normal typed"]], "said through /talk at the terminal, so typed, as for any mode word");
  assert.ok(chat.output().includes("Jarvis: Back to normal.\n"), chat.output());
  await chat.end();
});

test("a guest chat neither wakes anyone nor answers for the morning", { timeout: 5_000 }, async () => {
  const chat = morningChat({ guest: true });
  await settled();
  await chat.type("/guest");
  chat.finishAll();
  await settled();
  await chat.morning("sound");
  await chat.morning("speaking", 0);
  await chat.say("I'm up.");
  assert.deepEqual([chat.events.filter((event) => event === "sound"), chat.told, chat.output().includes("Good morning.")], [[], [], false]);
  await chat.end();
});

test("the morning's notes are shown in the terminal", { timeout: 5_000 }, async () => {
  const chat = morningChat();
  await settled();
  await chat.note("the morning: the hub is answering again");
  assert.ok(chat.output().includes("  (the morning: the hub is answering again)\n"));
  await chat.end();
});
