import { randomBytes, randomInt } from "node:crypto";

export const pairingMs = 5 * 60_000;
export const mostPairings = 3;
export const mostWrongCodes = 5;
export const pairCookie = "wall_pair";
export const pairIdPattern = /^[0-9a-f]{32}$/;
export const codePattern = /^\d{6}$/;

export type PairingState = "waiting" | "paired" | "gone";
export type Started = { id: string; code: string; expiresAt: number; replaced: boolean } | { refused: string };
export type Confirmed = "paired" | "wrong" | "dropped";

type Pairing = { id: string; code: string; expiresAt: number; paired: boolean; wake: Set<() => void> };

export type Pairings = {
  start(now: number, replacing?: string): Started;
  state(id: string, now: number): { state: PairingState; seconds: number };
  wait(id: string, ms: number, signal: AbortSignal, now: () => number): Promise<{ state: PairingState; seconds: number }>;
  confirm(code: string, now: number): Confirmed;
  collect(id: string, now: number): boolean;
  live(now: number): number;
};

export function createPairings(options: { makeId?: () => string; makeCode?: () => string } = {}): Pairings {
  const makeId = options.makeId ?? (() => randomBytes(16).toString("hex"));
  const makeCode = options.makeCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, "0"));
  const pairings = new Map<string, Pairing>();
  let wrong: number[] = [];

  function sweep(now: number): void {
    for (const [id, pairing] of pairings) {
      if (pairing.expiresAt <= now) {
        pairings.delete(id);
        for (const wake of pairing.wake) wake();
      }
    }
  }

  function drop(id: string): void {
    const pairing = pairings.get(id);
    if (pairing === undefined) return;
    pairings.delete(id);
    for (const wake of pairing.wake) wake();
  }

  function view(id: string, now: number): { state: PairingState; seconds: number } {
    sweep(now);
    const pairing = pairings.get(id);
    if (pairing === undefined) return { state: "gone", seconds: 0 };
    return { state: pairing.paired ? "paired" : "waiting", seconds: Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000)) };
  }

  return {
    start(now, replacing) {
      sweep(now);
      const replaced = replacing !== undefined && pairings.has(replacing) && pairings.get(replacing)?.paired !== true;
      if (replaced) drop(replacing as string);
      if (pairings.size >= mostPairings) return { refused: `${mostPairings} screens are already pairing: try again in a few minutes` };
      let id = makeId();
      while (pairings.has(id) || !pairIdPattern.test(id)) id = randomBytes(16).toString("hex");
      const taken = new Set([...pairings.values()].map((one) => one.code));
      let code = makeCode();
      while (taken.has(code) || !codePattern.test(code)) code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const pairing: Pairing = { id, code, expiresAt: now + pairingMs, paired: false, wake: new Set() };
      pairings.set(id, pairing);
      return { id, code, expiresAt: pairing.expiresAt, replaced };
    },
    state: (id, now) => view(id, now),
    async wait(id, ms, signal, now) {
      const first = view(id, now());
      if (first.state !== "waiting" || ms <= 0 || signal.aborted) return first;
      const pairing = pairings.get(id) as Pairing;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          pairing.wake.delete(done);
          resolve();
        };
        const timer = setTimeout(done, Math.min(ms, Math.max(0, pairing.expiresAt - now())));
        signal.addEventListener("abort", done, { once: true });
        pairing.wake.add(done);
      });
      return view(id, now());
    },
    confirm(code, now) {
      sweep(now);
      const pairing = [...pairings.values()].find((one) => !one.paired && one.code === code);
      if (pairing !== undefined) {
        pairing.paired = true;
        pairing.expiresAt = Math.max(pairing.expiresAt, now + 60_000);
        wrong = [];
        for (const wake of pairing.wake) wake();
        return "paired";
      }
      wrong = [...wrong.filter((at) => now - at < pairingMs), now];
      if (wrong.length < mostWrongCodes) return "wrong";
      wrong = [];
      for (const id of [...pairings.keys()]) if (pairings.get(id)?.paired !== true) drop(id);
      return "dropped";
    },
    collect(id, now) {
      sweep(now);
      const pairing = pairings.get(id);
      if (pairing === undefined || !pairing.paired) return false;
      pairings.delete(id);
      return true;
    },
    live(now) {
      sweep(now);
      return pairings.size;
    },
  };
}
