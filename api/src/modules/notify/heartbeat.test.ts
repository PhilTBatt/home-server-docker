import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { sendHeartbeat } from "./heartbeat.js";

const url = "https://hc-ping.com/00000000-0000-0000-0000-000000000000";

afterEach(() => {
  mock.restoreAll();
});

function fakeHealthchecks(body: string, status = 200) {
  return mock.method(globalThis, "fetch", async () => new Response(body, { status }));
}

test("sends one request to the exact ping address", async () => {
  const fetchMock = fakeHealthchecks("OK");
  await sendHeartbeat(url);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[0], url);
});

test("uses a plain GET with no body", async () => {
  const fetchMock = fakeHealthchecks("OK");
  await sendHeartbeat(url);
  const options = fetchMock.mock.calls[0].arguments[1];
  assert.equal(options?.method, undefined);
  assert.equal(options?.body, undefined);
});

test("passes a timeout signal so a dead connection can't hang forever", async () => {
  const fetchMock = fakeHealthchecks("OK");
  await sendHeartbeat(url);
  assert.ok(fetchMock.mock.calls[0].arguments[1]?.signal instanceof AbortSignal);
});

test("succeeds when Healthchecks answers OK", async () => {
  fakeHealthchecks("OK");
  await assert.doesNotReject(sendHeartbeat(url));
});

test("accepts OK with a trailing newline", async () => {
  fakeHealthchecks("OK\n");
  await assert.doesNotReject(sendHeartbeat(url));
});

test("fails when the check doesn't exist, even though the status is 200", async () => {
  fakeHealthchecks("OK (not found)");
  await assert.rejects(sendHeartbeat(url), /Healthchecks replied 200 OK \(not found\)/);
});

test("fails on a plain not found body", async () => {
  fakeHealthchecks("not found");
  await assert.rejects(sendHeartbeat(url), /not found/);
});

test("fails on an error status", async () => {
  fakeHealthchecks("rate limited", 429);
  await assert.rejects(sendHeartbeat(url), /Healthchecks replied 429 rate limited/);
});

test("fails on an error status even if the body says OK", async () => {
  fakeHealthchecks("OK", 500);
  await assert.rejects(sendHeartbeat(url), /Healthchecks replied 500/);
});

test("passes a network failure on to the caller", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(sendHeartbeat(url), /fetch failed/);
});

test("gives up when there's no answer within the timeout", async () => {
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
  await assert.rejects(sendHeartbeat(url, 50), (error: Error) => error.name === "TimeoutError");
  assert.ok(Date.now() - started < 1000);
});