import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { askDirect, createEventReader, messagesUrl, type DirectRequest, type StreamEvent } from "./direct.js";

const key = "sk-ant-test-key";

afterEach(() => {
  mock.restoreAll();
});

function event(data: object): string {
  return `event: x\ndata: ${JSON.stringify(data)}\n\n`;
}

function textDelta(text: string): string {
  return event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
}

const opening = [
  event({ type: "message_start", message: { id: "msg_1" } }),
  event({ type: "ping" }),
  event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
];
const closing = [event({ type: "content_block_stop", index: 0 }), event({ type: "message_delta", delta: { stop_reason: "end_turn" } }), event({ type: "message_stop" })];

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function fakeApi(chunks: string[]) {
  return mock.method(globalThis, "fetch", async () => new Response(streamOf(chunks), { status: 200 }));
}

function clock(times: number[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)];
}

function request(overrides: Partial<DirectRequest> = {}): DirectRequest {
  return { apiKey: key, model: "claude-haiku-5-5", system: "Be brief.", question: "Hello?", maxTokens: 300, thinkingOff: false, now: clock([1000, 1400, 2100]), ...overrides };
}

test("posts to the Messages API", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  await askDirect(request());
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[0], messagesUrl);
  assert.equal(messagesUrl, "https://api.anthropic.com/v1/messages");
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.method, "POST");
});

test("sends the key, the API version and JSON headers", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  await askDirect(request());
  assert.deepEqual(fetchMock.mock.calls[0].arguments[1]?.headers, {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  });
});

test("asks for a streamed answer with the model, system prompt, question and token limit, leaving thinking at the model's default", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  await askDirect(request());
  assert.deepEqual(JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)), {
    model: "claude-haiku-5-5",
    max_tokens: 300,
    system: "Be brief.",
    stream: true,
    messages: [{ role: "user", content: "Hello?" }],
  });
});

test("turns thinking off when asked, and changes nothing else", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  await askDirect(request({ thinkingOff: true }));
  assert.deepEqual(JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)), {
    model: "claude-haiku-5-5",
    max_tokens: 300,
    system: "Be brief.",
    stream: true,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: "Hello?" }],
  });
});

test("times the first words from the first text, and the full answer from the end of the stream", async () => {
  fakeApi([...opening, textDelta("Morning, "), textDelta("Phil."), ...closing]);
  assert.deepEqual(await askDirect(request()), {
    text: "Morning, Phil.",
    firstWordsMs: 400,
    totalMs: 1100,
    inputTokens: 0,
    outputTokens: 0,
    content: [{ type: "text", text: "Morning, Phil." }],
    stopReason: "end_turn",
  });
});

test("only reads the clock three times: start, first words and end", async () => {
  fakeApi([...opening, textDelta("a"), textDelta("b"), textDelta("c"), ...closing]);
  const now = mock.fn(clock([0, 10, 20]));
  await askDirect(request({ now }));
  assert.equal(now.mock.callCount(), 3);
});

test("events split across chunks are put back together", async () => {
  const whole = textDelta("Split answer.");
  fakeApi([...opening, whole.slice(0, 15), whole.slice(15, 40), whole.slice(40), ...closing]);
  assert.equal((await askDirect(request())).text, "Split answer.");
});

test("several events in one chunk are all read", async () => {
  fakeApi([opening.join("") + textDelta("One ") + textDelta("two.") + closing.join("")]);
  assert.equal((await askDirect(request())).text, "One two.");
});

test("Windows line endings work too, even split between chunks", async () => {
  const whole = textDelta("CRLF fine.").replaceAll("\n", "\r\n");
  const cut = whole.indexOf("\r\n\r\n") + 1;
  fakeApi([...opening, whole.slice(0, cut), whole.slice(cut), ...closing]);
  assert.equal((await askDirect(request())).text, "CRLF fine.");
});

test("non-text deltas don't count as first words", async () => {
  const toolInput = event({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{" } });
  fakeApi([...opening, toolInput, textDelta("Now words."), ...closing]);
  const now = mock.fn(clock([0, 250, 600]));
  const answer = await askDirect(request({ now }));
  assert.equal(answer.firstWordsMs, 250);
  assert.equal(answer.text, "Now words.");
});

test("no first-words time when the answer has no text", async () => {
  fakeApi([...opening, ...closing]);
  assert.deepEqual(await askDirect(request({ now: clock([0, 700]) })), {
    text: "",
    firstWordsMs: null,
    totalMs: 700,
    inputTokens: 0,
    outputTokens: 0,
    content: [],
    stopReason: "end_turn",
  });
});

test("an error event in the stream stops with the API's message", async () => {
  fakeApi([...opening, textDelta("Half"), event({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })]);
  await assert.rejects(askDirect(request()), { message: "The API stopped with an error: Overloaded" });
});

test("an error event with no message still stops", async () => {
  fakeApi([event({ type: "error" })]);
  await assert.rejects(askDirect(request()), { message: "The API stopped with an error: no details" });
});

test("a refused request says the status and the API's reason", async () => {
  const body = JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
  mock.method(globalThis, "fetch", async () => new Response(body, { status: 401 }));
  await assert.rejects(askDirect(request()), { message: "The API replied 401: invalid x-api-key" });
});

test("the credits running out shows the API's own words", async () => {
  const body = JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } });
  mock.method(globalThis, "fetch", async () => new Response(body, { status: 400 }));
  await assert.rejects(askDirect(request()), { message: "The API replied 400: Your credit balance is too low to access the Anthropic API." });
});

test("a refusal that isn't JSON says there are no details", async () => {
  mock.method(globalThis, "fetch", async () => new Response("<html>Bad gateway</html>", { status: 502 }));
  await assert.rejects(askDirect(request()), { message: "The API replied 502: no details" });
});

test("an empty answer body is an error", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  await assert.rejects(askDirect(request()), { message: "The API sent no answer" });
});

test("says when the API can't be reached", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(askDirect(request()), { message: "Couldn't reach the API" });
});

test("passes a timeout, 60 seconds unless told otherwise", async () => {
  fakeApi([...opening, textDelta("Hi."), ...closing]);
  const timeoutMock = mock.method(AbortSignal, "timeout");
  await askDirect(request());
  assert.equal(timeoutMock.mock.calls[0].arguments[0], 60_000);
});

test("says when the API doesn't answer in time", async () => {
  mock.method(globalThis, "fetch", (_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const neverAborted = setTimeout(() => reject(new Error("never aborted")), 1000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(neverAborted);
        reject(init.signal?.reason);
      });
    });
  });
  await assert.rejects(askDirect(request({ timeoutMs: 50 })), { message: "The API didn't answer in time" });
});

test("earlier turns go before the question, in order", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  const history = [
    { role: "user" as const, content: "First?" },
    { role: "assistant" as const, content: "First answer." },
  ];
  await askDirect(request({ history }));
  const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)) as { messages: unknown[] };
  assert.deepEqual(body.messages, [...history, { role: "user", content: "Hello?" }]);
});

test("the history it was given isn't changed", async () => {
  fakeApi([...opening, textDelta("Hi."), ...closing]);
  const history = [{ role: "user" as const, content: "First?" }];
  await askDirect(request({ history }));
  assert.deepEqual(history, [{ role: "user", content: "First?" }]);
});

test("each piece of text is handed on as it arrives", async () => {
  fakeApi([...opening, textDelta("Hi "), event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{" } }), textDelta("Phil."), ...closing]);
  const heard: string[] = [];
  const answer = await askDirect(request({ onText: (delta) => heard.push(delta) }));
  assert.deepEqual(heard, ["Hi ", "Phil."]);
  assert.equal(answer.text, "Hi Phil.");
});

test("reads the tokens used from the start and the end of the stream", async () => {
  fakeApi([
    event({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 120, output_tokens: 1 } } }),
    textDelta("Hi."),
    event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 45 } }),
    event({ type: "message_stop" }),
  ]);
  const answer = await askDirect(request());
  assert.equal(answer.inputTokens, 120);
  assert.equal(answer.outputTokens, 45);
});

test("tokens count as zero when the stream doesn't say", async () => {
  fakeApi([...opening, textDelta("Hi."), ...closing]);
  const answer = await askDirect(request());
  assert.equal(answer.inputTokens, 0);
  assert.equal(answer.outputTokens, 0);
});

test("stopping from outside cancels the request, and the timeout still applies", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  const timeoutMock = mock.method(AbortSignal, "timeout");
  const stopping = new AbortController();
  await askDirect(request({ signal: stopping.signal, timeoutMs: 5000 }));
  const signal = fetchMock.mock.calls[0].arguments[1]?.signal;
  assert.equal(timeoutMock.mock.calls[0].arguments[0], 5000);
  assert.equal(signal?.aborted, false);
  stopping.abort();
  assert.equal(signal?.aborted, true);
});

test("with a stop signal from outside, the timeout still ends a request that never answers", async () => {
  mock.method(globalThis, "fetch", (_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const neverAborted = setTimeout(() => reject(new Error("never aborted")), 1000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(neverAborted);
        reject(init.signal?.reason);
      });
    });
  });
  const stopping = new AbortController();
  await assert.rejects(askDirect(request({ signal: stopping.signal, timeoutMs: 50 })), { message: "The API didn't answer in time" });
  assert.equal(stopping.signal.aborted, false);
});

test("stopping from outside while waiting for the API stops the request", async () => {
  mock.method(globalThis, "fetch", (_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  });
  const stopping = new AbortController();
  const answer = askDirect(request({ signal: stopping.signal }));
  stopping.abort();
  await assert.rejects(answer, { message: "Couldn't reach the API" });
});

function toolUse(index: number, id: string, name: string, jsonParts: string[]): string[] {
  return [
    event({ type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } }),
    ...jsonParts.map((part) => event({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: part } })),
    event({ type: "content_block_stop", index }),
  ];
}

const toolStop = [event({ type: "message_delta", delta: { stop_reason: "tool_use" } }), event({ type: "message_stop" })];

const readFileTool = { name: "read_file", description: "Read a file.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };

test("tools are sent when there are some", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  await askDirect(request({ tools: [readFileTool] }));
  const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)) as { tools?: unknown };
  assert.deepEqual(body.tools, [readFileTool]);
});

test("an empty tool list isn't sent", async () => {
  const fetchMock = fakeApi([...opening, textDelta("Hi."), ...closing]);
  await askDirect(request({ tools: [] }));
  const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)) as Record<string, unknown>;
  assert.equal("tools" in body, false);
});

test("a tool request is put back together from its pieces, after the text before it", async () => {
  fakeApi([
    ...opening,
    textDelta("Let me check."),
    event({ type: "content_block_stop", index: 0 }),
    ...toolUse(1, "toolu_1", "read_file", ['{"pa', 'th": "index', '.md"}']),
    ...toolStop,
  ]);
  const answer = await askDirect(request());
  assert.deepEqual(answer.content, [
    { type: "text", text: "Let me check." },
    { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "index.md" } },
  ]);
  assert.equal(answer.stopReason, "tool_use");
  assert.equal(answer.text, "Let me check.");
});

test("several tool requests in one answer come back in order", async () => {
  fakeApi([
    event({ type: "message_start", message: { id: "msg_1" } }),
    ...toolUse(0, "toolu_1", "read_file", ['{"path": "a.md"}']),
    ...toolUse(1, "toolu_2", "list_folder", ['{"path": "."}']),
    ...toolStop,
  ]);
  const answer = await askDirect(request());
  assert.deepEqual(answer.content, [
    { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.md" } },
    { type: "tool_use", id: "toolu_2", name: "list_folder", input: { path: "." } },
  ]);
});

test("a tool request with no input pieces has an empty input", async () => {
  fakeApi([event({ type: "message_start", message: { id: "msg_1" } }), ...toolUse(0, "toolu_1", "list_folder", []), ...toolStop]);
  const answer = await askDirect(request());
  assert.deepEqual(answer.content, [{ type: "tool_use", id: "toolu_1", name: "list_folder", input: {} }]);
});

test("a tool request whose input isn't valid JSON is unreadable", async () => {
  fakeApi([event({ type: "message_start", message: { id: "msg_1" } }), ...toolUse(0, "toolu_1", "read_file", ['{"path": ']), ...toolStop]);
  await assert.rejects(askDirect(request()), { message: "The API sent something unreadable" });
});

test("blank text isn't kept as a block, since the API refuses empty text when it's sent back", async () => {
  fakeApi([...opening, textDelta("  "), event({ type: "content_block_stop", index: 0 }), ...toolUse(1, "toolu_1", "list_folder", ['{"path": "."}']), ...toolStop]);
  const answer = await askDirect(request());
  assert.deepEqual(answer.content, [{ type: "tool_use", id: "toolu_1", name: "list_folder", input: { path: "." } }]);
});

test("a block that never finishes isn't kept", async () => {
  fakeApi([...opening, textDelta("Half"), event({ type: "message_delta", delta: { stop_reason: "max_tokens" } }), event({ type: "message_stop" })]);
  const answer = await askDirect(request());
  assert.deepEqual(answer.content, []);
  assert.equal(answer.stopReason, "max_tokens");
});

test("thinking isn't shown, timed or kept", async () => {
  fakeApi([
    event({ type: "message_start", message: { id: "msg_1" } }),
    event({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    event({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Hmm." } }),
    event({ type: "content_block_stop", index: 0 }),
    event({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
    event({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hi." } }),
    event({ type: "content_block_stop", index: 1 }),
    ...closing.slice(1),
  ]);
  const answer = await askDirect(request());
  assert.equal(answer.text, "Hi.");
  assert.deepEqual(answer.content, [{ type: "text", text: "Hi." }]);
});

test("the stop reason is empty when the stream doesn't give one", async () => {
  fakeApi([...opening, textDelta("Hi."), event({ type: "content_block_stop", index: 0 }), event({ type: "message_stop" })]);
  assert.equal((await askDirect(request())).stopReason, null);
});

test("tool results go back as the user's turn, after the earlier turns", async () => {
  const fetchMock = fakeApi([...opening, textDelta("It covers your life."), ...closing]);
  const history = [
    { role: "user" as const, content: "What's in my notes?" },
    { role: "assistant" as const, content: [{ type: "tool_use" as const, id: "toolu_1", name: "read_file", input: { path: "index.md" } }] },
  ];
  const results = [{ type: "tool_result" as const, tool_use_id: "toolu_1", content: "# Index" }];
  await askDirect(request({ history, question: results }));
  const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)) as { messages: unknown[] };
  assert.deepEqual(body.messages, [...history, { role: "user", content: results }]);
});

test("no error message ever includes the key", async () => {
  const failures: Array<() => Promise<Response>> = [
    async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 401 }),
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => new Response(streamOf([event({ type: "error", error: { message: "Overloaded" } })]), { status: 200 }),
  ];
  for (const failure of failures) {
    mock.method(globalThis, "fetch", failure);
    await assert.rejects(askDirect(request()), (error: Error) => !error.message.includes(key));
    mock.restoreAll();
  }
});

test("an answer that stops before the end is an error, not a short answer", async () => {
  fakeApi([...opening, textDelta("Half an")]);
  await assert.rejects(askDirect(request()), { message: "The answer was cut off" });
});

function failingStream(chunks: string[], failure: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.error(failure);
    },
  });
}

test("timing out while the answer is streaming says so", async () => {
  const timedOut = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  mock.method(globalThis, "fetch", async () => new Response(failingStream([...opening, textDelta("Hi")], timedOut), { status: 200 }));
  await assert.rejects(askDirect(request()), { message: "The API didn't answer in time" });
});

test("a connection that drops mid-answer says so", async () => {
  mock.method(globalThis, "fetch", async () => new Response(failingStream([...opening], new TypeError("terminated")), { status: 200 }));
  await assert.rejects(askDirect(request()), { message: "The connection dropped mid-answer" });
});

test("an event that isn't valid JSON says the answer was unreadable", async () => {
  fakeApi([...opening, "data: {not json\n\n", ...closing]);
  await assert.rejects(askDirect(request()), { message: "The API sent something unreadable" });
});

test("the event reader hands over each data line as an event", () => {
  const events: StreamEvent[] = [];
  const read = createEventReader((parsed) => events.push(parsed));
  read("event: ping\ndata: {\"type\":\"ping\"}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
  assert.deepEqual(events, [{ type: "ping" }, { type: "message_stop" }]);
});

test("the event reader waits for the blank line that ends an event", () => {
  const events: StreamEvent[] = [];
  const read = createEventReader((parsed) => events.push(parsed));
  read("data: {\"type\":\"ping\"}\n");
  assert.deepEqual(events, []);
  read("\n");
  assert.deepEqual(events, [{ type: "ping" }]);
});

test("the event reader skips blocks with no data line", () => {
  const events: StreamEvent[] = [];
  const read = createEventReader((parsed) => events.push(parsed));
  read(": keep-alive\n\nevent: ping\n\n");
  assert.deepEqual(events, []);
});