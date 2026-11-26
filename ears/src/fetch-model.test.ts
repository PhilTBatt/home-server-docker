import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fetchModel, fetchMs, modelNamed, silero, sileroBytes, sileroSha256, sileroUrl, voice, voiceBytes, voiceSha256, voiceUrl, type Wanted } from "./fetch-model.js";

const body = Buffer.from("a pretend model, nine words of it, and no more");
const wanted = (url: string, changes: Partial<Wanted> = {}): Wanted => ({ url, sha256: createHash("sha256").update(body).digest("hex"), bytes: body.length, what: silero.what, from: silero.from, redirects: false, ...changes });

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
  assert.deepEqual(silero, { url: sileroUrl, sha256: sileroSha256, bytes: sileroBytes, what: "the speech detector's model", from: "Silero published at that version", redirects: false });
});

test("the voice model is WeSpeaker's CAM++ for English from sherpa-onnx's speaker recognition release on GitHub, over HTTPS, checked by size and SHA-256, following GitHub's redirect to where it keeps the file", () => {
  assert.equal(voiceUrl, "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_CAM%2B%2B.onnx");
  assert.deepEqual([voiceBytes, voiceSha256], [29_281_636, "7acd352a0372de23ce49379b02864833b7f3f501b4ea25248fc977389f08e5fc"]);
  assert.deepEqual(voice, { url: voiceUrl, sha256: voiceSha256, bytes: voiceBytes, what: "the voice model", from: "sherpa-onnx published with its speaker recognition models", redirects: true });
});

test("the model to fetch is Silero's unless the voice model is named, and any other name is refused", () => {
  assert.equal(modelNamed(undefined), silero);
  assert.equal(modelNamed("silero"), silero);
  assert.equal(modelNamed("voice"), voice);
  for (const name of ["", "Voice", "cam++", "voice "]) assert.throws(() => modelNamed(name), { message: `There's no model called "${name}": it's silero or voice` }, name);
});

test("a model that may be redirected follows it and is still checked, and says what it is when it fails", { timeout: 10_000 }, async () => {
  const server = await serve((path) => (path === "/moved" ? { status: 302, location: "/m" } : { status: 200, body }));
  const place = await scratch();
  try {
    const dest = join(place.folder, "voice-id.onnx");
    await fetchModel(dest, wanted(`${server.base}/moved`, { redirects: true, what: "the voice model" }));
    assert.deepEqual(await readFile(dest), body);
    await rm(dest);
    await assert.rejects(fetchModel(dest, wanted(`${server.base}/moved`, { redirects: true, what: "the voice model", from: "sherpa-onnx published", sha256: "1".repeat(64) })), { message: "The voice model isn't the file sherpa-onnx published, so nothing was saved" });
    assert.deepEqual(await readdir(place.folder), []);
  } finally {
    await server.close();
    await place.done();
  }
});

test("a redirect that leaves HTTPS for plain HTTP is refused, and nothing is saved", { timeout: 10_000 }, async () => {
  const place = await scratch();
  let cancelled = false;
  const pretend: typeof fetch = async () => {
    const answer = new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), { status: 200 });
    Object.defineProperty(answer, "url", { value: "http://example.com/elsewhere" });
    return answer;
  };
  try {
    await assert.rejects(fetchModel(join(place.folder, "m.onnx"), wanted("https://example.com/m", { redirects: true, what: "the voice model" }), pretend), { message: "Couldn't download the voice model from https://example.com/m: it was sent on to an address that isn't HTTPS" });
    assert.equal(cancelled, true);
    assert.deepEqual(await readdir(place.folder), []);
  } finally {
    await place.done();
  }
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
  await assert.rejects(fetchModel("/nowhere/x.onnx", voice, pretend), { message: "The voice model came back as 5 bytes, not the 29281636 it should be, so nothing was saved" });
  assert.equal(asked[1][0], voiceUrl);
  assert.equal(asked[1][1]?.redirect, "follow");
});
