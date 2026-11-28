import { chmod, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Pairing = { key: string; cert: string; pairedAt: string };

export type PairingStore = {
  load(): Promise<Pairing | "missing" | "unreadable" | null>;
  save(pairing: Pairing): Promise<void>;
  forget(): Promise<void>;
};

export const pairingFileName = "remote.json";
export const mostPemChars = 8_000;

const keyPem = /^-----BEGIN (RSA )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END (RSA )?PRIVATE KEY-----\r?\n?$/;
const certPem = /^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/;

export function readPairing(text: string): Pairing | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const fields = parsed as Record<string, unknown>;
  if (Object.keys(fields).sort().join(",") !== "cert,key,pairedAt") return null;
  const { key, cert, pairedAt } = fields;
  if (typeof key !== "string" || typeof cert !== "string" || typeof pairedAt !== "string") return null;
  if (key.length > mostPemChars || cert.length > mostPemChars || !keyPem.test(key) || !certPem.test(cert)) return null;
  if (Number.isNaN(Date.parse(pairedAt)) || new Date(pairedAt).toISOString() !== pairedAt) return null;
  return { key, cert, pairedAt };
}

export function createPairingStore(folder = "/projector", now: () => number = () => Date.now()): PairingStore {
  const file = join(folder, pairingFileName);
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
        return "unreadable";
      }
      const pairing = readPairing(text);
      if (pairing === null) await rename(file, `${file}.bad-${now()}`).catch(() => {});
      return pairing;
    },
    async save(pairing) {
      const saving = `${file}.saving`;
      await writeFile(saving, `${JSON.stringify(pairing, null, 2)}\n`, { mode: 0o600 });
      await chmod(saving, 0o600);
      await rename(saving, file);
    },
    async forget() {
      await rm(file, { force: true });
      const names = await readdir(folder).catch(() => [] as string[]);
      for (const name of names) if (name.startsWith(`${pairingFileName}.bad-`) || name === `${pairingFileName}.saving`) await rm(join(folder, name), { force: true });
    },
  };
}
