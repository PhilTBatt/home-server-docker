import assert from "node:assert/strict";
import { test } from "node:test";
import { brainDir, engines, readConfig } from "./config.js";

const key = "sk-ant-test-key";

test("the brain is always mounted at /brain", () => {
  assert.equal(brainDir, "/brain");
});

test("reads the API key, and uses the Agent SDK unless told otherwise", () => {
  assert.deepEqual(readConfig({ ANTHROPIC_API_KEY: key }), { apiKey: key, engine: "sdk" });
});

test("there are two engines, the Agent SDK and the plain API", () => {
  assert.deepEqual(engines, ["sdk", "api"]);
});

test("JARVIS_ENGINE picks the engine", () => {
  assert.equal(readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: "api" }).engine, "api");
  assert.equal(readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: "sdk" }).engine, "sdk");
});

test("JARVIS_ENGINE ignores spaces around it", () => {
  assert.equal(readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: " api " }).engine, "api");
});

test("an empty JARVIS_ENGINE means the default", () => {
  assert.equal(readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: "" }).engine, "sdk");
  assert.equal(readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: "  " }).engine, "sdk");
});

test("an unknown JARVIS_ENGINE is refused and named, rather than quietly falling back", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: "API" }), { message: 'JARVIS_ENGINE must be sdk or api, not "API"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: "plain" }), { message: 'JARVIS_ENGINE must be sdk or api, not "plain"' });
});

test("a missing key is reported before a bad engine", () => {
  assert.throws(() => readConfig({ JARVIS_ENGINE: "plain" }), { message: "Missing setting: ANTHROPIC_API_KEY" });
});

test("refuses a missing API key and names the setting", () => {
  assert.throws(() => readConfig({}), { message: "Missing setting: ANTHROPIC_API_KEY" });
});

test("refuses an empty API key", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: "" }), { message: "Missing setting: ANTHROPIC_API_KEY" });
});

test("ignores other settings", () => {
  assert.deepEqual(readConfig({ ANTHROPIC_API_KEY: key, API_TOKEN: "other" }), { apiKey: key, engine: "sdk" });
});