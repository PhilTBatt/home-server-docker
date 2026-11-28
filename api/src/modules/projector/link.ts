import { Worker } from "node:worker_threads";

export type PowerKey = "wake" | "sleep" | "power";

export type LinkStart = { host: string; pairing: { key: string; cert: string } | null };

export type LinkCommand = { kind: "code"; code: string } | { kind: "key"; key: PowerKey } | { kind: "stop" };

export type LinkEvent =
  | { kind: "secret" }
  | { kind: "paired"; key: string; cert: string }
  | { kind: "ready" }
  | { kind: "powered"; on: boolean }
  | { kind: "unpaired" }
  | { kind: "problem"; why: string }
  | { kind: "ended"; why: string };

export type Link = { send(command: Exclude<LinkCommand, { kind: "stop" }>): boolean; stop(): void };

export type OpenLink = (start: LinkStart, events: (event: LinkEvent) => void) => Link;

export const linkMemoryMb = 64;
export const linkStopMs = 2_000;
export const linkWorkerOptions = { resourceLimits: { maxOldGenerationSizeMb: linkMemoryMb } };

const kinds = new Set(["secret", "paired", "ready", "powered", "unpaired", "problem"]);

export function pairingDone(start: LinkStart, started: boolean, codeTaken: boolean): boolean {
  return start.pairing === null && started && codeTaken;
}

export function startProblem(start: LinkStart, started: boolean, codeTaken: boolean): string | null {
  if (started) return null;
  return start.pairing === null && !codeTaken ? "pairing didn't finish" : "couldn't connect";
}

export function readLinkEvent(message: unknown): LinkEvent | null {
  if (typeof message !== "object" || message === null) return null;
  const event = message as Record<string, unknown>;
  if (typeof event.kind !== "string" || !kinds.has(event.kind)) return null;
  if (event.kind === "paired") return typeof event.key === "string" && typeof event.cert === "string" ? { kind: "paired", key: event.key, cert: event.cert } : null;
  if (event.kind === "powered") return typeof event.on === "boolean" ? { kind: "powered", on: event.on } : null;
  if (event.kind === "problem") return typeof event.why === "string" ? { kind: "problem", why: event.why.slice(0, 200) } : null;
  return { kind: event.kind as "secret" | "ready" | "unpaired" };
}

export type LinkPort = { post(message: LinkCommand): void; terminate(): void };

export function linkOver(port: LinkPort, events: (event: LinkEvent) => void, later: (run: () => void, ms: number) => void = (run, ms) => void setTimeout(run, ms).unref()): { link: Link; heard(message: unknown): void; ended(why: string): void } {
  let ended = false;
  const end = (why: string) => {
    if (ended) return;
    ended = true;
    events({ kind: "ended", why });
  };
  return {
    heard: (message) => {
      const event = readLinkEvent(message);
      if (event !== null && !ended) events(event);
    },
    ended: end,
    link: {
      send: (command) => {
        if (ended) return false;
        port.post(command);
        return true;
      },
      stop: () => {
        if (ended) return;
        ended = true;
        port.post({ kind: "stop" });
        later(() => port.terminate(), linkStopMs);
      },
    },
  };
}

export const workerLink: OpenLink = (start, events) => {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { workerData: start, ...linkWorkerOptions });
  const over = linkOver({ post: (message) => worker.postMessage(message), terminate: () => void worker.terminate() }, events);
  worker.on("message", over.heard);
  worker.on("error", () => over.ended("its code failed"));
  worker.on("exit", (code) => over.ended(code === 0 ? "it stopped" : `it stopped with code ${code}`));
  return over.link;
};
