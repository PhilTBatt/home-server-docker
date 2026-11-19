import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

const registeredSpeeds = ["2133p", "2400t", "2666v", "2933y", "3200aa"].flatMap((speed) => ["r", "ra0", "ra1", "ra2", "rb0", "rb1", "rb2", "rc0", "rc1"].map((end) => `${speed} ${end}`));

export const avoidLists: Record<string, string[]> = {
  "faulty": ["faulty", "spares", "repair", "repairs", "for parts", "not working", "untested", "broken", "no power", "bios lock*", "bios password", "password locked"],
  "incomplete": ["no ram", "no memory", "no hdd", "no ssd", "no hard drive", "no storage", "no drive*", "no cpu", "no processor", "no psu", "barebone*", "bare bones"],
  "parts only": ["motherboard", "mainboard", "mother board", "mobo", "system board", "board only", "caddy", "bezel", "heatsink", "fan only", "psu only", "power supply only", "front panel", "riser", "case only", "chassis only", "box only", "empty box"],
  "lots": ["job lot", "joblot", "bulk", "wholesale", "pallet"],
  "laptop ram": ["sodimm", "so dimm", "laptop ram", "laptop memory", "notebook ram", "notebook memory", "for laptop*", "for notebook*", "260 pin*", "260pin*", "262 pin*", "262pin*", "hyperx impact", "fury impact", "kingston impact", "m471*"],
  "server ram": ["rdimm", "lrdimm", "registered", "server ram", "server memory", "reg ecc", "ecc reg", "1rx4", "2rx4", "4rx4", "8rx4", ...registeredSpeeds, "m393*", "m386*", "hpe"],
};

export const units = ["GB", "TB"] as const;

export const groups = ["whole pc", "server", "cpu", "motherboard", "ram", "storage", "graphics", "power supply", "case", "cooling", "network", "expansion", "ups", "other"] as const;

export type Group = (typeof groups)[number];

export type Buying = (typeof buyingOptions)[number];

export type Search = {
  id: string;
  name: string;
  group: Group | null;
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
  details: Record<string, string[]> | null;
  detailsMode: "prefer" | "only";
  hideDetails: Record<string, string[]> | null;
  collection: { postcode: string; miles: number } | null;
  freePostage: boolean;
  autoCorrect: boolean;
  sellerType: "business" | "private" | null;
  postageShown: boolean;
  returnsOnly: boolean;
  avoid: string[];
  guidePrice: number | null;
  guideDate: string | null;
  greatPercent: number;
  unit: (typeof units)[number] | null;
  alertsPerDay: number | null;
  endingSoonMinutes: number | null;
};

export type Quiet = {
  from: number;
  to: number;
  allow: "none" | "great";
};

export type Limits = {
  callsPerDay: number;
  alertsPerDay: number;
  alertsPerCheck: number;
};

export type SearchList = {
  searches: Search[];
  limits: Limits;
  quiet: Quiet | null;
  postcode: string | null;
  files: string[];
};

export const defaultLimits: Limits = { callsPerDay: 1000, alertsPerDay: 60, alertsPerCheck: 5 };

const maxFileLength = 256 * 1024;
export const maxSearches = 150;
const maxMoreFiles = 5;
const moreFilePattern = /^[a-z0-9][a-z0-9-]{0,40}\.json$/;
const notSearchFiles = ["searches.json", "state.json"];
const ebayOnly = ["conditions", "buying", "endingWithinHours", "ukOnly", "categoryId", "sellerMinPercent", "sellerMinFeedback", "details", "detailsMode", "hideDetails", "collectionMiles", "freePostage", "autoCorrect", "sellerType", "postageShown", "returnsOnly", "endingSoonMinutes"];
const maxProblemsShown = 5;
export const maxHiddenDetails = 3;
const controlCharacters = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const namePattern = /^[A-Za-z0-9][A-Za-z0-9 .,:+&()'/_-]*$/;
const settingPattern = /^[A-Za-z0-9_-]{1,30}$/;
const postcodePattern = /^([A-Z]{1,2}[0-9][A-Z0-9]?) ?([0-9][A-Z]{2})?$/;

const searchSettings = [
  "id",
  "name",
  "group",
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
  "details",
  "detailsMode",
  "hideDetails",
  "collectionMiles",
  "freePostage",
  "autoCorrect",
  "sellerType",
  "postageShown",
  "returnsOnly",
  "avoid",
  "guidePrice",
  "guideDate",
  "greatPercent",
  "unit",
  "alertsPerDay",
  "endingSoonMinutes",
];

const detailPattern = /^[^\u0000-\u001F\u007F-\u009F\u2028\u2029{}|\\]{1,60}$/;

function readDetails(raw: unknown): Record<string, string[]> | null {
  if (!isObject(raw)) return null;
  const names = Object.keys(raw);
  if (names.length === 0 || names.length > 10) return null;
  const details: Record<string, string[]> = {};
  for (const name of names) {
    const values = raw[name];
    if (name !== name.trim() || !detailPattern.test(name) || /[,:]/.test(name) || name.toLowerCase() === "categoryid" || name === "__proto__") return null;
    if (!Array.isArray(values) || values.length === 0 || values.length > 20) return null;
    if (!values.every((value) => typeof value === "string" && value === value.trim() && detailPattern.test(value))) return null;
    details[name] = [...new Set(values as string[])];
  }
  return details;
}

function clockTime(value: unknown): number | null {
  const match = typeof value === "string" ? /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value) : null;
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

function realDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

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

function readSearch(raw: unknown, sources: string[], problems: string[], postcode: string | null): Search | null {
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

  const group = has("group") ? raw.group : null;
  if (has("group") && !(groups as readonly unknown[]).includes(group)) problems.push(`group must be one of: ${groups.join(", ")}`);

  const source = has("source") ? raw.source : "ebay";
  if (typeof source !== "string" || !sources.includes(source)) problems.push(`source must be one of: ${sources.join(", ")}`);
  else if (source !== "ebay") problems.push(...ebayOnly.filter(has).map((key) => `${key} only works with eBay searches`));

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

  let details: Record<string, string[]> | null = null;
  if (has("details")) {
    details = readDetails(raw.details);
    if (details === null) problems.push("details must be 1 to 10 of eBay's item detail names, each with a list of 1 to 20 values, without { } | or \\");
    else if (categoryId === null) problems.push("details only works with a categoryId");
  }
  const detailsMode = has("detailsMode") ? raw.detailsMode : "prefer";
  if (detailsMode !== "prefer" && detailsMode !== "only") problems.push("detailsMode must be prefer or only");
  else if (has("detailsMode") && !has("details")) problems.push("detailsMode only works with details");

  let hideDetails: Record<string, string[]> | null = null;
  if (has("hideDetails")) {
    const given = readDetails(raw.hideDetails);
    if (given === null || Object.keys(given).length > maxHiddenDetails) problems.push(`hideDetails must be 1 to ${maxHiddenDetails} of eBay's item detail names, each with a list of 1 to 20 values, without { } | or \\`);
    else if (categoryId === null) problems.push("hideDetails only works with a categoryId");
    else if (details !== null && Object.keys(given).some((name) => Object.hasOwn(details as Record<string, string[]>, name))) problems.push("a detail name can't be in both details and hideDetails");
    else hideDetails = given;
  }

  const flag = (key: "autoCorrect" | "postageShown" | "returnsOnly" | "freePostage"): boolean => {
    if (!has(key)) return false;
    if (typeof raw[key] !== "boolean") problems.push(`${key} must be true or false`);
    return raw[key] === true;
  };
  const autoCorrect = flag("autoCorrect");
  const postageShown = flag("postageShown");
  const returnsOnly = flag("returnsOnly");
  const freePostage = flag("freePostage");

  let collection: Search["collection"] = null;
  if (has("collectionMiles")) {
    const miles = wholeNumber(raw.collectionMiles, 1, 100);
    if (miles === null) problems.push("collectionMiles must be a whole number of miles from 1 to 100");
    else if (postcode === null) problems.push("collectionMiles needs your postcode at the top of searches.json, like \"postcode\": \"LS1 4AP\"");
    else if (freePostage) problems.push("collectionMiles and freePostage can't both be used, as collection has no postage");
    else if (postageShown) problems.push("collectionMiles and postageShown can't both be used, as collection-only listings show no postage");
    else collection = { postcode, miles };
  }

  const sellerType = has("sellerType") ? raw.sellerType : null;
  if (has("sellerType") && sellerType !== "business" && sellerType !== "private") problems.push("sellerType must be business or private");

  let avoid: string[] = [];
  if (has("avoid")) {
    const given = raw.avoid;
    if (Array.isArray(given) && given.length > 0 && given.every((entry) => typeof entry === "string" && Object.hasOwn(avoidLists, entry))) avoid = [...new Set(given as string[])];
    else problems.push(`avoid must be a list of one or more of: ${Object.keys(avoidLists).join(", ")}`);
  }

  let guidePrice: number | null = null;
  if (has("guidePrice")) {
    guidePrice = pence(raw.guidePrice);
    if (guidePrice === null) problems.push("guidePrice must be an amount in pounds above 0, like 110 or 109.99");
  }
  let guideDate: string | null = null;
  if (has("guideDate")) {
    guideDate = realDay(raw.guideDate);
    if (guideDate === null) problems.push("guideDate must be a real date like 2026-11-19");
    else if (!has("guidePrice")) problems.push("guideDate only works with a guidePrice");
  }
  let greatPercent = 20;
  if (has("greatPercent")) {
    const given = wholeNumber(raw.greatPercent, 1, 90);
    if (given === null) problems.push("greatPercent must be a whole number from 1 to 90");
    else if (!has("guidePrice")) problems.push("greatPercent only works with a guidePrice");
    else greatPercent = given;
  }

  const unit = has("unit") ? raw.unit : null;
  if (has("unit") && !(units as readonly unknown[]).includes(unit)) problems.push(`unit must be one of: ${units.join(", ")}`);

  let alertsPerDay: number | null = null;
  if (has("alertsPerDay")) {
    alertsPerDay = wholeNumber(raw.alertsPerDay, 1, 250);
    if (alertsPerDay === null) problems.push("alertsPerDay must be a whole number from 1 to 250");
  }

  let endingSoonMinutes: number | null = null;
  if (has("endingSoonMinutes")) {
    endingSoonMinutes = wholeNumber(raw.endingSoonMinutes, 5, 720);
    if (endingSoonMinutes === null) problems.push("endingSoonMinutes must be a whole number from 5 to 720");
    else if (!buying.includes("auction")) problems.push("endingSoonMinutes only works when buying includes auction");
    else if (endingSoonMinutes < everyMinutes) problems.push("endingSoonMinutes must be at least everyMinutes, or most reminders would be missed");
  }

  if (problems.length > before) return null;
  return {
    id,
    name,
    group: group as Group | null,
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
    details,
    detailsMode: detailsMode as "prefer" | "only",
    hideDetails,
    collection,
    freePostage,
    autoCorrect,
    sellerType: sellerType as "business" | "private" | null,
    postageShown,
    returnsOnly,
    avoid,
    guidePrice,
    guideDate,
    greatPercent,
    unit: unit as (typeof units)[number] | null,
    alertsPerDay,
    endingSoonMinutes,
  };
}

function readQuiet(raw: unknown, problems: string[]): Quiet | null {
  if (raw === undefined) return null;
  if (!isObject(raw)) {
    problems.push("quiet must be a group of settings in { }");
    return null;
  }
  const before = problems.length;
  problems.push(...unknownSettings(raw, ["from", "to", "allow"]).map((problem) => `quiet: ${problem}`));
  const from = clockTime(raw.from);
  const to = clockTime(raw.to);
  if (from === null || to === null) problems.push("quiet: from and to must be times like 23:00 and 07:00");
  else if (from === to) problems.push("quiet: from and to can't be the same time");
  const allow = Object.hasOwn(raw, "allow") ? raw.allow : "none";
  if (allow !== "none" && allow !== "great") problems.push("quiet: allow must be none or great");
  if (problems.length > before || from === null || to === null) return null;
  return { from, to, allow: allow as "none" | "great" };
}

function readPostcode(raw: unknown, problems: string[]): string | null {
  if (raw === undefined) return null;
  const given = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  const match = postcodePattern.exec(given);
  if (match === null) {
    problems.push("postcode must be a UK postcode, or just its first half, like LS1 4AP or LS1");
    return null;
  }
  return match[2] === undefined ? match[1] : `${match[1]} ${match[2]}`;
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

function parseJson(text: string, label: string, problems: string[]): unknown {
  if (text.length > maxFileLength) {
    problems.push(`${label}the file is too big`);
    return undefined;
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    const place = /\(line (\d+) column (\d+)\)/.exec(error instanceof Error ? error.message : "");
    problems.push(`${label}${place ? `it isn't valid JSON (line ${place[1]}, column ${place[2]})` : "it isn't valid JSON"}`);
    return undefined;
  }
}

function readMore(raw: unknown, problems: string[]): string[] {
  if (raw === undefined) return [];
  const names = Array.isArray(raw) ? raw : [];
  const fine =
    names.length > 0 &&
    names.length <= maxMoreFiles &&
    names.every((name) => typeof name === "string" && moreFilePattern.test(name) && !notSearchFiles.includes(name)) &&
    new Set(names).size === names.length;
  if (!fine) {
    problems.push(`more must be a list of 1 to ${maxMoreFiles} other files in the deals folder, like ["catalogue.json"]`);
    return [];
  }
  return names as string[];
}

export function moreFiles(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
    const listed = isObject(parsed) && Array.isArray(parsed.more) ? parsed.more : [];
    return listed.filter((name): name is string => typeof name === "string" && moreFilePattern.test(name) && !notSearchFiles.includes(name)).slice(0, maxMoreFiles);
  } catch {
    return [];
  }
}

export function readSearches(text: string, sources: string[], more: Record<string, string | null> = {}): SearchList {
  const opening: string[] = [];
  const parsed = parseJson(text, "", opening);
  if (opening.length > 0) fail(opening);
  if (!isObject(parsed)) fail(["it must start with { and hold a searches list"]);

  const problems = unknownSettings(parsed, ["searches", "limits", "quiet", "postcode", "more"]);
  const limits = readLimits(parsed.limits, problems);
  const quiet = readQuiet(parsed.quiet, problems);
  const postcode = readPostcode(parsed.postcode, problems);
  const files = readMore(parsed.more, problems);
  if (!Array.isArray(parsed.searches)) fail([...problems, "searches must be a list in [ ]"]);

  const lists: { label: string; raw: unknown[] }[] = [{ label: "", raw: parsed.searches }];
  for (const file of files) {
    const extra = more[file];
    if (typeof extra !== "string") {
      problems.push(`${file} couldn't be read from the deals folder`);
      continue;
    }
    const before = problems.length;
    const content = parseJson(extra, `${file}: `, problems);
    if (problems.length > before) continue;
    if (!isObject(content) || !Array.isArray(content.searches)) {
      problems.push(`${file}: it must start with { and hold a searches list in [ ]`);
      continue;
    }
    problems.push(...unknownSettings(content, ["searches"]).map((problem) => `${file}: ${problem}`));
    lists.push({ label: `${file} `, raw: content.searches });
  }
  const count = lists.reduce((sum, list) => sum + list.raw.length, 0);
  if (count > maxSearches) fail([...problems, `there can be ${maxSearches} searches at most, counting every file`]);

  const searches: Search[] = [];
  const seenIds = new Set<string>();
  for (const list of lists) {
    list.raw.forEach((raw, index) => {
      const own: string[] = [];
      const search = readSearch(raw, sources, own, postcode);
      const rawId = isObject(raw) && typeof raw.id === "string" && raw.id.length <= 40 && idPattern.test(raw.id) ? raw.id : null;
      const label = `${list.label}${rawId === null ? `search ${index + 1}` : `search ${index + 1} (${rawId})`}`;
      if (rawId !== null && seenIds.has(rawId)) own.push("its id is used by an earlier search");
      if (rawId !== null) seenIds.add(rawId);
      problems.push(...own.map((problem) => `${label}: ${problem}`));
      if (search !== null && own.length === 0) searches.push(search);
    });
  }

  if (problems.length > 0) fail(problems);
  return { searches, limits, quiet, postcode, files };
}

export async function loadSearches(path: string, sources: string[]): Promise<SearchList> {
  const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw new Error(error.code === "ENOENT" ? "there's no searches.json in the deals folder" : "searches.json couldn't be read");
  });
  const more: Record<string, string | null> = {};
  for (const file of moreFiles(text)) more[file] = await readFile(join(dirname(path), file), "utf8").catch(() => null);
  return readSearches(text, sources, more);
}

export function fingerprint(search: Search): string {
  const criteria: unknown[] = [
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
  const later = [
    search.details === null ? null : [search.detailsMode, Object.entries(search.details).sort(([a], [b]) => a.localeCompare(b))],
    search.autoCorrect,
    search.sellerType,
    search.postageShown,
    search.returnsOnly,
    [...search.avoid].sort(),
  ];
  if (JSON.stringify(later) !== "[null,false,null,false,false,[]]") criteria.push(later);
  const newer = [search.hideDetails === null ? null : Object.entries(search.hideDetails).sort(([a], [b]) => a.localeCompare(b)), search.collection, search.freePostage];
  if (JSON.stringify(newer) !== "[null,null,false]") criteria.push(newer);
  return createHash("sha256").update(JSON.stringify(criteria)).digest("hex").slice(0, 16);
}