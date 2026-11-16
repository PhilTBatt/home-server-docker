import assert from "node:assert/strict";
import { test } from "node:test";
import { brainDir, readConfig } from "./config.js";

const key = "sk-ant-test-key";

test("the brain is always mounted at /brain", () => {
  assert.equal(brainDir, "/brain");
});

test("reads the API key", () => {
  assert.deepEqual(readConfig({ ANTHROPIC_API_KEY: key }), { apiKey: key });
});

test("refuses a missing API key and names the setting", () => {
  assert.throws(() => readConfig({}), { message: "Missing setting: ANTHROPIC_API_KEY" });
});

test("refuses an empty API key", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: "" }), { message: "Missing setting: ANTHROPIC_API_KEY" });
});

test("ignores other settings", () => {
  assert.deepEqual(readConfig({ ANTHROPIC_API_KEY: key, API_TOKEN: "other" }), { apiKey: key });
});