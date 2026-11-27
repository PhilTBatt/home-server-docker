import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import type { Player } from "./player.js";
import { neverSayingWakePhrase, playSound, say, soundFor, wakePhraseSaid, withoutWakePhrase, type SpeechEngine } from "./speech.js";

type Seen = { steps: string[]; texts: string[]; signals: AbortSignal[]; players: { device: string; rate: number }[]; written: number[][] };

type Options = {
  sounds?: (number[] | Error | (() => Promise<void>))[];
  rate?: number;
  name?: string;
  write?: (seen: Seen) => Promise<void>;
  finish?: (seen: Seen) => Promise<void>;
  start?: () => void;
};

function setUp(options: Options = {}) {
  const seen: Seen = { steps: [], texts: [], signals: [], players: [], written: [] };
  const engine: SpeechEngine = {
    name: options.name ?? "Pretend",
    sampleRate: options.rate ?? 24_000,
    splitsSentences: false,
    async *speak(text, signal) {
      seen.signals.push(signal);
      for await (const piece of text) {
        seen.texts.push(piece);
        seen.steps.push("asked");
        for (const sound of options.sounds ?? [[1, 2], [3, 4]]) {
          if (sound instanceof Error) throw sound;
          if (typeof sound === "function") await sound();
          else {
            seen.steps.push("sound");
            yield Uint8Array.from(sound);
          }
        }
      }
    },
    check: async () => {},
  };
  const player: Player = {
    write: async (sound) => {
      seen.steps.push("write");
      seen.written.push([...sound]);
      await options.write?.(seen);
    },
    finish: async () => {
      seen.steps.push("finish");
      await options.finish?.(seen);
    },
    stop: () => {
      seen.steps.push("stop");
    },
  };
  const startPlayer = (given: { device: string; rate: number }) => {
    seen.steps.push("start");
    seen.players.push(given);
    options.start?.();
    return player;
  };
  return { seen, engine, startPlayer };
}

const never = () => new AbortController().signal;

function orStillWaiting<T>(work: Promise<T>, ms: number): Promise<T | "still waiting"> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<"still waiting">((resolve) => {
    timer = setTimeout(() => resolve("still waiting"), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

test("saying something asks the engine for the whole text as one piece and plays each bit of sound as it comes, then waits for the player to finish", async () => {
  const { seen, engine, startPlayer } = setUp();
  await say(engine, "Jarvis is ready.", "plughw:1,0", startPlayer, never());
  assert.deepEqual(seen.texts, ["Jarvis is ready."]);
  assert.deepEqual(seen.steps, ["asked", "sound", "start", "write", "sound", "write", "finish"]);
  assert.deepEqual(seen.written, [
    [1, 2],
    [3, 4],
  ]);
});

test("the player is started once, on the given device, at the engine's own rate", async () => {
  for (const rate of [24_000, 22_050]) {
    const { seen, engine, startPlayer } = setUp({ rate, sounds: [[1, 2], [3, 4], [5, 6]] });
    await say(engine, "Hello.", "plughw:0,0", startPlayer, never());
    assert.deepEqual(seen.players, [{ device: "plughw:0,0", rate }]);
  }
});

test("the player isn't started until there's sound to play, so an engine that fails first leaves the speakers alone", async () => {
  const down = new Error("Couldn't reach Pretend");
  const { seen, engine, startPlayer } = setUp({ sounds: [down] });
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, never()), (error: unknown) => error === down);
  assert.deepEqual(seen.steps, ["asked"]);
});

test("an engine that sends no sound at all is an error, named, and nothing is played", async () => {
  const { seen, engine, startPlayer } = setUp({ sounds: [], name: "Kokoro" });
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, never()), { message: "Kokoro sent no sound" });
  assert.deepEqual(seen.steps, ["asked"]);
});

test("if the engine fails part-way, the player is stopped at once and the engine's error is passed on", async () => {
  const broke = new Error("Kokoro's reply was cut off part-way");
  const { seen, engine, startPlayer } = setUp({ sounds: [[1, 2], broke, [3, 4]] });
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, never()), (error: unknown) => error === broke);
  assert.deepEqual(seen.steps, ["asked", "sound", "start", "write", "stop"]);
});

test("if the player can't be started, that error is passed on and the engine isn't asked for more", async () => {
  const { seen, engine, startPlayer } = setUp({
    start: () => {
      throw new Error("There's no sound device to play on");
    },
  });
  await assert.rejects(say(engine, "Hello.", " ", startPlayer, never()), { message: "There's no sound device to play on" });
  assert.deepEqual(seen.steps, ["asked", "sound", "start"]);
});

test("if the player fails while taking sound or while finishing, it's stopped and its error is passed on", async () => {
  const writing = setUp({
    write: async () => {
      throw new Error("aplay stopped with code 1: audio open error: Device or resource busy");
    },
  });
  await assert.rejects(say(writing.engine, "Hello.", "plughw:1,0", writing.startPlayer, never()), { message: "aplay stopped with code 1: audio open error: Device or resource busy" });
  assert.deepEqual(writing.seen.steps, ["asked", "sound", "start", "write", "stop"]);
  const finishing = setUp({
    finish: async () => {
      throw new Error("aplay stopped with code 1");
    },
  });
  await assert.rejects(say(finishing.engine, "Hello.", "plughw:1,0", finishing.startPlayer, never()), { message: "aplay stopped with code 1" });
  assert.deepEqual(finishing.seen.steps, ["asked", "sound", "start", "write", "sound", "write", "finish", "stop"]);
});

test("speech that was already called off never reaches the engine or the speakers", async () => {
  const { seen, engine, startPlayer } = setUp();
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  stop.abort(why);
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal), (error: unknown) => error === why);
  assert.deepEqual(seen.steps, []);
});

test("the engine is handed the same signal, so calling the speech off stops its request too", async () => {
  const { seen, engine, startPlayer } = setUp();
  const stop = new AbortController();
  await say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal);
  assert.deepEqual(seen.signals, [stop.signal]);
});

test("calling it off while sound is being written stops the player straight away, before the write comes back", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  let release: () => void = () => {};
  let held = false;
  const { seen, engine, startPlayer } = setUp({
    write: () => {
      if (held) return Promise.resolve();
      held = true;
      return new Promise<void>((resolve) => (release = resolve));
    },
  });
  const saying = say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal);
  for (let turns = 0; !seen.steps.includes("write"); turns++) {
    assert.ok(turns < 1000, "the sound was never written");
    await new Promise((resolve) => setImmediate(resolve));
  }
  stop.abort(why);
  assert.deepEqual(seen.steps, ["asked", "sound", "start", "write", "stop"]);
  release();
  await assert.rejects(saying, (error: unknown) => error === why);
  assert.deepEqual(
    seen.steps.filter((step) => step === "write" || step === "finish"),
    ["write"],
  );
});

test("calling it off while the engine is still making the sound stops with the caller's reason and never starts the player", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const { seen, engine, startPlayer } = setUp({
    sounds: [
      async () => {
        stop.abort(why);
      },
      [1, 2],
    ],
  });
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal), (error: unknown) => error === why);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    seen.steps.filter((step) => step !== "sound"),
    ["asked"],
  );
});

test("an engine that never answers and ignores being called off doesn't hold the caller up", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const { seen, engine, startPlayer } = setUp({ sounds: [() => new Promise<void>(() => {})] });
  const saying = say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal);
  for (let turns = 0; !seen.steps.includes("asked"); turns++) {
    assert.ok(turns < 1000, "the engine was never asked");
    await new Promise((resolve) => setImmediate(resolve));
  }
  stop.abort(why);
  const outcome = await orStillWaiting(
    saying.then(
      () => "said",
      (error: unknown) => error,
    ),
    2000,
  );
  assert.equal(outcome, why);
  assert.deepEqual(seen.steps, ["asked"]);
});

test("when the speech fails or is called off, the engine is told it can stop making sound", async () => {
  let cleanedUp = 0;
  const making: SpeechEngine = {
    name: "Pretend",
    sampleRate: 24_000,
    splitsSentences: false,
    async *speak() {
      try {
        yield Uint8Array.of(1, 2);
        yield Uint8Array.of(3, 4);
      } finally {
        cleanedUp++;
      }
    },
    check: async () => {},
  };
  const { startPlayer } = setUp({
    write: async () => {
      throw new Error("aplay stopped with code 1");
    },
  });
  await assert.rejects(say(making, "Hello.", "plughw:1,0", startPlayer, new AbortController().signal), { message: "aplay stopped with code 1" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cleanedUp, 1);
});

test("called off by the time the engine finishes with no sound, it's the caller's reason that comes back, not a no-sound error", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const { seen, engine, startPlayer } = setUp({
    sounds: [
      async () => {
        stop.abort(why);
      },
    ],
  });
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal), (error: unknown) => error === why);
  assert.deepEqual(seen.steps, ["asked"]);
});

test("calling it off while the last of the sound is playing stops the player and counts as called off, not as said", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const { seen, engine, startPlayer } = setUp({
    finish: async () => {
      stop.abort(why);
    },
  });
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal), (error: unknown) => error === why);
  assert.equal(seen.steps.filter((step) => step === "stop").length >= 1, true);
  assert.equal(seen.steps.indexOf("stop") > seen.steps.indexOf("finish"), true);
});

test("calling it off comes back at once even if the player never answers, whether it was taking sound or finishing", async () => {
  const why = new Error("Phil pressed Ctrl+C");
  for (const stuck of ["write", "finish"] as const) {
    const stop = new AbortController();
    const { seen, engine, startPlayer } = setUp({ [stuck]: () => new Promise<void>(() => {}) });
    const saying = say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal);
    for (let turns = 0; !seen.steps.includes(stuck); turns++) {
      assert.ok(turns < 1000, `the player never got as far as ${stuck}`);
      await new Promise((resolve) => setImmediate(resolve));
    }
    stop.abort(why);
    const outcome = await orStillWaiting(
      saying.then(
        () => "said",
        (error: unknown) => error,
      ),
      2000,
    );
    assert.equal(outcome, why, stuck);
    assert.equal(seen.steps.includes("stop"), true, stuck);
  }
});

test("a player that fails after the speech was called off doesn't turn into a second, unhandled failure", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  let fail: (error: Error) => void = () => {};
  const { seen, engine, startPlayer } = setUp({ finish: () => new Promise<void>((_resolve, reject) => (fail = reject)) });
  const saying = say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal);
  for (let turns = 0; !seen.steps.includes("finish"); turns++) {
    assert.ok(turns < 1000, "the player never got as far as finishing");
    await new Promise((resolve) => setImmediate(resolve));
  }
  stop.abort(why);
  const outcome = await orStillWaiting(
    saying.then(
      () => "said",
      (error: unknown) => error,
    ),
    2000,
  );
  assert.equal(outcome, why);
  fail(new Error("aplay was stopped by SIGTERM"));
  await new Promise((resolve) => setImmediate(resolve));
});

test("once it's been said, calling it off later does nothing to the player, and nothing is left listening on the signal", async () => {
  const { seen, engine, startPlayer } = setUp();
  const stop = new AbortController();
  await say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal);
  assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  stop.abort();
  assert.equal(seen.steps.includes("stop"), false);
});

test("nothing is left listening on the signal after a failure either", async () => {
  const stop = new AbortController();
  const { engine, startPlayer } = setUp({
    finish: async () => {
      throw new Error("aplay stopped with code 1");
    },
  });
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal), { message: "aplay stopped with code 1" });
  assert.equal(getEventListeners(stop.signal, "abort").length, 0);
});

test("called off in the very moment the player starts, it still comes back at once even if the player then never answers", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const { engine, startPlayer } = setUp({ start: () => stop.abort(why), write: () => new Promise<void>(() => {}) });
  const outcome = await orStillWaiting(
    say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal).then(
      () => "said",
      (error: unknown) => error,
    ),
    2000,
  );
  assert.equal(outcome, why);
});

test("called off in the moment between a sound arriving and it being taken, the player is never started", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  let give: (next: IteratorResult<Uint8Array>) => void = () => {};
  const first = new Promise<IteratorResult<Uint8Array>>((resolve) => {
    give = resolve;
  });
  const sounds: AsyncIterableIterator<Uint8Array> = {
    next: () => first,
    return: async () => ({ done: true, value: undefined }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  const engine: SpeechEngine = { name: "Pretend", sampleRate: 24_000, splitsSentences: false, speak: () => sounds, check: async () => {} };
  const { seen, startPlayer } = setUp();
  const saying = say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal);
  void first.then(() => stop.abort(why));
  give({ done: false, value: Uint8Array.of(1, 2) });
  await assert.rejects(saying, (error: unknown) => error === why);
  assert.deepEqual(seen.steps, []);
});

test("an engine whose own clean-up fails, throws or isn't even a promise is still told to stop, and never hides the real error", async () => {
  const cleanUps: (() => unknown)[] = [
    () => Promise.reject(new Error("the clean-up failed")),
    () => {
      throw new Error("the clean-up threw");
    },
    () => ({ done: true, value: undefined }),
  ];
  for (const cleanUp of cleanUps) {
    let asked = 0;
    let told = 0;
    const sounds = {
      next: async () => {
        asked++;
        if (asked > 1) throw new Error("Kokoro replied 500");
        return { done: false, value: Uint8Array.of(1, 2) };
      },
      return: () => {
        told++;
        return cleanUp();
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<Uint8Array>;
    const engine: SpeechEngine = { name: "Pretend", sampleRate: 24_000, splitsSentences: false, speak: () => sounds, check: async () => {} };
    const { seen, startPlayer } = setUp();
    await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, new AbortController().signal), { message: "Kokoro replied 500" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(told, 1);
    assert.deepEqual(seen.steps, ["start", "write", "stop"]);
  }
});

test("an engine that fails before it hands anything back leaves nothing listening on the signal", async () => {
  const stop = new AbortController();
  const { seen, startPlayer } = setUp();
  const engine: SpeechEngine = {
    name: "Pretend",
    sampleRate: 24_000,
    splitsSentences: false,
    speak: () => {
      throw new Error("the engine couldn't be asked");
    },
    check: async () => {},
  };
  await assert.rejects(say(engine, "Hello.", "plughw:1,0", startPlayer, stop.signal), { message: "the engine couldn't be asked" });
  assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  assert.deepEqual(seen.steps, []);
});

test("the sound for one sentence is asked for as one piece of text, and comes back whole", async () => {
  const { seen, engine } = setUp({ sounds: [[1, 2, 3, 4]] });
  assert.deepEqual([...(await soundFor(engine, "Hello there.", never()))], [1, 2, 3, 4]);
  assert.deepEqual(seen.texts, ["Hello there."]);
});

test("an engine that sends a sentence's sound in several bits has them joined in order", async () => {
  const { engine } = setUp({ sounds: [[1, 2], [3, 4, 5, 6], [7, 8]] });
  assert.deepEqual([...(await soundFor(engine, "Hello there.", never()))], [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("an engine that sends no sound for a sentence is an error, named", async () => {
  const { engine } = setUp({ sounds: [], name: "Kokoro" });
  await assert.rejects(soundFor(engine, "Hello.", never()), { message: "Kokoro sent no sound" });
});

test("the engine's own failure over a sentence is passed on as it is", async () => {
  const { engine } = setUp({ sounds: [[1, 2], new Error("Kokoro replied 500")] });
  await assert.rejects(soundFor(engine, "Hello.", never()), { message: "Kokoro replied 500" });
});

test("a sentence that was already called off never reaches the engine, and the engine is handed the same signal", async () => {
  const stop = new AbortController();
  const { seen, engine } = setUp();
  await soundFor(engine, "Hello.", stop.signal);
  assert.equal(seen.signals[0], stop.signal);
  const why = new Error("Speech was stopped");
  stop.abort(why);
  await assert.rejects(soundFor(engine, "Hello again.", stop.signal), (error: unknown) => error === why);
  assert.deepEqual(seen.texts, ["Hello."]);
});

test("one sound is played through a player of its own: started on the device at the rate, given the sound, then left to finish", async () => {
  const { seen, startPlayer } = setUp();
  await playSound(Uint8Array.of(5, 6, 7, 8), "plughw:2,0", 22_050, startPlayer, never());
  assert.deepEqual(seen.steps, ["start", "write", "finish"]);
  assert.deepEqual(seen.players, [{ device: "plughw:2,0", rate: 22_050 }]);
  assert.deepEqual(seen.written, [[5, 6, 7, 8]]);
});

test("a sound that was already called off never starts a player", async () => {
  const stop = new AbortController();
  const why = new Error("Speech was stopped");
  stop.abort(why);
  const { seen, startPlayer } = setUp();
  await assert.rejects(playSound(Uint8Array.of(1, 2), "plughw:1,0", 24_000, startPlayer, stop.signal), (error: unknown) => error === why);
  assert.deepEqual(seen.steps, []);
});

test("calling a sound off stops its player at once, whether it was taking the sound or finishing, even if the player never answers", async () => {
  const why = new Error("Speech was stopped");
  for (const stuck of ["write", "finish"] as const) {
    const stop = new AbortController();
    const { seen, startPlayer } = setUp({ [stuck]: () => new Promise<void>(() => {}) });
    const playing = playSound(Uint8Array.of(1, 2), "plughw:1,0", 24_000, startPlayer, stop.signal).then(
      () => "played",
      (error: unknown) => error,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.steps.at(-1), stuck);
    stop.abort(why);
    assert.equal(seen.steps.at(-1), "stop");
    assert.equal(await orStillWaiting(playing, 2000), why);
    assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  }
});

test("called off in the very moment its player starts, a sound is never written and the player is stopped", async () => {
  const stop = new AbortController();
  const why = new Error("Speech was stopped");
  const { seen, startPlayer } = setUp({ start: () => stop.abort(why) });
  await assert.rejects(playSound(Uint8Array.of(1, 2), "plughw:1,0", 24_000, startPlayer, stop.signal), (error: unknown) => error === why);
  assert.deepEqual(seen.steps, ["start", "stop"]);
});

test("a player that fails while taking a sound or finishing is stopped, and its error is passed on", async () => {
  for (const failing of ["write", "finish"] as const) {
    const stop = new AbortController();
    const { seen, startPlayer } = setUp({
      [failing]: async () => {
        throw new Error("aplay stopped with code 1: audio open error: Device or resource busy");
      },
    });
    await assert.rejects(playSound(Uint8Array.of(1, 2), "plughw:1,0", 24_000, startPlayer, stop.signal), { message: "aplay stopped with code 1: audio open error: Device or resource busy" });
    assert.equal(seen.steps.at(-1), "stop");
    assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  }
});

test("a player that can't be started passes its error on, and nothing is left listening on the signal after that or after a sound that played", async () => {
  const stop = new AbortController();
  const refusing = () => {
    throw new Error("The sound rate must be a whole number of Hz from 2000 to 192000, not 0");
  };
  await assert.rejects(playSound(Uint8Array.of(1, 2), "plughw:1,0", 0, refusing, stop.signal), { message: "The sound rate must be a whole number of Hz from 2000 to 192000, not 0" });
  assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  const { seen, startPlayer } = setUp();
  await playSound(Uint8Array.of(1, 2), "plughw:1,0", 24_000, startPlayer, stop.signal);
  assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  stop.abort();
  assert.deepEqual(seen.steps, ["start", "write", "finish"]);
});

test("Jarvis never says his wake phrase, so with interrupting on he can't set himself off: it becomes my wake word, in any case and with any marks between", () => {
  assert.equal(withoutWakePhrase("I listen for Hey Jarvis, then I answer."), `I listen for ${wakePhraseSaid}, then I answer.`);
  assert.equal(withoutWakePhrase("Just say hey, Jarvis! or “Hey Jarvis” again"), `Just say ${wakePhraseSaid}! or “${wakePhraseSaid}” again`);
  assert.equal(withoutWakePhrase("HEY JARVIS"), wakePhraseSaid);
  assert.equal(withoutWakePhrase("HeyJarvis, run together, sounds the same"), `${wakePhraseSaid}, run together, sounds the same`);
  assert.equal(withoutWakePhrase("Jarvis is ready when you are. They said hey. Heyday for Jarvis."), "Jarvis is ready when you are. They said hey. Heyday for Jarvis.", "his name alone, hey alone, and words that only start with hey stay");
});

test("his voice gets the text without the wake phrase, even split across two pieces, and keeps the engine's name, rate and check", async () => {
  const heard: string[] = [];
  const checked: AbortSignal[] = [];
  const engine: SpeechEngine = {
    name: "Stand-in",
    sampleRate: 24_000,
    splitsSentences: true,
    async *speak(text) {
      for await (const piece of text) {
        heard.push(piece);
        yield new Uint8Array([1]);
      }
    },
    async check(signal) {
      checked.push(signal);
    },
  };
  const wrapped = neverSayingWakePhrase(engine);
  assert.deepEqual([wrapped.name, wrapped.sampleRate, wrapped.splitsSentences], ["Stand-in", 24_000, true]);
  const signal = new AbortController().signal;
  await wrapped.check(signal);
  assert.deepEqual(checked, [signal]);
  async function* pieces() {
    yield "Say Hey Jarvis to wake me.";
    yield "To ask again, say hey,";
    yield "Jarvis, then your question.";
    yield "That's all.";
    yield "And at the very end, hey";
  }
  for await (const sound of wrapped.speak(pieces(), signal)) assert.deepEqual([...sound], [1]);
  assert.deepEqual(heard, [`Say ${wakePhraseSaid} to wake me.`, `To ask again, say ${wakePhraseSaid}, then your question.`, "That's all.", "And at the very end, hey"]);
});
