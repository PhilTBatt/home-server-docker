export const apiUrl = "http://api:3000";

export type ApiGet = (path: string) => Promise<unknown>;
export type ApiPost = (path: string) => Promise<unknown>;

export function readToken(env: Record<string, string | undefined>): string {
  const token = env.API_TOKEN ?? "";
  if (token === "") throw new Error("Missing setting: API_TOKEN");
  return token;
}

function createApiRequest(method: "GET" | "POST", token: string, timeoutMs: number) {
  return async (path: string): Promise<unknown> => {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((error: Error) => {
      throw new Error(error.name === "TimeoutError" ? "The API didn't answer in time" : "Couldn't reach the API");
    });
    if (!response.ok) throw new Error(`The API replied ${response.status} to ${path}`);
    return response.json();
  };
}

export function createApiGet(token: string, timeoutMs = 10_000): ApiGet {
  return createApiRequest("GET", token, timeoutMs);
}

export function createApiPost(token: string, timeoutMs = 10_000): ApiPost {
  return createApiRequest("POST", token, timeoutMs);
}