import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Problem } from "../system/alerts.js";
import { createNotifier, notificationFor, sendToNtfy, type Notification } from "./notifier.js";

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