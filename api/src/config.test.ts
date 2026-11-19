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
  DEALS: "on",
  NTFY_TOPIC: "test-topic",
  HEALTHCHECK_URL: "https://hc-ping.com/test",
  DEALS_SEEN: "memory",
  EBAY_ENVIRONMENT: "production",
  EBAY_CLIENT_ID: "test-ebay-id",
  EBAY_CLIENT_SECRET: "test-ebay-secret",
  DEALS_AI: "off",
};

const allOff = { ...complete, ALERTS: "off", HEARTBEAT: "off", DAILY_SUMMARY: "off", MEMORY_INBOX: "off", MEMORY_UPLOAD: "off", DEALS: "off" };
const dealSettings = { seen: "memory", ebayEnvironment: "production", ebayClientId: "test-ebay-id", ebayClientSecret: "test-ebay-secret", ai: false };

test("reads every setting into its own field", () => {
  assert.deepEqual(readConfig(complete), {
    apiToken: "test-token",
    qbitApiKey: "test-qbit-key",
    jellyfinApiKey: "test-jellyfin-key",
    ntfyTopic: "test-topic",
    healthcheckUrl: "https://hc-ping.com/test",
    deals: dealSettings,
    features: { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true },
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
    "deals",
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
    message: "Missing settings in api/.env: API_TOKEN, QBIT_API_KEY, JELLYFIN_API_KEY, ALERTS, HEARTBEAT, DAILY_SUMMARY, MEMORY_INBOX, MEMORY_UPLOAD, DEALS",
  });
});

test("with every switch on and nothing else set, every other setting is named, in a fixed order", () => {
  assert.throws(() => readConfig({ ALERTS: "on", HEARTBEAT: "on", DAILY_SUMMARY: "on", MEMORY_INBOX: "on", MEMORY_UPLOAD: "on", DEALS: "on" }), {
    message: "Missing settings in api/.env: API_TOKEN, QBIT_API_KEY, JELLYFIN_API_KEY, NTFY_TOPIC, HEALTHCHECK_URL, DEALS_SEEN, EBAY_ENVIRONMENT, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, DEALS_AI",
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
    deals: true,
  });
  assert.deepEqual(readConfig({ ...complete, HEARTBEAT: "off" }).features, {
    alerts: true,
    heartbeat: false,
    dailySummary: true,
    memoryInbox: true,
    memoryUpload: true,
    deals: true,
  });
  assert.deepEqual(readConfig({ ...complete, DAILY_SUMMARY: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: false,
    memoryInbox: true,
    memoryUpload: true,
    deals: true,
  });
  assert.deepEqual(readConfig({ ...complete, MEMORY_INBOX: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: true,
    memoryInbox: false,
    memoryUpload: true,
    deals: true,
  });
  assert.deepEqual(readConfig({ ...complete, MEMORY_UPLOAD: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: true,
    memoryInbox: true,
    memoryUpload: false,
    deals: true,
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

test("the ntfy topic isn't needed when alerts, the daily summary and the deal watcher are all off", () => {
  const config = readConfig({ ...complete, ALERTS: "off", DAILY_SUMMARY: "off", DEALS: "off", NTFY_TOPIC: undefined });
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
  assert.deepEqual(config.features, { alerts: false, heartbeat: false, dailySummary: false, memoryInbox: false, memoryUpload: false, deals: false });
  assert.equal(config.ntfyTopic, "test-topic");
  assert.equal(config.healthcheckUrl, "https://hc-ping.com/test");
});

test("switchedOff lists nothing when everything is on", () => {
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true }), []);
});

test("switchedOff names each feature that's off, in plain words and a fixed order", () => {
  assert.deepEqual(switchedOff({ alerts: false, heartbeat: false, dailySummary: false, memoryInbox: false, memoryUpload: false, deals: false }), [
    "alerts",
    "heartbeat",
    "daily summary",
    "brain inbox",
    "note uploads",
    "deal watcher",
  ]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: false, memoryInbox: true, memoryUpload: true, deals: true }), ["daily summary"]);
  assert.deepEqual(switchedOff({ alerts: false, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true }), ["alerts"]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: false, memoryUpload: true, deals: true }), ["brain inbox"]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: false, deals: true }), ["note uploads"]);
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

const dealsOff = { ...complete, DEALS: "off", DEALS_SEEN: undefined, EBAY_ENVIRONMENT: undefined, EBAY_CLIENT_ID: undefined, EBAY_CLIENT_SECRET: undefined, DEALS_AI: undefined };

test("a missing DEALS is refused like any other switch", () => {
  assert.throws(() => readConfig({ ...complete, DEALS: undefined }), {
    message: "Missing settings in api/.env: DEALS",
  });
});

test("DEALS must be exactly on or off", () => {
  for (const value of ["yes", "On", "true", "sandbox"]) {
    assert.throws(() => readConfig({ ...complete, DEALS: value }), {
      message: "Settings in api/.env that must be on or off: DEALS",
    });
  }
});

test("with the deal watcher off, none of its settings are needed, and it shows as switched off", () => {
  const config = readConfig(dealsOff);
  assert.equal(config.features.deals, false);
  assert.deepEqual(config.deals, { seen: "memory", ebayEnvironment: "production", ebayClientId: "", ebayClientSecret: "", ai: false });
  assert.deepEqual(switchedOff(config.features), ["deal watcher"]);
});

test("with the deal watcher on, each of its settings is needed, and all the missing ones are named at once", () => {
  assert.throws(() => readConfig({ ...dealsOff, DEALS: "on" }), {
    message: "Missing settings in api/.env: DEALS_SEEN, EBAY_ENVIRONMENT, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, DEALS_AI",
  });
  for (const name of ["DEALS_SEEN", "EBAY_ENVIRONMENT", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "DEALS_AI"]) {
    assert.throws(() => readConfig({ ...complete, [name]: undefined }), { message: `Missing settings in api/.env: ${name}` });
    assert.throws(() => readConfig({ ...complete, [name]: "" }), { message: `Missing settings in api/.env: ${name}` });
  }
});

test("the deal watcher needs the ntfy topic even with alerts and the daily summary off", () => {
  assert.throws(() => readConfig({ ...complete, ALERTS: "off", DAILY_SUMMARY: "off", NTFY_TOPIC: undefined }), {
    message: "Missing settings in api/.env: NTFY_TOPIC",
  });
  assert.equal(readConfig({ ...dealsOff, ALERTS: "off", DAILY_SUMMARY: "off", NTFY_TOPIC: undefined }).ntfyTopic, "");
});

test("the deal watcher's settings are read as given", () => {
  const config = readConfig({ ...complete, DEALS_SEEN: "disk", EBAY_ENVIRONMENT: "sandbox", EBAY_CLIENT_ID: " id=with#odd ", EBAY_CLIENT_SECRET: "s3cret=" });
  assert.deepEqual(config.deals, { seen: "disk", ebayEnvironment: "sandbox", ebayClientId: " id=with#odd ", ebayClientSecret: "s3cret=", ai: false });
});

test("DEALS_SEEN must be memory or disk, exactly", () => {
  for (const value of ["file", "Memory", "DISK", "on", "off", " memory", "disk "]) {
    assert.throws(() => readConfig({ ...complete, DEALS_SEEN: value }), {
      message: "Settings in api/.env with a value that isn't allowed: DEALS_SEEN (memory or disk)",
    });
  }
});

test("EBAY_ENVIRONMENT must be production or sandbox, exactly", () => {
  for (const value of ["prod", "Production", "live", "test", "on"]) {
    assert.throws(() => readConfig({ ...complete, EBAY_ENVIRONMENT: value }), {
      message: "Settings in api/.env with a value that isn't allowed: EBAY_ENVIRONMENT (production or sandbox)",
    });
  }
});

test("a choice with a bad value is refused even while the deal watcher is off, so a typo can't wait for the day it's switched on", () => {
  assert.throws(() => readConfig({ ...dealsOff, DEALS_SEEN: "file" }), {
    message: "Settings in api/.env with a value that isn't allowed: DEALS_SEEN (memory or disk)",
  });
});

test("every kind of problem is reported together, in a fixed order", () => {
  assert.throws(() => readConfig({ ...complete, API_TOKEN: undefined, HEARTBEAT: "yes", DEALS_SEEN: "file", EBAY_ENVIRONMENT: "live", EBAY_CLIENT_SECRET: undefined }), {
    message:
      "Missing settings in api/.env: API_TOKEN, EBAY_CLIENT_SECRET. Settings in api/.env that must be on or off: HEARTBEAT. Settings in api/.env with a value that isn't allowed: DEALS_SEEN (memory or disk), EBAY_ENVIRONMENT (production or sandbox)",
  });
});

test("an error about the deal settings never includes the eBay keys or a bad value", () => {
  const env = { ...complete, EBAY_CLIENT_ID: "real-looking-id", EBAY_CLIENT_SECRET: "real-looking-secret", DEALS_SEEN: "somewhere-odd", NTFY_TOPIC: undefined };
  assert.throws(
    () => readConfig(env),
    (error: Error) => ["real-looking-id", "real-looking-secret", "somewhere-odd"].every((value) => !error.message.includes(value)),
  );
});

test("DEALS_AI is its own switch: exactly on or off, and off unless it says on", () => {
  assert.equal(readConfig({ ...complete, DEALS_AI: "on" }).deals.ai, true);
  assert.equal(readConfig({ ...complete, DEALS_AI: "off" }).deals.ai, false);
  assert.equal(readConfig(dealsOff).deals.ai, false);
  for (const value of ["ON", "true", "yes", "1", " on"]) {
    assert.throws(() => readConfig({ ...complete, DEALS_AI: value }), { message: "Settings in api/.env that must be on or off: DEALS_AI" });
    assert.throws(() => readConfig({ ...dealsOff, DEALS_AI: value }), { message: "Settings in api/.env that must be on or off: DEALS_AI" });
  }
});

test("with the deal watcher off, DEALS_AI=on changes nothing that's switched on", () => {
  const config = readConfig({ ...dealsOff, DEALS_AI: "on" });
  assert.equal(config.features.deals, false);
  assert.deepEqual(switchedOff(config.features), ["deal watcher"]);
});