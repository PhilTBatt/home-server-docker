export type Config = {
  apiToken: string;
  qbitApiKey: string;
  jellyfinApiKey: string;
  ntfyTopic: string;
  healthcheckUrl: string;
};

export function readConfig(env: Record<string, string | undefined>): Config {
  const missing: string[] = [];
  const read = (name: string): string => {
    const value = env[name] ?? "";
    if (value === "") {
      missing.push(name);
    }
    return value;
  };
  const config = {
    apiToken: read("API_TOKEN"),
    qbitApiKey: read("QBIT_API_KEY"),
    jellyfinApiKey: read("JELLYFIN_API_KEY"),
    ntfyTopic: read("NTFY_TOPIC"),
    healthcheckUrl: read("HEALTHCHECK_URL"),
  };
  if (missing.length > 0) {
    throw new Error(`Missing settings in api/.env: ${missing.join(", ")}`);
  }
  return config;
}