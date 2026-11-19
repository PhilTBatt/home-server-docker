import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, mock, test } from "node:test";
import { createKokoro, kokoroCheckMs, kokoroModel, kokoroName, kokoroRate, kokoroSpeakMs, kokoroUrl, speechRequest } from "./kokoro.js";

type Asked = { method: string; path: string; type: string | undefined; body: string };

const servers: Server[] = [];
after(() => {
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
});

async function standIn(answer: (asked: Asked, response: ServerResponse, request: IncomingMessage) => void): Promise<{ url: string; asked: Asked[] }> {
  const asked: Asked[] = [];
  const server = createServer((request, response) => {
    const parts: Buffer[] = [];
    request.on("data", (part: Buffer) => parts.push(part));
    request.on("end", () => {
      const seen = { method: request.method ?? "", path: request.url ?? "", type: request.headers["content-type"], body: Buffer.concat(parts).toString("utf8") };
      asked.push(seen);
      answer(seen, response, request);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked };
}

function sound(response: ServerResponse, bytes: number[] | Uint8Array, type = "audio/pcm"): void {
  response.writeHead(200, { "content-type": type });
  response.end(Buffer.from(bytes));
}

async function* pieces(...texts: string[]): AsyncGenerator<string> {
  for (const text of texts) yield text;
}

async function heard(spoken: AsyncIterable<Uint8Array>): Promise<number[][]> {
  const all: number[][] = [];
  for await (const part of spoken) all.push([...part]);
  return all;
}

const never = new AbortController().signal;

async function until(met: () => boolean, what: string, ms = 5000): Promise<void> {
  const started = performance.now();
  while (!met()) {
    if (performance.now() - started > ms) throw new Error(`Still waiting after ${ms} ms for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function within<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Still waiting after ${ms} ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

test("Kokoro is asked at its service name inside Docker, for raw sound at 24,000 Hz, and Jarvis finds the sentence ends", () => {
  assert.equal(kokoroName, "Kokoro");
  assert.equal(kokoroUrl, "http://kokoro:8880");
  assert.equal(kokoroRate, 24_000);
  assert.equal(kokoroModel, "kokoro");
  assert.equal(kokoroSpeakMs, 30_000);
  assert.equal(kokoroCheckMs, 3_000);
  const engine = createKokoro({ voice: "bm_george" });
  assert.deepEqual([engine.name, engine.sampleRate, engine.splitsSentences], ["Kokoro", 24_000, false]);
});

test("a piece of speech is asked for as raw PCM, never MP3, all in one reply, in the chosen voice", () => {
  assert.equal(speechRequest("Hello there.", "bm_george"), '{"model":"kokoro","input":"Hello there.","voice":"bm_george","speed":1,"response_format":"pcm","stream":false}');
  assert.equal(JSON.parse(speechRequest("Hello there.", "bm_george", 0.9)).speed, 0.9);
  assert.deepEqual(JSON.parse(speechRequest('He said "hi"\nthen left.', "bm_fable(2)+bm_george(1)")), { model: "kokoro", input: 'He said "hi"\nthen left.', voice: "bm_fable(2)+bm_george(1)", speed: 1, response_format: "pcm", stream: false });
});

test("speaking posts the text to Kokoro's speech route as JSON and passes back the sound it returns", async () => {
  const kokoro = await standIn((_asked, response) => sound(response, [1, 2, 3, 4, 5, 6]));
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url });
  assert.deepEqual(await heard(engine.speak(pieces("Hello there."), never)), [[1, 2, 3, 4, 5, 6]]);
  assert.deepEqual(kokoro.asked, [{ method: "POST", path: "/v1/audio/speech", type: "application/json", body: speechRequest("Hello there.", "bm_george") }]);
});

test("the speed asked for is the one the engine was made with, and Kokoro's usual 1 without one", async () => {
  const kokoro = await standIn((_asked, response) => sound(response, [1, 2]));
  await heard(createKokoro({ voice: "bm_george", speed: 0.9, url: kokoro.url }).speak(pieces("One."), never));
  await heard(createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("Two."), never));
  assert.deepEqual(kokoro.asked.map((asked) => JSON.parse(asked.body).speed), [0.9, 1]);
});

test("the voice asked for is the one the engine was made with, not a fixed one", async () => {
  const kokoro = await standIn((_asked, response) => sound(response, [1, 2]));
  await heard(createKokoro({ voice: "bm_fable", url: kokoro.url }).speak(pieces("One."), never));
  await heard(createKokoro({ voice: "bm_lewis(2)+bm_daniel(1)", url: kokoro.url }).speak(pieces("Two."), never));
  assert.deepEqual(
    kokoro.asked.map((asked) => (JSON.parse(asked.body) as { voice: string }).voice),
    ["bm_fable", "bm_lewis(2)+bm_daniel(1)"],
  );
});

test("each piece of text is its own request, in order, and the next isn't asked for until the one before has been taken", async () => {
  const kokoro = await standIn((asked, response) => sound(response, (JSON.parse(asked.body) as { input: string }).input === "One." ? [1, 1] : [2, 2, 2, 2]));
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url });
  const spoken = engine.speak(pieces("One.", "Two."), never)[Symbol.asyncIterator]();
  assert.deepEqual([...((await spoken.next()).value as Uint8Array)], [1, 1]);
  assert.equal(kokoro.asked.length, 1);
  assert.deepEqual([...((await spoken.next()).value as Uint8Array)], [2, 2, 2, 2]);
  assert.equal((await spoken.next()).done, true);
  assert.deepEqual(
    kokoro.asked.map((asked) => (JSON.parse(asked.body) as { input: string }).input),
    ["One.", "Two."],
  );
});

test("space around a piece is trimmed, and a piece with nothing in it isn't sent at all", async () => {
  const kokoro = await standIn((_asked, response) => sound(response, [7, 7]));
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url });
  assert.deepEqual(await heard(engine.speak(pieces("", "  \n\t ", "  Hello.  \n", " "), never)), [[7, 7]]);
  assert.deepEqual(
    kokoro.asked.map((asked) => (JSON.parse(asked.body) as { input: string }).input),
    ["Hello."],
  );
  assert.deepEqual(await heard(engine.speak(pieces(), never)), []);
  assert.equal(kokoro.asked.length, 1);
});

test("a reply that ends halfway through a 16-bit sample loses the odd byte, so the next piece still starts on a whole sample", async () => {
  let replies = 0;
  const kokoro = await standIn((_asked, response) => sound(response, ++replies === 1 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9]));
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url });
  assert.deepEqual(await heard(engine.speak(pieces("One.", "Two."), never)), [
    [1, 2, 3, 4],
    [6, 7, 8, 9],
  ]);
});

test("a large reply comes through whole and unchanged", async () => {
  const big = Uint8Array.from({ length: 480_000 }, (_unused, index) => (index * 7) % 256);
  const kokoro = await standIn((_asked, response) => sound(response, big));
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url });
  const parts: Uint8Array[] = [];
  for await (const part of engine.speak(pieces("A long sentence."), never)) parts.push(part);
  assert.equal(parts.length, 1);
  assert.deepEqual(Buffer.from(parts[0]), Buffer.from(big));
});

test("a reply with no sound in it, or only half a sample, is an error and not silence", async () => {
  for (const bytes of [[], [9]]) {
    const kokoro = await standIn((_asked, response) => sound(response, bytes));
    await assert.rejects(heard(createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("Hello."), never)), { message: "Kokoro sent no sound" });
  }
});

test("Kokoro's raw sound type is accepted with or without extras, in any case, and nothing else is taken for sound", async () => {
  for (const type of ["audio/pcm", "audio/pcm; rate=24000", "Audio/PCM", "audio/pcm;codec=s16le", "audio/pcm ; rate=24000"]) {
    const kokoro = await standIn((_asked, response) => sound(response, [1, 2], type));
    assert.deepEqual(await heard(createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("Hello."), never)), [[1, 2]]);
  }
  for (const type of ["audio/mpeg", "audio/wav", "audio/pcmu", "audio/pcm-x", "audio/pcm.wav", "text/html", "application/json", "xaudio/pcm"]) {
    const kokoro = await standIn((_asked, response) => sound(response, [1, 2], type));
    await assert.rejects(heard(createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("Hello."), never)), { message: `Kokoro sent ${type}, not raw sound` });
  }
  const untyped = await standIn((_asked, response) => {
    response.writeHead(200);
    response.end(Buffer.from([1, 2]));
  });
  await assert.rejects(heard(createKokoro({ voice: "bm_george", url: untyped.url }).speak(pieces("Hello."), never)), { message: "Kokoro sent something with no type, not raw sound" });
});

test("a reply of the wrong type is dropped there and then, not left arriving", async () => {
  let closed = false;
  const kokoro = await standIn((_asked, response, request) => {
    request.socket.on("close", () => (closed = true));
    response.writeHead(200, { "content-type": "audio/mpeg", "content-length": "5000000" });
    response.write(Buffer.alloc(1000));
  });
  await assert.rejects(within(heard(createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("Hello."), never))), { message: "Kokoro sent audio/mpeg, not raw sound" });
  await until(() => closed, "the connection to be dropped", 2000);
});

test("when Kokoro refuses, its own reason is passed on, tidied and cut short", async () => {
  const refuse = (status: number, body: string, type = "application/json") =>
    standIn((_asked, response) => {
      response.writeHead(status, { "content-type": type });
      response.end(body);
    });
  const said = async (kokoro: { url: string }) => {
    try {
      await heard(createKokoro({ voice: "bm_nobody", url: kokoro.url }).speak(pieces("Hello."), never));
    } catch (error) {
      return (error as Error).message;
    }
    return "no error";
  };
  assert.equal(await said(await refuse(400, JSON.stringify({ detail: { error: "validation_error", message: "Voice 'bm_nobody' not found. Available voices: af_heart, bm_george", type: "invalid_request_error" } }))), "Kokoro replied 400: Voice 'bm_nobody' not found. Available voices: af_heart, bm_george");
  assert.equal(await said(await refuse(503, JSON.stringify({ detail: "Model is still loading" }))), "Kokoro replied 503: Model is still loading");
  assert.equal(await said(await refuse(422, JSON.stringify({ detail: [{ loc: ["body", "input"], msg: "Field required" }] }))), "Kokoro replied 422");
  assert.equal(await said(await refuse(500, "Internal Server Error", "text/plain")), "Kokoro replied 500");
  assert.equal(await said(await refuse(500, JSON.stringify({ detail: { message: 42 } }))), "Kokoro replied 500");
  assert.equal(await said(await refuse(500, "null")), "Kokoro replied 500");
  assert.equal(await said(await refuse(404, JSON.stringify({ detail: { message: "line one\n\u001b[31mline two\u0007" } }))), "Kokoro replied 404: line one [31mline two");
  const long = await said(await refuse(400, JSON.stringify({ detail: { message: `Voice not found. Available voices: ${"bm_george, ".repeat(100)}` } })));
  assert.equal(long.length, "Kokoro replied 400: ".length + 300);
  assert.ok(long.endsWith("…"));
});

test("a refusal whose reason never finishes arriving is given up on at the time limit, cut off still says which status it was, and called off comes back as the caller's reason", async () => {
  const stalls = await standIn((_asked, response) => {
    response.writeHead(500, { "content-type": "application/json", "content-length": "1000" });
    response.write('{"detail":');
  });
  await assert.rejects(within(heard(createKokoro({ voice: "bm_george", url: stalls.url, speakMs: 150 }).speak(pieces("Hello."), never))), { message: "Kokoro took longer than 0.15 seconds over one piece of speech" });
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const speaking = heard(createKokoro({ voice: "bm_george", url: stalls.url }).speak(pieces("Hello."), stop.signal));
  await until(() => stalls.asked.length >= 2, "the second request to be asked");
  await new Promise((resolve) => setTimeout(resolve, 50));
  stop.abort(why);
  await assert.rejects(within(speaking), (error: unknown) => error === why);
  const drops = await standIn((_asked, response) => {
    response.writeHead(500, { "content-type": "application/json", "content-length": "1000" });
    response.write('{"detail":', () => response.destroy());
  });
  await assert.rejects(within(heard(createKokoro({ voice: "bm_george", url: drops.url }).speak(pieces("Hello."), never))), { message: "Kokoro replied 500, and its reason was cut off part-way" });
});

test("a refusal stops the speech there, and later pieces aren't asked for", async () => {
  const kokoro = await standIn((_asked, response) => {
    response.writeHead(500);
    response.end();
  });
  await assert.rejects(heard(createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("One.", "Two.", "Three."), never)), { message: "Kokoro replied 500" });
  assert.equal(kokoro.asked.length, 1);
});

test("if nothing is listening where Kokoro should be, the error says where it looked and why", async () => {
  const closed = await standIn(() => {});
  const server = servers[servers.length - 1];
  await new Promise((resolve) => server.close(resolve));
  const engine = createKokoro({ voice: "bm_george", url: closed.url });
  await assert.rejects(heard(engine.speak(pieces("Hello."), never)), { message: `Couldn't reach Kokoro at ${closed.url} (ECONNREFUSED)` });
  await assert.rejects(engine.check(never), { message: `Couldn't reach Kokoro at ${closed.url} (ECONNREFUSED)` });
});

test("the reason a request failed is shown only when it's a plain error code", async (context) => {
  const failing = (cause: unknown) =>
    context.mock.method(globalThis, "fetch", async () => {
      throw Object.assign(new TypeError("fetch failed"), cause === undefined ? {} : { cause });
    });
  const engine = createKokoro({ voice: "bm_george" });
  for (const [cause, ending] of [
    [{ code: "ENOTFOUND" }, " (ENOTFOUND)"],
    [{ code: "EAI_AGAIN" }, " (EAI_AGAIN)"],
    [{ code: "not a code\u001b[31m" }, ""],
    [{ code: 111 }, ""],
    [{ code: "E".repeat(41) }, ""],
    [{}, ""],
    ["a string", ""],
    [null, ""],
    [undefined, ""],
  ] as const) {
    const fake = failing(cause);
    await assert.rejects(engine.check(never), { message: `Couldn't reach Kokoro at http://kokoro:8880${ending}` });
    await assert.rejects(heard(engine.speak(pieces("Hello."), never)), { message: `Couldn't reach Kokoro at http://kokoro:8880${ending}` });
    fake.mock.restore();
  }
});

test("unless told otherwise, both requests go to Kokoro's own address, refuse to follow a redirect, and can be called off", async (context) => {
  const calls: { url: string; method: string | undefined; redirect: string | undefined; signal: boolean }[] = [];
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit = {}) => {
    calls.push({ url, method: options.method, redirect: options.redirect, signal: options.signal instanceof AbortSignal });
    return url.endsWith("/health") ? Response.json({ status: "healthy" }) : new Response(Uint8Array.of(1, 2), { headers: { "content-type": "audio/pcm" } });
  });
  const engine = createKokoro({ voice: "bm_george" });
  await engine.check(never);
  assert.deepEqual(await heard(engine.speak(pieces("Hello."), never)), [[1, 2]]);
  assert.deepEqual(calls, [
    { url: "http://kokoro:8880/health", method: undefined, redirect: "error", signal: true },
    { url: "http://kokoro:8880/v1/audio/speech", method: "POST", redirect: "error", signal: true },
  ]);
});

test("a redirect is refused, not followed, for speech and for the check", async () => {
  const elsewhere = await standIn((asked, response) => (asked.path === "/health" ? response.end(JSON.stringify({ status: "healthy" })) : sound(response, [1, 2])));
  const kokoro = await standIn((asked, response) => {
    response.writeHead(307, { location: `${elsewhere.url}${asked.path}` });
    response.end();
  });
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url });
  await assert.rejects(heard(engine.speak(pieces("Hello."), never)), { message: `Couldn't reach Kokoro at ${kokoro.url}` });
  await assert.rejects(engine.check(never), { message: `Couldn't reach Kokoro at ${kokoro.url}` });
  assert.equal(kokoro.asked.length, 2);
  assert.deepEqual(elsewhere.asked, []);
});

test("a Kokoro that takes too long over a piece is given up on, with the limit named", async () => {
  const silent = await standIn(() => {});
  const started = performance.now();
  await assert.rejects(within(heard(createKokoro({ voice: "bm_george", url: silent.url, speakMs: 150 }).speak(pieces("Hello."), never))), { message: "Kokoro took longer than 0.15 seconds over one piece of speech" });
  assert.ok(performance.now() - started < 5000);
  const stalls = await standIn((_asked, response) => {
    response.writeHead(200, { "content-type": "audio/pcm", "content-length": "1000" });
    response.write(Buffer.from([1, 2, 3, 4]));
  });
  await assert.rejects(within(heard(createKokoro({ voice: "bm_george", url: stalls.url, speakMs: 150 }).speak(pieces("Hello."), never))), { message: "Kokoro took longer than 0.15 seconds over one piece of speech" });
});

test("the time limit is for each piece on its own, not for the whole speech, and not for however long the listener takes", async () => {
  const kokoro = await standIn((_asked, response) => setTimeout(() => sound(response, [1, 2]), 60));
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url, speakMs: 250 });
  const all: number[][] = [];
  for await (const part of engine.speak(pieces("One.", "Two.", "Three.", "Four."), never)) {
    all.push([...part]);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.deepEqual(all, [
    [1, 2],
    [1, 2],
    [1, 2],
    [1, 2],
  ]);
});

test("speech and the check each keep to their own time limit, not the other's", async () => {
  const slow = await standIn((asked, response) =>
    setTimeout(() => {
      if (asked.path === "/health") response.end(JSON.stringify({ status: "healthy" }));
      else sound(response, [1, 2]);
    }, 200),
  );
  const patientSpeech = createKokoro({ voice: "bm_george", url: slow.url, speakMs: 2000, checkMs: 50 });
  assert.deepEqual(await within(heard(patientSpeech.speak(pieces("Hello."), never))), [[1, 2]]);
  await assert.rejects(within(patientSpeech.check(never)), { message: "Kokoro didn't answer within 0.05 seconds" });
  const patientCheck = createKokoro({ voice: "bm_george", url: slow.url, speakMs: 50, checkMs: 2000 });
  await within(patientCheck.check(never));
  await assert.rejects(within(heard(patientCheck.speak(pieces("Hello."), never))), { message: "Kokoro took longer than 0.05 seconds over one piece of speech" });
});

test("a reply that's cut off part-way is an error, and none of it is passed on", async () => {
  const kokoro = await standIn((_asked, response) => {
    response.writeHead(200, { "content-type": "audio/pcm", "content-length": "1000" });
    response.write(Buffer.from([1, 2, 3, 4]), () => response.destroy());
  });
  const parts: Uint8Array[] = [];
  await assert.rejects(
    (async () => {
      for await (const part of createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("Hello."), never)) parts.push(part);
    })(),
    { message: "Kokoro's reply was cut off part-way" },
  );
  assert.deepEqual(parts, []);
});

test("speech that's called off stops with the caller's own reason, at once, and asks for nothing more", async () => {
  const kokoro = await standIn((asked, response) => {
    if ((JSON.parse(asked.body) as { input: string }).input === "One.") sound(response, [1, 2]);
  });
  const engine = createKokoro({ voice: "bm_george", url: kokoro.url });
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const all: number[][] = [];
  const speaking = (async () => {
    for await (const part of engine.speak(pieces("One.", "Two.", "Three."), stop.signal)) all.push([...part]);
  })();
  await until(() => kokoro.asked.length >= 2, "the second piece to be asked for");
  const started = performance.now();
  stop.abort(why);
  await assert.rejects(within(speaking), (error: unknown) => error === why);
  assert.ok(performance.now() - started < 2000);
  assert.deepEqual(all, [[1, 2]]);
  assert.equal(kokoro.asked.length, 2);
  const already = new AbortController();
  already.abort(why);
  await assert.rejects(within(heard(engine.speak(pieces("Four."), already.signal))), (error: unknown) => error === why);
  assert.equal(kokoro.asked.length, 2);
});

test("speech called off while the reply is still arriving stops with the caller's reason, not a cut-off error", async () => {
  const kokoro = await standIn((_asked, response) => {
    response.writeHead(200, { "content-type": "audio/pcm", "content-length": "1000" });
    response.write(Buffer.from([1, 2, 3, 4]));
  });
  const stop = new AbortController();
  const why = new Error("stopped");
  const speaking = heard(createKokoro({ voice: "bm_george", url: kokoro.url }).speak(pieces("Hello."), stop.signal));
  await until(() => kokoro.asked.length >= 1, "the piece to be asked for");
  await new Promise((resolve) => setTimeout(resolve, 50));
  stop.abort(why);
  await assert.rejects(within(speaking), (error: unknown) => error === why);
});

test("the check asks Kokoro's health route and passes only on its own healthy answer", async () => {
  const kokoro = await standIn((_asked, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "healthy" }));
  });
  await createKokoro({ voice: "bm_george", url: kokoro.url }).check(never);
  assert.deepEqual(kokoro.asked, [{ method: "GET", path: "/health", type: undefined, body: "" }]);
});

test("the check fails, saying how, when Kokoro answers with an error or something else answers in its place", async () => {
  const answering = (status: number, body: string) =>
    standIn((_asked, response) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(body);
    });
  for (const status of [500, 503, 404, 401]) {
    const kokoro = await answering(status, JSON.stringify({ status: "healthy" }));
    await assert.rejects(createKokoro({ voice: "bm_george", url: kokoro.url }).check(never), { message: `Kokoro replied ${status} when asked if it's ready` });
  }
  for (const body of [JSON.stringify({ status: "starting" }), JSON.stringify({ ok: true }), JSON.stringify(["healthy"]), '"healthy"', "null", "<html>hello</html>", ""]) {
    const other = await answering(200, body);
    await assert.rejects(createKokoro({ voice: "bm_george", url: other.url }).check(never), { message: `Something answered at ${other.url}, but not as Kokoro does` });
  }
});

test("a check whose answer never finishes arriving is given up on at its limit, cut off is reported as cut off, and called off comes back as the caller's reason", async () => {
  const stalls = await standIn((_asked, response) => {
    response.writeHead(200, { "content-type": "application/json", "content-length": "1000" });
    response.write('{"status":');
  });
  await assert.rejects(within(createKokoro({ voice: "bm_george", url: stalls.url, checkMs: 150 }).check(never)), { message: "Kokoro didn't answer within 0.15 seconds" });
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const checking = createKokoro({ voice: "bm_george", url: stalls.url }).check(stop.signal);
  await until(() => stalls.asked.length >= 2, "the second check to be asked");
  await new Promise((resolve) => setTimeout(resolve, 50));
  stop.abort(why);
  await assert.rejects(within(checking), (error: unknown) => error === why);
  const drops = await standIn((_asked, response) => {
    response.writeHead(200, { "content-type": "application/json", "content-length": "1000" });
    response.write('{"status":', () => response.destroy());
  });
  await assert.rejects(within(createKokoro({ voice: "bm_george", url: drops.url }).check(never)), { message: "Kokoro's reply was cut off part-way" });
});

test("a check answered with an error status says so straight away, without waiting for the rest of the reply", async () => {
  let closed = false;
  const kokoro = await standIn((_asked, response, request) => {
    request.socket.on("close", () => (closed = true));
    response.writeHead(503, { "content-type": "application/json", "content-length": "1000" });
    response.write('{"detail":');
  });
  const started = performance.now();
  await assert.rejects(within(createKokoro({ voice: "bm_george", url: kokoro.url, checkMs: 4000 }).check(never)), { message: "Kokoro replied 503 when asked if it's ready" });
  assert.ok(performance.now() - started < 2000);
  await until(() => closed, "the connection to be dropped", 2000);
});

test("a check that gets no answer gives up after its own short limit, and one that's called off stops with the caller's reason", async () => {
  const silent = await standIn(() => {});
  const engine = createKokoro({ voice: "bm_george", url: silent.url, checkMs: 150, speakMs: 60_000 });
  const started = performance.now();
  await assert.rejects(within(engine.check(never)), { message: "Kokoro didn't answer within 0.15 seconds" });
  assert.ok(performance.now() - started < 5000);
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const checking = createKokoro({ voice: "bm_george", url: silent.url }).check(stop.signal);
  await until(() => silent.asked.length >= 2, "the second check to be asked");
  stop.abort(why);
  await assert.rejects(within(checking), (error: unknown) => error === why);
});
