import { safeBoardUrl, type TrainSettings } from "./modules/trains/board.js";

export type Features = {
  alerts: boolean;
  heartbeat: boolean;
  dailySummary: boolean;
  memoryInbox: boolean;
  memoryUpload: boolean;
  deals: boolean;
  findPhone: boolean;
  trains: boolean;
};

export type DealSettings = {
  seen: "memory" | "disk";
  ebayEnvironment: "production" | "sandbox";
  ebayClientId: string;
  ebayClientSecret: string;
  ai: boolean;
};

export type Config = {
  apiToken: string;
  qbitApiKey: string;
  jellyfinApiKey: string;
  ntfyTopic: string;
  healthcheckUrl: string;
  deals: DealSettings;
  trains: TrainSettings;
  features: Features;
};

const featureLabels: Record<keyof Features, string> = {
  alerts: "alerts",
  heartbeat: "heartbeat",
  dailySummary: "daily summary",
  memoryInbox: "brain inbox",
  memoryUpload: "note uploads",
  deals: "deal watcher",
  findPhone: "find my phone",
  trains: "train times",
};

export function switchedOff(features: Features): string[] {
  return Object.entries(featureLabels)
    .filter(([key]) => !features[key as keyof Features])
    .map(([, label]) => label);
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const missing: string[] = [];
  const notOnOrOff: string[] = [];
  const notAllowed: string[] = [];

  const read = (name: string, needed = true): string => {
    const value = env[name] ?? "";
    if (value === "" && needed) missing.push(name);
    return value;
  };
  const readSwitch = (name: string, needed = true): boolean => {
    const value = read(name, needed);
    if (value !== "" && value !== "on" && value !== "off") notOnOrOff.push(name);
    return value === "on";
  };
  const readChoice = <Choice extends string>(name: string, choices: readonly Choice[], needed: boolean): Choice => {
    const value = read(name, needed);
    const chosen = choices.find((choice) => choice === value);
    if (value !== "" && chosen === undefined) notAllowed.push(`${name} (${choices.join(" or ")})`);
    return chosen ?? choices[0];
  };

  const apiToken = read("API_TOKEN");
  const qbitApiKey = read("QBIT_API_KEY");
  const jellyfinApiKey = read("JELLYFIN_API_KEY");
  const features = {
    alerts: readSwitch("ALERTS"),
    heartbeat: readSwitch("HEARTBEAT"),
    dailySummary: readSwitch("DAILY_SUMMARY"),
    memoryInbox: readSwitch("MEMORY_INBOX"),
    memoryUpload: readSwitch("MEMORY_UPLOAD"),
    deals: readSwitch("DEALS"),
    findPhone: readSwitch("FIND_PHONE"),
    trains: readSwitch("TRAINS"),
  };
  const ntfyTopic = read("NTFY_TOPIC", features.alerts || features.dailySummary || features.deals || features.findPhone);
  const healthcheckUrl = read("HEALTHCHECK_URL", features.heartbeat);
  const deals: DealSettings = {
    seen: readChoice("DEALS_SEEN", ["memory", "disk"], features.deals),
    ebayEnvironment: readChoice("EBAY_ENVIRONMENT", ["production", "sandbox"], features.deals),
    ebayClientId: read("EBAY_CLIENT_ID", features.deals),
    ebayClientSecret: read("EBAY_CLIENT_SECRET", features.deals),
    ai: readSwitch("DEALS_AI", features.deals),
  };
  const readStation = (name: string): string => {
    const value = read(name, features.trains);
    if (value !== "" && !/^[A-Z]{3}$/.test(value)) notAllowed.push(`${name} (a station's three-letter code in capitals, like KGX)`);
    return value;
  };
  const railKey = read("RAIL_DATA_KEY", features.trains);
  if (railKey !== "" && !/^[\x21-\x7E]{1,200}$/.test(railKey)) notAllowed.push("RAIL_DATA_KEY (printable characters with no spaces)");
  const from = readStation("TRAINS_FROM");
  const to = readStation("TRAINS_TO");
  if (to !== "" && to === from) notAllowed.push("TRAINS_TO (a different station from TRAINS_FROM)");
  const boardUrl = read("TRAINS_BOARD_URL", features.trains);
  if (boardUrl !== "" && safeBoardUrl(boardUrl) === null) notAllowed.push("TRAINS_BOARD_URL (an https address on raildata.org.uk ending just before the station code, with no ?, # or {crs} part)");
  const trains: TrainSettings = { key: railKey, from, to, boardUrl: safeBoardUrl(boardUrl) ?? "" };
  const problems: string[] = [];

  if (missing.length > 0) problems.push(`Missing settings in api/.env: ${missing.join(", ")}`);
  if (notOnOrOff.length > 0) problems.push(`Settings in api/.env that must be on or off: ${notOnOrOff.join(", ")}`);
  if (notAllowed.length > 0) problems.push(`Settings in api/.env with a value that isn't allowed: ${notAllowed.join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join(". "));

  return { apiToken, qbitApiKey, jellyfinApiKey, ntfyTopic, healthcheckUrl, deals, trains, features };
}