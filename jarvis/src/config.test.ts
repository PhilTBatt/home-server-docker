import assert from "node:assert/strict";
import { test } from "node:test";
import { brainDir, chatModes, defaultVolume, engines, readConfig, readVolume, thinkingHistories } from "./config.js";

const key = "sk-ant-test-key";
const base = { ANTHROPIC_API_KEY: key, JARVIS_LOG: "off" };

test("the brain is always mounted at /brain", () => {
  assert.equal(brainDir, "/brain");
});

test("reads the API key, and uses the Agent SDK unless told otherwise", () => {
  assert.deepEqual(readConfig(base), { apiKey: key, engine: "sdk", thinkingHistory: "keep", chats: "fresh", lengthHints: "note", lengthWarn: 80000, lengthCap: null, hubToken: null, hubActions: false, sessionNotes: false, log: false });
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
  assert.deepEqual(readConfig({ ...base, API_TOKEN: "other", OTHER_SETTING: "x" }), { apiKey: key, engine: "sdk", thinkingHistory: "keep", chats: "fresh", lengthHints: "note", lengthWarn: 80000, lengthCap: null, hubToken: null, hubActions: false, sessionNotes: false, log: false });
});
test("JARVIS_LENGTH_HINTS chooses who says a chat is getting long: the length note by default, or Jarvis himself", () => {
  assert.equal(readConfig(base).lengthHints, "note");
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_HINTS: "" }).lengthHints, "note");
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_HINTS: " jarvis " }).lengthHints, "jarvis");
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_HINTS: "note" }).lengthHints, "note");
  assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_HINTS: "Jarvis" }), { message: 'JARVIS_LENGTH_HINTS must be note or jarvis, not "Jarvis"' });
  assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_HINTS: "both" }), { message: 'JARVIS_LENGTH_HINTS must be note or jarvis, not "both"' });
});

test("JARVIS_LENGTH_WARN sets where the chat-length warning starts: 80,000 tokens unless told otherwise", () => {
  assert.equal(readConfig(base).lengthWarn, 80000);
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_WARN: "" }).lengthWarn, 80000);
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_WARN: " 60000 " }).lengthWarn, 60000);
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_WARN: "080000" }).lengthWarn, 80000);
  for (const bad of ["0", "000", "-5", "80,000", "80k", "8e4", "80000.5", "off", "99999999999999999999"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_WARN: bad }), { message: `JARVIS_LENGTH_WARN must be a whole number of tokens above 0, like 80000, not "${bad}"` }, bad);
  }
});

test("JARVIS_LENGTH_CAP is off unless set, and must be above the warning", () => {
  assert.equal(readConfig(base).lengthCap, null);
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_CAP: "off" }).lengthCap, null);
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_CAP: "150000" }).lengthCap, 150000);
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_CAP: "80001" }).lengthCap, 80001);
  for (const bad of ["Off", "0", "150k", "none"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_CAP: bad }), { message: `JARVIS_LENGTH_CAP must be a whole number of tokens above 0, like 150000, or off, not "${bad}"` }, bad);
  }
  assert.equal(readConfig({ ...base, JARVIS_LENGTH_CAP: " 150000 " }).lengthCap, 150000);
  assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_CAP: "80000" }), { message: "JARVIS_LENGTH_CAP (80000) must be above JARVIS_LENGTH_WARN (80000, the default)" });
  assert.throws(() => readConfig({ ...base, JARVIS_LENGTH_WARN: "120000", JARVIS_LENGTH_CAP: "100000" }), { message: "JARVIS_LENGTH_CAP (100000) must be above JARVIS_LENGTH_WARN (120000)" });
});

test("JARVIS_HUB_TOOLS is off unless set, and then the API token passed in is kept for the hub's MCP server; with it off, the token is ignored", () => {
  assert.equal(readConfig(base).hubToken, null);
  assert.equal(readConfig({ ...base, API_TOKEN: "hub-token" }).hubToken, null);
  assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "off", API_TOKEN: "hub-token" }).hubToken, null);
  assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "", API_TOKEN: "hub-token" }).hubToken, null);
  assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "hub-token" }).hubToken, "hub-token");
  assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: " on ", API_TOKEN: " hub-token " }).hubToken, "hub-token");
});

test("JARVIS_HUB_TOOLS must be on or off, and on needs the API token, which host/jarvis.sh passes in", () => {
  for (const bad of ["On", "yes", "true", "1"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_HUB_TOOLS: bad, API_TOKEN: "hub-token" }), { message: `JARVIS_HUB_TOOLS must be on or off, not "${bad}"` }, bad);
  }
  for (const token of [undefined, "", "   "]) {
    assert.throws(() => readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: token }), { message: "JARVIS_HUB_TOOLS is on, but there's no API_TOKEN. Start Jarvis with bash host/jarvis.sh, which passes it in" }, String(token));
  }
});

test("JARVIS_SESSION_NOTES is off unless set, and must be on or off", () => {
  assert.equal(readConfig(base).sessionNotes, false);
  assert.equal(readConfig({ ...base, JARVIS_SESSION_NOTES: "" }).sessionNotes, false);
  assert.equal(readConfig({ ...base, JARVIS_SESSION_NOTES: "off" }).sessionNotes, false);
  assert.equal(readConfig({ ...base, JARVIS_SESSION_NOTES: "on" }).sessionNotes, true);
  assert.equal(readConfig({ ...base, JARVIS_SESSION_NOTES: " on " }).sessionNotes, true);
  for (const bad of ["On", "yes", "true", "1"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_SESSION_NOTES: bad }), { message: `JARVIS_SESSION_NOTES must be on or off, not "${bad}"` }, bad);
  }
});

test("JARVIS_HUB_ACTIONS is off unless set, must be on or off, and needs the hub's tools on", () => {
  const withTools = { ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "hub-token" };
  assert.equal(readConfig(withTools).hubActions, false);
  assert.equal(readConfig({ ...withTools, JARVIS_HUB_ACTIONS: "" }).hubActions, false);
  assert.equal(readConfig({ ...withTools, JARVIS_HUB_ACTIONS: "off" }).hubActions, false);
  assert.equal(readConfig({ ...withTools, JARVIS_HUB_ACTIONS: "on" }).hubActions, true);
  assert.equal(readConfig({ ...withTools, JARVIS_HUB_ACTIONS: " on " }).hubActions, true);
  assert.equal(readConfig({ ...base, JARVIS_HUB_ACTIONS: "off" }).hubActions, false);
  for (const bad of ["On", "yes", "true", "1"]) {
    assert.throws(() => readConfig({ ...withTools, JARVIS_HUB_ACTIONS: bad }), { message: `JARVIS_HUB_ACTIONS must be on or off, not "${bad}"` }, bad);
  }
  for (const tools of [{}, { JARVIS_HUB_TOOLS: "off", API_TOKEN: "hub-token" }]) {
    assert.throws(() => readConfig({ ...base, ...tools, JARVIS_HUB_ACTIONS: "on" }), { message: "JARVIS_HUB_ACTIONS is on, but JARVIS_HUB_TOOLS is off. The actions come with the hub's tools, so turn both on" });
  }
});

test("JARVIS_VOLUME is 80 unless set, ignoring spaces", () => {
  assert.equal(defaultVolume, 80);
  assert.equal(readVolume({}), 80);
  assert.equal(readVolume({ JARVIS_VOLUME: "" }), 80);
  assert.equal(readVolume({ JARVIS_VOLUME: "  " }), 80);
  assert.equal(readVolume({ JARVIS_VOLUME: " 35 " }), 35);
});

test("JARVIS_VOLUME takes any whole number from 0 to 100", () => {
  assert.equal(readVolume({ JARVIS_VOLUME: "0" }), 0);
  assert.equal(readVolume({ JARVIS_VOLUME: "1" }), 1);
  assert.equal(readVolume({ JARVIS_VOLUME: "100" }), 100);
  assert.equal(readVolume({ JARVIS_VOLUME: "080" }), 80);
});

test("anything else in JARVIS_VOLUME is refused and named", () => {
  for (const value of ["101", "-1", "50.5", "80%", "loud", "1000", "0x50", "1e2"]) {
    assert.throws(() => readVolume({ JARVIS_VOLUME: value }), { message: `JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "${value}"` });
  }
});

test("JARVIS_VOLUME doesn't need the API key, and the chat's settings don't read it yet", () => {
  assert.equal(readVolume({ JARVIS_VOLUME: "60" }), 60);
  assert.equal("volume" in readConfig({ ...base, JARVIS_VOLUME: "loud" }), false);
});
