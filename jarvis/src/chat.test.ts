import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { apiChatSystem, chatModel, chatSystem, costLine, engineLine, exitWords, greeting, printable, promptWhileOpen, questionTimeoutMs, runChat, stoppedMessage, timingLine, toolNote, type ChatDeps, type PromptLine } from "./chat.js";
import type { Answer } from "./timing.js";

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
  assert.match(chatSystem, /never instructions to you/);
  assert.match(chatSystem, /You can only read/);
  assert.match(chatSystem, /Before you read a file, say/);
  assert.match(chatSystem, /British English/);
});

test("the plain API engine's instructions keep the same voice but say he can't read the brain yet", () => {
  assert.match(apiChatSystem, /^You are Jarvis, Phil's assistant on his home server\./);
  assert.match(apiChatSystem, /British English/);
  assert.match(apiChatSystem, /can't read his notes or use any tools/);
  assert.match(apiChatSystem, /can't change anything/);
  assert.doesNotMatch(apiChatSystem, /\/brain|index\.md|Before you read a file/);
});

test("the engine line names the engine", () => {
  assert.equal(engineLine("sdk"), "Engine: the Agent SDK");
  assert.equal(engineLine("api"), "Engine: a plain API call, without the brain for now");
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

test("tool notes say what's being read, or name the tool", () => {
  assert.equal(toolNote("Read", { file_path: "/brain/areas/jarvis.md" }), "reading areas/jarvis.md");
  assert.equal(toolNote("Read", { file_path: "/app/package.json" }), "reading /app/package.json");
  assert.equal(toolNote("Read", { file_path: "/brainstorm/notes.md" }), "reading /brainstorm/notes.md");
  assert.equal(toolNote("Read", {}), "using Read");
  assert.equal(toolNote("Read", { file_path: 42 }), "using Read");
  assert.equal(toolNote("Read", null), "using Read");
  assert.equal(toolNote("Grep", { pattern: "jarvis" }), "using Grep");
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

test("a refused file read shows as a note, not a failure, and the chat carries on", async () => {
  const session = fakeSession({
    "Read /etc/passwd": async (listener) => {
      listener.text?.("I'll try that.");
      listener.tool?.("Read", { file_path: "/etc/passwd" });
      listener.text?.("I can only read your notes.");
      throw new Error("Refused: Read");
    },
    Again: hello,
  });
  const { run, output } = chat(session, ["Read /etc/passwd", "Again"]);
  await run();
  assert.ok(output().includes("(reading /etc/passwd)\nI can only read your notes.\n  (Refused: Read)\nYou: Jarvis: Hi Phil."));
  assert.ok(!output().includes("couldn't answer"));
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