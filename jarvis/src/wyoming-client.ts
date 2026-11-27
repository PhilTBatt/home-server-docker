import { connect } from "node:net";
import { shortError } from "./player.js";
import { createEventReader, encodeEvent, wyomingLimits, type WyomingEvent, type WyomingLimits } from "./wyoming.js";

export const wyomingConnectMs = 3_000;

export type WyomingConnection = {
  send(event: WyomingEvent, signal?: AbortSignal): Promise<void>;
  next(signal?: AbortSignal): Promise<WyomingEvent | null>;
  close(): void;
};

export type WyomingOptions = { host: string; port: number; connectMs?: number; signal?: AbortSignal; limits?: WyomingLimits };

export type AudioFormat = { rate: number; width: number; channels: number };

export type AudioPiece = AudioFormat & { audio: Uint8Array };

function code(error: unknown): string {
  const found = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof found === "string" && /^[A-Z0-9_]{1,40}$/.test(found) ? ` (${found})` : "";
}

function calledOff(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("The request to the Wyoming server was called off");
}

export function connectWyoming(options: WyomingOptions): Promise<WyomingConnection> {
  const where = `${options.host}:${options.port}`;
  const limit = AbortSignal.timeout(options.connectMs ?? wyomingConnectMs);
  const signal = options.signal === undefined ? limit : AbortSignal.any([options.signal, limit]);
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(calledOff(options.signal));
      return;
    }
    const socket = connect({ host: options.host, port: options.port });
    const giveUp = () => {
      socket.destroy();
      reject(options.signal?.aborted ? calledOff(options.signal) : new Error(`The Wyoming server at ${where} didn't answer within ${(options.connectMs ?? wyomingConnectMs) / 1000} seconds`));
    };
    const failed = (error: Error) => {
      signal.removeEventListener("abort", giveUp);
      socket.destroy();
      reject(new Error(`Couldn't reach the Wyoming server at ${where}${code(error)}`));
    };
    signal.addEventListener("abort", giveUp, { once: true });
    socket.once("error", failed);
    socket.once("connect", () => {
      signal.removeEventListener("abort", giveUp);
      socket.off("error", failed);
      resolve(connection(socket, where, options.limits ?? wyomingLimits));
    });
  });
}

function connection(socket: ReturnType<typeof connect>, where: string, limits: WyomingLimits): WyomingConnection {
  const reader = createEventReader(limits);
  const arrived: WyomingEvent[] = [];
  let problem: Error | null = null;
  let closed = false;
  let waiting: (() => void) | null = null;
  const wake = () => {
    const waiter = waiting;
    waiting = null;
    waiter?.();
  };
  const fail = (error: Error) => {
    problem ??= error;
    closed = true;
    socket.destroy();
    wake();
  };
  socket.on("data", (bytes: Buffer) => {
    if (closed) return;
    try {
      arrived.push(...reader.push(bytes));
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (reader.problem !== null) {
      fail(reader.problem);
      return;
    }
    wake();
  });
  socket.on("end", () => {
    try {
      reader.end();
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    closed = true;
    socket.destroy();
    wake();
  });
  socket.on("error", (error) => fail(new Error(`The connection to the Wyoming server at ${where} failed${code(error)}`)));
  socket.on("close", () => {
    closed = true;
    wake();
  });

  return {
    send(event, signal) {
      if (signal?.aborted) return Promise.reject(calledOff(signal));
      if (closed) return Promise.reject(problem ?? new Error(`The connection to the Wyoming server at ${where} is closed`));
      const message = encodeEvent(event);
      return new Promise((resolve, reject) => {
        socket.write(message, (error) => (error ? reject(new Error(`Couldn't send to the Wyoming server at ${where}${code(error)}`)) : resolve()));
      });
    },
    next(signal) {
      if (waiting !== null) return Promise.reject(new Error("Only one wait for the Wyoming server's next message at a time"));
      return new Promise((resolve, reject) => {
        const check = () => {
          if (arrived.length > 0) {
            signal?.removeEventListener("abort", stop);
            resolve(arrived.shift() as WyomingEvent);
          } else if (problem !== null) {
            signal?.removeEventListener("abort", stop);
            reject(problem);
          } else if (closed) {
            signal?.removeEventListener("abort", stop);
            resolve(null);
          } else waiting = check;
        };
        const stop = () => {
          if (waiting === check) waiting = null;
          reject(calledOff(signal as AbortSignal));
        };
        if (signal?.aborted) {
          reject(calledOff(signal));
          return;
        }
        signal?.addEventListener("abort", stop, { once: true });
        check();
      });
    },
    close() {
      problem ??= new Error(`The connection to the Wyoming server at ${where} was closed at this end`);
      closed = true;
      socket.destroy();
      wake();
    },
  };
}

function audioFormat(event: WyomingEvent): AudioFormat {
  const { rate, width, channels } = event.data;
  const whole = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (!whole(rate) || !whole(width) || !whole(channels)) throw new Error(`The Wyoming server sent ${event.type} without a clear rate, sample width and number of channels`);
  return { rate: rate as number, width: width as number, channels: channels as number };
}

function sameFormat(a: AudioFormat, b: AudioFormat): boolean {
  return a.rate === b.rate && a.width === b.width && a.channels === b.channels;
}

function refusal(event: WyomingEvent): Error {
  const text = typeof event.data.text === "string" && event.data.text.trim() !== "" ? shortError(event.data.text) : "no reason given";
  return new Error(`The Wyoming server refused: ${text}`);
}

const busy = new WeakSet<WyomingConnection>();

function claim(connection: WyomingConnection): void {
  if (busy.has(connection)) throw new Error("The connection to the Wyoming server is still busy with another request");
  busy.add(connection);
}

export const transcribeChunkBytes = 32_000;

export async function transcribe(connection: WyomingConnection, sound: Uint8Array, format: AudioFormat, language: string | null, signal?: AbortSignal, chunkBytes = transcribeChunkBytes): Promise<string> {
  claim(connection);
  let finished = false;
  try {
    if (sound.length % (format.width * format.channels) !== 0) throw new Error("The sound to turn into text isn't a whole number of samples");
    await connection.send({ type: "transcribe", data: language === null ? {} : { language }, payload: null }, signal);
    await connection.send({ type: "audio-start", data: { ...format }, payload: null }, signal);
    for (let at = 0; at < sound.length; at += chunkBytes) await connection.send({ type: "audio-chunk", data: { ...format }, payload: sound.subarray(at, at + chunkBytes) }, signal);
    await connection.send({ type: "audio-stop", data: {}, payload: null }, signal);
    for (;;) {
      const event = await connection.next(signal);
      if (event === null) throw new Error("The Wyoming server closed the connection without sending the text");
      if (event.type === "error") throw refusal(event);
      if (event.type === "transcript") {
        if (typeof event.data.text !== "string") throw new Error("The Wyoming server sent a transcript without its text");
        finished = true;
        return event.data.text;
      }
    }
  } finally {
    busy.delete(connection);
    if (!finished) connection.close();
  }
}

export async function* synthesize(connection: WyomingConnection, text: string, voice: string | null, signal?: AbortSignal): AsyncGenerator<AudioPiece> {
  claim(connection);
  let finished = false;
  try {
    await connection.send({ type: "synthesize", data: { text, ...(voice === null ? {} : { voice: { name: voice } }) }, payload: null }, signal);
    let format: AudioFormat | null = null;
    for (;;) {
      const event = await connection.next(signal);
      if (event === null) throw new Error("The Wyoming server closed the connection before the end of the speech");
      if (event.type === "error") throw refusal(event);
      if (event.type === "audio-start") {
        if (format !== null) throw new Error("The Wyoming server started the speech twice");
        format = audioFormat(event);
      } else if (event.type === "audio-chunk") {
        if (format === null) throw new Error("The Wyoming server sent sound before saying how it's encoded");
        const chunk = audioFormat(event);
        if (!sameFormat(chunk, format)) throw new Error("The Wyoming server changed how its sound is encoded part-way through");
        const audio = event.payload ?? new Uint8Array(0);
        if (audio.length % (chunk.width * chunk.channels) !== 0) throw new Error("The Wyoming server sent a piece of sound that isn't a whole number of samples");
        if (audio.length > 0) yield { ...chunk, audio };
      } else if (event.type === "audio-stop") {
        finished = true;
        return;
      }
    }
  } finally {
    busy.delete(connection);
    if (!finished) connection.close();
  }
}

export async function describe(connection: WyomingConnection, signal?: AbortSignal): Promise<Record<string, unknown>> {
  claim(connection);
  let finished = false;
  try {
    await connection.send({ type: "describe", data: {}, payload: null }, signal);
    for (;;) {
      const event = await connection.next(signal);
      if (event === null) throw new Error("The Wyoming server closed the connection without describing itself");
      if (event.type === "error") throw refusal(event);
      if (event.type === "info") {
        finished = true;
        return event.data;
      }
    }
  } finally {
    busy.delete(connection);
    if (!finished) connection.close();
  }
}
