import assert from "node:assert/strict";
import { test } from "node:test";
import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { agentOptions, createInputQueue, startAgentSession, userMessage, type AgentSettings, type StartAgent } from "./agent.js";

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

function setup() {
  let time = 1000;
  const clock = {
    set(value: number) {
      time = value;
    },
  };
  const settings: AgentSettings = { model: "claude-haiku-5-5", system: "Be brief.", cwd: "/brain", now: () => time };
  const agent = fakeAgent();
  const session = startAgentSession(agent.start, settings);
  return { agent, session, clock, settings };
}

test("the engine gets only the Read tool, refuses anything else, and loads no settings files or MCP servers", () => {
  assert.deepEqual(agentOptions({ model: "claude-haiku-5-5", system: "Be brief.", cwd: "/brain", now: () => 0 }), {
    model: "claude-haiku-5-5",
    cwd: "/brain",
    systemPrompt: "Be brief.",
    tools: ["Read"],
    permissionMode: "dontAsk",
    settingSources: [],
    persistSession: false,
    strictMcpConfig: true,
    includePartialMessages: true,
  });
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
  assert.deepEqual(await answer, { text: "Hi Phil.", firstWordsMs: 600, totalMs: 1400 });
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
  assert.deepEqual(await answer, { text: "Hello", firstWordsMs: null, totalMs: 700 });
});

test("each question is timed from its own start", async () => {
  const { agent, session, clock } = setup();
  clock.set(0);
  const first = session.ask("One");
  await tick();
  clock.set(1000);
  await agent.emit(textDelta("1"), success("1"));
  assert.deepEqual(await first, { text: "1", firstWordsMs: 1000, totalMs: 1000 });
  clock.set(5000);
  const second = session.ask("Two");
  await tick();
  clock.set(5300);
  await agent.emit(textDelta("2"));
  clock.set(5500);
  await agent.emit(success("2"));
  assert.deepEqual(await second, { text: "2", firstWordsMs: 300, totalMs: 500 });
  assert.equal(agent.sent.length, 2);
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

test("a refused tool call fails the question, even when the answer looks fine", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Read /app/.env");
  await tick();
  const check = assert.rejects(answer, { message: "Refused: Read" });
  await agent.emit({ ...success("I can't read that file."), permission_denials: [{ tool_name: "Read", tool_use_id: "toolu_1", tool_input: { file_path: "/app/.env" } }] });
  await check;
});

test("every refused tool is named", async () => {
  const { agent, session } = setup();
  const answer = session.ask("Do things");
  await tick();
  const check = assert.rejects(answer, { message: "Refused: Read, Bash" });
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