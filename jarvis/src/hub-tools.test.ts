import assert from "node:assert/strict";
import { test } from "node:test";
import { actionQuestion, actionsEnv, allowedHubTools, checkHubServer, hubActionTools, hubNotBuilt, hubReadTools, hubServerEnv, hubServerFile, hubServerFor, hubToolPrefix, isHubAction, notDoneNote, withHubToken } from "./hub-tools.js";

test("the hub's MCP server is the built one mounted from mcp/, run with this Node, and its tools are named mcp__hub__ on the Agent SDK", () => {
  assert.equal(hubServerFile, "/mcp/dist/server.js");
  assert.equal(hubToolPrefix, "mcp__hub__");
  assert.deepEqual(hubServerFor("hub-token"), { command: process.execPath, args: ["/mcp/dist/server.js"], token: "hub-token", actions: false });
  assert.deepEqual(hubServerFor("hub-token", true), { command: process.execPath, args: ["/mcp/dist/server.js"], token: "hub-token", actions: true });
  assert.deepEqual(hubServerFor("hub-token", false, "/elsewhere/server.js").args, ["/elsewhere/server.js"]);
});

test("the MCP server's actions are on only when asked for, and it's told nothing else", () => {
  assert.deepEqual(actionsEnv(hubServerFor("hub-token")), { MCP_ACTIONS: "off" });
  assert.deepEqual(actionsEnv({ command: "node", args: [], token: "hub-token" }), { MCP_ACTIONS: "off" });
  assert.deepEqual(actionsEnv(hubServerFor("hub-token", true)), { MCP_ACTIONS: "on" });
});

test("an MCP server started by Jarvis himself gets the token and the actions setting", () => {
  assert.deepEqual(hubServerEnv(hubServerFor("hub-token")), { API_TOKEN: "hub-token", MCP_ACTIONS: "off" });
  assert.deepEqual(hubServerEnv(hubServerFor("hub-token", true)), { API_TOKEN: "hub-token", MCP_ACTIONS: "on" });
});

test("Jarvis knows the hub's seven read tools and three actions by name, and accepts the actions only when they're on", () => {
  assert.deepEqual(hubReadTools, ["get_status", "get_alerts", "get_features", "get_downloads", "get_library", "get_wifi_reconnects", "get_backup"]);
  assert.deepEqual(hubActionTools, ["scan_library", "stop_download", "start_download"]);
  assert.deepEqual(allowedHubTools(hubServerFor("t")), hubReadTools);
  assert.deepEqual(allowedHubTools(hubServerFor("t", true)), [...hubReadTools, ...hubActionTools]);
  assert.deepEqual(hubActionTools.map(isHubAction), [true, true, true]);
  assert.deepEqual(["get_status", "read_file", "mcp__hub__scan_library", "Scan_library", ""].map(isHubAction), [false, false, false, false, false]);
});

test("each action is put to Phil in plain words, with a download's hash cut short", () => {
  const hash = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(actionQuestion("scan_library", {}), "Jarvis wants to scan the library. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("stop_download", { hash }), "Jarvis wants to stop the download whose hash starts 01234567. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("start_download", { hash }), "Jarvis wants to start the download whose hash starts 01234567 again. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("start_download", { hash: "abc" }), "Jarvis wants to start the download abc again. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("stop_download", { hash: "ABCDEF0123" }), "Jarvis wants to stop the download whose hash starts ABCDEF01. Type yes to let him, or anything else to stop it");
  for (const input of [{}, null, "x", { hash: 5 }, { hash: "" }, { hash: "\u202eabc" }, { hash: "abc def" }, { hash: "gg" }]) assert.equal(actionQuestion("stop_download", input), "Jarvis wants to stop a download. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("reboot_server", {}), "Jarvis wants to use reboot_server. Type yes to let him, or anything else to stop it");
  assert.equal(notDoneNote, "Phil didn't say yes, so it wasn't done");
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
});
