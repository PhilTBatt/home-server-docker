import assert from "node:assert/strict";
import { test } from "node:test";
import { microphones, readConfig, shortestToken } from "./config.js";

const token = "t".repeat(64);

test("reads the token, and with no microphone set there's nothing to record from", () => {
  assert.deepEqual(readConfig({ EARS_TOKEN: token }), { token, microphone: null });
  assert.deepEqual(readConfig({ EARS_TOKEN: ` ${token} `, EARS_MICROPHONE: "" }), { token, microphone: null });
  assert.deepEqual(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "   " }), { token, microphone: null });
});

test("the pretend microphone is the only one there is for now", () => {
  assert.deepEqual(microphones, ["pretend"]);
  assert.deepEqual(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: "pretend" }), { token, microphone: "pretend" });
  assert.deepEqual(readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: " pretend " }), { token, microphone: "pretend" });
  for (const value of ["Pretend", "real", "hw:2,0", "plughw:2,0", "default", "pci-0000:04:00.6", "on"]) {
    assert.throws(() => readConfig({ EARS_TOKEN: token, EARS_MICROPHONE: value }), { message: `EARS_MICROPHONE must be pretend, or left out until a real microphone is set up, not "${value}"` }, value);
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
