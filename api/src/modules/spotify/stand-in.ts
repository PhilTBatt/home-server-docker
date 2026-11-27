import { spotifyScopes } from "./auth.js";

export type SeenRequest = { method: string; url: URL; headers: Record<string, string>; body: string; redirect: string | undefined; signal: boolean };

export type StandInReply = { status: number; body?: unknown; text?: string; headers?: Record<string, string> };

export type StandInHandler = (request: SeenRequest) => StandInReply | Promise<StandInReply>;

export const standInClientId = "0123456789abcdef0123456789abcdef";
export const standInRedirect = "https://hub.home/spotify.html";

export function grantReply(access: string, refresh: string | null, expiresIn = 3600): StandInReply {
  return { status: 200, body: { access_token: access, token_type: "Bearer", expires_in: expiresIn, scope: spotifyScopes.join(" "), ...(refresh === null ? {} : { refresh_token: refresh }) } };
}

export function standInSpotify(handle: StandInHandler) {
  const seen: SeenRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const request: SeenRequest = { method: init?.method ?? "GET", url, headers, body: typeof init?.body === "string" ? init.body : "", redirect: init?.redirect, signal: init?.signal instanceof AbortSignal };
    seen.push(request);
    const reply = await handle(request);
    const text = reply.text ?? (reply.body === undefined ? "" : JSON.stringify(reply.body));
    return new Response(reply.status === 204 ? null : text, { status: reply.status, headers: reply.headers });
  };
  return { fetcher, seen };
}

export function formOf(request: SeenRequest): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(request.body));
}
