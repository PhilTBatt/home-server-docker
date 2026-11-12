export async function sendHeartbeat(url: string, timeoutMs = 10_000): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const body = (await response.text()).trim();
  if (!response.ok || body !== "OK") {
    throw new Error(`Healthchecks replied ${response.status} ${body}`);
  }
}