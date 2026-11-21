import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const sileroUrl = "https://raw.githubusercontent.com/snakers4/silero-vad/5cd7945676eb32225748052e2e6a0580e4686a08/src/silero_vad/data/silero_vad.onnx";
export const sileroSha256 = "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3";
export const sileroBytes = 2_327_524;
export const fetchMs = 120_000;

export type Wanted = { url: string; sha256: string; bytes: number };

export const silero: Wanted = { url: sileroUrl, sha256: sileroSha256, bytes: sileroBytes };

export async function fetchModel(dest: string, wanted: Wanted = silero, get: typeof fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await get(wanted.url, { redirect: "error", signal: AbortSignal.timeout(fetchMs) });
  } catch (error) {
    throw new Error(`Couldn't download the speech detector's model from ${wanted.url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Couldn't download the speech detector's model from ${wanted.url}: it answered ${response.status}`);
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.length !== wanted.bytes) throw new Error(`The speech detector's model came back as ${body.length} bytes, not the ${wanted.bytes} it should be, so nothing was saved`);
  if (createHash("sha256").update(body).digest("hex") !== wanted.sha256) throw new Error("The speech detector's model isn't the file Silero published at that version, so nothing was saved");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, body, { mode: 0o644 });
}
