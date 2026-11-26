import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { Outcome } from "./answer-log.js";
import type { AnswerSpeech } from "./answer-speech.js";
import { beginLine, endLine, questionsOffNote, type BrainQuestions, type FiledReply } from "./brain-questions.js";
import { capNote, capReachedNote, costLine, fileItNotes, followLimitNote, fileItReply, heardPrefix, keptHereNote, lookingNote, noQuestionsReply, nothingFiledReply, questionNote, questionsCommandNote, questionsOpenNote, runChat, skippedNote, stoppedMessage, talkCommandNote, tooLongNote, unreadableSay, type ChatDeps } from "./chat.js";
import { questionWords, stopMyselfReply, stoppedReply } from "./code-words.js";
import type { EarsAnswer } from "./ears-client.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Sent, Talk } from "./talk.js";
import type { Answer } from "./timing.js";
import type { WakeEvent } from "./wake.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function settled() {
  for (let round = 0; round < 20; round++) await tick();
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

const block = (...lines: string[]) => [beginLine, ...lines, endLine].join("\n");
const gapLines = ["question: Which garden centre is Alpha?", "files: people/alpha.md, places/beta.md", "kind: gap", "wrong: Alpha is named twice but never explained."];
const mistakeLines = ["question: Is the boiler service in March or May?", "files: house/boiler.md", "kind: mistake", "wrong: One file says March and another says May."];
const both = `Checking the people folder.\n${block(...gapLines, ...mistakeLines)}`;
const isInstruction = (question: string) => question.startsWith("This message comes from your own code");

type Finding = (listener: AnswerListener) => Promise<Answer>;

const replying = (text: string, lastRequestTokens: number | null = null): Finding => async (listener) => {
  listener.tool?.("read_file", { path: "people/alpha.md" });
  return { text, firstWordsMs: 400, totalMs: 900, ...(lastRequestTokens === null ? {} : { stats: { rounds: 2, toolUses: 1, inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0, costUsd: null, earlierThinkingBlocks: null, recovered: false, largestRequestTokens: lastRequestTokens, lastRequestTokens, refusedTools: [], spokeFirst: null, retried: null } }) };
};

function fakeSession(find: Finding, events: string[], others: Record<string, string> = {}): AgentSession & { confirms: boolean[] } {
  let stopped: string | null = null;
  const confirms: boolean[] = [];
  return {
    confirms,
    async ask(question: string, listener: AnswerListener = {}) {
      events.push(isInstruction(question) ? "ask instruction" : `ask ${question}`);
      if (isInstruction(question)) {
        if (listener.confirm !== undefined) confirms.push(await listener.confirm("scan_library", {}));
        return find(listener);
      }
      const text = others[question];
      if (text === undefined) throw new Error(`Unexpected question: ${question}`);
      listener.text?.(text);
      return { text, firstWordsMs: 400, totalMs: 900 };
    },
    readyMs: () => null,
    costUsd: () => 0.0123,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
}

const over = Promise.resolve();

function fakeSpeech(spoken: string[]): AnswerSpeech {
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  return {
    text: (text: string) => void spoken.push(text),
    gap: () => {},
    tool: () => {},
    restart: () => {},
    end: () => {},
    stop: () => {
      report.stopped = true;
    },
    finish: () => false,
    done: () => over,
    report: () => report,
  };
}

function fakeTalk(): Talk {
  return {
    check: async () => "Ears: ready",
    start: async () => ({ ok: true, id: 20 }),
    send: async (): Promise<Sent> => ({ ok: true, heard: { text: "unused", recordedMs: 1, textMs: 1 } }),
    drop: async () => null,
  };
}

function earsDone(text: string): EarsAnswer {
  return { status: 200, state: "idle", reason: null, error: null, seconds: null, last: { seconds: 3.4, reason: "it went quiet for 1.5 seconds after you spoke", text, textProblem: null } };
}

const morning = new Date("2026-11-26T09:30:00Z");

function questionsChat(find: Finding, extra: Partial<ChatDeps> = {}, filed: FiledReply = { say: "I've filed that in the brain's inbox.", note: "saved in the brain's inbox as 2026-11-26-brain-questions.md", saved: true }, others: Record<string, string> = {}) {
  const events: string[] = [];
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const notes: string[] = [];
  const looked: string[] = [];
  const spoken: string[] = [];
  const follows: string[] = [];
  const recorded: Outcome[] = [];
  let output = "";
  const session = fakeSession(find, events, others);
  const questions: BrainQuestions = {
    exists: async (path) => (looked.push(path), true),
    file: async (text) => (notes.push(text), filed),
    now: () => morning,
  };
  const deps: ChatDeps = {
    lines: lines.items,
    session,
    write: (text) => {
      output += text;
    },
    prompt: () => {
      output += "You: ";
    },
    questionTimeoutMs: 1000,
    record: async (outcome) => void recorded.push(outcome),
    speak: () => fakeSpeech(spoken),
    talk: fakeTalk(),
    wake: wake.items,
    followUp: { seconds: 5, ask: () => void follows.push("follow"), gapMs: 0 },
    questions,
    ...extra,
  };
  const running = runChat(deps);
  return { lines, wake, events, notes, looked, spoken, follows, recorded, session, output: () => output, running };
}

const firstNote = "question 1 of 2, a gap, about people/alpha.md, places/beta.md. What looked wrong: Alpha is named twice but never explained. Answer it, or type or say skip or never mind";
const secondNote = "question 2 of 2, a suspected mistake, about house/boiler.md. What looked wrong: One file says March and another says May. Answer it, or type or say skip or never mind";

test("typed /questions asks the engine once through the chat, then asks each question in turn, and files the typed answers in one note by his own code", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both));
  chat.lines.push("/questions");
  await settled();
  assert.deepEqual(chat.events, ["ask instruction"]);
  assert.deepEqual(chat.session.confirms, [false], "a hub action asked for while looking is refused without asking Phil");
  assert.deepEqual(chat.looked, ["people/alpha.md", "places/beta.md", "house/boiler.md"]);
  assert.ok(chat.output().includes(`You:   (${lookingNote})\n  (reading people/alpha.md)\nJarvis: Which garden centre is Alpha?\n  (${firstNote})\nYou: `), chat.output());
  assert.ok(!chat.output().includes(beginLine), "the raw block isn't shown");
  chat.lines.push("The one on the ring road.");
  await settled();
  assert.ok(chat.output().endsWith(`Jarvis: Is the boiler service in March or May?\n  (${secondNote})\nYou: `), chat.output());
  chat.lines.push("May.");
  await settled();
  assert.ok(chat.output().endsWith("Jarvis: I've filed that in the brain's inbox.\n  (saved in the brain's inbox as 2026-11-26-brain-questions.md)\nYou: "), chat.output());
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes("- Jarvis asked: Which garden centre is Alpha?\n- About: `people/alpha.md`, `places/beta.md`\n- What looked wrong to Jarvis: Alpha is named twice but never explained.\n- Phil answered (typed), 2026-11-26 09:30:\n\n> The one on the ring road."), chat.notes[0]);
  assert.ok(chat.notes[0].includes("- Phil answered (typed), 2026-11-26 09:30:\n\n> May."), chat.notes[0]);
  assert.deepEqual(chat.events, ["ask instruction"], "his answers never go to the engine");
  assert.deepEqual(chat.recorded, [], "nothing goes in the answer log");
  assert.deepEqual(chat.follows, [], "typed questions open no follow-up");
  assert.deepEqual(chat.spoken, ["Which garden centre is Alpha?", "Is the boiler service in March or May?", "I've filed that in the brain's inbox."]);
  chat.lines.close();
  await chat.running;
  assert.ok(chat.output().endsWith(`${costLine(0.0123)}\n`), "the chat's cost line still comes last, and counts the look");
});

test("the question's note says which of how many it is, its kind, its files and what looked wrong, without doubling a full stop", () => {
  const run = { found: [{ ask: "Q?", files: ["a.md"], kind: "gap" as const, wrong: "Something.  " }], at: 0, asked: [], confirming: false };
  assert.equal(questionNote(run), "question 1 of 1, a gap, about a.md. What looked wrong: Something. Answer it, or type or say skip or never mind");
  assert.equal(questionNote({ ...run, found: [{ ...run.found[0], wrong: "No stop" }] }), "question 1 of 1, a gap, about a.md. What looked wrong: No stop. Answer it, or type or say skip or never mind");
});

test("skip passes a gap over without filing it, and for a suspected mistake asks whether to file it, filing it only on yes", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both));
  chat.lines.push("/questions");
  await settled();
  chat.lines.push("skip");
  await settled();
  assert.ok(chat.output().includes(`You:   (${skippedNote})\nJarvis: Is the boiler service`), chat.output());
  chat.lines.push("Skip it.");
  await settled();
  assert.ok(chat.output().endsWith(`Jarvis: ${fileItReply.say}\n  (${fileItReply.note})\nYou: `), chat.output());
  chat.lines.push("Yes.");
  await settled();
  assert.ok(chat.output().includes(`You:   (${fileItNotes.yes})\nJarvis: I've filed that`), chat.output());
  assert.equal(chat.notes.length, 1);
  assert.ok(!chat.notes[0].includes("garden centre"), "the skipped gap isn't filed");
  assert.ok(chat.notes[0].includes("## 1. A suspected mistake\n\n- Jarvis asked: Is the boiler service in March or May?"), chat.notes[0]);
  assert.ok(chat.notes[0].includes("- Phil didn't answer, but said yes to filing it as a suspected mistake, 2026-11-26 09:30."), chat.notes[0]);
  chat.lines.close();
  await chat.running;
});

test("anything but yes to filing a skipped mistake leaves it unfiled, and with nothing answered nothing is sent", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(block(...mistakeLines)));
  chat.lines.push("/questions");
  await settled();
  chat.lines.push("skip");
  await settled();
  chat.lines.push("Yes it was March");
  await settled();
  assert.ok(chat.output().includes(`You:   (${fileItNotes.no})\nJarvis: ${nothingFiledReply.say}\n  (${nothingFiledReply.note})\n`), chat.output());
  assert.deepEqual(chat.notes, []);
  chat.lines.push("/questions");
  await settled();
  assert.deepEqual(chat.events, ["ask instruction", "ask instruction"], "a finished run can be followed by another");
  chat.lines.close();
  await chat.running;
});

test("never mind ends the questions at once, filing what was already answered, or nothing if nothing was", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both));
  chat.lines.push("/questions");
  await settled();
  chat.lines.push("The one on the ring road.");
  await settled();
  chat.lines.push("Never mind.");
  await settled();
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes("> The one on the ring road."), chat.notes[0]);
  assert.ok(!chat.notes[0].includes("boiler"), chat.notes[0]);
  const second = questionsChat(replying(both), {}, undefined, { "never mind": "Fine." });
  second.lines.push("/questions");
  await settled();
  second.lines.push("that's all, thanks");
  await settled();
  assert.deepEqual(second.notes, []);
  assert.ok(second.output().endsWith(`Jarvis: ${nothingFiledReply.say}\n  (${nothingFiledReply.note})\nYou: `), second.output());
  second.lines.push("never mind");
  await settled();
  assert.deepEqual(second.events, ["ask instruction", "ask never mind"], "once the questions are over, a typed never mind is just a question again");
  for (const chatToClose of [chat, second]) chatToClose.lines.close();
  await Promise.all([chat.running, second.running]);
});

test("a reply that isn't in the format, or names a file that isn't in the brain, is said and stops there, and nothing is asked or filed", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying("I found two things: the boiler and Alpha."), {}, undefined, { "What's next?": "Nothing." });
  chat.lines.push("/questions");
  await settled();
  assert.ok(chat.output().includes(`Jarvis: ${unreadableSay}\n  (the reply wasn't in the format asked for: there was no ${beginLine} line)\n`), chat.output());
  chat.lines.push("What's next?");
  await settled();
  assert.deepEqual(chat.events, ["ask instruction", "ask What's next?"], "the next line is an ordinary question again");
  chat.lines.close();
  await chat.running;
  const missing = questionsChat(replying(both), { questions: { exists: async (path) => path !== "house/boiler.md", file: async () => ({ say: "unused", saved: true }) } });
  missing.lines.push("/questions");
  await settled();
  assert.ok(missing.output().includes(`Jarvis: ${unreadableSay}\n  (the reply wasn't in the format asked for: question 2 names a file that isn't in the brain: house/boiler.md)\n`), missing.output());
  assert.ok(!missing.output().includes("garden centre"), "not even the good first question is asked");
  missing.lines.close();
  await missing.running;
});

test("an empty block says there are no questions, and opens nothing", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(block()), {}, undefined, { "Thanks.": "You're welcome." });
  chat.lines.push("/questions");
  await settled();
  assert.ok(chat.output().includes(`Jarvis: ${noQuestionsReply.say}\nYou: `), chat.output());
  chat.lines.push("Thanks.");
  await settled();
  assert.deepEqual(chat.events, ["ask instruction", "ask Thanks."]);
  chat.lines.close();
  await chat.running;
});

test("with brain questions off, /questions says how to turn them on, and the engine isn't asked", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both), { questions: undefined });
  chat.lines.push("/questions");
  await settled();
  assert.ok(chat.output().includes(`Jarvis: Brain questions are off.\n  (${questionsOffNote})\n`), chat.output());
  assert.equal(chat.output().split("Brain questions are off.").length, 2, chat.output());
  assert.deepEqual(chat.events, []);
  chat.lines.push("/other");
  await settled();
  assert.ok(chat.output().includes(`  (${talkCommandNote})\n`), chat.output());
  assert.ok(!chat.output().includes("/questions. To start"), "the command note only names /questions when it's on");
  chat.lines.close();
  await chat.running;
});

test("with brain questions off, each spoken phrase is asked of Claude like any question, and listened for after", { timeout: 5_000 }, async () => {
  const said = questionWords.map((words) => `${words[0].toUpperCase()}${words.slice(1)}?`);
  const chat = questionsChat(replying(both), { questions: undefined }, undefined, Object.fromEntries(said.map((text) => [text, "Not right now."])));
  for (const [index, text] of said.entries()) {
    chat.wake.push({ kind: "wake", id: index + 1 });
    await settled();
    chat.wake.push({ kind: "done", id: index + 1, answer: earsDone(text), textMs: 900 });
    await settled();
    await pause(5);
  }
  assert.deepEqual(chat.events, said.map((text) => `ask ${text}`));
  assert.equal(chat.follows.length, said.length);
  assert.ok(!chat.output().includes("Brain questions are off."), chat.output());
  assert.equal(chat.recorded.length, said.length);
  chat.lines.close();
  await chat.running;
});

test("with brain questions on, an unknown / command lists /questions with the others", { timeout: 5_000 }, async () => {
  assert.equal(questionsCommandNote(true), "Jarvis's / commands are /talk and /questions. To start a new chat, type new");
  assert.equal(questionsCommandNote(false), "Jarvis's / commands are /questions. To start a new chat, type new");
  const chat = questionsChat(replying(both));
  chat.lines.push("/other");
  await settled();
  assert.ok(chat.output().includes(`  (${questionsCommandNote(true)})\n`), chat.output());
  chat.lines.close();
  await chat.running;
  const typed = questionsChat(replying(both), { talk: undefined, wake: undefined });
  typed.lines.push("/other");
  await settled();
  assert.ok(typed.output().includes(`  (${questionsCommandNote(false)})\n`), typed.output());
  typed.lines.close();
  await typed.running;
});

test("when the engine fails, it says so and the chat carries on, and when it runs out of time the chat stops like any question", { timeout: 5_000 }, async () => {
  const chat = questionsChat(async () => Promise.reject(new Error("the API said 529")), {}, undefined, { "Hello.": "Hi." });
  chat.lines.push("/questions");
  await settled();
  assert.ok(chat.output().includes("Jarvis couldn't look for questions: the API said 529\n"), chat.output());
  chat.lines.push("Hello.");
  await settled();
  assert.deepEqual(chat.events, ["ask instruction", "ask Hello."]);
  chat.lines.close();
  await chat.running;
  const slow = questionsChat(() => new Promise(() => {}), { questionTimeoutMs: 30 });
  slow.lines.push("/questions");
  const ended = await Promise.race([slow.running.then(() => true), pause(2000).then(() => false)]);
  slow.lines.close();
  assert.equal(ended, true, "the chat ends by itself");
  assert.ok(slow.output().includes(`Jarvis couldn't look for questions: No answer within 0.03 seconds\n${stoppedMessage}\n`), slow.output());
  const closed = questionsChat(async () => Promise.reject(new Error(closedMessage)));
  closed.session.close();
  closed.lines.push("/questions");
  const over = await Promise.race([closed.running.then(() => true), pause(2000).then(() => false)]);
  closed.lines.close();
  assert.equal(over, true, "the chat ends by itself");
  assert.ok(closed.output().includes("  (stopped)\n"), closed.output());
  assert.ok(!closed.output().includes(stoppedMessage), closed.output());
});

test("past the length cap nothing is asked, and the look counts towards the chat's size like any question", { timeout: 5_000 }, async () => {
  const capped = questionsChat(replying(both), { lengthCap: 1000, knownSize: 1200 });
  capped.lines.push("/questions");
  await settled();
  assert.ok(capped.output().includes(`  (${capNote(1000)})\n`), capped.output());
  assert.deepEqual(capped.events, []);
  capped.lines.close();
  await capped.running;
  const sizes: number[] = [];
  const seen: (number | null)[] = [];
  const growing = questionsChat(replying(both, 1500), { lengthCap: 1000, rememberSize: async (tokens) => void sizes.push(tokens), lengthNote: (tokens) => (seen.push(tokens), "a length note") });
  growing.lines.push("/questions");
  await settled();
  assert.ok(growing.output().includes(`  (${capReachedNote(1000)})\n`), growing.output());
  assert.deepEqual([sizes, seen], [[1500], []]);
  growing.lines.close();
  await growing.running;
  const noted = questionsChat(replying(both, 900), { lengthNote: (tokens) => `about ${tokens} tokens` });
  noted.lines.push("/questions");
  await settled();
  assert.ok(noted.output().includes("  (reading people/alpha.md)\n  (about 900 tokens)\nJarvis: Which garden centre"), noted.output());
  noted.lines.close();
  await noted.running;
});

test("when the hub won't take the note, he says why and shows what would have been filed, so nothing is lost", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(block(...gapLines)), {}, { say: "I couldn't file your answers.", note: "note uploads are off in the hub, so set MEMORY_UPLOAD=on in api/.env and restart the hub", saved: false });
  chat.lines.push("/questions");
  await settled();
  chat.lines.push("The one on the ring road.");
  await settled();
  assert.ok(chat.output().includes(`Jarvis: I couldn't file your answers.\n  (note uploads are off in the hub, so set MEMORY_UPLOAD=on in api/.env and restart the hub)\n  (${keptHereNote})\n\n${chat.notes[0]}\nYou: `), chat.output());
  assert.ok(!chat.spoken.some((text) => text.includes("ring road")), "the note is shown, never spoken");
  chat.lines.close();
  await chat.running;
});

test("exit, new or the chat closing part-way files what was answered first", { timeout: 5_000 }, async () => {
  for (const last of ["exit", "new", null]) {
    const fresh = { session: fakeSession(replying(both), []), notes: [], record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined };
    const chat = questionsChat(replying(both), { newChat: async () => fresh });
    chat.lines.push("/questions");
    await settled();
    chat.lines.push("The one on the ring road.");
    await settled();
    if (last === null) chat.lines.close();
    else chat.lines.push(last);
    await settled();
    assert.equal(chat.notes.length, 1, String(last));
    assert.ok(chat.notes[0].includes("> The one on the ring road."), chat.notes[0]);
    assert.ok(!chat.notes[0].includes("> new") && !chat.notes[0].includes("> exit"), chat.notes[0]);
    if (last === "new") {
      chat.lines.push("May.");
      await settled();
      assert.equal(chat.notes.length, 1, "after new, the old questions are over");
      chat.lines.close();
    }
    await chat.running;
  }
});

test("while questions are open, ratings, / commands and an empty line aren't answers, and /questions again says one is open", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(block(...gapLines)));
  chat.lines.push("/questions");
  await settled();
  for (const line of ["+", "-", "", "/other", "/questions"]) chat.lines.push(line);
  await settled();
  assert.ok(chat.output().includes(`  (${questionsCommandNote(true)})\n`), chat.output());
  assert.ok(chat.output().includes(`  (${questionsOpenNote})\n`), chat.output());
  assert.deepEqual(chat.events, ["ask instruction"]);
  chat.lines.push("/talk");
  await settled();
  chat.lines.push("Alpha is the ring road one.");
  await settled();
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes("> Alpha is the ring road one."), chat.notes[0]);
  assert.ok(!/> [+\-/]/.test(chat.notes[0]), chat.notes[0]);
  chat.lines.close();
  await chat.running;
});

test("an answer too long to file keeps the question open for a shorter one", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(block(...gapLines)));
  chat.lines.push("/questions");
  await settled();
  chat.lines.push("a".repeat(4001));
  await settled();
  assert.ok(chat.output().endsWith(`  (${tooLongNote})\nYou: `), chat.output());
  assert.equal(tooLongNote, "that answer is over 4,000 characters, too long to file, so give a shorter one, or type skip or never mind");
  chat.lines.push("b".repeat(4000));
  await settled();
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes(`> ${"b".repeat(4000)}`));
  chat.lines.close();
  await chat.running;
});

test("spoken, the words start the questions without asking Claude, each question is said and listened for as a follow-up, and answers are filed as Whisper heard them", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both));
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Hey Jarvis, any questions for me?"), textMs: 900 });
  await settled();
  await pause(5);
  assert.deepEqual(chat.events, ["ask instruction"]);
  assert.ok(chat.output().includes(`${heardPrefix}Hey Jarvis, any questions for me?\n  (${lookingNote})\n`), chat.output());
  assert.deepEqual([chat.spoken, chat.follows], [["Which garden centre is Alpha?"], ["follow"]]);
  chat.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("The one on the ring wood."), textMs: 700 });
  await settled();
  await pause(5);
  assert.deepEqual([chat.spoken.at(-1), chat.follows.length], ["Is the boiler service in March or May?", 2]);
  chat.wake.push({ kind: "wake", id: 6, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 6, answer: earsDone("Skip."), textMs: 700 });
  await settled();
  await pause(5);
  assert.deepEqual([chat.spoken.at(-1), chat.follows.length], [fileItReply.say, 3]);
  chat.wake.push({ kind: "wake", id: 7, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 7, answer: earsDone("Yes please."), textMs: 700 });
  await settled();
  await pause(5);
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes("- Phil answered (spoken, as Whisper heard it), 2026-11-26 09:30:\n\n> The one on the ring wood."), chat.notes[0]);
  assert.ok(chat.notes[0].includes("- Phil didn't answer, but said yes to filing it"), chat.notes[0]);
  assert.equal(chat.follows.length, 3, "no follow-up after the filing is said");
  assert.deepEqual(chat.recorded, []);
  chat.lines.close();
  await chat.running;
});

test("while questions are open, what's heard is the answer even if it sounds like a code word, and never mind still ends them", { timeout: 5_000 }, async () => {
  let notesSaved = 0;
  const chat = questionsChat(replying(both), { codeWords: { note: async () => (notesSaved++, { say: "Noted." }), phone: async () => ({ say: "unused" }), trains: async () => ({ say: "unused" }) } });
  chat.lines.push("/questions");
  await settled();
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Note this: it's the ring road one."), textMs: 900 });
  await settled();
  chat.wake.push({ kind: "wake", id: 5 });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("Never mind."), textMs: 900 });
  await settled();
  assert.equal(notesSaved, 0);
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes("> Note this: it's the ring road one."), chat.notes[0]);
  assert.ok(!chat.notes[0].includes("boiler"), chat.notes[0]);
  chat.lines.close();
  await chat.running;
});

test("while questions are open, a request to stop listening isn't an answer and isn't asked: it ends them like never mind, gets the same reply as outside them, and no follow-up listens again", { timeout: 5_000 }, async () => {
  const afters: boolean[] = [];
  const spoken: string[] = [];
  const chat = questionsChat(replying(both), {
    speak: (after) => {
      afters.push(after !== undefined);
      const finished = pause(20).then(() => {});
      return { ...fakeSpeech(spoken), done: () => finished };
    },
  });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Hey Jarvis, brain questions."), textMs: 900 });
  await settled();
  await pause(50);
  chat.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("The one on the ring road."), textMs: 700 });
  await settled();
  await pause(50);
  assert.equal(chat.follows.length, 2);
  chat.wake.push({ kind: "wake", id: 6, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 6, answer: earsDone("Can you stop listening?"), textMs: 700 });
  await settled();
  await pause(50);
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes("> The one on the ring road."), chat.notes[0]);
  assert.ok(!chat.notes[0].includes("stop listening") && !chat.notes[0].includes("boiler"), chat.notes[0]);
  assert.ok(chat.output().includes(`${heardPrefix}Can you stop listening?\nJarvis: I've filed that in the brain's inbox.\n  (saved in the brain's inbox as 2026-11-26-brain-questions.md)\nJarvis: ${stopMyselfReply.say}\n  (${stopMyselfReply.note})\n`), chat.output());
  assert.deepEqual([spoken.at(-1), afters.at(-1)], [stopMyselfReply.say, true]);
  assert.equal(chat.follows.length, 2, "no follow-up after the request to stop listening");
  chat.wake.push({ kind: "wake", id: 7 });
  await settled();
  chat.wake.push({ kind: "done", id: 7, answer: earsDone("Stop listening for a minute."), textMs: 700 });
  await settled();
  await pause(50);
  assert.ok(chat.output().endsWith(`${heardPrefix}Stop listening for a minute.\nJarvis: ${stopMyselfReply.say}\n  (${stopMyselfReply.note})\nYou: `), chat.output());
  assert.deepEqual([chat.events, chat.notes.length, chat.follows.length, chat.recorded], [["ask instruction"], 1, 2, []]);
  const second = questionsChat(replying(both));
  second.lines.push("/questions");
  await settled();
  second.wake.push({ kind: "wake", id: 4 });
  await settled();
  second.wake.push({ kind: "done", id: 4, answer: earsDone("Stop listening for a minute."), textMs: 700 });
  await settled();
  await pause(50);
  assert.deepEqual([second.notes, second.events, second.follows], [[], ["ask instruction"], []]);
  assert.ok(second.output().includes(`Jarvis: ${nothingFiledReply.say}\n  (${nothingFiledReply.note})\nJarvis: ${stopMyselfReply.say}\n`), second.output());
  for (const chatToClose of [chat, second]) chatToClose.lines.close();
  await Promise.all([chat.running, second.running]);
});

test("while questions are open, ears muting itself on stop listening ends them like never mind, files only what was answered, and nothing heard after is an answer", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both), {}, undefined, { "What's the time?": "Ten past nine." });
  chat.wake.push({ kind: "wake", id: 4 });
  await settled();
  chat.wake.push({ kind: "done", id: 4, answer: earsDone("Brain questions."), textMs: 900 });
  await settled();
  await pause(5);
  chat.wake.push({ kind: "wake", id: 5, follow: true });
  await settled();
  chat.wake.push({ kind: "done", id: 5, answer: earsDone("The one on the ring road."), textMs: 700 });
  await settled();
  await pause(5);
  chat.wake.push({ kind: "wake", id: 6, follow: true });
  await settled();
  const muted: EarsAnswer = { status: 200, state: "muted", reason: null, error: null, seconds: null, last: { seconds: 2, reason: "it went quiet for 1.5 seconds after you spoke", text: null, textProblem: "you said stop listening, so ears muted itself. Unmute it on the server with bash host/ears.sh unmute" } };
  chat.wake.push({ kind: "done", id: 6, answer: muted, textMs: 700 });
  await settled();
  await pause(5);
  assert.equal(chat.notes.length, 1);
  assert.ok(chat.notes[0].includes("> The one on the ring road.") && !chat.notes[0].includes("boiler"), chat.notes[0]);
  assert.ok(chat.output().includes(`Jarvis: I've filed that in the brain's inbox.\n  (saved in the brain's inbox as 2026-11-26-brain-questions.md)\nJarvis: ${stoppedReply.say}\n  (${stoppedReply.note})\n`), chat.output());
  assert.deepEqual([chat.spoken.at(-1), chat.follows.length], [stoppedReply.say, 2]);
  chat.wake.push({ kind: "wake", id: 7 });
  await settled();
  chat.wake.push({ kind: "done", id: 7, answer: earsDone("What's the time?"), textMs: 700 });
  await settled();
  await pause(5);
  assert.deepEqual([chat.events, chat.notes.length], [["ask instruction", "ask What's the time?"], 1]);
  const quiet = questionsChat(replying(both));
  quiet.lines.push("/questions");
  await settled();
  quiet.wake.push({ kind: "wake", id: 4 });
  await settled();
  quiet.wake.push({ kind: "done", id: 4, answer: muted, textMs: 700 });
  await settled();
  await pause(5);
  assert.deepEqual([quiet.notes, quiet.follows], [[], []]);
  assert.ok(quiet.output().includes(`Jarvis: ${nothingFiledReply.say}\n  (${nothingFiledReply.note})\nJarvis: ${stoppedReply.say}\n`), quiet.output());
  for (const chatToClose of [chat, quiet]) chatToClose.lines.close();
  await Promise.all([chat.running, quiet.running]);
});

test("typed words are never the spoken code word, so typing brain questions asks Claude", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both), {}, undefined, { "Brain questions": "Type /questions." });
  chat.lines.push("Brain questions");
  await settled();
  assert.deepEqual(chat.events, ["ask Brain questions"]);
  chat.lines.close();
  await chat.running;
});

test("/questions can be typed in any case", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(block()));
  chat.lines.push("/Questions");
  await settled();
  assert.deepEqual(chat.events, ["ask instruction"]);
  chat.lines.close();
  await chat.running;
});

test("a wake word that starts brain questions starts the count of follow-ups in a row again, so the first question is listened for", { timeout: 5_000 }, async () => {
  const chat = questionsChat(replying(both), {}, undefined, { "What's the time?": "Ten past nine.", "And then?": "Later." });
  chat.wake.push({ kind: "wake", id: 1 });
  await settled();
  chat.wake.push({ kind: "done", id: 1, answer: earsDone("What's the time?"), textMs: 900 });
  await settled();
  await pause(5);
  for (let id = 2; id <= 6; id++) {
    chat.wake.push({ kind: "wake", id, follow: true });
    await settled();
    chat.wake.push({ kind: "done", id, answer: earsDone("And then?"), textMs: 700 });
    await settled();
    await pause(5);
  }
  assert.equal(chat.follows.length, 5);
  assert.ok(chat.output().includes(`(${followLimitNote})`), chat.output());
  chat.wake.push({ kind: "wake", id: 7 });
  await settled();
  chat.wake.push({ kind: "done", id: 7, answer: earsDone("Brain questions."), textMs: 700 });
  await settled();
  await pause(5);
  assert.equal(chat.follows.length, 6, chat.output());
  assert.equal(chat.output().split(followLimitNote).length, 2, "the limit is said only the once");
  chat.lines.close();
  await chat.running;
});
