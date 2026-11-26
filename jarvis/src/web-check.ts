import type { CheckResult } from "./engine-check.js";
import { helperSystem, type Helped, type Helper } from "./look-up.js";
import { hangWord, optionQuestion, privatePage, privatePageWord, publicPage, publicPageWord, webAnswer, type WebSeen } from "./stand-in-web.js";
import { bareNumber, siteOf } from "./web-guard-rules.js";

export type WebCheckDeps = { helper: Helper; quietGuard: Helper; yesGuard: Helper; requests: WebSeen[]; markers: string[]; stopAfterMs: number; stopWithinMs: number };

export const webCheckNames = {
  answers: "Look-ups: the Claude Code that comes with the Agent SDK answers from a web search",
  tools: "Look-ups: the helper has the two web tools and nothing else",
  alone: "Look-ups: the helper gets its own instructions, an empty folder and none of Jarvis's secrets",
  guard: "Look-ups: a page on the home network is refused before it's opened",
  quiet: "Look-ups: a page isn't opened when the guard doesn't answer",
  yes: "Look-ups: a page is opened when the guard says yes",
  option: "Look-ups: a question that looks like an option is still only a question",
  stops: "Look-ups: stopping a look-up ends the helper",
};

function check(name: string, problems: string[]): CheckResult {
  return { name, ok: problems.length === 0, detail: problems.length === 0 ? "as expected" : problems.join("; ") };
}

const mainLoop = (seen: WebSeen) => seen.path === "/v1/messages" && seen.tools.includes("WebSearch");

export function answersCheck(helped: Helped | null, threw: string | null): CheckResult {
  const problems: string[] = [];
  if (threw !== null) problems.push(`it threw: ${threw}`);
  else if (helped === null) problems.push("it gave nothing back");
  else {
    if (helped.error !== null) problems.push(`it reported an error: ${helped.error}`);
    if (helped.answer !== webAnswer) problems.push(`its answer was ${JSON.stringify(helped.answer)}, not the stand-in's`);
    if (helped.numbers.searches !== 1) problems.push(`it counted ${helped.numbers.searches} searches, not 1`);
    if (helped.numbers.opened !== 0 || helped.numbers.refused !== 0) problems.push(`it counted ${helped.numbers.opened} pages opened and ${helped.numbers.refused} refused, not none`);
    if (helped.found.join(",") !== "example.org,example.com") problems.push(`the sites it found were ${JSON.stringify(helped.found)}`);
    if (helped.numbers.steps === null || helped.numbers.helperMs === null || helped.numbers.version === null) problems.push("it didn't report its steps, time and version");
  }
  return check(webCheckNames.answers, problems);
}

export function toolsCheck(requests: WebSeen[]): CheckResult {
  const problems: string[] = [];
  const loops = requests.filter(mainLoop);
  if (loops.length === 0) problems.push("no request with the web tools was seen");
  for (const seen of loops) {
    const real = seen.tools.filter((tool) => !tool.endsWith("Placeholder")).sort();
    if (real.join(",") !== "WebFetch,WebSearch") problems.push(`a request offered ${JSON.stringify(real)}`);
    if (seen.serverTools.length > 0) problems.push(`a request with the web tools also carried ${JSON.stringify(seen.serverTools)}`);
  }
  const searches = requests.filter((seen) => seen.serverTools.length > 0);
  if (searches.length === 0) problems.push("no search request was seen");
  for (const seen of searches) if (seen.serverTools.some((type) => !type.startsWith("web_search")) || seen.tools.length > 0) problems.push(`a search request carried ${JSON.stringify([...seen.serverTools, ...seen.tools])}`);
  return check(webCheckNames.tools, problems);
}

export function aloneCheck(requests: WebSeen[], markers: string[]): CheckResult {
  const problems: string[] = [];
  const loops = requests.filter(mainLoop);
  if (loops.length === 0) problems.push("no request with the web tools was seen");
  for (const seen of loops) {
    if (!seen.system.includes(JSON.stringify(helperSystem).slice(1, -1)) && !seen.system.includes(helperSystem)) problems.push("a request didn't carry the helper's instructions");
    if (!seen.body.includes("jarvis-web-")) problems.push("a request didn't come from the helper's own folder");
  }
  for (const seen of requests) for (const marker of markers) if (seen.body.includes(marker) || seen.system.includes(marker)) problems.push(`a request to ${seen.path} carried something of Jarvis's it shouldn't have`);
  return check(webCheckNames.alone, [...new Set(problems)]);
}

export function guardCheck(helped: Helped | null, threw: string | null, requests: WebSeen[]): CheckResult {
  const problems: string[] = [];
  if (threw !== null) problems.push(`it threw: ${threw}`);
  else if (helped === null) problems.push("it gave nothing back");
  else {
    if (helped.numbers.refused !== 1 || helped.numbers.opened !== 0) problems.push(`it counted ${helped.numbers.refused} refused and ${helped.numbers.opened} opened, not 1 and 0`);
    if (helped.refused.join(",") !== siteOf(privatePage)) problems.push(`the sites it refused were ${JSON.stringify(helped.refused)}`);
    if (helped.answer !== webAnswer) problems.push(`its answer was ${JSON.stringify(helped.answer)}, not the stand-in's`);
  }
  const errors = requests.flatMap((seen) => seen.toolErrors);
  if (!errors.some((text) => text.includes(bareNumber))) problems.push(`Claude wasn't told the guard's reason; the errors it saw were ${JSON.stringify(errors.map((text) => text.slice(0, 120)))}`);
  return check(webCheckNames.guard, problems);
}

export function quietCheck(helped: Helped | null, threw: string | null): CheckResult {
  const problems: string[] = [];
  if (threw !== null) problems.push(`it threw: ${threw}`);
  else if (helped === null) problems.push("it gave nothing back");
  else {
    if (helped.numbers.refused !== 1 || helped.numbers.opened !== 0) problems.push(`it counted ${helped.numbers.refused} refused and ${helped.numbers.opened} opened, not 1 and 0`);
    if (helped.refused.join(",") !== siteOf(publicPage)) problems.push(`the sites it refused were ${JSON.stringify(helped.refused)}`);
    if (helped.opened.length > 0) problems.push(`the sites it opened were ${JSON.stringify(helped.opened)}`);
  }
  return check(webCheckNames.quiet, problems);
}

export function yesCheck(helped: Helped | null, threw: string | null): CheckResult {
  const problems: string[] = [];
  if (threw !== null) problems.push(`it threw: ${threw}`);
  else if (helped === null) problems.push("it gave nothing back");
  else {
    if (helped.numbers.opened !== 1 || helped.numbers.refused !== 0) problems.push(`it counted ${helped.numbers.opened} opened and ${helped.numbers.refused} refused, not 1 and 0`);
    if (helped.opened.join(",") !== siteOf(publicPage)) problems.push(`the sites it opened were ${JSON.stringify(helped.opened)}`);
  }
  return check(webCheckNames.yes, problems);
}

export function optionCheck(helped: Helped | null, threw: string | null, requests: WebSeen[]): CheckResult {
  const problems: string[] = [];
  if (threw !== null) problems.push(`it threw: ${threw}`);
  else if (helped === null) problems.push("it gave nothing back");
  else {
    if (helped.error !== null) problems.push(`it reported an error: ${helped.error}`);
    if (helped.answer !== webAnswer) problems.push(`its answer was ${JSON.stringify(helped.answer)}, not the stand-in's`);
  }
  const loops = requests.filter(mainLoop);
  if (loops.length === 0) problems.push("no request with the web tools was seen");
  for (const seen of loops) {
    const real = seen.tools.filter((tool) => !tool.endsWith("Placeholder")).sort();
    if (real.join(",") !== "WebFetch,WebSearch") problems.push(`a request offered ${JSON.stringify(real)}`);
  }
  if (!loops.some((seen) => seen.body.includes(JSON.stringify(optionQuestion).slice(1, -1)))) problems.push("the question didn't arrive as the question");
  return check(webCheckNames.option, [...new Set(problems)]);
}

export function stopsCheck(helped: Helped | null, threw: string | null, tookMs: number, withinMs: number): CheckResult {
  const problems: string[] = [];
  if (threw !== null) problems.push(`it threw: ${threw}`);
  else if (helped === null) problems.push("it gave nothing back");
  else {
    if (helped.error !== "stopped" || helped.answer !== null) problems.push(`it ended with ${JSON.stringify({ answer: helped.answer, error: helped.error })}, not stopped`);
    if (tookMs > withinMs) problems.push(`it took ${Math.round(tookMs)} ms to stop`);
  }
  return check(webCheckNames.stops, problems);
}

async function tried(run: () => Promise<Helped>): Promise<{ helped: Helped | null; threw: string | null }> {
  try {
    return { helped: await run(), threw: null };
  } catch (error) {
    return { helped: null, threw: error instanceof Error ? error.message : String(error) };
  }
}

export async function runWebCheck(deps: WebCheckDeps): Promise<CheckResult[]> {
  const plain = await tried(() => deps.helper("What is the stand-in answer?", new AbortController().signal));
  const before = deps.requests.length;
  const results = [answersCheck(plain.helped, plain.threw), toolsCheck(deps.requests), aloneCheck(deps.requests, deps.markers)];
  const guarded = await tried(() => deps.helper(`${privatePageWord} What does the router say?`, new AbortController().signal));
  results.push(guardCheck(guarded.helped, guarded.threw, deps.requests.slice(before)));
  const quiet = await tried(() => deps.quietGuard(`${publicPageWord} What does the page say?`, new AbortController().signal));
  results.push(quietCheck(quiet.helped, quiet.threw));
  const yes = await tried(() => deps.yesGuard(`${publicPageWord} What does the page say?`, new AbortController().signal));
  results.push(yesCheck(yes.helped, yes.threw));
  const fromOption = deps.requests.length;
  const option = await tried(() => deps.helper(optionQuestion, new AbortController().signal));
  results.push(optionCheck(option.helped, option.threw, deps.requests.slice(fromOption)));
  const stop = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => stop.abort(), deps.stopAfterMs);
  const stopped = await tried(() => deps.helper(`${hangWord} What takes forever?`, stop.signal));
  clearTimeout(timer);
  results.push(stopsCheck(stopped.helped, stopped.threw, performance.now() - started - deps.stopAfterMs, deps.stopWithinMs));
  return results;
}
