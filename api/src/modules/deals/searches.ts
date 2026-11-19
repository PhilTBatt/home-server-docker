import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const conditionIds: Record<string, string> = {
  "new": "1000",
  "opened": "1500",
  "certified refurbished": "2000",
  "excellent refurbished": "2010",
  "very good refurbished": "2020",
  "good refurbished": "2030",
  "seller refurbished": "2500",
  "used": "3000",
  "for parts": "7000",
};

export const buyingOptions = ["buy it now", "auction"] as const;

export type Buying = (typeof buyingOptions)[number];

export type Search = {
  id: string;
  name: string;
  on: boolean;
  source: string;
  query: string;
  minPrice: number | null;
  maxPrice: number | null;
  maxWithPostage: number | null;
  conditions: string[];
  buying: Buying[];
  endingWithinHours: number | null;
  ukOnly: boolean;
  exclude: string[];
  mustInclude: string[];
  categoryId: string | null;
  sellerMinPercent: number | null;
  sellerMinFeedback: number | null;
  everyMinutes: number;
  dropPercent: number | null;
};

export type Limits = {
  callsPerDay: number;
  alertsPerDay: number;
  alertsPerCheck: number;
};

export type SearchList = {
  searches: Search[];
  limits: Limits;
};

export const defaultLimits: Limits = { callsPerDay: 1000, alertsPerDay: 60, alertsPerCheck: 5 };

const maxFileLength = 256 * 1024;
const maxSearches = 50;
const maxProblemsShown = 5;
const controlCharacters = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const namePattern = /^[A-Za-z0-9][A-Za-z0-9 .,:+&()'/_-]*$/;
const settingPattern = /^[A-Za-z0-9_-]{1,30}$/;

const searchSettings = [
  "id",
  "name",
  "switch",
  "source",
  "query",
  "minPrice",
  "maxPrice",
  "maxWithPostage",
  "conditions",
  "buying",
  "endingWithinHours",
  "ukOnly",
  "exclude",
  "mustInclude",
  "categoryId",
  "sellerMinPercent",
  "sellerMinFeedback",
  "everyMinutes",
  "dropPercent",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownSettings(value: Record<string, unknown>, known: string[]): string[] {
  return Object.keys(value)
    .filter((key) => !known.includes(key))
    .map((key) => (settingPattern.test(key) ? `"${key}" isn't a setting` : "it has a setting with an odd name"));
}

function pence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  const inPence = Math.round(value * 100);
  return Math.abs(value * 100 - inPence) < 1e-6 ? inPence : null;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function words(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const list: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || controlCharacters.test(entry)) return null;
    const word = entry.trim();
    if (word.length === 0 || word.length > 60 || !/[A-Za-z0-9]/.test(word)) return null;
    list.push(word);
  }
  return list;
}

function readSearch(raw: unknown, sources: string[], problems: string[]): Search | null {
  if (!isObject(raw)) {
    problems.push("it must be a group of settings in { }");
    return null;
  }
  const before = problems.length;
  problems.push(...unknownSettings(raw, searchSettings));

  const has = (key: string) => Object.hasOwn(raw, key);
  const id = typeof raw.id === "string" && raw.id.length <= 40 && idPattern.test(raw.id) ? raw.id : "";
  if (id === "") problems.push("id must be lower-case letters, digits and hyphens, like optiplex-7070 (40 at most)");

  const name = typeof raw.name === "string" && raw.name.length <= 40 && namePattern.test(raw.name) ? raw.name : "";
  if (name === "") problems.push("name must be 1 to 40 plain letters, digits, spaces or . , : + & ( ) ' / _ - and start with a letter or digit");

  if (raw.switch !== "on" && raw.switch !== "off") problems.push("switch must be on or off");

  const source = has("source") ? raw.source : "ebay";
  if (typeof source !== "string" || !sources.includes(source)) problems.push(`source must be one of: ${sources.join(", ")}`);

  const query = typeof raw.query === "string" && !controlCharacters.test(raw.query) ? raw.query.trim() : "";
  if (query === "" || query.length > 100) problems.push("query must be 1 to 100 characters");
  else if (query.includes("*")) problems.push("query can't use *");

  const money = (key: "minPrice" | "maxPrice" | "maxWithPostage"): number | null => {
    if (!has(key)) return null;
    const value = pence(raw[key]);
    if (value === null) problems.push(`${key} must be an amount in pounds above 0, like 150 or 149.99`);
    return value;
  };
  const minPrice = money("minPrice");
  const maxPrice = money("maxPrice");
  const maxWithPostage = money("maxWithPostage");
  if (minPrice !== null && maxPrice !== null && minPrice >= maxPrice) problems.push("minPrice must be below maxPrice");
  if (minPrice !== null && maxWithPostage !== null && minPrice >= maxWithPostage) problems.push("minPrice must be below maxWithPostage");

  let conditions: string[] = [];
  if (has("conditions")) {
    const given = raw.conditions;
    if (Array.isArray(given) && given.length > 0 && given.every((entry) => typeof entry === "string" && Object.hasOwn(conditionIds, entry))) {
      conditions = [...new Set(given as string[])];
    } else {
      problems.push(`conditions must be a list of one or more of: ${Object.keys(conditionIds).join(", ")}`);
    }
  }

  let buying: Buying[] = ["buy it now"];
  if (has("buying")) {
    const given = raw.buying;
    if (Array.isArray(given) && given.length > 0 && given.every((entry) => (buyingOptions as readonly unknown[]).includes(entry))) {
      buying = [...new Set(given as Buying[])];
    } else {
      problems.push(`buying must be a list of one or more of: ${buyingOptions.join(", ")}`);
    }
  }

  let endingWithinHours: number | null = null;
  if (has("endingWithinHours")) {
    endingWithinHours = wholeNumber(raw.endingWithinHours, 1, 240);
    if (endingWithinHours === null) problems.push("endingWithinHours must be a whole number from 1 to 240");
    else if (!buying.includes("auction")) problems.push("endingWithinHours only works when buying includes auction");
  }

  const ukOnly = has("ukOnly") ? raw.ukOnly : true;
  if (typeof ukOnly !== "boolean") problems.push("ukOnly must be true or false");

  const wordList = (key: "exclude" | "mustInclude"): string[] => {
    if (!has(key)) return [];
    const list = words(raw[key]);
    if (list === null) problems.push(`${key} must be a list of up to 50 words or phrases, each 1 to 60 characters with a letter or digit`);
    return list ?? [];
  };
  const exclude = wordList("exclude");
  const mustInclude = wordList("mustInclude");

  let categoryId: string | null = null;
  if (has("categoryId")) {
    const given = typeof raw.categoryId === "number" && Number.isInteger(raw.categoryId) ? String(raw.categoryId) : raw.categoryId;
    if (typeof given === "string" && /^[0-9]{1,10}$/.test(given)) categoryId = given;
    else problems.push("categoryId must be one of eBay's category numbers");
  }

  let sellerMinPercent: number | null = null;
  if (has("sellerMinPercent")) {
    const given = raw.sellerMinPercent;
    if (typeof given === "number" && Number.isFinite(given) && given >= 0 && given <= 100) sellerMinPercent = given;
    else problems.push("sellerMinPercent must be a number from 0 to 100");
  }

  let sellerMinFeedback: number | null = null;
  if (has("sellerMinFeedback")) {
    sellerMinFeedback = wholeNumber(raw.sellerMinFeedback, 0, 10_000_000);
    if (sellerMinFeedback === null) problems.push("sellerMinFeedback must be a whole number, 0 or more");
  }

  let everyMinutes = 30;
  if (has("everyMinutes")) {
    const given = wholeNumber(raw.everyMinutes, 5, 1440);
    if (given === null) problems.push("everyMinutes must be a whole number from 5 to 1440");
    else everyMinutes = given;
  }

  let dropPercent: number | null = null;
  if (has("dropPercent")) {
    const given = raw.dropPercent;
    if (typeof given === "number" && Number.isFinite(given) && given >= 1 && given <= 90) dropPercent = given;
    else problems.push("dropPercent must be a number from 1 to 90");
  }

  if (problems.length > before) return null;
  return {
    id,
    name,
    on: raw.switch === "on",
    source: source as string,
    query,
    minPrice,
    maxPrice,
    maxWithPostage,
    conditions,
    buying,
    endingWithinHours,
    ukOnly: ukOnly as boolean,
    exclude,
    mustInclude,
    categoryId,
    sellerMinPercent,
    sellerMinFeedback,
    everyMinutes,
    dropPercent,
  };
}

function readLimits(raw: unknown, problems: string[]): Limits {
  if (raw === undefined) return { ...defaultLimits };
  if (!isObject(raw)) {
    problems.push("limits must be a group of settings in { }");
    return { ...defaultLimits };
  }
  problems.push(...unknownSettings(raw, Object.keys(defaultLimits)).map((problem) => `limits: ${problem}`));
  const limits = { ...defaultLimits };
  const ranges: Record<keyof Limits, number> = { callsPerDay: 5000, alertsPerDay: 250, alertsPerCheck: 20 };
  for (const key of Object.keys(ranges) as (keyof Limits)[]) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = wholeNumber(raw[key], 1, ranges[key]);
    if (value === null) problems.push(`limits: ${key} must be a whole number from 1 to ${ranges[key]}`);
    else limits[key] = value;
  }
  return limits;
}

function fail(problems: string[]): never {
  const shown = problems.slice(0, maxProblemsShown).join("; ");
  const more = problems.length > maxProblemsShown ? `; and ${problems.length - maxProblemsShown} more` : "";
  throw new Error(`${shown}${more}`);
}

export function readSearches(text: string, sources: string[]): SearchList {
  if (text.length > maxFileLength) fail(["the file is too big"]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    const place = /\(line (\d+) column (\d+)\)/.exec(error instanceof Error ? error.message : "");
    fail([place ? `it isn't valid JSON (line ${place[1]}, column ${place[2]})` : "it isn't valid JSON"]);
  }
  if (!isObject(parsed)) fail(["it must start with { and hold a searches list"]);

  const problems = unknownSettings(parsed, ["searches", "limits"]);
  const limits = readLimits(parsed.limits, problems);
  const rawSearches = parsed.searches;
  if (!Array.isArray(rawSearches)) fail([...problems, "searches must be a list in [ ]"]);
  if (rawSearches.length > maxSearches) fail([...problems, `there can be ${maxSearches} searches at most`]);

  const searches: Search[] = [];
  const seenIds = new Set<string>();
  rawSearches.forEach((raw, index) => {
    const own: string[] = [];
    const search = readSearch(raw, sources, own);
    const rawId = isObject(raw) && typeof raw.id === "string" && raw.id.length <= 40 && idPattern.test(raw.id) ? raw.id : null;
    const label = rawId === null ? `search ${index + 1}` : `search ${index + 1} (${rawId})`;
    if (rawId !== null && seenIds.has(rawId)) own.push("its id is used by an earlier search");
    if (rawId !== null) seenIds.add(rawId);
    problems.push(...own.map((problem) => `${label}: ${problem}`));
    if (search !== null && own.length === 0) searches.push(search);
  });

  if (problems.length > 0) fail(problems);
  return { searches, limits };
}

export async function loadSearches(path: string, sources: string[]): Promise<SearchList> {
  const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw new Error(error.code === "ENOENT" ? "there's no searches.json in the deals folder" : "searches.json couldn't be read");
  });
  return readSearches(text, sources);
}

export function fingerprint(search: Search): string {
  const criteria = [
    search.source,
    search.query.toLowerCase(),
    search.minPrice,
    search.maxPrice,
    search.maxWithPostage,
    [...search.conditions].sort(),
    [...search.buying].sort(),
    search.endingWithinHours,
    search.ukOnly,
    search.exclude.map((word) => word.toLowerCase()).sort(),
    search.mustInclude.map((word) => word.toLowerCase()).sort(),
    search.categoryId,
    search.sellerMinPercent,
    search.sellerMinFeedback,
  ];
  return createHash("sha256").update(JSON.stringify(criteria)).digest("hex").slice(0, 16);
}