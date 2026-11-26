import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { guardAllows, guardAnswer, guardVerdict, notChecked, notResolved } from "./web-guard.js";
import { bareNumber, privateName, privatePlace } from "./web-guard-rules.js";

const fetchOf = (url: unknown, tool = "WebFetch") => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: { url, prompt: "What does it say?" } });
const leadsTo = (...addresses: string[]) => ({ resolve: async () => addresses });

test("a public page whose name leads to public addresses is let through", async () => {
  const asked: string[] = [];
  assert.equal(await guardVerdict(fetchOf("https://nodejs.org/en/blog"), { resolve: async (host) => (asked.push(host), ["104.20.1.252", "2606:4700:10::6814:1fc"]) }), null);
  assert.deepEqual(asked, ["nodejs.org", "www.nodejs.org"]);
});

test("an address the rules refuse is refused without asking where it leads", async () => {
  let asked = 0;
  const deps = { resolve: async () => (asked++, ["1.1.1.1"]) };
  assert.equal(await guardVerdict(fetchOf("https://192.168.0.1/admin"), deps), bareNumber);
  assert.equal(await guardVerdict(fetchOf("https://hub.home/api/status"), deps), privateName);
  assert.equal(asked, 0);
});

test("a public-looking name that leads to a private address is refused, even when only one of its addresses is private", async () => {
  assert.equal(await guardVerdict(fetchOf("https://innocent.example.com/"), leadsTo("192.168.1.50")), privatePlace);
  assert.equal(await guardVerdict(fetchOf("https://innocent.example.com/"), leadsTo("93.184.216.34", "10.0.0.5")), privatePlace);
  assert.equal(await guardVerdict(fetchOf("https://innocent.example.com/"), leadsTo("93.184.216.34", "fd00::1")), privatePlace);
  assert.equal(await guardVerdict(fetchOf("https://innocent.example.com/"), leadsTo("100.64.0.9")), privatePlace);
});

test("a name that can't be looked up, leads nowhere, or takes too long is refused", async () => {
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), { resolve: async () => Promise.reject(new Error("ENOTFOUND")) }), notResolved);
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), leadsTo()), notResolved);
  const started = Date.now();
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), { resolve: () => new Promise(() => {}), withinMs: 30 }), notResolved);
  assert.ok(Date.now() - started < 2_000);
});

test("a request it can't read, for another tool, or with no address is refused", async () => {
  const deps = leadsTo("1.1.1.1");
  for (const raw of ["", "not json", "null", "[]", "{}", JSON.stringify({ tool_name: "WebFetch" }), JSON.stringify({ tool_name: "WebFetch", tool_input: null }), fetchOf(undefined), fetchOf(42), fetchOf(["https://example.org/"]), fetchOf("https://example.org/", "Bash"), fetchOf("https://example.org/", "WebSearch")]) assert.equal(await guardVerdict(raw, deps), notChecked, raw);
});

const byName = (found: Record<string, string[] | Error | "never">) => ({
  withinMs: 40,
  resolve: (host: string) => {
    const answer = found[host];
    if (answer === "never") return new Promise<string[]>(() => {});
    return answer instanceof Error || answer === undefined ? Promise.reject(answer ?? new Error("ENOTFOUND")) : Promise.resolve(answer);
  },
});

test("a name whose www twin leads to a private address is refused, because a redirect between the two isn't checked again", async () => {
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), byName({ "example.org": ["93.184.216.34"], "www.example.org": ["192.168.1.50"] })), privatePlace);
  assert.equal(await guardVerdict(fetchOf("https://www.example.org/"), byName({ "www.example.org": ["93.184.216.34"], "example.org": ["10.0.0.5"] })), privatePlace);
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), byName({ "example.org": ["93.184.216.34"], "www.example.org": ["93.184.216.34", "fd00::1"] })), privatePlace);
});

test("a twin that doesn't exist doesn't stop a public page, and a twin that never answers does", async () => {
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), byName({ "example.org": ["93.184.216.34"] })), null);
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), byName({ "example.org": ["93.184.216.34"], "www.example.org": [] })), null);
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), byName({ "example.org": ["93.184.216.34"], "www.example.org": "never" })), notResolved);
  assert.equal(await guardVerdict(fetchOf("https://example.org/"), byName({ "www.example.org": ["93.184.216.34"] })), notResolved, "the name itself has to lead somewhere");
});

test("the guard's answer is the allow message with exit code 0 for a checked page, and exit code 2 with the reason for anything else", async () => {
  assert.deepEqual(await guardAnswer(fetchOf("https://example.org/"), leadsTo("93.184.216.34")), { code: 0, out: guardAllows });
  assert.deepEqual(JSON.parse(guardAllows), { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "The address guard checked it." } });
  assert.deepEqual(await guardAnswer(fetchOf("https://example.org/"), leadsTo("192.168.1.50")), { code: 2, err: privatePlace });
  assert.deepEqual(await guardAnswer("not json", leadsTo("93.184.216.34")), { code: 2, err: notChecked });
  assert.deepEqual(
    await guardAnswer(fetchOf("https://example.org/"), {
      resolve: () => {
        throw new Error("broken");
      },
    }),
    { code: 2, err: notChecked },
  );
});

function run(input: string, first: string[] = []): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [...first, fileURLToPath(new URL("./web-guard-run.js", import.meta.url))], (error, out, err) => resolve({ code: error === null ? 0 : typeof error.code === "number" ? error.code : null, out, err }));
    child.stdin?.end(input);
  });
}

test("run as a program, it exits 2 with the reason and allows nothing for a refused address and for input it can't read", async () => {
  assert.deepEqual(await run(fetchOf("https://192.168.0.1/admin")), { code: 2, out: "", err: bareNumber });
  assert.deepEqual(await run(fetchOf("https://jellyfin.home/")), { code: 2, out: "", err: privateName });
  assert.deepEqual(await run("not json"), { code: 2, out: "", err: notChecked });
  assert.deepEqual(await run(""), { code: 2, out: "", err: notChecked });
});

async function withLookup<T>(lookup: string, body: (first: string[]) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "guard-lookup-"));
  try {
    const file = join(dir, "lookup.cjs");
    await writeFile(file, `require("node:dns/promises").lookup = ${lookup};\nrequire("node:module").syncBuiltinESMExports();\n`);
    return await body(["--require", file]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("run as a program, a public name whose twin is public too gets the allow message and exit code 0", { timeout: 20_000 }, async () => {
  const ended = await withLookup(`async () => [{ address: "93.184.216.34", family: 4 }, { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 }]`, (first) => run(fetchOf("https://example.org/page"), first));
  assert.deepEqual(ended, { code: 0, out: guardAllows, err: "" });
});

test("run as a program, a name that leads somewhere private, or whose www twin does, is refused with nothing allowed", { timeout: 20_000 }, async () => {
  assert.deepEqual(await withLookup(`async () => [{ address: "192.168.1.50", family: 4 }]`, (first) => run(fetchOf("https://example.org/"), first)), { code: 2, out: "", err: privatePlace });
  assert.deepEqual(await withLookup(`async (host) => [{ address: host.startsWith("www.") ? "10.0.0.5" : "93.184.216.34", family: 4 }]`, (first) => run(fetchOf("https://example.org/"), first)), { code: 2, out: "", err: privatePlace });
});

test("run as a program, a name that can't be looked up is refused straight away", { timeout: 20_000 }, async () => {
  const started = Date.now();
  const ended = await withLookup(`() => Promise.reject(new Error("ENOTFOUND"))`, (first) => run(fetchOf("https://example.org/"), first));
  assert.deepEqual(ended, { code: 2, out: "", err: notResolved });
  assert.ok(Date.now() - started < 2_500, `${Date.now() - started} ms`);
});

test("run as a program with a lookup that never comes back, it refuses at its own time limit and exits there, not when the lookup gives up", { timeout: 20_000 }, async () => {
  const started = Date.now();
  const ended = await withLookup(`() => new Promise((resolve, reject) => setTimeout(() => reject(new Error("EAI_AGAIN")), 15000))`, (first) => run(fetchOf("https://example.org/"), first));
  const took = Date.now() - started;
  assert.deepEqual(ended, { code: 2, out: "", err: notResolved });
  assert.ok(took >= 2_500 && took < 9_000, `${took} ms`);
});
