import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession } from "./agent.js";
import { answerCost, maxToolSteps, pricesPerMTok, startApiSession, type ApiSettings, type SendRequest } from "./api-session.js";
import type { BrainTools, ToolOutcome } from "./brain-tools.js";
import type { DirectAnswer, DirectRequest } from "./direct.js";

const settings: ApiSettings = { apiKey: "sk-ant-test-key", model: "claude-haiku-5-5", system: "Be brief.", maxTokens: 4000, timeoutMs: 120_000, now: () => 0 };

function reply(text: string, inputTokens = 100, outputTokens = 20): DirectAnswer {
  const content = text.trim() === "" ? [] : [{ type: "text" as const, text }];
  return { text, firstWordsMs: 300, totalMs: 900, inputTokens, outputTokens, content, stopReason: "end_turn" };
}

function recorder(answers: ((request: DirectRequest) => Promise<DirectAnswer>)[]) {
  const requests: DirectRequest[] = [];
  const send: SendRequest = (request) => {
    requests.push({ ...request, history: request.history?.map((turn) => ({ ...turn })) });
    const next = answers.shift();
    return next === undefined ? Promise.reject(new Error("No answer ready")) : next(request);
  };
  return { send, requests };
}

function hanging(request: DirectRequest): Promise<DirectAnswer> {
  return new Promise((_resolve, reject) => {
    request.signal?.addEventListener("abort", () => reject(new Error("Couldn't reach the API")));
  });
}

test("Haiku 5.5 is priced at $0.10 in and $0.50 out per million tokens, and five times that for prompts over 100,000 tokens", () => {
  assert.deepEqual(pricesPerMTok["claude-haiku-5-5"], { input: 0.1, output: 0.5, longPromptOver: 100_000, longInput: 0.5, longOutput: 2.5 });
});

test("an answer's cost uses the normal prices up to 100,000 prompt tokens", () => {
  const prices = pricesPerMTok["claude-haiku-5-5"];
  assert.ok(Math.abs(answerCost(prices, 100_000, 1000) - (100_000 * 0.1 + 1000 * 0.5) / 1_000_000) < 1e-12);
});

test("an answer's cost uses the long-prompt prices, for input and output, above 100,000 prompt tokens", () => {
  const prices = pricesPerMTok["claude-haiku-5-5"];
  assert.ok(Math.abs(answerCost(prices, 100_001, 1000) - (100_001 * 0.5 + 1000 * 2.5) / 1_000_000) < 1e-12);
});

test("a question goes to the API with the settings, the stop signal and thinking at its default", async () => {
  const { send, requests } = recorder([async () => reply("Hi.")]);
  await startApiSession(settings, send).ask("Hello?");
  const [request] = requests;
  assert.equal(request.apiKey, settings.apiKey);
  assert.equal(request.model, "claude-haiku-5-5");
  assert.equal(request.system, "Be brief.");
  assert.equal(request.question, "Hello?");
  assert.equal(request.maxTokens, 4000);
  assert.equal(request.timeoutMs, 120_000);
  assert.equal(request.thinkingOff, false);
  assert.equal(request.now, settings.now);
  assert.ok(request.signal instanceof AbortSignal);
  assert.deepEqual(request.history, []);
});

function clock(times: number[]): () => number {
  return () => times.shift() ?? 0;
}

test("the answer comes back with its timings, measured by the session from the question", async () => {
  const { send } = recorder([async () => reply("Hi.")]);
  const session = startApiSession({ ...settings, now: clock([1000, 1000, 2500]) }, send);
  assert.deepEqual(await session.ask("Hello?"), { text: "Hi.", firstWordsMs: 300, totalMs: 1500 });
});

test("he remembers the conversation: each question carries the turns before it", async () => {
  const { send, requests } = recorder([async () => reply("One."), async () => reply("Two."), async () => reply("Three.")]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  await session.ask("Second?");
  await session.ask("Third?");
  assert.deepEqual(requests[1].history, [
    { role: "user", content: "First?" },
    { role: "assistant", content: [{ type: "text", text: "One." }] },
  ]);
  assert.deepEqual(requests[2].history, [
    { role: "user", content: "First?" },
    { role: "assistant", content: [{ type: "text", text: "One." }] },
    { role: "user", content: "Second?" },
    { role: "assistant", content: [{ type: "text", text: "Two." }] },
  ]);
});

test("a failed question leaves no trace in the conversation", async () => {
  const { send, requests } = recorder([
    async () => {
      throw new Error("The API replied 529: Overloaded");
    },
    async () => reply("Hi."),
  ]);
  const session = startApiSession(settings, send);
  await assert.rejects(session.ask("Lost?"), { message: "The API replied 529: Overloaded" });
  await session.ask("Hello?");
  assert.deepEqual(requests[1].history, []);
});

test("an empty answer isn't added, since the API refuses empty turns", async () => {
  const { send, requests } = recorder([async () => reply("  "), async () => reply("Hi.")]);
  const session = startApiSession(settings, send);
  await session.ask("Think hard?");
  await session.ask("Hello?");
  assert.deepEqual(requests[1].history, []);
});

test("the conversation sent can't be changed afterwards by the session", async () => {
  const given: DirectRequest[] = [];
  const session = startApiSession(settings, async (request) => {
    given.push(request);
    return reply("Hi.");
  });
  await session.ask("First?");
  await session.ask("Second?");
  assert.deepEqual(given[0].history, []);
});

test("streamed text goes to the listener as it arrives", async () => {
  const heard: string[] = [];
  const { send } = recorder([
    async (request) => {
      request.onText?.("Hi ");
      request.onText?.("Phil.");
      return reply("Hi Phil.");
    },
  ]);
  await startApiSession(settings, send).ask("Hello?", { text: (delta) => heard.push(delta) });
  assert.deepEqual(heard, ["Hi ", "Phil."]);
});

test("a question without a listener still works", async () => {
  const { send } = recorder([
    async (request) => {
      request.onText?.("Hi.");
      return reply("Hi.");
    },
  ]);
  assert.equal((await startApiSession(settings, send).ask("Hello?")).text, "Hi.");
});

test("the tool listener is never called, because this engine has no tools yet", async () => {
  const tools: string[] = [];
  const { send } = recorder([async () => reply("Hi.")]);
  await startApiSession(settings, send).ask("Read index.md", { tool: (name) => tools.push(name) });
  assert.deepEqual(tools, []);
});

test("only one question at a time", async () => {
  const { send } = recorder([hanging, async () => reply("Hi.")]);
  const session = startApiSession(settings, send);
  const first = session.ask("First?");
  await assert.rejects(session.ask("Second?"), { message: "One question at a time" });
  session.close();
  await assert.rejects(first, { message: closedMessage });
});

test("the next question can go once the last has finished, even if it failed", async () => {
  const { send } = recorder([
    async () => {
      throw new Error("Overloaded");
    },
    async () => reply("Hi."),
  ]);
  const session = startApiSession(settings, send);
  await assert.rejects(session.ask("First?"));
  assert.equal((await session.ask("Second?")).text, "Hi.");
});

test("the cost adds up from the tokens each answer used", async () => {
  const { send } = recorder([async () => reply("One.", 1000, 200), async () => reply("Two.", 3000, 100)]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  await session.ask("Second?");
  const expected = (4000 * 0.1 + 300 * 0.5) / 1_000_000;
  assert.ok(Math.abs((session.costUsd() ?? 0) - expected) < 1e-12);
});

test("the cost is unknown before any answer, and for a model without prices", async () => {
  const { send } = recorder([async () => reply("Hi.")]);
  assert.equal(startApiSession(settings, send).costUsd(), null);
  const unpriced = startApiSession({ ...settings, model: "claude-unknown-1" }, send);
  await unpriced.ask("Hello?");
  assert.equal(unpriced.costUsd(), null);
});

test("a failed question adds nothing to the cost", async () => {
  const { send } = recorder([
    async () => {
      throw new Error("Overloaded");
    },
  ]);
  const session = startApiSession(settings, send);
  await assert.rejects(session.ask("Hello?"));
  assert.equal(session.costUsd(), null);
});

test("there's no engine start-up to time", () => {
  assert.equal(startApiSession(settings, recorder([]).send).readyMs(), null);
});

test("closing mid-answer stops the request and says it was closed", async () => {
  let stopped = false;
  const session = startApiSession(settings, (request) => {
    request.signal?.addEventListener("abort", () => {
      stopped = true;
    });
    return hanging(request);
  });
  const answer = session.ask("Hello?");
  session.close();
  await assert.rejects(answer, { message: closedMessage });
  assert.equal(stopped, true);
});

test("after closing, questions fail straight away without calling the API", async () => {
  const { send, requests } = recorder([async () => reply("Hi.")]);
  const session = startApiSession(settings, send);
  session.close();
  await assert.rejects(session.ask("Hello?"), { message: closedMessage });
  assert.equal(requests.length, 0);
});

test("the stop reason is empty while open and says closed afterwards", () => {
  const session = startApiSession(settings, recorder([]).send);
  assert.equal(session.stoppedReason(), null);
  session.close();
  assert.equal(session.stoppedReason(), closedMessage);
});

test("closing twice is harmless", () => {
  const session = startApiSession(settings, recorder([]).send);
  session.close();
  assert.doesNotThrow(() => session.close());
  assert.equal(session.stoppedReason(), closedMessage);
});

function toolReply(calls: { id: string; name: string; input: unknown }[], text = ""): DirectAnswer {
  const content = [...(text === "" ? [] : [{ type: "text" as const, text }]), ...calls.map((call) => ({ type: "tool_use" as const, ...call }))];
  return { text, firstWordsMs: text === "" ? null : 100, totalMs: 500, inputTokens: 200, outputTokens: 30, content, stopReason: "tool_use" };
}

function fakeTools(outcomes: Record<string, ToolOutcome> = {}) {
  const runs: { name: string; input: unknown }[] = [];
  const tools: BrainTools = {
    definitions: [{ name: "read_file", description: "Read a file.", input_schema: { type: "object" } }],
    async run(name, input) {
      runs.push({ name, input });
      return outcomes[JSON.stringify(input)] ?? { content: `contents of ${JSON.stringify(input)}`, isError: false };
    },
  };
  return { tools, runs };
}

const readIndex = { id: "toolu_1", name: "read_file", input: { path: "index.md" } };

test("with tools, they're sent with every request and thinking is off", async () => {
  const { tools } = fakeTools();
  const { send, requests } = recorder([async () => toolReply([readIndex]), async () => reply("It covers your life.")]);
  await startApiSession({ ...settings, tools }, send).ask("What's in my notes?");
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.deepEqual(request.tools, tools.definitions);
    assert.equal(request.thinkingOff, true);
  }
});

test("without tools, none are sent and thinking stays at its default", async () => {
  const { send, requests } = recorder([async () => reply("Hi.")]);
  await startApiSession(settings, send).ask("Hello?");
  assert.equal(requests[0].tools, undefined);
  assert.equal(requests[0].thinkingOff, false);
});

test("a tool request is run, and its result goes back with the turns so far", async () => {
  const { tools, runs } = fakeTools();
  const { send, requests } = recorder([async () => toolReply([readIndex], "Let me check."), async () => reply("It covers your life.")]);
  const answer = await startApiSession({ ...settings, tools }, send).ask("What's in my notes?");
  assert.equal(answer.text, "It covers your life.");
  assert.deepEqual(runs, [{ name: "read_file", input: { path: "index.md" } }]);
  assert.deepEqual(requests[1].history, [
    { role: "user", content: "What's in my notes?" },
    { role: "assistant", content: [{ type: "text", text: "Let me check." }, { type: "tool_use", ...readIndex }] },
  ]);
  assert.deepEqual(requests[1].question, [{ type: "tool_result", tool_use_id: "toolu_1", content: 'contents of {"path":"index.md"}' }]);
});

test("several tool requests in one reply are all run, in order, and answered together", async () => {
  const { tools, runs } = fakeTools();
  const second = { id: "toolu_2", name: "read_file", input: { path: "areas/jarvis.md" } };
  const { send, requests } = recorder([async () => toolReply([readIndex, second]), async () => reply("Done.")]);
  await startApiSession({ ...settings, tools }, send).ask("Read both");
  assert.deepEqual(
    runs.map((run) => run.input),
    [{ path: "index.md" }, { path: "areas/jarvis.md" }],
  );
  assert.deepEqual(
    (requests[1].question as { tool_use_id: string }[]).map((result) => result.tool_use_id),
    ["toolu_1", "toolu_2"],
  );
});

test("a refused or failed tool goes back marked as an error, and the question carries on", async () => {
  const { tools } = fakeTools({ '{"path":"../secret"}': { content: "That's outside the brain, so it can't be read.", isError: true } });
  const outside = { id: "toolu_9", name: "read_file", input: { path: "../secret" } };
  const { send, requests } = recorder([async () => toolReply([outside]), async () => reply("I can only read your notes.")]);
  const answer = await startApiSession({ ...settings, tools }, send).ask("Read ../secret");
  assert.equal(answer.text, "I can only read your notes.");
  assert.deepEqual(requests[1].question, [{ type: "tool_result", tool_use_id: "toolu_9", content: "That's outside the brain, so it can't be read.", is_error: true }]);
});

test("a tool that worked isn't marked as an error", async () => {
  const { tools } = fakeTools();
  const { send, requests } = recorder([async () => toolReply([readIndex]), async () => reply("Done.")]);
  await startApiSession({ ...settings, tools }, send).ask("Read it");
  assert.equal("is_error" in (requests[1].question as object[])[0], false);
});

test("the listener hears each tool before it runs, with its input", async () => {
  const events: string[] = [];
  const tools: BrainTools = {
    definitions: [],
    async run(name) {
      events.push(`run ${name}`);
      return { content: "ok", isError: false };
    },
  };
  const { send } = recorder([async () => toolReply([readIndex]), async () => reply("Done.")]);
  await startApiSession({ ...settings, tools }, send).ask("Read it", { tool: (name, input) => events.push(`heard ${name} ${JSON.stringify(input)}`) });
  assert.deepEqual(events, ['heard read_file {"path":"index.md"}', "run read_file"]);
});

test("the whole exchange, tool requests and results included, is kept for the next question", async () => {
  const { tools } = fakeTools();
  const { send, requests } = recorder([async () => toolReply([readIndex]), async () => reply("It covers your life."), async () => reply("Yes.")]);
  const session = startApiSession({ ...settings, tools }, send);
  await session.ask("What's in my notes?");
  await session.ask("Anything else?");
  assert.deepEqual(requests[2].history, [
    { role: "user", content: "What's in my notes?" },
    { role: "assistant", content: [{ type: "tool_use", ...readIndex }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: 'contents of {"path":"index.md"}' }] },
    { role: "assistant", content: [{ type: "text", text: "It covers your life." }] },
  ]);
});

test("it gives up after the most rounds of tool use, and keeps nothing from that question", async () => {
  const { tools, runs } = fakeTools();
  const forever = Array.from({ length: maxToolSteps + 1 }, () => async () => toolReply([readIndex]));
  const { send, requests } = recorder([...forever, async () => reply("Hi.")]);
  const session = startApiSession({ ...settings, tools }, send);
  await assert.rejects(session.ask("Loop?"), { message: `Gave up after ${maxToolSteps} rounds of tool use` });
  assert.equal(runs.length, maxToolSteps);
  assert.equal(requests.length, maxToolSteps);
  assert.equal(maxToolSteps, 10);
});

test("after giving up, the next question starts from a clean conversation", async () => {
  const { tools } = fakeTools();
  const forever = Array.from({ length: maxToolSteps }, () => async () => toolReply([readIndex]));
  const { send, requests } = recorder([...forever, async () => reply("Hi.")]);
  const session = startApiSession({ ...settings, tools }, send);
  await assert.rejects(session.ask("Loop?"));
  await session.ask("Hello?");
  assert.deepEqual(requests[maxToolSteps].history, []);
});

test("every round's tokens count towards the cost", async () => {
  const { tools } = fakeTools();
  const { send } = recorder([async () => toolReply([readIndex]), async () => reply("Done.", 1000, 100)]);
  const session = startApiSession({ ...settings, tools }, send);
  await session.ask("Read it");
  const expected = (200 * 0.1 + 30 * 0.5 + 1000 * 0.1 + 100 * 0.5) / 1_000_000;
  assert.ok(Math.abs((session.costUsd() ?? 0) - expected) < 1e-12);
});

test("first words are timed from the question, even when they come in a later round", async () => {
  const { tools } = fakeTools();
  const { send } = recorder([async () => toolReply([readIndex]), async () => ({ ...reply("Done."), firstWordsMs: 200 })]);
  const session = startApiSession({ ...settings, tools, now: clock([0, 0, 1500, 2000]) }, send);
  assert.deepEqual(await session.ask("Read it"), { text: "Done.", firstWordsMs: 1700, totalMs: 2000 });
});

test("first words from the text before a tool count, not the later answer", async () => {
  const { tools } = fakeTools();
  const { send } = recorder([async () => toolReply([readIndex], "Let me check."), async () => ({ ...reply("Done."), firstWordsMs: 200 })]);
  const session = startApiSession({ ...settings, tools, now: clock([0, 0, 1500, 2000]) }, send);
  assert.equal((await session.ask("Read it")).firstWordsMs, 100);
});

test("closing while a tool runs stops the question without another request", async () => {
  let session: AgentSession | null = null;
  const tools: BrainTools = {
    definitions: [],
    async run() {
      session?.close();
      return { content: "ok", isError: false };
    },
  };
  const { send, requests } = recorder([async () => toolReply([readIndex]), async () => reply("Done.")]);
  session = startApiSession({ ...settings, tools }, send);
  await assert.rejects(session.ask("Read it"), { message: closedMessage });
  assert.equal(requests.length, 1);
});

test("closing during the first of two tools stops before the second runs", async () => {
  let session: AgentSession | null = null;
  const ran: string[] = [];
  const tools: BrainTools = {
    definitions: [],
    async run(_name, input) {
      ran.push(JSON.stringify(input));
      session?.close();
      return { content: "ok", isError: false };
    },
  };
  const second = { id: "toolu_2", name: "read_file", input: { path: "areas/jarvis.md" } };
  const { send } = recorder([async () => toolReply([readIndex, second])]);
  session = startApiSession({ ...settings, tools }, send);
  await assert.rejects(session.ask("Read both"), { message: closedMessage });
  assert.deepEqual(ran, ['{"path":"index.md"}']);
});

test("a tool that throws ends the question with its error and keeps nothing", async () => {
  const tools: BrainTools = {
    definitions: [],
    async run() {
      throw new Error("Disk on fire");
    },
  };
  const { send, requests } = recorder([async () => toolReply([readIndex]), async () => reply("Hi.")]);
  const session = startApiSession({ ...settings, tools }, send);
  await assert.rejects(session.ask("Read it"), { message: "Disk on fire" });
  await session.ask("Hello?");
  assert.deepEqual(requests[1].history, []);
});

for (const stopReason of ["max_tokens", "end_turn", null]) {
  test(`a tool request that ends with "${stopReason}" instead of "tool_use" is cut off, and kept out of the conversation`, async () => {
    const { tools, runs } = fakeTools();
    const { send, requests } = recorder([async () => ({ ...toolReply([readIndex], "Let me check."), stopReason }), async () => reply("Hi.")]);
    const session = startApiSession({ ...settings, tools }, send);
    await assert.rejects(session.ask("Read it"), { message: "The answer was cut off part-way through using a tool" });
    assert.deepEqual(runs, []);
    await session.ask("Hello?");
    assert.deepEqual(requests[1].history, []);
  });
}

test("a tool request is cut off when the session has no tools to run it", async () => {
  const { send } = recorder([async () => toolReply([readIndex])]);
  await assert.rejects(startApiSession(settings, send).ask("Read it"), { message: "The answer was cut off part-way through using a tool" });
});
