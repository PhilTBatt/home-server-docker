import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterEach, test } from "node:test";
import { hubActionToolNames, hubAnswer, hubReadToolNames, hubReply, standInHubFile, type HubCall } from "./stand-in-hub.js";

const stillOpen = new Set<() => unknown>();

afterEach(async () => {
  const closing = [...stillOpen];
  stillOpen.clear();
  for (const close of closing) await Promise.resolve().then(close).catch(() => {});
});

test("the stand-in hub offers the seven read tools, plus the three actions only when MCP_ACTIONS is on", () => {
  const listed = (env: Record<string, string | undefined>) => (hubReply({ id: 1, method: "tools/list" }, env, () => {})?.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);
  assert.deepEqual(listed({ MCP_ACTIONS: "off" }), hubReadToolNames);
  assert.deepEqual(listed({}), hubReadToolNames);
  assert.deepEqual(listed({ MCP_ACTIONS: "on" }), [...hubReadToolNames, ...hubActionToolNames]);
});

test("the stand-in hub answers a call and records what it was started with; unknown tools and methods are errors, and notifications get no reply", () => {
  const calls: HubCall[] = [];
  const env = { API_TOKEN: "hub-token", MCP_ACTIONS: "off", ANTHROPIC_API_KEY: "key" };
  assert.deepEqual(hubReply({ id: 2, method: "tools/call", params: { name: "get_status", arguments: {} } }, env, (call) => calls.push(call)), { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ tool: "get_status", answer: hubAnswer }) }] } });
  assert.deepEqual(calls.slice(), [{ tool: "get_status", input: {}, token: "hub-token", actions: "off", anthropicKey: true }]);
  const onCalls: HubCall[] = [];
  hubReply({ id: 6, method: "tools/call", params: { name: "stop_download", arguments: { hash: "abc" } } }, { ...env, MCP_ACTIONS: "on" }, (call) => onCalls.push(call));
  assert.deepEqual(onCalls, [{ tool: "stop_download", input: { hash: "abc" }, token: "hub-token", actions: "on", anthropicKey: true }]);
  assert.equal((hubReply({ id: 3, method: "tools/call", params: { name: "scan_library" } }, env, (call: HubCall) => calls.push(call))?.result as { isError: boolean }).isError, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(hubReply({ id: 4, method: "resources/list" }, env, () => {}), { jsonrpc: "2.0", id: 4, error: { code: -32601, message: "Method not found" } });
  assert.equal(hubReply({ method: "notifications/initialized" }, env, () => {}), null);
  assert.deepEqual(hubReply({ id: 5, method: "initialize", params: { protocolVersion: "2099-01-01" } }, env, () => {})?.result, { protocolVersion: "2099-01-01", capabilities: { tools: {} }, serverInfo: { name: "stand-in-hub", version: "1.0.0" } });
});

test("run as a program, the stand-in hub speaks JSON lines on stdin and stdout, and logs calls to the file it's given", { timeout: 10_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-hub-test-"));
  try {
    const log = join(dir, "calls.jsonl");
    const child = spawn(process.execPath, [standInHubFile, log], { env: { API_TOKEN: "hub-token", MCP_ACTIONS: "off" }, stdio: ["pipe", "pipe", "inherit"] });
    stillOpen.add(() => child.kill());
    const replies = createInterface({ input: child.stdout });
    const next = () => new Promise<Record<string, unknown>>((resolve) => replies.once("line", (line) => resolve(JSON.parse(line))));
    child.stdin.write("not json\n");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_backup" } })}\n`);
    assert.equal((await next()).id, 1);
    child.stdin.end();
    await new Promise((resolve) => child.once("exit", resolve));
    assert.deepEqual(JSON.parse(await readFile(log, "utf8")), { tool: "get_backup", input: null, token: "hub-token", actions: "off", anthropicKey: false });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
