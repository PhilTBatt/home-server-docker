export const brainDir = "/brain";

export const engines = ["sdk", "api"] as const;
export type Engine = (typeof engines)[number];

export type Config = {
  apiKey: string;
  engine: Engine;
};

function isEngine(value: string): value is Engine {
  return (engines as readonly string[]).includes(value);
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  if (apiKey === "") throw new Error("Missing setting: ANTHROPIC_API_KEY");
  const engine = env.JARVIS_ENGINE?.trim() || "sdk";
  if (!isEngine(engine)) throw new Error(`JARVIS_ENGINE must be sdk or api, not "${engine}"`);
  return { apiKey, engine };
}