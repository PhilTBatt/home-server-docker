import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import type { ApiGet, ApiPost } from "./api.js";
import { buildServer } from "./tools.js";

type Reply = {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

type ToolInfo = {
  name: string;
  description?: string;
  inputSchema: { type: string; properties?: Record<string, { type?: string; pattern?: string }>; required?: string[] };
};

type CallResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

const hash = "0123456789abcdef0123456789abcdef01234567";

const readPaths: Record<string, string> = {
  get_status: "/system/status",
  get_alerts: "/system/alerts",
  get_features: "/system/features",
  get_downloads: "/media/downloads",
  get_library: "/media/library",
  get_wifi_reconnects: "/system/wifi-reconnects",
};

const actions: Record<string, { args: Record<string, unknown>; call: string }> = {
  scan_library: { args: {}, call: "POST /media/library/scan" },
  stop_download: { args: { hash }, call: `POST /media/downloads/${hash}/stop` },
  start_download: { args: { hash }, call: `POST /media/downloads/${hash}/start` },
};

function fakeApi(data: unknown = { ok: true, problems: [] }) {
  const calls: string[] = [];
  const get: ApiGet = async (path) => {
    calls.push(`GET ${path}`);
    return data;
  };
  const post: ApiPost = async (path) => {
    calls.push(`POST ${path}`);
    return data;
  };
  return { get, post, calls };
}

async function connect(api: { get: ApiGet; post: ApiPost }, actions = true) {
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (reply: Reply) => void>();
  client.onmessage = (message) => {
    const reply = message as Reply;
    waiting.get(reply.id)?.(reply);
  };
  await buildServer(api.get, api.post, actions).connect(serverSide);
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
  const callTool = (name: string, args: Record<string, unknown> = {}) => request("tools/call", { name, arguments: args });
  return { initialized, listTools, callTool };
}

function refused(reply: Reply) {
  return reply.error !== undefined || (reply.result as CallResult).isError === true;
}

test("names itself home-hub", async () => {
  const { initialized } = await connect(fakeApi());
  const result = initialized.result as { serverInfo: { name: string } };
  assert.equal(result.serverInfo.name, "home-hub");
});

test("offers the six read tools, then scan, stop and start, in order", async () => {
  const { listTools } = await connect(fakeApi());
  const names = (await listTools()).map((tool) => tool.name);
  assert.deepEqual(names, [...Object.keys(readPaths), ...Object.keys(actions)]);
});

test("every tool has a description for Claude to read", async () => {
  const { listTools } = await connect(fakeApi());
  for (const tool of await listTools()) {
    assert.ok((tool.description ?? "").length > 20, `${tool.name} needs a description`);
  }
});

test("the read tools and scan_library take no input", async () => {
  const { listTools } = await connect(fakeApi());
  const noInput = [...Object.keys(readPaths), "scan_library"];
  for (const tool of (await listTools()).filter((t) => noInput.includes(t.name))) {
    assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}), [], `${tool.name} takes input`);
  }
});

test("stop_download and start_download take one required hash, described for Claude", async () => {
  const { listTools } = await connect(fakeApi());
  for (const tool of (await listTools()).filter((t) => t.name.endsWith("_download"))) {
    assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}), ["hash"]);
    assert.deepEqual(tool.inputSchema.required, ["hash"]);
    assert.equal(tool.inputSchema.properties?.hash.type, "string");
    assert.equal(tool.inputSchema.properties?.hash.pattern, "^[0-9a-f]{40}$");
  }
});

test("tool names use only lowercase words and underscores, so permission rules can name them", async () => {
  const { listTools } = await connect(fakeApi());
  for (const tool of await listTools()) {
    assert.match(tool.name, /^[a-z]+(_[a-z]+)*$/);
  }
});

for (const [name, path] of Object.entries(readPaths)) {
  test(`${name} only reads ${path}`, async () => {
    const fake = fakeApi();
    const { callTool } = await connect(fake);
    const reply = await callTool(name);
    assert.equal(reply.error, undefined);
    assert.deepEqual(fake.calls, [`GET ${path}`]);
  });
}

for (const [name, { args, call }] of Object.entries(actions)) {
  test(`${name} sends ${call} and nothing else`, async () => {
    const fake = fakeApi({ status: "ok" });
    const { callTool } = await connect(fake);
    const reply = await callTool(name, args);
    assert.equal(reply.error, undefined);
    assert.equal((reply.result as CallResult).isError, undefined);
    assert.deepEqual(fake.calls, [call]);
  });
}

test("returns the API's answer as JSON text", async () => {
  const downloads = [{ name: "Some.Show.S01E01", percent: 42, speedKBps: 900, etaSeconds: 120, state: "downloading", hash }];
  const { callTool } = await connect(fakeApi(downloads));
  const result = (await callTool("get_downloads")).result as CallResult;
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(downloads) }]);
  assert.deepEqual(JSON.parse(result.content[0].text), downloads);
});

test("an action returns the API's answer too", async () => {
  const { callTool } = await connect(fakeApi({ status: "stopped" }));
  const result = (await callTool("stop_download", { hash })).result as CallResult;
  assert.deepEqual(result.content, [{ type: "text", text: '{"status":"stopped"}' }]);
});

for (const [label, args] of Object.entries({
  "no hash": {},
  "a short hash": { hash: "abc123" },
  "a hash one character too long": { hash: `${hash}0` },
  "an uppercase hash": { hash: hash.toUpperCase() },
  "a path instead of a hash": { hash: "../../library/scan/aaaaaaaaaaaaaaaaaaaaaaa" },
  "a number": { hash: 12345 },
})) {
  test(`stop_download refuses ${label} without calling the API`, async () => {
    const fake = fakeApi();
    const { callTool } = await connect(fake);
    assert.ok(refused(await callTool("stop_download", args)));
    assert.deepEqual(fake.calls, []);
  });
}

test("start_download refuses a bad hash without calling the API", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  assert.ok(refused(await callTool("start_download", { hash: "all" })));
  assert.deepEqual(fake.calls, []);
});

test("asks the API again on every call rather than reusing an old answer", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  await callTool("get_status");
  await callTool("get_status");
  assert.deepEqual(fake.calls, ["GET /system/status", "GET /system/status"]);
});

test("an API failure comes back as a tool error with its message", async () => {
  const failing = async (): Promise<unknown> => {
    throw new Error("Couldn't reach the API");
  };
  const { callTool } = await connect({ get: failing, post: failing });
  for (const [name, args] of [["get_status", {}], ["stop_download", { hash }]] as const) {
    const result = (await callTool(name, args)).result as CallResult;
    assert.equal(result.isError, true);
    assert.deepEqual(result.content, [{ type: "text", text: "Couldn't reach the API" }]);
  }
});

test("keeps working after a failed call", async () => {
  let calls = 0;
  const flaky: ApiGet = async () => {
    calls++;
    if (calls === 1) throw new Error("The API didn't answer in time");
    return { status: "ok" };
  };
  const { callTool } = await connect({ get: flaky, post: fakeApi().post });
  assert.equal(((await callTool("get_status")).result as CallResult).isError, true);
  assert.equal(((await callTool("get_status")).result as CallResult).isError, undefined);
});

test("an unknown tool is refused without calling the API", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  assert.ok(refused(await callTool("delete_download", { hash })));
  assert.deepEqual(fake.calls, []);
});

test("read-only offers only the six read tools", async () => {
  const { listTools } = await connect(fakeApi(), false);
  const names = (await listTools()).map((tool) => tool.name);
  assert.deepEqual(names, Object.keys(readPaths));
});

for (const [name, { args }] of Object.entries(actions)) {
  test(`read-only refuses ${name} without calling the API`, async () => {
    const fake = fakeApi();
    const { callTool } = await connect(fake, false);
    assert.ok(refused(await callTool(name, args)));
    assert.deepEqual(fake.calls, []);
  });
}

test("read-only still answers the read tools", async () => {
  const fake = fakeApi({ movies: 0, series: 5, episodes: 46 });
  const { callTool } = await connect(fake, false);
  const result = (await callTool("get_library")).result as CallResult;
  assert.deepEqual(result.content, [{ type: "text", text: '{"movies":0,"series":5,"episodes":46}' }]);
  assert.deepEqual(fake.calls, ["GET /media/library"]);
});