import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMicBoostControl, defaultMicControl, defaultMicLevel, defaultVoiceIdThreshold, microphones, mostBoostSteps, readConfig, readMicSettings, readVoiceIdMode, readVoiceIdSettings, readVoiceIdThreshold, readWakeEnd, readWakePause, shortestToken, voiceIdModes, wakePauses } from "./config.js";

const token = "t".repeat(64);

const usual = { micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500, turnWords: false, interrupt: "off", voiceId: { mode: "off", threshold: 0.5 } };

test("reads the token, and with no microphone set there's nothing to record from", () => {
  assert.deepEqual(readConfig({ EARS_TOKEN: token }), { token, microphone: null, ...usual });
  assert.deepEqual(readConfig({ EARS_TOKEN: ` ${token} `, EARS_MICROPHONE: "" }), { token, microphone: null, ...usual });
  assert.deepEqual(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "   " }), { token, microphone: null, ...usual });
});

test("the microphone is the pretend one, or the sound card passed in", () => {
  assert.deepEqual(microphones, ["pretend", "card"]);
  assert.deepEqual(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "pretend" }), { token, microphone: "pretend", ...usual });
  assert.deepEqual(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: " card " }), { token, microphone: "card", ...usual });
  for (const value of ["Pretend", "Card", "real", "hw:2,0", "plughw:2,0", "default", "pci-0000:04:00.6", "on"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: value }), { message: `EARS_MICROPHONE must be pretend or card, or left out until a microphone is set up, not "${value}"` }, value);
  }
});

test("the mic's level is 80 on Capture unless set, any whole number from 0 to 100, or keep to leave the card's own", () => {
  assert.deepEqual([defaultMicLevel, defaultMicControl], [80, "Capture"]);
  for (const [value, level] of [["0", 0], ["100", 100], [" 55 ", 55], ["07", 7], ["keep", "keep"], ["", 80], ["  ", 80]] as const) {
    assert.equal(readConfig({ EARS_TOKEN: token, EARS_MIC_LEVEL: value }).micLevel, level, value);
  }
  for (const value of ["101", "-1", "50%", "5.5", "Keep", "1000", "eighty"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MIC_LEVEL: value }), { message: `EARS_MIC_LEVEL must be a whole number from 0 to 100, or keep to leave the card's own level, not "${value}"` }, value);
  }
});

test("the mic's control is any plain mixer control name, since it's passed to amixer as it is", () => {
  for (const value of ["Mic", "Internal Mic Boost", "Capture", "Headset Mic", "Mic_2", "PCM-Capture"]) assert.equal(readConfig({ EARS_TOKEN: token, EARS_MIC_CONTROL: ` ${value} ` }).micControl, value);
  for (const value of ["-q", "Capture;rm", "Mic'", "a".repeat(41), " Mic,0", "Mic\nBoost"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MIC_CONTROL: value }), { message: `EARS_MIC_CONTROL must be a mixer control's name, like Capture or Mic, as amixer scontrols lists them, not "${value.trim()}"` }, value);
  }
});

test("the mic's boost is left alone unless set, then any whole number of steps from 0 to 10", () => {
  assert.deepEqual([defaultMicBoostControl, mostBoostSteps], ["Internal Mic Boost", 10]);
  for (const [value, boost] of [[undefined, "keep"], ["", "keep"], ["  ", "keep"], ["keep", "keep"], [" keep ", "keep"], ["0", 0], ["1", 1], [" 3 ", 3], ["10", 10], ["03", 3]] as const) {
    assert.equal(readConfig({ EARS_TOKEN: token, EARS_MIC_BOOST: value }).micBoost, boost, String(value));
  }
  for (const value of ["11", "-1", "1.5", "Keep", "100", "010", "+1", "1 step", "max", "33%"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MIC_BOOST: value }), { message: `EARS_MIC_BOOST must be a whole number of steps from 0 to 10, or keep to leave the card's own boost, not "${value}"` }, value);
  }
});

test("the boost's control is Internal Mic Boost unless set, and any plain mixer control name", () => {
  for (const value of ["Mic Boost", "Internal Mic Boost", "Front Mic Boost", "Mic_2"]) assert.equal(readConfig({ EARS_TOKEN: token, EARS_MIC_BOOST_CONTROL: ` ${value} ` }).micBoostControl, value);
  assert.equal(readConfig({ EARS_TOKEN: token, EARS_MIC_BOOST_CONTROL: " " }).micBoostControl, "Internal Mic Boost");
  for (const value of ["-q", "Boost;rm", "Mic'", "a".repeat(41), "Mic\nBoost"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MIC_BOOST_CONTROL: value }), { message: `EARS_MIC_BOOST_CONTROL must be a mixer control's name, like Internal Mic Boost or Mic Boost, as amixer scontrols lists them, not "${value.trim()}"` }, value);
  }
});

test("the microphone's four settings can be read on their own, without a token, for the mic check", () => {
  assert.deepEqual(readMicSettings({}), { micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost" });
  assert.deepEqual(readMicSettings({ EARS_MIC_LEVEL: "100", EARS_MIC_CONTROL: "Mic", EARS_MIC_BOOST: "2", EARS_MIC_BOOST_CONTROL: "Mic Boost", EARS_TOKEN: "short" }), { micLevel: 100, micControl: "Mic", micBoost: 2, micBoostControl: "Mic Boost" });
  assert.throws(() => readMicSettings({ EARS_MIC_LEVEL: "loud" }), { message: /^EARS_MIC_LEVEL must be/ });
  assert.throws(() => readMicSettings({ EARS_MIC_BOOST: "loud" }), { message: /^EARS_MIC_BOOST must be/ });
});

test("a missing or short token stops ears, saying how to make one", () => {
  assert.equal(shortestToken, 32);
  for (const env of [{}, { EARS_TOKEN: "" }, { EARS_TOKEN: "   " }]) {
    assert.throws(() => readConfig(env), { message: "Missing setting: EARS_TOKEN. Make one with: openssl rand -hex 32" });
  }
  assert.throws(() => readConfig({ EARS_TOKEN: "t".repeat(31) }), { message: "EARS_TOKEN must be at least 32 characters, like the 64 that openssl rand -hex 32 makes" });
  assert.throws(() => readConfig({ EARS_TOKEN: ` ${"t".repeat(31)} ` }), { message: "EARS_TOKEN must be at least 32 characters, like the 64 that openssl rand -hex 32 makes" });
  assert.equal(readConfig({ EARS_TOKEN: "t".repeat(32) }).token.length, 32);
});

test("the token is checked before the microphone", () => {
  assert.throws(() => readConfig({ EARS_MICROPHONE: "real" }), { message: "Missing setting: EARS_TOKEN. Make one with: openssl rand -hex 32" });
});

test("the wake word is off unless EARS_WAKE is on, and on needs a microphone to listen with", () => {
  for (const value of [undefined, "", "  ", "off", " off "]) assert.equal(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "card", EARS_WAKE: value }).wake, false, String(value));
  assert.equal(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "card", EARS_WAKE: " on " }).wake, true);
  assert.equal(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "pretend", EARS_WAKE: "on" }).wake, true);
  assert.equal(readConfig({ EARS_TOKEN: token, EARS_WAKE: "off" }).wake, false);
  for (const value of ["On", "yes", "true", "1", "hey_jarvis"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "card", EARS_WAKE: value }), { message: `EARS_WAKE must be on or off, not "${value}"` }, value);
  }
  for (const microphone of [undefined, "", " "]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: microphone, EARS_WAKE: "on" }), { message: "EARS_WAKE is on, but EARS_MICROPHONE isn't set, so there's nothing to listen with. Set EARS_MICROPHONE=card, or pretend to try it out" });
  }
});

test("EARS_WAKE is checked after the microphone and its level", () => {
  assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "real", EARS_WAKE: "maybe" }), { message: /^EARS_MICROPHONE must be/ });
  assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "card", EARS_MIC_LEVEL: "loud", EARS_WAKE: "maybe" }), { message: /^EARS_MIC_LEVEL must be/ });
  assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "card", EARS_MIC_BOOST: "loud", EARS_WAKE: "maybe" }), { message: /^EARS_MIC_BOOST must be/ });
});

test("a wake recording ends after 1.5 seconds without speech unless EARS_WAKE_PAUSE says 1 to 5 seconds, to a tenth, and anything else stops ears, saying what it must be", () => {
  assert.deepEqual(wakePauses, { least: 1, most: 5, usual: 1.5 });
  for (const [value, ms] of [[undefined, 1500], ["", 1500], [" ", 1500], ["1", 1000], ["1.0", 1000], [" 2.5 ", 2500], ["3", 3000], ["4.9", 4900], ["5", 5000], ["5.0", 5000]] as const) {
    assert.equal(readConfig({ EARS_TOKEN: token, EARS_WAKE_PAUSE: value }).wakePauseMs, ms, String(value));
    assert.equal(readWakePause(value), ms, String(value));
  }
  for (const value of ["0.9", "0", "5.1", "6", "10", "1.25", "2.", ".5", "-2", "2s", "two", "2,5", "1e0", "0x2"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_WAKE_PAUSE: value }), { message: `EARS_WAKE_PAUSE must be a number of seconds from 1 to 5, with at most one decimal place, like 1.5 or 2.5, not "${value}"` }, value);
  }
});

test("interrupting is off unless EARS_INTERRUPT says wake or speech, and anything else stops ears, saying what it must be", () => {
  for (const [value, mode] of [[undefined, "off"], ["", "off"], ["  ", "off"], ["off", "off"], [" wake ", "wake"], ["speech", "speech"]] as const) assert.equal(readConfig({ EARS_TOKEN: token, EARS_INTERRUPT: value }).interrupt, mode, String(value));
  for (const value of ["on", "WAKE", "yes", "both"]) assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_INTERRUPT: value }), { message: `EARS_INTERRUPT must be off, wake or speech, not "${value}"` }, value);
});

test("the word check is off unless EARS_TURN_WORDS says on, and anything else stops ears, saying what it must be", () => {
  for (const [value, on] of [[undefined, false], ["", false], ["off", false], [" off ", false], ["on", true], [" on ", true]] as const) assert.equal(readConfig({ EARS_TOKEN: token, EARS_TURN_WORDS: value }).turnWords, on, String(value));
  for (const value of ["yes", "ON", "true", "1"]) assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_TURN_WORDS: value }), { message: `EARS_TURN_WORDS must be on or off, not "${value}"` }, value);
});

test("a wake recording ends on loudness unless EARS_WAKE_END says silero, and anything else stops ears, saying what it must be", () => {
  for (const [value, end] of [[undefined, "loudness"], ["", "loudness"], [" ", "loudness"], ["loudness", "loudness"], [" silero ", "silero"]] as const) {
    assert.equal(readConfig({ EARS_TOKEN: token, EARS_WAKE_END: value }).wakeEnd, end, String(value));
    assert.equal(readWakeEnd(value), end, String(value));
  }
  for (const value of ["Silero", "vad", "detector", "on", "loud"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_WAKE_END: value }), { message: `EARS_WAKE_END must be loudness or silero, not "${value}"` }, value);
  }
});

test("voice ID is off unless EARS_VOICE_ID says observe or require, and anything else stops ears, saying what it must be", () => {
  assert.deepEqual(voiceIdModes, ["off", "observe", "require"]);
  for (const [value, mode] of [[undefined, "off"], ["", "off"], [" ", "off"], ["off", "off"], [" observe ", "observe"], ["require", "require"]] as const) {
    assert.equal(readConfig({ EARS_TOKEN: token, EARS_VOICE_ID: value }).voiceId?.mode, mode, String(value));
    assert.equal(readVoiceIdMode(value), mode, String(value));
  }
  for (const value of ["on", "Off", "Require", "block", "yes", "1"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_VOICE_ID: value }), { message: `EARS_VOICE_ID must be off, observe or require, not "${value}"` }, value);
  }
});

test("voice ID's threshold is 0.5 unless EARS_VOICE_ID_THRESHOLD says a number above 0 and below 1 to two places, and anything else stops ears, saying what it must be", () => {
  assert.equal(defaultVoiceIdThreshold, 0.5);
  for (const [value, threshold] of [[undefined, 0.5], ["", 0.5], [" ", 0.5], ["0.01", 0.01], ["0.4", 0.4], [" 0.45 ", 0.45], ["0.99", 0.99], ["0.50", 0.5]] as const) {
    assert.equal(readConfig({ EARS_TOKEN: token, EARS_VOICE_ID_THRESHOLD: value }).voiceId?.threshold, threshold, String(value));
    assert.equal(readVoiceIdThreshold(value), threshold, String(value));
  }
  for (const value of ["0", "0.0", "0.00", "1", "1.0", "0.455", ".5", "0.", "-0.5", "50%", "half", "0,5", "5e-1"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_VOICE_ID_THRESHOLD: value }), { message: `EARS_VOICE_ID_THRESHOLD must be a number above 0 and below 1, with up to 2 decimal places, like 0.5 or 0.45, not "${value}"` }, value);
  }
});

test("voice ID's two settings can be read on their own, without a token, for the voice tools", () => {
  assert.deepEqual(readVoiceIdSettings({}), { mode: "off", threshold: 0.5 });
  assert.deepEqual(readVoiceIdSettings({ EARS_VOICE_ID: "observe", EARS_VOICE_ID_THRESHOLD: "0.6", EARS_TOKEN: "short" }), { mode: "observe", threshold: 0.6 });
});
