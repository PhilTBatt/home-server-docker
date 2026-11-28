import type { Link, LinkEvent, OpenLink, PowerKey } from "./link.js";
import type { Pairing, PairingStore } from "./store.js";
import type { EventSink } from "../events/feed.js";

export const projectorPowers = ["wake-sleep", "toggle"] as const;

export type ProjectorPower = (typeof projectorPowers)[number];

export type ProjectorSettings = { host: string; power: ProjectorPower };

export type Busy = "asking" | "code" | "sending";

export type ProjectorStatus = { paired: boolean; pairedAt: string | null; busy: Busy | null; on: boolean | null; onSeenAt: string | null; problem: string | null };

export type CodeResult = "paired" | "wrong code" | "not pairing" | "timed out" | "failed";

export type PowerResult = { sent: true; was: boolean | null; on: boolean | null } | { sent: false; on: boolean } | { refused: string };

export type Projector = {
  start(): Promise<void>;
  status(): ProjectorStatus;
  pair(): "started" | "busy";
  code(code: string): Promise<CodeResult>;
  power(on: boolean): Promise<PowerResult>;
  forget(): Promise<void>;
  close(): void;
};

export type ProjectorLog = { info?: (fields: Record<string, unknown>, message: string) => void; warn?: (fields: Record<string, unknown>, message: string) => void };

export const pairingMs = 2 * 60_000;
export const codeWaitMs = 15_000;
export const readyMs = 6_000;
export const powerWaitMs = 1_500;
export const confirmMs = 2_500;
export const codePattern = /^[0-9A-Fa-f]{6}$/;

export const notPairedYet = "The projector isn't paired with the hub yet: press Pair, then type the code it shows";
export const notReached = "The hub couldn't reach the projector, so nothing was sent";
export const unknownPower = "The projector didn't say whether it's on, so the hub won't press power (PROJECTOR_POWER=toggle)";
export const forgottenByProjector = "The projector doesn't know the hub any more: pair it again";
export const busyPairing = "The hub is pairing with the projector: finish that first";
export const busySending = "The hub is already sending the projector a key: try again in a moment";
export const notSaved = "Paired, but the pairing couldn't be saved, so it's lost when the API restarts";
export const pressStopped = "That press stopped before anything was sent (the pairing was forgotten, or the API is stopping)";

type Session = { link: Link; events: (event: LinkEvent) => void; abort?: () => void };

export function createProjector(options: { settings: ProjectorSettings; store: PairingStore; open: OpenLink; log?: ProjectorLog; now?: () => Date; timers?: { set: typeof setTimeout; clear: typeof clearTimeout }; events?: EventSink }): Projector {
  const { settings, store, open, log } = options;
  const feed = options.events;
  const now = options.now ?? (() => new Date());
  const set = options.timers?.set ?? setTimeout;
  const clear = options.timers?.clear ?? clearTimeout;
  let pairing: Pairing | null = null;
  let busy: Busy | null = null;
  let on: boolean | null = null;
  let onSeenAt: string | null = null;
  let problem: string | null = null;
  let session: Session | null = null;
  let pairingTimer: ReturnType<typeof setTimeout> | null = null;
  let waiting: ((result: CodeResult) => void) | null = null;
  let closed = false;
  let saving: Promise<void> | null = null;

  function seen(value: boolean): void {
    if (on !== value) log?.info?.({ projector: { on: value } }, "projector: it says it's on or off");
    on = value;
    onSeenAt = now().toISOString();
  }

  function settle(result: CodeResult): void {
    const resolve = waiting;
    waiting = null;
    resolve?.(result);
  }

  function endSession(): void {
    const was = session;
    session = null;
    was?.link.stop();
    was?.abort?.();
  }

  function endPairing(why: string): void {
    if (pairingTimer !== null) clear(pairingTimer);
    pairingTimer = null;
    endSession();
    busy = null;
    settle("failed");
    log?.info?.({ projector: { why } }, "projector: pairing ended without pairing");
  }

  function pairingEvent(event: LinkEvent): void {
    if (event.kind === "secret") {
      busy = "code";
      log?.info?.({}, "projector: showing its code");
    } else if (event.kind === "paired") {
      if (pairingTimer !== null) clear(pairingTimer);
      pairingTimer = null;
      pairing = { key: event.key, cert: event.cert, pairedAt: now().toISOString() };
      problem = null;
      busy = null;
      endSession();
      const kept = pairing;
      saving = store.save(kept);
      void saving.then(
        () => log?.info?.({ projector: { pairedAt: kept.pairedAt } }, "projector: paired"),
        () => {
          problem = notSaved;
          log?.warn?.({}, "projector: paired, but the pairing couldn't be saved");
        },
      );
      settle("paired");
    } else if (event.kind === "powered") {
      seen(event.on);
    } else if (event.kind === "problem" && event.why === "wrong code" && waiting !== null) {
      settle("wrong code");
      log?.info?.({}, "projector: a wrong code");
    } else if (event.kind === "problem" || event.kind === "ended" || event.kind === "unpaired") {
      endPairing(event.kind === "unpaired" ? "the projector turned the pairing down" : event.why);
    }
  }

  function wait<T>(ms: number, until: (event: LinkEvent) => T | undefined): { promise: Promise<T | "timed out">; take: (event: LinkEvent) => void; stop: () => void } {
    let finish: ((value: T | "timed out") => void) | null = null;
    const promise = new Promise<T | "timed out">((resolve) => {
      const timer = set(() => {
        finish = null;
        resolve("timed out");
      }, ms);
      timer.unref?.();
      finish = (value) => {
        clear(timer);
        finish = null;
        resolve(value);
      };
    });
    return {
      promise,
      take: (event) => {
        const value = until(event);
        if (value !== undefined) finish?.(value);
      },
      stop: () => finish?.("timed out"),
    };
  }

  async function send(want: boolean, kept: Pairing): Promise<PowerResult> {
    type Stop = "ready" | "unpaired" | "failed";
    const stopped = (event: LinkEvent): "unpaired" | "failed" | undefined => (event.kind === "unpaired" ? "unpaired" : event.kind === "problem" || event.kind === "ended" ? "failed" : undefined);
    const ready = wait<Stop>(readyMs, (event) => (event.kind === "ready" ? "ready" : stopped(event)));
    let was: boolean | null = null;
    let after: boolean | null = null;
    let sentKey = false;
    let lost: "unpaired" | "failed" | null = null;
    let heard: ((event: LinkEvent) => void) | null = null;
    let stopWaiting: () => void = ready.stop;
    const events = (event: LinkEvent) => {
      if (session?.events !== events) return;
      if (event.kind === "powered") {
        seen(event.on);
        if (sentKey) after = event.on;
        else was = event.on;
      }
      lost = lost ?? stopped(event) ?? null;
      ready.take(event);
      heard?.(event);
    };
    const refuse = (why: "unpaired" | "failed" | "timed out"): PowerResult => {
      endSession();
      if (why === "unpaired") {
        problem = forgottenByProjector;
        log?.warn?.({}, "projector: it doesn't know the hub any more");
        return { refused: forgottenByProjector };
      }
      problem = notReached;
      log?.warn?.({ projector: { why: why === "timed out" ? "no answer" : "the link stopped" } }, "projector: couldn't reach it, so nothing was sent");
      return { refused: notReached };
    };
    session = { link: open({ host: settings.host, pairing: { key: kept.key, cert: kept.cert } }, events), events, abort: () => stopWaiting() };
    const gone = () => session?.events !== events;
    const reached = await ready.promise;
    if (gone()) return { refused: pressStopped };
    if (reached !== "ready") return refuse(reached);
    if (was === null && lost === null) {
      const told = wait<boolean | "lost">(powerWaitMs, (event) => (event.kind === "powered" ? event.on : stopped(event) === undefined ? undefined : "lost"));
      heard = told.take;
      stopWaiting = told.stop;
      const said = await told.promise;
      if (typeof said === "boolean") was = said;
      if (gone()) return { refused: pressStopped };
    }
    if (lost !== null) return refuse(lost);
    let key: PowerKey;
    if (settings.power === "wake-sleep") key = want ? "wake" : "sleep";
    else if (was === null) {
      endSession();
      return { refused: unknownPower };
    } else if (was === want) {
      endSession();
      problem = null;
      return { sent: false, on: was };
    } else key = "power";
    const confirmed = wait<boolean | "lost">(confirmMs, (event) => (event.kind === "powered" && event.on !== was ? event.on : stopped(event) === undefined ? undefined : "lost"));
    heard = confirmed.take;
    stopWaiting = confirmed.stop;
    sentKey = true;
    if (session?.link.send({ kind: "key", key }) !== true) return refuse("failed");
    const answer = await confirmed.promise;
    if (typeof answer === "boolean") after = answer;
    endSession();
    problem = null;
    log?.info?.({ projector: { key, want: want ? "on" : "off", was, now: after, ...(lost === null ? {} : { link: "stopped before it said" }) } }, "projector: power key sent");
    if (was !== null && after !== null && after !== was) feed?.post("projector.switched", { on: after }, now());
    return { sent: true, was, on: after };
  }

  return {
    async start() {
      const kept = await store.load();
      if (kept === null) log?.warn?.({}, "projector: the saved pairing couldn't be read, so it was moved aside and the projector needs pairing again");
      if (kept === "unreadable") log?.warn?.({}, "projector: the saved pairing couldn't be opened, so the projector can't be reached until that's fixed");
      pairing = kept === "missing" || kept === null || kept === "unreadable" ? null : kept;
      if (kept === "unreadable") problem = "The hub couldn't open its saved pairing (check projector/remote.json's owner and permissions)";
      log?.info?.({ projector: { paired: pairing !== null, power: settings.power } }, "projector at start");
    },
    status() {
      return { paired: pairing !== null, pairedAt: pairing?.pairedAt ?? null, busy, on, onSeenAt, problem };
    },
    pair() {
      if (busy !== null || closed) return "busy";
      const events = (event: LinkEvent) => {
        if (session?.events === events) pairingEvent(event);
      };
      session = { link: open({ host: settings.host, pairing: null }, events), events };
      busy = "asking";
      pairingTimer = set(() => {
        pairingTimer = null;
        endPairing("the code wasn't typed in time");
      }, pairingMs);
      pairingTimer.unref?.();
      log?.info?.({}, "projector: pairing started");
      return "started";
    },
    code(code) {
      if (busy !== "code" || session === null || waiting !== null) return Promise.resolve("not pairing");
      const mine = session;
      return new Promise<CodeResult>((resolve) => {
        const timer = set(() => {
          settle("timed out");
          endPairing("the projector didn't answer the code");
        }, codeWaitMs);
        timer.unref?.();
        waiting = (result) => {
          clear(timer);
          resolve(result);
        };
        if (!mine.link.send({ kind: "code", code: code.toLowerCase() })) endPairing("the link stopped before the code went");
      });
    },
    async power(want) {
      const kept = pairing;
      if (kept === null) return { refused: notPairedYet };
      if (busy === "asking" || busy === "code") return { refused: busyPairing };
      if (busy === "sending" || closed) return { refused: busySending };
      busy = "sending";
      try {
        return await send(want, kept);
      } finally {
        busy = null;
      }
    },
    async forget() {
      if (pairingTimer !== null) clear(pairingTimer);
      pairingTimer = null;
      settle("failed");
      endSession();
      pairing = null;
      on = null;
      onSeenAt = null;
      problem = null;
      busy = null;
      await saving?.catch(() => {});
      saving = null;
      await store.forget();
      log?.info?.({}, "projector: pairing forgotten");
    },
    close() {
      closed = true;
      if (pairingTimer !== null) clear(pairingTimer);
      pairingTimer = null;
      settle("failed");
      endSession();
    },
  };
}
