import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { readConfig } from "./config.js";
import { switchesToHub, switchesOf, tellSwitches, type Switches } from "./switches.js";
import { wallOffWhy } from "./wall.js";

const key = "sk-ant-test-key";
const base = { ANTHROPIC_API_KEY: key, JARVIS_LOG: "off" };

test("his switches are every on-or-off setting he reads, each as on, off or its choice word, in the order he reads them", () => {
  const source = readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");
  const read = [...source.matchAll(/env\.(JARVIS_[A-Z_]+)\?\.trim\(\) \|\| "off"/g)].map((match) => match[1]).filter((name) => name !== "JARVIS_LENGTH_CAP");
  const switches = switchesOf(readConfig(base));
  assert.deepEqual(Object.keys(switches), [...read, "JARVIS_LOG"]);
  assert.deepEqual(Object.values(switches), Object.keys(switches).map(() => "off"));
});

test("a setting with choices sends its choice, and anything that's a name, a number or a key sends only on", () => {
  const config = readConfig({
    ...base,
    JARVIS_LOG: "on",
    JARVIS_HUB_TOOLS: "on",
    API_TOKEN: "hub-token-secret",
    JARVIS_VOICE: "kokoro",
    JARVIS_EARS: "wake",
    EARS_TOKEN: "ears-token-secret",
    JARVIS_FOLLOW_UP: "5",
    JARVIS_PERSONA: "butler",
    JARVIS_WALL: "on",
    JARVIS_WALL_PAGES: "words",
    JARVIS_WEB: "ask",
    JARVIS_WEB_BY: "api",
  });
  const switches = switchesOf(config);
  assert.deepEqual(
    [switches.JARVIS_HUB_TOOLS, switches.JARVIS_VOICE, switches.JARVIS_EARS, switches.JARVIS_FOLLOW_UP, switches.JARVIS_PERSONA, switches.JARVIS_WALL, switches.JARVIS_WALL_PAGES, switches.JARVIS_WEB, switches.JARVIS_LOG],
    ["on", "kokoro", "wake", "on", "on", "on", "words", "ask", "on"],
  );
  const sent = JSON.stringify(switches);
  for (const secret of [key, "hub-token-secret", "ears-token-secret", "butler", "5"]) assert.ok(!sent.includes(`"${secret}"`) && !sent.includes(secret === "5" ? '"5"' : secret), secret);
  for (const value of Object.values(switches)) assert.match(value, /^[a-z]{1,12}$/);
  for (const name of Object.keys(switches)) assert.match(name, /^JARVIS_[A-Z_]{2,30}$/);
  assert.ok(Object.keys(switches).length <= 60);
});

test("the hub is told with his token, as JSON, and its answers are read in plain words", async () => {
  const seen: { auth: string | undefined; type: string | undefined; body: string; url: string | undefined }[] = [];
  const statuses = [200, 404, 401, 400, 500];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (part) => (body += part));
    request.on("end", () => {
      seen.push({ auth: request.headers.authorization, type: request.headers["content-type"], body, url: request.url });
      response.statusCode = statuses.shift() ?? 200;
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const send = switchesToHub("the-token", `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  const switches = { JARVIS_WALL: "on", JARVIS_VOICE: "piper" };
  try {
    await send(switches, new AbortController().signal);
    await assert.rejects(send(switches, new AbortController().signal), { message: wallOffWhy });
    await assert.rejects(send(switches, new AbortController().signal), { message: "the hub refused his token" });
    await assert.rejects(send(switches, new AbortController().signal), { message: "the hub didn't take the list, so the API may be older than Jarvis" });
    await assert.rejects(send(switches, new AbortController().signal), { message: "the hub answered 500" });
  } finally {
    server.close();
  }
  assert.deepEqual(seen[0], { auth: "Bearer the-token", type: "application/json", body: JSON.stringify({ switches }), url: "/wall/jarvis/switches" });
});

test("he tells the hub at once and then every few minutes, says once when it fails and once when it works again, and stops when closed", async () => {
  const told: Switches[] = [];
  const notes: string[] = [];
  const answers: (string | null)[] = [null, "the hub answered 500", "the hub answered 500", null, wallOffWhy, wallOffWhy, null];
  const teller = tellSwitches({
    send: async (switches) => {
      told.push(switches);
      const why = answers.shift() ?? null;
      if (why !== null) throw new Error(why);
    },
    switches: { JARVIS_WALL: "on" },
    note: (line) => notes.push(line),
    everyMs: 10,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  teller.close();
  const count = told.length;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(count >= 7, String(count));
  assert.equal(told.length, count, "nothing more once closed");
  assert.deepEqual(told[0], { JARVIS_WALL: "on" });
  assert.deepEqual(notes, ["couldn't tell the hub his switches for the switches page: the hub answered 500; trying again every minute", "told the hub his switches again, for the switches page"], "the wall being off is said by the wall itself, not again here");
});

test("a hub that doesn't answer in time counts as a failure, said in plain words", async () => {
  const notes: string[] = [];
  const teller = tellSwitches({ send: (_switches, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason))), switches: {}, note: (line) => notes.push(line), everyMs: 60_000, timeoutMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 80));
  teller.close();
  assert.deepEqual(notes, ["couldn't tell the hub his switches for the switches page: the hub didn't answer in time; trying again every minute"]);
});

test("closing while a send is under way says nothing", async () => {
  const notes: string[] = [];
  const teller = tellSwitches({ send: (_switches, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))), switches: {}, note: (line) => notes.push(line), everyMs: 60_000 });
  teller.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(notes, []);
});
