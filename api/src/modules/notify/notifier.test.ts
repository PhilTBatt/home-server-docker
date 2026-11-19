import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Problem } from "../system/alerts.js";
import { createNotifier, notificationFor, safeLink, sendToNtfy, type Notification } from "./notifier.js";

const diskLow: Problem = { code: "disk-low", message: "Disk is low: 22 of 230 GB free." };
const memoryLow: Problem = { code: "memory-low", message: "Memory is low: 700 of 8000 MB available." };
const wifi: Problem = { code: "wifi-reconnects", message: "Wi-Fi reconnected 1 time in the last 24 hours." };

const sample: Notification = { title: "Home Hub: 1 problem", message: diskLow.message, tags: "warning" };

afterEach(() => {
  mock.restoreAll();
});

function fakeNtfy(status = 200) {
  return mock.method(globalThis, "fetch", async () => new Response(null, { status }));
}

test("nothing to say when there were no problems and still aren't", () => {
  assert.equal(notificationFor([], []), null);
});

test("a new problem produces a warning with its message", () => {
  assert.deepEqual(notificationFor([], [diskLow]), {
    title: "Home Hub: 1 problem",
    message: "Disk is low: 22 of 230 GB free.",
    tags: "warning",
  });
});

test("several new problems are listed one per line, in the order given", () => {
  assert.deepEqual(notificationFor([], [diskLow, memoryLow, wifi]), {
    title: "Home Hub: 3 problems",
    message: [diskLow.message, memoryLow.message, wifi.message].join("\n"),
    tags: "warning",
  });
});

test("the same problems again produce nothing", () => {
  assert.equal(notificationFor(["disk-low"], [diskLow]), null);
});

test("the same problems in a different order produce nothing", () => {
  assert.equal(notificationFor(["memory-low", "disk-low"], [diskLow, memoryLow]), null);
});

test("the same problem with different numbers produces nothing", () => {
  const worse: Problem = { code: "disk-low", message: "Disk is low: 5 of 230 GB free." };
  assert.equal(notificationFor(["disk-low"], [worse]), null);
});

test("problems going away produce an all-clear", () => {
  assert.deepEqual(notificationFor(["disk-low", "wifi-reconnects"], []), {
    title: "Home Hub: all clear",
    message: "No problems on the server.",
    tags: "white_check_mark",
  });
});

test("an extra problem produces a message listing everything current", () => {
  const result = notificationFor(["disk-low"], [diskLow, memoryLow]);
  assert.equal(result?.title, "Home Hub: 2 problems");
  assert.equal(result?.message, `${diskLow.message}\n${memoryLow.message}`);
});

test("one of two problems clearing produces a message with what's left", () => {
  const result = notificationFor(["disk-low", "memory-low"], [memoryLow]);
  assert.deepEqual(result, { title: "Home Hub: 1 problem", message: memoryLow.message, tags: "warning" });
});

test("one problem swapping for another produces a message", () => {
  const result = notificationFor(["disk-low"], [memoryLow]);
  assert.equal(result?.message, memoryLow.message);
});

test("the previous list passed in is left unchanged", () => {
  const previous = ["wifi-reconnects", "disk-low"];
  notificationFor(previous, [diskLow]);
  assert.deepEqual(previous, ["wifi-reconnects", "disk-low"]);
});

test("sendToNtfy posts the message to the topic with a title and tags", async () => {
  const fetchMock = fakeNtfy();
  await sendToNtfy("my-topic", sample);
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://ntfy.sh/my-topic");
  assert.equal(options?.method, "POST");
  assert.equal(options?.body, sample.message);
  const headers = new Headers(options?.headers);
  assert.equal(headers.get("Title"), "Home Hub: 1 problem");
  assert.equal(headers.get("Tags"), "warning");
});

test("sendToNtfy keeps an odd topic name inside the path", async () => {
  const fetchMock = fakeNtfy();
  await sendToNtfy("a/b?c", sample);
  assert.equal(fetchMock.mock.calls[0].arguments[0], "https://ntfy.sh/a%2Fb%3Fc");
});

test("sendToNtfy throws when ntfy refuses the message", async () => {
  fakeNtfy(429);
  await assert.rejects(sendToNtfy("my-topic", sample), /ntfy replied 429/);
});

test("sendToNtfy passes a timeout signal so a hung ntfy can't hold up the checks", async () => {
  const fetchMock = fakeNtfy();
  await sendToNtfy("my-topic", sample);
  assert.ok(fetchMock.mock.calls[0].arguments[1]?.signal instanceof AbortSignal);
});

test("sendToNtfy waits 10 seconds by default", async () => {
  fakeNtfy();
  const timeoutMock = mock.method(AbortSignal, "timeout");
  await sendToNtfy("my-topic", sample);
  assert.equal(timeoutMock.mock.callCount(), 1);
  assert.equal(timeoutMock.mock.calls[0].arguments[0], 10_000);
});

test("sendToNtfy gives up when ntfy doesn't answer within the timeout", async () => {
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
  await assert.rejects(sendToNtfy("my-topic", sample, 50), (error: Error) => error.name === "TimeoutError");
  assert.ok(Date.now() - started < 1000);
});

test("the first check sends nothing when all is well", async () => {
  const fetchMock = fakeNtfy();
  const check = createNotifier("my-topic", async () => []);
  assert.equal(await check(), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("the first check sends a message when there is a problem", async () => {
  const fetchMock = fakeNtfy();
  const check = createNotifier("my-topic", async () => [diskLow]);
  assert.equal(await check(), true);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a problem is only sent once while it lasts, then the all-clear once", async () => {
  const fetchMock = fakeNtfy();
  const readings: Problem[][] = [[diskLow], [diskLow], [diskLow], [], [], []];
  const check = createNotifier("my-topic", async () => readings.shift() ?? []);
  const sent = [];
  for (let i = 0; i < 6; i++) {
    sent.push(await check());
  }
  assert.deepEqual(sent, [true, false, false, true, false, false]);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.body, diskLow.message);
  assert.equal(fetchMock.mock.calls[1].arguments[1]?.body, "No problems on the server.");
});

test("a failed send is retried on the next check", async () => {
  let status = 500;
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status }));
  const check = createNotifier("my-topic", async () => [diskLow]);
  await assert.rejects(check(), /ntfy replied 500/);
  status = 200;
  assert.equal(await check(), true);
  assert.equal(await check(), false);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("a send that times out is retried on the next check", async () => {
  let calls = 0;
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls === 1) {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }
    return new Response(null, { status: 200 });
  });
  const check = createNotifier("my-topic", async () => [diskLow]);
  await assert.rejects(check(), (error: Error) => error.name === "TimeoutError");
  assert.equal(await check(), true);
  assert.equal(await check(), false);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("a failure reading the problems sends nothing", async () => {
  const fetchMock = fakeNtfy();
  const check = createNotifier("my-topic", async () => {
    throw new Error("disk read failed");
  });
  await assert.rejects(check(), /disk read failed/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("each notifier keeps its own memory", async () => {
  const fetchMock = fakeNtfy();
  const first = createNotifier("topic-one", async () => [diskLow]);
  const second = createNotifier("topic-two", async () => [diskLow]);
  assert.equal(await first(), true);
  assert.equal(await second(), true);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("a notification with no link sends no Click header", async () => {
  const fetchMock = fakeNtfy();
  await sendToNtfy("my-topic", sample);
  const headers = new Headers(fetchMock.mock.calls[0].arguments[1]?.headers);
  assert.equal(headers.get("Click"), null);
  assert.deepEqual([...headers.keys()].sort(), ["tags", "title"]);
});

test("a notification with an https link sends it as the Click header, so a tap opens it", async () => {
  const fetchMock = fakeNtfy();
  await sendToNtfy("my-topic", { ...sample, click: "https://www.ebay.co.uk/itm/123456789012" });
  const headers = new Headers(fetchMock.mock.calls[0].arguments[1]?.headers);
  assert.equal(headers.get("Click"), "https://www.ebay.co.uk/itm/123456789012");
  assert.equal(headers.get("Title"), "Home Hub: 1 problem");
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.body, sample.message);
});

test("a link that isn't plain https is left off, and the message still goes", async () => {
  const bad = [
    "http://www.ebay.co.uk/itm/1",
    "javascript:alert(1)",
    "intent://scan/#Intent;scheme=zxing;end",
    "file:///etc/passwd",
    "ntfy://ntfy.sh/other-topic",
    "//www.ebay.co.uk/itm/1",
    "www.ebay.co.uk/itm/1",
    "",
    "https://",
    " https://www.ebay.co.uk/itm/1",
    "https://www.ebay.co.uk/itm/1 ",
    "https://www.ebay.co.uk/itm/1\r\nX-Priority: 5",
    "https://www.ebay.co.uk/itm/1\nActions: http, Open, https://example.com",
    "https://www.ebay.co.uk/itm/\u0000",
    "https://www.ebay.co.uk/itm/caf\u00e9",
    "https://user:pass@www.ebay.co.uk/itm/1",
    "https://user@www.ebay.co.uk/itm/1",
    `https://www.ebay.co.uk/itm/${"1".repeat(500)}`,
  ];
  for (const click of bad) {
    const fetchMock = fakeNtfy();
    await sendToNtfy("my-topic", { ...sample, click });
    assert.equal(fetchMock.mock.callCount(), 1, `nothing sent for ${JSON.stringify(click)}`);
    const headers = new Headers(fetchMock.mock.calls[0].arguments[1]?.headers);
    assert.equal(headers.get("Click"), null, `Click sent for ${JSON.stringify(click)}`);
    assert.equal(fetchMock.mock.calls[0].arguments[1]?.body, sample.message);
    mock.restoreAll();
  }
});

test("safeLink keeps an ordinary https link exactly, with its path and query", () => {
  assert.equal(safeLink("https://www.ebay.co.uk/itm/123?hash=item1"), "https://www.ebay.co.uk/itm/123?hash=item1");
  assert.equal(safeLink("https://hub.home/"), "https://hub.home/");
});

test("safeLink gives nothing for a missing link", () => {
  assert.equal(safeLink(undefined), null);
});

test("the problem notifier's own messages carry no link", async () => {
  const fetchMock = fakeNtfy();
  const check = createNotifier("my-topic", async () => [diskLow]);
  await check();
  assert.equal(new Headers(fetchMock.mock.calls[0].arguments[1]?.headers).get("Click"), null);
});