import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import type { ApiGet } from "./api.js";
import { buildServer } from "./tools.js";

type Reply = {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

type ToolInfo = {
  name: string;
  description?: string;
  inputSchema: { type: string; properties?: Record<string, unknown> };
};

type CallResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

const expectedPaths: Record<string, string> = {
  get_status: "/system/status",
  get_alerts: "/system/alerts",
  get_features: "/system/features",
  get_downloads: "/media/downloads",
  get_library: "/media/library",
  get_wifi_reconnects: "/system/wifi-reconnects",
};

function fakeGet(data: unknown = { ok: true, problems: [] }) {
  const paths: string[] = [];
  const get: ApiGet = async (path) => {
    paths.push(path);
    return data;
  };
  return { get, paths };
}

async function connect(get: ApiGet) {
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (reply: Reply) => void>();
  client.onmessage = (message) => {
    const reply = message as Reply;
    waiting.get(reply.id)?.(reply);
  };
  await buildServer(get).connect(serverSide);
  await client.start();

  let nextId = 1;
  const request = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    return new Promise<Reply>((resolve) => {
      waiting.set(id, resolve);
      void client.send({ jsonrpc: "2.0", id, method, params });
    });
  };

  const initialized = await request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const listTools = async () => ((await request("tools/list")).result as { tools: ToolInfo[] }).tools;
  const callTool = (name: string) => request("tools/call", { name, arguments: {} });
  return { initialized, listTools, callTool };
}

test("names itself home-hub", async () => {
  const { initialized } = await connect(fakeGet().get);
  const result = initialized.result as { serverInfo: { name: string } };
  assert.equal(result.serverInfo.name, "home-hub");
});

test("offers exactly the six read tools, in order", async () => {
  const { listTools } = await connect(fakeGet().get);
  const names = (await listTools()).map((tool) => tool.name);
  assert.deepEqual(names, Object.keys(expectedPaths));
});

test("every tool has a description for Claude to read", async () => {
  const { listTools } = await connect(fakeGet().get);
  for (const tool of await listTools()) {
    assert.ok((tool.description ?? "").length > 20, `${tool.name} needs a description`);
  }
});

test("no tool takes any input", async () => {
  const { listTools } = await connect(fakeGet().get);
  for (const tool of await listTools()) {
    assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}), [], `${tool.name} takes input`);
  }
});

test("tool names use only lowercase words and underscores, so permission rules can name them", async () => {
  const { listTools } = await connect(fakeGet().get);
  for (const tool of await listTools()) {
    assert.match(tool.name, /^[a-z]+(_[a-z]+)*$/);
  }
});

for (const [name, path] of Object.entries(expectedPaths)) {
  test(`${name} reads ${path}`, async () => {
    const fake = fakeGet();
    const { callTool } = await connect(fake.get);
    const reply = await callTool(name);
    assert.equal(reply.error, undefined);
    assert.deepEqual(fake.paths, [path]);
  });
}

test("returns the API's answer as JSON text", async () => {
  const downloads = [{ name: "Some.Show.S01E01", percent: 42, speedKBps: 900, etaSeconds: 120, state: "downloading", hash: "a".repeat(40) }];
  const { callTool } = await connect(fakeGet(downloads).get);
  const result = (await callTool("get_downloads")).result as CallResult;
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(downloads) }]);
  assert.deepEqual(JSON.parse(result.content[0].text), downloads);
});

test("asks the API again on every call rather than reusing an old answer", async () => {
  const fake = fakeGet();
  const { callTool } = await connect(fake.get);
  await callTool("get_status");
  await callTool("get_status");
  assert.deepEqual(fake.paths, ["/system/status", "/system/status"]);
});

test("an API failure comes back as a tool error with its message", async () => {
  const failing: ApiGet = async () => {
    throw new Error("Couldn't reach the API");
  };
  const { callTool } = await connect(failing);
  const result = (await callTool("get_status")).result as CallResult;
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Couldn't reach the API" }]);
});

test("keeps working after a failed call", async () => {
  let calls = 0;
  const flaky: ApiGet = async () => {
    calls++;
    if (calls === 1) throw new Error("The API didn't answer in time");
    return { status: "ok" };
  };
  const { callTool } = await connect(flaky);
  assert.equal(((await callTool("get_status")).result as CallResult).isError, true);
  assert.equal(((await callTool("get_status")).result as CallResult).isError, undefined);
});

test("an unknown tool is refused without calling the API", async () => {
  const fake = fakeGet();
  const { callTool } = await connect(fake.get);
  const reply = await callTool("stop_download");
  const refused = reply.error !== undefined || (reply.result as CallResult).isError === true;
  assert.ok(refused);
  assert.deepEqual(fake.paths, []);
});