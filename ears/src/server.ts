import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Ears } from "./ears.js";

export const earsPort = 8090;

const routes: Record<string, string> = { "/state": "GET", "/recording/start": "POST", "/recording/stop": "POST", "/recording/cancel": "POST" };

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

export function earsHandler(ears: Ears, token: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    request.resume();
    if (!tokenMatches(request.headers.authorization, token)) return send(response, 401, { error: "A valid token is needed" }, { "www-authenticate": "Bearer" });
    const path = (request.url ?? "").split("?")[0];
    const method = routes[path];
    if (method === undefined) return send(response, 404, { error: "No such route" });
    if (request.method !== method) return send(response, 405, { error: `Use ${method} for ${path}` }, { allow: method });
    if (path === "/state") return send(response, 200, ears.view());
    if (path === "/recording/start") {
      const started = ears.start();
      return started.ok ? send(response, 200, started.view) : send(response, 409, { error: started.error, ...ears.view() });
    }
    const stopped = await (path === "/recording/stop" ? ears.stop() : ears.cancel());
    return stopped.ok ? send(response, 200, { seconds: stopped.seconds, ...stopped.view }) : send(response, 409, { error: stopped.error, ...ears.view() });
  };
}

export function startEarsServer(ears: Ears, token: string, port = earsPort, host = "0.0.0.0"): Promise<Server> {
  const server = createServer(earsHandler(ears, token));
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
