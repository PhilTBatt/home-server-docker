import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage } from "./agent.js";
import { answerCost, pricesPerMTok, startApiSession, type ApiSettings, type SendRequest } from "./api-session.js";
import type { DirectAnswer, DirectRequest } from "./direct.js";

const settings: ApiSettings = { apiKey: "sk-ant-test-key", model: "claude-haiku-5-5", system: "Be brief.", maxTokens: 4000, timeoutMs: 120_000, now: () => 0 };

function reply(text: string, inputTokens = 100, outputTokens = 20): DirectAnswer {
  return { text, firstWordsMs: 300, totalMs: 900, inputTokens, outputTokens };
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

test("the answer comes back with its timings", async () => {
  const { send } = recorder([async () => reply("Hi.")]);
  assert.deepEqual(await startApiSession(settings, send).ask("Hello?"), { text: "Hi.", firstWordsMs: 300, totalMs: 900 });
});

test("he remembers the conversation: each question carries the turns before it", async () => {
  const { send, requests } = recorder([async () => reply("One."), async () => reply("Two."), async () => reply("Three.")]);
  const session = startApiSession(settings, send);
  await session.ask("First?");
  await session.ask("Second?");
  await session.ask("Third?");
  assert.deepEqual(requests[1].history, [
    { role: "user", content: "First?" },
    { role: "assistant", content: "One." },
  ]);
  assert.deepEqual(requests[2].history, [
    { role: "user", content: "First?" },
    { role: "assistant", content: "One." },
    { role: "user", content: "Second?" },
    { role: "assistant", content: "Two." },
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