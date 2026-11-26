import assert from "node:assert/strict";
import { lookUpServer } from "./look-up-sdk.js";
import { createLookUpTool } from "./look-up-tool.js";
import { test } from "node:test";
import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { actionHook, actionHookSeconds, agentOptions, closedMessage, createInputQueue, startAgentSession, userMessage, type AgentSettings, type StartAgent } from "./agent.js";
import { hubProblemNote, notDoneNote } from "./hub-tools.js";

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function fakeAgent() {
  const sent: SDKUserMessage[] = [];
  const queue: SDKMessage[] = [];
  let seenOptions: Options | null = null;
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: Error | null = null;
  let closes = 0;
  let inputEnded = false;

  function wakeUp() {
    const waiter = wake;
    wake = null;
    waiter?.();
  }

  const start: StartAgent = (prompt, options) => {
    seenOptions = options;
    void (async () => {
      for await (const message of prompt) sent.push(message);
      inputEnded = true;
    })();
    async function* stream(): AsyncGenerator<SDKMessage> {
      while (true) {
        const next = queue.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (failure !== null) throw failure;
        if (finished) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    }
    return Object.assign(stream(), {
      close() {
        closes++;
        finished = true;
        wakeUp();
      },
    });
  };

  return {
    start,
    sent,
    options: () => seenOptions,
    closes: () => closes,
    inputEnded: () => inputEnded,
    async emit(...messages: object[]) {
      for (const message of messages) queue.push(message as SDKMessage);
      wakeUp();
      await tick();
    },
    async end() {
      finished = true;
      wakeUp();
      await tick();
    },
    async fail(error: Error) {
      failure = error;
      wakeUp();
      await tick();
    },
  };
}

const init = { type: "system", subtype: "init", tools: ["Read"], model: "claude-haiku-5-5" };

function textDelta(text: string, parent: string | null = null) {
  return { type: "stream_event", parent_tool_use_id: parent, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } };
}

function success(result: string, cost = 0.001) {
  return { type: "result", subtype: "success", is_error: false, result, total_cost_usd: cost, errors: [], permission_denials: [] };
}

function setup(overrides: Partial<AgentSettings> = {}) {
  let time = 1000;
  const clock = {
    set(value: number) {
      time = value;
    },
  };
  const settings: AgentSettings = { model: "claude-haiku-5-5", system: "Be brief.", cwd: "/brain", now: () => time, ...overrides };
  const agent = fakeAgent();
  const session = startAgentSession(agent.start, settings);
  return { agent, session, clock, settings };
}

test("the engine gets only Read, Grep and Glob, kept out of .git, refuses anything else, loads no settings files or MCP servers, and skips naming the session", () => {
  assert.deepEqual(agentOptions({ model: "claude-haiku-5-5", system: "Be brief.", cwd: "/brain", now: () => 0, env: {} }), {
    model: "claude-haiku-5-5",
    cwd: "/brain",
    systemPrompt: "Be brief.",
    tools: ["Read", "Grep", "Glob"],
    disallowedTools: ["Read(./.git/**)"],
    permissionMode: "dontAsk",
    settingSources: [],
    persistSession: false,
    continue: false,
    strictMcpConfig: true,
    title: "Jarvis",
    includePartialMessages: true,
    env: { DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" },
  });
});

test("with saved chats, the engine saves to Jarvis's own folder and carries on the last chat there; without, it saves nothing", () => {
  const saved = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/elsewhere" }, savedChats: "/app/data/chats/agent-sdk" });
  assert.equal(saved.persistSession, true);
  assert.equal(saved.continue, true);
  assert.deepEqual(saved.env, { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/app/data/chats/agent-sdk", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" });
  assert.equal(saved.resume, undefined);
  const fresh = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin" } });
  assert.deepEqual([fresh.persistSession, fresh.continue, fresh.env?.CLAUDE_CONFIG_DIR], [false, false, undefined]);
});

test("the engine keeps the rest of the environment, and the privacy settings can't be undone by it", () => {
  const env = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-test-key", DISABLE_TELEMETRY: "", DISABLE_ERROR_REPORTING: undefined } }).env;
  assert.deepEqual(env, { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-test-key", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" });
});

test("without an environment given, the engine gets this process's own, plus the privacy settings", () => {
  const env = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0 }).env;
  assert.equal(env?.PATH, process.env.PATH);
  assert.equal(env?.DISABLE_TELEMETRY, "1");
  assert.equal(env?.DISABLE_ERROR_REPORTING, "1");
});

test("starting a session hands those options to the engine", () => {
  const { agent, settings } = setup();
  assert.deepEqual(agent.options(), agentOptions(settings));
});

test("a question goes in as a user message", async () => {
  const { agent, session } = setup();
  void session.ask("What's on?");
  await tick();
  assert.deepEqual(agent.sent, [{ type: "user", message: { role: "user", content: "What's on?" }, parent_tool_use_id: null }]);
});

test("userMessage builds a top-level user message", () => {
  assert.deepEqual(userMessage("Hi"), { type: "user", message: { role: "user", content: "Hi" }, parent_tool_use_id: null });
});

test("times first words from the question, at the first streamed text", async () => {
  const { agent, session, clock } = setup();
  clock.set(2000);
  const answer = session.ask("Hello?");
  await tick();
  clock.set(2600);
  await agent.emit(init, { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start" } }, textDelta("Hi "));
  clock.set(2900);
  await agent.emit(textDelta("Phil."));
  clock.set(3400);
  await agent.emit(success("Hi Phil."));
  const { text, firstWordsMs, totalMs } = await answer;
  assert.deepEqual({ text, firstWordsMs, totalMs }, { text: "Hi Phil.", firstWordsMs: 600, totalMs: 1400 });
});

test("the engine's ready time counts from starting the session", async () => {
  const { agent, session, clock } = setup();
  assert.equal(session.readyMs(), null);
  clock.set(1450);
  await agent.emit(init);
  assert.equal(session.readyMs(), 450);
});

test("only the first init counts as ready", async () => {
  const { agent, session, clock } = setup();
  clock.set(1300);
  await agent.emit(init);
  clock.set(9000);
  await agent.emit(init);
  assert.equal(session.readyMs(), 300);
});

test("tool input and other deltas aren't first words", async () => {
  const { agent, session, clock } = setup();
  clock.set(0);
  const answer = session.ask("Read the brain");
  await tick();
  clock.set(200);
  await agent.emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{" } } });
  clock.set(500);
  await agent.emit(textDelta("It covers"));
  clock.set(800);
  await agent.emit(success("It covers your life."));
  assert.equal((await answer).firstWordsMs, 500);
});

test("text from a subagent isn't Jarvis speaking", async () => {
  const { agent, session, clock } = setup();
  clock.set(0);
  const answer = session.ask("Hi");
  await tick();
  clock.set(100);
  await agent.emit(textDelta("sub", "toolu_1"));
  clock.set(300);
  await agent.emit(textDelta("Hello"));
  clock.set(400);
  await agent.emit(success("Hello"));
  assert.equal((await answer).firstWordsMs, 300);
});

test("no first-words time when nothing was streamed", async () => {
  const { agent, session, clock } = setup();
  clock.set(0);
  const answer = session.ask("Hi");
  await tick();
  clock.set(700);
  await agent.emit(success("Hello"));
  const { text, firstWordsMs, totalMs } = await answer;
  assert.deepEqual({ text, firstWordsMs, totalMs }, { text: "Hello", firstWordsMs: null, totalMs: 700 });
});

test("each question is timed from its own start", async () => {
  const { agent, session, clock } = setup();
  clock.set(0);
  const first = session.ask("One");
  await tick();
  clock.set(1000);
  await agent.emit(textDelta("1"), success("1"));
  const one = await first;
  assert.deepEqual({ text: one.text, firstWordsMs: one.firstWordsMs, totalMs: one.totalMs }, { text: "1", firstWordsMs: 1000, totalMs: 1000 });
  clock.set(5000);
  const second = session.ask("Two");
  await tick();
  clock.set(5300);
  await agent.emit(textDelta("2"));
  clock.set(5500);
  await agent.emit(success("2"));
  const two = await second;
  assert.deepEqual({ text: two.text, firstWordsMs: two.firstWordsMs, totalMs: two.totalMs }, { text: "2", firstWordsMs: 300, totalMs: 500 });
  assert.equal(agent.sent.length, 2);
});

function assistant(content: object[], parent: string | null = null) {
  return { type: "assistant", parent_tool_use_id: parent, message: { role: "assistant", content } };
}

test("the listener hears Jarvis's text as it streams, in order", async () => {
  const { agent, session } = setup();
  const heard: string[] = [];
  const answer = session.ask("Hello?", { text: (delta) => heard.push(delta) });
  await tick();
  await agent.emit(textDelta("Hi "));
  assert.deepEqual(heard, ["Hi "]);
  await agent.emit(textDelta("Phil."), success("Hi Phil."));
  await answer;
  assert.deepEqual(heard, ["Hi ", "Phil."]);
});

test("the listener doesn't hear a subagent's text or tool input", async () => {
  const { agent, session } = setup();
  const heard: string[] = [];
  const answer = session.ask("Hello?", { text: (delta) => heard.push(delta) });
  await tick();
  const toolInput = { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{" } } };
  await agent.emit(textDelta("Inside", "toolu_1"), toolInput, textDelta("Done."), success("Done."));
  await answer;
  assert.deepEqual(heard, ["Done."]);
});

test("the listener hears each tool Jarvis uses, with its input", async () => {
  const { agent, session } = setup();
  const tools: { name: string; input: unknown }[] = [];
  const answer = session.ask("What's in my brain?", { tool: (name, input) => tools.push({ name, input }) });
  await tick();
  await agent.emit(
    assistant([{ type: "text", text: "Let me check." }]),
    assistant([{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/brain/index.md" } }]),
    assistant([
      { type: "tool_use", id: "toolu_2", name: "Read", input: { file_path: "/brain/a.md" } },
      { type: "tool_use", id: "toolu_3", name: "Read", input: { file_path: "/brain/b.md" } },
    ]),
    success("It covers your life."),
  );
  await answer;
  assert.deepEqual(tools, [
    { name: "Read", input: { file_path: "/brain/index.md" } },
    { name: "Read", input: { file_path: "/brain/a.md" } },
    { name: "Read", input: { file_path: "/brain/b.md" } },
  ]);
});

test("the listener doesn't hear a subagent's tools", async () => {
  const { agent, session } = setup();
  const tools: string[] = [];
  const answer = session.ask("Hello?", { tool: (name) => tools.push(name) });
  await tick();
  await agent.emit(assistant([{ type: "tool_use", id: "toolu_9", name: "Read", input: {} }], "toolu_1"), success("Hi."));
  await answer;
  assert.deepEqual(tools, []);
});

test("nothing is heard when no question is waiting", async () => {
  const { agent, session } = setup();
  const heard: string[] = [];
  const answer = session.ask("Hello?", { text: (delta) => heard.push(delta), tool: (name) => heard.push(name) });
  await tick();
  await agent.emit(success("Hi."));
  await answer;
  await agent.emit(textDelta("Late"), assistant([{ type: "tool_use", id: "toolu_1", name: "Read", input: {} }]));
  assert.deepEqual(heard, []);
});

test("each question's listener only hears its own answer", async () => {
  const { agent, session } = setup();
  const first: string[] = [];
  const second: string[] = [];
  const one = session.ask("One", { text: (delta) => first.push(delta) });
  await tick();
  await agent.emit(textDelta("First."), success("First."));
  await one;
  const two = session.ask("Two", { text: (delta) => second.push(delta) });
  await tick();
  await agent.emit(textDelta("Second."), success("Second."));
  await two;
  assert.deepEqual(first, ["First."]);
  assert.deepEqual(second, ["Second."]);
});

test("the stop reason is empty while the session is open", () => {
  const { session } = setup();
  assert.equal(session.stoppedReason(), null);
});

test("the stop reason says when the session was closed", () => {
  const { session } = setup();
  session.close();
  assert.equal(session.stoppedReason(), closedMessage);
  assert.equal(closedMessage, "The agent was closed");
});

test("the stop reason says when the engine stopped by itself", async () => {
  const { agent, session } = setup();
  await agent.end();
  assert.equal(session.stoppedReason(), "The agent stopped");
});

test("the stop reason passes on the engine's crash", async () => {
  const { agent, session } = setup();
  await agent.fail(new Error("Engine crashed"));
  assert.equal(session.stoppedReason(), "Engine crashed");
});

test("only one question at a time", async () => {
  const { session } = setup();
  void session.ask("One");
  await assert.rejects(session.ask("Two"), { message: "One question at a time" });
});

test("an error result marked success, like a bad key, is still an error", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  const check = assert.rejects(answer, { message: "Authentication error" });
  await agent.emit({ type: "result", subtype: "success", is_error: true, result: "Authentication error", total_cost_usd: 0, errors: [] });
  await check;
});

test("an error result with no text still says something", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  const check = assert.rejects(answer, { message: "The agent reported an error" });
  await agent.emit({ type: "result", subtype: "success", is_error: true, result: "", total_cost_usd: 0, errors: [] });
  await check;
});

test("a failed run passes on the engine's errors", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  const check = assert.rejects(answer, { message: "Overloaded; Gave up" });
  await agent.emit({ type: "result", subtype: "error_during_execution", is_error: true, total_cost_usd: 0, errors: ["Overloaded", "Gave up"] });
  await check;
});

test("a failed run with no errors names the kind of failure", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  const check = assert.rejects(answer, { message: "error_max_turns" });
  await agent.emit({ type: "result", subtype: "error_max_turns", is_error: true, total_cost_usd: 0, errors: [] });
  await check;
});

test("a refused tool comes back with the answer, named, so the question still counts as answered", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Read /app/.env");
  await tick();
  await agent.emit({ ...success("I can't read that file."), permission_denials: [{ tool_name: "Read", tool_use_id: "toolu_1", tool_input: { file_path: "/app/.env" } }] });
  const { text, stats } = await answer;
  assert.equal(text, "I can't read that file.");
  assert.deepEqual(stats?.refusedTools, ["Read"]);
});

test("an answer with nothing refused reports an empty list, and leaves retries to the engine, so unknown", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hello?");
  await tick();
  await agent.emit(success("Hi."));
  assert.deepEqual((await answer).stats?.refusedTools, []);
  assert.equal((await answer).stats?.retried, null);
});

test("an error after refused tools is reported as the error, not as a refusal", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Do things");
  await tick();
  const check = assert.rejects(answer, { message: "Gave up" });
  const refused = [
    { tool_name: "Read", tool_use_id: "toolu_1", tool_input: {} },
    { tool_name: "Bash", tool_use_id: "toolu_2", tool_input: {} },
  ];
  await agent.emit({ type: "result", subtype: "error_during_execution", is_error: true, total_cost_usd: 0, errors: ["Gave up"], permission_denials: refused });
  await check;
});

test("a result with no list of refusals, like a start-up failure, still works", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  await agent.emit({ type: "result", subtype: "success", is_error: false, result: "Hello", total_cost_usd: 0 });
  assert.equal((await answer).text, "Hello");
});

test("a session can keep going after a failed question", async () => {
  const { agent, session } = setup();
  const failed = session.ask("Hi");
  await tick();
  const check = assert.rejects(failed);
  await agent.emit({ type: "result", subtype: "error_max_turns", is_error: true, total_cost_usd: 0, errors: [] });
  await check;
  const next = session.ask("Again");
  await tick();
  await agent.emit(success("Fine"));
  assert.equal((await next).text, "Fine");
});

test("the cost is the latest running total the engine reports", async () => {
  const { agent, session } = setup();
  assert.equal(session.costUsd(), null);
  const first = session.ask("One");
  await tick();
  await agent.emit(success("1", 0.002));
  await first;
  const second = session.ask("Two");
  await tick();
  await agent.emit(success("2", 0.005));
  await second;
  assert.equal(session.costUsd(), 0.005);
});

test("results with no question waiting are ignored", async () => {
  const { agent, session } = setup();
  await agent.emit(success("stray"));
  assert.equal(session.costUsd(), null);
});

test("if the engine stops mid-question, the question fails", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  const check = assert.rejects(answer, { message: "The agent stopped" });
  await agent.end();
  await check;
});

test("if the engine crashes mid-question, the question fails with its error", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  const check = assert.rejects(answer, { message: "Claude Code native binary not found" });
  await agent.fail(new Error("Claude Code native binary not found"));
  await check;
});

test("after the engine stops, new questions fail straight away", async () => {
  const { agent, session } = setup();
  await agent.end();
  await assert.rejects(session.ask("Hi"), { message: "The agent stopped" });
  assert.equal(agent.sent.length, 0);
});

test("closing ends the input, closes the engine and fails a waiting question", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hi");
  await tick();
  const check = assert.rejects(answer, { message: "The agent was closed" });
  session.close();
  await check;
  await tick();
  assert.equal(agent.closes(), 1);
  assert.equal(agent.inputEnded(), true);
  await assert.rejects(session.ask("Again"), { message: "The agent was closed" });
});

test("closing twice only closes the engine once", async () => {
  const { agent, session } = setup();
  session.close();
  session.close();
  await tick();
  assert.equal(agent.closes(), 1);
  await assert.rejects(session.ask("Hi"), { message: "The agent was closed" });
});

test("the input queue hands over messages in order", async () => {
  const queue = createInputQueue();
  queue.push("one");
  queue.push("two");
  queue.end();
  const texts: unknown[] = [];
  for await (const message of queue.messages) texts.push(message.message.content);
  assert.deepEqual(texts, ["one", "two"]);
});

test("the input queue waits for the next message", async () => {
  const queue = createInputQueue();
  const next = queue.messages.next();
  let settled = false;
  void next.then(() => {
    settled = true;
  });
  await tick();
  assert.equal(settled, false);
  queue.push("later");
  assert.equal((await next).value?.message.content, "later");
});

test("ending the queue finishes a waiting reader", async () => {
  const queue = createInputQueue();
  const next = queue.messages.next();
  queue.end();
  assert.equal((await next).done, true);
});

test("nothing is added after the queue ends", async () => {
  const queue = createInputQueue();
  queue.end();
  queue.push("too late");
  assert.equal((await queue.messages.next()).done, true);
});

function roundStart(parent: string | null = null) {
  return { type: "stream_event", parent_tool_use_id: parent, event: { type: "message_start", message: { id: "msg" } } };
}

function usage(input: number, output: number, cacheWrite = 0, cacheRead = 0) {
  return { input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheWrite, cache_read_input_tokens: cacheRead };
}

test("an answer reports its largest single request, counting only Jarvis's own rounds and every kind of input", async () => {
  const { agent, session } = setup();
  const answer = session.ask("What's in my notes?");
  await tick();
  const start = (parent: string | null, input: number, cacheWrite: number, cacheRead: number) => ({ type: "stream_event", parent_tool_use_id: parent, event: { type: "message_start", message: { id: "msg", usage: usage(input, 1, cacheWrite, cacheRead) } } });
  await agent.emit(start(null, 100, 50, 900), start("toolu_9", 9000, 0, 0), start(null, 20, 10, 1200), success("It covers your life."));
  const stats = (await answer).stats;
  assert.equal(stats?.largestRequestTokens, 1230);
  assert.equal(stats?.rounds, 2);
});

test("a round that reports no token counts adds a round, and the largest request stays unknown", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hello?");
  await tick();
  await agent.emit(roundStart(), success("Hi."));
  const stats = (await answer).stats;
  assert.equal(stats?.rounds, 1);
  assert.equal(stats?.largestRequestTokens, null);
});

test("an answer reports its rounds and tool uses, counting only Jarvis's own", async () => {
  const { agent, session } = setup();
  const answer = session.ask("What's in my notes?");
  await tick();
  await agent.emit(
    roundStart(),
    { type: "assistant", parent_tool_use_id: null, message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: {} }] } },
    roundStart("toolu_9"),
    { type: "assistant", parent_tool_use_id: "toolu_9", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_2", name: "Read", input: {} }] } },
    roundStart(),
    success("It covers your life."),
  );
  const stats = (await answer).stats;
  assert.equal(stats?.rounds, 2);
  assert.equal(stats?.toolUses, 1);
});

test("an answer's tokens include cached input, as the engine reports them", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hello?");
  await tick();
  await agent.emit({ ...success("Hi."), usage: usage(100, 20, 300, 4000) });
  const stats = (await answer).stats;
  assert.equal(stats?.inputTokens, 4400);
  assert.equal(stats?.cacheWriteTokens, 300);
  assert.equal(stats?.cacheReadTokens, 4000);
  assert.equal(stats?.outputTokens, 20);
});

test("an answer with no usage reported counts zero tokens", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hello?");
  await tick();
  await agent.emit(success("Hi."));
  const stats = (await answer).stats;
  assert.equal(stats?.inputTokens, 0);
  assert.equal(stats?.outputTokens, 0);
});

test("each answer's cost is the change in the engine's running total", async () => {
  const { agent, session } = setup();
  const first = session.ask("One");
  await tick();
  await agent.emit(success("1", 0.002));
  assert.ok(Math.abs(((await first).stats?.costUsd ?? 0) - 0.002) < 1e-12);
  const second = session.ask("Two");
  await tick();
  await agent.emit(success("2", 0.0035));
  assert.ok(Math.abs(((await second).stats?.costUsd ?? 0) - 0.0015) < 1e-12);
  assert.equal(session.costUsd(), 0.0035);
});

test("a failed question's cost isn't charged to the next answer", async () => {
  const { agent, session } = setup();
  const first = session.ask("One");
  await tick();
  const check = assert.rejects(first);
  await agent.emit({ type: "result", subtype: "error_during_execution", is_error: true, total_cost_usd: 0.001, errors: ["Overloaded"], permission_denials: [] });
  await check;
  const second = session.ask("Two");
  await tick();
  await agent.emit(success("2", 0.003));
  assert.ok(Math.abs(((await second).stats?.costUsd ?? 0) - 0.002) < 1e-12);
});

test("when the engine's running total starts again from nothing, as after /clear, each answer still gets its own cost", async () => {
  const { agent, session } = setup();
  const costs: (number | null | undefined)[] = [];
  for (const [question, total] of [["One", 0.002], ["/clear", 0], ["Two", 0.003], ["Three", 0.0045], ["Four, after the engine started again", 0.001]] as const) {
    const answer = session.ask(question);
    await tick();
    await agent.emit(success(question, total));
    costs.push((await answer).stats?.costUsd);
  }
  [0.002, 0, 0.003, 0.0015, 0.001].forEach((expected, index) => assert.ok(Math.abs((costs[index] ?? -1) - expected) < 1e-12, `answer ${index + 1}: ${costs[index]}`));
  assert.ok(Math.abs((session.costUsd() ?? 0) - 0.0075) < 1e-12);
});

const request = (input: number, cacheRead = 0) => ({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "msg", usage: usage(input, 1, 0, cacheRead) } } });
const requestEnd = (output: number, more: Record<string, number> = {}) => ({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: output, ...more } } });

test("in a picked-up chat, the earlier runs' cost that the engine carries into its running total isn't counted again", async () => {
  const { agent, session } = setup({ savedChats: "/data/chats/agent-sdk" });
  const first = session.ask("One");
  await tick();
  await agent.emit(request(1000));
  await agent.emit(requestEnd(100));
  await agent.emit({ ...success("1", 0.25), usage: usage(1000, 100) });
  const firstCost = (1000 * 0.1 + 100 * 0.5) / 1_000_000;
  assert.ok(Math.abs(((await first).stats?.costUsd ?? 0) - firstCost) < 1e-12);
  const second = session.ask("Two");
  await tick();
  await agent.emit(success("2", 0.251));
  assert.ok(Math.abs(((await second).stats?.costUsd ?? 0) - 0.001) < 1e-12);
  assert.ok(Math.abs((session.costUsd() ?? 0) - (firstCost + 0.001)) < 1e-12);
});

test("a picked-up chat's first answer is priced request by request, so only a request over 100,000 tokens costs the long rate", async () => {
  const { agent, session } = setup({ savedChats: "/data/chats/agent-sdk" });
  const answer = session.ask("One");
  await tick();
  await agent.emit(request(0, 95_000));
  await agent.emit(requestEnd(50));
  await agent.emit(request(0, 105_000));
  await agent.emit(requestEnd(60));
  await agent.emit({ ...success("1", 0.5), usage: usage(0, 110, 0, 200_000) });
  const expected = (95_000 * 0.01 + 50 * 0.5) / 1_000_000 + (105_000 * 0.05 + 60 * 2.5) / 1_000_000;
  assert.ok(Math.abs(((await answer).stats?.costUsd ?? 0) - expected) < 1e-12);
});

test("a picked-up chat's first answer is priced from its whole usage when the engine streamed no request sizes", async () => {
  const { agent, session } = setup({ savedChats: "/data/chats/agent-sdk" });
  const answer = session.ask("One");
  await tick();
  await agent.emit(roundStart());
  await agent.emit({ ...success("1", 0.5), usage: usage(1000, 100, 300, 4000) });
  assert.ok(Math.abs(((await answer).stats?.costUsd ?? 0) - (1000 * 0.1 + 300 * 0.125 + 4000 * 0.01 + 100 * 0.5) / 1_000_000) < 1e-12);
});

test("in a picked-up chat with a model that has no prices, the cost is unknown; in a fresh one it's the engine's", async () => {
  const resumed = setup({ model: "claude-unknown", savedChats: "/data/chats/agent-sdk" });
  const answer = resumed.session.ask("One");
  await tick();
  await resumed.agent.emit({ ...success("1", 0.5), usage: usage(1000, 100) });
  assert.equal((await answer).stats?.costUsd, null);
  assert.equal(resumed.session.costUsd(), null);
  const fresh = setup({ model: "claude-unknown" });
  const other = fresh.session.ask("One");
  await tick();
  await fresh.agent.emit(success("1", 0.5));
  assert.equal((await other).stats?.costUsd, 0.5);
});

test("the engine's thinking isn't counted, and nothing is ever recovered", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Hello?");
  await tick();
  await agent.emit(success("Hi."));
  const stats = (await answer).stats;
  assert.equal(stats?.earlierThinkingBlocks, null);
  assert.equal(stats?.recovered, false);
});

test("an answer says whether Jarvis said something before his first tool, from the order the engine streamed them", async () => {
  const tool = (parent: string | null = null) => ({ type: "assistant", parent_tool_use_id: parent, message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: {} }] } });
  const run = async (...messages: object[]) => {
    const { agent, session } = setup();
    const answer = session.ask("Read it");
    await tick();
    await agent.emit(...messages, success("Done."));
    return (await answer).stats?.spokeFirst;
  };
  assert.equal(await run(textDelta("Let me check."), tool()), true);
  assert.equal(await run(textDelta("  "), tool(), textDelta("After."), tool()), false);
  assert.equal(await run(tool(), textDelta("After.")), false);
  assert.equal(await run({ type: "stream_event", parent_tool_use_id: "toolu_9", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "A helper spoke." } } }, tool()), false);
  assert.equal(await run(textDelta("Hi.")), null);
});

test("a picked-up chat's first answer is priced from its whole usage when the engine streamed no requests at all", async () => {
  const { agent, session } = setup({ savedChats: "/data/chats/agent-sdk" });
  const answer = session.ask("One");
  await tick();
  await agent.emit({ ...success("1", 0.5), usage: usage(1000, 100) });
  assert.ok(Math.abs(((await answer).stats?.costUsd ?? 0) - (1000 * 0.1 + 100 * 0.5) / 1_000_000) < 1e-12);
});

test("in a picked-up chat that's cleared, later answers still get their own cost", async () => {
  const { agent, session } = setup({ savedChats: "/data/chats/agent-sdk" });
  const costs: (number | null | undefined)[] = [];
  const first = session.ask("One");
  await tick();
  await agent.emit({ ...success("1", 0.25), usage: usage(1000, 100) });
  costs.push((await first).stats?.costUsd);
  for (const [question, total] of [["/clear", 0], ["Two", 0.004]] as const) {
    const answer = session.ask(question);
    await tick();
    await agent.emit(success(question, total));
    costs.push((await answer).stats?.costUsd);
  }
  [(1000 * 0.1 + 100 * 0.5) / 1_000_000, 0, 0.004].forEach((expected, index) => assert.ok(Math.abs((costs[index] ?? -1) - expected) < 1e-12, `answer ${index + 1}: ${costs[index]}`));
});

test("a request's end that reports no input or cache tokens leaves the sizes from its start alone", async () => {
  const { agent, session } = setup({ savedChats: "/data/chats/agent-sdk" });
  const answer = session.ask("One");
  await tick();
  for (const _ of [1, 2]) {
    await agent.emit(request(10, 60_000));
    await agent.emit(requestEnd(50, { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }));
  }
  await agent.emit({ ...success("1", 0.5), usage: usage(20, 100, 0, 120_000) });
  assert.ok(Math.abs(((await answer).stats?.costUsd ?? 0) - 2 * (10 * 0.1 + 60_000 * 0.01 + 50 * 0.5) / 1_000_000) < 1e-12);
});

test("when the requests the engine streamed don't add up to its answer's tokens, as when it retried without streaming, the answer's own tokens are priced", async () => {
  const { agent, session } = setup({ savedChats: "/data/chats/agent-sdk" });
  const answer = session.ask("One");
  await tick();
  await agent.emit(request(60_000));
  await agent.emit({ ...success("1", 0.5), usage: usage(60_000, 400) });
  assert.ok(Math.abs(((await answer).stats?.costUsd ?? 0) - (60_000 * 0.1 + 400 * 0.5) / 1_000_000) < 1e-12);
});

test("an error whose running total comes back as nothing, as after an engine crash, doesn't charge the next answer for the whole chat", async () => {
  const { agent, session } = setup();
  const first = session.ask("One");
  await tick();
  await agent.emit(success("1", 0.004));
  await first;
  const second = session.ask("Two");
  await tick();
  const check = assert.rejects(second);
  await agent.emit({ type: "result", subtype: "error_during_execution", is_error: true, total_cost_usd: 0, errors: ["Crashed"], permission_denials: [] });
  await check;
  const third = session.ask("Three");
  await tick();
  await agent.emit(success("3", 0.005));
  assert.ok(Math.abs(((await third).stats?.costUsd ?? 0) - 0.001) < 1e-12);
  assert.ok(Math.abs((session.costUsd() ?? 0) - 0.005) < 1e-12);
});

test("an answer also reports its last request of Jarvis's own, and leaves it unknown when that request reported no tokens", async () => {
  const start = (parent: string | null, input: number) => ({ type: "stream_event", parent_tool_use_id: parent, event: { type: "message_start", message: { id: "msg", usage: usage(input, 1) } } });
  const sized = setup();
  const answer = sized.session.ask("What's in my notes?");
  await tick();
  await sized.agent.emit(start(null, 9000), start(null, 6000), start("toolu_9", 50_000), success("Done."));
  assert.equal((await answer).stats?.lastRequestTokens, 6000);
  const unsized = setup();
  const other = unsized.session.ask("Hello?");
  await tick();
  await unsized.agent.emit(start(null, 9000), roundStart(), success("Hi."));
  assert.equal((await other).stats?.lastRequestTokens, null);
});

const hub = { command: "/usr/local/bin/node", args: ["/mcp/dist/server.js"], token: "hub-token" };

test("with the hub's tools, the engine starts the hub's MCP server read-only, loads its tools up front, and may use only its eight read tools, by name, with nothing asked; the built-in tools don't change", () => {
  const options = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin" }, hub });
  assert.deepEqual(options.mcpServers, { hub: { type: "stdio", command: "/usr/local/bin/node", args: ["/mcp/dist/server.js"], env: { MCP_ACTIONS: "off" }, alwaysLoad: true } });
  assert.deepEqual(options.allowedTools, ["mcp__hub__get_status", "mcp__hub__get_alerts", "mcp__hub__get_features", "mcp__hub__get_downloads", "mcp__hub__get_library", "mcp__hub__get_wifi_reconnects", "mcp__hub__get_backup", "mcp__hub__get_watchers", "mcp__hub__get_expiries", "mcp__hub__get_doctor", "mcp__hub__get_deal_status", "mcp__hub__get_deal_searches", "mcp__hub__get_catch_up", "mcp__hub__get_deal_matches", "mcp__hub__get_deal_listing", "mcp__hub__get_deal_hidden"]);
  assert.equal("hooks" in options, false);
  assert.deepEqual(options.tools, ["Read", "Grep", "Glob"]);
  assert.equal(options.strictMcpConfig, true);
  assert.equal(options.permissionMode, "dontAsk");
});

test("the token reaches the hub's MCP server only through the engine's environment, never in the server's settings, which the engine puts on a command line", () => {
  const options = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin", API_TOKEN: "old-token" }, hub });
  assert.deepEqual(options.env, { PATH: "/usr/bin", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", API_TOKEN: "hub-token" });
  assert.ok(!JSON.stringify({ ...options, env: undefined }).includes("-token"));
});

test("without the hub's tools, the engine's environment has no API token, even one Jarvis was started with", () => {
  const options = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin", API_TOKEN: "hub-token" } });
  assert.deepEqual(options.env, { PATH: "/usr/bin", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" });
  assert.ok(!JSON.stringify(options).includes("hub-token"));
});

test("without the hub's tools, no MCP server is started and nothing extra is allowed", () => {
  const options = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: {} });
  assert.equal("mcpServers" in options, false);
  assert.equal("allowedTools" in options, false);
});

const hubListed = ["Read", "mcp__hub__get_status", "mcp__hub__get_alerts"];

function initWith(servers: { name: string; status: string }[], tools: string[] = hubListed): SDKMessage {
  return { ...init, tools, mcp_servers: servers } as unknown as SDKMessage;
}

test("if the hub's MCP server didn't start, or started with no tools, the answer it was found during says so, once; still starting waits for the next word", async () => {
  const hubIs = (status: string, tools?: string[]) => initWith([{ name: "other", status: "failed" }, { name: "hub", status }], tools);
  const cases: [string, SDKMessage[], SDKMessage[], string[], string[]][] = [
    ["failed", [hubIs("failed")], [hubIs("failed")], [hubProblemNote("failed")], []],
    ["needs-auth", [hubIs("needs-auth")], [hubIs("failed")], [hubProblemNote("needs-auth")], []],
    ["connected", [hubIs("connected")], [hubIs("failed")], [], []],
    ["connected, no hub tools", [hubIs("connected", ["Read", "mcp__other__thing"])], [hubIs("connected")], [hubProblemNote("no tools listed")], []],
    ["not listed", [initWith([{ name: "other", status: "connected" }])], [hubIs("failed")], [hubProblemNote("missing")], []],
    ["pending, then connected", [hubIs("pending", ["Read"])], [hubIs("connected")], [], []],
    ["pending, then failed", [hubIs("pending", ["Read"])], [hubIs("failed")], [], [hubProblemNote("failed")]],
    ["pending, then failed in one answer", [hubIs("pending", ["Read"]), hubIs("failed")], [hubIs("failed")], [hubProblemNote("failed")], []],
  ];
  for (const [name, first, second, expectedFirst, expectedSecond] of cases) {
    const { agent, session } = setup({ hub });
    const notes: string[][] = [[], []];
    for (const [index, inits] of [first, second].entries()) {
      const answer = session.ask("Hello", { note: (note) => notes[index].push(note) });
      await tick();
      await agent.emit(...inits, success("Hi."));
      await answer;
    }
    assert.deepEqual(notes, [expectedFirst, expectedSecond], name);
  }
  const without: string[] = [];
  const plain = setup();
  const plainAnswer = plain.session.ask("Hello", { note: (note) => without.push(note) });
  await tick();
  await plain.agent.emit(initWith([{ name: "hub", status: "failed" }], ["Read"]), success("Hi."));
  await plainAnswer;
  assert.deepEqual(without, []);
  assert.equal(hubProblemNote("failed"), "The hub's tools didn't load (failed), so in this chat Jarvis can only read the brain");
});

test("a hub problem found before any question is said with the next answer", async () => {
  const notes: string[] = [];
  const { agent, session } = setup({ hub });
  await agent.emit(initWith([{ name: "hub", status: "failed" }]));
  assert.equal(notes.length, 0);
  const answer = session.ask("Hello", { note: (note) => notes.push(note) });
  await tick();
  await agent.emit(success("Hi."));
  await answer;
  assert.deepEqual(notes, [hubProblemNote("failed")]);
});

const actionsHub = { ...hub, actions: true };

function preToolUse(tool: string, toolInput: unknown = {}) {
  return { hook_event_name: "PreToolUse", tool_name: tool, tool_input: toolInput, tool_use_id: "toolu_1", session_id: "s", transcript_path: "/t", cwd: "/brain" } as unknown as Parameters<ReturnType<typeof actionHook>>[0];
}

const hookOptions = { signal: new AbortController().signal };

test("with the hub's actions on, the MCP server gets them, only the read tools are allowed by name, and a hook that blocks if it fails asks before each tool", () => {
  const options = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: {}, hub: actionsHub });
  assert.deepEqual(options.mcpServers, { hub: { type: "stdio", command: "/usr/local/bin/node", args: ["/mcp/dist/server.js"], env: { MCP_ACTIONS: "on" }, alwaysLoad: true } });
  assert.ok(options.allowedTools?.every((tool) => tool.startsWith("mcp__hub__get_")));
  assert.equal(options.allowedTools?.length, 16);
  const matchers = options.hooks?.PreToolUse ?? [];
  assert.equal(matchers.length, 1);
  assert.deepEqual({ ...matchers[0], hooks: matchers[0].hooks.length }, { hooks: 1, timeout: actionHookSeconds, onFailure: "block" });
  assert.equal(actionHookSeconds, 300);
  assert.equal(options.permissionMode, "dontAsk");
});

test("the hook asks only about the hub's actions, by their short name and with what the model gave them, and allows or refuses by the answer", async () => {
  for (const yes of [true, false]) {
    const asked: { tool: string; input: unknown }[] = [];
    const hook = actionHook(async (tool, input) => {
      asked.push({ tool, input });
      return yes;
    });
    assert.deepEqual(await hook(preToolUse("mcp__hub__stop_download", { hash: "abc" }), "toolu_1", hookOptions), {
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: yes ? "allow" : "deny", permissionDecisionReason: yes ? "Phil said yes" : notDoneNote },
    });
    for (const tool of ["mcp__hub__get_status", "Read", "mcp__other__scan_library", "scan_library", "mcp__hub__reboot"]) assert.deepEqual(await hook(preToolUse(tool), "toolu_2", hookOptions), {}, tool);
    assert.deepEqual(await hook({ ...preToolUse("mcp__hub__scan_library"), hook_event_name: "PostToolUse" } as unknown as Parameters<typeof hook>[0], "toolu_3", hookOptions), {});
    assert.deepEqual(asked, [{ tool: "stop_download", input: { hash: "abc" } }]);
  }
  const failing = actionHook(async () => Promise.reject(new Error("terminal gone")));
  assert.equal(((await failing(preToolUse("mcp__hub__scan_library"), "toolu_4", hookOptions)) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
});

test("the session's hook asks whoever is waiting on the current question, and refuses when no question is waiting or it can't ask", async () => {
  const { agent, session } = setup({ hub: actionsHub });
  const hook = agent.options()?.hooks?.PreToolUse?.[0].hooks[0];
  assert.ok(hook !== undefined);
  const decision = async () => ((await hook(preToolUse("mcp__hub__scan_library"), "toolu_1", hookOptions)) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision;
  assert.equal(await decision(), "deny");
  const asked: string[] = [];
  const answer = session.ask("Scan it", {
    confirm: async (tool) => {
      asked.push(tool);
      return true;
    },
  });
  await tick();
  assert.equal(await decision(), "allow");
  await agent.emit(success("Done."));
  await answer;
  const quiet = session.ask("Again");
  await tick();
  assert.equal(await decision(), "deny");
  await agent.emit(success("Done."));
  await quiet;
  assert.deepEqual(asked, ["scan_library"]);
});

test("with the look-up tool, the engine gets one more MCP server and may use its one tool, and still has no web tool of its own", () => {
  const web = lookUpServer(createLookUpTool({ helper: async () => Promise.reject(new Error("unused")), now: () => 0 }));
  const options = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin" }, web });
  assert.deepEqual(Object.keys(options.mcpServers ?? {}), ["web"]);
  assert.equal(options.mcpServers?.web, web);
  assert.deepEqual([web.type, web.name], ["sdk", "web"]);
  assert.deepEqual(options.allowedTools, ["mcp__web__look_up"]);
  assert.deepEqual(options.tools, ["Read", "Grep", "Glob"]);
  assert.equal("hooks" in options, false);
  assert.deepEqual([options.strictMcpConfig, options.permissionMode], [true, "dontAsk"]);
});

test("with the hub's tools and the look-up tool, both servers are there, the hub's tools come first, and only the hub's actions bring the yes hook", () => {
  const web = lookUpServer(createLookUpTool({ helper: async () => Promise.reject(new Error("unused")), now: () => 0 }));
  const both = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin" }, hub, web });
  assert.deepEqual(Object.keys(both.mcpServers ?? {}), ["hub", "web"]);
  assert.deepEqual(both.mcpServers?.hub, agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin" }, hub }).mcpServers?.hub);
  assert.deepEqual(both.allowedTools?.slice(-2), ["mcp__hub__get_deal_hidden", "mcp__web__look_up"]);
  assert.equal(both.allowedTools?.length, 17);
  assert.equal("hooks" in both, false);
  const acting = agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: { PATH: "/usr/bin" }, hub: { ...hub, actions: true }, web });
  assert.equal(acting.hooks?.PreToolUse?.length, 1);
  assert.equal("hooks" in agentOptions({ model: "m", system: "s", cwd: "/brain", now: () => 0, env: {}, web }), false);
});
