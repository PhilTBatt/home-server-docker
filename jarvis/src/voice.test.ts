import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { kokoroName, kokoroRate } from "./kokoro.js";
import type { Player } from "./player.js";
import { MicrophonePassedIn, type SoundCard } from "./sound-card.js";
import type { SpeechEngine } from "./speech.js";
import { readySentence, startVoice, voiceFor, voiceOffLine, voiceOnLine, voiceParts, voiceSayMs, voiceStartHint, type Voice, type VoiceParts } from "./voice.js";

const card: SoundCard = { number: 1, device: "plughw:1,0", speakers: "pcmC1D0p", mixer: "controlC1" };

type Seen = { steps: string[]; texts: string[]; players: { device: string; rate: number }[]; written: number[][]; checkSignals: AbortSignal[]; speakSignals: AbortSignal[] };

type Options = {
  findCard?: () => Promise<SoundCard>;
  setVolume?: () => Promise<void>;
  check?: () => Promise<void>;
  speak?: () => Promise<void>;
  finish?: () => Promise<void>;
  volume?: number;
  voice?: string;
  signal?: AbortSignal;
  sayMs?: number;
};

function setUp(options: Options = {}) {
  const seen: Seen = { steps: [], texts: [], players: [], written: [], checkSignals: [], speakSignals: [] };
  const engine: SpeechEngine = {
    name: "Kokoro",
    sampleRate: 24_000,
    splitsSentences: false,
    async *speak(text, signal) {
      seen.speakSignals.push(signal);
      for await (const piece of text) {
        seen.steps.push("speak");
        seen.texts.push(piece);
        await options.speak?.();
        yield Uint8Array.of(1, 2, 3, 4);
      }
    },
    check: async (signal) => {
      seen.checkSignals.push(signal);
      seen.steps.push("check");
      await options.check?.();
    },
  };
  const player: Player = {
    write: async (sound) => {
      seen.steps.push("write");
      seen.written.push([...sound]);
    },
    finish: async () => {
      seen.steps.push("finish");
      await options.finish?.();
    },
    stop: () => {
      seen.steps.push("stop");
    },
  };
  return {
    seen,
    parts: {
      engine,
      voice: options.voice ?? "bm_george",
      volume: options.volume ?? 80,
      findCard: async () => {
        seen.steps.push("find");
        return options.findCard ? options.findCard() : card;
      },
      setVolume: async (number: number, volume: number) => {
        seen.steps.push(`volume ${number} ${volume}`);
        await options.setVolume?.();
      },
      startPlayer: (given: { device: string; rate: number }) => {
        seen.steps.push("start");
        seen.players.push(given);
        return player;
      },
      signal: options.signal ?? new AbortController().signal,
      sayMs: options.sayMs,
    },
  };
}

const folders: string[] = [];
after(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

function orStillWaiting<T>(work: Promise<T>, ms: number): Promise<T | "still waiting"> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<"still waiting">((resolve) => {
    timer = setTimeout(() => resolve("still waiting"), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function scratch(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "jarvis-voice-test-"));
  folders.push(folder);
  return folder;
}

test("Jarvis has one fixed sentence to say when his voice starts, and tells you how to start him with sound", () => {
  assert.equal(readySentence, "Jarvis is ready when you are.");
  assert.equal(voiceStartHint, "Start Jarvis with bash host/jarvis.sh, which passes them in");
});

test("the voice line names the engine, its voice, the card and the level it set", () => {
  assert.equal(voiceOnLine("Kokoro", "bm_george", card, 80), "Voice: Kokoro, voice bm_george, on sound card 1 (Master set to 80%)");
  assert.equal(voiceOnLine("Kokoro", "bm_fable(2)+bm_george(1)", { ...card, number: 0 }, 35), "Voice: Kokoro, voice bm_fable(2)+bm_george(1), on sound card 0 (Master set to 35%)");
  assert.equal(voiceOnLine("Kokoro", "bm_george", card, 0), "Voice: Kokoro, voice bm_george, on sound card 1 (Master set to 0% and muted)");
});

test("when the voice can't start, the line says the chat is text only, and why", () => {
  assert.equal(voiceOffLine("Couldn't reach Kokoro at http://kokoro:8880 (ENOTFOUND)"), "Voice: off, so this chat is text only. Couldn't reach Kokoro at http://kokoro:8880 (ENOTFOUND)");
});

test("starting the voice finds the card, sets the level, checks the engine, then says the sentence through that card, in that order", async () => {
  const { seen, parts } = setUp();
  assert.deepEqual(await startVoice(parts), { on: true, line: "Voice: Kokoro, voice bm_george, on sound card 1 (Master set to 80%)", speaker: { engine: parts.engine, device: "plughw:1,0", startPlayer: parts.startPlayer } });
  assert.deepEqual(seen.steps, ["find", "volume 1 80", "check", "speak", "start", "write", "finish"]);
  assert.deepEqual(seen.texts, [readySentence]);
  assert.deepEqual(seen.players, [{ device: "plughw:1,0", rate: 24_000 }]);
  assert.deepEqual(seen.written, [[1, 2, 3, 4]]);
});

test("the engine's check is handed the caller's own signal, and the sentence one that the caller can also call off", async () => {
  const stop = new AbortController();
  const { seen, parts } = setUp({ signal: stop.signal });
  await startVoice(parts);
  assert.deepEqual(seen.checkSignals, [stop.signal]);
  assert.equal(seen.speakSignals.length, 1);
  assert.equal(seen.speakSignals[0].aborted, false);
  stop.abort(new Error("later"));
  assert.equal(seen.speakSignals[0].aborted, true);
});

test("the first sentence has 45 seconds to be made and played, and if it takes longer the player is stopped and the voice is off, saying so", async () => {
  assert.equal(voiceSayMs, 45_000);
  const stuck = setUp({ sayMs: 150, finish: () => new Promise<void>(() => {}) });
  const started = performance.now();
  const voice = await orStillWaiting(startVoice(stuck.parts), 5000);
  assert.deepEqual(voice, { on: false, line: "Voice: off, so this chat is text only. His first sentence wasn't said within 0.15 seconds, so it was stopped" });
  assert.ok(performance.now() - started < 4000);
  assert.equal(stuck.seen.steps.includes("stop"), true);
  const slowEngine = setUp({ sayMs: 150, speak: () => new Promise<void>(() => {}) });
  const second = await orStillWaiting(startVoice(slowEngine.parts), 5000);
  assert.deepEqual(second, { on: false, line: "Voice: off, so this chat is text only. His first sentence wasn't said within 0.15 seconds, so it was stopped" });
  assert.equal(slowEngine.seen.steps.includes("start"), false);
});

test("the limit is for the sentence alone: time spent finding the card, setting the level and checking doesn't use it up", async () => {
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 400));
  const { parts } = setUp({ sayMs: 300, setVolume: wait, check: wait });
  assert.equal((await startVoice({ ...parts, findCard: async () => (await wait(), card) })).on, true);
});

test("called off in the same moment the sentence's time runs out, it still comes back as called off, not as a voice-off line", async () => {
  const stop = new AbortController();
  const { parts, seen } = setUp({ signal: stop.signal, sayMs: 100, finish: () => new Promise<void>(() => {}) });
  const startPlayer = (given: { device: string; rate: number }) => {
    const player = parts.startPlayer(given);
    return {
      ...player,
      stop: () => {
        player.stop();
        stop.abort(new Error("Phil pressed Ctrl+C"));
      },
    };
  };
  const outcome = await orStillWaiting(
    startVoice({ ...parts, startPlayer }).then(
      (voice) => voice.line,
      () => "called off",
    ),
    5000,
  );
  assert.equal(outcome, "called off");
  assert.equal(seen.steps.includes("stop"), true);
});

test("another failure isn't blamed on the time limit, even when the limit is short", async () => {
  const { parts } = setUp({
    sayMs: 5000,
    finish: async () => {
      throw new Error("aplay stopped with code 1");
    },
  });
  assert.deepEqual(await startVoice(parts), { on: false, line: "Voice: off, so this chat is text only. aplay stopped with code 1" });
});

test("the level set and the card played on are the ones found and asked for, not fixed ones", async () => {
  const other: SoundCard = { number: 0, device: "plughw:0,0", speakers: "pcmC0D0p", mixer: "controlC0" };
  const { seen, parts } = setUp({ findCard: async () => other, volume: 35, voice: "bm_fable" });
  assert.deepEqual(await startVoice(parts), { on: true, line: "Voice: Kokoro, voice bm_fable, on sound card 0 (Master set to 35%)", speaker: { engine: parts.engine, device: "plughw:0,0", startPlayer: parts.startPlayer } });
  assert.equal(seen.steps[1], "volume 0 35");
  assert.deepEqual(seen.players, [{ device: "plughw:0,0", rate: 24_000 }]);
});

test("with no sound devices, the voice is off with the reason, and nothing else is tried", async () => {
  const { seen, parts } = setUp({
    findCard: async () => {
      throw new Error(`No sound devices were passed in, so there's nothing to play on. ${voiceStartHint}`);
    },
  });
  assert.deepEqual(await startVoice(parts), { on: false, line: "Voice: off, so this chat is text only. No sound devices were passed in, so there's nothing to play on. Start Jarvis with bash host/jarvis.sh, which passes them in" });
  assert.deepEqual(seen.steps, ["find"]);
});

test("if the level can't be set, the voice is off and the engine isn't asked", async () => {
  const { seen, parts } = setUp({
    setVolume: async () => {
      throw new Error("Couldn't set Master on sound card 1: amixer: Unable to find simple control 'Master',0");
    },
  });
  assert.deepEqual(await startVoice(parts), { on: false, line: "Voice: off, so this chat is text only. Couldn't set Master on sound card 1: amixer: Unable to find simple control 'Master',0" });
  assert.deepEqual(seen.steps, ["find", "volume 1 80"]);
});

test("if the engine doesn't answer, Jarvis starts anyway with the voice off, and nothing is said or played", async () => {
  const { seen, parts } = setUp({
    check: async () => {
      throw new Error("Couldn't reach Kokoro at http://kokoro:8880 (ENOTFOUND)");
    },
  });
  assert.deepEqual(await startVoice(parts), { on: false, line: "Voice: off, so this chat is text only. Couldn't reach Kokoro at http://kokoro:8880 (ENOTFOUND)" });
  assert.deepEqual(seen.steps, ["find", "volume 1 80", "check"]);
});

test("if the engine answers but can't make the sentence, the voice is off and the speakers are left alone", async () => {
  const { seen, parts } = setUp({
    speak: async () => {
      throw new Error("Kokoro replied 400: Voice 'bm_nobody' not found. Available voices: af_heart, bm_george");
    },
  });
  assert.deepEqual(await startVoice(parts), { on: false, line: "Voice: off, so this chat is text only. Kokoro replied 400: Voice 'bm_nobody' not found. Available voices: af_heart, bm_george" });
  assert.deepEqual(seen.steps, ["find", "volume 1 80", "check", "speak"]);
});

test("if the sentence can't be played, the player is stopped and the voice is off", async () => {
  const { seen, parts } = setUp({
    finish: async () => {
      throw new Error("aplay stopped with code 1: audio open error: Device or resource busy");
    },
  });
  assert.deepEqual(await startVoice(parts), { on: false, line: "Voice: off, so this chat is text only. aplay stopped with code 1: audio open error: Device or resource busy" });
  assert.deepEqual(seen.steps, ["find", "volume 1 80", "check", "speak", "start", "write", "finish", "stop"]);
});

test("something thrown that isn't an error still gives a voice-off line", async () => {
  const { parts } = setUp({
    check: async () => {
      throw "no answer";
    },
  });
  assert.deepEqual(await startVoice(parts), { on: false, line: "Voice: off, so this chat is text only. no answer" });
});

test("a microphone passed in is never just a voice problem: it stops Jarvis, before the level is touched or anything is said", async () => {
  const microphone = new MicrophonePassedIn("A microphone device was passed in (pcmC1D0c). Jarvis must never have one, so this stops here. Check docker-compose.sound.yaml");
  const { seen, parts } = setUp({
    findCard: async () => {
      throw microphone;
    },
  });
  await assert.rejects(startVoice(parts), (error: unknown) => error === microphone);
  assert.deepEqual(seen.steps, ["find"]);
});

test("if starting is called off, that comes back as it is, not as a voice-off line", async () => {
  const stop = new AbortController();
  const why = new Error("Phil pressed Ctrl+C");
  const during = setUp({
    signal: stop.signal,
    check: async () => {
      stop.abort(why);
      throw new Error("Couldn't reach Kokoro at http://kokoro:8880");
    },
  });
  await assert.rejects(startVoice(during.parts), { message: "Couldn't reach Kokoro at http://kokoro:8880" });
  const speaking = new AbortController();
  const saying = setUp({
    signal: speaking.signal,
    finish: async () => {
      speaking.abort(why);
    },
  });
  await assert.rejects(startVoice(saying.parts), (error: unknown) => error === why);
  assert.equal(saying.seen.steps.includes("stop"), true);
});

test("the chat's own parts are Kokoro at its rate, in the voice and at the level from the settings, with the caller's signal", () => {
  const signal = new AbortController().signal;
  const parts = voiceParts({ kokoroVoice: "bm_fable", volume: 35 }, signal);
  assert.deepEqual([parts.engine.name, parts.engine.sampleRate, parts.engine.splitsSentences], [kokoroName, kokoroRate, false]);
  assert.deepEqual([parts.voice, parts.volume], ["bm_fable", 35]);
  assert.equal(parts.signal, signal);
});

test("the chat's own parts look for the card in a real folder, refuse a microphone there, and say how to start Jarvis when there's nothing", async () => {
  const signal = new AbortController().signal;
  const folder = await scratch();
  await assert.rejects(voiceParts({ kokoroVoice: "bm_george", volume: 80 }, signal, join(folder, "snd")).findCard(), { message: "No sound devices were passed in, so there's nothing to play on. Start Jarvis with bash host/jarvis.sh, which passes them in" });
  await writeFile(join(folder, "controlC3"), "");
  await writeFile(join(folder, "pcmC3D0p"), "");
  assert.deepEqual(await voiceParts({ kokoroVoice: "bm_george", volume: 80 }, signal, folder).findCard(), { number: 3, device: "plughw:3,0", speakers: "pcmC3D0p", mixer: "controlC3" });
  await writeFile(join(folder, "pcmC3D0c"), "");
  await assert.rejects(voiceParts({ kokoroVoice: "bm_george", volume: 80 }, signal, folder).findCard(), (error: unknown) => error instanceof MicrophonePassedIn);
});

test("with JARVIS_VOICE off, nothing is started, looked for or printed, and the chat counts as having no voice", async () => {
  const written: string[] = [];
  let started = 0;
  const start = async () => {
    started++;
    return { on: false as const, line: "Voice: should never be seen" };
  };
  assert.deepEqual(await voiceFor({ voice: "off", kokoroVoice: "bm_george", volume: 80 }, new AbortController().signal, (line) => written.push(line), start), { mode: "off", speaker: null });
  assert.deepEqual([started, written], [0, []]);
});

test("with JARVIS_VOICE on, the voice is started with the settings' voice, level and folder and the caller's signal, its line is printed once, and the chat counts as having that voice", async () => {
  const written: string[] = [];
  const given: VoiceParts[] = [];
  const signal = new AbortController().signal;
  const folder = await scratch();
  await writeFile(join(folder, "controlC4"), "");
  await writeFile(join(folder, "pcmC4D0p"), "");
  const start = async (parts: VoiceParts) => {
    given.push(parts);
    return { on: true as const, line: "Voice: Kokoro, voice bm_fable, on sound card 4 (Master set to 35%)", speaker: { engine: parts.engine, device: "plughw:4,0", startPlayer: parts.startPlayer } };
  };
  const chatVoice = await voiceFor({ voice: "kokoro", kokoroVoice: "bm_fable", volume: 35 }, signal, (line) => written.push(line), start, folder);
  assert.equal(chatVoice.mode, "kokoro");
  assert.deepEqual(chatVoice.speaker, { engine: given[0].engine, device: "plughw:4,0", startPlayer: given[0].startPlayer });
  assert.deepEqual(written, ["Voice: Kokoro, voice bm_fable, on sound card 4 (Master set to 35%)"]);
  assert.equal(given.length, 1);
  assert.deepEqual([given[0].engine.name, given[0].voice, given[0].volume], ["Kokoro", "bm_fable", 35]);
  assert.equal(given[0].signal, signal);
  assert.equal((await given[0].findCard()).number, 4);
});

test("if the voice couldn't start, its reason is still printed once and the chat counts as having no voice", async () => {
  const written: string[] = [];
  const start = async () => ({ on: false as const, line: "Voice: off, so this chat is text only. Couldn't reach Kokoro at http://kokoro:8880 (ENOTFOUND)" });
  assert.deepEqual(await voiceFor({ voice: "kokoro", kokoroVoice: "bm_george", volume: 80 }, new AbortController().signal, (line) => written.push(line), start), { mode: "off", speaker: null });
  assert.deepEqual(written, ["Voice: off, so this chat is text only. Couldn't reach Kokoro at http://kokoro:8880 (ENOTFOUND)"]);
});

test("the voice line is printed without control characters, whatever the reason in it holds", async () => {
  const written: string[] = [];
  const start = async () => ({ on: false as const, line: "Voice: off, so this chat is text only. \u001b[31mred\u0007 and\u009b gone" });
  await voiceFor({ voice: "kokoro", kokoroVoice: "bm_george", volume: 80 }, new AbortController().signal, (line) => written.push(line), start);
  assert.deepEqual(written, ["Voice: off, so this chat is text only. [31mred and gone"]);
});

test("a microphone, or starting being called off, comes straight through to whoever started the chat, with nothing printed", async () => {
  const written: string[] = [];
  const microphone = new MicrophonePassedIn("A microphone device was passed in (pcmC1D0c)");
  const start = async () => {
    throw microphone;
  };
  await assert.rejects(voiceFor({ voice: "kokoro", kokoroVoice: "bm_george", volume: 80 }, new AbortController().signal, (line) => written.push(line), start), (error: unknown) => error === microphone);
  assert.deepEqual(written, []);
});

test("left to itself, the chat's voice starts for real: with no sound devices in the folder it says how to start Jarvis, and the chat has no voice", async () => {
  const written: string[] = [];
  const missing = join(await scratch(), "snd");
  assert.deepEqual(await voiceFor({ voice: "kokoro", kokoroVoice: "bm_george", volume: 80 }, new AbortController().signal, (line) => written.push(line), undefined, missing), { mode: "off", speaker: null });
  assert.deepEqual(written, ["Voice: off, so this chat is text only. No sound devices were passed in, so there's nothing to play on. Start Jarvis with bash host/jarvis.sh, which passes them in"]);
});

test("end to end with the chat's own parts: a pretend amixer and aplay on the path and a stand-in Kokoro get the level, the request and the sound", async (context) => {
  const folder = await scratch();
  const snd = join(folder, "snd");
  const bin = join(folder, "bin");
  await mkdir(snd);
  await mkdir(bin);
  await writeFile(join(snd, "controlC2"), "");
  await writeFile(join(snd, "pcmC2D0p"), "");
  const mixerLog = join(folder, "amixer.log");
  const playerLog = join(folder, "aplay.log");
  const played = join(folder, "aplay.raw");
  await writeFile(join(bin, "amixer"), `#!/bin/sh\necho "$@" > ${JSON.stringify(mixerLog)}\n`);
  await writeFile(join(bin, "aplay"), `#!/bin/sh\necho "$@" > ${JSON.stringify(playerLog)}\ntimeout 5 cat > ${JSON.stringify(played)}\n`);
  await chmod(join(bin, "amixer"), 0o755);
  await chmod(join(bin, "aplay"), 0o755);
  const asked: { url: string; body: unknown }[] = [];
  const speech = Uint8Array.from({ length: 2000 }, (_unused, index) => index % 251);
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit = {}) => {
    asked.push({ url, body: typeof options.body === "string" ? JSON.parse(options.body) : null });
    return url.endsWith("/health") ? Response.json({ status: "healthy" }) : new Response(speech, { headers: { "content-type": "audio/pcm" } });
  });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path ?? ""}`;
  let voice: Voice;
  try {
    voice = await startVoice(voiceParts({ kokoroVoice: "bm_fable", volume: 65 }, new AbortController().signal, snd));
  } finally {
    process.env.PATH = path;
  }
  assert.equal(voice.line, "Voice: Kokoro, voice bm_fable, on sound card 2 (Master set to 65%)");
  assert.equal(voice.on && voice.speaker.device, "plughw:2,0");
  assert.equal(voice.on && voice.speaker.engine.name, "Kokoro");
  assert.equal(await readFile(mixerLog, "utf8"), "-q -c 2 sset Master 65% unmute\n");
  assert.equal(await readFile(playerLog, "utf8"), "-q -t raw -f S16_LE -c 1 -r 24000 -D plughw:2,0\n");
  assert.deepEqual(await readFile(played), Buffer.from(speech));
  assert.deepEqual(asked, [
    { url: "http://kokoro:8880/health", body: null },
    { url: "http://kokoro:8880/v1/audio/speech", body: { model: "kokoro", input: readySentence, voice: "bm_fable", response_format: "pcm", stream: false } },
  ]);
});
