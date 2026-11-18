import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { BrainTools } from "./brain-tools.js";
import { connectOverStdio, hubStartMs, startHubTools, withHubTools, type HubConnection } from "./hub-client.js";
import { hubProblemNote } from "./hub-tools.js";
import { hubReadToolNames, standInHubFile, type HubCall } from "./stand-in-hub.js";

const server = { command: "node", args: ["/mcp/dist/server.js"], token: "hub-token" };

function fakeConnection(overrides: Partial<HubConnection> = {}) {
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  let closes = 0;
  const connection: HubConnection = {
    listTools: async () => ({ tools: [{ name: "get_status", description: "Status.", inputSchema: { type: "object", properties: {} } }, { name: "get_backup", inputSchema: { type: "object" } }] }),
    callTool: async (params) => {
      calls.push(params);
      return { content: [{ type: "text", text: "line one" }, { type: "image", data: "x" }, { type: "text" }, { type: "text", text: "line two" }] };
    },
    close: async () => {
      closes++;
    },
    ...overrides,
  };
  return { connection, calls, closes: () => closes };
}

test("the hub's tools are listed from its MCP server, ready for the Messages API, and a missing description is empty", async () => {
  const fake = fakeConnection();
  const seen: unknown[] = [];
  const hub = await startHubTools(server, () => assert.fail("no note expected"), async (given, timeoutMs) => {
    seen.push([given, timeoutMs]);
    return fake.connection;
  });
  assert.deepEqual(seen, [[server, 10_000]]);
  assert.equal(hubStartMs, 10_000);
  assert.deepEqual(hub?.definitions, [
    { name: "get_status", description: "Status.", input_schema: { type: "object", properties: {} } },
    { name: "get_backup", description: "", input_schema: { type: "object" } },
  ]);
});

test("a hub tool call passes its input on, joins the text it gets back, and passes on whether it failed", async () => {
  const fake = fakeConnection();
  const hub = await startHubTools(server, () => {}, async () => fake.connection);
  assert.deepEqual(await hub?.run("get_status", { verbose: true }), { content: "line one\nline two", isError: false });
  assert.deepEqual(await hub?.run("get_status", "not an object"), { content: "line one\nline two", isError: false });
  assert.deepEqual(await hub?.run("get_status", ["a"]), { content: "line one\nline two", isError: false });
  assert.deepEqual(fake.calls, [
    { name: "get_status", arguments: { verbose: true } },
    { name: "get_status", arguments: {} },
    { name: "get_status", arguments: {} },
  ]);
  const failing = fakeConnection({ callTool: async () => ({ content: [{ type: "text", text: "Couldn't reach the API" }], isError: true }) });
  const hubFailing = await startHubTools(server, () => {}, async () => failing.connection);
  assert.deepEqual(await hubFailing?.run("get_status", {}), { content: "Couldn't reach the API", isError: true });
  const odd = fakeConnection({ callTool: async () => ({}) });
  assert.deepEqual(await (await startHubTools(server, () => {}, async () => odd.connection))?.run("get_status", {}), { content: "", isError: false });
});

test("a hub tool call that throws comes back as a failed tool, not a failed question", async () => {
  const fake = fakeConnection({
    callTool: async () => {
      throw new Error("Connection closed");
    },
  });
  const hub = await startHubTools(server, () => {}, async () => fake.connection);
  assert.deepEqual(await hub?.run("get_status", {}), { content: "The hub's tool didn't work: Connection closed", isError: true });
});

test("closing the hub's tools closes the MCP server", async () => {
  const fake = fakeConnection();
  const hub = await startHubTools(server, () => {}, async () => fake.connection);
  await hub?.close();
  assert.equal(fake.closes(), 1);
});

test("an MCP server that won't start, won't list its tools, or hangs gives the same note as the Agent SDK and no tools; anything started is closed", async () => {
  const notes: string[] = [];
  assert.equal(
    await startHubTools(server, (note) => notes.push(note), async () => {
      throw new Error("spawn failed");
    }),
    undefined,
  );
  const unlisted = fakeConnection({
    listTools: async () => {
      throw new Error("bad list");
    },
  });
  assert.equal(await startHubTools(server, (note) => notes.push(note), async () => unlisted.connection), undefined);
  assert.equal(unlisted.closes(), 1);
  let finish: (connection: HubConnection) => void = () => {};
  const late = fakeConnection();
  assert.equal(await startHubTools(server, (note) => notes.push(note), () => new Promise((resolve) => (finish = resolve)), 20), undefined);
  finish(late.connection);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(late.closes(), 1);
  const silent = fakeConnection({ listTools: () => new Promise(() => {}) });
  assert.equal(await startHubTools(server, (note) => notes.push(note), async () => silent.connection, 20), undefined);
  assert.equal(silent.closes(), 1);
  assert.deepEqual(notes, Array(4).fill(hubProblemNote("failed")));
});

test("an MCP server that lists no tools counts as not loaded, with the same note as the Agent SDK, and is closed", async () => {
  const notes: string[] = [];
  const empty = fakeConnection({ listTools: async () => ({ tools: [] }) });
  assert.equal(await startHubTools(server, (note) => notes.push(note), async () => empty.connection), undefined);
  assert.equal(empty.closes(), 1);
  assert.deepEqual(notes, [hubProblemNote("no tools listed")]);
});

test("the hub's tools are added after the brain tools, each name goes to its own tools, and the brain keeps a name both have", async () => {
  const brain: BrainTools = {
    definitions: [{ name: "read_file", description: "Read.", input_schema: { type: "object" } }],
    run: async (name) => ({ content: `brain ${name}`, isError: false }),
  };
  assert.equal(withHubTools(brain, undefined), brain);
  const hub = {
    definitions: [
      { name: "get_status", description: "Status.", input_schema: { type: "object" } },
      { name: "read_file", description: "Hub read.", input_schema: { type: "object" } },
    ],
    run: async (name: string) => ({ content: `hub ${name}`, isError: false }),
    close: async () => {},
  };
  const both = withHubTools(brain, hub);
  assert.deepEqual(both.definitions.map((tool) => `${tool.name}: ${tool.description}`), ["read_file: Read.", "get_status: Status."]);
  assert.deepEqual(await both.run("get_status", {}), { content: "hub get_status", isError: false });
  assert.deepEqual(await both.run("read_file", {}), { content: "brain read_file", isError: false });
  assert.deepEqual(await both.run("anything_else", {}), { content: "brain anything_else", isError: false });
});

test("over a real pipe, the MCP server gets the token and read-only mode but not the rest of Jarvis's environment, its read tools work, and closing ends it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-hub-client-"));
  const before = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  try {
    const log = join(dir, "calls.jsonl");
    const hub = await startHubTools({ command: process.execPath, args: [standInHubFile, log], token: "hub-token" }, () => assert.fail("no note expected"), connectOverStdio, 10_000);
    assert.deepEqual(hub?.definitions.map((tool) => tool.name), hubReadToolNames);
    assert.match((await hub?.run("get_alerts", {}))?.content ?? "", /"tool":"get_alerts"/);
    await hub?.close();
    const calls = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as HubCall);
    assert.deepEqual(calls, [{ tool: "get_alerts", token: "hub-token", actions: "off", anthropicKey: false }]);
  } finally {
    if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = before;
    await rm(dir, { recursive: true, force: true });
  }
});

test("over a real pipe, an MCP server that never answers is stopped once the time is up, not left running", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-hub-hang-"));
  try {
    const script = join(dir, "hang.mjs");
    const pidFile = join(dir, "pid");
    await writeFile(script, 'import { writeFileSync } from "node:fs";\nwriteFileSync(process.argv[2], String(process.pid));\nsetInterval(() => {}, 1000);\n');
    const notes: string[] = [];
    const started = Date.now();
    assert.equal(await startHubTools({ command: process.execPath, args: [script, pidFile], token: "hub-token" }, (note) => notes.push(note), connectOverStdio, 500), undefined);
    assert.ok(Date.now() - started < 5000);
    assert.deepEqual(notes, [hubProblemNote("failed")]);
    const pid = Number(await readFile(pidFile, "utf8"));
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let waited = 0; alive() && waited < 5000; waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(alive(), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
