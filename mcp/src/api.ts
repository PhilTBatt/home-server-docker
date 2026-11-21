export const apiUrl = "http://api:3000";

export type ApiGet = (path: string) => Promise<unknown>;
export type ApiPost = (path: string) => Promise<unknown>;

async function saidWhy(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const error = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).error : undefined;
  if (typeof error !== "string") return "";
  const text = error.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return text === "" ? "" : `: ${text}`;
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
    if (!response.ok) throw new Error(`The API replied ${response.status} to ${path}${await saidWhy(response)}`);
    return response.json();
  };
}

export function createApiGet(token: string, timeoutMs = 10_000): ApiGet {
  return createApiRequest("GET", token, timeoutMs);
}

export function createApiPost(token: string, timeoutMs = 10_000): ApiPost {
  return createApiRequest("POST", token, timeoutMs);
}