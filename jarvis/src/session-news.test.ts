import assert from "node:assert/strict";
import { test } from "node:test";
import { changesOf, sessionSay, sessionsBackNote, sessionsOffNote, watchSessions, type ChangesReply } from "./session-news.js";

const change = (name: string, state: string, was: string | null = "working") => ({ name, state, was, at: "2026-11-27T10:00:00.000Z" });

test("session changes are read strictly: a plain name, a known state and what it was, and a real time", () => {
  assert.deepEqual(changesOf({ seq: 3, changes: [change("docker", "waiting"), change("brain", "stopped", null)] }), { seq: 3, changes: [{ name: "docker", state: "waiting", was: "working", at: "2026-11-27T10:00:00.000Z" }, { name: "brain", state: "stopped", was: null, at: "2026-11-27T10:00:00.000Z" }] });
  for (const fields of [{}, { seq: -1, changes: [] }, { seq: 1, changes: [change("Docker!", "waiting")] }, { seq: 1, changes: [change("docker", "asleep")] }, { seq: 1, changes: [change("docker", "waiting", "gone")] }, { seq: 1, changes: [{ ...change("docker", "waiting"), at: "soon" }] }]) assert.equal(changesOf(fields), null, JSON.stringify(fields));
});

test("watching skips what had already happened when he started, keeps waiting and stopped changes after that, and notes the hub being off and back", async () => {
  const stop = new AbortController();
  const asked: number[] = [];
  const replies: ChangesReply[] = [
    { status: 200, fields: { seq: 4, changes: [change("docker", "waiting")] } },
    { status: 200, fields: { seq: 6, changes: [change("docker", "working", "waiting"), change("brain", "waiting")] } },
    { status: 404, fields: { error: "The session manager is switched off" } },
    { status: 200, fields: { seq: 6, changes: [] } },
  ];
  const news = watchSessions({
    ask: async (after) => {
      asked.push(after);
      const next = replies.shift();
      if (next === undefined) {
        stop.abort();
        throw new Error("done");
      }
      return next;
    },
    signal: stop.signal,
    pollMs: 2,
    nudgeMs: 2,
    wait: async () => {},
  });
  const seen: string[] = [];
  let taken: string[] = [];
  for await (const event of news.events) {
    seen.push(event.kind === "sessions" ? "sessions" : event.line);
    if (event.kind === "sessions" && taken.length === 0) taken = news.take().map((one) => `${one.name} ${one.state}`);
  }
  assert.deepEqual(asked, [0, 4, 6, 6, 6]);
  assert.deepEqual(taken, ["brain waiting"]);
  assert.deepEqual(seen.filter((line) => line !== "sessions"), [sessionsOffNote, sessionsBackNote]);
});

test("what he says names each session once, by its latest change", () => {
  assert.equal(sessionSay([change("docker", "waiting") as never, change("brain", "stopped") as never, change("docker", "stopped") as never]), "The docker session has stopped. The brain session has stopped.");
  assert.equal(sessionSay([change("docker", "waiting") as never]), "The docker session is waiting on you.");
});
