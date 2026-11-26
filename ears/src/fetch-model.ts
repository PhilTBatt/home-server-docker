import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const sileroUrl = "https://raw.githubusercontent.com/snakers4/silero-vad/5cd7945676eb32225748052e2e6a0580e4686a08/src/silero_vad/data/silero_vad.onnx";
export const sileroSha256 = "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3";
export const sileroBytes = 2_327_524;
export const voiceUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_CAM%2B%2B.onnx";
export const voiceSha256 = "7acd352a0372de23ce49379b02864833b7f3f501b4ea25248fc977389f08e5fc";
export const voiceBytes = 29_281_636;
export const fetchMs = 120_000;

export type Wanted = { url: string; sha256: string; bytes: number; what: string; from: string; redirects: boolean };

export const silero: Wanted = { url: sileroUrl, sha256: sileroSha256, bytes: sileroBytes, what: "the speech detector's model", from: "Silero published at that version", redirects: false };

export const voice: Wanted = { url: voiceUrl, sha256: voiceSha256, bytes: voiceBytes, what: "the voice model", from: "sherpa-onnx published with its speaker recognition models", redirects: true };

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function fetchModel(dest: string, wanted: Wanted = silero, get: typeof fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await get(wanted.url, { redirect: wanted.redirects ? "follow" : "error", signal: AbortSignal.timeout(fetchMs) });
  } catch (error) {
    throw new Error(`Couldn't download ${wanted.what} from ${wanted.url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Couldn't download ${wanted.what} from ${wanted.url}: it answered ${response.status}`);
  }
  if (response.url !== "" && new URL(response.url).protocol !== new URL(wanted.url).protocol) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Couldn't download ${wanted.what} from ${wanted.url}: it was sent on to an address that isn't ${new URL(wanted.url).protocol.replace(":", "").toUpperCase()}`);
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.length !== wanted.bytes) throw new Error(`${capital(wanted.what)} came back as ${body.length} bytes, not the ${wanted.bytes} it should be, so nothing was saved`);
  if (createHash("sha256").update(body).digest("hex") !== wanted.sha256) throw new Error(`${capital(wanted.what)} isn't the file ${wanted.from}, so nothing was saved`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, body, { mode: 0o644 });
}

export function modelNamed(name: string | undefined): Wanted {
  if (name === undefined || name === "silero") return silero;
  if (name === "voice") return voice;
  throw new Error(`There's no model called "${name}": it's silero or voice`);
}
