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
  FIND_PHONE: "on",
  TRAINS: "on",
  NTFY_TOPIC: "test-topic",
  HEALTHCHECK_URL: "https://hc-ping.com/test",
  DEALS_SEEN: "memory",
  EBAY_ENVIRONMENT: "production",
  EBAY_CLIENT_ID: "test-ebay-id",
  EBAY_CLIENT_SECRET: "test-ebay-secret",
  DEALS_AI: "off",
  RAIL_DATA_KEY: "test-rail-key",
  TRAINS_FROM: "AAA",
  TRAINS_TO: "BBB",
  TRAINS_BOARD_URL: "https://api1.raildata.org.uk/test-board/",
  TRAIN_ALERTS: "on",
  TRAIN_ALERT_DAYS: "mon,wed",
  TRAIN_ALERT_WINDOW: "07:00-08:30",
  TRAIN_ALERT_REMINDER: "06:45",
  EXPIRY_ALERTS: "on",
  WATCHERS: "on",
};

const allOff = { ...complete, ALERTS: "off", HEARTBEAT: "off", DAILY_SUMMARY: "off", MEMORY_INBOX: "off", MEMORY_UPLOAD: "off", DEALS: "off", FIND_PHONE: "off", TRAINS: "off", TRAIN_ALERTS: "off", EXPIRY_ALERTS: "off", WATCHERS: "off" };
const dealSettings = { seen: "memory", ebayEnvironment: "production", ebayClientId: "test-ebay-id", ebayClientSecret: "test-ebay-secret", ai: false };

test("reads every setting into its own field", () => {
  assert.deepEqual(readConfig(complete), {
    apiToken: "test-token",
    qbitApiKey: "test-qbit-key",
    jellyfinApiKey: "test-jellyfin-key",
    ntfyTopic: "test-topic",
    healthcheckUrl: "https://hc-ping.com/test",
    deals: dealSettings,
    trains: { key: "test-rail-key", from: "AAA", to: "BBB", boardUrl: "https://api1.raildata.org.uk/test-board" },
    trainAlerts: { days: ["mon", "wed"], start: 420, end: 510, reminder: 405 },
    features: { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true },
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
    "trains",
    "trainAlerts",
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
    message: "Missing settings in api/.env: API_TOKEN, QBIT_API_KEY, JELLYFIN_API_KEY, ALERTS, HEARTBEAT, DAILY_SUMMARY, MEMORY_INBOX, MEMORY_UPLOAD, DEALS, FIND_PHONE, TRAINS, TRAIN_ALERTS, EXPIRY_ALERTS, WATCHERS",
  });
});

test("with every switch on and nothing else set, every other setting is named, in a fixed order", () => {
  assert.throws(() => readConfig({ ALERTS: "on", HEARTBEAT: "on", DAILY_SUMMARY: "on", MEMORY_INBOX: "on", MEMORY_UPLOAD: "on", DEALS: "on", FIND_PHONE: "on", TRAINS: "on", TRAIN_ALERTS: "on", EXPIRY_ALERTS: "on", WATCHERS: "on" }), {
    message: "Missing settings in api/.env: API_TOKEN, QBIT_API_KEY, JELLYFIN_API_KEY, NTFY_TOPIC, HEALTHCHECK_URL, DEALS_SEEN, EBAY_ENVIRONMENT, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, DEALS_AI, RAIL_DATA_KEY, TRAINS_FROM, TRAINS_TO, TRAINS_BOARD_URL, TRAIN_ALERT_DAYS, TRAIN_ALERT_WINDOW, TRAIN_ALERT_REMINDER",
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
    findPhone: true,
    trains: true,
    trainAlerts: true,
    expiryAlerts: true,
    watchers: true,
  });
  assert.deepEqual(readConfig({ ...complete, HEARTBEAT: "off" }).features, {
    alerts: true,
    heartbeat: false,
    dailySummary: true,
    memoryInbox: true,
    memoryUpload: true,
    deals: true,
    findPhone: true,
    trains: true,
    trainAlerts: true,
    expiryAlerts: true,
    watchers: true,
  });
  assert.deepEqual(readConfig({ ...complete, DAILY_SUMMARY: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: false,
    memoryInbox: true,
    memoryUpload: true,
    deals: true,
    findPhone: true,
    trains: true,
    trainAlerts: true,
    expiryAlerts: true,
    watchers: true,
  });
  assert.deepEqual(readConfig({ ...complete, MEMORY_INBOX: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: true,
    memoryInbox: false,
    memoryUpload: true,
    deals: true,
    findPhone: true,
    trains: true,
    trainAlerts: true,
    expiryAlerts: true,
    watchers: true,
  });
  assert.deepEqual(readConfig({ ...complete, MEMORY_UPLOAD: "off" }).features, {
    alerts: true,
    heartbeat: true,
    dailySummary: true,
    memoryInbox: true,
    memoryUpload: false,
    deals: true,
    findPhone: true,
    trains: true,
    trainAlerts: true,
    expiryAlerts: true,
    watchers: true,
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

test("the ntfy topic is needed when finding the phone is on, even with everything else that sends to it off", () => {
  assert.throws(() => readConfig({ ...complete, ALERTS: "off", DAILY_SUMMARY: "off", DEALS: "off", NTFY_TOPIC: undefined }), {
    message: "Missing settings in api/.env: NTFY_TOPIC",
  });
});

test("the ntfy topic is needed when train alerts are on, even with everything else that sends to it off", () => {
  assert.throws(() => readConfig({ ...complete, ALERTS: "off", DAILY_SUMMARY: "off", DEALS: "off", FIND_PHONE: "off", NTFY_TOPIC: undefined }), {
    message: "Missing settings in api/.env: NTFY_TOPIC",
  });
});

test("the ntfy topic is needed when expiry alerts are on, even with everything else that sends to it off", () => {
  assert.throws(() => readConfig({ ...complete, ALERTS: "off", DAILY_SUMMARY: "off", DEALS: "off", FIND_PHONE: "off", TRAIN_ALERTS: "off", NTFY_TOPIC: undefined }), {
    message: "Missing settings in api/.env: NTFY_TOPIC",
  });
});

test("the ntfy topic isn't needed when alerts, the daily summary, the deal watcher, finding the phone, train alerts, expiry alerts and watchers are all off", () => {
  const config = readConfig({ ...complete, ALERTS: "off", DAILY_SUMMARY: "off", DEALS: "off", FIND_PHONE: "off", TRAIN_ALERTS: "off", EXPIRY_ALERTS: "off", WATCHERS: "off", NTFY_TOPIC: undefined });
  assert.equal(config.ntfyTopic, "");
});

test("EXPIRY_ALERTS must be written out, as exactly on or off, and needs no setting but the ntfy topic", () => {
  assert.throws(() => readConfig({ ...complete, EXPIRY_ALERTS: undefined }), { message: "Missing settings in api/.env: EXPIRY_ALERTS" });
  for (const value of ["yes", "On", "true", " on"]) assert.throws(() => readConfig({ ...complete, EXPIRY_ALERTS: value }), { message: "Settings in api/.env that must be on or off: EXPIRY_ALERTS" }, value);
  assert.equal(readConfig({ ...complete, EXPIRY_ALERTS: "off" }).features.expiryAlerts, false);
  const on = readConfig({ ...allOff, EXPIRY_ALERTS: "on", HEALTHCHECK_URL: undefined });
  assert.deepEqual(switchedOff(on.features), ["alerts", "heartbeat", "daily summary", "brain inbox", "note uploads", "deal watcher", "find my phone", "train times", "train alerts", "watchers"]);
});

test("WATCHERS must be written out, as exactly on or off, and needs no setting but the ntfy topic", () => {
  assert.throws(() => readConfig({ ...complete, WATCHERS: undefined }), { message: "Missing settings in api/.env: WATCHERS" });
  for (const value of ["yes", "On", "true", " on"]) assert.throws(() => readConfig({ ...complete, WATCHERS: value }), { message: "Settings in api/.env that must be on or off: WATCHERS" }, value);
  assert.equal(readConfig({ ...complete, WATCHERS: "off" }).features.watchers, false);
  const on = readConfig({ ...allOff, WATCHERS: "on", HEALTHCHECK_URL: undefined });
  assert.deepEqual(switchedOff(on.features), ["alerts", "heartbeat", "daily summary", "brain inbox", "note uploads", "deal watcher", "find my phone", "train times", "train alerts", "expiry alerts"]);
  assert.throws(() => readConfig({ ...allOff, WATCHERS: "on", NTFY_TOPIC: undefined }), { message: "Missing settings in api/.env: NTFY_TOPIC" });
});

test("FIND_PHONE must be written out, as exactly on or off", () => {
  assert.throws(() => readConfig({ ...complete, FIND_PHONE: undefined }), { message: "Missing settings in api/.env: FIND_PHONE" });
  assert.throws(() => readConfig({ ...complete, FIND_PHONE: "yes" }), { message: "Settings in api/.env that must be on or off: FIND_PHONE" });
  assert.equal(readConfig({ ...complete, FIND_PHONE: "off" }).features.findPhone, false);
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
  assert.deepEqual(config.features, { alerts: false, heartbeat: false, dailySummary: false, memoryInbox: false, memoryUpload: false, deals: false, findPhone: false, trains: false, trainAlerts: false, expiryAlerts: false, watchers: false });
  assert.equal(config.ntfyTopic, "test-topic");
  assert.equal(config.healthcheckUrl, "https://hc-ping.com/test");
});

test("switchedOff lists nothing when everything is on", () => {
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true }), []);
});

test("switchedOff names each feature that's off, in plain words and a fixed order", () => {
  assert.deepEqual(switchedOff({ alerts: false, heartbeat: false, dailySummary: false, memoryInbox: false, memoryUpload: false, deals: false, findPhone: false, trains: false, trainAlerts: false, expiryAlerts: false, watchers: false }), [
    "alerts",
    "heartbeat",
    "daily summary",
    "brain inbox",
    "note uploads",
    "deal watcher",
    "find my phone",
    "train times",
    "train alerts",
    "expiry alerts",
    "watchers",
  ]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: false, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true }), ["daily summary"]);
  assert.deepEqual(switchedOff({ alerts: false, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true }), ["alerts"]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: false, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true }), ["brain inbox"]);
  assert.deepEqual(switchedOff({ alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: false, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true }), ["note uploads"]);
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
  assert.equal(readConfig({ ...dealsOff, ALERTS: "off", DAILY_SUMMARY: "off", FIND_PHONE: "off", TRAIN_ALERTS: "off", EXPIRY_ALERTS: "off", WATCHERS: "off", NTFY_TOPIC: undefined }).ntfyTopic, "");
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

test("train times need the rail key, both stations and the board's address while they're on, and not while they're off", () => {
  assert.throws(() => readConfig({ ...complete, RAIL_DATA_KEY: undefined, TRAINS_FROM: undefined, TRAINS_TO: "", TRAINS_BOARD_URL: undefined }), {
    message: "Missing settings in api/.env: RAIL_DATA_KEY, TRAINS_FROM, TRAINS_TO, TRAINS_BOARD_URL",
  });
  const off = readConfig({ ...complete, TRAINS: "off", TRAIN_ALERTS: "off", RAIL_DATA_KEY: undefined, TRAINS_FROM: undefined, TRAINS_TO: undefined, TRAINS_BOARD_URL: undefined });
  assert.deepEqual([off.features.trains, off.trains], [false, { key: "", from: "", to: "", boardUrl: "" }]);
});

test("a station must be three capital letters, and the board an https address on raildata.org.uk, even while train times are off", () => {
  for (const station of ["aaa", "AAAA", "AA", "A1B", " AAA"]) {
    assert.throws(() => readConfig({ ...complete, TRAINS_TO: station }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_TO (a station's three-letter code in capitals, like KGX)" }, station);
  }
  for (const url of ["http://api1.raildata.org.uk/board", "https://raildata.org.uk.example.com/board", "https://example.com/raildata.org.uk", "https://user:pass@api1.raildata.org.uk/board", "https://api1.raildata.org.uk/board?x=1", "https://api1.raildata.org.uk/board#x", "https://api1.raildata.org.uk/LDBWS/api/20220120/GetDepartureBoard/{crs}", "not a url"]) {
    assert.throws(() => readConfig({ ...complete, TRAINS: "off", TRAIN_ALERTS: "off", TRAINS_BOARD_URL: url }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_BOARD_URL (an https address on raildata.org.uk ending just before the station code, with no ?, # or {crs} part)" }, url);
  }
  assert.equal(readConfig({ ...complete, TRAINS_BOARD_URL: "https://raildata.org.uk/x//" }).trains.boardUrl, "https://raildata.org.uk/x");
});

test("an error about the train settings never includes the rail key", () => {
  assert.throws(() => readConfig({ ...complete, RAIL_DATA_KEY: "secret-rail-key", TRAINS_FROM: "bad" }), (error: Error) => !error.message.includes("secret-rail-key"));
});

test("TRAINS must be written out, as exactly on or off", () => {
  assert.throws(() => readConfig({ ...complete, TRAINS: undefined }), { message: "Missing settings in api/.env: TRAINS" });
  assert.throws(() => readConfig({ ...complete, TRAINS: "yes" }), { message: "Settings in api/.env that must be on or off: TRAINS" });
});

test("the rail key must be printable with no spaces, said without its value, and the two stations must differ", () => {
  for (const key of ["a key", "key\u0001", "k\u00e9y"]) {
    assert.throws(() => readConfig({ ...complete, RAIL_DATA_KEY: key }), (error: Error) => error.message === "Settings in api/.env with a value that isn't allowed: RAIL_DATA_KEY (printable characters with no spaces)" && !error.message.includes(key), key);
  }
  assert.throws(() => readConfig({ ...complete, TRAINS_TO: "AAA" }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_TO (a different station from TRAINS_FROM)" });
});


const alertsOff = { ...complete, TRAIN_ALERTS: "off", TRAIN_ALERT_DAYS: undefined, TRAIN_ALERT_WINDOW: undefined, TRAIN_ALERT_REMINDER: undefined };

const journey = { TRAINS_CHANGE_AT: "CCC", TRAINS_CHANGE_MINUTES: "3", RAIL_ARRIVALS_KEY: "test-arrivals-key", TRAINS_ARRIVALS_URL: "https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails", TRAINS_BOARD_URL: "https://api1.raildata.org.uk/test-board/GetDepartureBoard" };

test("with a change station, train times follow the journey through it, with the walk, the arrival board's key and address, and the detailed board next to the plain one", () => {
  assert.deepEqual(readConfig({ ...complete, ...journey }).trains, {
    key: "test-rail-key",
    from: "AAA",
    to: "BBB",
    boardUrl: "https://api1.raildata.org.uk/test-board/GetDepartureBoard",
    journey: { at: "CCC", walk: 3, arrivalsKey: "test-arrivals-key", arrivalsUrl: "https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails", detailsUrl: "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails" },
  });
  assert.equal(readConfig({ ...complete, ...journey, TRAINS_BOARD_URL: "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails" }).trains.journey?.detailsUrl, "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails");
  assert.equal("journey" in readConfig(complete).trains, false, "without one, train times are as before");
  assert.equal(readConfig({ ...complete, TRAINS_CHANGE_MINUTES: "3", RAIL_ARRIVALS_KEY: "test-arrivals-key" }).trains.journey, undefined, "the other journey settings do nothing on their own");
});

test("a change station needs the walk and the arrival board's key and address while train times are on, and not while they're off", () => {
  assert.throws(() => readConfig({ ...complete, TRAINS_CHANGE_AT: "CCC", TRAINS_BOARD_URL: journey.TRAINS_BOARD_URL }), { message: "Missing settings in api/.env: TRAINS_CHANGE_MINUTES, RAIL_ARRIVALS_KEY, TRAINS_ARRIVALS_URL" });
  assert.equal(readConfig({ ...complete, TRAINS: "off", TRAIN_ALERTS: "off", TRAINS_CHANGE_AT: "CCC", TRAINS_BOARD_URL: journey.TRAINS_BOARD_URL }).features.trains, false);
});

test("the change station, walk and arrival board's address are checked, and the arrival key is never shown", () => {
  for (const station of ["ccc", "CC", "CCCC", "C C"]) assert.throws(() => readConfig({ ...complete, ...journey, TRAINS_CHANGE_AT: station }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_CHANGE_AT (a station's three-letter code in capitals, like KGX)" }, station);
  for (const station of ["AAA", "BBB"]) assert.throws(() => readConfig({ ...complete, ...journey, TRAINS_CHANGE_AT: station }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_CHANGE_AT (a different station from TRAINS_FROM and TRAINS_TO)" }, station);
  for (const walk of ["0", "31", "3.5", "-1", "three", "100"]) assert.throws(() => readConfig({ ...complete, ...journey, TRAINS_CHANGE_MINUTES: walk }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_CHANGE_MINUTES (a whole number of minutes from 1 to 30, like 3)" }, walk);
  for (const walk of ["1", "30", "04"]) assert.equal(readConfig({ ...complete, ...journey, TRAINS_CHANGE_MINUTES: walk }).trains.journey?.walk, Number(walk), walk);
  for (const key of ["a key", "key\u0001"]) assert.throws(() => readConfig({ ...complete, ...journey, RAIL_ARRIVALS_KEY: key }), (error: Error) => error.message === "Settings in api/.env with a value that isn't allowed: RAIL_ARRIVALS_KEY (printable characters with no spaces)" && !error.message.includes(key), key);
  for (const url of ["https://api1.raildata.org.uk/test-arrivals/GetArrivalBoard", "https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails/{crs}", "https://example.com/GetArrBoardWithDetails", "http://api1.raildata.org.uk/GetArrBoardWithDetails"]) {
    assert.throws(() => readConfig({ ...complete, ...journey, TRAINS_ARRIVALS_URL: url }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_ARRIVALS_URL (the Live Arrival Board's https address on raildata.org.uk, ending in GetArrBoardWithDetails, with no ?, # or {crs} part)" }, url);
  }
  assert.throws(() => readConfig({ ...complete, ...journey, TRAINS_BOARD_URL: "https://api1.raildata.org.uk/test-board" }), { message: "Settings in api/.env with a value that isn't allowed: TRAINS_BOARD_URL (with TRAINS_CHANGE_AT set, an address ending in GetDepartureBoard or GetDepBoardWithDetails)" });
});

test("TRAIN_ALERTS must be written out, as exactly on or off", () => {
  assert.throws(() => readConfig({ ...complete, TRAIN_ALERTS: undefined }), { message: "Missing settings in api/.env: TRAIN_ALERTS" });
  assert.throws(() => readConfig({ ...complete, TRAIN_ALERTS: "On" }), { message: "Settings in api/.env that must be on or off: TRAIN_ALERTS" });
});

test("train alerts need their days, window and reminder while they're on, and not while they're off", () => {
  assert.throws(() => readConfig({ ...alertsOff, TRAIN_ALERTS: "on" }), {
    message: "Missing settings in api/.env: TRAIN_ALERT_DAYS, TRAIN_ALERT_WINDOW, TRAIN_ALERT_REMINDER",
  });
  const off = readConfig(alertsOff);
  assert.deepEqual([off.features.trainAlerts, off.trainAlerts], [false, { days: [], start: 0, end: 0, reminder: 0 }]);
  assert.deepEqual(switchedOff(off.features), ["train alerts"]);
});

test("train alerts need train times on too, said only when TRAINS is off rather than missing or wrong", () => {
  assert.throws(() => readConfig({ ...complete, TRAINS: "off" }), { message: "Settings in api/.env with a value that isn't allowed: TRAIN_ALERTS (on needs TRAINS=on too)" });
  assert.throws(() => readConfig({ ...complete, TRAINS: "yes" }), { message: "Settings in api/.env that must be on or off: TRAINS" });
  assert.throws(() => readConfig({ ...complete, TRAINS: undefined }), { message: "Missing settings in api/.env: TRAINS" });
  assert.equal(readConfig({ ...alertsOff, TRAINS: "off" }).features.trains, false);
});

test("the days are names with commas between, in any case and order, kept in the week's order without repeats", () => {
  assert.deepEqual(readConfig({ ...complete, TRAIN_ALERT_DAYS: "Wed, mon,MON" }).trainAlerts.days, ["mon", "wed"]);
  assert.deepEqual(readConfig({ ...complete, TRAIN_ALERT_DAYS: "sun,sat,fri,thu,wed,tue,mon" }).trainAlerts.days, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  for (const days of ["monday", "mon wed", "mon,,wed", "mon,", "1,2", "weekdays"]) {
    assert.throws(() => readConfig({ ...complete, TRAIN_ALERT_DAYS: days }), { message: "Settings in api/.env with a value that isn't allowed: TRAIN_ALERT_DAYS (days from mon, tue, wed, thu, fri, sat and sun, with commas between, like mon,wed)" }, days);
  }
});

test("the window is two 24-hour times, the first earlier, and the reminder a 24-hour time", () => {
  assert.deepEqual(readConfig({ ...complete, TRAIN_ALERT_WINDOW: "00:00 - 22:59", TRAIN_ALERT_REMINDER: "21:00" }).trainAlerts, { days: ["mon", "wed"], start: 0, end: 1379, reminder: 1260 });
  for (const window of ["7:00-8:30", "07:00-07:00", "08:30-07:00", "07:00", "07:00-24:00", "07:60-08:00", "07:00–08:30", "07:00-08:30-09:00", "22:00-23:00"]) {
    assert.throws(() => readConfig({ ...complete, TRAIN_ALERT_WINDOW: window }), { message: "Settings in api/.env with a value that isn't allowed: TRAIN_ALERT_WINDOW (two 24-hour times with a dash between, the first earlier and the second no later than 22:59, like 07:00-08:30)" }, window);
  }
  for (const reminder of ["6:45", "24:00", "06:45am", "06.45", " 06:45"]) {
    assert.throws(() => readConfig({ ...complete, TRAIN_ALERT_REMINDER: reminder }), { message: "Settings in api/.env with a value that isn't allowed: TRAIN_ALERT_REMINDER (a 24-hour time, like 06:45)" }, reminder);
  }
});

test("the reminder must come before the window ends, and no more than two hours before it ends", () => {
  assert.equal(readConfig({ ...complete, TRAIN_ALERT_REMINDER: "08:29" }).trainAlerts.reminder, 509);
  assert.equal(readConfig({ ...complete, TRAIN_ALERT_REMINDER: "06:30" }).trainAlerts.reminder, 390);
  for (const reminder of ["08:30", "09:00"]) {
    assert.throws(() => readConfig({ ...complete, TRAIN_ALERT_REMINDER: reminder }), { message: "Settings in api/.env with a value that isn't allowed: TRAIN_ALERT_REMINDER (a time before TRAIN_ALERT_WINDOW ends)" }, reminder);
  }
  for (const reminder of ["06:29", "05:00"]) {
    assert.throws(() => readConfig({ ...complete, TRAIN_ALERT_REMINDER: reminder }), { message: "Settings in api/.env with a value that isn't allowed: TRAIN_ALERT_REMINDER (no more than 2 hours before TRAIN_ALERT_WINDOW ends, since the board only looks about that far ahead)" }, reminder);
  }
});
