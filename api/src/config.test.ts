import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig, switchedOff } from "./config.js";

const complete = {
  API_TOKEN: "test-token",
  QBIT_API_KEY: "test-qbit-key",
  JELLYFIN_API_KEY: "test-jellyfin-key",
  ALERTS: "on",
  HEARTBEAT: "on",
  DAILY_SUMMARY: "on",
  MEMORY_INBOX: "on",
  MEMORY_UPLOAD: "on",
  NTFY_TOPIC: "test-topic",
  HEALTHCHECK_URL: "https://hc-ping.com/test",
};

const allOff = { ...complete, ALERTS: "off", HEARTBEAT: "off", DAILY_SUMMARY: "off", MEMORY_INBOX: "off", MEMORY_UPLOAD: "off" };

test("reads every setting into its own field", () => {
  assert.deepEqual(readConfig(complete), {
    apiToken: "test-token",
    qbitApiKey: "test-qbit-key",
    jellyfinApiKey: "test-jellyfin-key",
    ntfyTopic: "test-topic",
    healthcheckUrl: "https://hc-ping.com/test",
    features: { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true },
  });
});

test("ignores anything else in the environment", () => {
  const config = readConfig({ ...complete, PATH: "/usr/bin", HOME: "/home/node" });
  assert.deepEqual(Object.keys(config), [
    "apiToken",
    "qbitApiKey",
    "jellyfinApiKey",
    "ntfyTopic",
    "healthcheckUrl",
    "features",
  ]);
});

test("keeps values exactly as given", () => {
  const config = readConfig({ ...complete, API_TOKEN: " a=b#c " });
  assert.equal(config.apiToken, " a=b#c ");
});

test("a missing setting is named in the error", () => {
  assert.throws(() => readConfig({ ...complete, NTFY_TOPIC: undefined }), {
    message: "Missing settings in api/.env: NTFY_TOPIC",
  });
});

test("an empty setting counts as missing", () => {
  assert.throws(() => readConfig({ ...complete, HEALTHCHECK_URL: "" }), {
    message: "Missing settings in api/.env: HEALTHCHECK_URL",
  });
});

test("with nothing set, the always-needed settings and every switch are named, in a fixed order", () => {
  assert.throws(() => readConfig({}), {
    message: "Missing settings in api/.env: API_TOKEN, QBIT_API_KEY, JELLYFIN_API_KEY, ALERTS, HEARTBEAT, DAILY_SUMMARY, MEMORY_INBOX, MEMORY_UPLOAD",
  });
});

test("with every switch on and nothing else set, every other setting is named, in a fixed order", () => {
  assert.throws(() => readConfig({ ALERTS: "on", HEARTBEAT: "on", DAILY_SUMMARY: "on", MEMORY_INBOX: "on", MEMORY_UPLOAD: "on" }), {
    message: "Missing settings in api/.env: API_TOKEN, QBIT_API_KEY, JELLYFIN_API_KEY, NTFY_TOPIC, HEALTHCHECK_URL",
  });
});

test("the error never includes a setting's value", () => {
  const env = { ...complete, QBIT_API_KEY: undefined, NTFY_TOPIC: "", ALERTS: "maybe" };
  const secrets = [complete.API_TOKEN, complete.JELLYFIN_API_KEY, complete.HEALTHCHECK_URL, "maybe"];
  assert.throws(
    () => readConfig(env),
    (error: Error) => secrets.every((value) => !error.message.includes(value)),
  );
});

test("the environment passed in is left unchanged", () => {
  const env = { ...complete };
  readConfig(env);
  assert.deepEqual(env, complete);
});

test("each switch can be turned off on its own", () => {
  assert.deepEqual(readConfig({ ...complete, ALERTS: "off" }).features, {
    alerts: false,
    heartbeat: true,
    dailySummary: true,
    memoryInbox: true,
    memoryUpload: true,
  });
  assert.deepEqual(readConfig({ ...complete, HEARTBEAT: "off" }).features, {
    alerts: true,
    heartbeat: false,
    dailySummary: true,
    memoryInbox: true,
    memoryUpload: true,
  });
  assert.deepEqual(readConfig({ ...complete, DAILY_SUMMARY: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: false,
    memoryInbox: true,
    memoryUpload: true,
  });
  assert.deepEqual(readConfig({ ...complete, MEMORY_INBOX: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: true,
    memoryInbox: false,
    memoryUpload: true,
  });
  assert.deepEqual(readConfig({ ...complete, MEMORY_UPLOAD: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: true,
    memoryInbox: true,
    memoryUpload: false,
  });
});

test("a missing switch is refused like any other setting", () => {
  assert.throws(() => readConfig({ ...complete, HEARTBEAT: undefined }), {
    message: "Missing settings in api/.env: HEARTBEAT",
  });
});

test("a switch that isn't exactly on or off is refused by name", () => {
  for (const value of ["yes", "true", "1", "On", "OFF", " on", "on "]) {
    assert.throws(() => readConfig({ ...complete, ALERTS: value }), {
      message: "Settings in api/.env that must be on or off: ALERTS",
    });
  }
});

test("every switch with a bad value is named at once", () => {
  assert.throws(() => readConfig({ ...complete, ALERTS: "yes", DAILY_SUMMARY: "no" }), {
    message: "Settings in api/.env that must be on or off: ALERTS, DAILY_SUMMARY",
  });
});

test("missing settings and bad switches are reported together in one error", () => {
  assert.throws(() => readConfig({ ...complete, API_TOKEN: undefined, HEARTBEAT: "yes" }), {
    message: "Missing settings in api/.env: API_TOKEN. Settings in api/.env that must be on or off: HEARTBEAT",
  });
});

test("the ping address is only needed when the heartbeat is on", () => {
  const config = readConfig({ ...complete, HEARTBEAT: "off", HEALTHCHECK_URL: undefined });
  assert.equal(config.features.heartbeat, false);
  assert.equal(config.healthcheckUrl, "");
});

test("the ntfy topic is needed when alerts are on, even with the daily summary off", () => {
  assert.throws(() => readConfig({ ...complete, DAILY_SUMMARY: "off", NTFY_TOPIC: undefined }), {
    message: "Missing settings in api/.env: NTFY_TOPIC",
  });
});

test("the ntfy topic is needed when the daily summary is on, even with alerts off", () => {
  assert.throws(() => readConfig({ ...complete, ALERTS: "off", NTFY_TOPIC: undefined }), {
    message: "Missing settings in api/.env: NTFY_TOPIC",
  });
});

test("the ntfy topic isn't needed when alerts and the daily summary are both off", () => {
  const config = readConfig({ ...complete, ALERTS: "off", DAILY_SUMMARY: "off", NTFY_TOPIC: undefined });
  assert.equal(config.ntfyTopic, "");
});

test("a switch with a bad value doesn't make its settings required", () => {
  assert.throws(() => readConfig({ ...allOff, HEARTBEAT: "yes", HEALTHCHECK_URL: undefined }), {
    message: "Settings in api/.env that must be on or off: HEARTBEAT",
  });
});

test("the API token and service keys are needed even with every feature off", () => {
  assert.throws(
    () => readConfig({ ...allOff, API_TOKEN: undefined, QBIT_API_KEY: undefined, JELLYFIN_API_KEY: undefined }),
    { message: "Missing settings in api/.env: API_TOKEN, QBIT_API_KEY, JELLYFIN_API_KEY" },
  );
});

test("everything off still works when the feature settings are present", () => {
  const config = readConfig(allOff);
  assert.deepEqual(config.features, { alerts: false, heartbeat: false, dailySummary: false, memoryInbox: false, memoryUpload: false });
  assert.equal(config.ntfyTopic, "test-topic");
  assert.equal(config.healthcheckUrl, "https://hc-ping.com/test");
});

test("switchedOff lists nothing when everything is on", () => {
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true }), []);
});

test("switchedOff names each feature that's off, in plain words and a fixed order", () => {
  assert.deepEqual(switchedOff({ alerts: false, heartbeat: false, dailySummary: false, memoryInbox: false, memoryUpload: false }), [
    "alerts",
    "heartbeat",
    "daily summary",
    "brain inbox",
    "note uploads",
  ]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: false, memoryInbox: true, memoryUpload: true }), ["daily summary"]);
  assert.deepEqual(switchedOff({ alerts: false, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true }), ["alerts"]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: false, memoryUpload: true }), ["brain inbox"]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: false }), ["note uploads"]);
});

test("switchedOff agrees with what readConfig reads", () => {
  const config = readConfig({ ...complete, HEARTBEAT: "off" });
  assert.deepEqual(switchedOff(config.features), ["heartbeat"]);
});

test("the brain inbox switch needs no other setting", () => {
  assert.equal(readConfig({ ...allOff, MEMORY_INBOX: "on", NTFY_TOPIC: undefined, HEALTHCHECK_URL: undefined }).features.memoryInbox, true);
});

test("a missing MEMORY_INBOX is refused, so the brain inbox can't switch itself off quietly", () => {
  assert.throws(() => readConfig({ ...complete, MEMORY_INBOX: undefined }), {
    message: "Missing settings in api/.env: MEMORY_INBOX",
  });
});

test("MEMORY_INBOX must be exactly on or off", () => {
  assert.throws(() => readConfig({ ...complete, MEMORY_INBOX: "yes" }), {
    message: "Settings in api/.env that must be on or off: MEMORY_INBOX",
  });
});

test("a missing MEMORY_UPLOAD is refused like any other switch", () => {
  assert.throws(() => readConfig({ ...complete, MEMORY_UPLOAD: undefined }), {
    message: "Missing settings in api/.env: MEMORY_UPLOAD",
  });
});

test("MEMORY_UPLOAD must be exactly on or off", () => {
  assert.throws(() => readConfig({ ...complete, MEMORY_UPLOAD: "On" }), {
    message: "Settings in api/.env that must be on or off: MEMORY_UPLOAD",
  });
});

test("note uploads and the inbox count switch separately", () => {
  const features = readConfig({ ...complete, MEMORY_INBOX: "off", MEMORY_UPLOAD: "on" }).features;
  assert.equal(features.memoryInbox, false);
  assert.equal(features.memoryUpload, true);
  assert.deepEqual(switchedOff(features), ["brain inbox"]);
});