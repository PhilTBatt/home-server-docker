import { messagesUrl } from "./direct.js";
import { noNumbers, searchOnlySystem, type Helped, type Helper } from "./look-up.js";
import { safeError } from "./look-up-claude.js";
import { answerCost, type Prices } from "./prices.js";
import { siteOf } from "./web-guard-rules.js";

export const searchTool = "web_search_20250305";
export const searchesPerLookUp = 3;
export const apiHelperTokens = 700;
export const searchPriceUsd = 0.01;
export const apiCredential = "API key";

export type ApiHelperSettings = { apiKey: string; model: string; now: () => number; prices?: Prices; url?: string };

type Block = { type?: unknown; text?: unknown; content?: unknown };

export type ApiRead = { answer: string | null; found: string[]; searches: number; input: number; cacheWrite: number; cacheRead: number; output: number; paused: boolean; content: Block[] };

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function readApiAnswer(body: unknown): ApiRead | null {
  if (typeof body !== "object" || body === null) return null;
  const { content, usage, stop_reason: stop } = body as { content?: unknown; usage?: unknown; stop_reason?: unknown };
  if (!Array.isArray(content)) return null;
  const blocks = content.filter((block): block is Block => typeof block === "object" && block !== null);
  const lastResult = blocks.findLastIndex((block) => block.type === "web_search_tool_result");
  const text = blocks
    .slice(lastResult + 1)
    .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
    .join("");
  const found = blocks.flatMap((block) => (block.type === "web_search_tool_result" && Array.isArray(block.content) ? block.content : [])).flatMap((result: { type?: unknown; url?: unknown }) => (result?.type === "web_search_result" && typeof result.url === "string" ? [siteOf(result.url)] : []));
  const used = typeof usage === "object" && usage !== null ? (usage as Record<string, unknown>) : {};
  const tools = typeof used.server_tool_use === "object" && used.server_tool_use !== null ? (used.server_tool_use as Record<string, unknown>) : {};
  return {
    answer: text.trim() === "" ? null : text,
    found: [...new Set(found.filter((site): site is string => site !== null))],
    searches: typeof tools.web_search_requests === "number" ? count(tools.web_search_requests) : blocks.filter((block) => block.type === "server_tool_use").length,
    input: count(used.input_tokens),
    cacheWrite: count(used.cache_creation_input_tokens),
    cacheRead: count(used.cache_read_input_tokens),
    output: count(used.output_tokens),
    paused: stop === "pause_turn",
    content: blocks,
  };
}

async function problemIn(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message;
    return safeError(`The API said ${response.status}${typeof message === "string" ? `: ${message}` : ""}`);
  } catch {
    return safeError(`The API said ${response.status}`);
  }
}

export function apiHelper(settings: ApiHelperSettings): Helper {
  return async (question, signal) => {
    const started = settings.now();
    const numbers = { ...noNumbers, credential: apiCredential, steps: 0 };
    const found: string[] = [];
    const totals = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
    const done = (answer: string | null, error: string | null): Helped => {
      numbers.helperMs = Math.max(0, Math.round(settings.now() - started));
      numbers.inputTokens = totals.input + totals.cacheWrite + totals.cacheRead;
      numbers.outputTokens = totals.output;
      numbers.costEstimateUsd = settings.prices === undefined ? null : answerCost(settings.prices, totals) + numbers.searches * searchPriceUsd;
      return { answer, error, numbers, found: [...new Set(found)], opened: [], refused: [] };
    };
    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [{ role: "user", content: question }];
    try {
      for (let round = 0; round < 2; round++) {
        const response = await fetch(settings.url ?? messagesUrl, {
          method: "POST",
          headers: { "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: settings.model, max_tokens: apiHelperTokens, system: searchOnlySystem, tools: [{ type: searchTool, name: "web_search", max_uses: searchesPerLookUp }], messages }),
          redirect: "error",
          signal,
        });
        if (!response.ok) return done(null, await problemIn(response));
        const read = readApiAnswer(await response.json());
        if (read === null) return done(null, "The API's answer couldn't be read.");
        numbers.steps = round + 1;
        numbers.searches += read.searches;
        found.push(...read.found);
        totals.input += read.input;
        totals.cacheWrite += read.cacheWrite;
        totals.cacheRead += read.cacheRead;
        totals.output += read.output;
        if (!read.paused) return done(read.answer, null);
        messages.push({ role: "assistant", content: read.content });
      }
      return done(null, "The API paused twice without answering.");
    } catch (error) {
      return done(null, signal.aborted ? "stopped" : safeError(`The API couldn't be reached: ${error instanceof Error ? error.message : String(error)}`));
    }
  };
}
