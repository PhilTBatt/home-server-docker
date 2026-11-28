import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { guestLeftUntoldNote, guestModesOffNote, guestModesOffSay, guestToldNote, guestUnheardNote, guestUnheardSay, unjudgedModeNote, unjudgedModeSay, strangerGuestNote, voiceNote, guestHeldNote, guestHeldSay, guestOffNote, guestOnNote, guestTrainsNote, heardPrefix, modeFailedSay, modeNote, modeUsageNote, notInGuestSay, runChat, unsaidNote, type ChatDeps, type NewChat } from "./chat.js";
import type { EarsAnswer, EarsVoice } from "./ears-client.js";
import { awaySay, guestModeRefusedSay, guestOffByVoiceSay, modeSays, modesBackNote, modesOffNote, ModesOff, whenBackAsk, whenNotCaught, type Mode, type ModeEvent, type ModeHub, type ModeState } from "./modes.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Sent, Talk } from "./talk.js";
import type { TrainEvent } from "./train-news.js";
import { guestRemindersNote, reminderSay, type DueReminder, type ReminderAnswer, type ReminderEvent } from "./reminders.js";
import { trainSay } from "./train-news.js";
import type { WakeEvent } from "./wake.js";
import type { OtherVoices } from "./config.js";
import type { SessionChange, SessionEvent } from "./session-news.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function settled() {
  for (let round = 0; round < 30; round++) await tick();
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

function fakeSession(label: string, asked: string[]): AgentSession & { closed: () => boolean } {
  let stopped: string | null = null;
  return {
    async ask(question: string, listener: AnswerListener = {}) {
      asked.push(`${label}: ${question.replace(/\n\n\[Time now: [^\]]*\]$/, "")}`);
      const text = `${label} answer.`;
      listener.text?.(text);
      return { text, firstWordsMs: 400, totalMs: 900 };
    },
    readyMs: () => null,
    costUsd: () => 0.01,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
    closed: () => stopped !== null,
  };
}

const done = Promise.resolve();

function fakeSpeech(spoken: string[]): AnswerSpeech {
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  return { text: (text: string) => void spoken.push(text), gap: () => {}, tool: () => {}, restart: () => {}, end: () => {}, stop: () => void (report.stopped = true), finish: () => false, done: () => done, report: () => report };
}

function fakeTalk(): Talk {
  return { check: async () => "Ears: ready", start: async () => ({ ok: true, id: 20 }), send: async (): Promise<Sent> => ({ ok: true, heard: { text: "unused", recordedMs: 1, textMs: 1 } }), drop: async () => null };
}

function earsDone(text: string, voice?: EarsVoice): EarsAnswer {
  return { status: 200, state: "idle", reason: null, error: null, seconds: null, last: { seconds: 3.4, reason: "it went quiet for 1.5 seconds after you spoke", text, textProblem: null, ...(voice === undefined ? {} : { voice }) } };
}

function fakeHub(fail: Partial<Record<Mode, string>> = {}, off = { on: false }) {
  const sets: Array<{ mode: Mode; until: string | null; by: string }> = [];
  const schedules: Array<{ mode: Mode; at: string }> = [];
  let at: Mode = "normal";
  const hub: ModeHub = {
    get: async () => Promise.reject(new Error("unused")),
    async set(mode, until, by) {
      if (off.on) throw new ModesOff(modesOffNote);
      if (fail[mode] !== undefined) throw new Error(fail[mode]);
      if (by === "voice" && at === "guest" && mode !== "guest") throw new Error("a voice can't end guest mode");
      at = mode;
      sets.push({ mode, until: until?.toISOString() ?? null, by });
      return { mode, until: until?.toISOString() ?? null, by };
    },
    async schedule(mode, at) {
      schedules.push({ mode, at: at.toISOString() });
    },
  };
  return { hub, sets, schedules, fail, off };
}

const now = new Date("2026-11-27T10:00:00Z");

function modeChat(options: { projector?: boolean; modes?: boolean; guest?: boolean; fail?: Partial<Record<Mode, string>>; off?: boolean; retryMs?: number; ears?: boolean; when?: Date | null; clock?: () => Date; follow?: boolean; voices?: OtherVoices } = {}) {
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const modeEvents = channel<ModeEvent>();
  const trainEvents = channel<TrainEvent>();
  let trainsWaiting: string[] = [];
  const reminderEvents = channel<ReminderEvent>();
  let remindersWaiting: DueReminder[] = [];
  const answers: Array<[string, ReminderAnswer]> = [];
  const guestsThrough: boolean[] = [];
  const sessionEvents = channel<SessionEvent>();
  let sessionsWaiting: SessionChange[] = [];
  const asked: string[] = [];
  const spoken: string[] = [];
  const follows: string[] = [];
  const phone: string[] = [];
  const opened: string[] = [];
  const whens: string[] = [];
  const sessions: Array<AgentSession & { closed: () => boolean }> = [];
  let output = "";
  const hub = fakeHub(options.fail ?? {}, { on: options.off === true });
  const chatFor = (label: string): NewChat => {
    const session = fakeSession(label, asked);
    sessions.push(session);
    opened.push(label);
    return { session, record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [], web: undefined };
  };
  const first = fakeSession("normal", asked);
  sessions.push(first);
  const deps: ChatDeps = {
    lines: lines.items,
    session: first,
    write: (text) => void (output += text),
    prompt: () => void (output += "You: "),
    questionTimeoutMs: 1000,
    speak: () => fakeSpeech(spoken),
    talk: fakeTalk(),
    wake: wake.items,
    clock: options.clock ?? (() => now),
    reminders: {
      news: {
        events: reminderEvents.items,
        take() {
          const taken = remindersWaiting;
          remindersWaiting = [];
          return taken;
        },
      },
      hub: { answer: async (id, answer) => void answers.push([id, answer]) },
    },
    ...(options.follow === false ? {} : { followUp: { seconds: 5, ask: () => void follows.push("follow"), gapMs: 0 } }),
    codeWords: { note: async () => ({ say: "Noted." }), phone: async () => (phone.push("rang"), { say: "Your phone's ringing for 30 seconds. Say found it when you have it." }), trains: async () => ({ say: "unused" }), found: async () => (phone.push("found"), { say: "Good, I've stopped it ringing." }), ...(options.projector === true ? { projector: async (on: boolean) => (phone.push(on ? "projector on" : "projector off"), { say: on ? "Turning the projector on." : "Turning the projector off." }) } : {}) },
    trains: {
      events: trainEvents.items,
      take() {
        const taken = trainsWaiting;
        trainsWaiting = [];
        return taken;
      },
    },
    newChat: async () => chatFor("normal"),
    sessions: {
      events: sessionEvents.items,
      take() {
        const taken = sessionsWaiting;
        sessionsWaiting = [];
        return taken;
      },
    },
    ...(options.voices === undefined ? {} : { voices: { other: options.voices } }),
    projectorWords: options.projector === true,
    ...(options.ears === false ? {} : { earsGuests: async (on: boolean) => void guestsThrough.push(on) }),
    ...(options.guest === false ? {} : { guest: { open: async () => chatFor("guest") } }),
    ...(options.modes === true ? { modes: { hub: hub.hub, events: modeEvents.items, ...(options.retryMs === undefined ? {} : { retryMs: options.retryMs }) }, when: async (said: string) => (whens.push(said), options.when === undefined ? new Date("2026-11-29T18:00:00Z") : options.when) } : {}),
  };
  const running = runChat(deps);
  let id = 0;
  return {
    lines,
    hub,
    asked,
    spoken,
    follows,
    phone,
    opened,
    whens,
    sessions,
    running,
    output: () => output,
    guestsThrough,
    async session(...more: SessionChange[]) {
      sessionsWaiting.push(...more);
      sessionEvents.push({ kind: "sessions" });
      await settled();
    },
    async say(text: string, voice?: EarsVoice) {
      id++;
      wake.push({ kind: "wake", id });
      await settled();
      wake.push({ kind: "done", id, answer: earsDone(text, voice), textMs: 900 });
      await settled();
    },
    async type(text: string) {
      lines.push(text);
      await settled();
    },
    async mode(state: ModeState) {
      modeEvents.push({ kind: "mode", state });
      await settled();
    },
    async modeNote(line: string) {
      modeEvents.push({ kind: "mode note", line });
      await settled();
    },
    async train(...more: string[]) {
      trainsWaiting.push(...more);
      trainEvents.push({ kind: "trains" });
      await settled();
    },
    answers,
    async remind(...more: DueReminder[]) {
      remindersWaiting.push(...more);
      reminderEvents.push({ kind: "reminders" });
      await settled();
    },
    async end() {
      lines.close();
      await running;
    },
  };
}

test("typed /guest asks the hub for guest mode, then starts a fresh guest chat, closes the old one, and says so", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.type("/guest");
  assert.deepEqual(chat.hub.sets, [{ mode: "guest", until: null, by: "typed" }]);
  assert.deepEqual(chat.opened, ["guest"]);
  assert.equal(chat.sessions[0].closed(), true);
  assert.ok(chat.output().includes(`  (${guestOnNote})\nJarvis: ${modeSays.guest}`), chat.output());
  await chat.type("Who are you?");
  assert.deepEqual(chat.asked, ["guest: Who are you?"]);
  await chat.end();
});

test("in guest mode the hub's code words and brain questions are refused without reaching the hub, and new starts another guest chat", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.type("/guest");
  await chat.say("Find my phone.");
  assert.deepEqual(chat.phone, []);
  assert.equal(chat.spoken.at(-1), notInGuestSay);
  await chat.say("Brain questions.");
  assert.equal(chat.spoken.at(-1), notInGuestSay);
  await chat.type("/questions");
  assert.equal(chat.spoken.at(-1), notInGuestSay);
  await chat.type("new");
  assert.deepEqual(chat.opened, ["guest", "guest"], "new stays in guest mode");
  await chat.type("Hello");
  assert.deepEqual(chat.asked, ["guest: Hello"]);
  await chat.end();
});

test("guest mode can't be left by voice, and no other mode can be set by voice while in it, so a guest can't talk him out of it", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.say("Guest mode.");
  assert.deepEqual(chat.hub.sets, [{ mode: "guest", until: null, by: "voice" }]);
  for (const said of ["Guest mode off.", "Turn off guest mode please."]) {
    await chat.say(said);
    assert.equal(chat.spoken.at(-1), guestOffByVoiceSay, said);
  }
  for (const said of ["Normal mode.", "Bedtime.", "I'm not here.", "Coding mode."]) {
    await chat.say(said);
    assert.equal(chat.spoken.at(-1), guestModeRefusedSay, said);
  }
  assert.equal(chat.hub.sets.length, 1);
  assert.deepEqual(chat.opened, ["guest"]);
  await chat.say("Guest mode.");
  assert.equal(chat.spoken.at(-1), "Guest mode is already on.");
  await chat.end();
});

test("typed /guest off asks the hub for normal and starts a fresh normal chat with the hub's code words back", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.type("/guest");
  await chat.type("/guest off");
  assert.deepEqual(chat.hub.sets.map((set) => [set.mode, set.by]), [["guest", "typed"], ["normal", "typed"]]);
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  assert.ok(chat.output().includes(`  (${guestOffNote})\nJarvis: Guest mode is off.`), chat.output());
  await chat.say("Find my phone.");
  assert.deepEqual(chat.phone, ["rang"]);
  await chat.type("/guest off");
  assert.equal(chat.spoken.at(-1), "Guest mode isn't on.");
  await chat.end();
});

test("if the hub won't change the mode, he says so and stays as he was", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { normal: "the hub said: no" } });
  await chat.type("/guest");
  await chat.type("/guest off");
  assert.equal(chat.spoken.at(-1), modeFailedSay);
  assert.ok(chat.output().includes("(couldn't change the mode: the hub said: no)"), chat.output());
  assert.deepEqual(chat.opened, ["guest"]);
  await chat.type("Still here?");
  assert.deepEqual(chat.asked, ["guest: Still here?"]);
  await chat.end();
});

test("the hub's mode changing, as from the phone page, switches him into guest mode and back, and other changes are noted on screen", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.mode({ mode: "normal", until: null, by: "start" });
  assert.deepEqual(chat.opened, []);
  await chat.mode({ mode: "guest", until: null, by: "phone" });
  assert.deepEqual(chat.opened, ["guest"]);
  assert.ok(chat.output().includes(`(${modeNote("guest", null, "phone")})`), chat.output());
  await chat.mode({ mode: "normal", until: null, by: "phone" });
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  await chat.mode({ mode: "bedtime", until: "2026-11-28T07:30:00.000Z", by: "schedule" });
  assert.ok(chat.output().includes(`(${modeNote("bedtime", "2026-11-28T07:30:00.000Z", "schedule")})`), chat.output());
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  assert.equal(chat.hub.sets.length, 0, "he never sets the mode back when the hub tells him");
  await chat.end();
});

test("without the hub's modes, guest mode still works in Jarvis alone", { timeout: 5_000 }, async () => {
  const chat = modeChat();
  await chat.type("/guest");
  assert.deepEqual(chat.opened, ["guest"]);
  await chat.type("/guest off");
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  await chat.say("Bedtime.");
  assert.ok(chat.output().includes(`${heardPrefix}Bedtime.`), chat.output());
  assert.deepEqual(chat.asked, ["normal: Bedtime."], "with modes off, a mode word goes to Claude");
  await chat.end();
});

test("with guest mode off, /guest and guest mode aren't his: the spoken words go to Claude", { timeout: 5_000 }, async () => {
  const chat = modeChat({ guest: false });
  await chat.say("Guest mode.");
  assert.deepEqual(chat.asked, ["normal: Guest mode."]);
  await chat.end();
});

test("I'm not here sets away at once, asks when he's back, and sets the end from his answer, spoken or typed", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.say("I'm not here.");
  assert.deepEqual(chat.hub.sets, [{ mode: "away", until: null, by: "voice" }]);
  assert.equal(chat.spoken.at(-1), whenBackAsk);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await settled();
  assert.deepEqual(chat.follows, ["follow"]);
  await chat.say("Sunday evening.");
  assert.deepEqual(chat.whens, ["Sunday evening."]);
  assert.deepEqual(chat.hub.sets.at(-1), { mode: "away", until: "2026-11-29T18:00:00.000Z", by: "voice" });
  assert.equal(chat.spoken.at(-1), awaySay(new Date("2026-11-29T18:00:00Z"), now));
  await chat.type("/mode away");
  assert.equal(chat.spoken.at(-1), whenBackAsk);
  await chat.type("Sunday at six");
  assert.deepEqual(chat.hub.sets.at(-1), { mode: "away", until: "2026-11-29T18:00:00.000Z", by: "typed" });
  await chat.type("What's on?");
  assert.deepEqual(chat.asked, ["normal: What's on?"], "only the next thing he says is taken as when");
  await chat.end();
});

test("an answer about when he's back that can't be read keeps away on with no end, and away until a time is set in one go", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, when: null });
  await chat.say("I'm going away.");
  await chat.say("Not sure.");
  assert.equal(chat.spoken.at(-1), whenNotCaught);
  assert.equal(chat.hub.sets.length, 1);
  await chat.say("I'm away until next week.");
  assert.deepEqual(chat.whens, ["Not sure.", "next week"]);
  assert.equal(chat.spoken.at(-1), `${awaySay(null, now)} ${whenNotCaught}`);
  await chat.end();
});

test("bedtime, gaming, coding and normal are set by voice or typed, bedtime at a time is scheduled, and /mode shows the mode", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.say("Bedtime.");
  assert.equal(chat.spoken.at(-1), modeSays.bedtime);
  await chat.say("Good morning.");
  assert.equal(chat.spoken.at(-1), modeSays.normal);
  await chat.type("/mode gaming");
  assert.equal(chat.spoken.at(-1), modeSays.gaming);
  await chat.say("Coding mode.");
  await chat.type("/mode");
  assert.ok(chat.output().endsWith(`  (${modeNote("coding", null)})\nYou: `), chat.output());
  await chat.type("/mode party");
  assert.ok(chat.output().includes(`(${modeUsageNote})`));
  await chat.say("Bedtime at half twelve.");
  assert.deepEqual(chat.hub.schedules, [{ mode: "bedtime", at: "2026-11-29T18:00:00.000Z" }]);
  assert.deepEqual(chat.hub.sets.map((set) => [set.mode, set.by]), [["bedtime", "voice"], ["normal", "voice"], ["gaming", "typed"], ["coding", "voice"]]);
  assert.deepEqual(chat.asked, [], "none of it reaches Claude");
  await chat.end();
});

test("with modes on and JARVIS_GUEST off, the hub going into guest mode holds him: no answers, code words, brain questions or look-ups until it's out of guest", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, guest: false });
  await chat.mode({ mode: "guest", until: null, by: "phone" });
  assert.ok(chat.output().includes(`(${guestHeldNote})`), chat.output());
  assert.equal(chat.spoken.at(-1), guestHeldSay);
  await chat.type("What's in my notes?");
  await chat.say("What's on my calendar?");
  await chat.say("Find my phone.");
  await chat.say("Brain questions.");
  assert.deepEqual(chat.asked, [], "nothing reaches the owner's chat");
  assert.deepEqual(chat.phone, []);
  assert.deepEqual(chat.opened, [], "and no guest chat is opened, since there isn't one");
  await chat.mode({ mode: "normal", until: null, by: "phone" });
  await chat.type("What's in my notes?");
  assert.deepEqual(chat.asked, ["normal: What's in my notes?"], "once the hub is out of guest mode he answers again");
  await chat.end();
});

test("train changes are said in normal and coding mode, shown but not said in bedtime, gaming and away, and only noted in guest mode", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.train("The 08:33 is 5 minutes late.");
  assert.equal(chat.spoken.at(-1), trainSay(["The 08:33 is 5 minutes late."]));
  for (const mode of ["bedtime", "gaming", "away"] as const) {
    await chat.mode({ mode, until: null, by: "phone" });
    const before = chat.spoken.length;
    await chat.train("The 08:33 is cancelled.");
    assert.equal(chat.spoken.length, before, mode);
    assert.ok(chat.output().includes(`(${unsaidNote(trainSay(["The 08:33 is cancelled."]), mode)})`), mode);
  }
  await chat.mode({ mode: "coding", until: null, by: "phone" });
  await chat.train("The 08:45 is on time.");
  assert.equal(chat.spoken.at(-1), trainSay(["The 08:45 is on time."]));
  await chat.mode({ mode: "guest", until: null, by: "phone" });
  const before = chat.spoken.length;
  await chat.train("The 08:45 is late.");
  assert.equal(chat.spoken.length, before);
  assert.ok(chat.output().includes(`(${guestTrainsNote})`));
  assert.ok(!chat.output().includes("The 08:45 is late."), "a guest never sees his trains");
  await chat.end();
});

const bins: DueReminder = { id: "r1", text: "Take the bins out", at: "2026-11-27T10:00:00.000Z", late: false, urgent: false };

test("a due reminder is said aloud with a follow-up window, and snooze, done or cancel straight after go to the hub, not to Claude", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.remind(bins);
  assert.equal(chat.spoken.at(-1), reminderSay([bins]));
  await new Promise((resolve) => setTimeout(resolve, 20));
  await settled();
  assert.deepEqual(chat.follows, ["follow"]);
  await chat.say("Snooze it for ten minutes.");
  assert.deepEqual(chat.answers, [["r1", { kind: "snooze", minutes: 10 }]]);
  assert.equal(chat.spoken.at(-1), "Snoozed for 10 minutes.");
  await chat.type("Done.");
  assert.deepEqual(chat.asked, ["normal: Done."], "only the first answer counts");
  await chat.remind({ ...bins, id: "r2" });
  await chat.type("done");
  assert.deepEqual(chat.answers.at(-1), ["r2", { kind: "done" }]);
  await chat.end();
});

test("a reminder is said in normal, coding and gaming mode, only if urgent in bedtime, and not at all away or in guest mode", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, follow: false });
  for (const [mode, urgent, said] of [["gaming", false, true], ["coding", false, true], ["bedtime", false, false], ["bedtime", true, true], ["away", true, false]] as const) {
    await chat.mode({ mode, until: null, by: "phone" });
    const before = chat.spoken.length;
    const one = { ...bins, urgent };
    await chat.remind(one);
    assert.equal(chat.spoken.length > before, said, `${mode} ${urgent}`);
    if (!said) assert.ok(chat.output().includes(`(${unsaidNote(reminderSay([one]), mode)})`), mode);
  }
  await chat.mode({ mode: "guest", until: null, by: "phone" });
  const before = chat.spoken.length;
  await chat.remind({ ...bins, urgent: true });
  assert.equal(chat.spoken.length, before);
  assert.ok(chat.output().includes(`(${guestRemindersNote})`));
  await chat.say("Cancel it.");
  assert.deepEqual(chat.answers, [], "a guest can't answer one");
  await chat.end();
});

test("more than five minutes after a reminder, snooze and done are ordinary words again", { timeout: 5_000 }, async () => {
  let at = now.getTime();
  const chat = modeChat({ modes: true, clock: () => new Date(at) });
  await chat.remind(bins);
  at += 5 * 60_000 + 1;
  await chat.type("snooze");
  assert.deepEqual(chat.answers, []);
  assert.deepEqual(chat.asked, ["normal: snooze"]);
  await chat.end();
});

test("found it stops the ringing only for two minutes after he rang the phone, and is an ordinary question otherwise", { timeout: 5_000 }, async () => {
  let at = now.getTime();
  const chat = modeChat({ clock: () => new Date(at) });
  await chat.say("Found it.");
  assert.deepEqual(chat.asked, ["normal: Found it."]);
  await chat.say("Find my phone.");
  at += 60_000;
  await chat.say("Got it, you can stop ringing.");
  assert.deepEqual(chat.asked, ["normal: Found it.", "normal: Got it, you can stop ringing."], "only the found words themselves count, or as the last sentence");
  await chat.say("Found my phone.");
  assert.deepEqual(chat.phone, ["rang", "found"]);
  assert.equal(chat.spoken.at(-1), "Good, I've stopped it ringing.");
  await chat.say("Found it.");
  assert.deepEqual(chat.phone, ["rang", "found"], "once it's stopped, found it goes to Claude again");
  await chat.say("Find my phone.");
  at += 2 * 60_000 + 1;
  await chat.say("I've found it.");
  assert.deepEqual(chat.phone, ["rang", "found", "rang"]);
  assert.equal(chat.asked.at(-1), "normal: I've found it.");
  await chat.end();
});

const mine: EarsVoice = { who: "me", owner: true, score: 0.82 };
const friend: EarsVoice = { who: "alex", owner: false, score: 0.71 };
const stranger: EarsVoice = { who: null, owner: false, score: 0.2 };

test("with voices on, the owner's voice can end guest mode and change modes in it, and anyone else's still can't", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, voices: "answer" });
  await chat.say("Guest mode.", friend);
  assert.ok(chat.output().includes(`(${voiceNote(friend)})`), chat.output());
  assert.deepEqual(chat.guestsThrough, [false, true], "ears's door is shut when he starts, and lets every voice through in guest mode");
  await chat.say("Guest mode off.", friend);
  assert.equal(chat.spoken.at(-1), guestOffByVoiceSay);
  await chat.say("Normal mode.", stranger);
  assert.equal(chat.spoken.at(-1), guestModeRefusedSay);
  await chat.say("Guest mode off.", mine);
  assert.deepEqual(chat.hub.sets.at(-1), { mode: "normal", until: null, by: "owner" });
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  assert.deepEqual(chat.guestsThrough, [false, true, false]);
  await chat.say("Guest mode.", friend);
  await chat.say("Bedtime.", mine);
  assert.deepEqual(chat.hub.sets.at(-1), { mode: "bedtime", until: null, by: "owner" }, "the hub lets only the owner's voice out of guest mode");
  assert.deepEqual(chat.spoken.slice(-2), [modeSays.bedtime, "Guest mode is off."]);
  assert.deepEqual(chat.opened, ["guest", "normal", "guest", "normal"], "his own voice can move him out of guest mode into another");
  await chat.end();
});

test("with voices on, ears's guest door is shut when he starts, and again when he ends in guest mode, so it can't stay open after him", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, voices: "answer" });
  await chat.say("Guest mode.", friend);
  assert.deepEqual(chat.guestsThrough, [false, true]);
  await chat.end();
  assert.deepEqual(chat.guestsThrough, [false, true, false]);
  const plain = modeChat({ modes: true, voices: "answer" });
  await plain.end();
  assert.deepEqual(plain.guestsThrough, [false], "ending outside guest mode leaves it shut without asking again");
});

test("JARVIS_OTHER_VOICES=guest moves a voice he doesn't know into guest mode before its mode words, reminder answers or found it can act", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, voices: "guest" });
  await chat.say("Bedtime.", stranger);
  assert.deepEqual(chat.hub.sets, [{ mode: "guest", until: null, by: "voice" }], "bedtime is never set for Phil by a stranger");
  assert.deepEqual(chat.opened, ["guest"]);
  assert.equal(chat.spoken.at(-1), guestModeRefusedSay, "and in guest mode the stranger's bedtime is refused");
  await chat.end();
});

test("JARVIS_OTHER_VOICES=name tells Claude who asked when it isn't Phil, and answer leaves the question as it was", { timeout: 5_000 }, async () => {
  const named = modeChat({ voices: "name" });
  await named.say("What's on telly?", friend);
  await named.say("What's the weather?", stranger);
  await named.say("And for me?", mine);
  assert.deepEqual(named.asked, ["normal: What's on telly?\n\n[Said by alex, going by their voice, not Phil.]", "normal: What's the weather?\n\n[Said by someone whose voice your code doesn't know, not Phil.]", "normal: And for me?"]);
  await named.end();
  const plain = modeChat({ voices: "answer" });
  await plain.say("What's on telly?", friend);
  assert.deepEqual(plain.asked, ["normal: What's on telly?"]);
  await plain.end();
});

test("JARVIS_OTHER_VOICES=guest puts him in guest mode before answering a voice he doesn't know, and answers it there", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, voices: "guest" });
  await chat.say("What's on telly?", friend);
  assert.deepEqual(chat.asked, ["normal: What's on telly?"], "a voice he knows is answered as usual");
  await chat.say("Who are you?", stranger);
  assert.ok(chat.output().includes(`(${strangerGuestNote})`), chat.output());
  assert.deepEqual(chat.hub.sets, [{ mode: "guest", until: null, by: "voice" }]);
  assert.deepEqual(chat.opened, ["guest"]);
  assert.deepEqual(chat.asked, ["normal: What's on telly?", "guest: Who are you?"]);
  await chat.end();
});

test("without voices on, a voice in ears's answer changes nothing and isn't shown", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.say("Guest mode.");
  await chat.say("Guest mode off.", mine);
  assert.equal(chat.spoken.at(-1), guestOffByVoiceSay);
  assert.ok(!chat.output().includes("(voice:"));
  await chat.end();
});

test("a session waiting on him is said in coding mode, shown in the others, and not even shown in guest mode", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, follow: false });
  const waiting: SessionChange = { name: "docker", state: "waiting", was: "working", at: "2026-11-27T10:00:00.000Z" };
  await chat.session(waiting);
  assert.equal(chat.spoken.length, 0);
  assert.ok(chat.output().includes("(The docker session is waiting on you. (not said in normal mode))"), chat.output());
  await chat.mode({ mode: "coding", until: null, by: "phone" });
  await chat.session(waiting);
  assert.equal(chat.spoken.at(-1), "The docker session is waiting on you.");
  await chat.mode({ mode: "guest", until: null, by: "phone" });
  const shown = chat.output().length;
  await chat.session(waiting);
  assert.ok(!chat.output().slice(shown).includes("docker"), "a guest never sees his sessions");
  await chat.end();
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("with the hub down, asking for guest mode still starts a fresh guest chat, says the hub didn't hear, and opens ears to guests", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "couldn't reach the hub: fetch failed" }, retryMs: 60_000 });
  await chat.type("/guest");
  assert.deepEqual(chat.hub.sets, [], "the hub never heard it");
  assert.deepEqual(chat.opened, ["guest"], "privacy first: the guest gets a fresh chat");
  assert.equal(chat.sessions[0].closed(), true);
  assert.equal(chat.spoken.at(-1), guestUnheardSay);
  assert.ok(chat.output().includes(`(${guestUnheardNote("couldn't reach the hub: fetch failed")})`), chat.output());
  assert.ok(chat.output().includes(`(${guestOnNote})`), chat.output());
  assert.deepEqual(chat.guestsThrough, [false, true]);
  await chat.type("Who are you?");
  assert.deepEqual(chat.asked, ["guest: Who are you?"]);
  await chat.end();
});

test("a spoken guest mode with the hub down is the same, and the hub is told by voice once it answers", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "the hub replied 502" }, retryMs: 60_000 });
  await chat.say("Guest mode.");
  assert.deepEqual(chat.opened, ["guest"]);
  assert.equal(chat.spoken.at(-1), guestUnheardSay);
  delete chat.hub.fail.guest;
  await chat.modeNote(modesBackNote);
  assert.deepEqual(chat.hub.sets, [{ mode: "guest", until: null, by: "voice" }]);
  assert.ok(!chat.output().includes(`(${guestToldNote})`), "not counted as told until the hub says guest back");
  await chat.mode({ mode: "guest", until: null, by: "voice" });
  assert.ok(chat.output().includes(`(${guestToldNote})`), chat.output());
  assert.deepEqual(chat.opened, ["guest"], "still the same guest chat");
  await chat.end();
});

test("while the hub hasn't heard guest mode, its own mode never ends guest mode: Jarvis tells it guest instead", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "fetch failed" }, retryMs: 60_000 });
  await chat.type("/guest");
  await chat.mode({ mode: "normal", until: null, by: "phone" });
  assert.deepEqual(chat.opened, ["guest"], "the hub's normal didn't take the guest's chat away");
  await chat.type("Still a guest?");
  assert.deepEqual(chat.asked, ["guest: Still a guest?"]);
  delete chat.hub.fail.guest;
  await chat.mode({ mode: "bedtime", until: null, by: "typed" });
  assert.deepEqual(chat.hub.sets, [{ mode: "guest", until: null, by: "typed" }], "the next answer from the hub gets guest mode back to it");
  assert.deepEqual(chat.opened, ["guest"]);
  await chat.mode({ mode: "guest", until: null, by: "typed" });
  await chat.mode({ mode: "normal", until: null, by: "phone" });
  assert.deepEqual(chat.opened, ["guest", "normal"], "once the hub knows, its mode is followed again");
  await chat.end();
});

test("the hub is told guest mode on a timer too, for when it was only a blip and no mode change comes", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "fetch failed" }, retryMs: 20 });
  await chat.type("/guest");
  await wait(60);
  await settled();
  assert.deepEqual(chat.hub.sets, [], "still down, so nothing yet");
  delete chat.hub.fail.guest;
  await wait(60);
  await settled();
  const sets: Array<{ mode: Mode; by: string }> = chat.hub.sets;
  assert.ok(sets.length >= 1 && sets.every((set) => set.mode === "guest" && set.by === "typed"), JSON.stringify(sets));
  await chat.mode({ mode: "guest", until: null, by: "typed" });
  const told = chat.hub.sets.length;
  await wait(60);
  await settled();
  assert.equal(chat.hub.sets.length, told, "once the hub says guest back, the timer stops asking");
  await chat.end();
});

test("a guest mode the hub never heard can still be left by typing /guest off while the hub is down", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "fetch failed", normal: "fetch failed" }, retryMs: 60_000 });
  await chat.type("/guest");
  await chat.type("/guest off");
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  assert.ok(chat.output().includes(`(${guestLeftUntoldNote})`), chat.output());
  assert.equal(chat.spoken.at(-1), "Guest mode is off.");
  assert.deepEqual(chat.guestsThrough, [false, true, false]);
  delete chat.hub.fail.guest;
  delete chat.hub.fail.normal;
  await chat.modeNote(modesBackNote);
  assert.deepEqual(chat.hub.sets, [], "nothing is owed to the hub once it's left");
  await chat.end();
});

test("once the hub says guest back, a guest mode that started while it was down needs the hub to end it, like any other", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "fetch failed" }, retryMs: 60_000 });
  await chat.type("/guest");
  delete chat.hub.fail.guest;
  await chat.modeNote(modesBackNote);
  await chat.mode({ mode: "guest", until: null, by: "typed" });
  assert.ok(chat.output().includes(`(${guestToldNote})`), chat.output());
  chat.hub.fail.normal = "fetch failed";
  await chat.type("/guest off");
  assert.equal(chat.spoken.at(-1), modeFailedSay, "the hub has guest mode now, so it isn't left in Jarvis alone");
  assert.ok(!chat.output().includes(`(${guestLeftUntoldNote})`), chat.output());
  assert.deepEqual(chat.opened, ["guest"]);
  await chat.end();
});

test("a guest mode the hub heard still can't be left while the hub is down, as before", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, retryMs: 60_000 });
  await chat.type("/guest");
  chat.hub.fail.normal = "fetch failed";
  await chat.type("/guest off");
  assert.equal(chat.spoken.at(-1), modeFailedSay);
  assert.deepEqual(chat.opened, ["guest"]);
  await chat.end();
});

test("with modes off in the hub, guest mode still starts, says the phone won't show it, and never asks the hub again", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, off: true, retryMs: 20 });
  await chat.type("/guest");
  assert.deepEqual(chat.opened, ["guest"]);
  assert.equal(chat.spoken.at(-1), guestModesOffSay);
  assert.ok(chat.output().includes(`(${guestModesOffNote(modesOffNote)})`), chat.output());
  chat.hub.off.on = false;
  await wait(80);
  await settled();
  assert.deepEqual(chat.hub.sets, []);
  await chat.end();
});

test("ears's guest door opens in guest mode even with JARVIS_VOICES off, so guests can be heard with ears's voice ID on require", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.type("/guest");
  assert.deepEqual(chat.guestsThrough, [false, true]);
  await chat.type("/guest off");
  assert.deepEqual(chat.guestsThrough, [false, true, false]);
  await chat.end();
  const typed = modeChat({ guest: true });
  await typed.type("/guest");
  assert.deepEqual(typed.guestsThrough, [false, true], "the same with JARVIS_MODES off");
  await typed.end();
  assert.deepEqual(typed.guestsThrough, [false, true, false]);
  const deaf = modeChat({ modes: true, ears: false });
  await deaf.type("/guest");
  assert.deepEqual(deaf.opened, ["guest"], "without ears there's no door to open, and guest mode still works");
  await deaf.end();
});

test("with voices on, a recording ears gave no verdict on counts as not Phil: it's answered, but can't change the mode or end guest mode", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, voices: "answer" });
  await chat.say("Bedtime.");
  assert.deepEqual(chat.hub.sets, []);
  assert.equal(chat.spoken.at(-1), unjudgedModeSay);
  assert.ok(chat.output().includes(`(${unjudgedModeNote})`), chat.output());
  await chat.say("What's the weather like?");
  assert.deepEqual(chat.asked, ["normal: What's the weather like?"], "it's still answered");
  await chat.say("Bedtime.", mine);
  assert.deepEqual(chat.hub.sets, [{ mode: "bedtime", until: null, by: "voice" }], "his judged voice still changes the mode");
  await chat.type("/mode normal");
  await chat.type("/guest");
  await chat.say("Guest mode off.");
  assert.equal(chat.spoken.at(-1), unjudgedModeSay);
  assert.deepEqual(chat.opened, ["guest"], "it can't end guest mode");
  await chat.say("Guest mode off.", mine);
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  await chat.end();
});

test("with voices off, a recording with no verdict changes the mode as before, since no recording has one", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true });
  await chat.say("Bedtime.");
  assert.deepEqual(chat.hub.sets, [{ mode: "bedtime", until: null, by: "voice" }]);
  assert.equal(chat.spoken.at(-1), modeSays.bedtime);
  await chat.end();
});

test("a stale normal from the same answer that says the hub is back can't end guest mode after Jarvis has told it", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "fetch failed" }, retryMs: 60_000 });
  await chat.type("/guest");
  delete chat.hub.fail.guest;
  await chat.modeNote(modesBackNote);
  await chat.mode({ mode: "normal", until: null, by: "phone" });
  assert.deepEqual(chat.opened, ["guest"], "the guest keeps the guest chat");
  await chat.type("Still me?");
  assert.deepEqual(chat.asked, ["guest: Still me?"]);
  assert.ok(chat.hub.sets.length >= 1 && chat.hub.sets.every((set) => set.mode === "guest"));
  await chat.mode({ mode: "guest", until: null, by: "typed" });
  assert.deepEqual(chat.opened, ["guest"], "and the hub saying guest opens no other chat");
  await chat.end();
});

test("with modes off in the hub, a typed /guest off still leaves the guest mode that only Jarvis had", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, off: true, retryMs: 60_000 });
  await chat.type("/guest");
  await chat.type("/guest off");
  assert.deepEqual(chat.opened, ["guest", "normal"]);
  assert.ok(chat.output().includes(`(${guestLeftUntoldNote})`), chat.output());
  await chat.end();
});

test("leaving a guest mode the hub never heard puts back the mode from before it", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, fail: { guest: "fetch failed", normal: "fetch failed" }, retryMs: 60_000 });
  await chat.mode({ mode: "bedtime", until: null, by: "schedule" });
  await chat.type("/guest");
  await chat.type("/guest off");
  await chat.train("The 07:05 is cancelled.");
  assert.ok(chat.output().includes(unsaidNote(trainSay(["The 07:05 is cancelled."]), "bedtime")), "still bedtime, so the train change isn't said");
  await chat.end();
});

test("retries don't pile up while he's busy: one waits, however long the answer takes", { timeout: 5_000 }, async () => {
  let release = () => {};
  const chat = modeChat({ modes: true, fail: { guest: "fetch failed" }, retryMs: 10 });
  await chat.type("/guest");
  const slow = new Promise<void>((resolve) => (release = resolve));
  const hub = chat.hub.hub;
  let tries = 0;
  const set = hub.set.bind(hub);
  hub.set = async (...args) => {
    tries++;
    await slow;
    return set(...args);
  };
  await wait(120);
  await settled();
  const during = tries;
  release();
  await wait(30);
  await settled();
  assert.ok(during <= 1, `only one try while the first was waiting, got ${during}`);
  assert.ok(tries <= during + 6, `no burst afterwards, got ${tries} after ${during}`);
  await chat.end();
});

test("with voices on, a short guest mode with no verdict still starts it, since that only takes things away", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, voices: "answer" });
  await chat.say("Guest mode.");
  assert.deepEqual(chat.hub.sets, [{ mode: "guest", until: null, by: "voice" }]);
  assert.deepEqual(chat.opened, ["guest"]);
  await chat.end();
});

test("with JARVIS_PROJECTOR on, saying projector on or off switches it through the hub, typed it goes to Claude, and a guest can't", { timeout: 5_000 }, async () => {
  const chat = modeChat({ modes: true, projector: true });
  await chat.say("Projector on.");
  await chat.say("Turn the projector off please.");
  assert.deepEqual(chat.phone, ["projector on", "projector off"]);
  assert.equal(chat.spoken.at(-1), "Turning the projector off.");
  await chat.type("projector on");
  assert.deepEqual(chat.phone, ["projector on", "projector off"], "typed words are never code words");
  assert.equal(chat.asked.at(-1), "normal: projector on");
  await chat.type("/guest");
  await chat.say("Projector on.");
  assert.deepEqual(chat.phone, ["projector on", "projector off"]);
  assert.equal(chat.spoken.at(-1), notInGuestSay);
  await chat.end();
  const off = modeChat({ modes: true });
  await off.say("Projector on.");
  assert.deepEqual(off.phone, []);
  assert.ok(off.asked.at(-1)?.endsWith("Projector on."), "with it off, the words go to Claude as before");
  await off.end();
});
