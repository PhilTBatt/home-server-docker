import { addressOf, privateAddress, privatePlace, twinsOf } from "./web-guard-rules.js";

export const guardWithinMs = 3_000;
export const guardedTool = "WebFetch";
export const notChecked = "That request couldn't be checked, so it isn't done.";
export const notResolved = "Where that address leads couldn't be checked, so it isn't opened.";
export const guardAllows = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "The address guard checked it." } });

export type GuardDeps = { resolve: (host: string) => Promise<string[]>; withinMs?: number };

function urlIn(raw: string): string | null {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof input !== "object" || input === null) return null;
  const { tool_name: tool, tool_input: given } = input as { tool_name?: unknown; tool_input?: unknown };
  if (tool !== guardedTool || typeof given !== "object" || given === null) return null;
  const url = (given as { url?: unknown }).url;
  return typeof url === "string" ? url : null;
}

export async function guardVerdict(raw: string, deps: GuardDeps): Promise<string | null> {
  const url = urlIn(raw);
  if (url === null) return notChecked;
  const address = addressOf(url);
  if ("refused" in address) return address.refused;
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deps.withinMs ?? guardWithinMs);
  });
  const names = [address.host, ...twinsOf(address.host)];
  const found = await Promise.race([Promise.all(names.map((name) => deps.resolve(name).catch(() => null))), late]).finally(() => clearTimeout(timer));
  if (found === null) return notResolved;
  const [own, ...twins] = found;
  if (own === null || own.length === 0) return notResolved;
  return [own, ...twins].some((addresses) => addresses !== null && addresses.some(privateAddress)) ? privatePlace : null;
}

export type GuardAnswer = { code: 0; out: string } | { code: 2; err: string };

export async function guardAnswer(raw: string, deps: GuardDeps): Promise<GuardAnswer> {
  let refused: string | null;
  try {
    refused = await guardVerdict(raw, deps);
  } catch {
    refused = notChecked;
  }
  return refused === null ? { code: 0, out: guardAllows } : { code: 2, err: refused };
}
