import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const accountsHost = "accounts.spotify.com";
export const authorizeUrl = `https://${accountsHost}/authorize`;
export const tokenUrl = `https://${accountsHost}/api/token`;
export const spotifyDir = "/spotify";
export const tokensFile = "tokens.json";
export const signInMs = 10 * 60 * 1000;
export const refreshEarlyMs = 60 * 1000;
export const accountsMs = 8_000;
export const replyMostBytes = 1024 * 1024;

export const spotifyScopes = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-library-modify",
  "user-follow-modify",
  "user-read-private",
] as const;

export const notSignedIn = "Spotify isn't signed in: open the Spotify page on the hub (spotify.html) and sign in";

export type SpotifySettings = { clientId: string; redirectUri: string };

export type SavedSignIn = { refreshToken: string; scopes: string[]; signedInAt: string; refreshedAt: string | null };

export type SpotifyLog = (line: string) => void;

export type Fetcher = typeof fetch;

export class SpotifyProblem extends Error {
  status: number;
  waitSeconds: number | null;

  constructor(status: number, message: string, waitSeconds: number | null = null) {
    super(message);
    this.name = "SpotifyProblem";
    this.status = status;
    this.waitSeconds = waitSeconds;
  }
}

const clientIdPattern = /^[0-9a-f]{32}$/;
const tokenPattern = /^[\x21-\x7E]{10,4096}$/;
const loopbackHosts = ["127.0.0.1", "[::1]"];

export function validClientId(text: string): boolean {
  return clientIdPattern.test(text);
}

export function readRedirectUri(text: string): string | null {
  if (text.length > 300 || /[\s#]/.test(text) || text.includes("?")) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "" || url.hash !== "" || url.search !== "") return null;
  if (url.hostname === "localhost") return null;
  if (url.protocol === "https:") return url.href === text ? text : null;
  if (url.protocol === "http:" && loopbackHosts.includes(url.hostname) && url.port !== "") return url.href === text ? text : null;
  return null;
}

export function newVerifier(random: (size: number) => Buffer = randomBytes): string {
  return random(64).toString("base64url");
}

export function newState(random: (size: number) => Buffer = randomBytes): string {
  return random(24).toString("base64url");
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function signInUrl(settings: SpotifySettings, state: string, challenge: string): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: settings.clientId,
    scope: spotifyScopes.join(" "),
    redirect_uri: settings.redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  return `${authorizeUrl}?${query.toString()}`;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSaved(text: string): SavedSignIn | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const { refreshToken, scopes, signedInAt, refreshedAt } = parsed;
  if (typeof refreshToken !== "string" || !tokenPattern.test(refreshToken)) return null;
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string" && /^[a-z-]{1,60}$/.test(scope))) return null;
  if (typeof signedInAt !== "string" || Number.isNaN(Date.parse(signedInAt))) return null;
  if (refreshedAt !== null && (typeof refreshedAt !== "string" || Number.isNaN(Date.parse(refreshedAt)))) return null;
  return { refreshToken, scopes, signedInAt, refreshedAt };
}

type Granted = { accessToken: string; expiresInSeconds: number; refreshToken: string | null; scopes: string[] | null };

export function readGrant(body: unknown): Granted | null {
  if (!isObject(body)) return null;
  const { access_token: access, expires_in: expires, refresh_token: refresh, scope, token_type: type } = body;
  if (typeof access !== "string" || !tokenPattern.test(access)) return null;
  if (typeof type === "string" && type.toLowerCase() !== "bearer") return null;
  if (typeof expires !== "number" || !Number.isInteger(expires) || expires < 60 || expires > 86_400) return null;
  if (refresh !== undefined && (typeof refresh !== "string" || !tokenPattern.test(refresh))) return null;
  const scopes = typeof scope === "string" ? scope.split(" ").filter((part) => part !== "") : null;
  return { accessToken: access, expiresInSeconds: expires, refreshToken: typeof refresh === "string" ? refresh : null, scopes };
}

function wentWrong(error: unknown, ms: number, host: string): SpotifyProblem {
  const name = error instanceof Error ? error.name : "";
  return name === "TimeoutError" || name === "AbortError" ? new SpotifyProblem(504, `Spotify (${host}) didn't answer within ${ms / 1000} seconds`) : new SpotifyProblem(502, `Couldn't reach Spotify (${host})`);
}

export async function readCapped(response: Response, ms: number, host: string): Promise<string> {
  if (Number(response.headers.get("content-length") ?? "0") > replyMostBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new SpotifyProblem(502, "Spotify's reply was too big");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read().catch((error: unknown) => {
      throw wentWrong(error, ms, host);
    });
    if (done) break;
    size += value.byteLength;
    if (size > replyMostBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SpotifyProblem(502, "Spotify's reply was too big");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type Answer = { status: number; body: unknown; waitSeconds: number | null };

export async function askSpotify(fetcher: Fetcher, url: string, init: RequestInit, ms: number): Promise<Answer> {
  const host = new URL(url).hostname;
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(ms) }).catch((error: unknown) => {
    throw wentWrong(error, ms, host);
  });
  const text = await readCapped(response, ms, host);
  let body: unknown = null;
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  const after = response.headers.get("retry-after");
  const waitSeconds = after !== null && /^\d{1,6}$/.test(after) ? Number(after) : null;
  return { status: response.status, body, waitSeconds };
}

function tokenError(body: unknown): string | null {
  return isObject(body) && typeof body.error === "string" && /^[a-z_]{1,40}$/.test(body.error) ? body.error : null;
}

export type SignInStatus = { signedIn: boolean; scopes: string[] | null; signedInAt: string | null; refreshedAt: string | null; signingIn: boolean; problem: string | null };

export type SpotifyAuth = {
  startSignIn(): { url: string; expiresAt: string };
  finishSignIn(answer: { code?: string; state: string; error?: string }): Promise<{ signedIn: true; scopes: string[] }>;
  signOut(): Promise<void>;
  status(): Promise<SignInStatus>;
  accessToken(): Promise<string>;
  forgetAccess(): void;
};

export type AuthOptions = {
  settings: SpotifySettings;
  dir?: string;
  fetcher?: Fetcher;
  now?: () => number;
  random?: (size: number) => Buffer;
  log?: SpotifyLog;
  ms?: number;
};

export function createSpotifyAuth(options: AuthOptions): SpotifyAuth {
  const dir = options.dir ?? spotifyDir;
  const file = join(dir, tokensFile);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? randomBytes;
  const log = options.log ?? (() => undefined);
  const ms = options.ms ?? accountsMs;
  let pending: { state: string; verifier: string; expiresAt: number } | null = null;
  let saved: SavedSignIn | null = null;
  let loaded = false;
  let problem: string | null = null;
  let access: { token: string; expiresAt: number } | null = null;
  let refreshing: Promise<string> | null = null;

  async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      problem = `The saved sign-in, spotify/${tokensFile}, couldn't be read, so sign in again`;
      log(`spotify: the saved sign-in couldn't be read (${(error as NodeJS.ErrnoException).code ?? "unknown error"})`);
      return;
    }
    saved = readSaved(text);
    if (saved === null) {
      problem = `The saved sign-in, spotify/${tokensFile}, isn't one the hub wrote, so sign in again`;
      log(`spotify: the saved sign-in wasn't valid (${Buffer.byteLength(text)} bytes)`);
      return;
    }
    log(`spotify: the saved sign-in was read, with ${saved.scopes.length} scopes`);
  }

  async function save(next: SavedSignIn): Promise<void> {
    const temporary = `${file}.saving`;
    try {
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      log(`spotify: the sign-in couldn't be saved (${(error as NodeJS.ErrnoException).code ?? "unknown error"})`);
      throw new SpotifyProblem(500, `The sign-in couldn't be saved in spotify/${tokensFile}: check the spotify folder is there and the API may write to it`);
    }
  }

  async function tokenRequest(form: Record<string, string>): Promise<Answer> {
    return askSpotify(fetcher, tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }, ms);
  }

  async function refresh(): Promise<string> {
    const current = saved;
    if (current === null) throw new SpotifyProblem(409, notSignedIn);
    const started = now();
    const answer = await tokenRequest({ grant_type: "refresh_token", refresh_token: current.refreshToken, client_id: options.settings.clientId });
    const took = Math.round(now() - started);
    if (answer.status !== 200) {
      const error = tokenError(answer.body);
      log(`spotify: refreshing the access token was refused with ${answer.status}${error === null ? "" : ` (${error})`} after ${took} ms`);
      if (answer.status === 400 && error === "invalid_grant") {
        saved = null;
        problem = "Spotify no longer accepts the saved sign-in, so it was removed: sign in again";
        await rm(file, { force: true }).catch(() => undefined);
        throw new SpotifyProblem(409, problem);
      }
      if (answer.status === 429) throw new SpotifyProblem(429, "Spotify asked the hub to wait before signing in again", answer.waitSeconds);
      throw new SpotifyProblem(502, `Spotify refused to renew the sign-in (${answer.status})`);
    }
    const grant = readGrant(answer.body);
    if (grant === null) {
      log(`spotify: refreshing gave a reply that wasn't a token, after ${took} ms`);
      throw new SpotifyProblem(502, "Spotify's reply to renewing the sign-in wasn't a token");
    }
    access = { token: grant.accessToken, expiresAt: now() + grant.expiresInSeconds * 1000 };
    const next: SavedSignIn = { refreshToken: grant.refreshToken ?? current.refreshToken, scopes: grant.scopes ?? current.scopes, signedInAt: current.signedInAt, refreshedAt: new Date(now()).toISOString() };
    saved = next;
    log(`spotify: the access token was renewed in ${took} ms, for ${grant.expiresInSeconds} seconds, with ${grant.refreshToken === null ? "the same" : "a new"} refresh token`);
    await save(next);
    return grant.accessToken;
  }

  return {
    startSignIn() {
      const verifier = newVerifier(random);
      const state = newState(random);
      const expiresAt = now() + signInMs;
      if (pending !== null) log("spotify: a sign-in that was waiting was replaced by a new one");
      pending = { state, verifier, expiresAt };
      log(`spotify: a sign-in was started, waiting ${signInMs / 60_000} minutes for Spotify's answer`);
      return { url: signInUrl(options.settings, state, challengeFor(verifier)), expiresAt: new Date(expiresAt).toISOString() };
    },

    async finishSignIn(answer) {
      const waiting = pending;
      if (waiting === null || !sameText(answer.state, waiting.state)) {
        log(`spotify: an answer to a sign-in was refused: ${waiting === null ? "no sign-in was waiting" : "its state didn't match"}`);
        throw new SpotifyProblem(400, "That answer isn't for the sign-in the hub is waiting for: start again from the Spotify page");
      }
      if (now() > waiting.expiresAt) {
        pending = null;
        log("spotify: an answer to a sign-in came after it expired");
        throw new SpotifyProblem(400, `That sign-in was started over ${signInMs / 60_000} minutes ago: start again`);
      }
      pending = null;
      if (answer.error !== undefined) {
        const said = /^[a-z_]{1,40}$/.test(answer.error) ? answer.error : "an error";
        log(`spotify: Spotify answered the sign-in with ${said}`);
        throw new SpotifyProblem(400, `Spotify didn't sign in (${said}), so nothing was saved`);
      }
      if (answer.code === undefined) throw new SpotifyProblem(400, "Spotify's answer had no code in it");
      const started = now();
      const reply = await tokenRequest({ grant_type: "authorization_code", code: answer.code, redirect_uri: options.settings.redirectUri, client_id: options.settings.clientId, code_verifier: waiting.verifier });
      const took = Math.round(now() - started);
      if (reply.status !== 200) {
        const error = tokenError(reply.body);
        log(`spotify: swapping the sign-in code was refused with ${reply.status}${error === null ? "" : ` (${error})`} after ${took} ms`);
        throw new SpotifyProblem(502, `Spotify refused the sign-in code (${reply.status}${error === null ? "" : `, ${error}`}): check SPOTIFY_REDIRECT_URI is exactly the address in the app's settings, then start again`);
      }
      const grant = readGrant(reply.body);
      if (grant === null || grant.refreshToken === null) {
        log(`spotify: swapping the sign-in code gave a reply without the tokens, after ${took} ms`);
        throw new SpotifyProblem(502, "Spotify's reply to the sign-in didn't have the tokens in it");
      }
      const at = new Date(now()).toISOString();
      const next: SavedSignIn = { refreshToken: grant.refreshToken, scopes: grant.scopes ?? [...spotifyScopes], signedInAt: at, refreshedAt: null };
      await save(next);
      saved = next;
      loaded = true;
      problem = null;
      access = { token: grant.accessToken, expiresAt: now() + grant.expiresInSeconds * 1000 };
      const missing = spotifyScopes.filter((scope) => !next.scopes.includes(scope));
      log(`spotify: signed in after ${took} ms, with ${next.scopes.length} scopes${missing.length === 0 ? "" : `, ${missing.length} of those asked for missing`}`);
      return { signedIn: true, scopes: next.scopes };
    },

    async signOut() {
      await load();
      const had = saved !== null;
      saved = null;
      access = null;
      pending = null;
      problem = null;
      await rm(file, { force: true }).catch(() => {
        throw new SpotifyProblem(500, `spotify/${tokensFile} couldn't be removed`);
      });
      log(`spotify: signed out${had ? "" : ", though it wasn't signed in"}`);
    },

    async status() {
      await load();
      const waiting = pending !== null && now() <= pending.expiresAt;
      return { signedIn: saved !== null, scopes: saved?.scopes ?? null, signedInAt: saved?.signedInAt ?? null, refreshedAt: saved?.refreshedAt ?? null, signingIn: waiting, problem };
    },

    async accessToken() {
      await load();
      if (saved === null) throw new SpotifyProblem(409, problem ?? notSignedIn);
      if (access !== null && access.expiresAt - refreshEarlyMs > now()) return access.token;
      if (refreshing === null) {
        refreshing = refresh().finally(() => {
          refreshing = null;
        });
      }
      return refreshing;
    },

    forgetAccess() {
      access = null;
    },
  };
}
