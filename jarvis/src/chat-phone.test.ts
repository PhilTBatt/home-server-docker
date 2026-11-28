import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { runChat, type ChatDeps, type NewChat } from "./chat.js";
import type { Mode, ModeEvent, ModeHub } from "./modes.js";
import type { Outcome } from "./answer-log.js";
import { phoneModeUnknownNote, phoneModeUnknownSay, phoneNothingToSayNote, phoneTag, phoneAskingNote, phoneEmptySay, phoneGuestNote, phoneGuestSay, phoneNothingNote, phoneNothingSay, phonePrefix, phoneTellNote, phoneUnheardNote, phoneVoiceNote, type PhoneDesk, type PhoneEvent, type PhoneRequest } from "./phone.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Sent, Talk } from "./talk.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function settled() {
  for (let round = 0; round < 40; round++) await tick();
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

type Answering = (question: string, listener: AnswerListener) => Promise<string>;

function fakeSession(label: string, asked: string[], answering?: Answering): AgentSession {
  let stopped: string | null = null;
  return {
    async ask(question: string, listener: AnswerListener = {}) {
      asked.push(`${label}: ${question}`);
      const text = answering === undefined ? `${label} answer.` : await answering(question, listener);
      listener.text?.(text);
      return { text, firstWordsMs: 400, totalMs: 900 };
    },
    readyMs: () => null,
    costUsd: () => 0.01,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
}

function fakeSpeech(spoken: string[]): AnswerSpeech {
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  return { text: (text: string) => void spoken.push(text), gap: () => {}, tool: () => {}, restart: () => {}, end: () => {}, stop: () => void (report.stopped = true), finish: () => false, done: () => Promise.resolve(), report: () => report };
}

function fakeDesk(options: { answers?: Array<"yes" | "no" | null>; failTelling?: boolean } = {}) {
  const calls: unknown[][] = [];
  const answers = [...(options.answers ?? [])];
  const told = async (call: unknown[]) => {
    calls.push(call);
    if (options.failTelling === true) throw new Error("the hub said: no");
  };
  const desk: PhoneDesk = {
    next: async () => Promise.reject(new Error("unused")),
    heard: (id, text) => told(["heard", id, text]),
    reply: (id, text, voice) => told(["reply", id, text, voice]),
    failed: (id, text) => told(["failed", id, text]),
    ask: async (id, question) => void calls.push(["ask", id, question]),
    answer: async (id) => {
      calls.push(["answer", id]);
      return answers.length === 0 ? null : (answers.shift() ?? null);
    },
    voice: async (id, wav) => void calls.push(["voice", id, wav.length]),
    noVoice: (id) => told(["noVoice", id]),
  };
  return { desk, calls };
}

const recording: PhoneRequest = { id: "00000000000000a1", audio: new Uint8Array(32_000) };

const fromPhone = (text: string) => `normal: ${text}\n\n${phoneTag}`;

function phoneChat(options: { heard?: string | Error; voice?: boolean; voiceFails?: boolean; voiceNull?: boolean; answers?: Array<"yes" | "no" | null>; answering?: Answering; failTelling?: boolean; guestChat?: boolean; modesOff?: boolean; hubMode?: () => Promise<Mode | "off"> } = {}) {
  const records: Outcome[] = [];
  const lines = channel<string>();
  const phoneEvents = channel<PhoneEvent>();
  const modeEvents = channel<ModeEvent>();
  let waiting: PhoneRequest | null = null;
  const asked: string[] = [];
  const spoken: string[] = [];
  const voiced: string[] = [];
  const hears: number[] = [];
  let output = "";
  const { desk, calls } = fakeDesk({ answers: options.answers, failTelling: options.failTelling });
  const modeHub: ModeHub = { get: async () => Promise.reject(new Error("unused")), set: async () => Promise.reject(new Error("unused")), schedule: async () => {} };
  const guestChat = (): NewChat => ({ session: fakeSession("guest", asked), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [], web: undefined });
  const deps: ChatDeps = {
    lines: lines.items,
    session: fakeSession("normal", asked, options.answering),
    write: (text) => void (output += text),
    prompt: () => void (output += "You: "),
    questionTimeoutMs: 1000,
    speak: () => fakeSpeech(spoken),
    confirm: async () => "yes",
    talk: { check: async () => "Ears: ready", start: async () => ({ ok: true, id: 20 }), send: async (): Promise<Sent> => ({ ok: true, heard: { text: "unused", recordedMs: 1, textMs: 1 } }), drop: async () => null } satisfies Talk,
    ...(options.modesOff === true ? {} : { modes: { hub: modeHub, events: modeEvents.items } }),
    record: async (outcome) => void records.push(outcome),
    ...(options.guestChat === true ? { guest: { open: async () => guestChat() } } : {}),
    phone: {
      news: {
        events: phoneEvents.items,
        take() {
          const taken = waiting;
          waiting = null;
          return taken;
        },
      },
      desk,
      hear: async (audio) => {
        hears.push(audio.length);
        if (options.heard instanceof Error) throw options.heard;
        return options.heard ?? "  what's   on today ";
      },
      voice:
        options.voice === false
          ? null
          : async (text) => {
              voiced.push(text);
              if (options.voiceFails === true) throw new Error("Kokoro replied 500");
              if (options.voiceNull === true) return null;
              return new Uint8Array(new ArrayBuffer(144));
            },
      mode: options.hubMode ?? (async () => "normal"),
      askPollMs: 1,
      askMs: 300,
      wait: () => new Promise((resolve) => setImmediate(resolve)),
    },
  };
  const running = runChat(deps);
  return {
    calls,
    records,
    asked,
    spoken,
    voiced,
    hears,
    output: () => output,
    async record(request: PhoneRequest = recording) {
      waiting = request;
      phoneEvents.push({ kind: "phone" });
      await settled();
    },
    async note(line: string) {
      phoneEvents.push({ kind: "phone note", line });
      await settled();
    },
    async mode(mode: "guest" | "normal") {
      modeEvents.push({ kind: "mode", state: { mode, until: null, by: "phone" } });
      await settled();
    },
    async type(text: string) {
      lines.push(text);
      await settled();
    },
    async end() {
      lines.close();
      phoneEvents.close();
      modeEvents.close();
      await running;
    },
  };
}

test("a recording from the phone is heard, asked in the same chat, answered on the phone as text then voice, and nothing is said in the room", { timeout: 5_000 }, async () => {
  const chat = phoneChat();
  await chat.record();
  assert.deepEqual(chat.hears, [32_000]);
  assert.deepEqual(chat.asked, [fromPhone("what's on today")]);
  assert.deepEqual(chat.calls, [
    ["heard", recording.id, "what's on today"],
    ["reply", recording.id, "normal answer.", true],
    ["voice", recording.id, 144],
  ]);
  assert.deepEqual(chat.voiced, ["normal answer."]);
  assert.deepEqual(chat.spoken, [], "the room speaker stays quiet");
  assert.ok(chat.output().includes(`${phonePrefix}what's on today\nJarvis: normal answer.`), chat.output());
  assert.ok(chat.output().endsWith("You: "), "the prompt comes back after");
  await chat.type("And tomorrow?");
  assert.deepEqual(chat.asked.at(-1), "normal: And tomorrow?", "typing carries on in the same chat");
  assert.deepEqual(chat.spoken, ["normal answer."], "typed questions are still said aloud");
  await chat.end();
});

test("with Jarvis's voice off, the phone gets the answer as text and is told no voice is coming", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ voice: false });
  await chat.record();
  assert.deepEqual(chat.calls.at(-1), ["reply", recording.id, "normal answer.", false]);
  await chat.end();
});

test("a voice that can't be made leaves the text answer, with a note why", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ voiceFails: true });
  await chat.record();
  assert.deepEqual(chat.calls.map((call) => call[0]), ["heard", "reply", "noVoice"], "the phone is told no voice is coming");
  assert.ok(chat.output().includes(`(${phoneVoiceNote("Kokoro replied 500")})`));
  await chat.end();
  const silent = phoneChat({ voiceNull: true });
  await silent.record();
  assert.deepEqual(silent.calls.map((call) => call[0]), ["heard", "reply", "noVoice"], "and when none of it could be spoken");
  assert.ok(silent.output().includes(`(${phoneVoiceNote(phoneNothingToSayNote)})`));
  await silent.end();
});

test("an answer with no words still tells the phone something", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ answering: async () => "   " });
  await chat.record();
  assert.deepEqual(chat.calls.find((call) => call[0] === "reply"), ["reply", recording.id, phoneEmptySay, true]);
  await chat.end();
});

test("in guest mode the phone is refused with a line, whether guest chats are on or not, and nothing is heard or asked", { timeout: 5_000 }, async () => {
  for (const guestChat of [false, true]) {
    const chat = phoneChat({ guestChat });
    await chat.mode("guest");
    const before = chat.asked.length;
    await chat.record();
    assert.deepEqual(chat.hears, [], `${guestChat}`);
    assert.equal(chat.asked.length, before);
    assert.deepEqual(chat.calls, [["reply", recording.id, phoneGuestSay, false]]);
    assert.ok(chat.output().includes(`(${phoneGuestNote})`));
    await chat.end();
  }
});

test("a recording that can't be turned into words, or has none in it, tells the phone why and asks nothing", { timeout: 5_000 }, async () => {
  const broken = phoneChat({ heard: new Error("Couldn't reach the Wyoming server at whisper:10300 (ENOTFOUND)") });
  await broken.record();
  assert.deepEqual(broken.calls, [["failed", recording.id, "I couldn't turn your recording into words: Couldn't reach the Wyoming server at whisper:10300 (ENOTFOUND)"]]);
  assert.ok(broken.output().includes(`(${phoneUnheardNote("Couldn't reach the Wyoming server at whisper:10300 (ENOTFOUND)")})`));
  assert.deepEqual(broken.asked, []);
  await broken.end();
  const silent = phoneChat({ heard: "   " });
  await silent.record();
  assert.deepEqual(silent.calls, [["failed", recording.id, phoneNothingSay]]);
  assert.ok(silent.output().includes(`(${phoneNothingNote})`));
  await silent.end();
});

test("when the question fails, the phone is told why", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ answering: async () => Promise.reject(new Error("the API is overloaded")) });
  await chat.record();
  assert.deepEqual(chat.calls.at(-1), ["failed", recording.id, "Jarvis couldn't answer: the API is overloaded"]);
  assert.deepEqual(chat.voiced, []);
  await chat.end();
});

const needsYes: Answering = async (_question, listener) => ((await listener.confirm?.("mcp__hub__set_mode", { mode: "bedtime" })) === true ? "Done, it's bedtime." : "Left it as it is.");

test("a yes Jarvis needs for a phone question is asked on the phone, not typed, and its answer counts", { timeout: 5_000 }, async () => {
  const yes = phoneChat({ answering: needsYes, answers: [null, "yes"] });
  await yes.record();
  const asking = yes.calls.find((call) => call[0] === "ask");
  assert.deepEqual(asking, ["ask", recording.id, "Jarvis wants to use mcp__hub__set_mode."], "the phone's question doesn't say to type yes");
  assert.ok(yes.output().includes(`(${phoneAskingNote(asking[2] as string)})`));
  assert.equal(yes.calls.filter((call) => call[0] === "answer").length, 2, "it keeps asking the hub until there's an answer");
  assert.deepEqual(yes.calls.find((call) => call[0] === "reply"), ["reply", recording.id, "Done, it's bedtime.", true]);
  await yes.end();
  const no = phoneChat({ answering: needsYes, answers: ["no"] });
  await no.record();
  assert.deepEqual(no.calls.find((call) => call[0] === "reply"), ["reply", recording.id, "Left it as it is.", true]);
  await no.end();
});

test("a phone that never answers the yes counts as no", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ answering: needsYes });
  const started = Date.now();
  await chat.record();
  while (!chat.calls.some((call) => call[0] === "reply") && Date.now() - started < 4_000) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(chat.calls.find((call) => call[0] === "reply"), ["reply", recording.id, "Left it as it is.", true]);
  await chat.end();
});

test("when the hub can't be told, Jarvis still answers in the terminal and says so", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ failTelling: true });
  await chat.record();
  assert.deepEqual(chat.asked, [fromPhone("what's on today")]);
  assert.ok(chat.output().includes(`(${phoneTellNote("the hub said: no")})`));
  await chat.end();
});

test("a note about the phone is printed on its own line, and a nudge with nothing waiting does nothing", { timeout: 5_000 }, async () => {
  const chat = phoneChat();
  await chat.note("phone: the hub is answering again");
  assert.ok(chat.output().includes("  (phone: the hub is answering again)\nYou: "));
  const before = chat.output();
  await chat.record(null as unknown as PhoneRequest);
  assert.equal(chat.output(), before);
  await chat.end();
});

test("a phone question waits while Jarvis is listening in the room, and is taken once he's quiet", { timeout: 5_000 }, async () => {
  const chat = phoneChat();
  await chat.type("/talk");
  await chat.record();
  assert.deepEqual(chat.hears, [], "not while he's listening");
  assert.deepEqual(chat.calls, []);
  await chat.type("Never mind that, what's the weather?");
  await chat.record(recording);
  assert.deepEqual(chat.hears, [32_000]);
  assert.deepEqual(chat.asked, ["normal: Never mind that, what's the weather?", fromPhone("what's on today")], "typing drops the recording and is asked, then the phone's question");
  await chat.end();
});

test("a restart or retry part-way through drops what was said before it, so the phone gets the answer once", { timeout: 5_000 }, async () => {
  for (const event of ["restart", "retry"] as const) {
    const chat = phoneChat({
      answering: async (_question, listener) => {
        listener.text?.("Half an ans");
        listener[event]?.();
        return "The whole answer.";
      },
    });
    await chat.record();
    assert.deepEqual(chat.calls.find((call) => call[0] === "reply"), ["reply", recording.id, "The whole answer.", true], event);
    await chat.end();
  }
});

test("phone questions ask the hub's mode each time, so with JARVIS_MODES off a guest mode at the hub still refuses them", { timeout: 5_000 }, async () => {
  let mode: Mode | "off" = "guest";
  let asks = 0;
  const chat = phoneChat({ modesOff: true, hubMode: async () => (asks++, mode) });
  await chat.record();
  assert.equal(asks, 1);
  assert.deepEqual(chat.hears, [], "nothing is heard");
  assert.deepEqual(chat.asked, []);
  assert.deepEqual(chat.calls, [["reply", recording.id, phoneGuestSay, false]]);
  assert.ok(chat.output().includes(`(${phoneGuestNote})`), chat.output());
  mode = "normal";
  await chat.record();
  assert.equal(asks, 2);
  assert.deepEqual(chat.asked, [fromPhone("what's on today")]);
  mode = "off";
  await chat.record();
  assert.equal(chat.asked.length, 2, "with modes off in the hub there's no guest mode, so it's answered");
  await chat.end();
});

test("a phone question is refused when the hub's mode can't be checked, in case it's guest mode", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ hubMode: async () => Promise.reject(new Error("the hub replied 500")) });
  await chat.record();
  assert.deepEqual(chat.hears, []);
  assert.deepEqual(chat.asked, []);
  assert.deepEqual(chat.calls, [["reply", recording.id, phoneModeUnknownSay, false]]);
  assert.ok(chat.output().includes(`(${phoneModeUnknownNote("the hub replied 500")})`), chat.output());
  await chat.end();
});

test("with JARVIS_MODES on, a guest mode Jarvis already follows refuses without asking the hub again", { timeout: 5_000 }, async () => {
  let asks = 0;
  const chat = phoneChat({ hubMode: async () => (asks++, "normal") });
  await chat.mode("guest");
  await chat.record();
  assert.equal(asks, 0);
  assert.deepEqual(chat.calls, [["reply", recording.id, phoneGuestSay, false]]);
  await chat.end();
});

test("the answer log marks a phone question as one, and a typed one not", { timeout: 5_000 }, async () => {
  const chat = phoneChat({ hubMode: async () => "normal" });
  await chat.record();
  await chat.type("And tomorrow?");
  assert.equal(chat.records.length, 2);
  assert.equal(chat.records[0].phone, true);
  assert.equal("phone" in chat.records[1], false);
  await chat.end();
});
