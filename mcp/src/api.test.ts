import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createApiGet, createApiPost, readToken } from "./api.js";

const token = "test-token";

afterEach(() => {
  mock.restoreAll();
});

function fakeApi(status = 200, body: string = JSON.stringify({ status: "ok" })) {
  return mock.method(globalThis, "fetch", async () => new Response(body, { status }));
}

test("readToken returns API_TOKEN", () => {
  assert.equal(readToken({ API_TOKEN: token }), token);
});

test("readToken refuses a missing API_TOKEN and names it", () => {
  assert.throws(() => readToken({}), { message: "Missing setting: API_TOKEN" });
});

test("readToken refuses an empty API_TOKEN", () => {
  assert.throws(() => readToken({ API_TOKEN: "" }), { message: "Missing setting: API_TOKEN" });
});

test("readToken ignores other settings", () => {
  assert.equal(readToken({ API_TOKEN: token, QBIT_API_KEY: "other" }), token);
});

test("calls the API on the compose network with the path given", async () => {
  const fetchMock = fakeApi();
  await createApiGet(token)("/system/status");
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[0], "http://api:3000/system/status");
});

test("sends the token as a Bearer header", async () => {
  const fetchMock = fakeApi();
  await createApiGet(token)("/system/status");
  const headers = fetchMock.mock.calls[0].arguments[1]?.headers as Record<string, string>;
  assert.deepEqual(headers, { Authorization: "Bearer test-token" });
});

test("createApiGet only ever reads: a GET with no body", async () => {
  const fetchMock = fakeApi();
  await createApiGet(token)("/media/downloads");
  const init = fetchMock.mock.calls[0].arguments[1];
  assert.equal(init?.method, "GET");
  assert.equal(init?.body, undefined);
});

test("returns the API's JSON", async () => {
  fakeApi(200, JSON.stringify({ movies: 12, series: 3, episodes: 40 }));
  assert.deepEqual(await createApiGet(token)("/media/library"), { movies: 12, series: 3, episodes: 40 });
});

test("returns JSON lists as they are", async () => {
  fakeApi(200, JSON.stringify([]));
  assert.deepEqual(await createApiGet(token)("/media/downloads"), []);
});

test("passes a timeout signal so a hung API can't hold up Claude Code", async () => {
  const fetchMock = fakeApi();
  await createApiGet(token)("/health");
  assert.ok(fetchMock.mock.calls[0].arguments[1]?.signal instanceof AbortSignal);
});

test("the timeout is 10 seconds unless told otherwise", async () => {
  fakeApi();
  const timeoutMock = mock.method(AbortSignal, "timeout");
  await createApiGet(token)("/health");
  assert.equal(timeoutMock.mock.callCount(), 1);
  assert.equal(timeoutMock.mock.calls[0].arguments[0], 10_000);
});

test("says when the API doesn't answer within the timeout", async () => {
  mock.method(globalThis, "fetch", (_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const neverAborted = setTimeout(() => reject(new Error("never aborted")), 1000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(neverAborted);
        reject(init.signal?.reason);
      });
    });
  });
  const started = Date.now();
  await assert.rejects(createApiGet(token, 50)("/health"), { message: "The API didn't answer in time" });
  assert.ok(Date.now() - started < 1000);
});

test("says when the API can't be reached at all", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(createApiGet(token)("/health"), { message: "Couldn't reach the API" });
});

test("names the status and path when the API replies with an error", async () => {
  fakeApi(502, JSON.stringify({ error: "Bad Gateway" }));
  await assert.rejects(createApiGet(token)("/media/downloads"), { message: "The API replied 502 to /media/downloads" });
});

test("a wrong token comes back as a 401", async () => {
  fakeApi(401, JSON.stringify({ error: "Unauthorized" }));
  await assert.rejects(createApiGet(token)("/system/status"), { message: "The API replied 401 to /system/status" });
});

test("a reply that isn't JSON is an error, not a crash", async () => {
  fakeApi(200, "<html>not json</html>");
  await assert.rejects(createApiGet(token)("/system/status"), SyntaxError);
});

test("error messages never include the token", async () => {
  const failures: Array<() => void> = [
    () => fakeApi(401),
    () => mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); }),
  ];
  for (const fail of failures) {
    mock.restoreAll();
    fail();
    await assert.rejects(createApiGet(token)("/health"), (error: Error) => !error.message.includes(token));
  }
});

test("createApiPost sends a POST to the API on the compose network", async () => {
  const fetchMock = fakeApi(200, JSON.stringify({ status: "scan started" }));
  await createApiPost(token)("/media/library/scan");
  const [url, init] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://api:3000/media/library/scan");
  assert.equal(init?.method, "POST");
});

test("createApiPost sends the token as a Bearer header", async () => {
  const fetchMock = fakeApi();
  await createApiPost(token)("/media/library/scan");
  const headers = fetchMock.mock.calls[0].arguments[1]?.headers as Record<string, string>;
  assert.deepEqual(headers, { Authorization: "Bearer test-token" });
});

test("createApiPost sends no body, so the API doesn't reject an empty JSON body", async () => {
  const fetchMock = fakeApi();
  await createApiPost(token)("/media/library/scan");
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.body, undefined);
});

test("createApiPost returns the API's JSON", async () => {
  fakeApi(200, JSON.stringify({ status: "stopped" }));
  assert.deepEqual(await createApiPost(token)(`/media/downloads/${"a".repeat(40)}/stop`), { status: "stopped" });
});

test("createApiPost has the same 10 second timeout", async () => {
  fakeApi();
  const timeoutMock = mock.method(AbortSignal, "timeout");
  await createApiPost(token)("/media/library/scan");
  assert.equal(timeoutMock.mock.calls[0].arguments[0], 10_000);
});

test("createApiPost names the status and path when the API refuses", async () => {
  fakeApi(400, JSON.stringify({ error: "Bad Request" }));
  await assert.rejects(createApiPost(token)("/media/downloads/all/stop"), { message: "The API replied 400 to /media/downloads/all/stop" });
});

test("createApiPost says when the API can't be reached", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(createApiPost(token)("/media/library/scan"), { message: "Couldn't reach the API" });
});