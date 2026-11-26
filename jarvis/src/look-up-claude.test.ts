import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { helperSystem, noNumbers } from "./look-up.js";
import { claudeHelper, findProgram, guardCommand, guardFile, guardSeconds, helperArgs, helperEnv, helperSettings, helperTurns, noGuard, noProgram, noResult, otherTools, planToken, programNames, readRun, safeError } from "./look-up-claude.js";

const init = { type: "system", subtype: "init", tools: ["WebFetch", "WebSearch"], apiKeySource: "none", claude_code_version: "2.1.327" };
const search = (id: string, query: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name: "WebSearch", input: { query } }] } });
const fetched = (id: string, url: string) => ({ type: "assistant", message: { content: [{ type: "text", text: "Let me open that." }, { type: "tool_use", id, name: "WebFetch", input: { url, prompt: "What does it say?" } }] } });
const links = (id: string, urls: string[]) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: `Web search results for query: "x"\n\nLinks: ${JSON.stringify(urls.map((url) => ({ title: "A [bracketed] title", url })))}\n\nA digest with [brackets] in it.\n\n\nREMINDER: You MUST include the sources above.` }] } });
const result = (extra: Record<string, unknown> = {}) => ({ type: "result", subtype: "success", is_error: false, num_turns: 3, duration_ms: 11_233, duration_api_ms: 9_619, time_to_request_ms: 1_585, total_cost_usd: 0.0130146, result: "The latest is 26.13.0.", permission_denials: [], usage: { input_tokens: 4, output_tokens: 463 }, modelUsage: { "claude-haiku-5-5": { inputTokens: 14_484, outputTokens: 1_222, cacheReadInputTokens: 6_709, cacheCreationInputTokens: 4_441, webSearchRequests: 1 } }, ...extra });
const stream = (...lines: unknown[]) => `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;

test("a finished run is read into the answer, the numbers, and the sites found, opened and refused", () => {
  const out = stream(
    init,
    search("s1", "latest node"),
    links("s1", ["https://www.nodejs.org/en/blog", "https://endoflife.date/nodejs", "https://nodejs.org/en/about"]),
    fetched("f1", "https://nodejs.org/en/blog/release/v26.0.0"),
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "f1", content: "Node 26 notes" }] } },
    fetched("f2", "https://192.168.0.1/admin"),
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "f2", is_error: true, content: "PreToolUse:WebFetch hook error" }] } },
    result({ permission_denials: [{ tool_name: "WebFetch", tool_use_id: "f2", tool_input: { url: "https://192.168.0.1/admin" } }] }),
  );
  assert.deepEqual(readRun(out, 0, ""), {
    answer: "The latest is 26.13.0.",
    error: null,
    numbers: { searches: 1, opened: 1, refused: 1, steps: 3, inputTokens: 14_484 + 6_709 + 4_441, outputTokens: 1_222, costEstimateUsd: 0.0130146, helperMs: 11_233, startMs: 1_585, credential: "none", version: "2.1.327" },
    found: ["nodejs.org", "endoflife.date"],
    opened: ["nodejs.org"],
    refused: ["192.168.0.1"],
  });
});

test("a run that answered from the search alone counts one search and no pages, as Phil's first timing run did", () => {
  const read = readRun(stream(init, search("s1", "q"), links("s1", ["https://endoflife.date/nodejs"]), result({ num_turns: 2 })), 0, "");
  assert.deepEqual([read.numbers.searches, read.numbers.opened, read.numbers.refused, read.numbers.steps, read.found, read.opened], [1, 0, 0, 2, ["endoflife.date"], []]);
});

test("a refusal that isn't a page fetch is still counted as refused, without a site", () => {
  const read = readRun(stream(init, result({ permission_denials: [{ tool_name: "Bash", tool_use_id: "b1", tool_input: { command: "ls" } }, { tool_name: "WebFetch" }] })), 0, "");
  assert.deepEqual([read.numbers.refused, read.numbers.opened, read.refused], [2, 0, []]);
});

test("token counts fall back to the plain usage block when there's no per-model one, and missing numbers stay empty", () => {
  const read = readRun(stream(result({ modelUsage: undefined, usage: { input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 2, output_tokens: 7 }, time_to_request_ms: undefined, total_cost_usd: "free", num_turns: -1 })), 0, "");
  assert.deepEqual([read.numbers.inputTokens, read.numbers.outputTokens, read.numbers.startMs, read.numbers.costEstimateUsd, read.numbers.steps, read.numbers.credential, read.numbers.version], [17, 7, null, null, null, null, null]);
  assert.deepEqual(readRun(stream(result({ modelUsage: {}, usage: null })), 0, "").numbers.inputTokens, null);
});

test("a run that ended in an error, or printed no result at all, has no answer and says why", () => {
  const failed = readRun(stream(init, result({ subtype: "error_max_turns", is_error: true, result: "" })), 1, "");
  assert.deepEqual([failed.answer, failed.error], [null, "Claude Code said: error_max_turns"]);
  const unflagged = readRun(stream(init, result({ subtype: "error_during_execution", is_error: false, result: "half an answer" })), 0, "");
  assert.deepEqual([unflagged.answer, unflagged.error], [null, "Claude Code said: error_during_execution: half an answer"], "an ending that isn't success is never an answer, whatever its error flag says");
  const flagged = readRun(stream(init, result({ is_error: true, result: "Invalid API key sk-ant-test-key" })), 1, "");
  assert.deepEqual([flagged.answer, flagged.error], [null, "Claude Code said: success: Invalid API key [key]"]);
  const silent = readRun("", 127, "sh: claude: not found\n");
  assert.deepEqual([silent.answer, silent.error, silent.numbers], [null, `${noResult} It exited with 127. sh: claude: not found`, noNumbers]);
  assert.equal(readRun("not json\n[]\n42\n", null, "").error, noResult);
});

test("lines that aren't JSON, and a links list that can't be read, are skipped without losing the rest", () => {
  const out = `garbage\n${stream(init, search("s1", "q"))}{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"s1","content":"Links: [not json]"}]}}\n${stream(result())}`;
  const read = readRun(out, 0, "");
  assert.deepEqual([read.answer, read.found, read.numbers.searches], ["The latest is 26.13.0.", [], 1]);
  const blocks = readRun(stream(search("s1", "q"), { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "s1", content: [{ type: "text", text: 'Links: [{"title":"t","url":"https://example.org/a"},{"title":"no url"},{"url":"ftp://x.example/"}]' }] }] } }, result()), 0, "");
  assert.deepEqual(blocks.found, ["example.org"]);
});

test("an error line is kept short, on one line, and without anything that looks like a key", () => {
  assert.equal(safeError("  bad\n\nkey sk-ant-test-key_1-2   here "), "bad key [key] here");
  assert.equal(safeError("x".repeat(500)).length, 200);
});

test("the program is asked for by the right package name for the machine, the musl one first on a musl system", () => {
  assert.deepEqual(programNames("linux", "x64", true), ["claude-agent-sdk-linux-x64-musl/claude", "claude-agent-sdk-linux-x64/claude"]);
  assert.deepEqual(programNames("linux", "arm64", false), ["claude-agent-sdk-linux-arm64/claude", "claude-agent-sdk-linux-arm64-musl/claude"]);
  assert.deepEqual(programNames("darwin", "arm64", false), ["claude-agent-sdk-darwin-arm64/claude"]);
  assert.deepEqual(programNames("win32", "x64", false), ["claude-agent-sdk-win32-x64/claude.exe"]);
});

test("the program that comes with the Agent SDK is found beside it, and a folder without one gives nothing", async () => {
  const found = await findProgram();
  assert.ok(found !== null && /claude-agent-sdk-[a-z0-9-]+\/claude(\.exe)?$/.test(found), String(found));
  const empty = await mkdtemp(join(tmpdir(), "no-program-"));
  try {
    assert.equal(await findProgram(`file://${join(empty, "claude-agent-sdk", "sdk.mjs")}`), null);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test("the guard's command refuses the page when the guard can't run, and quotes paths with spaces or quotes in them", () => {
  assert.equal(guardCommand("/usr/local/bin/node", "/app/dist/web-guard-run.js"), "'/usr/local/bin/node' '/app/dist/web-guard-run.js' || exit 2");
  assert.equal(guardCommand("/a b/node", "/it's/guard.js"), "'/a b/node' '/it'\\''s/guard.js' || exit 2");
  assert.deepEqual(JSON.parse(helperSettings("/n", "/g")), { hooks: { PreToolUse: [{ matcher: "WebFetch", hooks: [{ type: "command", command: "'/n' '/g' || exit 2", timeout: guardSeconds }] }] } });
});

test("the program is started with only the two web tools, nothing asked, no settings or MCP servers, the helper's own instructions and nothing saved", () => {
  const args = helperArgs("claude-haiku-5-5", "{}");
  const after = (flag: string) => args[args.indexOf(flag) + 1];
  assert.deepEqual(args.slice(0, 2), ["-p", "--tools"], "the question is never an argument, so it can't be read as an option");
  assert.equal(after("--tools"), "WebSearch,WebFetch");
  assert.deepEqual(args.slice(args.indexOf("--allowedTools") + 1, args.indexOf("--allowedTools") + 3), ["WebSearch", "--permission-mode"], "searching is allowed outright and opening a page is not: only the guard can allow one");
  assert.ok(!args.some((arg) => arg.startsWith("WebFetch")));
  assert.equal(after("--permission-mode"), "dontAsk");
  assert.equal(after("--setting-sources"), "");
  assert.equal(after("--settings"), "{}");
  assert.equal(after("--system-prompt"), helperSystem);
  assert.equal(after("--model"), "claude-haiku-5-5");
  assert.equal(after("--max-turns"), String(helperTurns));
  assert.equal(after("--output-format"), "stream-json");
  for (const flag of ["--strict-mcp-config", "--no-session-persistence", "--verbose"]) assert.ok(args.includes(flag), flag);
  for (const flag of ["--bare", "--dangerously-skip-permissions", "--mcp-config", "--add-dir", "--continue", "--resume"]) assert.ok(!args.includes(flag), flag);
});

test("the program's environment holds the credential it was given and nothing else from Jarvis's own", () => {
  const before = { ...process.env };
  process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-leak";
  process.env.API_TOKEN = "hub-token-should-not-leak";
  try {
    const env = helperEnv({ [planToken]: "plan-token" }, "/tmp/h", "/usr/bin");
    assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/tmp/h", CLAUDE_CONFIG_DIR: "/tmp/h/.claude", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", CLAUDE_CODE_OAUTH_TOKEN: "plan-token" });
  } finally {
    process.env = before;
  }
});

async function fake(body: string): Promise<{ dir: string; program: string; seen: string }> {
  const dir = await mkdtemp(join(tmpdir(), "fake-claude-"));
  const program = join(dir, "claude");
  const seen = join(dir, "seen.json");
  await writeFile(program, `#!/usr/bin/env node\nconst { writeFileSync, readdirSync } = require("node:fs");\nconst seen = ${JSON.stringify(seen)};\nconst input = require("node:fs").readFileSync(0, "utf8");\nwriteFileSync(seen, JSON.stringify({ args: process.argv.slice(2), env: process.env, cwd: process.cwd(), files: readdirSync(process.cwd()), input }));\n${body}\n`);
  await chmod(program, 0o755);
  return { dir, program, seen };
}

const path = `${dirname(process.execPath)}:/usr/bin:/bin`;
const answerBody = `process.stdout.write(${JSON.stringify(stream(init, search("s1", "q"), links("s1", ["https://example.org/a"]), result()))});`;

test("the helper runs the program in a fresh empty folder with a clean environment and no input, reads its answer, and removes the folder", async () => {
  const { dir, program, seen } = await fake(answerBody);
  const before = { ...process.env };
  process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-leak";
  process.env.API_TOKEN = "hub-token-should-not-leak";
  try {
    const helped = await claudeHelper({ model: "claude-haiku-5-5", credential: { [planToken]: "plan-token" }, program, path })("what's new?", new AbortController().signal);
    assert.deepEqual([helped.answer, helped.error, helped.found, helped.numbers.searches], ["The latest is 26.13.0.", null, ["example.org"], 1]);
    const was = JSON.parse(await readFile(seen, "utf8")) as { args: string[]; env: Record<string, string>; cwd: string; files: string[]; input: string };
    assert.deepEqual(was.args.slice(0, 2), ["-p", "--tools"]);
    assert.ok(!was.args.includes("what's new?"));
    assert.equal(was.input, "what's new?");
    assert.ok(was.args[was.args.indexOf("--settings") + 1].includes(`'${guardFile}' || exit 2`));
    assert.ok(was.args[was.args.indexOf("--settings") + 1].includes(`'${process.execPath}'`));
    assert.deepEqual(Object.keys(was.env).filter((name) => !name.startsWith("__")).sort(), ["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR", "DISABLE_ERROR_REPORTING", "DISABLE_TELEMETRY", "HOME", "PATH"]);
    assert.equal(was.env.HOME, was.cwd);
    assert.ok(/jarvis-web-/.test(was.cwd), was.cwd);
    assert.deepEqual(was.files, []);
    await assert.rejects(stat(was.cwd), { code: "ENOENT" });
  } finally {
    process.env = before;
    await rm(dir, { recursive: true, force: true });
  }
});

test("a question that looks like an option reaches the program as the question, with the same arguments as any other", async () => {
  const { dir, program, seen } = await fake(answerBody);
  try {
    const args: string[][] = [];
    for (const question of ["what's new?", "--model", "-40 C in F", "--append-system-prompt", "--tools Bash", "-- --dangerously-skip-permissions"]) {
      const helped = await claudeHelper({ model: "claude-haiku-5-5", credential: {}, program, path })(question, new AbortController().signal);
      assert.equal(helped.error, null, question);
      const was = JSON.parse(await readFile(seen, "utf8")) as { args: string[]; input: string };
      assert.equal(was.input, question);
      args.push(was.args);
    }
    for (const other of args.slice(1)) assert.deepEqual(other, args[0]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a look-up stopped while its folder is being made starts nothing, says stopped and leaves no folder", async () => {
  const { dir, program, seen } = await fake(answerBody);
  try {
    const stop = new AbortController();
    let made = "";
    const folder = async () => {
      made = await mkdtemp(join(dir, "jarvis-web-"));
      stop.abort();
      return made;
    };
    const helped = await claudeHelper({ model: "m", credential: {}, program, path, folder })("q", stop.signal);
    assert.deepEqual([helped.answer, helped.error], [null, "stopped"]);
    await assert.rejects(stat(seen), { code: "ENOENT" });
    assert.notEqual(made, "");
    await assert.rejects(stat(made), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a run that started with any tool beyond the two web tools has its answer thrown away", () => {
  const started = (tools: unknown) => JSON.stringify({ type: "system", subtype: "init", tools, apiKeySource: "none", claude_code_version: "2.1.327" });
  const run = (tools: unknown) => readRun(`${started(tools)}\n${stream(result())}`, 0, "");
  for (const tools of [["WebFetch", "WebSearch"], ["WebSearch"], [], undefined, "WebSearch"]) assert.deepEqual([run(tools).answer, run(tools).error], ["The latest is 26.13.0.", null], JSON.stringify(tools));
  for (const tools of [["WebFetch", "WebSearch", "Bash"], ["Read"], ["Task", "Bash", "WebFetch", "WebSearch", "Write"], ["WebSearch", 7], ["websearch"], ["WebSearch", "WebFetch", "WebBrowser"]]) assert.deepEqual([run(tools).answer, run(tools).error], [null, otherTools], JSON.stringify(tools));
  assert.equal(run(["Bash"]).numbers.version, "2.1.327");
});

test("the helper says so when the program or the guard is missing, and starts nothing", async () => {
  const { dir, program, seen } = await fake(answerBody);
  try {
    assert.equal((await claudeHelper({ model: "m", credential: {}, program: null, path })("q", new AbortController().signal)).error, noProgram);
    assert.equal((await claudeHelper({ model: "m", credential: {}, program, path, guard: join(dir, "no-guard.js") })("q", new AbortController().signal)).error, noGuard);
    await assert.rejects(stat(seen), { code: "ENOENT" });
    const stopped = new AbortController();
    stopped.abort();
    assert.equal((await claudeHelper({ model: "m", credential: {}, program, path })("q", stopped.signal)).error, "stopped");
    await assert.rejects(stat(seen), { code: "ENOENT" });
    assert.match((await claudeHelper({ model: "m", credential: {}, program: join(dir, "not-there"), path })("q", new AbortController().signal)).error ?? "", /^Claude Code couldn't start: /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a program that fails says why from its exit code and what it printed", async () => {
  const { dir, program } = await fake(`process.stderr.write("Not logged in\\n"); process.exit(1);`);
  try {
    const helped = await claudeHelper({ model: "m", credential: {}, program, path })("q", new AbortController().signal);
    assert.deepEqual([helped.answer, helped.error], [null, `${noResult} It exited with 1. Not logged in`]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stopping a look-up ends the program, with a harder stop if it ignores the first, and its late answer isn't used", async () => {
  for (const body of [`setInterval(() => {}, 1000);`, `process.on("SIGTERM", () => { process.stdout.write(${JSON.stringify(stream(result()))}); }); setInterval(() => {}, 1000);`]) {
    const { dir, program, seen } = await fake(body);
    try {
      const stop = new AbortController();
      const running = claudeHelper({ model: "m", credential: {}, program, path, killAfterMs: 150 })("q", stop.signal);
      for (let tries = 0; tries < 200; tries++) {
        if (await stat(seen).then(() => true, () => false)) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const started = Date.now();
      stop.abort();
      const helped = await running;
      assert.ok(Date.now() - started < 3_000, String(Date.now() - started));
      assert.deepEqual([helped.answer, helped.error], [null, "stopped"]);
      const was = JSON.parse(await readFile(seen, "utf8")) as { cwd: string };
      await assert.rejects(stat(was.cwd), { code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});
