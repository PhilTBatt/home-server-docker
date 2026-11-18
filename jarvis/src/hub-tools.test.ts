import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHubServer, hubNotBuilt, hubServerFile, hubServerFor, hubToolPrefix, plainEngineHubNote, readOnlyEnv, withHubToken } from "./hub-tools.js";

test("the hub's MCP server is the built one mounted from mcp/, run with this Node, and its tools are named mcp__hub__ on the Agent SDK", () => {
  assert.equal(hubServerFile, "/mcp/dist/server.js");
  assert.equal(hubToolPrefix, "mcp__hub__");
  assert.deepEqual(hubServerFor("hub-token"), { command: process.execPath, args: ["/mcp/dist/server.js"], token: "hub-token" });
  assert.deepEqual(hubServerFor("hub-token", "/elsewhere/server.js").args, ["/elsewhere/server.js"]);
});

test("the MCP server is told only to leave its actions out", () => {
  assert.deepEqual(readOnlyEnv, { MCP_ACTIONS: "off" });
});

test("an environment gets the hub's token only with the hub's tools, and never a token it already had", () => {
  const env = { PATH: "/usr/bin", API_TOKEN: "old-token", ANTHROPIC_API_KEY: "key" };
  assert.deepEqual(withHubToken(env, hubServerFor("hub-token")), { PATH: "/usr/bin", ANTHROPIC_API_KEY: "key", API_TOKEN: "hub-token" });
  assert.deepEqual(withHubToken(env, undefined), { PATH: "/usr/bin", ANTHROPIC_API_KEY: "key" });
  assert.deepEqual(withHubToken({ PATH: "/usr/bin" }, undefined), { PATH: "/usr/bin" });
});

test("an unbuilt MCP server stops Jarvis with how to build it; a built one passes", () => {
  assert.throws(() => checkHubServer("/mcp/dist/server.js", () => false), { message: hubNotBuilt("/mcp/dist/server.js") });
  assert.doesNotThrow(() => checkHubServer("/mcp/dist/server.js", (path) => path === "/mcp/dist/server.js"));
  assert.equal(hubNotBuilt("/mcp/dist/server.js"), "JARVIS_HUB_TOOLS is on, but the MCP server isn't built: there's no /mcp/dist/server.js. Build it with npm ci and npm test in mcp/, as the README says");
  assert.equal(plainEngineHubNote, "The plain API call engine doesn't have the hub's tools yet, so in this chat Jarvis can only read the brain");
});
