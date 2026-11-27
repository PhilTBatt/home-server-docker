import assert from "node:assert/strict";
import { test } from "node:test";
import { brainDir, chatModes, defaultKokoroVoice, defaultPiperVoice, defaultVolume, engines, followUpSeconds, liveFactsModes, readConfig, readVolume, speechStarts, speechBundleModes, speechStops, spokenStyleModes, thinkingHistories, voiceModes } from "./config.js";

const key = "sk-ant-test-key";
const base = { ANTHROPIC_API_KEY: key, JARVIS_LOG: "off" };

test("the brain is always mounted at /brain", () => {
  assert.equal(brainDir, "/brain");
});

test("reads the API key, and uses the Agent SDK unless told otherwise", () => {
  assert.deepEqual(readConfig(base), { apiKey: key, engine: "sdk", thinkingHistory: "keep", chats: "fresh", lengthHints: "note", lengthWarn: 80000, lengthCap: null, hubToken: null, hubActions: false, musicYes: "changes", sessionNotes: false, voice: "off", kokoroVoice: "bm_george", kokoroSpeed: 1, piperVoice: "en_GB-alan-medium", volume: 80, speechStart: "sentence", speechStop: "now", speechBundle: false, spokenStyle: false, persona: null, liveFacts: false, filler: false, ears: "off", earsToken: null, followUp: null, turnCheck: false, trainAlerts: false, brainQuestions: false, clock: false, digest: false, phone: false, intro: false, guest: false, modes: false, reminders: false, voices: false, sessions: false, otherVoices: "answer", web: "off", webBy: "claude", webToken: null, webLog: false, log: false });
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
  assert.deepEqual(readConfig({ ...base, API_TOKEN: "other", OTHER_SETTING: "x" }), { apiKey: key, engine: "sdk", thinkingHistory: "keep", chats: "fresh", lengthHints: "note", lengthWarn: 80000, lengthCap: null, hubToken: null, hubActions: false, musicYes: "changes", sessionNotes: false, voice: "off", kokoroVoice: "bm_george", kokoroSpeed: 1, piperVoice: "en_GB-alan-medium", volume: 80, speechStart: "sentence", speechStop: "now", speechBundle: false, spokenStyle: false, persona: null, liveFacts: false, filler: false, ears: "off", earsToken: null, followUp: null, turnCheck: false, trainAlerts: false, brainQuestions: false, clock: false, digest: false, phone: false, intro: false, guest: false, modes: false, reminders: false, voices: false, sessions: false, otherVoices: "answer", web: "off", webBy: "claude", webToken: null, webLog: false, log: false });
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

test("JARVIS_DIGEST is off unless set, and must be on or off", () => {
  assert.equal(readConfig(base).digest, false);
  assert.equal(readConfig({ ...base, JARVIS_DIGEST: "" }).digest, false);
  assert.equal(readConfig({ ...base, JARVIS_DIGEST: "off" }).digest, false);
  assert.equal(readConfig({ ...base, JARVIS_DIGEST: " on " }).digest, true);
  for (const bad of ["On", "yes", "true", "1", "weekly"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_DIGEST: bad }), { message: `JARVIS_DIGEST must be on or off, not "${bad}"` }, bad);
  }
});

test("JARVIS_MUSIC_YES is changes unless set, and must be changes or all", () => {
  assert.equal(readConfig(base).musicYes, "changes");
  assert.equal(readConfig({ ...base, JARVIS_MUSIC_YES: "" }).musicYes, "changes");
  assert.equal(readConfig({ ...base, JARVIS_MUSIC_YES: "changes" }).musicYes, "changes");
  assert.equal(readConfig({ ...base, JARVIS_MUSIC_YES: " all " }).musicYes, "all");
  for (const bad of ["All", "none", "on", "off", "yes", "playback"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_MUSIC_YES: bad }), { message: `JARVIS_MUSIC_YES must be changes or all, not "${bad}"` }, bad);
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

test("JARVIS_VOLUME doesn't need the API key for the sound test, and the chat's settings read it too", () => {
  assert.equal(readVolume({ JARVIS_VOLUME: "60" }), 60);
  assert.equal(readConfig({ ...base, JARVIS_VOLUME: "60" }).volume, 60);
  assert.equal(readConfig({ ...base, JARVIS_VOLUME: " 0 " }).volume, 0);
  assert.equal(readConfig(base).volume, defaultVolume);
});

test("a wrong JARVIS_VOLUME stops the chat too, voice on or off", () => {
  for (const voice of ["off", "kokoro", "piper"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_VOLUME: "loud" }), { message: 'JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "loud"' });
    assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_VOLUME: "101" }), { message: 'JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "101"' });
  }
});

test("the voice is off unless JARVIS_VOICE names a speech engine, Kokoro or Piper", () => {
  assert.deepEqual(voiceModes, ["off", "kokoro", "piper"]);
  assert.equal(readConfig(base).voice, "off");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: "" }).voice, "off");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: "  " }).voice, "off");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: "off" }).voice, "off");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: "kokoro" }).voice, "kokoro");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: " kokoro " }).voice, "kokoro");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: "piper" }).voice, "piper");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: " piper " }).voice, "piper");
});

test("anything else in JARVIS_VOICE stops Jarvis and is named", () => {
  for (const value of ["on", "Kokoro", "KOKORO", "Piper", "PIPER", "kokoro,piper", "wyoming", "yes", "true", "bm_george", "en_GB-alan-medium"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_VOICE: value }), { message: `JARVIS_VOICE must be off, kokoro or piper, not "${value}"` });
  }
});

test("JARVIS_KOKORO_SPEED is how fast Kokoro speaks, 1 when it's missing or blank, and any plain number from 0.25 to 4", () => {
  assert.equal(readConfig(base).kokoroSpeed, 1);
  assert.equal(readConfig({ ...base, JARVIS_KOKORO_SPEED: "" }).kokoroSpeed, 1);
  assert.equal(readConfig({ ...base, JARVIS_KOKORO_SPEED: "   " }).kokoroSpeed, 1);
  for (const [value, speed] of [["0.9", 0.9], [" 1.25 ", 1.25], ["0.25", 0.25], ["4", 4], ["4.0", 4], ["1", 1]] as const) assert.equal(readConfig({ ...base, JARVIS_KOKORO_SPEED: value }).kokoroSpeed, speed, value);
  for (const value of ["0.24", "4.01", "5", "0", "-1", "fast", "1,5", ".9", "1.", "1e0", "0x1", "1 .5", "Infinity", "NaN"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_KOKORO_SPEED: value }), { message: `JARVIS_KOKORO_SPEED must be a number from 0.25 to 4, like 1 or 0.9, not "${value.trim()}"` }, value);
  }
});

test("JARVIS_KOKORO_VOICE names Kokoro's voice, bm_george unless set", () => {
  assert.equal(defaultKokoroVoice, "bm_george");
  assert.equal(readConfig(base).kokoroVoice, "bm_george");
  assert.equal(readConfig({ ...base, JARVIS_KOKORO_VOICE: "" }).kokoroVoice, "bm_george");
  assert.equal(readConfig({ ...base, JARVIS_KOKORO_VOICE: "   " }).kokoroVoice, "bm_george");
  assert.equal(readConfig({ ...base, JARVIS_KOKORO_VOICE: "bm_fable" }).kokoroVoice, "bm_fable");
  assert.equal(readConfig({ ...base, JARVIS_KOKORO_VOICE: " bm_lewis " }).kokoroVoice, "bm_lewis");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: "kokoro", JARVIS_KOKORO_VOICE: "bm_daniel" }).kokoroVoice, "bm_daniel");
});

test("JARVIS_KOKORO_VOICE also takes Kokoro's blends of voices, with or without weights", () => {
  for (const value of ["bm_george+bm_fable", "bm_george(2)+bm_fable(1)", "bm_george(0.7)+bm_fable(0.3)", "bm_george-bm_fable(0.2)", "af_heart", "bm_v0george", "a+b+c"]) {
    assert.equal(readConfig({ ...base, JARVIS_KOKORO_VOICE: value }).kokoroVoice, value);
  }
});

test("a JARVIS_KOKORO_VOICE that couldn't be a voice name stops Jarvis and is named, voice on or off", () => {
  const shapes = ["bm george", "bm_george,bm_fable", '"bm_george"', "bm_george+", "+bm_george", "bm_george++bm_fable", "bm_george()", "bm_george(two)", "bm_george(2", "(2)", "bm-", "bm_george;", "bm_george\nbm_fable", "bm_géorge", `b${"m".repeat(200)}`];
  for (const value of shapes) {
    for (const voice of ["off", "kokoro", "piper"]) {
      assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_KOKORO_VOICE: value }), { message: `JARVIS_KOKORO_VOICE must be one of Kokoro's voice names, like bm_george, or a blend like bm_george(2)+bm_fable(1), not "${value.trim()}"` });
    }
  }
  assert.equal(readConfig({ ...base, JARVIS_KOKORO_VOICE: `b${"m".repeat(199)}` }).kokoroVoice.length, 200);
});

test("JARVIS_PIPER_VOICE names Piper's voice, en_GB-alan-medium unless set", () => {
  assert.equal(defaultPiperVoice, "en_GB-alan-medium");
  assert.equal(readConfig(base).piperVoice, "en_GB-alan-medium");
  assert.equal(readConfig({ ...base, JARVIS_PIPER_VOICE: "" }).piperVoice, "en_GB-alan-medium");
  assert.equal(readConfig({ ...base, JARVIS_PIPER_VOICE: "   " }).piperVoice, "en_GB-alan-medium");
  assert.equal(readConfig({ ...base, JARVIS_PIPER_VOICE: " en_GB-northern_english_male-medium " }).piperVoice, "en_GB-northern_english_male-medium");
  assert.equal(readConfig({ ...base, JARVIS_VOICE: "piper", JARVIS_PIPER_VOICE: "en_US-lessac-high" }).piperVoice, "en_US-lessac-high");
  for (const value of ["en_GB-alan-low", "en_GB-alan-x_low", "fil_PH-someone-medium", "en_US-libritts_r-medium", "de_DE-thorsten_emotional-medium", "en_US-l2arctic-medium"]) {
    assert.equal(readConfig({ ...base, JARVIS_PIPER_VOICE: value }).piperVoice, value);
  }
});

test("a JARVIS_PIPER_VOICE that isn't shaped like a Piper voice name stops Jarvis and is named, voice on or off, since it becomes a file name", () => {
  const shapes = ["alan", "en_GB-alan", "en_GB-alan-medium.onnx", "en_GB-alan-Medium", "en_GB-alan-mid", "en_gb-alan-medium", "EN_GB-alan-medium", "en-GB-alan-medium", "en_GB-Alan-medium", "en_GB--medium", "en_GB-alan medium", "en_GB-al.an-medium", "../en_GB-alan-medium", "en_GB/alan/medium", "en_GB-alan-medium;rm", "e_GB-alan-medium", "engl_GB-alan-medium", "en_GBR-alan-medium", "pt_PT-tugão-medium", "bm_george"];
  for (const value of shapes) {
    for (const voice of ["off", "kokoro", "piper"]) {
      assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_PIPER_VOICE: value }), { message: `JARVIS_PIPER_VOICE must be a Piper voice name, its language, speaker and quality, like en_GB-alan-medium, not "${value.trim()}"` }, value);
    }
  }
  assert.throws(() => readConfig({ ...base, JARVIS_PIPER_VOICE: "en_GB-alan-medium\nen_GB-alan-low" }));
});

test("the voice settings are checked after the earlier ones and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ...base, JARVIS_SESSION_NOTES: "maybe", JARVIS_VOICE: "loud" }), { message: 'JARVIS_SESSION_NOTES must be on or off, not "maybe"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_VOICE: "loud", JARVIS_KOKORO_VOICE: "a b", JARVIS_VOLUME: "loud" }), { message: 'JARVIS_VOICE must be off, kokoro or piper, not "loud"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_KOKORO_VOICE: "a b", JARVIS_KOKORO_SPEED: "fast", JARVIS_PIPER_VOICE: "alan", JARVIS_VOLUME: "loud" }), { message: `JARVIS_KOKORO_VOICE must be one of Kokoro's voice names, like bm_george, or a blend like bm_george(2)+bm_fable(1), not "a b"` });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_KOKORO_SPEED: "fast", JARVIS_PIPER_VOICE: "alan", JARVIS_VOLUME: "loud" }), { message: 'JARVIS_KOKORO_SPEED must be a number from 0.25 to 4, like 1 or 0.9, not "fast"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_PIPER_VOICE: "alan", JARVIS_VOLUME: "loud" }), { message: 'JARVIS_PIPER_VOICE must be a Piper voice name, its language, speaker and quality, like en_GB-alan-medium, not "alan"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_VOLUME: "loud" }), { message: 'JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "loud"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_VOICE: "kokoro" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("an answer's speech starts with its whole first sentence unless JARVIS_SPEECH_START says clause", () => {
  assert.deepEqual(speechStarts, ["sentence", "clause"]);
  assert.equal(readConfig(base).speechStart, "sentence");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_START: "" }).speechStart, "sentence");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_START: "  " }).speechStart, "sentence");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_START: "sentence" }).speechStart, "sentence");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_START: " clause " }).speechStart, "clause");
});

test("anything else in JARVIS_SPEECH_START stops Jarvis and is named, voice on or off", () => {
  for (const voice of ["off", "kokoro", "piper"]) {
    for (const value of ["word", "Clause", "on", "sentence,clause"]) {
      assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_SPEECH_START: value }), { message: `JARVIS_SPEECH_START must be sentence or clause, not "${value}"` });
    }
  }
});

test("JARVIS_SPEECH_START is checked after the volume and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_VOLUME: "loud", JARVIS_SPEECH_START: "word" }), { message: 'JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "loud"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_START: "word" }), { message: 'JARVIS_SPEECH_START must be sentence or clause, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_START: "clause" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("he stops talking at once when interrupted unless JARVIS_SPEECH_STOP says sentence", () => {
  assert.deepEqual(speechStops, ["now", "sentence"]);
  assert.equal(readConfig(base).speechStop, "now");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_STOP: "" }).speechStop, "now");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_STOP: "  " }).speechStop, "now");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_STOP: "now" }).speechStop, "now");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_STOP: " sentence " }).speechStop, "sentence");
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_START: "clause", JARVIS_SPEECH_STOP: "sentence" }).speechStart, "clause");
});

test("anything else in JARVIS_SPEECH_STOP stops Jarvis and is named, voice on or off", () => {
  for (const voice of ["off", "kokoro", "piper"]) {
    for (const value of ["word", "Now", "off", "clause", "now,sentence"]) {
      assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_SPEECH_STOP: value }), { message: `JARVIS_SPEECH_STOP must be now or sentence, not "${value}"` });
    }
  }
});

test("JARVIS_SPEECH_STOP is checked after JARVIS_SPEECH_START and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_START: "word", JARVIS_SPEECH_STOP: "word" }), { message: 'JARVIS_SPEECH_START must be sentence or clause, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_STOP: "word" }), { message: 'JARVIS_SPEECH_STOP must be now or sentence, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_STOP: "sentence" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_SPEECH_BUNDLE is off unless it's set to on", () => {
  assert.deepEqual(speechBundleModes, ["off", "on"]);
  assert.equal(readConfig(base).speechBundle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_BUNDLE: "" }).speechBundle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_BUNDLE: "  " }).speechBundle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_BUNDLE: "off" }).speechBundle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_BUNDLE: " on " }).speechBundle, true);
  assert.equal(readConfig({ ...base, JARVIS_SPEECH_BUNDLE: "on", JARVIS_SPOKEN_STYLE: "on" }).spokenStyle, true);
});

test("anything else in JARVIS_SPEECH_BUNDLE stops Jarvis and is named, voice on or off", () => {
  for (const voice of ["off", "kokoro", "piper"]) {
    for (const value of ["yes", "ON", "true", "1", "bundled"]) {
      assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_SPEECH_BUNDLE: value }), { message: `JARVIS_SPEECH_BUNDLE must be on or off, not "${value}"` });
    }
  }
});

test("JARVIS_SPEECH_BUNDLE is checked after JARVIS_SPEECH_STOP and before JARVIS_SPOKEN_STYLE", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_STOP: "word", JARVIS_SPEECH_BUNDLE: "word" }), { message: 'JARVIS_SPEECH_STOP must be now or sentence, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_BUNDLE: "word", JARVIS_SPOKEN_STYLE: "word" }), { message: 'JARVIS_SPEECH_BUNDLE must be on or off, not "word"' });
});

test("JARVIS_SPOKEN_STYLE is off unless it's set to on", () => {
  assert.deepEqual(spokenStyleModes, ["off", "on"]);
  assert.equal(readConfig(base).spokenStyle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPOKEN_STYLE: "" }).spokenStyle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPOKEN_STYLE: "  " }).spokenStyle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPOKEN_STYLE: "off" }).spokenStyle, false);
  assert.equal(readConfig({ ...base, JARVIS_SPOKEN_STYLE: " on " }).spokenStyle, true);
  assert.equal(readConfig({ ...base, JARVIS_SPOKEN_STYLE: "on", JARVIS_SPEECH_STOP: "sentence" }).speechStop, "sentence");
});

test("anything else in JARVIS_SPOKEN_STYLE stops Jarvis and is named, voice on or off", () => {
  for (const voice of ["off", "kokoro", "piper"]) {
    for (const value of ["yes", "ON", "true", "1", "kokoro"]) {
      assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_SPOKEN_STYLE: value }), { message: `JARVIS_SPOKEN_STYLE must be on or off, not "${value}"` });
    }
  }
});

test("JARVIS_SPOKEN_STYLE is checked after JARVIS_SPEECH_STOP and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPEECH_STOP: "word", JARVIS_SPOKEN_STYLE: "word" }), { message: 'JARVIS_SPEECH_STOP must be now or sentence, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPOKEN_STYLE: "word" }), { message: 'JARVIS_SPOKEN_STYLE must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPOKEN_STYLE: "on" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_PERSONA is off unless it names a file in jarvis/persona/, without the .md", () => {
  assert.equal(readConfig(base).persona, null);
  for (const value of ["", "  ", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_PERSONA: value }).persona, null, JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_PERSONA: " butler " }).persona, "butler");
  assert.equal(readConfig({ ...base, JARVIS_PERSONA: "quiet-butler-2" }).persona, "quiet-butler-2");
  assert.equal(readConfig({ ...base, JARVIS_PERSONA: "9" }).persona, "9");
  assert.equal(readConfig({ ...base, JARVIS_PERSONA: "a".repeat(40) }).persona, "a".repeat(40));
});

test("anything else in JARVIS_PERSONA stops Jarvis and is named, so it can never point outside jarvis/persona/", () => {
  for (const value of ["Butler", "butler.md", "../butler", "persona/butler", "-butler", "butler bot", "butler_bot", "OFF", "a".repeat(41), "/etc/passwd"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_PERSONA: value }), { message: `JARVIS_PERSONA must be off or the name of a file in jarvis/persona/ without the .md, in lowercase letters, numbers and dashes, like butler, not "${value}"` });
  }
});

test("JARVIS_LIVE_FACTS is off unless it's set to on", () => {
  assert.deepEqual(liveFactsModes, ["off", "on"]);
  assert.equal(readConfig(base).liveFacts, false);
  for (const value of ["", "  ", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_LIVE_FACTS: value }).liveFacts, false, JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_LIVE_FACTS: " on " }).liveFacts, true);
  for (const value of ["yes", "ON", "true", "1"]) assert.throws(() => readConfig({ ...base, JARVIS_LIVE_FACTS: value }), { message: `JARVIS_LIVE_FACTS must be on or off, not "${value}"` });
});

test("JARVIS_PERSONA and JARVIS_LIVE_FACTS are checked after JARVIS_SPOKEN_STYLE and before JARVIS_FILLER", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPOKEN_STYLE: "word", JARVIS_PERSONA: "Word" }), { message: 'JARVIS_SPOKEN_STYLE must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_PERSONA: "Word", JARVIS_LIVE_FACTS: "word" }), { message: 'JARVIS_PERSONA must be off or the name of a file in jarvis/persona/ without the .md, in lowercase letters, numbers and dashes, like butler, not "Word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_LIVE_FACTS: "word", JARVIS_FILLER: "word" }), { message: 'JARVIS_LIVE_FACTS must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_PERSONA: "butler", JARVIS_LIVE_FACTS: "on" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_FILLER is off unless it's set to on", () => {
  assert.equal(readConfig(base).filler, false);
  for (const value of ["", "  ", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_FILLER: value }).filler, false, JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_FILLER: " on " }).filler, true);
  assert.equal(readConfig({ ...base, JARVIS_FILLER: "on", JARVIS_SPOKEN_STYLE: "on" }).spokenStyle, true);
});

test("anything else in JARVIS_FILLER stops Jarvis and is named, voice on or off", () => {
  for (const voice of ["off", "kokoro", "piper"]) {
    for (const value of ["yes", "ON", "true", "1", "chime"]) {
      assert.throws(() => readConfig({ ...base, JARVIS_VOICE: voice, JARVIS_FILLER: value }), { message: `JARVIS_FILLER must be on or off, not "${value}"` });
    }
  }
});

test("JARVIS_FILLER is checked after JARVIS_SPOKEN_STYLE and before JARVIS_EARS", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPOKEN_STYLE: "word", JARVIS_FILLER: "word" }), { message: 'JARVIS_SPOKEN_STYLE must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_FILLER: "word", JARVIS_EARS: "word" }), { message: 'JARVIS_FILLER must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_FILLER: "on" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_EARS is off unless it's set to push or wake, and both keep ears's token, which host/jarvis.sh passes in", () => {
  assert.equal(readConfig(base).ears, "off");
  assert.equal(readConfig({ ...base, JARVIS_EARS: "" }).ears, "off");
  assert.equal(readConfig({ ...base, JARVIS_EARS: "  " }).ears, "off");
  assert.deepEqual([readConfig({ ...base, JARVIS_EARS: "off", EARS_TOKEN: "e".repeat(64) }).ears, readConfig({ ...base, JARVIS_EARS: "off", EARS_TOKEN: "e".repeat(64) }).earsToken], ["off", null]);
  assert.deepEqual([readConfig({ ...base, JARVIS_EARS: " push ", EARS_TOKEN: ` ${"e".repeat(64)} ` }).ears, readConfig({ ...base, JARVIS_EARS: "push", EARS_TOKEN: "e".repeat(64) }).earsToken], ["push", "e".repeat(64)]);
  assert.deepEqual([readConfig({ ...base, JARVIS_EARS: " wake ", EARS_TOKEN: ` ${"w".repeat(64)} ` }).ears, readConfig({ ...base, JARVIS_EARS: "wake", EARS_TOKEN: ` ${"w".repeat(64)} ` }).earsToken], ["wake", "w".repeat(64)]);
});

test("anything else in JARVIS_EARS stops Jarvis and is named, and push or wake without ears's token says how to start him", () => {
  for (const value of ["on", "PUSH", "Wake", "talk", "yes", "hey jarvis"]) {
    assert.throws(() => readConfig({ ...base, JARVIS_EARS: value, EARS_TOKEN: "e".repeat(64) }), { message: `JARVIS_EARS must be off, push or wake, not "${value}"` });
  }
  for (const mode of ["push", "wake"]) {
    for (const token of [undefined, "", "   "]) {
      assert.throws(() => readConfig({ ...base, JARVIS_EARS: mode, EARS_TOKEN: token }), { message: `JARVIS_EARS is ${mode}, but there's no EARS_TOKEN. Start Jarvis with bash host/jarvis.sh, which passes it in from ears/.env` });
    }
  }
});

test("JARVIS_FOLLOW_UP is off unless it's a whole number of seconds from 2 to 15, which needs JARVIS_EARS=wake", () => {
  const wake = { ...base, JARVIS_EARS: "wake", EARS_TOKEN: "w".repeat(64) };
  assert.deepEqual(followUpSeconds, { least: 2, most: 15 });
  for (const value of [undefined, "", "  ", "off", " off "]) assert.equal(readConfig({ ...wake, JARVIS_FOLLOW_UP: value }).followUp, null, String(value));
  assert.deepEqual([readConfig({ ...wake, JARVIS_FOLLOW_UP: "2" }).followUp, readConfig({ ...wake, JARVIS_FOLLOW_UP: " 5 " }).followUp, readConfig({ ...wake, JARVIS_FOLLOW_UP: "15" }).followUp], [2, 5, 15]);
  for (const value of ["1", "16", "0", "5.5", "-5", "5s", "on", "OFF", "1e1", "05x"]) {
    assert.throws(() => readConfig({ ...wake, JARVIS_FOLLOW_UP: value }), { message: `JARVIS_FOLLOW_UP must be off or a whole number of seconds from 2 to 15, like 5, not "${value}"` });
  }
  for (const ears of [{}, { JARVIS_EARS: "off" }, { JARVIS_EARS: "push", EARS_TOKEN: "e".repeat(64) }]) {
    assert.throws(() => readConfig({ ...base, ...ears, JARVIS_FOLLOW_UP: "5" }), { message: "JARVIS_FOLLOW_UP is 5, but follow-ups come after questions asked with the wake word, so they need JARVIS_EARS=wake. Set that, or set JARVIS_FOLLOW_UP=off" });
    assert.equal(readConfig({ ...base, ...ears, JARVIS_FOLLOW_UP: "off" }).followUp, null);
  }
});

test("JARVIS_TURN_CHECK is off unless it's set to on, which needs JARVIS_EARS=wake, and it's checked after JARVIS_FOLLOW_UP and before JARVIS_TRAIN_ALERTS", () => {
  const wake = { ...base, JARVIS_EARS: "wake", EARS_TOKEN: "w".repeat(64) };
  assert.equal(readConfig(base).turnCheck, false);
  for (const value of [undefined, "", "  ", "off", " off "]) assert.equal(readConfig({ ...wake, JARVIS_TURN_CHECK: value }).turnCheck, false, String(value));
  assert.equal(readConfig({ ...wake, JARVIS_TURN_CHECK: " on " }).turnCheck, true);
  for (const value of ["yes", "ON", "true", "1"]) assert.throws(() => readConfig({ ...wake, JARVIS_TURN_CHECK: value }), { message: `JARVIS_TURN_CHECK must be on or off, not "${value}"` });
  for (const ears of [{}, { JARVIS_EARS: "off" }, { JARVIS_EARS: "push", EARS_TOKEN: "e".repeat(64) }]) {
    assert.throws(() => readConfig({ ...base, ...ears, JARVIS_TURN_CHECK: "on" }), { message: "JARVIS_TURN_CHECK is on, but it judges recordings made after the wake word, so it needs JARVIS_EARS=wake. Set that, or set JARVIS_TURN_CHECK=off" });
    assert.equal(readConfig({ ...base, ...ears, JARVIS_TURN_CHECK: "off" }).turnCheck, false);
  }
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_FOLLOW_UP: "word", JARVIS_TURN_CHECK: "word" }), { message: 'JARVIS_FOLLOW_UP must be off or a whole number of seconds from 2 to 15, like 5, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_TURN_CHECK: "word", JARVIS_TRAIN_ALERTS: "word" }), { message: 'JARVIS_TURN_CHECK must be on or off, not "word"' });
});

test("JARVIS_TRAIN_ALERTS is off unless it's set to on, which needs the hub's tools, since the changes come from the hub", () => {
  const withTools = { ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "hub-token" };
  assert.equal(readConfig(base).trainAlerts, false);
  for (const value of ["", "  ", "off", " off "]) assert.equal(readConfig({ ...withTools, JARVIS_TRAIN_ALERTS: value }).trainAlerts, false, JSON.stringify(value));
  assert.equal(readConfig({ ...withTools, JARVIS_TRAIN_ALERTS: " on " }).trainAlerts, true);
  assert.equal(readConfig({ ...base, JARVIS_TRAIN_ALERTS: "off" }).trainAlerts, false);
  assert.throws(() => readConfig({ ...base, JARVIS_TRAIN_ALERTS: "on" }), { message: "JARVIS_TRAIN_ALERTS is on, but train changes come from the hub, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_TRAIN_ALERTS=off" });
  for (const value of ["yes", "ON", "true", "1"]) assert.throws(() => readConfig({ ...withTools, JARVIS_TRAIN_ALERTS: value }), { message: `JARVIS_TRAIN_ALERTS must be on or off, not "${value}"` });
});

test("JARVIS_TRAIN_ALERTS is checked after JARVIS_FOLLOW_UP and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_FOLLOW_UP: "word", JARVIS_TRAIN_ALERTS: "word" }), { message: 'JARVIS_FOLLOW_UP must be off or a whole number of seconds from 2 to 15, like 5, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_TRAIN_ALERTS: "word" }), { message: 'JARVIS_TRAIN_ALERTS must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_HUB_TOOLS: "on", API_TOKEN: "t", JARVIS_TRAIN_ALERTS: "on" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_FOLLOW_UP is checked after JARVIS_EARS and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_EARS: "word", JARVIS_FOLLOW_UP: "word" }), { message: 'JARVIS_EARS must be off, push or wake, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_EARS: "wake", JARVIS_FOLLOW_UP: "word" }), { message: "JARVIS_EARS is wake, but there's no EARS_TOKEN. Start Jarvis with bash host/jarvis.sh, which passes it in from ears/.env" });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_EARS: "wake", EARS_TOKEN: "e", JARVIS_FOLLOW_UP: "word" }), { message: 'JARVIS_FOLLOW_UP must be off or a whole number of seconds from 2 to 15, like 5, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_EARS: "wake", EARS_TOKEN: "e", JARVIS_FOLLOW_UP: "5" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_EARS is checked after JARVIS_SPOKEN_STYLE and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_SPOKEN_STYLE: "word", JARVIS_EARS: "word" }), { message: 'JARVIS_SPOKEN_STYLE must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_EARS: "word" }), { message: 'JARVIS_EARS must be off, push or wake, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_EARS: "push", EARS_TOKEN: "e" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_EARS: "wake", EARS_TOKEN: "e" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_BRAIN_QUESTIONS is off unless it's set to on, which needs the hub's tools, since the answers go to the brain's inbox through the hub", () => {
  const withTools = { ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "hub-token" };
  assert.equal(readConfig(base).brainQuestions, false);
  for (const value of ["", "  ", "off", " off "]) assert.equal(readConfig({ ...withTools, JARVIS_BRAIN_QUESTIONS: value }).brainQuestions, false, JSON.stringify(value));
  assert.equal(readConfig({ ...withTools, JARVIS_BRAIN_QUESTIONS: " on " }).brainQuestions, true);
  assert.equal(readConfig({ ...base, JARVIS_BRAIN_QUESTIONS: "off" }).brainQuestions, false);
  assert.throws(() => readConfig({ ...base, JARVIS_BRAIN_QUESTIONS: "on" }), { message: "JARVIS_BRAIN_QUESTIONS is on, but your answers go to the brain's inbox through the hub, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_BRAIN_QUESTIONS=off" });
  for (const value of ["yes", "ON", "true", "1"]) assert.throws(() => readConfig({ ...withTools, JARVIS_BRAIN_QUESTIONS: value }), { message: `JARVIS_BRAIN_QUESTIONS must be on or off, not "${value}"` });
});

test("JARVIS_BRAIN_QUESTIONS is checked after JARVIS_TRAIN_ALERTS and before JARVIS_LOG", () => {
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_TRAIN_ALERTS: "word", JARVIS_BRAIN_QUESTIONS: "word" }), { message: 'JARVIS_TRAIN_ALERTS must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_BRAIN_QUESTIONS: "word" }), { message: 'JARVIS_BRAIN_QUESTIONS must be on or off, not "word"' });
  assert.throws(() => readConfig({ ANTHROPIC_API_KEY: key, JARVIS_HUB_TOOLS: "on", API_TOKEN: "t", JARVIS_BRAIN_QUESTIONS: "on" }), { message: "Missing setting: JARVIS_LOG (on or off)" });
});

test("JARVIS_GUEST and JARVIS_MODES are off unless set to on, anything else stops Jarvis, and modes need the hub's tools", () => {
  for (const name of ["JARVIS_GUEST", "JARVIS_MODES"] as const) {
    const field = name === "JARVIS_GUEST" ? "guest" : "modes";
    for (const value of [undefined, "", "  ", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", [name]: value })[field], false, `${name} ${JSON.stringify(value)}`);
    assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", [name]: " on " })[field], true, name);
    for (const value of ["yes", "On", "true", "1"]) assert.throws(() => readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", [name]: value }), { message: `${name} must be on or off, not "${value}"` });
  }
  assert.equal(readConfig({ ...base, JARVIS_GUEST: "on" }).guest, true, "guest mode needs nothing from the hub");
  assert.throws(() => readConfig({ ...base, JARVIS_MODES: "on" }), { message: "JARVIS_MODES is on, but modes live in the hub, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_MODES=off" });
});

test("JARVIS_REMINDERS is off unless set to on, anything else stops Jarvis, and it needs the hub's tools", () => {
  for (const value of [undefined, "", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", JARVIS_REMINDERS: value }).reminders, false, JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", JARVIS_REMINDERS: " on " }).reminders, true);
  for (const value of ["yes", "On", "1"]) assert.throws(() => readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", JARVIS_REMINDERS: value }), { message: `JARVIS_REMINDERS must be on or off, not "${value}"` });
  assert.throws(() => readConfig({ ...base, JARVIS_REMINDERS: "on" }), { message: "JARVIS_REMINDERS is on, but reminders live in the hub, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_REMINDERS=off" });
});

test("JARVIS_PHONE is off unless set to on, anything else stops Jarvis, and it needs the hub's tools and ears", () => {
  const ready = { ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", JARVIS_EARS: "push", EARS_TOKEN: "e".repeat(64) };
  for (const value of [undefined, "", "off", " off "]) assert.equal(readConfig({ ...ready, JARVIS_PHONE: value }).phone, false, JSON.stringify(value));
  assert.equal(readConfig({ ...ready, JARVIS_PHONE: " on " }).phone, true);
  assert.equal(readConfig({ ...ready, JARVIS_EARS: "wake", JARVIS_PHONE: "on" }).phone, true);
  for (const value of ["yes", "On", "1"]) assert.throws(() => readConfig({ ...ready, JARVIS_PHONE: value }), { message: `JARVIS_PHONE must be on or off, not "${value}"` });
  assert.throws(() => readConfig({ ...ready, JARVIS_HUB_TOOLS: "off", JARVIS_PHONE: "on" }), { message: "JARVIS_PHONE is on, but recordings from the phone come through the hub, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_PHONE=off" });
  assert.throws(() => readConfig({ ...ready, JARVIS_EARS: "off", JARVIS_PHONE: "on" }), { message: "JARVIS_PHONE is on, but recordings from the phone are turned into words by ears' Whisper, so it needs JARVIS_EARS=push or wake too. Set that, or set JARVIS_PHONE=off" });
});

test("JARVIS_VOICES needs ears, JARVIS_OTHER_VOICES is answer, name or guest, the last two need voices on, and guest needs guest mode", () => {
  const ears = { ...base, JARVIS_EARS: "wake", EARS_TOKEN: "an-ears-token" };
  assert.equal(readConfig({ ...ears, JARVIS_VOICES: "on" }).voices, true);
  assert.equal(readConfig(ears).otherVoices, "answer");
  assert.equal(readConfig({ ...ears, JARVIS_VOICES: "on", JARVIS_OTHER_VOICES: " name " }).otherVoices, "name");
  assert.equal(readConfig({ ...ears, JARVIS_VOICES: "on", JARVIS_GUEST: "on", JARVIS_OTHER_VOICES: "guest" }).otherVoices, "guest");
  assert.throws(() => readConfig({ ...base, JARVIS_VOICES: "on" }), { message: "JARVIS_VOICES is on, but voices come from ears, so it needs JARVIS_EARS=push or wake too. Set that, or set JARVIS_VOICES=off" });
  assert.throws(() => readConfig({ ...ears, JARVIS_VOICES: "yes" }), { message: 'JARVIS_VOICES must be on or off, not "yes"' });
  assert.throws(() => readConfig({ ...ears, JARVIS_VOICES: "on", JARVIS_OTHER_VOICES: "ignore" }), { message: 'JARVIS_OTHER_VOICES must be answer, name or guest, not "ignore"' });
  assert.throws(() => readConfig({ ...ears, JARVIS_OTHER_VOICES: "name" }), { message: "JARVIS_OTHER_VOICES is name, but that needs JARVIS_VOICES=on. Set that, or set JARVIS_OTHER_VOICES=answer" });
  assert.throws(() => readConfig({ ...ears, JARVIS_VOICES: "on", JARVIS_OTHER_VOICES: "guest" }), { message: "JARVIS_OTHER_VOICES is guest, but that needs JARVIS_GUEST=on. Set that, or set JARVIS_OTHER_VOICES to answer or name" });
});

test("JARVIS_SESSIONS is off unless set to on, anything else stops Jarvis, and it needs the hub's tools", () => {
  assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", JARVIS_SESSIONS: " on " }).sessions, true);
  assert.equal(readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token" }).sessions, false);
  assert.throws(() => readConfig({ ...base, JARVIS_HUB_TOOLS: "on", API_TOKEN: "a-token", JARVIS_SESSIONS: "yes" }), { message: 'JARVIS_SESSIONS must be on or off, not "yes"' });
  assert.throws(() => readConfig({ ...base, JARVIS_SESSIONS: "on" }), { message: "JARVIS_SESSIONS is on, but the session manager is the hub's, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_SESSIONS=off" });
});

test("JARVIS_INTRO is off unless it's set to on, and anything else stops Jarvis saying what it must be", () => {
  for (const value of [undefined, "", "  ", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_INTRO: value }).intro, false, JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_INTRO: " on " }).intro, true);
  for (const value of ["yes", "On", "true", "1", "short"]) assert.throws(() => readConfig({ ...base, JARVIS_INTRO: value }), { message: `JARVIS_INTRO must be on or off, not "${value}"` });
});

test("JARVIS_CLOCK is off unless it's set to on, and anything else stops Jarvis saying what it must be", () => {
  for (const value of [undefined, "", "  ", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_CLOCK: value }).clock, false, JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_CLOCK: " on " }).clock, true);
  for (const value of ["yes", "On", "true", "1", "note"]) assert.throws(() => readConfig({ ...base, JARVIS_CLOCK: value }), { message: `JARVIS_CLOCK must be on or off, not "${value}"` });
});

test("JARVIS_WEB is off unless it's set to ask or auto, and anything else stops Jarvis saying what it must be", () => {
  for (const value of [undefined, "", "  ", "off", " off "]) assert.deepEqual([readConfig({ ...base, JARVIS_WEB: value }).web, readConfig({ ...base, JARVIS_WEB: value }).webToken], ["off", null], JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_WEB: " ask ", JARVIS_WEB_TOKEN: "plan-token" }).web, "ask");
  assert.equal(readConfig({ ...base, JARVIS_WEB: "auto", JARVIS_WEB_TOKEN: "plan-token" }).web, "auto");
  assert.throws(() => readConfig({ ...base, JARVIS_WEB: "auto" }), { message: "Missing setting: JARVIS_WEB_TOKEN (the token claude setup-token prints), which look-ups by Claude Code need" });
  assert.equal(readConfig({ ...base, JARVIS_WEB: "auto", JARVIS_WEB_BY: "api" }).web, "auto");
  for (const value of ["on", "Ask", "yes", "always", "Auto", "both"]) assert.throws(() => readConfig({ ...base, JARVIS_WEB: value, JARVIS_WEB_TOKEN: "plan-token" }), { message: `JARVIS_WEB must be off, ask or auto, not "${value}"` });
});

test("look-ups need the plan token, alone on its line, and an error about it never repeats it", () => {
  for (const token of [undefined, "", "   "]) assert.throws(() => readConfig({ ...base, JARVIS_WEB: "ask", JARVIS_WEB_TOKEN: token }), { message: "Missing setting: JARVIS_WEB_TOKEN (the token claude setup-token prints), which look-ups by Claude Code need" });
  assert.equal(readConfig({ ...base, JARVIS_WEB: "ask", JARVIS_WEB_TOKEN: "  plan-token\n" }).webToken, "plan-token");
  for (const token of ["plan token", "plan\ttoken", "export TOKEN=plan-token extra"]) {
    assert.throws(
      () => readConfig({ ...base, JARVIS_WEB: "ask", JARVIS_WEB_TOKEN: token }),
      (error: Error) => error.message === "JARVIS_WEB_TOKEN must be the token alone on one line, with no spaces in it" && !error.message.includes("plan"),
    );
  }
});

test("with look-ups off the token isn't needed, isn't checked and isn't kept", () => {
  assert.equal(readConfig({ ...base }).webToken, null);
  assert.equal(readConfig({ ...base, JARVIS_WEB_TOKEN: "plan-token" }).webToken, null);
  assert.equal(readConfig({ ...base, JARVIS_WEB: "off", JARVIS_WEB_TOKEN: "has spaces in it" }).webToken, null);
});

test("JARVIS_WEB_LOG is off unless it's set to on, and anything else stops Jarvis saying what it must be", () => {
  for (const value of [undefined, "", "  ", "off", " off "]) assert.equal(readConfig({ ...base, JARVIS_WEB_LOG: value }).webLog, false, JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_WEB_LOG: " on " }).webLog, true);
  for (const value of ["yes", "On", "true", "1", "words"]) assert.throws(() => readConfig({ ...base, JARVIS_WEB_LOG: value }), { message: `JARVIS_WEB_LOG must be on or off, not "${value}"` });
});

test("JARVIS_WEB_BY is claude unless it's set to api, and anything else stops Jarvis saying what it must be", () => {
  for (const value of [undefined, "", "  ", "claude", " claude "]) assert.equal(readConfig({ ...base, JARVIS_WEB_BY: value }).webBy, "claude", JSON.stringify(value));
  assert.equal(readConfig({ ...base, JARVIS_WEB_BY: " api " }).webBy, "api");
  for (const value of ["API", "sdk", "plan", "both", "on"]) assert.throws(() => readConfig({ ...base, JARVIS_WEB_BY: value }), { message: `JARVIS_WEB_BY must be claude or api, not "${value}"` });
});

test("look-ups by the API need no plan token and keep none, and look-ups by Claude Code still need one", () => {
  const byApi = readConfig({ ...base, JARVIS_WEB: "ask", JARVIS_WEB_BY: "api" });
  assert.deepEqual([byApi.web, byApi.webBy, byApi.webToken], ["ask", "api", null]);
  assert.equal(readConfig({ ...base, JARVIS_WEB: "ask", JARVIS_WEB_BY: "api", JARVIS_WEB_TOKEN: "plan-token" }).webToken, null);
  assert.equal(readConfig({ ...base, JARVIS_WEB: "ask", JARVIS_WEB_BY: "api", JARVIS_WEB_TOKEN: "has spaces" }).webToken, null);
  assert.throws(() => readConfig({ ...base, JARVIS_WEB: "ask", JARVIS_WEB_BY: "claude" }), { message: "Missing setting: JARVIS_WEB_TOKEN (the token claude setup-token prints), which look-ups by Claude Code need" });
});
