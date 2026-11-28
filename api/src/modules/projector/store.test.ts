import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPairingStore, mostPemChars, readPairing } from "./store.js";

const key = "-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n";
const cert = "-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----\n";
const pairedAt = "2026-11-28T09:00:00.000Z";

test("a pairing file must be exactly a key, a certificate and when it was paired", () => {
  assert.deepEqual(readPairing(JSON.stringify({ key, cert, pairedAt })), { key, cert, pairedAt });
  assert.equal(readPairing("not json"), null);
  assert.equal(readPairing(JSON.stringify([key, cert])), null);
  assert.equal(readPairing(JSON.stringify({ key, cert, pairedAt, extra: 1 })), null);
  assert.equal(readPairing(JSON.stringify({ key: cert, cert, pairedAt })), null, "the key must be a private key");
  assert.equal(readPairing(JSON.stringify({ key, cert: key, pairedAt })), null);
  assert.equal(readPairing(JSON.stringify({ key, cert, pairedAt: "yesterday" })), null);
  assert.equal(readPairing(JSON.stringify({ key: `-----BEGIN RSA PRIVATE KEY-----\n${"A".repeat(mostPemChars)}\n-----END RSA PRIVATE KEY-----\n`, cert, pairedAt })), null);
});

test("the pairing is saved readable only by the API, read back, and forgotten", async () => {
  const folder = await mkdtemp(join(tmpdir(), "projector-"));
  const store = createPairingStore(folder);
  assert.equal(await store.load(), "missing");
  await store.save({ key, cert, pairedAt });
  assert.equal((await stat(join(folder, "remote.json"))).mode & 0o777, 0o600);
  assert.deepEqual(await store.load(), { key, cert, pairedAt });
  await store.forget();
  assert.equal(await store.load(), "missing");
  await store.forget();
});

test("a pairing file that can't be read is moved aside, never lost or used", async () => {
  const folder = await mkdtemp(join(tmpdir(), "projector-"));
  await writeFile(join(folder, "remote.json"), "{ broken");
  const store = createPairingStore(folder, () => 1234);
  assert.equal(await store.load(), null);
  assert.deepEqual(await readdir(folder), ["remote.json.bad-1234"]);
  assert.equal(await readFile(join(folder, "remote.json.bad-1234"), "utf8"), "{ broken");
});

test("a pairing file that can't be opened at all is reported as such, and left where it is", { skip: process.getuid?.() === 0 ? "root can open any file" : false }, async () => {
  const folder = await mkdtemp(join(tmpdir(), "projector-"));
  await writeFile(join(folder, "remote.json"), JSON.stringify({ key, cert, pairedAt }), { mode: 0o000 });
  assert.equal(await createPairingStore(folder).load(), "unreadable");
  assert.deepEqual(await readdir(folder), ["remote.json"]);
});

test("a pairing is written readable only by the API even over an old half-written copy that anyone could read", async () => {
  const folder = await mkdtemp(join(tmpdir(), "projector-"));
  await writeFile(join(folder, "remote.json.saving"), "old", { mode: 0o644 });
  await createPairingStore(folder).save({ key, cert, pairedAt });
  assert.equal((await stat(join(folder, "remote.json"))).mode & 0o777, 0o600);
});

test("forget also removes copies moved aside and a half-written one, which may hold a usable key, and nothing else", async () => {
  const folder = await mkdtemp(join(tmpdir(), "projector-"));
  const store = createPairingStore(folder, () => 1234);
  await store.save({ key, cert, pairedAt });
  for (const name of ["remote.json.bad-1", "remote.json.bad-2", "remote.json.saving", "README.md"]) await writeFile(join(folder, name), "x");
  await store.forget();
  assert.deepEqual(await readdir(folder), ["README.md"]);
});
