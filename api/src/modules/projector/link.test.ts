import assert from "node:assert/strict";
import { test } from "node:test";
import { linkMemoryMb, linkOver, linkStopMs, linkWorkerOptions, pairingDone, readLinkEvent, startProblem, type LinkCommand, type LinkEvent } from "./link.js";

test("only the link's own kinds of news are taken from the worker, in their own shape", () => {
  assert.deepEqual(readLinkEvent({ kind: "ready" }), { kind: "ready" });
  assert.deepEqual(readLinkEvent({ kind: "powered", on: true }), { kind: "powered", on: true });
  assert.equal(readLinkEvent({ kind: "powered", on: "yes" }), null);
  assert.deepEqual(readLinkEvent({ kind: "paired", key: "k", cert: "c", more: 1 }), { kind: "paired", key: "k", cert: "c" });
  assert.equal(readLinkEvent({ kind: "paired", key: "k" }), null);
  assert.deepEqual(readLinkEvent({ kind: "problem", why: "x".repeat(500) }), { kind: "problem", why: "x".repeat(200) });
  assert.equal(readLinkEvent({ kind: "ended", why: "fake" }), null, "only the link itself says when the worker ended");
  assert.equal(readLinkEvent({ kind: "anything" }), null);
  assert.equal(readLinkEvent("ready"), null);
  assert.equal(readLinkEvent(null), null);
});

test("the worker that speaks to the projector runs with its own heap limit", () => {
  assert.equal(linkMemoryMb, 64);
  assert.deepEqual(linkWorkerOptions, { resourceLimits: { maxOldGenerationSizeMb: 64 } });
});

test("a pairing counts as done only when the projector took the code and then accepted the connection, never on one alone", () => {
  const pairing = { host: "192.168.1.23", pairing: null };
  const paired = { host: "192.168.1.23", pairing: { key: "k", cert: "c" } };
  assert.equal(pairingDone(pairing, true, true), true);
  assert.equal(pairingDone(pairing, true, false), false, "connected without a code taken: the code was turned down");
  assert.equal(pairingDone(pairing, false, true), false, "a code taken, but the projector didn't accept the connection");
  assert.equal(pairingDone(pairing, false, false), false);
  assert.equal(pairingDone(paired, true, true), false, "a press is never a new pairing");
  assert.equal(startProblem(pairing, true, true), null);
  assert.equal(startProblem(pairing, false, false), "pairing didn't finish");
  assert.equal(startProblem(pairing, false, true), "couldn't connect");
  assert.equal(startProblem(paired, false, false), "couldn't connect");
  assert.equal(startProblem(paired, true, false), null);
});

test("once the worker has ended, the link says so once, takes nothing more from it, and says a command didn't go", () => {
  const posted: LinkCommand[] = [];
  const heard: LinkEvent[] = [];
  const over = linkOver({ post: (message) => void posted.push(message), terminate: () => assert.fail("not stopped") }, (event) => void heard.push(event));
  assert.equal(over.link.send({ kind: "key", key: "wake" }), true);
  over.heard({ kind: "ready" });
  over.heard({ kind: "made up" });
  over.ended("it stopped with code 1");
  over.ended("it stopped");
  over.heard({ kind: "powered", on: true });
  assert.equal(over.link.send({ kind: "key", key: "sleep" }), false);
  assert.deepEqual(posted, [{ kind: "key", key: "wake" }]);
  assert.deepEqual(heard, [{ kind: "ready" }, { kind: "ended", why: "it stopped with code 1" }]);
  over.link.stop();
  assert.deepEqual(posted, [{ kind: "key", key: "wake" }], "stopping a link that's already ended sends nothing");
});

test("stopping the link asks the worker to stop, ends it for good after a while, and takes nothing more", () => {
  const posted: LinkCommand[] = [];
  const heard: LinkEvent[] = [];
  const pending: Array<{ run: () => void; ms: number }> = [];
  let terminated = 0;
  const over = linkOver({ post: (message) => void posted.push(message), terminate: () => void terminated++ }, (event) => void heard.push(event), (run, ms) => void pending.push({ run, ms }));
  over.link.stop();
  assert.deepEqual(posted, [{ kind: "stop" }]);
  assert.deepEqual(pending.map((one) => one.ms), [linkStopMs]);
  pending[0].run();
  assert.equal(terminated, 1);
  assert.equal(over.link.send({ kind: "key", key: "wake" }), false);
  over.heard({ kind: "ready" });
  over.ended("it stopped");
  assert.deepEqual(heard, [], "a link the hub stopped reports nothing more, not even its end");
});
