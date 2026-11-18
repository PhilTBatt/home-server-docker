import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { pricesPerMTok } from "./prices.js";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { Outcome, Rating, RateResult } from "./answer-log.js";
import { apiChatSystem, chatModel, chatsLine, chatSystem, commandNote, costLine, lengthLineFor, listenNow, noNewChatNote, refusedNote, retryNote, settingsLine, startLengthNotes, engineLine, exitWords, greeting, notLoggingNote, printable, promptWhileOpen, questionTimeoutMs, restartNote, runChat, stoppedMessage, timingLine, toolNote, looksLikeCommand, lengthHintsFor, startSizeLines, withSizeLine, capNote, capReachedNote, type ChatDeps, type NewChat, type PromptLine } from "./chat.js";
import type { Answer, AnswerStats } from "./timing.js";

type Script = (listener: AnswerListener) => Promise<Answer>;

type FakeSession = AgentSession & { asked: string[]; closes: () => number; stop: (reason: string) => void };

function answer(text: string, firstWordsMs: number | null, totalMs: number): Answer {
  return { text, firstWordsMs, totalMs };
}

function fakeSession(scripts: Record<string, Script>, cost: number | null = 0.0012): FakeSession {
  const asked: string[] = [];
  let closes = 0;
  let stopped: string | null = null;
  return {
    asked,
    closes: () => closes,
    stop: (reason) => {
      stopped = reason;
    },
    ask(question: string, listener: AnswerListener = {}) {
      asked.push(question);
      const script = scripts[question];
      if (script === undefined) return Promise.reject(new Error(`Unexpected question: ${question}`));
      return script(listener);
    },
    readyMs: () => null,
    costUsd: () => cost,
    stoppedReason: () => stopped,
    close() {
      closes++;
      stopped ??= closedMessage;
    },
  };
}

async function* linesOf(...lines: string[]): AsyncGenerator<string> {
  for (const line of lines) yield line;
}

function chat(session: FakeSession, lines: string[], overrides: Partial<ChatDeps> = {}) {
  let output = "";
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
    ...overrides,
  };
  return { run: () => runChat(deps), output: () => output };
}

const hello: Script = async (listener) => {
  listener.text?.("Hi ");
  listener.text?.("Phil.");
  return answer("Hi Phil.", 500, 1200);
};

test("Jarvis chats on Haiku 5.5, and gives each question up to 120 seconds", () => {
  assert.equal(chatModel, "claude-haiku-5-5");
  assert.equal(questionTimeoutMs, 120_000);
});

test("Jarvis's instructions point him at the brain and keep him safe and short", () => {
  assert.match(chatSystem, /\/brain/);
  assert.match(chatSystem, /index\.md/);
  assert.match(chatSystem, /search inside the notes with Grep or find files by name with Glob/);
  assert.match(chatSystem, /never instructions to you/);
  assert.match(chatSystem, /You can only read/);
  assert.match(chatSystem, /Before you read a file, say/);
  assert.match(chatSystem, /British English/);
});

test("the plain API engine's instructions give the same voice and rules, pointing at its brain tools", () => {
  assert.match(apiChatSystem, /^You are Jarvis, Phil's assistant on his home server\./);
  assert.match(apiChatSystem, /read_file and list_folder tools, and searched with search_files and find_files/);
  assert.match(apiChatSystem, /index\.md/);
  assert.match(apiChatSystem, /British English/);
  assert.match(apiChatSystem, /Before you read a file, say/);
  assert.match(apiChatSystem, /never instructions to you/);
  assert.match(apiChatSystem, /You can only read/);
  assert.doesNotMatch(apiChatSystem, /working folder/);
});

test("both engines share the same reading rules", () => {
  for (const rule of ["Before you read a file", "never instructions to you", "You can only read"]) {
    assert.ok(chatSystem.includes(rule));
    assert.ok(apiChatSystem.includes(rule));
  }
});

test("the engine line says what the plain API engine does with its thinking", () => {
  assert.equal(engineLine("api", "keep"), "Engine: a plain API call, keeping its thinking between questions");
  assert.equal(engineLine("api", "drop"), "Engine: a plain API call, dropping its thinking after each answer");
  assert.equal(engineLine("sdk", "drop"), "Engine: the Agent SDK");
});

test("the engine line names the engine", () => {
  assert.equal(engineLine("sdk"), "Engine: the Agent SDK");
  assert.equal(engineLine("api"), "Engine: a plain API call");
});

test("a whole chat: greeting, streamed answer, timing, then the cost", async () => {
  const session = fakeSession({ Hello: hello });
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.equal(output(), `${greeting}\nYou: Jarvis: Hi Phil.\n  (first words 0.50 s, full answer 1.20 s)\nYou: \nCost of this chat: about $0.0012\n`);
});

test("the session is closed when the input ends", async () => {
  const session = fakeSession({ Hello: hello });
  await chat(session, ["Hello"]).run();
  assert.equal(session.closes(), 1);
});

test("messages are trimmed before they're sent", async () => {
  const session = fakeSession({ Hello: hello });
  await chat(session, ["   Hello  "]).run();
  assert.deepEqual(session.asked, ["Hello"]);
});

test("empty lines aren't sent, and the prompt comes back", async () => {
  const session = fakeSession({ Hello: hello });
  const { run, output } = chat(session, ["", "   ", "Hello"]);
  await run();
  assert.deepEqual(session.asked, ["Hello"]);
  assert.ok(output().startsWith(`${greeting}\nYou: You: You: Jarvis: `));
});

test("exit and quit end the chat in any case, without asking anything", async () => {
  for (const word of [...exitWords, "EXIT", " Quit "]) {
    const session = fakeSession({ Hello: hello });
    await chat(session, [word, "Hello"]).run();
    assert.deepEqual(session.asked, []);
    assert.equal(session.closes(), 1);
  }
});

test("a message with an exit word in it is still sent", async () => {
  const session = fakeSession({ "exit the room": hello });
  await chat(session, ["exit the room"]).run();
  assert.deepEqual(session.asked, ["exit the room"]);
});

test("text is written as it streams, before the answer is finished", async () => {
  let release: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });
  let seenMidway = "";
  const session = fakeSession({
    Hello: async (listener) => {
      listener.text?.("Hi ");
      seenMidway = current();
      await finished;
      listener.text?.("Phil.");
      return answer("Hi Phil.", 500, 1200);
    },
  });
  const { run, output } = chat(session, ["Hello"]);
  const current = output;
  const running = run();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await running;
  assert.ok(seenMidway.endsWith("Jarvis: Hi "));
});

test("a file read shows a note on its own line, with the brain's folder left off", async () => {
  const session = fakeSession({
    "What's in my brain?": async (listener) => {
      listener.text?.("Let me check your index.");
      listener.tool?.("Read", { file_path: "/brain/index.md" });
      listener.text?.("It covers your projects.");
      return answer("It covers your projects.", 300, 2000);
    },
  });
  const { run, output } = chat(session, ["What's in my brain?"]);
  await run();
  assert.ok(output().includes("Jarvis: Let me check your index.\n  (reading index.md)\nIt covers your projects.\n  (first words 0.30 s, full answer 2.00 s)\n"));
});

test("the plain API engine's tools get notes too", () => {
  assert.equal(toolNote("read_file", { path: "areas/jarvis.md" }), "reading areas/jarvis.md");
  assert.equal(toolNote("read_file", { path: "/brain/index.md" }), "reading index.md");
  assert.equal(toolNote("read_file", {}), "using read_file");
  assert.equal(toolNote("list_folder", { path: "areas" }), "looking in areas");
  assert.equal(toolNote("list_folder", { path: "." }), "looking in the top folder");
  assert.equal(toolNote("list_folder", { path: " " }), "looking in the top folder");
  assert.equal(toolNote("list_folder", {}), "looking in the top folder");
  assert.equal(toolNote("Read", { path: "index.md" }), "using Read");
  assert.equal(toolNote("search_files", { text: "train" }), 'searching for "train"');
  assert.equal(toolNote("Grep", { pattern: "train", path: "/brain" }), 'searching for "train"');
  assert.equal(toolNote("Grep", {}), "using Grep");
  assert.equal(toolNote("Glob", { pattern: "**/*.md" }), 'looking for files matching "**/*.md"');
  assert.equal(toolNote("Glob", { path: "/brain" }), "using Glob");
  assert.equal(toolNote("search_files", {}), "using search_files");
  assert.equal(toolNote("find_files", { name: "jarvis" }), 'looking for files named "jarvis"');
  assert.equal(toolNote("find_files", { text: "jarvis" }), "using find_files");
});

test("tool notes in a row sit on their own lines with no blank line between", async () => {
  const session = fakeSession({
    "Read both": async (listener) => {
      listener.tool?.("read_file", { path: "a.md" });
      listener.tool?.("read_file", { path: "b.md" });
      listener.text?.("Done.");
      return answer("Done.", 900, 1000);
    },
  });
  const { run, output } = chat(session, ["Read both"]);
  await run();
  assert.ok(output().includes("Jarvis: \n  (reading a.md)\n  (reading b.md)\nDone.\n  (first words 0.90 s, full answer 1.00 s)\n"));
});

test("a tool note just before the timing line doesn't leave a blank line", async () => {
  const session = fakeSession({
    "Read it": async (listener) => {
      listener.text?.("Checking.");
      listener.tool?.("read_file", { path: "a.md" });
      return answer("Checking.", 100, 1000);
    },
  });
  const { run, output } = chat(session, ["Read it"]);
  await run();
  assert.ok(output().includes("Jarvis: Checking.\n  (reading a.md)\n  (first words 0.10 s, full answer 1.00 s)\n"));
});

test("text that ends its own line isn't followed by a blank line", async () => {
  const session = fakeSession({
    Hello: async (listener) => {
      listener.text?.("Two lines\n");
      listener.tool?.("read_file", { path: "a.md" });
      listener.text?.("then more.");
      return answer("Two lines\nthen more.", 100, 1000);
    },
  });
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.ok(output().includes("Jarvis: Two lines\n  (reading a.md)\nthen more.\n  (first words"));
});

test("tool notes say what's being read, or name the tool", () => {
  assert.equal(toolNote("Read", { file_path: "/brain/areas/jarvis.md" }), "reading areas/jarvis.md");
  assert.equal(toolNote("Read", { file_path: "/app/package.json" }), "reading /app/package.json");
  assert.equal(toolNote("Read", { file_path: "/brainstorm/notes.md" }), "reading /brainstorm/notes.md");
  assert.equal(toolNote("Read", {}), "using Read");
  assert.equal(toolNote("Read", { file_path: 42 }), "using Read");
  assert.equal(toolNote("Read", null), "using Read");
  assert.equal(toolNote("WebFetch", { url: "https://example.com" }), "using WebFetch");
});

test("when nothing streams, the finished answer is written instead", async () => {
  const session = fakeSession({ Hello: async () => answer("Hello there.", null, 900) });
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.ok(output().includes("Jarvis: Hello there.\n  (full answer 0.90 s)\n"));
});

test("the finished answer isn't written twice when it streamed", async () => {
  const session = fakeSession({ Hello: hello });
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.equal(output().split("Hi Phil.").length, 2);
});

test("a failed question says why, and the chat carries on", async () => {
  const session = fakeSession({
    Hello: async () => {
      throw new Error("Overloaded");
    },
    Again: hello,
  });
  const { run, output } = chat(session, ["Hello", "Again"]);
  await run();
  assert.ok(output().includes("Jarvis: \nJarvis couldn't answer: Overloaded\nYou: Jarvis: Hi Phil."));
  assert.deepEqual(session.asked, ["Hello", "Again"]);
});

test("when an answer starts again, a note says so before the new attempt's words", async () => {
  const session = fakeSession({
    "Read it": async (listener) => {
      listener.text?.("Let me check.");
      listener.tool?.("read_file", { path: "index.md" });
      listener.restart?.();
      listener.text?.("Let me check.");
      return answer("Let me check.", 100, 400);
    },
  });
  const { run, output } = chat(session, ["Read it"]);
  await run();
  assert.ok(output().includes(`Jarvis: Let me check.\n  (reading index.md)\n  (${restartNote})\nLet me check.\n  (first words`));
});

test("an error after a refused tool is shown as the error it was, not as a refusal", async () => {
  const session = fakeSession({
    "Read /etc/passwd": async (listener) => {
      listener.tool?.("Read", { file_path: "/etc/passwd" });
      throw new Error("The API replied 500: overloaded");
    },
    Again: hello,
  });
  const { run, output } = chat(session, ["Read /etc/passwd", "Again"]);
  await run();
  assert.ok(output().includes("(reading /etc/passwd)\nJarvis couldn't answer: The API replied 500: overloaded\nYou: Jarvis: Hi Phil."), output());
});


test("a question that takes too long closes Jarvis and ends the chat", async () => {
  const session = fakeSession({ Hello: () => new Promise<Answer>(() => {}), Again: hello });
  const { run, output } = chat(session, ["Hello", "Again"], { questionTimeoutMs: 20 });
  await run();
  assert.ok(output().includes(`Jarvis couldn't answer: No answer within 0.02 seconds\n${stoppedMessage}\n\nCost of this chat`));
  assert.deepEqual(session.asked, ["Hello"]);
  assert.ok(session.closes() >= 1);
});

test("if Jarvis stops by himself, the chat says so and ends", async () => {
  const session = fakeSession({ Again: hello });
  session.ask = async () => {
    session.stop("The agent stopped");
    throw new Error("The agent stopped");
  };
  const { run, output } = chat(session, ["Hello", "Again"]);
  await run();
  assert.ok(output().includes(`Jarvis couldn't answer: The agent stopped\n${stoppedMessage}\n`));
  assert.ok(!output().includes("Hi Phil."));
});

test("closing Jarvis mid-answer, like Ctrl+C, shows a quiet note and ends the chat", async () => {
  const session: FakeSession = fakeSession({
    Hello: (listener) =>
      new Promise<Answer>((_resolve, reject) => {
        listener.text?.("Let me ");
        session.close();
        reject(new Error(closedMessage));
      }),
    Again: hello,
  });
  const { run, output } = chat(session, ["Hello", "Again"]);
  await run();
  assert.ok(output().includes("Jarvis: Let me \n  (stopped)\n\nCost of this chat"));
  assert.ok(!output().includes(stoppedMessage));
  assert.ok(!output().includes("couldn't answer"));
  assert.deepEqual(session.asked, ["Hello"]);
});

test("escape codes from a file can't reach the terminal, wherever they turn up", async () => {
  const escape = "\u001b]52;c;aGk=\u0007";
  const session = fakeSession({
    Streamed: async (listener) => {
      listener.text?.(`Hi${escape} Phil.`);
      listener.tool?.("Read", { file_path: `/brain/odd${escape}.md` });
      return answer("Hi Phil.", 100, 200);
    },
    Quiet: async () => answer(`Plain${escape} answer.`, null, 200),
    Broken: async () => {
      throw new Error(`Bad${escape} thing`);
    },
  });
  const { run, output } = chat(session, ["Streamed", "Quiet", "Broken"]);
  await run();
  assert.ok(!output().includes("\u001b"));
  assert.ok(!output().includes("\u0007"));
  assert.ok(output().includes("Hi]52;c;aGk= Phil."));
  assert.ok(output().includes("(reading odd]52;c;aGk=.md)"));
  assert.ok(output().includes("Plain]52;c;aGk= answer."));
  assert.ok(output().includes("Jarvis couldn't answer: Bad]52;c;aGk= thing"));
});

test("printable keeps line breaks, tabs and ordinary characters", () => {
  assert.equal(printable("Line one\n\tLine two: £5, café, ✓"), "Line one\n\tLine two: £5, café, ✓");
});

test("printable removes control characters, carriage returns and the C1 range", () => {
  assert.equal(printable("a\u0000b\u0008c\u000bd\u000de\u001bf\u007fg\u0085h\u009fi"), "abcdefghi");
});

function fakeLines() {
  const prompts: (boolean | undefined)[] = [];
  let onClose: () => void = () => {};
  const lines: PromptLine = {
    prompt: (preserveCursor) => {
      prompts.push(preserveCursor);
    },
    on: (_event, listener) => {
      onClose = listener;
    },
  };
  return { lines, prompts, close: () => onClose() };
}

test("the prompt asks readline to keep the cursor where it is", () => {
  const { lines, prompts } = fakeLines();
  promptWhileOpen(lines)();
  assert.deepEqual(prompts, [true]);
});

test("text typed during an answer stays in order after the prompt comes back", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const lines = createInterface({ input, output, prompt: "You: ", terminal: true });
  const sent = new Promise<string>((resolve) => lines.once("line", resolve));
  const prompt = promptWhileOpen(lines);
  input.write("and");
  await new Promise((resolve) => setImmediate(resolve));
  prompt();
  input.write(" then\r");
  assert.equal(await sent, "and then");
  lines.close();
});

test("the prompt does nothing once the input has closed", () => {
  const { lines, prompts, close } = fakeLines();
  const prompt = promptWhileOpen(lines);
  prompt();
  close();
  prompt();
  assert.deepEqual(prompts, [true]);
});

test("prompting a real readline after it closes doesn't throw or start reading again", () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = createInterface({ input, output, prompt: "You: " });
  const prompt = promptWhileOpen(lines);
  lines.close();
  assert.doesNotThrow(prompt);
  assert.equal(input.isPaused(), true);
});

test("questions are asked one at a time, in order", async () => {
  const events: string[] = [];
  const slow: Script = async (listener) => {
    events.push("first asked");
    await new Promise((resolve) => setTimeout(resolve, 10));
    events.push("first answered");
    return hello(listener);
  };
  const session = fakeSession({
    First: slow,
    Second: async (listener) => {
      events.push("second asked");
      return hello(listener);
    },
  });
  await chat(session, ["First", "Second"]).run();
  assert.deepEqual(events, ["first asked", "first answered", "second asked"]);
});

test("the cost line says when the cost is unknown", async () => {
  const session = fakeSession({ Hello: hello }, null);
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.ok(output().endsWith("\nCost of this chat: unknown\n"));
});

test("the timing line copes with no first words", () => {
  assert.equal(timingLine(answer("", null, 1500)), "(full answer 1.50 s)");
  assert.equal(timingLine(answer("Hi", 250, 1500)), "(first words 0.25 s, full answer 1.50 s)");
});

test("the cost line rounds to four decimal places", () => {
  assert.equal(costLine(0.00123456), "Cost of this chat: about $0.0012");
  assert.equal(costLine(null), "Cost of this chat: unknown");
});

function recorder(output?: () => string) {
  const outcomes: Outcome[] = [];
  const seen: string[] = [];
  return {
    outcomes,
    seen,
    record: async (outcome: Outcome) => {
      outcomes.push(outcome);
      if (output !== undefined) seen.push(output());
    },
  };
}

test("each answer is handed to the log after its timing line is shown", async () => {
  const session = fakeSession({ Hello: hello });
  let read = () => "";
  const log = recorder(() => read());
  const { run, output } = chat(session, ["Hello"], { record: log.record });
  read = output;
  await run();
  assert.deepEqual(log.outcomes, [{ answer: answer("Hi Phil.", 500, 1200) }]);
  assert.ok(log.seen[0].endsWith("Jarvis: Hi Phil.\n  (first words 0.50 s, full answer 1.20 s)\n"));
});

function withStats(base: Answer, refusedTools: string[]): Answer {
  const stats: AnswerStats = { rounds: 2, toolUses: 1, inputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 10, costUsd: null, earlierThinkingBlocks: null, recovered: false, largestRequestTokens: 60, lastRequestTokens: 60, refusedTools, spokeFirst: null, retried: false };
  return { ...base, stats };
}

test("a refused tool shows a note after the answer, once per tool, on either engine, and the answer is still logged", async () => {
  const session = fakeSession({
    Refused: async (listener) => {
      listener.tool?.("Read", { file_path: "/app/package.json" });
      listener.text?.("I can't read that.");
      return withStats(answer("I can't read that.", 400, 800), ["Read", "Read", "Grep"]);
    },
  });
  const log = recorder();
  const { run, output } = chat(session, ["Refused"], { record: log.record });
  await run();
  assert.ok(output().includes("I can't read that.\n  (refused: Read, Grep)\n  (first words 0.40 s, full answer 0.80 s)\n"), output());
  assert.equal(log.outcomes.length, 1);
  assert.ok("answer" in log.outcomes[0]);
  assert.equal(refusedNote(["read_file"]), "refused: read_file");
});

test("a retry after a network error shows a note on its own line, then the answer carries on", async () => {
  assert.equal(retryNote, "couldn't reach the API, so trying once more");
  const session = fakeSession({
    Hello: async (listener) => {
      listener.text?.("Let me");
      listener.retry?.();
      listener.text?.("Hi Phil.");
      return answer("Hi Phil.", 500, 1200);
    },
  });
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.ok(output().includes("Jarvis: Let me\n  (couldn't reach the API, so trying once more)\nHi Phil.\n  (first words 0.50 s, full answer 1.20 s)\n"), output());
});

test("an answer with nothing refused shows no refusal note", async () => {
  const session = fakeSession({ Hello: async (listener) => withStats(await hello(listener), []) });
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.doesNotMatch(output(), /refused/);
});

test("failures and time-outs are handed to the log with what went wrong", async () => {
  const session = fakeSession({
    Hello: async () => {
      throw new Error("Overloaded");
    },
    Refused: async () => {
      throw new Error("The API replied 529: overloaded");
    },
    Slow: () => new Promise<Answer>(() => {}),
  });
  const log = recorder();
  const { run } = chat(session, ["Hello", "Refused", "Slow"], { record: log.record, questionTimeoutMs: 20 });
  await run();
  assert.deepEqual(log.outcomes, [{ error: "Overloaded" }, { error: "The API replied 529: overloaded" }, { error: "No answer within 0.02 seconds" }]);
});

test("a question stopped with Ctrl+C isn't logged, since it says nothing about the engine", async () => {
  const session: FakeSession = fakeSession({
    Hello: (listener) =>
      new Promise<Answer>((_resolve, reject) => {
        listener.text?.("Let me ");
        session.close();
        reject(new Error(closedMessage));
      }),
  });
  const log = recorder();
  const { run } = chat(session, ["Hello"], { record: log.record });
  await run();
  assert.deepEqual(log.outcomes, []);
});

test("the log is waited for before the next prompt, so lines can't overlap", async () => {
  const session = fakeSession({ Hello: hello, Again: hello });
  const events: string[] = [];
  const { run } = chat(session, ["Hello", "Again"], {
    record: async () => {
      events.push("log started");
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push("log finished");
    },
    prompt: () => events.push("prompt"),
  });
  await run();
  assert.deepEqual(events, ["prompt", "log started", "log finished", "prompt", "log started", "log finished", "prompt"]);
});

test("a failure is logged before the next prompt too", async () => {
  const session = fakeSession({
    Hello: async () => {
      throw new Error("Overloaded");
    },
    Again: hello,
  });
  const events: string[] = [];
  const { run } = chat(session, ["Hello", "Again"], {
    record: async () => {
      events.push("log started");
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push("log finished");
    },
    prompt: () => events.push("prompt"),
  });
  await run();
  assert.deepEqual(events, ["prompt", "log started", "log finished", "prompt", "log started", "log finished", "prompt"]);
});


test("+ and - on their own rate the last answer, and aren't sent to Jarvis", async () => {
  const session = fakeSession({ Hello: hello });
  const rated: Rating[] = [];
  const { run, output } = chat(session, ["Hello", "+", " - "], {
    rate: async (rating) => {
      rated.push(rating);
      return "saved";
    },
  });
  await run();
  assert.deepEqual(rated, ["good", "bad"]);
  assert.deepEqual(session.asked, ["Hello"]);
  assert.ok(output().includes("You:   (rated good)\nYou:   (rated bad)\nYou: "));
});

test("a rating that can't be saved says why", async () => {
  const results: RateResult[] = ["nothing to rate", "last failed", "log broken"];
  const session = fakeSession({});
  const { run, output } = chat(session, ["+", "-", "+"], { rate: async () => results.shift() ?? "saved" });
  await run();
  assert.ok(output().includes("(there's no answer to rate yet)"));
  assert.ok(output().includes("(the last question failed, so there's nothing to rate)"));
  assert.ok(output().includes("(not saved: the answer log can't be written)"));
});

test("with logging off, a rating says it isn't kept, and still isn't sent to Jarvis", async () => {
  const session = fakeSession({});
  const { run, output } = chat(session, ["+"]);
  await run();
  assert.ok(output().includes(`(${notLoggingNote})`));
  assert.deepEqual(session.asked, []);
});

test("only a lone + or - is a rating; anything longer is a question", async () => {
  const session = fakeSession({ "++": hello, "+ good one": hello, "-1": hello, constructor: hello, __proto__: hello, toString: hello });
  const rated: Rating[] = [];
  const { run } = chat(session, ["++", "+ good one", "-1", "constructor", "__proto__", "toString"], {
    rate: async (rating) => {
      rated.push(rating);
      return "saved";
    },
  });
  await run();
  assert.deepEqual(rated, []);
  assert.deepEqual(session.asked, ["++", "+ good one", "-1", "constructor", "__proto__", "toString"]);
});

test("Jarvis's settings are printed in one line, as they're written in jarvis/.env", () => {
  assert.equal(settingsLine({ engine: "api", thinkingHistory: "drop", chats: "resume", lengthHints: "jarvis", lengthWarn: 60000, lengthCap: 150000, hubToken: "a-token", log: true }), "Settings: JARVIS_ENGINE=api, JARVIS_THINKING_HISTORY=drop, JARVIS_CHATS=resume, JARVIS_LENGTH_HINTS=jarvis, JARVIS_LENGTH_WARN=60000, JARVIS_LENGTH_CAP=150000, JARVIS_HUB_TOOLS=on, JARVIS_LOG=on");
  assert.equal(settingsLine({ engine: "sdk", thinkingHistory: "keep", chats: "fresh", lengthHints: "note", lengthWarn: 80000, lengthCap: null, hubToken: null, log: false }), "Settings: JARVIS_ENGINE=sdk, JARVIS_THINKING_HISTORY=keep, JARVIS_CHATS=fresh, JARVIS_LENGTH_HINTS=note, JARVIS_LENGTH_WARN=80000, JARVIS_LENGTH_CAP=off, JARVIS_HUB_TOOLS=off, JARVIS_LOG=off");
});

test("the chats line says whether this chat is saved, and what it picks up", () => {
  assert.equal(chatsLine("fresh", 0), "Chats: starting fresh, and nothing is saved");
  assert.equal(chatsLine("fresh", 3), "Chats: starting fresh, and nothing is saved");
  assert.equal(chatsLine("resume", 0), "Chats: starting a new chat, which will be saved");
  assert.equal(chatsLine("resume", null), "Chats: picking up the last saved chat");
  assert.equal(chatsLine("resume", 1), "Chats: picking up the saved chat (1 earlier question)");
  assert.equal(chatsLine("resume", 7), "Chats: picking up the saved chat (7 earlier questions)");
});

test("lines typed before the chat starts reading are kept, not lost", { timeout: 5000 }, async () => {
  const input = new PassThrough();
  const lines = createInterface({ input });
  const typed = listenNow(lines);
  input.end("first\nsecond\n");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const heard: string[] = [];
  for await (const line of typed) heard.push(line);
  assert.deepEqual(heard, ["first", "second"]);
});

test("a note from the engine, like a chat that couldn't be saved, goes on its own line after the answer's words", async () => {
  const session = fakeSession({
    Hello: async (listener) => {
      listener.text?.("Hi Phil.");
      listener.note?.("Couldn't save the chat, so the rest of it won't be saved: disk full\u001b[2J");
      return answer("Hi Phil.", 100, 400);
    },
  });
  const { run, output } = chat(session, ["Hello"]);
  await run();
  assert.ok(output().includes("Jarvis: Hi Phil.\n  (Couldn't save the chat, so the rest of it won't be saved: disk full[2J)\n  (first words"), output());
});

test("in a chat that carries on a saved one, a failed question says how to start over", async () => {
  const session = fakeSession({
    Hello: async () => {
      throw new Error("The API replied 400: prompt is too long");
    },
  });
  const { run, output } = chat(session, ["Hello"], { failureHint: "delete the saved chat" });
  await run();
  assert.ok(output().includes("Jarvis couldn't answer: The API replied 400: prompt is too long\n  (delete the saved chat)\nYou: "), output());
  const plain = chat(fakeSession({ Hello: async () => Promise.reject(new Error("Overloaded")) }), ["Hello"]);
  await plain.run();
  assert.ok(plain.output().includes("Jarvis couldn't answer: Overloaded\nYou: "), plain.output());
});

const haikuLine = { warnAt: 80_000, cap: null, longPromptOver: 100_000, times: 5, startOver: "type exit and start Jarvis again" };

test("the length line takes the warning level from the setting, and the long-prompt line and how many times dearer from the model's prices", () => {
  assert.deepEqual(lengthLineFor(pricesPerMTok[chatModel], 80_000, null, "type exit"), { warnAt: 80_000, cap: null, longPromptOver: 100_000, times: 5, startOver: "type exit" });
  assert.deepEqual(lengthLineFor({ ...pricesPerMTok[chatModel], longPromptOver: 200_000, longInput: 0.2 }, 150_000, 300_000, "type exit"), { warnAt: 150_000, cap: 300_000, longPromptOver: 200_000, times: 2, startOver: "type exit" });
  assert.deepEqual(lengthLineFor(undefined, 60_000, null, "type exit"), { warnAt: 60_000, cap: null, longPromptOver: null, times: null, startOver: "type exit" });
});

test("a chat gets one heads-up when it reaches 80% of the long-prompt line, then a note on every answer past the line", () => {
  const note = startLengthNotes(haikuLine);
  assert.equal(note(null), null);
  assert.equal(note(79_999), null);
  assert.equal(note(81_600), "This chat has reached 80,000 tokens (about 82,000 now). Past 100,000, each question costs 5 times as much, so start a new one when you're done with this topic: type exit and start Jarvis again");
  assert.equal(note(95_000), null);
  assert.equal(note(100_000), null);
  assert.equal(note(100_001), "This chat is about 101,000 tokens, so each question now costs 5 times as much. A new chat would be cheaper: type exit and start Jarvis again");
  assert.equal(note(104_400), "This chat is about 105,000 tokens, so each question now costs 5 times as much. A new chat would be cheaper: type exit and start Jarvis again");
  assert.equal(note(null), null);
  assert.match(startLengthNotes(haikuLine)(80_000) ?? "", /^This chat has reached 80,000 tokens \(about 80,000 now\)\./);
});

test("a chat that gets short again, as after /clear, gets a heads-up again when it next grows long", () => {
  const note = startLengthNotes(haikuLine);
  assert.match(note(85_000) ?? "", /^This chat has reached 80,000 tokens \(about 85,000 now\)/);
  assert.equal(note(null), null);
  assert.equal(note(90_000), null);
  assert.equal(note(5_000), null);
  assert.match(note(88_000) ?? "", /^This chat has reached 80,000 tokens \(about 88,000 now\)/);
});

test("a chat that jumps straight past the line gets the past-the-line note, and no heads-up after it", () => {
  const note = startLengthNotes(haikuLine);
  assert.match(note(130_000) ?? "", /^This chat is about 130,000 tokens, so each question now costs 5 times as much/);
  assert.equal(note(90_000), null);
});

test("the length note uses the answer's last request, which is what the chat now sends, and comes after the timing line", async () => {
  const session = fakeSession({ Hello: async () => ({ ...answer("Hi Phil.", 100, 400), stats: { ...answer("Hi Phil.", 100, 400).stats!, largestRequestTokens: 101_000, lastRequestTokens: 85_000 } }) });
  const { run, output } = chat(session, ["Hello"], { lengthNote: startLengthNotes(haikuLine) });
  await run();
  assert.match(output(), /\(first words [^\n]*\n  \(This chat has reached 80,000 tokens \(about 85,000 now\)\. Past 100,000, each question costs 5 times as much, so start a new one when you're done with this topic: type exit and start Jarvis again\)\nYou: /);
});

test("an empty answer, which isn't kept in the chat, gets no length note", async () => {
  const session = fakeSession({ Hello: async () => ({ ...answer(" ", 100, 400), stats: { ...answer(" ", 100, 400).stats!, lastRequestTokens: 92_000 } }) });
  const { run, output } = chat(session, ["Hello"], { lengthNote: startLengthNotes(haikuLine) });
  await run();
  assert.doesNotMatch(output(), /This chat/);
});

function newChatOf(chat: Partial<NewChat> & { session: AgentSession }): NewChat {
  return { record: undefined, rate: undefined, failureHint: undefined, lengthNote: undefined, recordNewChat: undefined, knownSize: undefined, rememberSize: undefined, notes: [], ...chat };
}

function withSize(text: string, lastRequestTokens: number | null): Script {
  return async (listener) => {
    listener.text?.(text);
    return { ...answer(text, 100, 400), stats: { ...answer(text, 100, 400).stats!, lastRequestTokens } };
  };
}

test("the greeting says how to start a new chat", () => {
  assert.equal(greeting, "Jarvis is listening. Type a message and press Enter, new for a new chat, or exit to stop.");
});

test("new ends this chat with its cost, logs how big it got, and carries on in a new one", async () => {
  const old = fakeSession({ One: withSize("First.", 64_000) }, 0.0021);
  const fresh = fakeSession({ Two: withSize("Second.", 900) }, 0.0003);
  const logged: (number | null)[] = [];
  const records: string[] = [];
  const { run, output } = chat(old, ["One", "New", "Two"], {
    recordNewChat: async (tokens) => void logged.push(tokens),
    record: async () => void records.push("old"),
    newChat: async () => newChatOf({ session: fresh, record: async () => void records.push("new"), notes: ["Chats: starting a new chat, which will be saved"] }),
  });
  await run();
  assert.deepEqual(old.asked, ["One"]);
  assert.deepEqual(fresh.asked, ["Two"]);
  assert.equal(old.closes(), 1);
  assert.deepEqual(logged, [64_000]);
  assert.deepEqual(records, ["old", "new"]);
  assert.ok(output().includes("You: Cost of this chat: about $0.0021\nChats: starting a new chat, which will be saved\nYou: Jarvis: Second."), output());
  assert.ok(output().endsWith("Cost of this chat: about $0.0003\n"), output());
});

test("a new chat's size starts again, and an empty answer doesn't count as the chat's size", async () => {
  const sessions = [fakeSession({ One: withSize("First.", 64_000), Two: withSize(" ", 70_000) }), fakeSession({}), fakeSession({})];
  const logged: (number | null)[] = [];
  let next = 1;
  const { run } = chat(sessions[0], ["One", "Two", "new", "new"], {
    recordNewChat: async (tokens) => void logged.push(tokens),
    newChat: async () => newChatOf({ session: sessions[next++], recordNewChat: async (tokens) => void logged.push(tokens) }),
  });
  await run();
  assert.deepEqual(logged, [64_000, null]);
});

test("without a way to start a new chat, new says so and the chat carries on", async () => {
  const session = fakeSession({ Hello: withSize("Hi.", 10) });
  const { run, output } = chat(session, ["new", "Hello"]);
  await run();
  assert.ok(output().includes(`You:   (${noNewChatNote})\nYou: Jarvis: Hi.`), output());
  assert.equal(session.closes(), 1);
});

test("lines shaped like a / command aren't sent to the engine, on either engine, and say why", async () => {
  const session = fakeSession({ Hello: withSize("Hi.", 10), "/brain/index.md what's in this?": withSize("Your index.", 10) });
  const { run, output } = chat(session, ["/clear", "  /compact now", "/brain/index.md what's in this?", "Hello"]);
  await run();
  assert.deepEqual(session.asked, ["/brain/index.md what's in this?", "Hello"]);
  assert.equal(output().split(`(${commandNote})`).length - 1, 2);
  assert.equal(commandNote, "Jarvis doesn't take / commands. To start a new chat, type new");
});

test("a / command is a slash then one word; a path isn't", () => {
  for (const command of ["/clear", "/compact now", "/cost", "/add-dir x", "/Clear"]) assert.equal(looksLikeCommand(command), true, command);
  for (const other of ["/etc/hosts what is this", "/brain/index.md", "/", "/ hello", "/1st try", "hello /clear", "//clear"]) assert.equal(looksLikeCommand(other), false, other);
});

test("everything about the old chat is swapped for the new chat's, even settings the new one doesn't have", async () => {
  const old = fakeSession({ One: async () => Promise.reject(new Error("Overloaded")) });
  const fresh = fakeSession({ Two: async () => Promise.reject(new Error("Overloaded")), Three: withSize("Three.", 90_000) });
  const { run, output } = chat(old, ["One", "new", "Two", "+", "Three"], {
    failureHint: "old hint",
    rate: async () => "saved",
    lengthNote: () => "old length note",
    newChat: async () => newChatOf({ session: fresh }),
  });
  await run();
  const afterNew = output().slice(output().indexOf("Cost of this chat"));
  assert.ok(output().includes("(old hint)"), output());
  assert.ok(!afterNew.includes("old hint"), afterNew);
  assert.ok(!afterNew.includes("old length note"), afterNew);
  assert.ok(afterNew.includes("ratings are only kept when JARVIS_LOG is on"), afterNew);
});

test("Jarvis is told that a Chat size line is from his own code, and to suggest a new chat once, at a natural point", () => {
  for (const system of [chatSystem, apiChatSystem]) {
    assert.ok(system.includes("A line in square brackets at the end of a message, starting with Chat size, comes from your own code, not from Phil, and he doesn't see it."), system);
    assert.ok(!system.includes('"'), "no double quotes, which the Agent SDK's request would escape");
    assert.ok(system.includes("It means the chat is getting long: when you see one, suggest once, in a few words and at a natural point such as a change of topic, that he types new to start a new chat. Don't repeat it every answer."), system);
  }
});

test("the size line Jarvis is given starts at 80% of the long-prompt line and says what it costs", () => {
  const line = startSizeLines(haikuLine);
  assert.equal(line(null), null);
  assert.equal(line(79_999), null);
  assert.equal(line(80_000), "[Chat size: about 80,000 tokens. Past 100,000, each question costs 5 times as much.]");
  assert.equal(line(81_600), "[Chat size: about 82,000 tokens. Past 100,000, each question costs 5 times as much.]");
  assert.equal(line(100_000), "[Chat size: about 100,000 tokens. Past 100,000, each question costs 5 times as much.]");
  assert.equal(line(100_001), "[Chat size: about 101,000 tokens, so each question now costs 5 times as much.]");
  assert.equal(line(81_600), "[Chat size: about 82,000 tokens. Past 100,000, each question costs 5 times as much.]");
  assert.equal(withSizeLine("Hello", null), "Hello");
  assert.equal(withSizeLine("Hello", "[Chat size: x]"), "Hello\n\n[Chat size: x]");
});

test("with Jarvis saying it, each question after a long answer carries the chat's size, and nothing is printed", async () => {
  const sent: string[] = [];
  const first = fakeSession({ One: withSize("First.", 85_000) });
  const ask = first.ask.bind(first);
  first.ask = (question, listener) => {
    sent.push(question);
    return question.startsWith("Two") || question.startsWith("Three") ? withSize("Next.", question.startsWith("Two") ? 101_000 : 50)(listener ?? {}) : ask(question, listener);
  };
  const { run, output } = chat(first, ["One", "Two", "Three", "Four"], { sizeLine: startSizeLines(haikuLine) });
  await run();
  assert.deepEqual(sent, [
    "One",
    "Two\n\n[Chat size: about 85,000 tokens. Past 100,000, each question costs 5 times as much.]",
    "Three\n\n[Chat size: about 101,000 tokens, so each question now costs 5 times as much.]",
    "Four",
  ]);
  assert.doesNotMatch(output(), /Chat size|This chat/);
});

test("after new, the size line starts again from nothing", async () => {
  const sent: string[] = [];
  const old = fakeSession({ One: withSize("First.", 90_000) });
  const fresh = fakeSession({});
  fresh.ask = (question, listener) => {
    sent.push(question);
    return withSize("Hi.", 10)(listener ?? {});
  };
  const { run } = chat(old, ["One", "new", "Two"], { sizeLine: startSizeLines(haikuLine), newChat: async () => newChatOf({ session: fresh }) });
  await run();
  assert.deepEqual(sent, ["Two"]);
});

test("the setting decides who says it: the note gets a fresh length note for each chat and no size line; jarvis gets the size line and no note", () => {
  const note = lengthHintsFor("note", haikuLine);
  assert.equal(note.sizeLine, undefined);
  const first = note.newLengthNote();
  const second = note.newLengthNote();
  assert.match(first?.(85_000) ?? "", /^This chat has reached 80,000 tokens \(about 85,000 now\)/);
  assert.equal(first?.(86_000), null);
  assert.match(second?.(86_000) ?? "", /^This chat has reached 80,000 tokens \(about 86,000 now\)/);
  const jarvis = lengthHintsFor("jarvis", haikuLine);
  assert.equal(jarvis.newLengthNote(), undefined);
  assert.equal(jarvis.sizeLine?.(85_000), "[Chat size: about 85,000 tokens. Past 100,000, each question costs 5 times as much.]");
});

test("after a failed question, the next one still carries the chat's size", async () => {
  const sent: string[] = [];
  const session = fakeSession({});
  session.ask = (question, listener) => {
    sent.push(question);
    if (question.startsWith("Two")) return Promise.reject(new Error("Overloaded"));
    return withSize("Fine.", 85_000)(listener ?? {});
  };
  const { run } = chat(session, ["One", "Two", "Three"], { sizeLine: startSizeLines(haikuLine) });
  await run();
  assert.deepEqual(sent.map((question) => question.includes("[Chat size: about 85,000")), [false, true, true]);
});

test("a warning level from the setting moves the heads-up and the size line, and the note says which line was reached", () => {
  const line = { ...haikuLine, warnAt: 60_000 };
  const note = startLengthNotes(line);
  assert.equal(note(59_999), null);
  assert.equal(note(61_400), "This chat has reached 60,000 tokens (about 62,000 now). Past 100,000, each question costs 5 times as much, so start a new one when you're done with this topic: type exit and start Jarvis again");
  assert.equal(startSizeLines(line)(61_400), "[Chat size: about 62,000 tokens. Past 100,000, each question costs 5 times as much.]");
  assert.equal(startSizeLines(line)(59_999), null);
});

test("for a model with no long-prompt price, the warning still comes, without a cost it can't know", () => {
  const line = { warnAt: 50_000, cap: null, longPromptOver: null, times: null, startOver: "type new" };
  const note = startLengthNotes(line);
  assert.equal(note(52_000), "This chat has reached 50,000 tokens (about 52,000 now), so start a new one when you're done with this topic: type new");
  assert.equal(note(500_000), null);
  assert.equal(startSizeLines(line)(52_000), "[Chat size: about 52,000 tokens.]");
  assert.equal(startSizeLines(line)(500_000), "[Chat size: about 500,000 tokens.]");
});

test("a warning set above the long-prompt line stays quiet until it's reached", () => {
  const note = startLengthNotes({ ...haikuLine, warnAt: 120_000 });
  assert.equal(note(110_000), null);
  assert.match(note(121_000) ?? "", /^This chat is about 121,000 tokens, so each question now costs 5 times as much/);
});

test("past the cap, a question isn't sent, and Jarvis says why and what to do; new lifts it", async () => {
  const old = fakeSession({ One: withSize("First.", 150_001), Two: withSize("Never.", 10) });
  const fresh = fakeSession({ Three: withSize("Third.", 10) });
  const { run, output } = chat(old, ["One", "Two", "new", "Three"], { lengthCap: 150_000, newChat: async () => newChatOf({ session: fresh }) });
  await run();
  assert.deepEqual(old.asked, ["One"]);
  assert.deepEqual(fresh.asked, ["Three"]);
  assert.ok(output().includes(`You:   (${capNote(150_000)})\nYou: `), output());
  assert.equal(capNote(150_000), "This chat has passed the 150,000-token cap set by JARVIS_LENGTH_CAP, so that wasn't sent. Type new to start a new chat, then ask again");
});

test("at the cap itself, or with no cap, questions are still sent", async () => {
  const atCap = fakeSession({ One: withSize("First.", 150_000), Two: withSize("Second.", 10) });
  const atCapChat = chat(atCap, ["One", "Two"], { lengthCap: 150_000 });
  await atCapChat.run();
  assert.deepEqual(atCap.asked, ["One", "Two"]);
  assert.ok(!atCapChat.output().includes("cap set by"), atCapChat.output());
  const noCap = fakeSession({ One: withSize("First.", 900_000), Two: withSize("Second.", 10) });
  await chat(noCap, ["One", "Two"]).run();
  assert.deepEqual(noCap.asked, ["One", "Two"]);
});

test("the answer that passes the cap says so straight away, instead of the usual length note, is remembered, and ratings still work after it", async () => {
  const old = fakeSession({ One: withSize("First.", 200_000) });
  const rated: string[] = [];
  const remembered: number[] = [];
  const { run, output } = chat(old, ["One", "+", "", "exit"], {
    lengthCap: 150_000,
    rememberSize: async (tokens) => void remembered.push(tokens),
    lengthNote: startLengthNotes({ ...haikuLine, cap: 150_000 }),
    rate: async (rating) => {
      rated.push(rating);
      return "saved";
    },
  });
  await run();
  assert.deepEqual(rated, ["good"]);
  assert.deepEqual(remembered, [200_000]);
  assert.ok(output().includes(`(first words 0.10 s, full answer 0.40 s)\n  (${capReachedNote(150_000)})\n`), output());
  assert.equal(output().split("cap set by").length - 1, 1, output());
  assert.ok(!output().includes("tokens, so each question now costs"), output());
  assert.equal(capReachedNote(150_000), "This chat has passed the 150,000-token cap set by JARVIS_LENGTH_CAP, so no more questions will be sent in it. Type new to start a new chat");
});

test("small sizes are given exactly, not rounded to thousands", () => {
  const note = startLengthNotes({ warnAt: 500, cap: null, longPromptOver: null, times: null, startOver: "type new" });
  assert.equal(note(640), "This chat has reached 500 tokens (about 640 now), so start a new one when you're done with this topic: type new");
  assert.equal(startSizeLines({ warnAt: 500, cap: null, longPromptOver: null, times: null, startOver: "type new" })(9_999), "[Chat size: about 9,999 tokens.]");
});

test("the warning and the size line say where the cap is, and leave out the long-prompt price when the cap stops the chat first", () => {
  const capped = { ...haikuLine, cap: 90_000 };
  assert.equal(startLengthNotes(capped)(85_000), "This chat has reached 80,000 tokens (about 85,000 now). Past 90,000, your JARVIS_LENGTH_CAP, it stops taking questions, so start a new one when you're done with this topic: type exit and start Jarvis again");
  assert.equal(startSizeLines(capped)(85_000), "[Chat size: about 85,000 tokens. Past 90,000, no more questions can be sent in this chat.]");
  const late = { ...haikuLine, cap: 150_000 };
  assert.equal(startLengthNotes(late)(85_000), "This chat has reached 80,000 tokens (about 85,000 now). Past 100,000, each question costs 5 times as much. Past 150,000, your JARVIS_LENGTH_CAP, it stops taking questions, so start a new one when you're done with this topic: type exit and start Jarvis again");
  assert.equal(startSizeLines(late)(85_000), "[Chat size: about 85,000 tokens. Past 100,000, each question costs 5 times as much. Past 150,000, no more questions can be sent in this chat.]");
});

test("the size shown never rounds below the line it passed", () => {
  const line = { ...haikuLine, warnAt: 80_300 };
  assert.equal(startLengthNotes(line)(80_400), "This chat has reached 80,300 tokens (about 81,000 now). Past 100,000, each question costs 5 times as much, so start a new one when you're done with this topic: type exit and start Jarvis again");
  assert.equal(startSizeLines({ ...haikuLine, warnAt: 10_000 })(10_400), "[Chat size: about 11,000 tokens. Past 100,000, each question costs 5 times as much.]");
});

test("a chat that starts with a known size, as a resumed one does, is capped and sized from its first question, and remembers each new size", async () => {
  const capped = fakeSession({ One: withSize("Never.", 10) });
  const out = chat(capped, ["One"], { lengthCap: 150_000, knownSize: 160_000 });
  await out.run();
  assert.deepEqual(capped.asked, []);
  assert.ok(out.output().includes(capNote(150_000)), out.output());
  const sent: string[] = [];
  const remembered: number[] = [];
  const sized = fakeSession({});
  sized.ask = (question, listener) => {
    sent.push(question);
    return withSize("Hi.", question.startsWith("Two") ? null : 91_000)(listener ?? {});
  };
  await chat(sized, ["One", "Two", "Three"], { sizeLine: startSizeLines(haikuLine), knownSize: 85_000, rememberSize: async (tokens) => void remembered.push(tokens) }).run();
  assert.deepEqual(sent, ["One\n\n[Chat size: about 85,000 tokens. Past 100,000, each question costs 5 times as much.]", "Two\n\n[Chat size: about 91,000 tokens. Past 100,000, each question costs 5 times as much.]", "Three\n\n[Chat size: about 91,000 tokens. Past 100,000, each question costs 5 times as much.]"]);
  assert.deepEqual(remembered, [91_000, 91_000]);
});

test("new starts from the new chat's own known size", async () => {
  const sent: string[] = [];
  const fresh = fakeSession({});
  fresh.ask = (question, listener) => {
    sent.push(question);
    return withSize("Hi.", 10)(listener ?? {});
  };
  await chat(fakeSession({}), ["new", "Two"], { sizeLine: startSizeLines(haikuLine), knownSize: 99_000, newChat: async () => newChatOf({ session: fresh, knownSize: 82_000 }) }).run();
  assert.deepEqual(sent, ["Two\n\n[Chat size: about 82,000 tokens. Past 100,000, each question costs 5 times as much.]"]);
});

test("an empty Enter past the cap says nothing", async () => {
  const session = fakeSession({ One: withSize("First.", 200_000) });
  const { run, output } = chat(session, ["One", "", "   "], { lengthCap: 150_000 });
  await run();
  assert.equal(output().split(capNote(150_000)).length - 1, 0, output());
});

test("an answer that jumps past both the warning and the cap gets only the cap note", async () => {
  const session = fakeSession({ One: withSize("First.", 95_000) });
  const { run, output } = chat(session, ["One"], { lengthCap: 90_000, lengthNote: startLengthNotes({ ...haikuLine, cap: 90_000 }) });
  await run();
  assert.ok(output().includes(`full answer 0.40 s)\n  (${capReachedNote(90_000)})\n`), output());
  assert.ok(!output().includes("This chat has passed 80,000"), output());
});

test("past the long-prompt line, the note and the size line still say where the cap is, until it's passed", () => {
  const line = { ...haikuLine, warnAt: 120_000, cap: 150_000 };
  assert.equal(startLengthNotes(line)(121_000), "This chat is about 121,000 tokens, so each question now costs 5 times as much. Past 150,000, your JARVIS_LENGTH_CAP, it stops taking questions. A new chat would be cheaper: type exit and start Jarvis again");
  assert.equal(startSizeLines(line)(121_000), "[Chat size: about 121,000 tokens, so each question now costs 5 times as much. Past 150,000, no more questions can be sent in this chat.]");
  assert.equal(startLengthNotes({ ...haikuLine, cap: 150_000 })(150_000), "This chat is about 150,000 tokens, so each question now costs 5 times as much. Past 150,000, your JARVIS_LENGTH_CAP, it stops taking questions. A new chat would be cheaper: type exit and start Jarvis again");
  assert.equal(startLengthNotes({ ...haikuLine, cap: 150_000 })(150_001), "This chat is about 151,000 tokens, so each question now costs 5 times as much. A new chat would be cheaper: type exit and start Jarvis again");
  assert.equal(startSizeLines({ ...haikuLine, cap: 150_000 })(150_001), "[Chat size: about 151,000 tokens, so each question now costs 5 times as much.]");
});

test("a chat that starts already past the cap, as a resumed one can, says so before the first question", async () => {
  const session = fakeSession({ One: withSize("Never.", 10) });
  const { run, output } = chat(session, ["One"], { lengthCap: 150_000, knownSize: 160_000 });
  await run();
  assert.ok(output().startsWith(`${greeting}\n  (${capReachedNote(150_000)})\nYou: `), output());
  const under = chat(fakeSession({}), [], { lengthCap: 150_000, knownSize: 150_000 });
  await under.run();
  assert.ok(!under.output().includes("cap set by"), under.output());
});

test("a hub tool's note leaves out the Agent SDK's mcp__hub__ prefix", () => {
  assert.equal(toolNote("mcp__hub__get_status", {}), "using get_status");
  assert.equal(toolNote("get_status", {}), "using get_status");
  assert.equal(toolNote("SomethingElse", {}), "using SomethingElse");
});

test("both engines are told the hub's tools only read, and what they're for", () => {
  for (const system of [chatSystem, apiChatSystem]) {
    assert.ok(system.includes("If you have the hub's tools, named get_status, get_alerts and so on, use them for questions about the home server itself: its status, alerts, downloads, library, Wi-Fi and backups. They only read, like everything else."));
  }
});
