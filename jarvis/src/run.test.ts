import assert from "node:assert/strict";
import { test } from "node:test";
import { startAgentSession, type AgentSession, type StartAgent } from "./agent.js";
import { brainQuestion, coldQuestion, formatReport, model, outsideQuestion, rounds, runSpeedTest, system, warmQuestions, withTimeout, type Results, type SpeedTestDeps } from "./run.js";
import type { Answer } from "./timing.js";

function answer(text: string, firstWordsMs: number | null, totalMs: number): Answer {
  return { text, firstWordsMs, totalMs };
}

type FakeSession = AgentSession & { asked: string[]; closed: number };

type SessionOptions = {
  ready?: number | null;
  cost?: number | null;
  failOn?: string;
  hangOn?: string;
  outside?: "refused" | "answered" | "broken";
};

function fakeSession(options: SessionOptions = {}): FakeSession {
  let waiting: ((error: Error) => void) | null = null;
  const session: FakeSession = {
    asked: [],
    closed: 0,
    async ask(question: string) {
      session.asked.push(question);
      if (question === options.failOn) throw new Error("Overloaded");
      if (session.closed > 0) throw new Error("The agent was closed");
      if (question === options.hangOn) {
        return new Promise<Answer>((_resolve, reject) => {
          waiting = reject;
        });
      }
      if (question === outsideQuestion) {
        const outside = options.outside ?? "refused";
        if (outside === "refused") return { ...answer("I can't read that.", 300, 600), stats: { rounds: 2, toolUses: 1, inputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 10, costUsd: null, earlierThinkingBlocks: null, recovered: false, largestRequestTokens: 60, lastRequestTokens: 60, refusedTools: ["Read"], spokeFirst: false, retried: null } };
        if (outside === "broken") throw new Error("The agent stopped");
        return answer("It's called home-hub-jarvis.", 333, 999);
      }
      if (question === brainQuestion) return answer("It covers your life.", 900, 3000);
      if (question === coldQuestion) return answer("Cold.", 2000, 2500);
      return answer("Warm.", 600, 1000);
    },
    readyMs: () => (options.ready === undefined ? 400 : options.ready),
    stoppedReason: () => (session.closed > 0 ? "The agent was closed" : null),
    costUsd: () => (options.cost === undefined ? 0.002 : options.cost),
    close() {
      session.closed++;
      waiting?.(new Error("The agent was closed"));
      waiting = null;
    },
  };
  return session;
}

function deps(overrides: Partial<SpeedTestDeps> = {}, sessionOptions: SessionOptions = {}) {
  const sessions: FakeSession[] = [];
  const directQuestions: string[] = [];
  const lines: string[] = [];
  const given: SpeedTestDeps = {
    askDirect: async (question, thinkingOff) => {
      directQuestions.push(`${thinkingOff ? "off" : "default"}: ${question}`);
      return thinkingOff ? answer("Quick.", 450, 700) : answer("Direct.", 500, 800);
    },
    startSession: () => {
      const session = fakeSession(sessionOptions);
      sessions.push(session);
      return session;
    },
    readMemoryMb: () => 300,
    questionTimeoutMs: 1000,
    log: (line) => lines.push(line),
    ...overrides,
  };
  return { given, sessions, directQuestions, lines };
}

test("the test uses Haiku 5.5, three rounds and Jarvis's spoken style", () => {
  assert.equal(model, "claude-haiku-5-5");
  assert.equal(rounds, 3);
  assert.match(system, /short sentences/);
});

test("the cold question is never asked again warm", () => {
  assert.ok(!warmQuestions.includes(coldQuestion));
  assert.equal(new Set(warmQuestions).size, warmQuestions.length);
});

test("the outside question points outside /brain", () => {
  assert.match(outsideQuestion, /\/app\//);
});

test("the plain API call is asked every question in every round, with thinking at its default and then off", async () => {
  const { given, directQuestions } = deps();
  await runSpeedTest(given);
  const oneRound = [coldQuestion, ...warmQuestions].flatMap((question) => [`default: ${question}`, `off: ${question}`]);
  assert.deepEqual(directQuestions, [...oneRound, ...oneRound, ...oneRound]);
});

test("the plain API call's two settings are timed separately", async () => {
  const { given } = deps();
  const results = await runSpeedTest(given);
  const asked = rounds * (1 + warmQuestions.length);
  assert.deepEqual(results.direct, { firstWords: Array(asked).fill(500), total: Array(asked).fill(800) });
  assert.deepEqual(results.directThinkingOff, { firstWords: Array(asked).fill(450), total: Array(asked).fill(700) });
});

test("the Agent SDK starts a fresh session each round and closes it", async () => {
  const { given, sessions } = deps();
  await runSpeedTest(given);
  assert.equal(sessions.length, rounds);
  for (const session of sessions) assert.equal(session.closed, 1);
});

test("each session asks the cold question, the warm questions, then the brain question", async () => {
  const { given, sessions } = deps();
  await runSpeedTest(given);
  const usual = [coldQuestion, ...warmQuestions, brainQuestion];
  assert.deepEqual(sessions[0].asked, [...usual, outsideQuestion]);
  assert.deepEqual(sessions[1].asked, usual);
  assert.deepEqual(sessions[2].asked, usual);
});

test("cold, warm and brain timings are kept apart", async () => {
  const { given } = deps();
  const results = await runSpeedTest(given);
  assert.deepEqual(results.cold, { firstWords: [2000, 2000, 2000], total: [2500, 2500, 2500] });
  assert.deepEqual(results.warm.firstWords, Array(rounds * warmQuestions.length).fill(600));
  assert.deepEqual(results.warm.total, Array(rounds * warmQuestions.length).fill(1000));
  assert.deepEqual(results.brain, { firstWords: [900, 900, 900], total: [3000, 3000, 3000] });
});

test("the outside question isn't counted in any timings", async () => {
  const { given } = deps({}, { outside: "answered" });
  const results = await runSpeedTest(given);
  const timings = [results.direct, results.directThinkingOff, results.cold, results.warm, results.brain];
  const all = timings.flatMap((timing) => [...timing.firstWords, ...timing.total]);
  assert.ok(!all.includes(333));
  assert.ok(!all.includes(999));
  assert.equal(results.cold.total.length, rounds);
  assert.equal(results.warm.total.length, rounds * warmQuestions.length);
  assert.equal(results.brain.total.length, rounds);
});

test("a refused outside read is reported as it should be", async () => {
  const { given } = deps();
  assert.equal((await runSpeedTest(given)).confinement, "refused, as it should be");
});

test("an outside read that wasn't refused is reported loudly, with what Jarvis said", async () => {
  const { given } = deps({}, { outside: "answered" });
  assert.equal((await runSpeedTest(given)).confinement, "NOT refused, or Jarvis didn't try. Check before going further. Jarvis said: It's called home-hub-jarvis.");
});

test("an outside check that fails for another reason says it couldn't check, without stopping the test", async () => {
  const { given, sessions } = deps({}, { outside: "broken" });
  const results = await runSpeedTest(given);
  assert.equal(results.confinement, "couldn't check: The agent stopped");
  assert.equal(sessions.length, rounds);
});

test("records the engine's ready time when it has one", async () => {
  let count = 0;
  const { given } = deps({
    startSession: () => fakeSession({ ready: count++ === 1 ? null : 450 }),
  });
  const results = await runSpeedTest(given);
  assert.deepEqual(results.ready, [450, 450]);
});

test("keeps the most memory seen when it comes first, and ignores unknown readings", async () => {
  const readings = [320, null, 250];
  const { given } = deps({ readMemoryMb: () => readings.shift() ?? null });
  assert.equal((await runSpeedTest(given)).memoryMb, 320);
});

test("keeps the most memory seen when it comes last", async () => {
  const readings = [250, null, 320];
  const { given } = deps({ readMemoryMb: () => readings.shift() ?? null });
  assert.equal((await runSpeedTest(given)).memoryMb, 320);
});

test("memory stays unknown when it can't be read", async () => {
  const { given } = deps({ readMemoryMb: () => null });
  assert.equal((await runSpeedTest(given)).memoryMb, null);
});

test("adds up each session's cost", async () => {
  const { given } = deps();
  const results = await runSpeedTest(given);
  assert.ok(results.costUsd !== null && Math.abs(results.costUsd - 0.006) < 1e-9);
});

test("cost stays unknown when no session reports one", async () => {
  const { given } = deps({}, { cost: null });
  assert.equal((await runSpeedTest(given)).costUsd, null);
});

test("answers with no first words only count towards the full answer", async () => {
  const { given } = deps({ askDirect: async () => answer("", null, 700) });
  const results = await runSpeedTest(given);
  assert.deepEqual(results.direct.firstWords, []);
  assert.deepEqual(results.directThinkingOff.firstWords, []);
  assert.equal(results.direct.total.length, rounds * (1 + warmQuestions.length));
  assert.equal(results.directThinkingOff.total.length, rounds * (1 + warmQuestions.length));
});

test("keeps one example of each kind from the first round", async () => {
  const { given } = deps();
  const results = await runSpeedTest(given);
  assert.deepEqual(results.examples, ["Plain API call: Direct.", "Agent SDK: Cold.", "Agent SDK, brain: It covers your life."]);
});

test("a failing question stops the test and still closes the session", async () => {
  const { given, sessions } = deps({}, { failOn: brainQuestion });
  await assert.rejects(runSpeedTest(given), { message: "Overloaded" });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].closed, 1);
});

test("a question that never answers times out, stops the test and closes the session", async () => {
  const { given, sessions } = deps({ questionTimeoutMs: 20 }, { hangOn: warmQuestions[0] });
  const started = Date.now();
  await assert.rejects(runSpeedTest(given), { message: "No answer within 0.02 seconds" });
  assert.ok(Date.now() - started < 1000);
  assert.ok(sessions[0].closed >= 1);
});

test("a question that times out closes its session straight away", async () => {
  const closedWhenMemoryRead: number[] = [];
  const setup = deps(
    {
      questionTimeoutMs: 20,
      readMemoryMb: () => {
        closedWhenMemoryRead.push(setup.sessions[setup.sessions.length - 1].closed);
        return 300;
      },
    },
    { hangOn: outsideQuestion },
  );
  const results = await runSpeedTest(setup.given);
  assert.equal(results.confinement, "couldn't check: No answer within 0.02 seconds");
  assert.deepEqual(closedWhenMemoryRead, [1, 0, 0]);
  assert.equal(setup.sessions.length, rounds);
});

test("a failure in the plain API call stops before the Agent SDK starts", async () => {
  const { given, sessions } = deps({
    askDirect: async () => {
      throw new Error("The API replied 401: invalid x-api-key");
    },
  });
  await assert.rejects(runSpeedTest(given), { message: "The API replied 401: invalid x-api-key" });
  assert.equal(sessions.length, 0);
});

test("logs each round as it goes", async () => {
  const { given, lines } = deps();
  await runSpeedTest(given);
  assert.deepEqual(lines, [
    "Plain API call, round 1 of 3",
    "Plain API call, round 2 of 3",
    "Plain API call, round 3 of 3",
    "Agent SDK, round 1 of 3",
    "Agent SDK, round 2 of 3",
    "Agent SDK, round 3 of 3",
  ]);
});

test("withTimeout passes on an answer that arrives in time", async () => {
  assert.equal(await withTimeout(Promise.resolve("on time"), 1000), "on time");
});

test("withTimeout passes on a failure that arrives in time", async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error("Overloaded")), 1000), { message: "Overloaded" });
});

test("withTimeout gives up after the time given", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), { message: "No answer within 0.01 seconds" });
});

test("withTimeout runs the clean-up once when it gives up", async () => {
  let cleanUps = 0;
  await assert.rejects(withTimeout(new Promise(() => {}), 10, () => cleanUps++), { message: "No answer within 0.01 seconds" });
  assert.equal(cleanUps, 1);
});

test("withTimeout doesn't run the clean-up when the answer arrives in time", async () => {
  let cleanUps = 0;
  await withTimeout(Promise.resolve("on time"), 10, () => cleanUps++);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(cleanUps, 0);
});

function hangingEngine(): StartAgent {
  return () => {
    let finish: (() => void) | null = null;
    async function* stream() {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    }
    return Object.assign(stream(), {
      close() {
        finish?.();
      },
    });
  };
}

test("a real session that times out reports the timeout, not the clean-up closing it", async () => {
  const session = startAgentSession(hangingEngine(), { model: "m", system: "s", cwd: "/brain", now: () => 0 });
  await assert.rejects(withTimeout(session.ask("Hi"), 10, () => session.close()), { message: "No answer within 0.01 seconds" });
  await assert.rejects(session.ask("Again"), { message: "The agent was closed" });
});

test("withTimeout doesn't keep the process waiting after an answer", async () => {
  const before = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
  await withTimeout(Promise.resolve("done"), 60_000);
  const after = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
  assert.equal(after, before);
});

function sampleResults(overrides: Partial<Results> = {}): Results {
  return {
    direct: { firstWords: [500, 600, 700], total: [800, 900, 1000] },
    directThinkingOff: { firstWords: [300], total: [600] },
    ready: [400],
    cold: { firstWords: [2000], total: [2500] },
    warm: { firstWords: [600, 650], total: [1000, 1100] },
    brain: { firstWords: [], total: [] },
    memoryMb: 310,
    costUsd: 0.0123,
    confinement: "refused, as it should be",
    examples: ["Plain API call: Hi.", "Agent SDK: Hello."],
    ...overrides,
  };
}

test("the report names the model and rounds and shows every measure", () => {
  const report = formatReport(sampleResults());
  assert.ok(report.includes("Jarvis speed test: claude-haiku-5-5, 3 rounds"));
  assert.ok(report.includes("Plain API call, thinking left at Haiku's default (the Agent SDK sends the same):"));
  assert.ok(report.includes("Plain API call, thinking off (the Agent SDK ignored this setting in testing):"));
  assert.ok(report.includes("  first words: 0.30 s"));
  assert.ok(report.includes("  full answer: 0.60 s"));
  assert.ok(report.includes("  first words: 0.60 s (0.50 s to 0.70 s, 3 tries)"));
  assert.ok(report.includes("  full answer: 0.90 s (0.80 s to 1.00 s, 3 tries)"));
  assert.ok(report.includes("  engine ready after starting: 0.40 s"));
  assert.ok(report.includes("  new conversation, first words: 2.00 s"));
  assert.ok(report.includes("  new conversation, full answer: 2.50 s"));
  assert.ok(report.includes("  warm conversation, first words: 0.63 s (0.60 s to 0.65 s, 2 tries)"));
  assert.ok(report.includes("  warm conversation, full answer: 1.05 s (1.00 s to 1.10 s, 2 tries)"));
  assert.ok(report.includes("  reading the brain, first words (can come before the file is read): no data"));
  assert.ok(report.includes("  memory while running (highest reading): 310 MB"));
  assert.ok(report.includes("  cost of the Agent SDK's runs: about $0.0123"));
  assert.ok(report.includes("  reading outside /brain: refused, as it should be"));
});

test("the report lists the example answers, indented", () => {
  const report = formatReport(sampleResults());
  assert.deepEqual(report.slice(-3), ["Example answers:", "  Plain API call: Hi.", "  Agent SDK: Hello."]);
});

test("the report says when memory and cost are unknown", () => {
  const report = formatReport(sampleResults({ memoryMb: null, costUsd: null }));
  assert.ok(report.includes("  memory while running (highest reading): unknown"));
  assert.ok(report.includes("  cost of the Agent SDK's runs: unknown"));
});