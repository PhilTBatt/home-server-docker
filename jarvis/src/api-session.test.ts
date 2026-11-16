import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession } from "./agent.js";
import { answerCost, echoed, hasVisibleContent, maxToolSteps, pricesPerMTok, startApiSession, thinkingBlocksIn, withoutThinking, type ApiSettings, type SendRequest } from "./api-session.js";
import type { BrainTools, ToolOutcome } from "./brain-tools.js";
import type { DirectAnswer, DirectRequest } from "./direct.js";

const settings: ApiSettings = { apiKey: "sk-ant-test-key", model: "claude-haiku-5-5", system: "Be brief.", maxTokens: 4000, timeoutMs: 120_000, now: () => 0 };

function reply(text: string, inputTokens = 100, outputTokens = 20): DirectAnswer {
  const content = text.trim() === "" ? [] : [{ type: "text" as const, text }];
  return { text, firstWordsMs: 300, totalMs: 900, inputTokens, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens, content, stopReason: "end_turn" };
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

test("Haiku 5.5 is priced at $0.10 in, $0.125 to write the cache, $0.01 to read it and $0.50 out per million tokens, and five times that for prompts over 100,000 tokens", () => {
  assert.deepEqual(pricesPerMTok["claude-haiku-5-5"], {
    input: 0.1,
    cacheWrite: 0.125,
    cacheRead: 0.01,
    output: 0.5,
    longPromptOver: 100_000,
    longInput: 0.5,
    longCacheWrite: 0.625,
    longCacheRead: 0.05,
    longOutput: 2.5,
  });
});

test("cache writes and reads are priced on their own", () => {
  const prices = pricesPerMTok["claude-haiku-5-5"];
  assert.ok(Math.abs(answerCost(prices, { input: 1000, cacheWrite: 3000, cacheRead: 40_000, output: 200 }) - (1000 * 0.1 + 3000 * 0.125 + 40_000 * 0.01 + 200 * 0.5) / 1_000_000) < 1e-12);
});

test("cached tokens count towards the 100,000-token long-prompt line", () => {
  const prices = pricesPerMTok["claude-haiku-5-5"];
  assert.ok(Math.abs(answerCost(prices, { input: 1, cacheWrite: 0, cacheRead: 100_000, output: 100 }) - (1 * 0.5 + 100_000 * 0.05 + 100 * 2.5) / 1_000_000) < 1e-12);
  assert.ok(Math.abs(answerCost(prices, { input: 1, cacheWrite: 100_000, cacheRead: 0, output: 100 }) - (1 * 0.5 + 100_000 * 0.625 + 100 * 2.5) / 1_000_000) < 1e-12);
  assert.ok(Math.abs(answerCost(prices, { input: 0, cacheWrite: 50_000, cacheRead: 50_000, output: 100 }) - (50_000 * 0.125 + 50_000 * 0.01 + 100 * 0.5) / 1_000_000) < 1e-12);
});

test("an answer's cost uses the normal prices up to 100,000 prompt tokens", () => {
  const prices = pricesPerMTok["claude-haiku-5-5"];
  assert.ok(Math.abs(answerCost(prices, { input: 100_000, cacheWrite: 0, cacheRead: 0, output: 1000 }) - (100_000 * 0.1 + 1000 * 0.5) / 1_000_000) < 1e-12);
});

test("an answer's cost uses the long-prompt prices, for input and output, above 100,000 prompt tokens", () => {
  const prices = pricesPerMTok["claude-haiku-5-5"];
  assert.ok(Math.abs(answerCost(prices, { input: 100_001, cacheWrite: 0, cacheRead: 0, output: 1000 }) - (100_001 * 0.5 + 1000 * 2.5) / 1_000_000) < 1e-12);
});

test("a question goes to the API with the settings, the stop signal, thinking at its default and caching on", async () => {
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
  assert.equal(request.cache, true);
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
  const { text, firstWordsMs, totalMs } = await session.ask("Hello?");
  assert.deepEqual({ text, firstWordsMs, totalMs }, { text: "Hi.", firstWordsMs: 300, totalMs: 1500 });
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
  return { text, firstWordsMs: text === "" ? null : 100, totalMs: 500, inputTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 30, content, stopReason: "tool_use" };
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

test("with tools, they're sent with every request and thinking stays at its default", async () => {
  const { tools } = fakeTools();
  const { send, requests } = recorder([async () => toolReply([readIndex]), async () => reply("It covers your life.")]);
  await startApiSession({ ...settings, tools }, send).ask("What's in my notes?");
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.deepEqual(request.tools, tools.definitions);
    assert.equal(request.thinkingOff, false);
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
  const { text, firstWordsMs, totalMs } = await session.ask("Read it");
  assert.deepEqual({ text, firstWordsMs, totalMs }, { text: "Done.", firstWordsMs: 1700, totalMs: 2000 });
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


test("a turn with no thinking goes back without blank text, which the API refuses", () => {
  assert.deepEqual(
    echoed([
      { type: "text", text: "  " },
      { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } },
      { type: "text", text: "" },
    ]),
    [{ type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } }],
  );
});

test("a turn with thinking goes back exactly, blank text and all, so its signatures stay valid", () => {
  const withThinking = [
    { type: "thinking", thinking: "Hmm.", signature: "sig1" },
    { type: "text", text: "" },
    { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } },
  ];
  assert.deepEqual(echoed(withThinking), withThinking);
  const withRedacted = [{ type: "redacted_thinking", data: "abc" }, { type: "text", text: " " }];
  assert.deepEqual(echoed(withRedacted), withRedacted);
});

test("inside a question, a turn with thinking is sent back exactly with the tool results", async () => {
  const { tools } = fakeTools();
  const thinkingTurn = [
    { type: "thinking", thinking: "Index first.", signature: "sig1" },
    { type: "text", text: "\n\n" },
    { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } },
  ];
  const { send, requests } = recorder([async () => ({ ...toolReply([readIndex]), content: thinkingTurn }), async () => reply("It covers your life.")]);
  await startApiSession({ ...settings, tools }, send).ask("What's in my notes?");
  assert.deepEqual(requests[1].history, [
    { role: "user", content: "What's in my notes?" },
    { role: "assistant", content: thinkingTurn },
  ]);
});


const thinking = (text: string) => ({ type: "thinking" as const, thinking: text, signature: `sig-${text}` });

function thoughtful(text: string, thought = "Hmm.", inputTokens = 100, outputTokens = 20): DirectAnswer {
  return { ...reply(text, inputTokens, outputTokens), content: [thinking(thought), { type: "text", text }] };
}

function rejected(message = "The API replied 400: messages: text content blocks must contain non-whitespace text") {
  return async (): Promise<DirectAnswer> => {
    throw new Error(message);
  };
}

test("an answer reports its rounds, tool uses, tokens and cost", async () => {
  const { tools } = fakeTools();
  const { send } = recorder([async () => toolReply([readIndex]), async () => reply("Done.", 1000, 100)]);
  const answer = await startApiSession({ ...settings, tools }, send).ask("Read it");
  assert.equal(answer.stats?.rounds, 2);
  assert.equal(answer.stats?.toolUses, 1);
  assert.equal(answer.stats?.inputTokens, 1200);
  assert.equal(answer.stats?.outputTokens, 130);
  assert.ok(Math.abs((answer.stats?.costUsd ?? 0) - (1200 * 0.1 + 130 * 0.5) / 1_000_000) < 1e-12);
  assert.equal(answer.stats?.recovered, false);
  assert.equal(answer.stats?.earlierThinkingBlocks, 0);
});

test("each answer's cost is its own, while the session's cost is the running total", async () => {
  const { send } = recorder([async () => reply("One.", 1000, 0), async () => reply("Two.", 2000, 0)]);
  const session = startApiSession(settings, send);
  const first = await session.ask("First?");
  const second = await session.ask("Second?");
  assert.ok(Math.abs((first.stats?.costUsd ?? 0) - 0.0001) < 1e-12);
  assert.ok(Math.abs((second.stats?.costUsd ?? 0) - 0.0002) < 1e-12);
  assert.ok(Math.abs((session.costUsd() ?? 0) - 0.0003) < 1e-12);
});

test("an answer's cost is unknown for a model without prices", async () => {
  const { send } = recorder([async () => reply("Hi.")]);
  const answer = await startApiSession({ ...settings, model: "claude-unknown-1" }, send).ask("Hello?");
  assert.equal(answer.stats?.costUsd, null);
});

test("keeping thinking saves each answer exactly, thinking and all, and counts it on the next question", async () => {
  const { send, requests } = recorder([async () => thoughtful("One."), async () => thoughtful("Two.", "Again.")]);
  const session = startApiSession({ ...settings, thinkingHistory: "keep" }, send);
  await session.ask("First?");
  const second = await session.ask("Second?");
  assert.deepEqual(requests[1].history, [
    { role: "user", content: "First?" },
    { role: "assistant", content: [thinking("Hmm."), { type: "text", text: "One." }] },
  ]);
  assert.equal(second.stats?.earlierThinkingBlocks, 1);
});

test("keeping thinking is the default", async () => {
  const { send, requests } = recorder([async () => thoughtful("One."), async () => reply("Two.")]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  await session.ask("Second?");
  assert.equal(thinkingBlocksIn(requests[1].history ?? []), 1);
});

test("dropping thinking keeps the answers and file reads but none of the thinking or blank text", async () => {
  const { tools } = fakeTools();
  const toolTurn = [thinking("Index first."), { type: "text", text: "\n\n" }, { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } }];
  const { send, requests } = recorder([async () => ({ ...toolReply([readIndex]), content: toolTurn }), async () => thoughtful("It covers your life."), async () => reply("Yes.")]);
  const session = startApiSession({ ...settings, tools, thinkingHistory: "drop" }, send);
  await session.ask("What's in my notes?");
  const next = await session.ask("Anything else?");
  assert.deepEqual(requests[2].history, [
    { role: "user", content: "What's in my notes?" },
    { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: 'contents of {"path":"index.md"}' }] },
    { role: "assistant", content: [{ type: "text", text: "It covers your life." }] },
  ]);
  assert.equal(next.stats?.earlierThinkingBlocks, 0);
});

test("dropping thinking still sends it back within a question, while tools are being used", async () => {
  const { tools } = fakeTools();
  const toolTurn = [thinking("Index first."), { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } }];
  const { send, requests } = recorder([async () => ({ ...toolReply([readIndex]), content: toolTurn }), async () => reply("Done.")]);
  await startApiSession({ ...settings, tools, thinkingHistory: "drop" }, send).ask("Read it");
  assert.deepEqual(requests[1].history?.[1], { role: "assistant", content: toolTurn });
});

for (const thinkingHistory of ["keep", "drop"] as const) {
  test(`an answer that's only thinking isn't saved (${thinkingHistory})`, async () => {
    const { send, requests } = recorder([async () => ({ ...reply(""), content: [thinking("Hmm."), { type: "text", text: " " }] }), async () => reply("Hi.")]);
    const session = startApiSession({ ...settings, thinkingHistory }, send);
    await session.ask("Think?");
    await session.ask("Hello?");
    assert.deepEqual(requests[1].history, []);
  });
}

test("if the API rejects a request that carries thinking, it's retried once without any thinking, and that sticks", async () => {
  const { send, requests } = recorder([async () => thoughtful("One."), rejected(), async () => reply("Two."), async () => reply("Three.")]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  let restarts = 0;
  const second = await session.ask("Second?", { restart: () => restarts++ });
  assert.equal(second.text, "Two.");
  assert.equal(second.stats?.recovered, true);
  assert.equal(second.stats?.rounds, 1);
  assert.equal(restarts, 0);
  assert.equal(requests[2].question, "Second?");
  assert.equal(thinkingBlocksIn(requests[1].history ?? []), 1);
  assert.deepEqual(requests[2].history, [
    { role: "user", content: "First?" },
    { role: "assistant", content: [{ type: "text", text: "One." }] },
  ]);
  const third = await session.ask("Third?");
  assert.equal(third.stats?.recovered, false);
  assert.equal(thinkingBlocksIn(requests[3].history ?? []), 0);
});

test("a rejection with no thinking to drop isn't retried", async () => {
  const { send, requests } = recorder([rejected(), async () => reply("Never.")]);
  await assert.rejects(startApiSession(settings, send).ask("Hello?"), { message: /^The API replied 400:/ });
  assert.equal(requests.length, 1);
});

test("other failures aren't retried, even with thinking in the conversation", async () => {
  const { send, requests } = recorder([async () => thoughtful("One."), rejected("The API replied 529: Overloaded"), async () => reply("Never.")]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  await assert.rejects(session.ask("Second?"), { message: "The API replied 529: Overloaded" });
  assert.equal(requests.length, 2);
  assert.equal(thinkingBlocksIn(requests[1].history ?? []), 1);
});

test("the retry happens once: a second rejection fails the question", async () => {
  const { send, requests } = recorder([async () => thoughtful("One."), rejected(), rejected("The API replied 400: something else"), async () => reply("Never.")]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  await assert.rejects(session.ask("Second?"), { message: "The API replied 400: something else" });
  assert.equal(requests.length, 3);
});

test("a rejection in the middle of using tools starts the question again, since a tool turn's thinking can't be dropped", async () => {
  const { tools, runs } = fakeTools();
  const toolTurn = [thinking("Index first."), { type: "text", text: "" }, { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } }];
  const { send, requests } = recorder([async () => thoughtful("One."), async () => ({ ...toolReply([readIndex]), content: toolTurn }), rejected(), async () => ({ ...toolReply([readIndex]), content: toolTurn }), async () => reply("Done.")]);
  const session = startApiSession({ ...settings, tools }, send);
  await session.ask("Hello?");
  let restarts = 0;
  const answer = await session.ask("Read it", { restart: () => restarts++ });
  assert.equal(answer.text, "Done.");
  assert.equal(answer.stats?.recovered, true);
  assert.equal(answer.stats?.rounds, 3);
  assert.equal(answer.stats?.toolUses, 2);
  assert.equal(restarts, 1);
  assert.equal(runs.length, 2);
  assert.equal(requests[3].question, "Read it");
  assert.deepEqual(requests[3].history, [
    { role: "user", content: "Hello?" },
    { role: "assistant", content: [{ type: "text", text: "One." }] },
  ]);
  assert.deepEqual(requests[4].history?.slice(2), [
    { role: "user", content: "Read it" },
    { role: "assistant", content: toolTurn },
  ]);
});

test("only one retry per question, even if the API rejects again further on", async () => {
  const { tools } = fakeTools();
  const toolTurn = [thinking("Index first."), { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } }];
  const toolRound = async () => ({ ...toolReply([readIndex]), content: toolTurn });
  const { send, requests } = recorder([toolRound, rejected(), toolRound, rejected("The API replied 400: again"), toolRound, async () => reply("Never.")]);
  await assert.rejects(startApiSession({ ...settings, tools }, send).ask("Read it"), { message: "The API replied 400: again" });
  assert.equal(requests.length, 4);
});

test("the next question can recover again: the limit is one retry per question, not per chat", async () => {
  const { send, requests } = recorder([async () => thoughtful("One."), rejected(), async () => thoughtful("Two."), rejected(), async () => reply("Three.")]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  assert.equal((await session.ask("Second?")).stats?.recovered, true);
  assert.equal((await session.ask("Third?")).stats?.recovered, true);
  assert.equal(requests.length, 5);
});

test("closing during a rejected request doesn't retry", async () => {
  let session: AgentSession | null = null;
  const { send, requests } = recorder([
    async () => thoughtful("One."),
    async () => {
      session?.close();
      throw new Error("The API replied 400: bad");
    },
    async () => reply("Never."),
  ]);
  session = startApiSession(settings, send);
  await session.ask("First?");
  await assert.rejects(session.ask("Second?"), { message: closedMessage });
  assert.equal(requests.length, 2);
});

test("withoutThinking leaves user turns and plain answers alone", () => {
  const turns = [
    { role: "user" as const, content: "Hi" },
    { role: "assistant" as const, content: "Plain text answer." },
    { role: "assistant" as const, content: [thinking("Hmm."), { type: "text" as const, text: "Kept." }, { type: "redacted_thinking" as const, data: "x" }] },
  ];
  assert.deepEqual(withoutThinking(turns), [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Plain text answer." },
    { role: "assistant", content: [{ type: "text", text: "Kept." }] },
  ]);
});

test("hasVisibleContent looks past thinking and blank text", () => {
  assert.equal(hasVisibleContent([thinking("Hmm."), { type: "text", text: "  " }]), false);
  assert.equal(hasVisibleContent([thinking("Hmm."), { type: "text", text: "Hi" }]), true);
  assert.equal(hasVisibleContent([{ type: "tool_use", id: "t", name: "read_file", input: {} }]), true);
  assert.equal(hasVisibleContent([]), false);
});


test("an answer's input counts cached tokens too, with the cache's share shown and priced on its own", async () => {
  const { tools } = fakeTools();
  const { send } = recorder([async () => ({ ...toolReply([readIndex]), inputTokens: 50, cacheWriteTokens: 2000, cacheReadTokens: 500 }), async () => ({ ...reply("Done.", 100, 40), cacheReadTokens: 3000 })]);
  const answer = await startApiSession({ ...settings, tools }, send).ask("Read it");
  assert.equal(answer.stats?.inputTokens, 5650);
  assert.equal(answer.stats?.cacheWriteTokens, 2000);
  assert.equal(answer.stats?.cacheReadTokens, 3500);
  assert.ok(Math.abs((answer.stats?.costUsd ?? 0) - (150 * 0.1 + 2000 * 0.125 + 3500 * 0.01 + 70 * 0.5) / 1_000_000) < 1e-12);
});


test("every round asks for caching, including tool rounds and a retry", async () => {
  const { tools } = fakeTools();
  const { send, requests } = recorder([async () => thoughtful("One."), async () => toolReply([readIndex]), rejected(), async () => reply("Done.")]);
  const session = startApiSession({ ...settings, tools }, send);
  await session.ask("Hello?");
  await session.ask("Read it");
  assert.deepEqual(
    requests.map((request) => request.cache),
    [true, true, true, true],
  );
});
