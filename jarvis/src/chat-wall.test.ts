import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { EarsAnswer } from "./ears-client.js";
import { runChat, type ChatDeps } from "./chat.js";
import type { PhoneDesk, PhoneEvent, PhoneRequest } from "./phone.js";
import type { Heard, Talk } from "./talk.js";
import type { WakeEvent } from "./wake.js";
import type { WallChat } from "./wall.js";

function channel<T>() {
  const waiting: T[] = [];
  let over = false;
  let wake = () => {};
  async function* read(): AsyncGenerator<T> {
    for (;;) {
      while (waiting.length === 0 && !over) await new Promise<void>((resolve) => (wake = resolve));
      const next = waiting.shift();
      if (next === undefined) return;
      yield next;
    }
  }
  return {
    items: read(),
    push(item: T) {
      waiting.push(item);
      wake();
    },
    close() {
      over = true;
      wake();
    },
  };
}

type Answering = (question: string, listener: AnswerListener) => Promise<string>;

function fakeSession(asked: string[], answering?: Answering): AgentSession {
  let stopped: string | null = null;
  return {
    async ask(question: string, listener: AnswerListener = {}) {
      asked.push(question);
      const text = answering === undefined ? "Bins tonight." : await answering(question, listener);
      listener.text?.(text);
      return { text, firstWordsMs: 400, totalMs: 900 };
    },
    readyMs: () => null,
    costUsd: () => 0.01,
    stoppedReason: () => stopped,
    close() {
      stopped ??= closedMessage;
    },
  };
}

function fakeWall(log: string[]): WallChat {
  const make = (label: string): WallChat => ({
    answer() {
      log.push(`${label}answer`);
      return {
        text: (delta) => void log.push(`${label}text ${delta}`),
        restart: () => void log.push(`${label}restart`),
        asking: async (waiting) => {
          log.push(`${label}asking`);
          try {
            return await waiting;
          } finally {
            log.push(`${label}asked`);
          }
        },
        end: (answered) => void log.push(`${label}end ${answered}`),
      };
    },
    listening: (on) => void log.push(`${label}listening ${on}`),
    woke: () => void log.push(`${label}woke`),
    heard: (heard) => void log.push(`${label}heard ${heard.text}${heard.voice === undefined ? "" : ` (${heard.voice.who})`}`),
    get quiet() {
      return make("quiet ");
    },
  });
  return make("");
}

const heard: Heard = { text: "What's on tonight?", recordedMs: 2000, textMs: 300 };

function talkWith(sent: Heard | null = heard): Talk {
  return {
    check: async () => "Ears: ready",
    start: async () => ({ ok: true, id: 7 }),
    send: async () => (sent === null ? { ok: false, why: "nothing was heard" } : { ok: true, heard: sent }),
    drop: async () => null,
  };
}

function chat(lines: string[], overrides: Partial<ChatDeps> = {}, answering?: Answering) {
  const log: string[] = [];
  const asked: string[] = [];
  let output = "";
  async function* typed() {
    for (const line of lines) yield line;
  }
  const deps: ChatDeps = {
    lines: typed(),
    session: fakeSession(asked, answering),
    write: (text) => void (output += text),
    prompt: () => {},
    questionTimeoutMs: 1000,
    wall: fakeWall(log),
    ...overrides,
  };
  return { run: () => runChat(deps), log, asked, output: () => output };
}

test("a typed question shows him working, but its answer's words only go to the quiet wall", async () => {
  const { run, log } = chat(["When are the bins?"]);
  await run();
  assert.deepEqual(log, ["quiet answer", "quiet text Bins tonight.", "quiet end true"]);
});

test("an answer that fails ends without counting as done", async () => {
  const { run, log } = chat(["/talk", ""], { talk: talkWith() }, async () => Promise.reject(new Error("the API is down")));
  await run();
  assert.deepEqual(log.slice(-2), ["answer", "end false"]);
});

test("an answer that starts again tells the wall, so the words from before go", async () => {
  const { run, log } = chat(["/talk", ""], { talk: talkWith() }, async (_question, listener) => {
    listener.text?.("Bins are on Thurs");
    listener.restart?.();
    return "The bins go out tonight.";
  });
  await run();
  assert.deepEqual(log.slice(-4), ["text Bins are on Thurs", "restart", "text The bins go out tonight.", "end true"]);
});

test("a retry tells the wall too", async () => {
  const { run, log } = chat(["/talk", ""], { talk: talkWith() }, async (_question, listener) => {
    listener.retry?.();
    return "Done.";
  });
  await run();
  assert.ok(log.includes("restart"), log.join(" | "));
});

test("whose voice it was only goes to the wall with JARVIS_VOICES on", async () => {
  const voiced: Heard = { ...heard, voice: { who: "sam", owner: false, score: 0.7 } };
  const off = chat(["/talk", ""], { talk: talkWith(voiced) });
  await off.run();
  assert.ok(off.log.includes("heard What's on tonight?"), off.log.join(" | "));
  const on = chat(["/talk", ""], { talk: talkWith(voiced), voices: { other: "answer" } });
  await on.run();
  assert.ok(on.log.includes("heard What's on tonight? (sam)"), on.log.join(" | "));
});

test("waiting for a yes shows he needs you, for as long as it's asked", async () => {
  const { run, log } = chat(
    ["/talk", ""],
    { confirm: async () => "yes", talk: talkWith() },
    async (_question, listener) => {
      await listener.confirm?.("scan_library", {});
      return "Scanning.";
    },
  );
  await run();
  assert.deepEqual(log.slice(-5), ["answer", "asking", "asked", "text Scanning.", "end true"]);
});

test("/talk shows him listening, then what was heard, then the answer", async () => {
  const { run, log } = chat(["/talk", ""], { talk: talkWith() });
  await run();
  assert.deepEqual(log, ["listening true", "listening false", "heard What's on tonight?", "answer", "text Bins tonight.", "end true"]);
});

test("a dropped recording stops the listening and shows nothing heard", async () => {
  const { run, log } = chat(["/talk", "never mind that"], { talk: talkWith() });
  await run();
  assert.deepEqual(log.slice(0, 2), ["listening true", "listening false"]);
  assert.ok(!log.some((line) => line.startsWith("heard")));
});

test("a recording that came back with nothing shows nothing heard", async () => {
  const { run, log } = chat(["/talk", ""], { talk: talkWith(null) });
  await run();
  assert.deepEqual(log, ["listening true", "listening false"]);
});

test("a recording still open when the chat ends stops showing him listening", async () => {
  const { run, log } = chat(["/talk"], { talk: talkWith() });
  await run();
  assert.deepEqual(log, ["listening true", "listening false"]);
});

function wakeChat() {
  const lines = channel<string>();
  const wake = channel<WakeEvent>();
  const log: string[] = [];
  const asked: string[] = [];
  const deps: ChatDeps = {
    lines: lines.items,
    session: fakeSession(asked),
    write: () => {},
    prompt: () => {},
    questionTimeoutMs: 1000,
    talk: talkWith(),
    wake: wake.items,
    wall: fakeWall(log),
  };
  return { running: runChat(deps), lines, wake, log, asked };
}

function doneWith(text: string): EarsAnswer {
  return { status: 200, state: "idle", reason: null, error: null, seconds: 2, last: { seconds: 2, reason: "it went quiet", text, textProblem: null } };
}

async function until(check: () => boolean) {
  for (let tries = 0; tries < 200 && !check(); tries++) await new Promise((resolve) => setTimeout(resolve, 5));
}

test("Hey Jarvis flashes, shows him listening, and then what he heard", async () => {
  const { running, lines, wake, log, asked } = wakeChat();
  wake.push({ kind: "wake", id: 3 });
  wake.push({ kind: "done", id: 3, answer: doneWith("what's on tonight"), textMs: 200 });
  await until(() => asked.length === 1);
  lines.close();
  wake.close();
  await running;
  assert.deepEqual(log, ["woke", "listening true", "listening false", "heard what's on tonight", "answer", "text Bins tonight.", "end true"]);
});

test("the talk button flashes like Hey Jarvis", async () => {
  const { running, lines, wake, log, asked } = wakeChat();
  wake.push({ kind: "wake", id: 4, button: true });
  wake.push({ kind: "done", id: 4, answer: doneWith("hello"), textMs: 200 });
  await until(() => asked.length === 1);
  lines.close();
  wake.close();
  await running;
  assert.deepEqual(log.slice(0, 4), ["woke", "listening true", "listening false", "heard hello"]);
});

test("a question from the phone shows him working and needing you, but never its words or his", async () => {
  const lines = channel<string>();
  const phoneEvents = channel<PhoneEvent>();
  const log: string[] = [];
  const asked: string[] = [];
  let waiting: PhoneRequest | null = { id: "00000000000000a1", audio: new Uint8Array(32_000) };
  const desk: PhoneDesk = {
    next: async () => Promise.reject(new Error("unused")),
    heard: async () => {},
    reply: async () => {},
    failed: async () => {},
    ask: async () => {},
    answer: async () => "yes",
    voice: async () => {},
    noVoice: async () => {},
  };
  const deps: ChatDeps = {
    lines: lines.items,
    session: fakeSession(asked, async (_question, listener) => {
      await listener.confirm?.("scan_library", {});
      return "Scanning now.";
    }),
    write: () => {},
    prompt: () => {},
    questionTimeoutMs: 1000,
    wall: fakeWall(log),
    phone: {
      mode: async () => "normal",
      news: {
        events: phoneEvents.items,
        take() {
          const taken = waiting;
          waiting = null;
          return taken;
        },
      },
      desk,
      hear: async () => "scan the library",
      voice: null,
    },
  };
  const running = runChat(deps);
  phoneEvents.push({ kind: "phone" });
  await until(() => log.includes("quiet end true"));
  lines.close();
  phoneEvents.close();
  await running;
  assert.deepEqual(log, ["quiet answer", "quiet asking", "quiet asked", "quiet text Scanning now.", "quiet end true"]);
});
