export type WyomingEvent = { type: string; data: Record<string, unknown>; payload: Uint8Array | null };

export type WyomingLimits = { headerBytes: number; dataBytes: number; payloadBytes: number };

export const wyomingLimits: WyomingLimits = { headerBytes: 65_536, dataBytes: 4_194_304, payloadBytes: 16_777_216 };

export type EventReader = { push(bytes: Uint8Array): WyomingEvent[]; end(): void; readonly problem: Error | null };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const newline = 10;

export function encodeEvent(event: WyomingEvent): Uint8Array {
  if (event.type === "") throw new Error("A Wyoming message needs a type");
  const data = Object.keys(event.data).length > 0 ? encoder.encode(JSON.stringify(event.data)) : null;
  const payload = event.payload !== null && event.payload.length > 0 ? event.payload : null;
  const header = encoder.encode(`${JSON.stringify({ type: event.type, ...(data === null ? {} : { data_length: data.length }), ...(payload === null ? {} : { payload_length: payload.length }) })}\n`);
  const message = new Uint8Array(header.length + (data?.length ?? 0) + (payload?.length ?? 0));
  message.set(header, 0);
  if (data !== null) message.set(data, header.length);
  if (payload !== null) message.set(payload, header.length + (data?.length ?? 0));
  return message;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsedJson(bytes: Uint8Array, what: string): unknown {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new Error(`The Wyoming server sent ${what} that isn't UTF-8 text`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The Wyoming server sent ${what} that isn't JSON`);
  }
}

function byteCount(value: unknown, name: string, what: string, limit: number): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`The Wyoming server sent a ${name} that isn't a whole number of bytes`);
  if (value > limit) throw new Error(`The Wyoming server sent a message with ${value} bytes of ${what}, over the limit of ${limit}`);
  return value;
}

type Header = { type: string; data: Record<string, unknown>; dataLength: number; payloadLength: number };

function parseHeader(line: Uint8Array, limits: WyomingLimits): Header {
  if (line.length === 0) throw new Error("The Wyoming server sent an empty line where a message should start");
  const header = parsedJson(line, "a header");
  if (!isObject(header)) throw new Error("The Wyoming server sent a header that isn't a JSON object");
  if (typeof header.type !== "string" || header.type === "") throw new Error("The Wyoming server sent a message with no type");
  const data = header.data ?? {};
  if (!isObject(data)) throw new Error(`The Wyoming server sent a message of type ${header.type} whose data isn't a JSON object`);
  return { type: header.type, data, dataLength: byteCount(header.data_length, "data_length", "data", limits.dataBytes), payloadLength: byteCount(header.payload_length, "payload_length", "payload", limits.payloadBytes) };
}

export function createEventReader(limits: WyomingLimits = wyomingLimits): EventReader {
  let chunks: Uint8Array[] = [];
  let head = 0;
  let size = 0;
  let scannedChunks = 0;
  let scannedBytes = 0;
  let header: Header | null = null;
  let problem: Error | null = null;

  const lineEnd = (): number => {
    for (let index = head + scannedChunks; index < chunks.length; index++) {
      const found = chunks[index].indexOf(newline);
      if (found !== -1) return scannedBytes + found;
      scannedBytes += chunks[index].length;
      scannedChunks++;
    }
    return -1;
  };

  const take = (count: number): Uint8Array => {
    const taken = new Uint8Array(count);
    let filled = 0;
    while (filled < count) {
      const chunk = chunks[head];
      const used = Math.min(chunk.length, count - filled);
      taken.set(chunk.subarray(0, used), filled);
      filled += used;
      if (used === chunk.length) head++;
      else chunks[head] = chunk.subarray(used);
    }
    size -= count;
    if (head > 64 && head * 2 > chunks.length) {
      chunks = chunks.slice(head);
      head = 0;
    }
    return taken;
  };

  const read = (events: WyomingEvent[]) => {
    for (;;) {
      if (header === null) {
        const end = lineEnd();
        if (end === -1) {
          if (size > limits.headerBytes) throw new Error(`The Wyoming server sent a header longer than ${limits.headerBytes} bytes`);
          return;
        }
        if (end > limits.headerBytes) throw new Error(`The Wyoming server sent a header longer than ${limits.headerBytes} bytes`);
        const line = take(end + 1).subarray(0, end);
        scannedChunks = 0;
        scannedBytes = 0;
        header = parseHeader(line, limits);
      }
      if (size < header.dataLength + header.payloadLength) return;
      const extra = header.dataLength > 0 ? parsedJson(take(header.dataLength), `${header.type} data`) : {};
      if (!isObject(extra)) throw new Error(`The Wyoming server sent ${header.type} data that isn't a JSON object`);
      const payload = header.payloadLength > 0 ? take(header.payloadLength) : null;
      events.push({ type: header.type, data: { ...header.data, ...extra }, payload });
      header = null;
    }
  };

  return {
    push(bytes) {
      if (problem !== null) throw problem;
      if (bytes.length > 0) {
        chunks.push(bytes);
        size += bytes.length;
      }
      const events: WyomingEvent[] = [];
      try {
        read(events);
      } catch (error) {
        problem = error instanceof Error ? error : new Error(String(error));
        if (events.length === 0) throw problem;
      }
      return events;
    },
    end() {
      if (problem !== null) throw problem;
      if (header !== null || size > 0) throw new Error("The Wyoming server closed the connection part-way through a message");
    },
    get problem() {
      return problem;
    },
  };
}
