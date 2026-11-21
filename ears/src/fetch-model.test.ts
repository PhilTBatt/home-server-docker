import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fetchModel, fetchMs, silero, sileroBytes, sileroSha256, sileroUrl, type Wanted } from "./fetch-model.js";

const body = Buffer.from("a pretend model, nine words of it, and no more");
const wanted = (url: string, changes: Partial<Wanted> = {}): Wanted => ({ url, sha256: createHash("sha256").update(body).digest("hex"), bytes: body.length, ...changes });

async function serve(answer: (path: string) => { status: number; body?: Buffer; location?: string }) {
  const server: Server = createServer((request, response) => {
    const made = answer(request.url ?? "");
    response.writeHead(made.status, made.location === undefined ? {} : { location: made.location });
    response.end(made.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function scratch() {
  const folder = await mkdtemp(join(tmpdir(), "ears-model-"));
  return { folder, done: () => rm(folder, { recursive: true, force: true }) };
}

test("the model is Silero's own file at a fixed commit of its v6.2.3 release, over HTTPS, checked by size and SHA-256, with two minutes to come", () => {
  assert.equal(sileroUrl, "https://raw.githubusercontent.com/snakers4/silero-vad/5cd7945676eb32225748052e2e6a0580e4686a08/src/silero_vad/data/silero_vad.onnx");
  assert.deepEqual([sileroBytes, sileroSha256, fetchMs], [2_327_524, "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3", 120_000]);
  assert.deepEqual(silero, { url: sileroUrl, sha256: sileroSha256, bytes: sileroBytes });
});

test("a download of the right size and hash is saved where it's asked for, readable by everyone, making the folder, with nothing else left", { timeout: 10_000 }, async () => {
  const server = await serve(() => ({ status: 200, body }));
  const place = await scratch();
  try {
    const dest = join(place.folder, "models", "silero_vad.onnx");
    await fetchModel(dest, wanted(`${server.base}/m`));
    assert.deepEqual(await readFile(dest), body);
    assert.equal((await stat(dest)).mode & 0o777, 0o644);
    assert.deepEqual(await readdir(join(place.folder, "models")), ["silero_vad.onnx"]);
  } finally {
    await server.close();
    await place.done();
  }
});

test("a download of the wrong size or hash, an error answer, a redirect or no answer saves nothing, saying why", { timeout: 10_000 }, async () => {
  const server = await serve((path) => (path === "/missing" ? { status: 404 } : path === "/moved" ? { status: 302, location: "/m" } : { status: 200, body }));
  const place = await scratch();
  try {
    const dest = join(place.folder, "models", "silero_vad.onnx");
    const cases: [Wanted, RegExp][] = [
      [wanted(`${server.base}/m`, { bytes: body.length + 1 }), new RegExp(`^The speech detector's model came back as ${body.length} bytes, not the ${body.length + 1} it should be, so nothing was saved$`)],
      [wanted(`${server.base}/m`, { sha256: "0".repeat(64) }), /^The speech detector's model isn't the file Silero published at that version, so nothing was saved$/],
      [wanted(`${server.base}/missing`), /^Couldn't download the speech detector's model from http:\/\/127\.0\.0\.1:\d+\/missing: it answered 404$/],
      [wanted(`${server.base}/moved`), /^Couldn't download the speech detector's model from http:\/\/127\.0\.0\.1:\d+\/moved: /],
      [wanted("http://127.0.0.1:1/m"), /^Couldn't download the speech detector's model from http:\/\/127\.0\.0\.1:1\/m: /],
    ];
    for (const [asked, said] of cases) {
      await assert.rejects(fetchModel(dest, asked), { message: said }, asked.url);
      assert.equal(await readdir(place.folder).then((names) => names.join(",")), "", asked.url);
    }
  } finally {
    await server.close();
    await place.done();
  }
});

test("by default it asks for Silero's own file with fetch, refusing redirects and giving it two minutes", async () => {
  const asked: [string, RequestInit | undefined][] = [];
  const pretend: typeof fetch = async (url, init) => {
    asked.push([String(url), init]);
    return new Response("short", { status: 200 });
  };
  await assert.rejects(fetchModel("/nowhere/x.onnx", undefined, pretend), { message: /came back as 5 bytes/ });
  assert.equal(asked[0][0], sileroUrl);
  assert.equal(asked[0][1]?.redirect, "error");
  assert.ok(asked[0][1]?.signal instanceof AbortSignal);
});
