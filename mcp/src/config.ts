export type Config = {
  apiToken: string;
  actions: boolean;
  wallPages: boolean;
};

export function readConfig(env: Record<string, string | undefined>): Config {
  const apiToken = env.API_TOKEN ?? "";
  const actions = env.MCP_ACTIONS ?? "";
  const wallPages = env.MCP_WALL_PAGES?.trim() || "off";
  const problems: string[] = [];

  if (apiToken === "") problems.push("Missing setting: API_TOKEN");
  if (actions !== "on" && actions !== "off") problems.push("MCP_ACTIONS must be on or off");
  if (wallPages !== "on" && wallPages !== "off") problems.push("MCP_WALL_PAGES must be on or off");
  if (problems.length > 0) throw new Error(problems.join(". "));

  return { apiToken, actions: actions === "on", wallPages: wallPages === "on" };
}