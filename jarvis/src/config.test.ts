import assert from "node:assert/strict";
import { test } from "node:test";
import { brainDir, chatModes, engines, readConfig, thinkingHistories } from "./config.js";

const key = "sk-ant-test-key";
const base = { ANTHROPIC_API_KEY: key, JARVIS_LOG: "off" };

test("the brain is always mounted at /brain", () => {
  assert.equal(brainDir, "/brain");
});

test("reads the API key, and uses the Agent SDK unless told otherwise", () => {
  assert.deepEqual(readConfig(base), { apiKey: key, engine: "sdk", thinkingHistory: "keep", chats: "fresh", lengthHints: "note", log: false });
});

test("there are two engines, the Agent SDK and the plain API", () => {
  assert.deepEqual(engines, ["sdk", "api"]);
});

test("JARVIS_ENGINE picks the engine", () => {
  assert.equal(readConfig({ ...base, JARVIS_ENGINE: "api" }).engine, "api");
  assert.equal(readConfig({ ...base, JARVIS_ENGINE: "sdk" }).engine, "sdk");
});

test("JARVIS_ENGINE ignores spaces around it", () => {
  assert.equal(readConfig({ ...base, JARVIS_ENGINE: " api " }).engine, "api");
});

test("an empty JARVIS_ENGINE means the default", () => {
  assert.equal(readConfig({ ...base, JARVIS_ENGINE: "" }).engine, "sdk");
  assert.equal(readConfig({ ...base, JARVIS_ENGINE: "  " }).engine, "sdk");
});

test("an unknown JARVIS_ENGINE is refused and named, rather than quietly falling back", () => {
  assert.throws(() => readConfig({ ...base, JARVIS_ENGINE: "API" }), { message: 'JARVIS_ENGINE must be sdk or api, not "API"' });
  assert.throws(() => readConfig({ ...base, JARVIS_ENGINE: "plain" }), { message: 'JARVIS_ENGINE must be sdk or api, not "plain"' });
});

test("there are two thinking settings, keep and drop", () => {
  assert.deepEqual(thinkingHistories, ["keep", "drop"]);
});

test("JARVIS_THINKING_HISTORY picks keep or drop, ignoring spaces, and keeps thinking unless told otherwise", () => {
  assert.equal(readConfig({ ...base, JARVIS_THINKING_HISTORY: "drop" }).thinkingHistory, "drop");
  assert.equal(readConfig({ ...base, JARVIS_THINKING_HISTORY: " keep " }).thinkingHistory, "keep");
  assert.equal(readConfig({ ...base, JARVIS_THINKING_HISTORY: "" }).thinkingHistory, "keep");
  assert.equal(readConfig(base).thinkingHistory, "keep");
});

test("an unknown JARVIS_THINKING_HISTORY is refused and named", () => {
  assert.throws(() => readConfig({ ...base, JARVIS_THINKING_HISTORY: "forget" }), { message: 'JARVIS_THINKING_HISTORY must be keep or drop, not "forget"' });
});

test("there are two ways to start a chat: fresh, or resume the last saved one", () => {
  assert.deepEqual(chatModes, ["fresh", "resume"]);
});

test("JARVIS_CHATS picks fresh or resume, ignoring spaces, and starts fresh unless told otherwise", () => {
  assert.equal(readConfig({ ...base, JARVIS_CHATS: "resume" }).chats, "resume");
  assert.equal(readConfig({ ...base, JARVIS_CHATS: " fresh " }).chats, "fresh");
  assert.equal(readConfig({ ...base, JARVIS_CHATS: "" }).chats, "fresh");
  assert.equal(readConfig(base).chats, "fresh");
});

test("an unknown JARVIS_CHATS is refused and named, so a typo can't quietly start saving chats or stop picking them up", () => {
  assert.throws(() => readConfig({ ...base, JARVIS_CHATS: "Resume" }), { message: 'JARVIS_CHATS must be fresh or resume, not "Resume"' });
  assert.throws(() => readConfig({ ...base, JARVIS_CHATS: "on" }), { message: 'JARVIS_CHATS must be fresh or resume, not "on"' });
});

test("JARVIS_LOG turns the answer log on or off", () => {
  assert.equal(readConfig({ ...base, JARVIS_LOG: "on" }).log, true);
  assert.equal(readConfig({ ...base, JARVIS_LOG: "off" }).log, false);
});

test("a missing or empty JARVIS_LOG stops start-up, so a deleted line can't quietly turn logging off", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key }), { message: "Missing setting: JARVIS_LOG (on or off)" });
  assert.throws(() => readConfig({ ...base, JARVIS_LOG: "" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_LOG must be exactly on or off, like the API's switches", () => {
  for (const value of ["yes", "On", " on ", "off "]) assert.throws(() => readConfig({ ...base, JARVIS_LOG: value }), { message: `JARVIS_LOG must be on or off, not "${value}"` });
});

test("the API key is checked first, then the engine, the thinking setting and the log switch", () => {
  assert.throws(() => readConfig({ JARVIS_ENGINE: "plain", JARVIS_LOG: "maybe" }), { message: "Missing setting: ANTHROPIC_API_KEY" });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_ENGINE: "plain", JARVIS_THINKING_HISTORY: "forget", JARVIS_LOG: "maybe" }), { message: 'JARVIS_ENGINE must be sdk or api, not "plain"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_THINKING_HISTORY: "forget", JARVIS_LOG: "maybe" }), { message: 'JARVIS_THINKING_HISTORY must be keep or drop, not "forget"' });
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
  assert.deepEqual(readConfig({ ...base, API_TOKEN: "other" }), { apiKey: key, engine: "sdk", thinkingHistory: "keep", chats: "fresh", lengthHints: "note", log: false });
});
test("JARVIS_LENGTH_HINTS chooses who says a chat is getting long: the length note by default, or Jarvis himself", () => {
  assert.equal(readConfig(base).lengthHints, "note");
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_HINTS: "" }).lengthHints, "note");
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_HINTS: " jarvis " }).lengthHints, "jarvis");
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_HINTS: "note" }).lengthHints, "note");
  assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_HINTS: "Jarvis" }), { message: 'JARVIS_LENGTH_HINTS must be note or jarvis, not "Jarvis"' });
  assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_HINTS: "both" }), { message: 'JARVIS_LENGTH_HINTS must be note or jarvis, not "both"' });
});
