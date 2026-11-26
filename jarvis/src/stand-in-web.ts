import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const webAnswer = "Stand-in answer from the web.";
export const webDigest = "Stand-in digest of the search results.";
export const webSites = ["https://www.example.org/a", "https://example.com/b"];
export const privatePageWord = "OPEN_PRIVATE";
export const privatePage = "https://192.168.0.1/admin";
export const publicPageWord = "OPEN_PUBLIC";
export const publicPage = "https://look-up-check.invalid/page";
export const hangWord = "NEVER_ANSWER";
export const optionQuestion = "--model";

export type WebSeen = { path: string; tools: string[]; serverTools: string[]; system: string; body: string; toolErrors: string[] };

export type StandInWeb = { url: string; requests: WebSeen[]; close(): Promise<void> };

type Block = { type: string; [field: string]: unknown };

function sse(blocks: Block[], stop: string, id: number): string {
  const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  let out = event("message_start", { type: "message_start", message: { id: `msg_web_${id}`, type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
  blocks.forEach((block, index) => {
    if (block.type === "text") {
      out += event("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } });
      out += event("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else if (block.type === "tool_use" || block.type === "server_tool_use") {
      out += event("content_block_start", { type: "content_block_start", index, content_block: { type: block.type, id: block.id, name: block.name, input: {} } });
      out += event("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    } else out += event("content_block_start", { type: "content_block_start", index, content_block: block });
    out += event("content_block_stop", { type: "content_block_stop", index });
  });
  out += event("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } });
  return out + event("message_stop", { type: "message_stop" });
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => (body += chunk));
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

type Message = { role?: unknown; content?: unknown };

function resultsIn(messages: Message[]): Array<{ text: string; isError: boolean }> {
  return messages.flatMap((message) => (Array.isArray(message.content) ? message.content : [])).flatMap((block: { type?: unknown; content?: unknown; is_error?: unknown }) => (block.type === "tool_result" ? [{ text: typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""), isError: block.is_error === true }] : []));
}

export async function startStandInWeb(): Promise<StandInWeb> {
  const requests: WebSeen[] = [];
  let count = 0;
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const raw = await readBody(request);
    let body: { tools?: unknown; messages?: unknown; system?: unknown } = {};
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      body = {};
    }
    const path = (request.url ?? "").split("?")[0];
    const tools = Array.isArray(body.tools) ? (body.tools as Array<{ name?: unknown; type?: unknown }>) : [];
    const messages = Array.isArray(body.messages) ? (body.messages as Message[]) : [];
    const results = resultsIn(messages);
    const seen: WebSeen = { path, tools: tools.filter((tool) => typeof tool.type !== "string" || tool.type === "custom").map((tool) => String(tool.name)), serverTools: tools.filter((tool) => typeof tool.type === "string" && tool.type !== "custom").map((tool) => String(tool.type)), system: typeof body.system === "string" ? body.system : JSON.stringify(body.system ?? ""), body: raw, toolErrors: results.filter((result) => result.isError).map((result) => result.text) };
    requests.push(seen);
    if (request.method !== "POST" || path !== "/v1/messages") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }
    if (raw.includes(hangWord)) return;
    count++;
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (seen.serverTools.some((type) => type.startsWith("web_search"))) {
      response.end(sse([{ type: "server_tool_use", id: `srvtoolu_${count}`, name: "web_search", input: { query: "stand-in query" } }, { type: "web_search_tool_result", tool_use_id: `srvtoolu_${count}`, content: webSites.map((url, index) => ({ type: "web_search_result", url, title: `Stand-in result ${index + 1}`, encrypted_content: "c3RhbmQtaW4=", page_age: null })) }, { type: "text", text: webDigest }], "end_turn", count));
      return;
    }
    if (!seen.tools.includes("WebSearch")) {
      response.end(sse([{ type: "text", text: "Stand-in side answer." }], "end_turn", count));
      return;
    }
    if (results.length === 0) response.end(sse([{ type: "tool_use", id: `toolu_search_${count}`, name: "WebSearch", input: { query: "stand-in query" } }], "tool_use", count));
    else if (results.length === 1 && raw.includes(publicPageWord)) response.end(sse([{ type: "tool_use", id: `toolu_fetch_${count}`, name: "WebFetch", input: { url: publicPage, prompt: "What does it say?" } }], "tool_use", count));
    else if (results.length === 1 && raw.includes(privatePageWord)) response.end(sse([{ type: "tool_use", id: `toolu_fetch_${count}`, name: "WebFetch", input: { url: privatePage, prompt: "What does it say?" } }], "tool_use", count));
    else response.end(sse([{ type: "text", text: webAnswer }], "end_turn", count));
  }
  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
