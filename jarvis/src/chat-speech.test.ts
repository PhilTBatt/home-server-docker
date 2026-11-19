import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { startAnswerLog, type Outcome, type Rating } from "./answer-log.js";
import { startAnswerSpeech, type AnswerSpeech } from "./answer-speech.js";
import { runChat, type ChatDeps, type NewChat } from "./chat.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Answer } from "./timing.js";

type Script = (listener: AnswerListener) => Promise<Answer>;

const quiet: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, left: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };

function answer(text: string): Answer {
  return { text, firstWordsMs: 500, totalMs: 1200 };
}

function fakeSession(scripts: Record<string, Script>, events: string[] = []): AgentSession {
  let stopped: string | null = null;
  return {
    ask(question: string, listener: AnswerListener = {}) {
      events.push(`ask ${question}`);
      const script = scripts[question];
      return script === undefined ? Promise.reject(new Error(`Unexpected question: ${question}`)) : script(listener);
    },
    readyMs: () => null,
    costUsd: () => 0.0012,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
}

type FakeSpeech = { speech: AnswerSpeech; calls: string[]; finish: () => void; after: Promise<void> | undefined };

function speaker(events: string[] = [], each: (number: number) => { talking?: boolean; playing?: boolean; report?: Partial<SpeechReport> } = () => ({})) {
  const made: FakeSpeech[] = [];
  const speak = (after?: Promise<void>) => {
    const number = made.length + 1;
    const parts = each(number);
    const calls: string[] = [];
    const note = (call: string) => {
      calls.push(call);
      events.push(`speech ${number} ${call}`);
    };
    note("made");
    let finish = () => {};
    let halted = false;
    const done = parts.talking === true ? new Promise<void>((resolve) => (finish = resolve)) : Promise.resolve();
    const speech: AnswerSpeech = {
      text: (delta) => note(`text ${delta}`),
      gap: () => note("gap"),
      restart: () => note("restart"),
      end: () => note("end"),
      stop: () => {
        note("stop");
        halted = true;
        finish();
      },
      finish: () => {
        note("finish");
        halted = true;
        return parts.playing === true;
      },
      done: () => done,
      report: () => ({ ...quiet, ...parts.report, stopped: halted && parts.report?.stopped === true }),
    };
    made.push({ speech, calls, finish: () => finish(), after });
    return speech;
  };
  return { speak, made };
}

async function* linesOf(...lines: string[]): AsyncGenerator<string> {
  for (const line of lines) yield line;
}

function typing() {
  const waiting: string[] = [];
  let closed = false;
  let wake = () => {};
  async function* lines(): AsyncGenerator<string> {
    for (;;) {
      while (waiting.length === 0 && !closed) await new Promise<void>((resolve) => (wake = resolve));
      const line = waiting.shift();
      if (line === undefined) return;
      yield line;
    }
  }
  return {
    lines: lines(),
    type: (line: string) => {
      waiting.push(line);
      wake();
    },
    close: () => {
      closed = true;
      wake();
    },
  };
}

function chat(session: AgentSession, lines: AsyncIterable<string>, overrides: Partial<ChatDeps> = {}, events: string[] = []) {
  let output = "";
  const deps: ChatDeps = {
    lines,
    session,
    write: (text) => {
      output += text;
    },
    prompt: () => {
      output += "You: ";
      events.push("prompt");
    },
    questionTimeoutMs: 1000,
    ...overrides,
  };
  return { run: () => ended(runChat(deps)), output: () => output };
}

async function ended(running: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("the chat didn't end")), 5000);
  });
  try {
    await Promise.race([running, late]);
  } finally {
    clearTimeout(timer);
  }
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

const hello: Script = async (listener) => {
  listener.text?.("Hi ");
  listener.text?.("Phil. ");
  listener.text?.("All good.");
  return answer("Hi Phil. All good.");
};

test("with a voice, an answer's words are passed to its speech as they arrive and the speech is told when the answer ends", async () => {
  const { speak, made } = speaker();
  await chat(fakeSession({ Hello: hello }), linesOf("Hello"), { speak }).run();
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].calls, ["made", "text Hi ", "text Phil. ", "text All good.", "end", "stop"]);
});

test("what's printed with a voice is exactly what's printed without one", async () => {
  const scripts: Record<string, Script> = {
    Hello: hello,
    Tools: async (listener) => {
      listener.text?.("Let me look. ");
      listener.tool?.("Read", { file_path: "/brain/index.md" });
      listener.note?.("the hub didn't answer");
      listener.text?.("Found it.");
      return answer("Let me look. Found it.");
    },
  };
  const silent = chat(fakeSession(scripts), linesOf("Hello", "Tools", "", "+", "exit"));
  await silent.run();
  const spoken = chat(fakeSession(scripts), linesOf("Hello", "Tools", "", "+", "exit"), { speak: speaker().speak });
  await spoken.run();
  assert.equal(spoken.output(), silent.output());
  assert.equal(spoken.output().includes("Let me look."), true);
});

test("only the answer's own words are spoken: not the tool notes, other notes, the timing line or the cost", async () => {
  const { speak, made } = speaker();
  const session = fakeSession({
    Tools: async (listener) => {
      listener.text?.("Let me look. ");
      listener.tool?.("Read", { file_path: "/brain/index.md" });
      listener.note?.("the hub didn't answer");
      listener.text?.("Found it.");
      return answer("Let me look. Found it.");
    },
  });
  await chat(session, linesOf("Tools"), { speak }).run();
  assert.deepEqual(made[0].calls, ["made", "text Let me look. ", "gap", "gap", "text Found it.", "end", "stop"]);
});

test("a tool, a note or a yes-or-no question marks a gap, so what he said before it is spoken then and isn't run into what follows", async () => {
  const events: string[] = [];
  const { speak, made } = speaker(events);
  const session = fakeSession({
    Tool: async (listener) => {
      listener.text?.("Let me look.");
      listener.tool?.("Read", { file_path: "/brain/index.md" });
      events.push("tool running");
      listener.text?.("Found it.");
      return answer("Let me look.Found it.");
    },
    Action: async (listener) => {
      listener.text?.("I'll stop it.");
      listener.tool?.("mcp__hub__stop_download", { hash: "abc" });
      listener.text?.("Done.");
      return answer("I'll stop it.Done.");
    },
    Note: async (listener) => {
      listener.text?.("One moment.");
      listener.note?.("the hub didn't answer");
      listener.text?.("No luck.");
      return answer("One moment.No luck.");
    },
    Ask: async (listener) => {
      listener.text?.("Shall I?");
      await listener.confirm?.("mcp__hub__stop_download", { hash: "abc" });
      listener.text?.("Left alone.");
      return answer("Shall I?Left alone.");
    },
  });
  const confirm = async () => {
    events.push("question asked");
    return "no";
  };
  await chat(session, linesOf("Tool", "Action", "Note", "Ask"), { speak, confirm }, events).run();
  assert.deepEqual(made[0].calls, ["made", "text Let me look.", "gap", "text Found it.", "end", "stop"]);
  assert.equal(events.indexOf("speech 1 gap") < events.indexOf("tool running"), true);
  assert.deepEqual(made[1].calls, ["made", "text I'll stop it.", "gap", "text Done.", "end", "stop"]);
  assert.deepEqual(made[2].calls, ["made", "text One moment.", "gap", "text No luck.", "end", "stop"]);
  assert.deepEqual(made[3].calls, ["made", "text Shall I?", "gap", "text Left alone.", "end", "stop"]);
  assert.equal(events.indexOf("speech 4 gap") < events.indexOf("question asked"), true);
});

test("the words are passed on as they were written, even where the screen leaves control characters out", async () => {
  const { speak, made } = speaker();
  const session = fakeSession({
    Odd: async (listener) => {
      listener.text?.("Bell\u0007 here.");
      return answer("Bell\u0007 here.");
    },
  });
  const { run, output } = chat(session, linesOf("Odd"), { speak });
  await run();
  assert.equal(made[0].calls[1], "text Bell\u0007 here.");
  assert.equal(output().includes("Bell here."), true);
});

test("an answer that arrives all at once, with nothing streamed, is still spoken", async () => {
  const { speak, made } = speaker();
  await chat(fakeSession({ Whole: async () => answer("One go. Two sentences.") }), linesOf("Whole"), { speak }).run();
  assert.deepEqual(made[0].calls, ["made", "text One go. Two sentences.", "end", "stop"]);
});

test("each answer gets a speech of its own, set up as the question is sent and before any of its words", async () => {
  const events: string[] = [];
  const { speak, made } = speaker(events);
  await chat(fakeSession({ Hello: hello, Again: hello }, events), linesOf("Hello", "Again"), { speak }, events).run();
  assert.equal(made.length, 2);
  assert.deepEqual(events.slice(0, 3), ["prompt", "speech 1 made", "ask Hello"]);
  assert.equal(events.indexOf("speech 2 made") < events.indexOf("ask Again"), true);
});

test("a new question stops what's still being said of the last answer before it's asked", async () => {
  const events: string[] = [];
  const { speak } = speaker(events);
  await chat(fakeSession({ Hello: hello, Again: hello }, events), linesOf("Hello", "Again"), { speak }, events).run();
  const stopped = events.indexOf("speech 1 stop");
  assert.equal(stopped > events.indexOf("speech 1 end"), true);
  assert.equal(stopped < events.indexOf("speech 2 made"), true);
  assert.equal(stopped < events.indexOf("ask Again"), true);
});

test("the prompt comes back as soon as the words are done, without waiting for the speech to finish", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events, () => ({ talking: true }));
  const { run, output } = chat(fakeSession({ Hello: hello }, events), typed.lines, { speak }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  assert.equal(output().endsWith("You: "), true);
  assert.deepEqual(made[0].calls.slice(-1), ["end"]);
  typed.close();
  await running;
  assert.deepEqual(made[0].calls.slice(-1), ["stop"]);
});

test("exit, the chat closing and new all stop the speech at once", async () => {
  for (const last of ["exit", null, "new"]) {
    const { speak, made } = speaker();
    const session = fakeSession({ Hello: hello });
    const fresh: NewChat = { session: fakeSession({}), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [] };
    await chat(session, last === null ? linesOf("Hello") : linesOf("Hello", last), { speak, newChat: async () => fresh }).run();
    assert.deepEqual(made[0].calls.slice(-2), ["end", "stop"], String(last));
    assert.equal(made.length, 1);
  }
});

test("new stops him talking there and then, before the new chat is set up", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events, () => ({ talking: true }));
  const fresh: NewChat = { session: fakeSession({}), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [] };
  const newChat = async () => {
    events.push("new chat set up");
    return fresh;
  };
  const { run } = chat(fakeSession({ Hello: hello }, events), typed.lines, { speak, newChat }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["end"]);
  typed.type("new");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["stop"]);
  assert.equal(events.indexOf("speech 1 stop") < events.indexOf("new chat set up"), true);
  assert.equal(events.includes("new chat set up"), true);
  typed.close();
  await running;
  assert.deepEqual(made[0].calls.filter((call) => call === "stop").length, 1);
});

test("the next question isn't sent until the last answer's speech has been logged", async () => {
  const events: string[] = [];
  const typed = typing();
  let logged = () => {};
  const recordSpeech = () => {
    events.push("speech log started");
    return new Promise<void>((resolve) => (logged = resolve));
  };
  const { run } = chat(fakeSession({ Hello: hello, Again: hello }, events), typed.lines, { speak: speaker(events).speak, recordSpeech }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  typed.type("Again");
  await turn();
  await turn();
  assert.equal(events.includes("speech log started"), true);
  assert.equal(events.includes("ask Again"), false);
  logged();
  await turn();
  await turn();
  assert.equal(events.includes("ask Again"), true);
  typed.close();
  logged();
  await running;
});

test("a speech log that fails doesn't stop the chat, the next question or the notes", async () => {
  const events: string[] = [];
  const recordSpeech = async () => {
    events.push("speech log tried");
    throw new Error("disk full");
  };
  const { speak } = speaker(events, () => ({ report: { failed: 1, problem: "Kokoro replied 500" } }));
  const { run, output } = chat(fakeSession({ Hello: hello, Again: hello }, events), linesOf("Hello", "Again"), { speak, recordSpeech }, events);
  await run();
  assert.deepEqual(events.filter((event) => event.startsWith("ask") || event === "speech log tried"), ["ask Hello", "speech log tried", "ask Again", "speech log tried"]);
  assert.equal(output().split("1 sentence of the last answer wasn't spoken: Kokoro replied 500").length - 1, 2);
});

test("through the real sentence finder and queue, what he says before a tool is asked for while the tool runs, and what follows is a sentence of its own", async () => {
  const asked: string[] = [];
  const events: string[] = [];
  const speak = () =>
    startAnswerSpeech({
      make: async (sentence) => {
        asked.push(sentence);
        events.push(`asked ${sentence}`);
        return Uint8Array.of(1);
      },
      play: async () => {},
      now: () => 0,
      start: "sentence",
    });
  const session = fakeSession({
    Check: async (listener) => {
      listener.text?.("Let me check ");
      listener.text?.("your notes.");
      listener.tool?.("Read", { file_path: "/brain/index.md" });
      await turn();
      events.push("tool finished");
      listener.text?.("Your server's fine. ");
      listener.text?.("Nothing to do.");
      return answer("Let me check your notes.Your server's fine. Nothing to do.");
    },
  });
  const typed = typing();
  const { run } = chat(session, typed.lines, { speak }, events);
  const running = run();
  typed.type("Check");
  for (let turns = 0; turns < 6; turns++) await turn();
  assert.deepEqual(asked, ["Let me check your notes.", "Your server's fine.", "Nothing to do."]);
  assert.equal(events.indexOf("asked Let me check your notes.") < events.indexOf("tool finished"), true);
  typed.close();
  await running;
});

test("after an answer that failed, the next question isn't sent until its speech has really stopped", async () => {
  const events: string[] = [];
  const typed = typing();
  let over = () => {};
  const done = new Promise<void>((resolve) => (over = resolve));
  const speak = (): AnswerSpeech => ({ text: () => {}, gap: () => {}, restart: () => {}, end: () => {}, stop: () => void events.push("stop"), finish: () => false, done: () => (events.includes("ask Again") ? Promise.resolve() : done), report: () => quiet });
  const session = fakeSession({ Hello: () => Promise.reject(new Error("the engine fell over")), Again: hello }, events);
  const { run } = chat(session, typed.lines, { speak }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  assert.deepEqual(events.filter((event) => event === "stop").length, 1);
  typed.type("Again");
  await turn();
  await turn();
  assert.equal(events.includes("ask Again"), false);
  over();
  await turn();
  await turn();
  assert.equal(events.includes("ask Again"), true);
  typed.close();
  await running;
});

test("pressing Enter on an empty line stops him talking, and does nothing else", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events);
  const { run, output } = chat(fakeSession({ Hello: hello }, events), typed.lines, { speak }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  const before = output();
  assert.deepEqual(made[0].calls.slice(-1), ["end"]);
  typed.type("   ");
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["stop"]);
  assert.equal(output(), `${before}You: `);
  assert.equal(made.length, 1);
  typed.close();
  await running;
});

test("an empty line with nothing being said is ignored, as before", async () => {
  const { run, output } = chat(fakeSession({}), linesOf("", "  "), { speak: speaker().speak });
  await run();
  assert.equal(output().includes("Jarvis: "), false);
});

test("a rating, a slash command and a question refused for the chat's length leave him talking", async () => {
  const typed = typing();
  const { speak, made } = speaker();
  const session = fakeSession({
    Hello: async (listener) => {
      listener.text?.("Hi.");
      return { ...answer("Hi."), stats: { rounds: 1, toolUses: 0, inputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 5, costUsd: 0.001, earlierThinkingBlocks: null, recovered: false, largestRequestTokens: 900, lastRequestTokens: 900, refusedTools: [], spokeFirst: null, retried: null } };
    },
  });
  const ratings: Rating[] = [];
  const { run, output } = chat(session, typed.lines, { speak, lengthCap: 500, rate: async (rating) => (ratings.push(rating), "saved") });
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  typed.type("+");
  typed.type("/help");
  typed.type("Another question");
  await turn();
  await turn();
  assert.deepEqual(ratings, ["good"]);
  assert.equal(output().includes("Jarvis doesn't take / commands"), true);
  assert.equal(output().includes("so that wasn't sent"), true);
  assert.deepEqual(made[0].calls.slice(-1), ["end"]);
  assert.equal(made.length, 1);
  typed.close();
  await running;
});

test("an answer that starts again, or is tried again after a network error, starts its speech again too", async () => {
  const { speak, made } = speaker();
  const session = fakeSession({
    Restart: async (listener) => {
      listener.text?.("First try. ");
      listener.restart?.();
      listener.text?.("Second try.");
      return answer("Second try.");
    },
    Retry: async (listener) => {
      listener.retry?.();
      listener.text?.("Got through.");
      return answer("Got through.");
    },
  });
  await chat(session, linesOf("Restart", "Retry"), { speak }).run();
  assert.deepEqual(made[0].calls, ["made", "text First try. ", "restart", "text Second try.", "end", "stop"]);
  assert.deepEqual(made[1].calls, ["made", "restart", "text Got through.", "end", "stop"]);
});

test("an answer that fails stops its speech at once and never ends it as if it were whole", async () => {
  const { speak, made } = speaker();
  const session = fakeSession({
    Broken: async (listener) => {
      listener.text?.("I was saying");
      throw new Error("The API stopped with an error: overloaded");
    },
    Hello: hello,
  });
  const { run, output } = chat(session, linesOf("Broken", "Hello"), { speak });
  await run();
  assert.deepEqual(made[0].calls, ["made", "text I was saying", "stop", "stop"]);
  assert.equal(output().includes("Jarvis couldn't answer: The API stopped with an error: overloaded"), true);
  assert.equal(made[1].calls.includes("end"), true);
});

test("an answer that runs out of time stops its speech too", async () => {
  const { speak, made } = speaker();
  const session = fakeSession({});
  session.ask = (_question, listener) => {
    listener?.text?.("Thinking aloud. ");
    return new Promise<Answer>((_resolve, reject) => {
      const check = setInterval(() => {
        if (session.stoppedReason() === null) return;
        clearInterval(check);
        reject(new Error(closedMessage));
      }, 5);
    });
  };
  const { run, output } = chat(session, linesOf("Slow"), { speak, questionTimeoutMs: 30 });
  await run();
  assert.deepEqual(made[0].calls, ["made", "text Thinking aloud. ", "stop", "stop"]);
  assert.equal(output().includes("Jarvis couldn't answer: No answer within 0.03 seconds"), true);
});

test("an answer stopped with Ctrl+C stops its speech too", async () => {
  const { speak, made } = speaker();
  const session = fakeSession({});
  session.ask = (_question, listener) => {
    listener?.text?.("Thinking aloud. ");
    return new Promise<Answer>((_resolve, reject) => {
      setTimeout(() => {
        session.close();
        reject(new Error(closedMessage));
      }, 10);
    });
  };
  const { run, output } = chat(session, linesOf("Slow"), { speak });
  await run();
  assert.deepEqual(made[0].calls, ["made", "text Thinking aloud. ", "stop", "stop"]);
  assert.equal(output().includes("(stopped)"), true);
});

test("the answer is logged straight away, as it is without a voice, and its speech is logged once the speech is over", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events, () => ({ talking: true, report: { firstSentenceMs: 900, firstSoundMadeMs: 1700, firstSoundMs: 1750, spoken: 4 } }));
  const outcomes: Outcome[] = [];
  const reports: SpeechReport[] = [];
  const { run, output } = chat(fakeSession({ Hello: hello }, events), typed.lines, { speak, record: async (outcome) => void outcomes.push(outcome), recordSpeech: async (report) => void reports.push(await report) }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  assert.equal(output().endsWith("You: "), true);
  assert.deepEqual(outcomes, [{ answer: answer("Hi Phil. All good.") }]);
  assert.deepEqual(reports, []);
  made[0].finish();
  await turn();
  assert.deepEqual(reports, [{ ...quiet, firstSentenceMs: 900, firstSoundMadeMs: 1700, firstSoundMs: 1750, spoken: 4 }]);
  typed.close();
  await running;
  assert.deepEqual([outcomes.length, reports.length], [1, 1]);
});

test("a rating typed while he's still speaking is saved at once, against the answer he's speaking", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events, () => ({ talking: true }));
  const { run } = chat(
    fakeSession({ Hello: hello }, events),
    typed.lines,
    {
      speak,
      record: async () => void events.push("recorded"),
      rate: async (rating) => {
        events.push(`rated ${rating}`);
        return "saved";
      },
    },
    events,
  );
  const running = run();
  typed.type("Hello");
  typed.type("+");
  await turn();
  await turn();
  assert.deepEqual(
    events.filter((event) => event === "recorded" || event.startsWith("rated")),
    ["recorded", "rated good"],
  );
  assert.equal(made[0].calls.includes("stop"), false);
  typed.close();
  await running;
});

test("a new question stops the speech, and that speech is logged before the next answer is, so each lands against its own answer", async () => {
  const events: string[] = [];
  const speak = (): AnswerSpeech => {
    let release = () => {};
    const done = new Promise<void>((resolve) => (release = resolve));
    return { text: () => {}, gap: () => {}, restart: () => {}, end: () => {}, stop: () => release(), finish: () => false, done: () => done, report: () => ({ ...quiet, stopped: true }) };
  };
  const log = { record: async (outcome: Outcome) => void events.push(`recorded ${"answer" in outcome ? outcome.answer.text : "error"}`), recordSpeech: async (report: Promise<SpeechReport>) => void events.push(`speech logged, stopped ${(await report).stopped}`) };
  const { run } = chat(fakeSession({ Hello: hello, Again: hello }, events), linesOf("Hello", "Again"), { speak, ...log }, events);
  await run();
  assert.deepEqual(
    events.filter((event) => event.startsWith("recorded") || event.startsWith("ask") || event.startsWith("speech logged")),
    ["ask Hello", "recorded Hi Phil. All good.", "speech logged, stopped true", "ask Again", "recorded Hi Phil. All good.", "speech logged, stopped true"],
  );
});

test("when the chat ends, the last answer's speech is stopped and logged before the cost is shown", async () => {
  const events: string[] = [];
  const { speak } = speaker(events, () => ({ talking: true }));
  const session = fakeSession({ Hello: hello }, events);
  const { run, output } = chat(session, linesOf("Hello", "exit"), { speak, recordSpeech: async (report) => {
      await report;
      events.push(`speech logged with ${output().includes("Cost of this chat") ? "the cost shown" : "no cost shown yet"}`);
    } }, events);
  await run();
  assert.deepEqual(
    events.filter((event) => event.startsWith("speech logged") || event === "speech 1 stop"),
    ["speech 1 stop", "speech logged with no cost shown yet"],
  );
});

test("an answer that failed has no speech logged, and neither does a chat without a voice", async () => {
  const reports: SpeechReport[] = [];
  const session = fakeSession({
    Broken: async (listener) => {
      listener.text?.("I was saying");
      throw new Error("The API stopped with an error: overloaded");
    },
    Hello: hello,
  });
  await chat(session, linesOf("Broken"), { speak: speaker().speak, recordSpeech: async (report) => void reports.push(await report) }).run();
  await chat(fakeSession({ Hello: hello }), linesOf("Hello"), { recordSpeech: async (report) => void reports.push(await report) }).run();
  assert.deepEqual(reports, []);
});

test("a new chat's own log takes over its speech too", async () => {
  const events: string[] = [];
  const { speak } = speaker();
  const fresh: NewChat = { session: fakeSession({ Hello: hello }), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: async () => void events.push("logged in the new chat"), notes: [] };
  await chat(fakeSession({ Hello: hello }), linesOf("Hello", "new", "Hello"), { speak, newChat: async () => fresh, recordSpeech: async () => void events.push("logged in the old chat") }).run();
  assert.deepEqual(events, ["logged in the old chat", "logged in the new chat"]);
});

test("anything that went wrong with the last answer's speech is noted before the next answer, once", async () => {
  const { speak } = speaker([], (number) => (number === 1 ? { report: { spoken: 2, failed: 1, problem: "Kokoro took longer than 30 seconds over one piece of speech" } } : {}));
  const { run, output } = chat(fakeSession({ Hello: hello, Again: hello, More: hello }), linesOf("Hello", "Again", "More"), { speak });
  await run();
  const note = "  (1 sentence of the last answer wasn't spoken: Kokoro took longer than 30 seconds over one piece of speech)\n";
  assert.equal(output().split(note).length, 2);
  assert.equal(output().indexOf(note) < output().indexOf("Jarvis: ", output().indexOf("Jarvis: ") + 1), true);
  assert.equal(output().includes(`You: ${note}Jarvis: `), true);
});

test("the note is shown when the chat ends too, before the cost, and with control characters left out", async () => {
  const { speak } = speaker([], () => ({ report: { failed: 2, left: 3, gaveUp: true, problem: "Couldn't reach Kokoro\u0007 at http://kokoro:8880 (ECONNREFUSED)" } }));
  const { run, output } = chat(fakeSession({ Hello: hello }), linesOf("Hello", "exit"), { speak });
  await run();
  assert.equal(output().endsWith("You:   (the last answer wasn't spoken: Couldn't reach Kokoro at http://kokoro:8880 (ECONNREFUSED))\n\nCost of this chat: about $0.0012\n"), true);
});

test("without a voice nothing is set up to speak, and the answer is logged straight away with no speech in it", async () => {
  const outcomes: Outcome[] = [];
  await chat(fakeSession({ Hello: hello }), linesOf("Hello"), { record: async (outcome) => void outcomes.push(outcome) }).run();
  assert.deepEqual(outcomes, [{ answer: answer("Hi Phil. All good.") }]);
});

test("an empty line typed before the prompt came back is ignored, and one typed after it stops him", async () => {
  const events: string[] = [];
  const typed = typing();
  let early = false;
  const { speak, made } = speaker(events, () => ({ report: { stopped: true, firstSoundMs: 900 } }));
  const { run, output } = chat(fakeSession({ Hello: hello }, events), typed.lines, { speak, early: () => early }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  const before = output();
  early = true;
  typed.type("");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["end"]);
  assert.equal(output(), `${before}You: `);
  early = false;
  typed.type("");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["stop"]);
  typed.close();
  await running;
});

test("a question typed before the prompt came back is still asked, and stops him first", async () => {
  const events: string[] = [];
  const { speak } = speaker(events);
  await chat(fakeSession({ Hello: hello, Again: hello }, events), linesOf("Hello", "Again"), { speak, early: () => true }, events).run();
  assert.equal(events.includes("ask Again"), true);
  assert.equal(events.indexOf("speech 1 stop") < events.indexOf("ask Again"), true);
});

test("stopped by an empty line or a new question, he says he's stopped talking, or that the answer won't be spoken if he hadn't started", async () => {
  for (const [report, note] of [
    [{ stopped: true, firstSoundMs: 1200 }, "stopped talking"],
    [{ stopped: true, firstSoundMs: null }, "the last answer won't be spoken"],
  ] as const) {
    const { speak } = speaker([], (number) => (number === 1 ? { report } : {}));
    const byQuestion = chat(fakeSession({ Hello: hello, Again: hello }), linesOf("Hello", "Again"), { speak });
    await byQuestion.run();
    assert.equal(byQuestion.output().includes(`You:   (${note})\nJarvis: `), true, note);
    const byEnter = chat(fakeSession({ Hello: hello }), linesOf("Hello", ""), { speak: speaker([], () => ({ report })).speak });
    await byEnter.run();
    assert.equal(byEnter.output().includes(`You:   (${note})\nYou: `), true, note);
  }
});

test("there's no stop note when he'd already finished, or when exit, new or the chat closing stopped him", async () => {
  const finished = chat(fakeSession({ Hello: hello, Again: hello }), linesOf("Hello", "", "Again"), { speak: speaker().speak });
  await finished.run();
  assert.equal(finished.output().includes("stopped talking"), false);
  const fresh: NewChat = { session: fakeSession({}), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [] };
  for (const last of ["exit", "new", null]) {
    const { speak } = speaker([], () => ({ report: { stopped: true, firstSoundMs: 800 } }));
    const ended = chat(fakeSession({ Hello: hello }), last === null ? linesOf("Hello") : linesOf("Hello", last), { speak, newChat: async () => fresh });
    await ended.run();
    assert.equal(ended.output().includes("stopped talking"), false, String(last));
  }
});

test("the stop note comes before anything else to say about that answer's speech", async () => {
  const { speak } = speaker([], () => ({ report: { stopped: true, firstSoundMs: 800, spoken: 1, failed: 1, problem: "Kokoro replied 500" } }));
  const { run, output } = chat(fakeSession({ Hello: hello }), linesOf("Hello", ""), { speak });
  await run();
  assert.equal(output().includes("You:   (stopped talking)\n  (1 sentence of the last answer wasn't spoken: Kokoro replied 500)\nYou: "), true);
});

test("set to stop at once, a new answer's speech isn't told to wait for anything", async () => {
  for (const speechStop of [undefined, "now"] as const) {
    const { speak, made } = speaker();
    await chat(fakeSession({ Hello: hello, Again: hello }), linesOf("Hello", "", "Again"), { speak, speechStop }).run();
    assert.deepEqual(made.map((each) => each.after), [undefined, undefined]);
    assert.equal(made[0].calls.includes("finish"), false);
  }
});

test("set to finish the sentence, a new question lets the last answer finish its sentence, asks at once, and its speech waits for that sentence", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events, (number) => ({ talking: true, playing: number === 1, report: { stopped: true, firstSoundMs: 700 } }));
  const { run, output } = chat(fakeSession({ Hello: hello, Again: hello }, events), typed.lines, { speak, speechStop: "sentence" }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  typed.type("Again");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["finish"]);
  assert.equal(made[0].calls.includes("stop"), false);
  assert.equal(events.includes("ask Again"), true);
  assert.equal(events.indexOf("speech 1 finish") < events.indexOf("ask Again"), true);
  assert.equal(output().includes("You:   (stopping after this sentence)\nJarvis: "), true);
  const after = made[1].after;
  assert.notEqual(after, undefined);
  assert.equal(await Promise.race([after?.then(() => "over"), turn().then(() => "waiting")]), "waiting");
  made[0].finish();
  assert.equal(await Promise.race([after?.then(() => "over"), turn().then(() => "waiting")]), "over");
  typed.close();
  await running;
});

test("set to finish the sentence, the note says what happened when no sentence was playing", async () => {
  for (const [report, note] of [
    [{ stopped: true, firstSoundMs: 700 }, "stopped talking"],
    [{ stopped: true, firstSoundMs: null }, "the last answer won't be spoken"],
    [{ stopped: false }, null],
  ] as const) {
    const { speak } = speaker([], () => ({ talking: true, playing: false, report }));
    const { run, output } = chat(fakeSession({ Hello: hello }), linesOf("Hello", ""), { speak, speechStop: "sentence" });
    await run();
    if (note === null) assert.equal(output().includes("You:   ("), false);
    else assert.equal(output().includes(`You:   (${note})\nYou: `), true, note);
  }
});

test("set to finish the sentence, an empty line brings the prompt back without waiting for the sentence", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events, () => ({ talking: true, playing: true, report: { stopped: true } }));
  const { run, output } = chat(fakeSession({ Hello: hello }, events), typed.lines, { speak, speechStop: "sentence" }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  typed.type("");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["finish"]);
  assert.equal(output().endsWith("You:   (stopping after this sentence)\nYou: "), true);
  typed.type("");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.slice(-1), ["finish"]);
  typed.close();
  await running;
  assert.deepEqual(made[0].calls.slice(-1), ["stop"]);
});

test("set to finish the sentence, a new answer waits for the sentence an empty line left finishing, and a sentence that has ended is let go", async () => {
  const { speak, made } = speaker([], () => ({ talking: true, playing: true, report: { stopped: true } }));
  const typed = typing();
  const { run, output } = chat(fakeSession({ One: hello, Two: hello, Three: hello }), typed.lines, { speak, speechStop: "sentence" });
  const running = run();
  typed.type("One");
  await turn();
  await turn();
  typed.type("");
  await turn();
  typed.type("Two");
  await turn();
  await turn();
  assert.deepEqual(made[0].calls.filter((call) => call === "finish" || call === "stop"), ["finish"]);
  const first = made[1].after;
  assert.equal(await Promise.race([first?.then(() => "over"), turn().then(() => "waiting")]), "waiting");
  made[0].finish();
  assert.equal(await Promise.race([first?.then(() => "over"), turn().then(() => "waiting")]), "over");
  await turn();
  await turn();
  typed.type("Three");
  await turn();
  await turn();
  const second = made[2].after;
  assert.equal(await Promise.race([second?.then(() => "over"), turn().then(() => "waiting")]), "waiting");
  made[1].finish();
  assert.equal(await Promise.race([second?.then(() => "over"), turn().then(() => "waiting")]), "over");
  assert.equal(output().split("(stopping after this sentence)").length, 3);
  typed.close();
  await running;
  assert.deepEqual(made[0].calls.filter((call) => call === "finish" || call === "stop"), ["finish"]);
  assert.deepEqual(made[1].calls.filter((call) => call === "finish" || call === "stop"), ["finish"]);
  assert.deepEqual(made[2].calls.slice(-1), ["stop"]);
});

test("after an answer that failed, the next question or an empty line doesn't say he stopped talking, whichever way he stops", async () => {
  for (const speechStop of ["now", "sentence"] as const) {
    const { speak } = speaker([], () => ({ report: { stopped: true, firstSoundMs: null } }));
    const session = fakeSession({ Broken: () => Promise.reject(new Error("the engine fell over")), Hello: hello });
    const { run, output } = chat(session, linesOf("Broken", "", "Hello"), { speak, speechStop });
    await run();
    assert.equal(output().includes("won't be spoken"), false, speechStop);
  }
});

test("set to finish the sentence, exit, new and the chat closing stop a sentence that's still finishing, and wait for it before going on", async () => {
  const fresh: NewChat = { session: fakeSession({}), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [] };
  for (const last of ["exit", "new", null]) {
    const events: string[] = [];
    const { speak, made } = speaker(events, () => ({ talking: true, playing: true }));
    const newChat = async () => {
      events.push("new chat set up");
      return fresh;
    };
    const lines = last === null ? linesOf("Hello", "") : linesOf("Hello", "", last);
    const { run, output } = chat(fakeSession({ Hello: hello }, events), lines, { speak, speechStop: "sentence", newChat }, events);
    await run();
    assert.deepEqual(made[0].calls.slice(-2), ["finish", "stop"], String(last));
    assert.equal(output().endsWith("Cost of this chat: about $0.0012\n"), true);
    if (last === "new") assert.equal(events.indexOf("speech 1 stop") < events.indexOf("new chat set up"), true);
  }
});

test("set to finish the sentence, after new or a failed hush the next answer isn't told to wait for a sentence that was stopped", async () => {
  const fresh: NewChat = { session: fakeSession({ Again: hello }), record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, recordSpeech: undefined, notes: [] };
  const { speak, made } = speaker([], () => ({ talking: true, playing: true }));
  await chat(fakeSession({ Hello: hello }), linesOf("Hello", "", "new", "Again"), { speak, speechStop: "sentence", newChat: async () => fresh }).run();
  assert.deepEqual(made[0].calls.filter((call) => call === "finish" || call === "stop"), ["finish", "stop"]);
  assert.equal(made[1].after, undefined);
});

test("set to finish the sentence, a failed answer stops its own speech but leaves the last answer's sentence to finish", async () => {
  const events: string[] = [];
  const typed = typing();
  const { speak, made } = speaker(events, () => ({ talking: true, playing: true }));
  const session = fakeSession({ Hello: hello, Broken: () => Promise.reject(new Error("the engine fell over")) }, events);
  const { run } = chat(session, typed.lines, { speak, speechStop: "sentence" }, events);
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  typed.type("Broken");
  await turn();
  await turn();
  assert.deepEqual(made[1].calls.slice(-1), ["stop"]);
  assert.deepEqual(made[0].calls.slice(-1), ["finish"]);
  made[0].finish();
  typed.close();
  await running;
});

test("set to finish the sentence, the next answer is logged and the prompt comes back without waiting, and each speech line still lands against its own answer", async () => {
  const written: { kind?: string; question: number; spoken?: number }[] = [];
  const log = startAnswerLog({ engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "kokoro", speechStart: "sentence", speechStop: "sentence" }, { append: async (text) => void written.push(JSON.parse(text)), now: () => new Date(0), chat: "c", warn: () => {}, costSoFar: () => null });
  const typed = typing();
  const { speak, made } = speaker([], (number) => ({ talking: true, playing: true, report: { spoken: number } }));
  const { run, output } = chat(fakeSession({ Hello: hello, Again: hello }), typed.lines, { speak, speechStop: "sentence", record: log.record, recordSpeech: log.speech });
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  typed.type("Again");
  await turn();
  await turn();
  assert.equal(output().endsWith("You: "), true);
  assert.deepEqual(written.map((line) => [line.kind ?? "answer", line.question]), [["answer", 1], ["answer", 2]]);
  made[0].finish();
  await turn();
  await turn();
  typed.close();
  await running;
  assert.deepEqual(written.map((line) => [line.kind ?? "answer", line.question, line.spoken]), [["answer", 1, undefined], ["answer", 2, undefined], ["speech", 1, 1], ["speech", 2, 2]]);
});

test("set to finish the sentence, a question that fails while the last sentence is finishing is logged and the prompt comes back without waiting", async () => {
  const written: { kind?: string; question: number; spoken?: number }[] = [];
  const log = startAnswerLog({ engine: "sdk", thinking: null, model: "m", chats: "fresh", lengthHints: "note", hubTools: "off", hubActions: "off", sessionNotes: "off", voice: "kokoro", speechStart: "sentence", speechStop: "sentence" }, { append: async (text) => void written.push(JSON.parse(text)), now: () => new Date(0), chat: "c", warn: () => {}, costSoFar: () => null });
  const typed = typing();
  const { speak, made } = speaker([], (number) => ({ talking: true, playing: true, report: { spoken: number } }));
  const session = fakeSession({ Hello: hello, Broken: () => Promise.reject(new Error("the engine fell over")) });
  const { run, output } = chat(session, typed.lines, { speak, speechStop: "sentence", record: log.record, recordSpeech: log.speech });
  const running = run();
  typed.type("Hello");
  await turn();
  await turn();
  typed.type("Broken");
  await turn();
  await turn();
  assert.equal(output().endsWith("You: "), true);
  assert.deepEqual(written.map((line) => [line.kind ?? "answer", line.question]), [["answer", 1], ["answer", 2]]);
  made[0].finish();
  typed.close();
  await running;
  assert.deepEqual(written.map((line) => [line.kind ?? "answer", line.question, line.spoken]), [["answer", 1, undefined], ["answer", 2, undefined], ["speech", 1, 1]]);
});

test("set to finish the sentence, a sentence still finishing from two interruptions back is still waited for, and still stopped at the end, but one that has ended isn't", async () => {
  const { speak, made } = speaker([], () => ({ talking: true, playing: true, report: { stopped: true } }));
  const typed = typing();
  const { run } = chat(fakeSession({ One: hello, Two: hello, Three: hello }), typed.lines, { speak, speechStop: "sentence" });
  const running = run();
  for (const line of ["One", "Two", "", "Three"]) {
    typed.type(line);
    await turn();
    await turn();
  }
  assert.equal(made.length, 3);
  const waiting = made[2].after;
  made[1].finish();
  assert.equal(await Promise.race([waiting?.then(() => "over"), turn().then(() => "waiting")]), "waiting");
  typed.type("exit");
  await running;
  assert.deepEqual(made[0].calls.filter((call) => call === "finish" || call === "stop"), ["finish", "stop"]);
  assert.deepEqual(made[1].calls.filter((call) => call === "finish" || call === "stop"), ["finish"]);
  assert.equal(await Promise.race([waiting?.then(() => "over"), turn().then(() => "waiting")]), "over");
});

test("set to finish the sentence, when the chat ends a finishing sentence is stopped and its speech logged before the cost is shown, even when it's logged slower than the last answer's", async () => {
  const events: string[] = [];
  const { speak } = speaker(events, () => ({ talking: true, playing: true }));
  let logs = 0;
  const recordSpeech = async (report: Promise<SpeechReport>) => {
    const turns = ++logs === 1 ? 5 : 1;
    await report;
    for (let count = 0; count < turns; count++) await turn();
    events.push(`speech logged with ${output().includes("Cost of this chat") ? "the cost shown" : "no cost shown yet"}`);
  };
  const { run, output } = chat(fakeSession({ Hello: hello, Again: hello }), linesOf("Hello", "Again", "exit"), { speak, speechStop: "sentence", recordSpeech }, events);
  await run();
  assert.deepEqual(events.filter((event) => event.startsWith("speech logged")), ["speech logged with no cost shown yet", "speech logged with no cost shown yet"]);
});
