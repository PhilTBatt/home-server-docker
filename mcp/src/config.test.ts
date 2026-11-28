import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "./config.js";

const token = "test-token";

test("reads the token and actions on", () => {
  assert.deepEqual(readConfig({ API_TOKEN: token, MCP_ACTIONS: "on" }), { apiToken: token, actions: true, wallPages: false });
});

test("actions off means read-only", () => {
  assert.deepEqual(readConfig({ API_TOKEN: token, MCP_ACTIONS: "off" }), { apiToken: token, actions: false, wallPages: false });
});

test("refuses a missing API_TOKEN and names it", () => {
  assert.throws(() => readConfig({ MCP_ACTIONS: "on" }), { message: "Missing setting: API_TOKEN" });
});

test("refuses an empty API_TOKEN", () => {
  assert.throws(() => readConfig({ API_TOKEN: "", MCP_ACTIONS: "on" }), { message: "Missing setting: API_TOKEN" });
});

test("a missing MCP_ACTIONS stops start-up rather than guessing", () => {
  assert.throws(() => readConfig({ API_TOKEN: token }), { message: "MCP_ACTIONS must be on or off" });
});

for (const value of ["", "ON", "Off", "yes", "true", "1", "read-only", " on", "on "]) {
  test(`refuses MCP_ACTIONS=${JSON.stringify(value)}`, () => {
    assert.throws(() => readConfig({ API_TOKEN: token, MCP_ACTIONS: value }), { message: "MCP_ACTIONS must be on or off" });
  });
}

test("names every problem at once", () => {
  assert.throws(() => readConfig({ MCP_ACTIONS: "maybe" }), {
    message: "Missing setting: API_TOKEN. MCP_ACTIONS must be on or off",
  });
});

test("the error never includes the token or the bad value", () => {
  assert.throws(
    () => readConfig({ API_TOKEN: token, MCP_ACTIONS: "secret-ish" }),
    (error: Error) => !error.message.includes(token) && !error.message.includes("secret-ish"),
  );
});

test("ignores other settings", () => {
  assert.deepEqual(readConfig({ API_TOKEN: token, MCP_ACTIONS: "off", QBIT_API_KEY: "other" }), { apiToken: token, actions: false, wallPages: false });
});

test("MCP_WALL_PAGES is off unless it's on, and anything else stops start-up", () => {
  assert.equal(readConfig({ API_TOKEN: token, MCP_ACTIONS: "off", MCP_WALL_PAGES: "on" }).wallPages, true);
  assert.equal(readConfig({ API_TOKEN: token, MCP_ACTIONS: "off", MCP_WALL_PAGES: "off" }).wallPages, false);
  assert.equal(readConfig({ API_TOKEN: token, MCP_ACTIONS: "off" }).wallPages, false);
  assert.throws(() => readConfig({ API_TOKEN: token, MCP_ACTIONS: "off", MCP_WALL_PAGES: "yes" }), { message: "MCP_WALL_PAGES must be on or off" });
});
