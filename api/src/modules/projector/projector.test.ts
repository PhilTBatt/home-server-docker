import assert from "node:assert/strict";
import { test } from "node:test";
import type { Link, LinkCommand, LinkEvent, LinkStart } from "./link.js";
import { busyPairing, busySending, codeWaitMs, confirmMs, createProjector, forgottenByProjector, notPairedYet, notReached, notSaved, pairingMs, powerWaitMs, pressStopped, readyMs, unknownPower, type ProjectorPower } from "./projector.js";
import type { Pairing, PairingStore } from "./store.js";
import type { EventSink } from "../events/feed.js";

const key = "-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n";
const cert = "-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----\n";
const kept: Pairing = { key, cert, pairedAt: "2026-11-28T09:00:00.000Z" };

function fakeTimers() {
  let at = 0;
  let next = 1;
  const pending = new Map<number, { due: number; run: () => void }>();
  const set = ((run: () => void, ms: number) => {
    const id = next++;
    pending.set(id, { due: at + ms, run });
    return { id, unref() {} } as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  const clear = ((timer: { id: number } | undefined) => {
    if (timer !== undefined) pending.delete(timer.id);
  }) as unknown as typeof clearTimeout;
  const advance = (ms: number) => {
    at += ms;
    for (const [id, timer] of [...pending].sort((a, b) => a[1].due - b[1].due)) {
      if (timer.due <= at && pending.has(id)) {
        pending.delete(id);
        timer.run();
      }
    }
  };
  return { set, clear, advance, pending: () => pending.size };
}

function setUp(options: { start?: Pairing | "missing" | "unreadable" | null; power?: ProjectorPower; failSave?: boolean; save?: Promise<void>; openFails?: boolean; events?: EventSink } = {}) {
  const links: Array<{ start: LinkStart; sent: Array<Exclude<LinkCommand, { kind: "stop" }>>; stopped: boolean; refuse: boolean; emit: (event: LinkEvent) => void }> = [];
  const order: string[] = [];
  const saved: Pairing[] = [];
  let forgotten = 0;
  const store: PairingStore = {
    load: async () => (options.start === undefined ? "missing" : options.start),
    save: async (pairing) => {
      if (options.failSave === true) throw new Error("read-only");
      await options.save;
      saved.push(pairing);
      order.push("saved");
    },
    forget: async () => {
      forgotten++;
      order.push("forgotten");
    },
  };
  const logs: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const timers = fakeTimers();
  const projector = createProjector({
    settings: { host: "192.168.1.23", power: options.power ?? "wake-sleep" },
    store,
    open: (start, events) => {
      if (options.openFails === true) throw new Error("no worker");
      const one = { start, sent: [] as Array<Exclude<LinkCommand, { kind: "stop" }>>, stopped: false, refuse: false, emit: events };
      links.push(one);
      const link: Link = {
        send: (command) => {
          if (one.refuse || one.stopped) return false;
          one.sent.push(command);
          return true;
        },
        stop: () => void (one.stopped = true),
      };
      return link;
    },
    log: { info: (fields, message) => logs.push({ fields, message }), warn: (fields, message) => logs.push({ fields, message }) },
    now: () => new Date("2026-11-28T10:00:00.000Z"),
    timers,
    events: options.events,
  });
  return { projector, links, saved, logs, timers, order, forgotten: () => forgotten };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

test("with nothing paired, it opens no link to the projector at all", { timeout: 5_000 }, async () => {
  const { projector, links } = setUp();
  await projector.start();
  assert.equal(links.length, 0);
  assert.deepEqual(projector.status(), { paired: false, pairedAt: null, busy: null, on: null, onSeenAt: null, problem: null });
  assert.deepEqual(await projector.power(true), { refused: notPairedYet });
  assert.equal(links.length, 0);
});

test("a saved pairing opens no link until a key is to be sent: the hub connects for each press, then lets go", { timeout: 5_000 }, async () => {
  const { projector, links } = setUp({ start: kept });
  await projector.start();
  assert.equal(links.length, 0);
  assert.deepEqual(projector.status(), { paired: true, pairedAt: kept.pairedAt, busy: null, on: null, onSeenAt: null, problem: null });
});

test("a saved pairing that's damaged is moved aside, and one that can't be opened says so, each in its own words", { timeout: 5_000 }, async () => {
  const bad = setUp({ start: null });
  await bad.projector.start();
  assert.ok(bad.logs.some((one) => one.message === "projector: the saved pairing couldn't be read, so it was moved aside and the projector needs pairing again"));
  assert.equal(bad.projector.status().paired, false);
  const shut = setUp({ start: "unreadable" });
  await shut.projector.start();
  assert.ok(shut.logs.some((one) => one.message === "projector: the saved pairing couldn't be opened, so the projector can't be reached until that's fixed"));
  assert.ok(!shut.logs.some((one) => one.message.includes("moved aside")));
  assert.match(shut.projector.status().problem ?? "", /couldn't open its saved pairing/);
});

test("pressing on connects with the pairing, waits for the projector to be ready, sends the wake key, hears it come on, and lets go", { timeout: 5_000 }, async () => {
  const { projector, links, logs } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  assert.equal(projector.status().busy, "sending");
  assert.deepEqual(links[0].start, { host: "192.168.1.23", pairing: { key, cert } });
  assert.deepEqual(links[0].sent, [], "nothing goes before it's ready");
  links[0].emit({ kind: "ready" });
  links[0].emit({ kind: "powered", on: false });
  await flush();
  assert.deepEqual(links[0].sent, [{ kind: "key", key: "wake" }]);
  links[0].emit({ kind: "powered", on: false });
  links[0].emit({ kind: "powered", on: true });
  assert.deepEqual(await pressing, { sent: true, was: false, on: true }, "a repeat of how it was isn't taken as the answer");
  assert.equal(links[0].stopped, true);
  assert.deepEqual(projector.status(), { paired: true, pairedAt: kept.pairedAt, busy: null, on: true, onSeenAt: "2026-11-28T10:00:00.000Z", problem: null });
  assert.deepEqual(logs.find((one) => one.message === "projector: power key sent")?.fields, { projector: { key: "wake", want: "on", was: false, now: true } });
});

test("off sends the sleep key, and a projector that doesn't say how it is afterwards is reported as sent, with its state unknown", { timeout: 5_000 }, async () => {
  const { projector, links, timers } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(false);
  links[0].emit({ kind: "ready" });
  await flush();
  timers.advance(powerWaitMs);
  await flush();
  assert.deepEqual(links[0].sent, [{ kind: "key", key: "sleep" }]);
  timers.advance(confirmMs);
  assert.deepEqual(await pressing, { sent: true, was: null, on: null });
  assert.equal(links[0].stopped, true);
});

test("a projector that can't be reached gets nothing, and says why: no answer, a stopped link, or a pairing it's forgotten", { timeout: 5_000 }, async () => {
  for (const [what, event] of [["no answer", null], ["the link stopped", { kind: "problem", why: "couldn't connect" }], ["ended", { kind: "ended", why: "it stopped" }]] as const) {
    const { projector, links, timers, logs } = setUp({ start: kept });
    await projector.start();
    const pressing = projector.power(true);
    if (event === null) timers.advance(readyMs);
    else links[0].emit(event);
    assert.deepEqual(await pressing, { refused: notReached }, what);
    assert.deepEqual(links[0].sent, [], what);
    assert.equal(links[0].stopped, true, what);
    assert.equal(projector.status().problem, notReached, what);
    assert.equal(projector.status().busy, null, what);
    assert.ok(logs.some((one) => one.message === "projector: couldn't reach it, so nothing was sent"), what);
  }
  const { projector, links } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  links[0].emit({ kind: "unpaired" });
  assert.deepEqual(await pressing, { refused: forgottenByProjector });
  assert.equal(projector.status().problem, forgottenByProjector);
  assert.equal(links[0].stopped, true);
});

test("a press that works clears the last problem", { timeout: 5_000 }, async () => {
  const { projector, links, timers } = setUp({ start: kept });
  await projector.start();
  const first = projector.power(true);
  timers.advance(readyMs);
  await first;
  assert.equal(projector.status().problem, notReached);
  const second = projector.power(true);
  links[1].emit({ kind: "ready" });
  links[1].emit({ kind: "powered", on: true });
  await flush();
  timers.advance(confirmMs);
  await second;
  assert.equal(projector.status().problem, null);
});

test("with toggle, the power key goes only when the projector has said it's the other way", { timeout: 5_000 }, async () => {
  const off = setUp({ start: kept, power: "toggle" });
  await off.projector.start();
  const switching = off.projector.power(true);
  off.links[0].emit({ kind: "ready" });
  off.links[0].emit({ kind: "powered", on: false });
  await flush();
  assert.deepEqual(off.links[0].sent, [{ kind: "key", key: "power" }]);
  off.links[0].emit({ kind: "powered", on: true });
  assert.deepEqual(await switching, { sent: true, was: false, on: true });

  const already = setUp({ start: kept, power: "toggle" });
  await already.projector.start();
  const pressing = already.projector.power(true);
  already.links[0].emit({ kind: "ready" });
  already.links[0].emit({ kind: "powered", on: true });
  assert.deepEqual(await pressing, { sent: false, on: true });
  assert.deepEqual(already.links[0].sent, []);
  assert.equal(already.links[0].stopped, true);

  const silent = setUp({ start: kept, power: "toggle" });
  await silent.projector.start();
  const guessing = silent.projector.power(false);
  silent.links[0].emit({ kind: "ready" });
  await flush();
  silent.timers.advance(powerWaitMs);
  assert.deepEqual(await guessing, { refused: unknownPower });
  assert.deepEqual(silent.links[0].sent, []);
  assert.equal(silent.links[0].stopped, true);
});

test("one thing at a time: no press while pairing or while another press is on its way", { timeout: 5_000 }, async () => {
  const { projector, links, timers } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  assert.deepEqual(await projector.power(false), { refused: busySending });
  assert.equal(projector.pair(), "busy");
  timers.advance(readyMs);
  await pressing;
  assert.equal(projector.pair(), "started");
  assert.deepEqual(await projector.power(true), { refused: busyPairing });
  assert.equal(links.length, 2);
});

test("pairing opens a link with no certificate, waits for the code the projector shows, and saves the pairing once the projector has taken it", { timeout: 5_000 }, async () => {
  const { projector, links, saved, logs } = setUp();
  await projector.start();
  assert.equal(projector.pair(), "started");
  assert.equal(projector.pair(), "busy");
  assert.deepEqual(links[0].start, { host: "192.168.1.23", pairing: null });
  assert.equal(projector.status().busy, "asking");
  assert.equal(await projector.code("ABC123"), "not pairing", "no code until the projector shows one");
  links[0].emit({ kind: "secret" });
  assert.equal(projector.status().busy, "code");
  const typed = projector.code("ABC123");
  assert.deepEqual(links[0].sent, [{ kind: "code", code: "abc123" }]);
  links[0].emit({ kind: "paired", key, cert });
  assert.equal(await typed, "paired");
  await flush();
  assert.deepEqual(saved, [{ key, cert, pairedAt: "2026-11-28T10:00:00.000Z" }]);
  assert.equal(links[0].stopped, true, "the pairing's link is let go once it's paired");
  assert.deepEqual(projector.status(), { paired: true, pairedAt: "2026-11-28T10:00:00.000Z", busy: null, on: null, onSeenAt: null, problem: null });
  assert.ok(logs.some((one) => one.message === "projector: paired"));
  assert.ok(!JSON.stringify(logs).includes("abc123") && !JSON.stringify(logs).includes("ABC123") && !JSON.stringify(logs).includes("BEGIN") && !JSON.stringify(logs).includes("192.168"));
});

test("a wrong code is said, and the projector's still waiting for the right one", { timeout: 5_000 }, async () => {
  const { projector, links } = setUp();
  await projector.start();
  projector.pair();
  links[0].emit({ kind: "secret" });
  const typed = projector.code("000000");
  links[0].emit({ kind: "problem", why: "wrong code" });
  assert.equal(await typed, "wrong code");
  assert.equal(projector.status().busy, "code");
  assert.equal(links[0].stopped, false);
});

test("a code the projector doesn't answer within 15 seconds ends the pairing, so Pair works again at once", { timeout: 5_000 }, async () => {
  const { projector, links, timers } = setUp();
  await projector.start();
  projector.pair();
  links[0].emit({ kind: "secret" });
  const typed = projector.code("ABC123");
  timers.advance(codeWaitMs);
  assert.equal(await typed, "timed out");
  assert.equal(links[0].stopped, true);
  assert.equal(projector.status().busy, null);
  assert.equal(projector.pair(), "started");
});

test("pairing gives up after 2 minutes without a code, or when its link fails or the projector turns it down", { timeout: 5_000 }, async () => {
  for (const ending of ["time", "problem", "ended", "unpaired"] as const) {
    const { projector, links, timers } = setUp();
    await projector.start();
    projector.pair();
    links[0].emit({ kind: "secret" });
    const typed = ending === "time" ? null : projector.code("ABC123");
    if (ending === "time") timers.advance(pairingMs);
    else if (ending === "problem") links[0].emit({ kind: "problem", why: "pairing didn't finish" });
    else if (ending === "ended") links[0].emit({ kind: "ended", why: "it stopped" });
    else links[0].emit({ kind: "unpaired" });
    if (typed !== null) assert.equal(await typed, "failed", ending);
    assert.equal(links[0].stopped, true, ending);
    assert.equal(projector.status().busy, null, ending);
    assert.equal(projector.status().paired, false, ending);
  }
});

test("a pairing that can't be saved still works until a restart, and says so", { timeout: 5_000 }, async () => {
  const { projector, links } = setUp({ failSave: true });
  await projector.start();
  projector.pair();
  links[0].emit({ kind: "secret" });
  const typed = projector.code("ABC123");
  links[0].emit({ kind: "paired", key, cert });
  await typed;
  await flush();
  assert.equal(projector.status().problem, notSaved);
  assert.equal(projector.status().paired, true);
});

test("forget also drops what the projector last said, since a new pairing may be a different projector", { timeout: 5_000 }, async () => {
  const { projector, links } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  links[0].emit({ kind: "ready" });
  links[0].emit({ kind: "powered", on: false });
  await flush();
  links[0].emit({ kind: "powered", on: true });
  await pressing;
  assert.equal(projector.status().on, true);
  await projector.forget();
  assert.deepEqual(projector.status(), { paired: false, pairedAt: null, busy: null, on: null, onSeenAt: null, problem: null });
});

test("forget lets go of everything and deletes the pairing, even mid-pairing", { timeout: 5_000 }, async () => {
  const { projector, links, forgotten } = setUp({ start: kept });
  await projector.start();
  projector.pair();
  links[0].emit({ kind: "secret" });
  const typed = projector.code("ABC123");
  await projector.forget();
  assert.equal(await typed, "failed");
  assert.equal(links[0].stopped, true);
  assert.equal(forgotten(), 1);
  assert.deepEqual(projector.status(), { paired: false, pairedAt: null, busy: null, on: null, onSeenAt: null, problem: null });
  assert.equal(projector.pair(), "started", "and it can pair again");
});

test("closing lets go of any link, ends a pairing and takes no more presses", { timeout: 5_000 }, async () => {
  const { projector, links, timers } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  projector.close();
  assert.equal(links[0].stopped, true);
  assert.deepEqual(await pressing, { refused: pressStopped }, "at once, without waiting for the projector");
  assert.equal(timers.pending(), 0);
  assert.equal(projector.status().problem, null);
  assert.deepEqual(await projector.power(true), { refused: busySending });
  assert.equal(projector.pair(), "busy");
  assert.equal(links.length, 1);
});

test("forgetting the pairing mid-press stops that press before any key goes, at whichever wait it's in, and says so", { timeout: 5_000 }, async () => {
  for (const at of ["ready", "told"] as const) {
    const { projector, links, logs } = setUp({ start: kept });
    await projector.start();
    const pressing = projector.power(true);
    if (at === "told") {
      links[0].emit({ kind: "ready" });
      await flush();
    }
    await projector.forget();
    assert.deepEqual(await pressing, { refused: pressStopped }, at);
    assert.deepEqual(links[0].sent, [], at);
    assert.ok(!logs.some((one) => one.message === "projector: power key sent"), at);
    assert.deepEqual(projector.status(), { paired: false, pairedAt: null, busy: null, on: null, onSeenAt: null, problem: null }, at);
  }
});

test("a key that's already gone still counts as sent if the press is stopped while it listens for the switch", { timeout: 5_000 }, async () => {
  const { projector, links, logs } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  links[0].emit({ kind: "ready" });
  links[0].emit({ kind: "powered", on: false });
  await flush();
  assert.deepEqual(links[0].sent, [{ kind: "key", key: "wake" }]);
  projector.close();
  assert.deepEqual(await pressing, { sent: true, was: false, on: null });
  assert.ok(logs.some((one) => one.message === "projector: power key sent"));
});

test("a link that stops after the projector said it was ready, but before the key, sends nothing and says the hub couldn't reach it", { timeout: 5_000 }, async () => {
  for (const [when, event, refused] of [
    ["at once", { kind: "ended", why: "it stopped" }, notReached],
    ["at once", { kind: "problem", why: "couldn't connect" }, notReached],
    ["at once", { kind: "unpaired" }, forgottenByProjector],
    ["while it waits to hear", { kind: "ended", why: "it stopped" }, notReached],
    ["while it waits to hear", { kind: "unpaired" }, forgottenByProjector],
  ] as const) {
    const { projector, links, logs } = setUp({ start: kept });
    await projector.start();
    const pressing = projector.power(true);
    links[0].emit({ kind: "ready" });
    if (when === "at once") links[0].emit(event);
    await flush();
    if (when !== "at once") links[0].emit(event);
    assert.deepEqual(await pressing, { refused }, `${when}: ${event.kind}`);
    assert.deepEqual(links[0].sent, [], `${when}: ${event.kind}`);
    assert.ok(!logs.some((one) => one.message === "projector: power key sent"));
    assert.equal(projector.status().problem, refused);
  }
});

test("a key the link couldn't hand to the worker counts as not sent", { timeout: 5_000 }, async () => {
  const { projector, links, logs } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  links[0].emit({ kind: "ready" });
  links[0].emit({ kind: "powered", on: false });
  links[0].refuse = true;
  assert.deepEqual(await pressing, { refused: notReached });
  assert.ok(logs.some((one) => one.message === "projector: couldn't reach it, so nothing was sent"));
  assert.ok(!logs.some((one) => one.message === "projector: power key sent"));
});

test("a link that stops after the key went is reported as sent but not confirmed, at once, and the log says the link stopped", { timeout: 5_000 }, async () => {
  const { projector, links, logs, timers } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  links[0].emit({ kind: "ready" });
  links[0].emit({ kind: "powered", on: false });
  await flush();
  assert.deepEqual(links[0].sent, [{ kind: "key", key: "wake" }]);
  links[0].emit({ kind: "ended", why: "it stopped" });
  assert.deepEqual(await pressing, { sent: true, was: false, on: null });
  assert.equal(timers.pending(), 0, "without waiting out the 2.5 seconds");
  assert.deepEqual(logs.find((one) => one.message === "projector: power key sent")?.fields, { projector: { key: "wake", want: "on", was: false, now: null, link: "stopped before it said" } });
});

test("a pairing link that can't be opened leaves the hub free to pair again", { timeout: 5_000 }, async () => {
  const { projector } = setUp({ openFails: true });
  await projector.start();
  assert.throws(() => projector.pair());
  assert.equal(projector.status().busy, null);
});

test("a code the link couldn't hand to the worker ends the pairing, so Pair works again", { timeout: 5_000 }, async () => {
  const { projector, links } = setUp();
  await projector.start();
  projector.pair();
  links[0].emit({ kind: "secret" });
  links[0].refuse = true;
  assert.equal(await projector.code("ABC123"), "failed");
  assert.equal(projector.status().busy, null);
  assert.equal(projector.pair(), "started");
});

test("forget waits for a pairing still being saved, so the save can't put back the file forget deleted", { timeout: 5_000 }, async () => {
  let finish: () => void = () => {};
  const slow = new Promise<void>((resolve) => (finish = resolve));
  const { projector, links, order } = setUp({ save: slow });
  await projector.start();
  projector.pair();
  links[0].emit({ kind: "secret" });
  const typed = projector.code("ABC123");
  links[0].emit({ kind: "paired", key, cert });
  assert.equal(await typed, "paired");
  const forgetting = projector.forget();
  await flush();
  assert.deepEqual(order, [], "forget hasn't deleted anything while the save is under way");
  finish();
  await forgetting;
  assert.deepEqual(order, ["saved", "forgotten"]);
  assert.equal(projector.status().paired, false);
});

test("events from a link the hub has let go of change nothing", { timeout: 5_000 }, async () => {
  const { projector, links, timers } = setUp({ start: kept });
  await projector.start();
  const pressing = projector.power(true);
  timers.advance(readyMs);
  await pressing;
  links[0].emit({ kind: "powered", on: true });
  links[0].emit({ kind: "ready" });
  assert.equal(projector.status().on, null);
});

test("a switch the hub's key caused posts an event, once the projector has said how it was before and after, and nothing else does", { timeout: 5_000 }, async () => {
  const posted: unknown[] = [];
  const { projector, links, timers } = setUp({ start: kept, events: { post: (kind, facts, when) => (posted.push([kind, facts, when?.toISOString()]), null) } });
  await projector.start();
  const on = projector.power(true);
  links[0].emit({ kind: "ready" });
  links[0].emit({ kind: "powered", on: false });
  await flush();
  links[0].emit({ kind: "powered", on: true });
  await on;
  const remoteUsed = projector.power(true);
  links[1].emit({ kind: "ready" });
  links[1].emit({ kind: "powered", on: false });
  await flush();
  timers.advance(confirmMs);
  await remoteUsed;
  const unsaid = projector.power(false);
  links[2].emit({ kind: "ready" });
  await flush();
  timers.advance(powerWaitMs);
  await flush();
  links[2].emit({ kind: "powered", on: false });
  await unsaid;
  const off = projector.power(false);
  links[3].emit({ kind: "ready" });
  links[3].emit({ kind: "powered", on: true });
  await flush();
  links[3].emit({ kind: "powered", on: false });
  await off;
  assert.deepEqual(posted, [
    ["projector.switched", { on: true }, "2026-11-28T10:00:00.000Z"],
    ["projector.switched", { on: false }, "2026-11-28T10:00:00.000Z"],
  ], "not when it was found off after the remote switched it, and not when it didn't say how it was before");
});
