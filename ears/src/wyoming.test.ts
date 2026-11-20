import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventReader, encodeEvent, wyomingLimits, type WyomingEvent } from "./wyoming.js";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bytes = (value: string) => new TextEncoder().encode(value);

function joined(...parts: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

function readAll(stream: Uint8Array, cuts: number[]): WyomingEvent[] {
  const reader = createEventReader();
  const events: WyomingEvent[] = [];
  let from = 0;
  for (const cut of [...cuts, stream.length]) {
    events.push(...reader.push(stream.subarray(from, cut)));
    from = cut;
  }
  reader.end();
  return events;
}

const sound = Uint8Array.from({ length: 3200 }, (_unused, index) => (index * 7) % 256);
const synthesize: WyomingEvent = { type: "synthesize", data: { text: "Café, I said ✓\nthen left.", voice: { name: "en_GB-alan-medium" } }, payload: null };
const start: WyomingEvent = { type: "audio-start", data: { rate: 22050, width: 2, channels: 1 }, payload: null };
const chunk: WyomingEvent = { type: "audio-chunk", data: { rate: 22050, width: 2, channels: 1 }, payload: sound };
const stop: WyomingEvent = { type: "audio-stop", data: {}, payload: null };
const stream = joined(...[synthesize, start, chunk, stop].map(encodeEvent));

test("the reader's limits are 64 KiB for a header, 4 MiB of data and 16 MiB of payload", () => {
  assert.deepEqual(wyomingLimits, { headerBytes: 65_536, dataBytes: 4_194_304, payloadBytes: 16_777_216 });
});

test("a message is a one-line JSON header, then its data as JSON, then its payload, with both lengths in bytes", () => {
  const message = encodeEvent({ type: "audio-chunk", data: { rate: 22050, width: 2, channels: 1 }, payload: Uint8Array.of(1, 2, 3, 4) });
  const data = '{"rate":22050,"width":2,"channels":1}';
  assert.equal(text(message.subarray(0, message.indexOf(10) + 1)), `{"type":"audio-chunk","data_length":${data.length},"payload_length":4}\n`);
  assert.equal(text(message.subarray(message.indexOf(10) + 1, message.length - 4)), data);
  assert.deepEqual([...message.subarray(message.length - 4)], [1, 2, 3, 4]);
});

test("lengths count bytes, not characters, and a new line in the text never breaks the header's one line", () => {
  const message = encodeEvent(synthesize);
  const data = bytes(JSON.stringify(synthesize.data));
  assert.ok(data.length > JSON.stringify(synthesize.data).length);
  assert.equal(text(message.subarray(0, message.indexOf(10) + 1)), `{"type":"synthesize","data_length":${data.length}}\n`);
  assert.equal(message.length, message.indexOf(10) + 1 + data.length);
  assert.equal(message.filter((byte) => byte === 10).length, 1);
});

test("a message with no data and no payload is the header alone, and an empty payload counts as none", () => {
  assert.equal(text(encodeEvent({ type: "describe", data: {}, payload: null })), '{"type":"describe"}\n');
  assert.equal(text(encodeEvent({ type: "audio-stop", data: {}, payload: new Uint8Array(0) })), '{"type":"audio-stop"}\n');
  assert.throws(() => encodeEvent({ type: "", data: {}, payload: null }), { message: "A Wyoming message needs a type" });
});

test("messages read back exactly as they were written, all at once", () => {
  assert.deepEqual(readAll(stream, []), [synthesize, start, chunk, stop]);
});

test("however the bytes are split across reads, at every single point, the same messages come out", () => {
  for (let cut = 0; cut <= stream.length; cut++) assert.deepEqual(readAll(stream, [cut]), [synthesize, start, chunk, stop], `cut at ${cut}`);
});

test("byte by byte, and in uneven pieces, the same messages come out, each as soon as its last byte arrives", () => {
  const reader = createEventReader();
  const seen: [number, string][] = [];
  for (let at = 0; at < stream.length; at++) for (const event of reader.push(stream.subarray(at, at + 1))) seen.push([at + 1, event.type]);
  const ends = [synthesize, start, chunk, stop].map(encodeEvent).reduce<number[]>((all, message) => [...all, (all.at(-1) ?? 0) + message.length], []);
  assert.deepEqual(seen, [[ends[0], "synthesize"], [ends[1], "audio-start"], [ends[2], "audio-chunk"], [ends[3], "audio-stop"]]);
  let seed = 7;
  const cuts: number[] = [];
  for (let at = 0; at < stream.length; at += 1 + (seed % 97)) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    cuts.push(at);
  }
  assert.deepEqual(readAll(stream, cuts), [synthesize, start, chunk, stop]);
});

test("data in the header and data after it are merged, the data after winning, and missing or empty data and payload come out empty", () => {
  const extra = bytes('{"rate":16000,"width":2}');
  const merged = joined(bytes(`{"type":"audio-start","data":{"rate":22050,"channels":1},"data_length":${extra.length},"version":"1.11.0"}\n`), extra);
  assert.deepEqual(readAll(merged, []), [{ type: "audio-start", data: { rate: 16000, channels: 1, width: 2 }, payload: null }]);
  assert.deepEqual(readAll(bytes('{"type":"ping","data":{"text":"hi"}}\n'), []), [{ type: "ping", data: { text: "hi" }, payload: null }]);
  assert.deepEqual(readAll(bytes('{"type":"audio-stop","data":null,"data_length":0,"payload_length":0}\n'), []), [{ type: "audio-stop", data: {}, payload: null }]);
  assert.deepEqual(readAll(bytes('{"type":"audio-stop","data_length":null,"payload_length":null}\r\n'), []), [{ type: "audio-stop", data: {}, payload: null }]);
});

test("a header that isn't a JSON object with a type, or lengths that aren't whole numbers of bytes, stop the reader with a reason", () => {
  const refused = (line: string, message: string) => assert.throws(() => createEventReader().push(bytes(`${line}\n`)), { message }, line);
  refused("not json", "The Wyoming server sent a header that isn't JSON");
  refused("", "The Wyoming server sent an empty line where a message should start");
  refused('["audio-stop"]', "The Wyoming server sent a header that isn't a JSON object");
  refused("null", "The Wyoming server sent a header that isn't a JSON object");
  refused("{}", "The Wyoming server sent a message with no type");
  refused('{"type":""}', "The Wyoming server sent a message with no type");
  refused('{"type":7}', "The Wyoming server sent a message with no type");
  refused('{"type":"info","data":[1]}', "The Wyoming server sent a message of type info whose data isn't a JSON object");
  refused('{"type":"info","data":"x"}', "The Wyoming server sent a message of type info whose data isn't a JSON object");
  for (const value of ["-1", "1.5", '"4"', "true", "1e400"]) {
    refused(`{"type":"audio-chunk","payload_length":${value}}`, "The Wyoming server sent a payload_length that isn't a whole number of bytes");
    refused(`{"type":"info","data_length":${value}}`, "The Wyoming server sent a data_length that isn't a whole number of bytes");
  }
  assert.throws(() => createEventReader().push(Uint8Array.of(0xff, 0xfe, 10)), { message: "The Wyoming server sent a header that isn't UTF-8 text" });
});

test("data after the header must be a JSON object in UTF-8", () => {
  const refused = (data: Uint8Array, message: string) => assert.throws(() => createEventReader().push(joined(bytes(`{"type":"info","data_length":${data.length}}\n`), data)), { message });
  refused(bytes("nope"), "The Wyoming server sent info data that isn't JSON");
  refused(bytes("[1,2]"), "The Wyoming server sent info data that isn't a JSON object");
  refused(bytes("null"), "The Wyoming server sent info data that isn't a JSON object");
  refused(Uint8Array.of(0x7b, 0xff, 0x7d), "The Wyoming server sent info data that isn't UTF-8 text");
});

test("a header, data or payload over its limit is refused as soon as it's known, and the limits can be set", () => {
  const limits = { headerBytes: 40, dataBytes: 10, payloadBytes: 20 };
  const lengths = { ...limits, headerBytes: 100 };
  assert.throws(() => createEventReader(limits).push(bytes("x".repeat(41))), { message: "The Wyoming server sent a header longer than 40 bytes" });
  assert.deepEqual(createEventReader(limits).push(bytes("x".repeat(40))), []);
  assert.throws(() => createEventReader(limits).push(bytes(`{"type":"audio-stop",    "pad":"xxxxxxx"}\n`)), { message: "The Wyoming server sent a header longer than 40 bytes" });
  assert.deepEqual(createEventReader(limits).push(bytes(`{"type":"audio-stop",   "pad":"xxxxxxx"}\n`)), [{ type: "audio-stop", data: {}, payload: null }]);
  assert.throws(() => createEventReader(lengths).push(bytes('{"type":"info","data_length":11}\n')), { message: "The Wyoming server sent a message with 11 bytes of data, over the limit of 10" });
  assert.deepEqual(createEventReader(lengths).push(bytes('{"type":"info","data_length":10}\n')), []);
  assert.throws(() => createEventReader(lengths).push(bytes('{"type":"audio-chunk","payload_length":21}\n')), { message: "The Wyoming server sent a message with 21 bytes of payload, over the limit of 20" });
  assert.deepEqual(createEventReader(lengths).push(bytes('{"type":"audio-chunk","payload_length":20}\n')), []);
  assert.throws(() => createEventReader().push(bytes(`{"type":"audio-chunk","payload_length":${wyomingLimits.payloadBytes + 1}}\n`)), { message: `The Wyoming server sent a message with ${wyomingLimits.payloadBytes + 1} bytes of payload, over the limit of ${wyomingLimits.payloadBytes}` });
  assert.throws(() => createEventReader().push(bytes("x".repeat(wyomingLimits.headerBytes + 1))), { message: `The Wyoming server sent a header longer than ${wyomingLimits.headerBytes} bytes` });
});

test("ending part-way through a header, its data or its payload is an error, and ending between messages isn't", () => {
  const message = encodeEvent(chunk);
  const header = message.indexOf(10) + 1;
  for (const cut of [1, header - 1, header, header + 3, message.length - 1]) {
    const reader = createEventReader();
    reader.push(message.subarray(0, cut));
    assert.throws(() => reader.end(), { message: "The Wyoming server closed the connection part-way through a message" }, `cut at ${cut}`);
  }
  const whole = createEventReader();
  assert.equal(whole.push(message).length, 1);
  whole.end();
  createEventReader().end();
});

test("a large payload in many pieces comes out whole, as its own copy", () => {
  const big = Uint8Array.from({ length: 1_048_576 }, (_unused, index) => (index * 31) % 251);
  const message = encodeEvent({ type: "audio-chunk", data: { rate: 22050, width: 2, channels: 1 }, payload: big });
  const reader = createEventReader();
  const events: WyomingEvent[] = [];
  for (let at = 0; at < message.length; at += 65_536) events.push(...reader.push(message.slice(at, at + 65_536)));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].payload, big);
  const copy = createEventReader();
  const input = encodeEvent({ type: "audio-chunk", data: {}, payload: Uint8Array.of(1, 2) });
  const [event] = copy.push(input);
  input.fill(0);
  assert.deepEqual([...(event.payload ?? [])], [1, 2]);
  const alone = createEventReader();
  const separate = encodeEvent({ type: "audio-chunk", data: {}, payload: Uint8Array.of(5, 6, 7, 8) });
  const head = separate.indexOf(10) + 1;
  alone.push(separate.subarray(0, head));
  const body = separate.slice(head);
  const [whole] = alone.push(body);
  body.fill(0);
  assert.deepEqual([...(whole.payload ?? [])], [5, 6, 7, 8]);
});

test("a type the reader doesn't know is passed on like any other", () => {
  assert.deepEqual(readAll(encodeEvent({ type: "something-new", data: { a: 1 }, payload: Uint8Array.of(9) }), []), [{ type: "something-new", data: { a: 1 }, payload: Uint8Array.of(9) }]);
});

test("good messages read before a bad one in the same bytes still come out, and the bad one's reason is given on the next read or at the end", () => {
  const reader = createEventReader();
  const events = reader.push(joined(encodeEvent(start), encodeEvent(stop), bytes("garbage\n"), encodeEvent(stop)));
  assert.deepEqual(events, [start, stop]);
  assert.equal(reader.problem?.message, "The Wyoming server sent a header that isn't JSON");
  assert.throws(() => reader.push(encodeEvent(stop)), { message: "The Wyoming server sent a header that isn't JSON" });
  assert.throws(() => reader.end(), { message: "The Wyoming server sent a header that isn't JSON" });
  const first = createEventReader();
  assert.equal(first.problem === null, true);
  assert.throws(() => first.push(bytes("garbage\n")), { message: "The Wyoming server sent a header that isn't JSON" });
  assert.equal(first.problem?.message, "The Wyoming server sent a header that isn't JSON");
  assert.throws(() => first.push(encodeEvent(stop)), { message: "The Wyoming server sent a header that isn't JSON" });
});

test("a header or payload trickled in a few bytes at a time is read in time proportional to its size", () => {
  const started = performance.now();
  const reader = createEventReader();
  const line = bytes(`{"type":"info","pad":"${"x".repeat(65_000)}"}\n`);
  let found = 0;
  for (let at = 0; at < line.length; at++) found += reader.push(line.subarray(at, at + 1)).length;
  const payload = encodeEvent({ type: "audio-chunk", data: {}, payload: audio(400_000) });
  for (let at = 0; at < payload.length; at += 4) found += reader.push(payload.subarray(at, at + 4)).length;
  assert.equal(found, 2);
  assert.ok(performance.now() - started < 5000, `took ${Math.round(performance.now() - started)} ms`);
});

function audio(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_unused, index) => index % 256);
}
