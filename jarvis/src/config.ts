export type Config = {
  apiKey: string;
};

export function readConfig(env: Record<string, string | undefined>): Config {
  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  if (apiKey === "") throw new Error("Missing setting: ANTHROPIC_API_KEY");
  return { apiKey };
}