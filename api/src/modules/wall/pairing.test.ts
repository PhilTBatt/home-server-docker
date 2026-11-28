import assert from "node:assert/strict";
import { test } from "node:test";
import { codePattern, createPairings, mostPairings, pairIdPattern, pairingMs } from "./pairing.js";

test("codes are six digits and pairing ids 32 hex characters, made from the crypto module by default", () => {
  const pairings = createPairings();
  const seen = new Set<string>();
  for (let i = 0; i < mostPairings; i++) {
    const started = pairings.start(0);
    assert.ok("id" in started);
    assert.match(started.code, codePattern);
    assert.match(started.id, pairIdPattern);
    seen.add(started.code);
  }
  assert.equal(seen.size, mostPairings, "no two live pairings share a code");
});

test("a confirmed pairing is held a minute for its screen to collect, once, then goes", () => {
  const pairings = createPairings({ makeCode: () => "111111" });
  const started = pairings.start(0);
  assert.ok("id" in started);
  assert.equal(pairings.confirm("111111", pairingMs - 1_000), "paired");
  assert.deepEqual(pairings.state(started.id, pairingMs + 30_000), { state: "paired", seconds: 29 });
  assert.equal(pairings.collect(started.id, pairingMs + 30_000), true);
  assert.equal(pairings.collect(started.id, pairingMs + 30_000), false);
  assert.equal(pairings.live(pairingMs + 30_000), 0);
  const late = pairings.start(0);
  assert.ok("id" in late);
  pairings.confirm("111111", 0);
  assert.equal(pairings.collect(late.id, 60_001 + pairingMs), false, "not collected in time");
});

test("a confirmed code can't be confirmed again, and a pairing that isn't confirmed can't be collected", () => {
  const pairings = createPairings({ makeCode: () => "222222" });
  const started = pairings.start(0);
  assert.ok("id" in started);
  assert.equal(pairings.collect(started.id, 1), false);
  assert.equal(pairings.confirm("222222", 1), "paired");
  assert.equal(pairings.confirm("222222", 2), "wrong");
});

test("waiting ends at once when the pairing is already gone, and at its expiry rather than waiting longer", { timeout: 5_000 }, async () => {
  const clock = { at: 0 };
  const pairings = createPairings();
  assert.deepEqual(await pairings.wait("f".repeat(32), 10_000, new AbortController().signal, () => clock.at), { state: "gone", seconds: 0 });
  const started = pairings.start(0);
  assert.ok("id" in started);
  clock.at = pairingMs - 20;
  const begun = Date.now();
  const waited = pairings.wait(started.id, 10_000, new AbortController().signal, () => clock.at);
  setTimeout(() => (clock.at = pairingMs), 10);
  assert.equal((await waited).state, "gone");
  assert.ok(Date.now() - begun < 2_000);
});
