export type Features = {
  alerts: boolean;
  heartbeat: boolean;
  dailySummary: boolean;
};

export type Config = {
  apiToken: string;
  qbitApiKey: string;
  jellyfinApiKey: string;
  ntfyTopic: string;
  healthcheckUrl: string;
  features: Features;
};

export function readConfig(env: Record<string, string | undefined>): Config {
  const missing: string[] = [];
  const notOnOrOff: string[] = [];

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

  const apiToken = read("API_TOKEN");
  const qbitApiKey = read("QBIT_API_KEY");
  const jellyfinApiKey = read("JELLYFIN_API_KEY");
  const features = {
    alerts: readSwitch("ALERTS"),
    heartbeat: readSwitch("HEARTBEAT"),
    dailySummary: readSwitch("DAILY_SUMMARY"),
  };
  const ntfyTopic = read("NTFY_TOPIC", features.alerts || features.dailySummary);
  const healthcheckUrl = read("HEALTHCHECK_URL", features.heartbeat);
  const problems: string[] = [];

  if (missing.length > 0) problems.push(`Missing settings in api/.env: ${missing.join(", ")}`);
  if (notOnOrOff.length > 0) problems.push(`Settings in api/.env that must be on or off: ${notOnOrOff.join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join(". "));
  
  return { apiToken, qbitApiKey, jellyfinApiKey, ntfyTopic, healthcheckUrl, features };
}