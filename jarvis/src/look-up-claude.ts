import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { access, constants, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { helperSystem, noNumbers, type Helped, type Helper, type HelperNumbers } from "./look-up.js";
import { siteOf } from "./web-guard-rules.js";

export const helperTools = ["WebSearch", "WebFetch"];
export const allowedWithoutTheGuard = ["WebSearch"];
export const helperTurns = 6;
export const guardSeconds = 10;
export const killAfterMs = 2_000;
export const guardFile = fileURLToPath(new URL("./web-guard-run.js", import.meta.url));
export const planToken = "CLAUDE_CODE_OAUTH_TOKEN";
export const noProgram = "The Claude Code program that comes with the Agent SDK wasn't found.";
export const noGuard = "The address guard is missing, so nothing was looked up.";
export const noResult = "Claude Code ended without a result.";
export const otherTools = "Claude Code started with tools it shouldn't have, so its answer wasn't used.";

export type ClaudeHelperSettings = {
  model: string;
  credential: Record<string, string>;
  program?: string | null;
  node?: string;
  guard?: string;
  path?: string;
  killAfterMs?: number;
  folder?: () => Promise<string>;
};

export function programNames(platform: string, arch: string, musl: boolean): string[] {
  const base = "claude-agent-sdk";
  if (platform === "linux") return (musl ? ["-musl", ""] : ["", "-musl"]).map((libc) => `${base}-linux-${arch}${libc}/claude`);
  return [`${base}-${platform}-${arch}/claude${platform === "win32" ? ".exe" : ""}`];
}

function onMusl(): boolean {
  try {
    return process.platform === "linux" && readdirSync("/lib").some((name) => name.startsWith("ld-musl-"));
  } catch {
    return false;
  }
}

export async function findProgram(sdk: string = import.meta.resolve("@anthropic-ai/claude-agent-sdk")): Promise<string | null> {
  const packages = dirname(dirname(fileURLToPath(sdk)));
  for (const name of programNames(process.platform, process.arch, onMusl())) {
    const path = join(packages, name);
    if (
      await access(path, constants.X_OK).then(
        () => true,
        () => false,
      )
    )
      return path;
  }
  return null;
}

function quoted(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

export function guardCommand(node: string, guard: string): string {
  return `${quoted(node)} ${quoted(guard)} || exit 2`;
}

export function helperSettings(node: string, guard: string): string {
  return JSON.stringify({ hooks: { PreToolUse: [{ matcher: "WebFetch", hooks: [{ type: "command", command: guardCommand(node, guard), timeout: guardSeconds }] }] } });
}

export function helperArgs(model: string, settings: string): string[] {
  return [
    "-p",
    "--tools",
    helperTools.join(","),
    "--allowedTools",
    ...allowedWithoutTheGuard,
    "--permission-mode",
    "dontAsk",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--settings",
    settings,
    "--system-prompt",
    helperSystem,
    "--model",
    model,
    "--max-turns",
    String(helperTurns),
    "--no-session-persistence",
    "--output-format",
    "stream-json",
    "--verbose",
  ];
}

export function helperEnv(credential: Record<string, string>, home: string, path: string): Record<string, string> {
  return { PATH: path, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", ...credential };
}

type Block = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; tool_use_id?: unknown; content?: unknown };

function blocksOf(message: unknown): Block[] {
  const content = (message as { message?: { content?: unknown } } | null)?.message?.content;
  return Array.isArray(content) ? content.filter((block): block is Block => typeof block === "object" && block !== null) : [];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((part) => (typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")).join("\n") : "";
}

function linkedSites(text: string): string[] {
  const start = text.indexOf("Links: [");
  if (start === -1) return [];
  const from = start + "Links: ".length;
  for (let end = text.indexOf("]", from); end !== -1; end = text.indexOf("]", end + 1)) {
    try {
      const links: unknown = JSON.parse(text.slice(from, end + 1));
      if (Array.isArray(links)) return links.flatMap((link) => (typeof link === "object" && link !== null && typeof (link as { url?: unknown }).url === "string" ? [siteOf((link as { url: string }).url)] : [])).filter((site): site is string => site !== null);
    } catch {
      continue;
    }
  }
  return [];
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function tokens(result: Record<string, unknown>): { input: number | null; output: number | null } {
  const models = result.modelUsage;
  if (typeof models === "object" && models !== null) {
    const used = Object.values(models).filter((model): model is Record<string, unknown> => typeof model === "object" && model !== null);
    if (used.length > 0) return { input: used.reduce((sum, model) => sum + (count(model.inputTokens) ?? 0) + (count(model.cacheReadInputTokens) ?? 0) + (count(model.cacheCreationInputTokens) ?? 0), 0), output: used.reduce((sum, model) => sum + (count(model.outputTokens) ?? 0), 0) };
  }
  const usage = result.usage;
  if (typeof usage !== "object" || usage === null) return { input: null, output: null };
  const { input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: written, output_tokens: output } = usage as Record<string, unknown>;
  return { input: count(input) === null ? null : (count(input) ?? 0) + (count(read) ?? 0) + (count(written) ?? 0), output: count(output) };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function safeError(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function readRun(out: string, code: number | null, err: string): Helped {
  const numbers: HelperNumbers = { ...noNumbers };
  const searchIds = new Set<string>();
  const fetches = new Map<string, string | null>();
  const refusedIds = new Set<string>();
  const found: string[] = [];
  let refusedOther = 0;
  let answer: string | null = null;
  let error: string | null = null;
  let finished = false;
  let extraTools = false;
  for (const raw of out.split("\n")) {
    if (raw.trim() === "") continue;
    let line: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) continue;
      line = parsed as Record<string, unknown>;
    } catch {
      continue;
    }
    if (line.type === "system" && line.subtype === "init") {
      numbers.credential = typeof line.apiKeySource === "string" ? line.apiKeySource : null;
      numbers.version = typeof line.claude_code_version === "string" ? line.claude_code_version : null;
      if (Array.isArray(line.tools) && line.tools.some((tool) => !helperTools.includes(String(tool)))) extraTools = true;
    } else if (line.type === "assistant") {
      for (const block of blocksOf(line)) {
        if (block.type !== "tool_use" || typeof block.id !== "string") continue;
        if (block.name === "WebSearch") searchIds.add(block.id);
        else if (block.name === "WebFetch") fetches.set(block.id, typeof (block.input as { url?: unknown } | null)?.url === "string" ? siteOf((block.input as { url: string }).url) : null);
      }
    } else if (line.type === "user") {
      for (const block of blocksOf(line)) if (block.type === "tool_result" && typeof block.tool_use_id === "string" && searchIds.has(block.tool_use_id)) found.push(...linkedSites(textOf(block.content)));
    } else if (line.type === "result") {
      finished = true;
      const ok = line.subtype === "success" && line.is_error !== true;
      answer = ok && typeof line.result === "string" ? line.result : null;
      if (!ok) error = safeError(`Claude Code said: ${typeof line.subtype === "string" ? line.subtype : "error"}${typeof line.result === "string" && line.result !== "" ? `: ${line.result}` : ""}`);
      numbers.steps = count(line.num_turns);
      numbers.helperMs = count(line.duration_ms);
      numbers.startMs = count(line.time_to_request_ms);
      numbers.costEstimateUsd = count(line.total_cost_usd);
      const used = tokens(line);
      numbers.inputTokens = used.input;
      numbers.outputTokens = used.output;
      for (const denial of Array.isArray(line.permission_denials) ? line.permission_denials : []) {
        const id = (denial as { tool_use_id?: unknown } | null)?.tool_use_id;
        if (typeof id === "string" && fetches.has(id)) refusedIds.add(id);
        else refusedOther++;
      }
    }
  }
  if (extraTools) {
    answer = null;
    error = otherTools;
  } else if (!finished) error = safeError(`${noResult}${code === null ? "" : ` It exited with ${code}.`}${err.trim() === "" ? "" : ` ${err}`}`);
  const sites = (ids: Iterable<string>) => unique([...ids].map((id) => fetches.get(id)).filter((site): site is string => typeof site === "string"));
  numbers.searches = searchIds.size;
  numbers.opened = fetches.size - refusedIds.size;
  numbers.refused = refusedIds.size + refusedOther;
  return { answer, error, numbers, found: unique(found), opened: sites([...fetches.keys()].filter((id) => !refusedIds.has(id))), refused: sites(refusedIds) };
}

export function claudeHelper(settings: ClaudeHelperSettings): Helper {
  return async (question, signal) => {
    const failed = (error: string): Helped => ({ answer: null, error, numbers: { ...noNumbers }, found: [], opened: [], refused: [] });
    const program = settings.program === undefined ? await findProgram() : settings.program;
    if (program === null) return failed(noProgram);
    const guard = settings.guard ?? guardFile;
    if (
      !(await access(guard, constants.R_OK).then(
        () => true,
        () => false,
      ))
    )
      return failed(noGuard);
    if (signal.aborted) return failed("stopped");
    const home = await (settings.folder ?? (() => mkdtemp(join(tmpdir(), "jarvis-web-"))))();
    try {
      if (signal.aborted) return failed("stopped");
      return await new Promise<Helped>((resolve) => {
        const child = spawn(program, helperArgs(settings.model, helperSettings(settings.node ?? process.execPath, guard)), { cwd: home, env: helperEnv(settings.credential, home, settings.path ?? process.env.PATH ?? ""), stdio: ["pipe", "pipe", "pipe"] });
        child.stdin.on("error", () => {});
        child.stdin.end(question);
        let out = "";
        let err = "";
        let hard: NodeJS.Timeout | undefined;
        const stop = () => {
          child.kill("SIGTERM");
          hard = setTimeout(() => child.kill("SIGKILL"), settings.killAfterMs ?? killAfterMs);
        };
        signal.addEventListener("abort", stop, { once: true });
        child.stdout.setEncoding("utf8").on("data", (piece: string) => (out += piece));
        child.stderr.setEncoding("utf8").on("data", (piece: string) => (err = (err + piece).slice(-2_000)));
        const done = (helped: Helped) => {
          clearTimeout(hard);
          signal.removeEventListener("abort", stop);
          resolve(helped);
        };
        child.on("error", (problem) => done(failed(safeError(`Claude Code couldn't start: ${problem.message}`))));
        child.on("close", (code) => done(signal.aborted ? { ...readRun(out, code, err), answer: null, error: "stopped" } : readRun(out, code, err)));
      });
    } finally {
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  };
}
