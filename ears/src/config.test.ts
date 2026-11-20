import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMicControl, defaultMicLevel, microphones, readConfig, shortestToken } from "./config.js";

const token = "t".repeat(64);

const usual = { micLevel: 80, micControl: "Capture" };

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
