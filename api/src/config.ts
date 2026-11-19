export type Features = {
  alerts: boolean;
  heartbeat: boolean;
  dailySummary: boolean;
  memoryInbox: boolean;
  memoryUpload: boolean;
  deals: boolean;
};

export type DealSettings = {
  seen: "memory" | "disk";
  ebayEnvironment: "production" | "sandbox";
  ebayClientId: string;
  ebayClientSecret: string;
};

export type Config = {
  apiToken: string;
  qbitApiKey: string;
  jellyfinApiKey: string;
  ntfyTopic: string;
  healthcheckUrl: string;
  deals: DealSettings;
  features: Features;
};

const featureLabels: Record<keyof Features, string> = {
  alerts: "alerts",
  heartbeat: "heartbeat",
  dailySummary: "daily summary",
  memoryInbox: "brain inbox",
  memoryUpload: "note uploads",
  deals: "deal watcher",
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
  const readSwitch = (name: string): boolean => {
    const value = read(name);
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
  };
  const ntfyTopic = read("NTFY_TOPIC", features.alerts || features.dailySummary || features.deals);
  const healthcheckUrl = read("HEALTHCHECK_URL", features.heartbeat);
  const deals: DealSettings = {
    seen: readChoice("DEALS_SEEN", ["memory", "disk"], features.deals),
    ebayEnvironment: readChoice("EBAY_ENVIRONMENT", ["production", "sandbox"], features.deals),
    ebayClientId: read("EBAY_CLIENT_ID", features.deals),
    ebayClientSecret: read("EBAY_CLIENT_SECRET", features.deals),
  };
  const problems: string[] = [];

  if (missing.length > 0) problems.push(`Missing settings in api/.env: ${missing.join(", ")}`);
  if (notOnOrOff.length > 0) problems.push(`Settings in api/.env that must be on or off: ${notOnOrOff.join(", ")}`);
  if (notAllowed.length > 0) problems.push(`Settings in api/.env with a value that isn't allowed: ${notAllowed.join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join(". "));

  return { apiToken, qbitApiKey, jellyfinApiKey, ntfyTopic, healthcheckUrl, deals, features };
}