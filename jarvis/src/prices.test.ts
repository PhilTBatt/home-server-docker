import assert from "node:assert/strict";
import { test } from "node:test";
import { answerCost, pricesPerMTok } from "./prices.js";

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
