import assert from "node:assert/strict";
import { test } from "node:test";
import { createChanges, lookEveryMs, waitMs } from "./changes.js";

test("a wait lasts up to 20 seconds, and while anyone waits the view is looked at every second", () => {
  assert.deepEqual([waitMs, lookEveryMs], [20_000, 1_000]);
});

test("the version goes up only when the view really changes", () => {
  let view = { state: "muted" };
  const changes = createChanges(() => view);
  assert.equal(changes.version(), 0);
  changes.check();
  assert.equal(changes.version(), 0);
  view = { state: "idle" };
  changes.check();
  changes.check();
  assert.equal(changes.version(), 1);
  view = { state: "idle" };
  changes.check();
  assert.equal(changes.version(), 1);
  view = { state: "muted" };
  changes.check();
  assert.equal(changes.version(), 2);
});

test("a wait from before the latest version ends at once, and one from it ends at the next change", { timeout: 5_000 }, async () => {
  let view = { state: "muted" };
  const changes = createChanges(() => view);
  const never = new AbortController().signal;
  await changes.wait(-1, never);
  view = { state: "idle" };
  changes.check();
  await changes.wait(0, never);
  let woken = 0;
  const waiting = [changes.wait(1, never).then(() => woken++), changes.wait(1, never).then(() => woken++)];
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(woken, 0);
  changes.check();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(woken, 0, "nothing changed, so nobody is woken");
  view = { state: "recording" };
  changes.check();
  await Promise.all(waiting);
  assert.equal(woken, 2);
});

test("a wait ends after its time even with no change, and at once when it's called off", { timeout: 5_000 }, async () => {
  const changes = createChanges(() => ({}));
  const began = performance.now();
  await changes.wait(0, new AbortController().signal, 100);
  assert.ok(performance.now() - began >= 95);
  const calledOff = new AbortController();
  const quick = changes.wait(0, calledOff.signal, 60_000);
  calledOff.abort();
  await quick;
  const already = new AbortController();
  already.abort();
  await changes.wait(0, already.signal, 60_000);
});

test("while someone waits, a change nobody reported is still found within the look interval, and the looking stops when nobody waits", { timeout: 5_000 }, async () => {
  let view = { state: "idle" };
  let looks = 0;
  const changes = createChanges(() => {
    looks++;
    return view;
  }, 30);
  const waiting = changes.wait(0, new AbortController().signal, 2_000);
  view = { state: "failed" };
  const began = performance.now();
  await waiting;
  assert.ok(performance.now() - began < 500);
  assert.equal(changes.version(), 1);
  const after = looks;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(looks, after);
});
