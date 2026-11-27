import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { claimMs, type Ears, type EarsView, type Refused } from "./ears.js";

export const earsPort = 8090;

const routes: Record<string, string> = { "/state": "GET", "/recording/start": "POST", "/recording/stop": "POST", "/recording/cancel": "POST", "/wait": "GET", "/wake/claim": "POST", "/wake/hold": "POST", "/wake/release": "POST", "/wake/follow": "POST", "/wake/talk": "POST", "/wake/turn": "POST", "/wake/guests": "POST" };

export type WakeApi = { full(): Record<string, unknown>; wait(after: number, run: string | null, signal: AbortSignal, judge?: boolean): Promise<Record<string, unknown>>; hold(by: string): boolean; release(by: string): boolean; follow(withinMs: number): { ok: true; view: EarsView; id: number } | Refused; press(): { ok: true; view: EarsView; id: number } | Refused; turn(id: number, n: number, verdict: "done" | "more"): boolean; guests(on: boolean): boolean };

export const followWithinMs = { least: 1_000, most: 20_000 };

export const notTakenYet = "no Jarvis chat has taken the recording yet, so there's nothing to send it to. Press again in a moment";

export const notTakenAtAll = "no Jarvis chat took the recording, so it was dropped. A chat needs JARVIS_EARS=wake, and one started before the talk button was added needs starting again";

export const takenWithinMs = claimMs + 1_000;

export const stillSending = "ears is still sending the last recording, so press again in a moment";

export const alreadyListening = "ears is already listening, so just speak: it sends what you say when you stop talking";

export const notAsking = "ears isn't waiting on that question any more: you spoke again, the recording ended, or it was already answered";

export const wakeOffError = "ears has the wake word off, so set EARS_WAKE=on in ears/.env and start it again with bash host/ears.sh start";

function whole(value: string | null, least: number): number | null {
  if (value === null || !/^-?\d{1,15}$/.test(value)) return null;
  const number = Number(value);
  return number >= least ? number : null;
}

function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

export function tokenMatches(header: string | undefined, token: string): boolean {
  const given = /^Bearer (.+)$/.exec(header ?? "");
  return given !== null && timingSafeEqual(digest(given[1]), digest(token));
}

function send(response: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...extra });
  response.end(`${JSON.stringify(body)}\n`);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function earsHandler(ears: Ears, token: string, wake?: WakeApi, timing = { takenWithinMs, everyMs: 20 }) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    request.resume();
    if (!tokenMatches(request.headers.authorization, token)) return send(response, 401, { error: "A valid token is needed" }, { "www-authenticate": "Bearer" });
    const at = (request.url ?? "").indexOf("?");
    const path = at === -1 ? (request.url ?? "") : (request.url ?? "").slice(0, at);
    const query = new URLSearchParams(at === -1 ? "" : (request.url ?? "").slice(at + 1));
    const method = routes[path];
    if (method === undefined || (wake === undefined && (path === "/wait" || path.startsWith("/wake/")))) return send(response, 404, { error: "No such route" });
    if (request.method !== method) return send(response, 405, { error: `Use ${method} for ${path}` }, { allow: method });
    if (wake !== undefined && path === "/wait") {
      const after = whole(query.get("after") ?? "-1", -1);
      if (after === null) return send(response, 400, { error: "after must be a whole number from -1" });
      const gone = new AbortController();
      response.once("close", () => gone.abort());
      const view = await wake.wait(after, query.get("run"), gone.signal, query.get("judge") === "on");
      if (!gone.signal.aborted && !response.writableEnded) send(response, 200, view);
      return;
    }
    if (wake !== undefined && path === "/wake/claim") {
      const id = whole(query.get("id"), 1);
      if (id === null) return send(response, 400, { error: "id must be a recording's number, from 1" });
      const claimed = ears.claim(id);
      return claimed.ok ? send(response, 200, wake.full()) : send(response, 409, { error: claimed.error, ...wake.full() });
    }
    if (wake !== undefined && path === "/wake/turn") {
      const id = whole(query.get("id"), 1);
      const n = whole(query.get("n"), 1);
      const verdict = query.get("verdict");
      if (id === null || n === null) return send(response, 400, { error: "id must be a recording's number and n the question's number, both from 1" });
      if (verdict !== "done" && verdict !== "more") return send(response, 400, { error: "verdict must be done or more" });
      return wake.turn(id, n, verdict) ? send(response, 200, wake.full()) : send(response, 409, { error: notAsking, ...wake.full() });
    }
    if (wake !== undefined && path === "/wake/follow") {
      const within = whole(query.get("within"), followWithinMs.least);
      if (within === null || within > followWithinMs.most) return send(response, 400, { error: `within must be a whole number of milliseconds from ${followWithinMs.least} to ${followWithinMs.most}` });
      const started = wake.follow(within);
      return started.ok ? send(response, 200, { ...started.view, lastId: ears.lastId(), id: started.id }) : send(response, 409, { error: started.error, ...wake.full() });
    }
    if (wake !== undefined && path === "/wake/talk") {
      if (ears.view().state === "working" || ears.stopping()) return send(response, 409, { error: stillSending, ...wake.full() });
      const current = ears.current();
      if (current !== null && (current.by === "wake" || current.by === "follow")) return send(response, 409, { error: alreadyListening, ...wake.full() });
      if (current !== null && current.by === "button") {
        if (!current.claimed) return send(response, 409, { error: notTakenYet, ...wake.full() });
        if (!ears.speechHeard()) return send(response, 409, { error: alreadyListening, ...wake.full() });
        const sent = await ears.stop(current.id);
        return sent.ok ? send(response, 200, { sent: true, seconds: sent.seconds, ...sent.view, lastId: ears.lastId() }) : send(response, 409, { error: sent.error, ...wake.full() });
      }
      const started = wake.press();
      if (!started.ok) return send(response, 409, { error: started.error, ...wake.full() });
      const giveUpAt = performance.now() + timing.takenWithinMs;
      while (ears.current()?.id === started.id && ears.current()?.claimed !== true && performance.now() < giveUpAt) await pause(timing.everyMs);
      const now = ears.current();
      return now?.id === started.id && now.claimed ? send(response, 200, { sent: false, ...ears.view(), lastId: ears.lastId(), id: started.id }) : send(response, 409, { error: notTakenAtAll, ...wake.full() });
    }
    if (wake !== undefined && path === "/wake/guests") {
      const on = query.get("on");
      if (on !== "1" && on !== "0") return send(response, 400, { error: "on must be 1 to let every voice through, or 0 to stop" });
      wake.guests(on === "1");
      return send(response, 200, wake.full());
    }
    if (wake !== undefined && (path === "/wake/hold" || path === "/wake/release")) {
      const by = query.get("by") ?? "";
      if (!/^[0-9a-f]{1,32}$/.test(by)) return send(response, 400, { error: "by must name who holds, in up to 32 lower-case hex digits" });
      const done = path === "/wake/hold" ? wake.hold(by) : wake.release(by);
      return done ? send(response, 200, wake.full()) : send(response, 409, { error: wakeOffError, ...wake.full() });
    }
    const known = () => ({ ...ears.view(), lastId: ears.lastId() });
    if (path === "/state") return send(response, 200, known());
    if (path === "/recording/start") {
      const started = ears.start();
      return started.ok ? send(response, 200, { ...started.view, lastId: ears.lastId(), id: started.id }) : send(response, 409, { error: started.error, ...known() });
    }
    const named = query.get("id");
    const id = named === null ? undefined : whole(named, 1);
    if (id === null) return send(response, 400, { error: "id must be a recording's number, from 1" });
    const stopped = await (path === "/recording/stop" ? ears.stop(id) : ears.cancel(id));
    return stopped.ok ? send(response, 200, { seconds: stopped.seconds, ...stopped.view, lastId: ears.lastId() }) : send(response, stopped.gone === true ? 410 : 409, { error: stopped.error, ...known() });
  };
}

export function startEarsServer(ears: Ears, token: string, port = earsPort, host = "0.0.0.0", wake?: WakeApi): Promise<Server> {
  const server = createServer(earsHandler(ears, token, wake));
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
