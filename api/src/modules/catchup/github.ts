import { cleanText } from "../deals/source.js";
import { formatLondonTime } from "../notify/daily.js";

export type Commit = { sha: string; at: string; message: string };

export type Commits = { commits: Commit[]; more: boolean };

export type GithubAsk = { token: string; fetcher?: typeof fetch; ms?: number; now?: number };

export class GithubRefused extends Error {
  waitUntil: number | null;

  constructor(message: string, waitUntil: number | null) {
    super(message);
    this.name = "GithubRefused";
    this.waitUntil = waitUntil;
  }
}

export const githubHost = "api.github.com";
export const githubVersion = "2026-03-10";
export const mostRepos = 10;
export const commitsPerRepo = 30;
export const githubMs = 4_000;
export const replyMostBytes = 1024 * 1024;
export const messageMost = 120;
export const waitAtLeastMs = 60 * 1000;
export const waitAtMostMs = 60 * 60 * 1000;

const ownerPattern = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;
const namePattern = /^[A-Za-z0-9._-]{1,100}$/;
const tokenPattern = /^github_pat_[A-Za-z0-9_]{20,250}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const formatCharacters = /[\p{Cf}\u034F\u2800]/gu;

export function readRepos(text: string): string[] | null {
  const repos = text.split(",");
  if (repos.length > mostRepos) return null;
  const seen = new Set<string>();
  for (const repo of repos) {
    const parts = repo.split("/");
    if (parts.length !== 2) return null;
    const [owner, name] = parts;
    if (owner.length > 39 || !ownerPattern.test(owner)) return null;
    if (!namePattern.test(name) || name === "." || name === "..") return null;
    const key = repo.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return repos;
}

export function validToken(text: string): boolean {
  return tokenPattern.test(text);
}

export function commitsUrl(repo: string, since: Date): string {
  const [owner, name] = repo.split("/");
  const from = since.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `https://${githubHost}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?since=${from}&per_page=${commitsPerRepo}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timeOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function firstLine(value: unknown): string {
  if (typeof value !== "string") return "(no message)";
  const line = cleanText(value.slice(0, messageMost * 8).split(/\r\n|\r|\n/)[0].replace(formatCharacters, ""), messageMost);
  return line === "" ? "(no message)" : line;
}

export function readCommits(body: unknown): Commit[] {
  if (!Array.isArray(body)) throw new Error("GitHub's reply wasn't a list of commits");
  return body.slice(0, commitsPerRepo).flatMap((entry): Commit[] => {
    if (!isObject(entry) || typeof entry.sha !== "string" || !shaPattern.test(entry.sha) || !isObject(entry.commit)) return [];
    const inner = entry.commit;
    const at = timeOf(isObject(inner.committer) ? inner.committer.date : undefined) ?? timeOf(isObject(inner.author) ? inner.author.date : undefined);
    if (at === null) return [];
    return [{ sha: entry.sha.slice(0, 7), at, message: firstLine(inner.message) }];
  });
}

function wentWrong(error: unknown, ms: number): Error {
  const name = error instanceof Error ? error.name : "";
  return new Error(name === "TimeoutError" || name === "AbortError" ? `GitHub didn't answer within ${ms / 1000} seconds` : "couldn't reach GitHub");
}

async function readCapped(response: Response, ms: number): Promise<string> {
  if (Number(response.headers.get("content-length") ?? "0") > replyMostBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("GitHub's reply was too big");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read().catch((error: unknown) => {
      throw wentWrong(error, ms);
    });
    if (done) break;
    size += value.byteLength;
    if (size > replyMostBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("GitHub's reply was too big");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function refusal(response: Response, withToken: boolean): string {
  const status = response.status;
  if ((status === 403 || status === 429) && response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset") ?? "");
    const until = Number.isInteger(reset) && reset > 0 ? ` until ${formatLondonTime(new Date(reset * 1000).toISOString())}` : "";
    return `GitHub's hourly limit is used up${until}${withToken ? "" : " (it's 60 calls an hour without a token)"}`;
  }
  if (status === 401) return "GitHub refused the token (401), so check CATCH_UP_GITHUB_TOKEN hasn't expired";
  if (status === 403 || status === 429) return `GitHub refused the request (${status}), perhaps for asking too often`;
  if (status === 404) return withToken ? "GitHub says there's no such repo, or the token can't see it (404)" : "GitHub says there's no such repo, or it's private and there's no token (404)";
  if (status === 409) return "GitHub says the repo is empty (409)";
  return `GitHub replied ${status}`;
}

export function waitUntil(response: Response, now: number): number | null {
  if (response.status !== 403 && response.status !== 429) return null;
  const after = Number(response.headers.get("retry-after") ?? "");
  const reset = Number(response.headers.get("x-ratelimit-reset") ?? "");
  const usedUp = response.headers.get("x-ratelimit-remaining") === "0";
  const told = Number.isInteger(after) && after > 0;
  if (!told && !usedUp && response.status !== 429) return null;
  const until = Math.max(told ? now + after * 1000 : 0, usedUp && Number.isInteger(reset) && reset > 0 ? reset * 1000 : 0, now + waitAtLeastMs);
  return Math.min(until, now + waitAtMostMs);
}

export async function fetchCommits(repo: string, since: Date, ask: GithubAsk): Promise<Commits> {
  const fetcher = ask.fetcher ?? fetch;
  const ms = ask.ms ?? githubMs;
  const url = commitsUrl(repo, since);
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": githubVersion, "user-agent": "home-hub" };
  if (ask.token !== "") headers.authorization = `Bearer ${ask.token}`;
  let response: Response;
  try {
    response = await fetcher(url, { headers, redirect: "error", signal: AbortSignal.timeout(ms) });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    if (cause.includes("redirect")) throw new Error("GitHub answered with a redirect, which isn't followed: the repo may have been renamed or moved, so check its name in CATCH_UP_REPOS");
    throw wentWrong(error, ms);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new GithubRefused(refusal(response, ask.token !== ""), waitUntil(response, ask.now ?? Date.now()));
  }
  const text = await readCapped(response, ms);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("GitHub's reply wasn't JSON");
  }
  return { commits: readCommits(body), more: /rel="next"/.test(response.headers.get("link") ?? "") };
}
