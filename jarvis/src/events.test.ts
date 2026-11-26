import assert from "node:assert/strict";
import { test } from "node:test";
import { createEvents, merged } from "./events.js";

async function take<Value>(source: AsyncIterable<Value>, count: number): Promise<Value[]> {
  const got: Value[] = [];
  for await (const value of source) {
    got.push(value);
    if (got.length === count) break;
  }
  return got;
}

test("events pushed before and after someone starts reading arrive in order, and ending stops the reader", async () => {
  const queue = createEvents<number>();
  queue.push(1);
  queue.push(2);
  const reading = (async () => {
    const got: number[] = [];
    for await (const value of queue.events) got.push(value);
    return got;
  })();
  await new Promise((resolve) => setImmediate(resolve));
  queue.push(3);
  await new Promise((resolve) => setImmediate(resolve));
  queue.end();
  queue.push(4);
  assert.deepEqual(await reading, [1, 2, 3]);
});

test("ending a queue still hands over what was already waiting", async () => {
  const queue = createEvents<string>();
  queue.push("a");
  queue.end();
  assert.deepEqual(await take(queue.events, 5), ["a"]);
});

test("merged sources come through as they arrive, and it finishes when every source has", async () => {
  const first = createEvents<string>();
  const second = createEvents<string>();
  const reading = (async () => {
    const got: string[] = [];
    for await (const value of merged(first.events, second.events)) got.push(value);
    return got;
  })();
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  first.push("a1");
  await tick();
  second.push("b1");
  await tick();
  second.push("b2");
  first.end();
  await tick();
  second.push("b3");
  await tick();
  second.end();
  assert.deepEqual(await reading, ["a1", "b1", "b2", "b3"]);
});

test("a source that fails is dropped without stopping the others, and leaving early closes every source", async () => {
  const good = createEvents<number>();
  let closed = 0;
  const failing: AsyncIterable<number> = { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error("broken")), return: async () => (closed++, { done: true, value: undefined }) }) };
  const endless: AsyncIterable<number> = { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}), return: async () => (closed++, { done: true, value: undefined }) }) };
  good.push(7);
  good.push(8);
  assert.deepEqual(await take(merged(failing, good.events, endless), 2), [7, 8]);
  assert.equal(closed, 2);
});

test("merging nothing finishes at once", async () => {
  assert.deepEqual(await take(merged<number>(), 1), []);
});
