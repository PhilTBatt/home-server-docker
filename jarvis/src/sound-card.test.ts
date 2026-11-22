import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { findSoundCard, MicrophonePassedIn, mixerCommand, mixerTimeoutMs, runCommand, setVolume, soundDir, soundTestHint, volumeArgs, volumeControl } from "./sound-card.js";

const listing = (names: string[]) => async () => names;

const folders: string[] = [];
after(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "jarvis-sound-card-test-"));
  folders.push(folder);
  return folder;
}

test("sound devices are looked for in /dev/snd, and the volume is set with amixer on Master", () => {
  assert.equal(soundDir, "/dev/snd");
  assert.equal(mixerCommand, "amixer");
  assert.equal(volumeControl, "Master");
  assert.equal(mixerTimeoutMs, 10_000);
});

test("finds the one card passed in, with its speakers and mixer", async () => {
  assert.deepEqual(await findSoundCard("/dev/snd", listing(["controlC1", "pcmC1D0p"])), { number: 1, device: "plughw:1,0", speakers: "pcmC1D0p", mixer: "controlC1" });
  assert.deepEqual(await findSoundCard("/dev/snd", listing(["pcmC0D0p", "controlC0"])), { number: 0, device: "plughw:0,0", speakers: "pcmC0D0p", mixer: "controlC0" });
  assert.deepEqual(await findSoundCard("/dev/snd", listing(["controlC12", "pcmC12D0p"])), { number: 12, device: "plughw:12,0", speakers: "pcmC12D0p", mixer: "controlC12" });
});

test("other nodes that can't record don't get in the way", async () => {
  assert.equal((await findSoundCard("/dev/snd", listing(["controlC1", "pcmC1D0p", "timer", "seq", "hwC1D0", "by-path"]))).number, 1);
});

test("reads the folder it's given", async () => {
  const seen: string[] = [];
  await findSoundCard("/somewhere/snd", async (dir) => {
    seen.push(dir);
    return ["controlC1", "pcmC1D0p"];
  });
  assert.deepEqual(seen, ["/somewhere/snd"]);
});

test("reads a real folder by default with readdir", async () => {
  const folder = await scratch();
  await writeFile(join(folder, "controlC3"), "");
  await writeFile(join(folder, "pcmC3D0p"), "");
  assert.equal((await findSoundCard(folder)).number, 3);
});

test("with no sound devices passed in, it says to start the sound test the right way", async () => {
  const missing = join(await scratch(), "snd");
  await assert.rejects(findSoundCard(missing), { message: "No sound devices were passed in, so there's nothing to play on. Start the sound test with bash host/jarvis.sh sound-test" });
});

test("whoever asks for the card can say how to start it the right way instead", async () => {
  const missing = join(await scratch(), "snd");
  assert.equal(soundTestHint, "Start the sound test with bash host/jarvis.sh sound-test");
  await assert.rejects(findSoundCard(missing, undefined, "Start Jarvis with bash host/jarvis.sh"), { message: "No sound devices were passed in, so there's nothing to play on. Start Jarvis with bash host/jarvis.sh" });
  const gone = async () => {
    throw Object.assign(new Error("ENOENT: no such file or directory, scandir '/dev/snd'"), { code: "ENOENT" });
  };
  await assert.rejects(findSoundCard("/dev/snd", gone, "Do this instead"), { message: "No sound devices were passed in, so there's nothing to play on. Do this instead" });
  assert.equal((await findSoundCard("/dev/snd", listing(["controlC1", "pcmC1D0p"]), "Do this instead")).number, 1);
});

test("a folder that can't be read for another reason says so", async () => {
  const failing = async () => {
    throw Object.assign(new Error("EACCES: permission denied, scandir '/dev/snd'"), { code: "EACCES" });
  };
  await assert.rejects(findSoundCard("/dev/snd", failing), { message: "Couldn't read /dev/snd: EACCES: permission denied, scandir '/dev/snd'" });
});

test("any microphone device stops it, naming each one, even alongside good speakers", async () => {
  await assert.rejects(findSoundCard("/dev/snd", listing(["controlC1", "pcmC1D0p", "pcmC1D0c"])), { message: "A microphone device was passed in (pcmC1D0c). Jarvis must never have one, so this stops here. Check docker-compose.sound.yaml" });
  await assert.rejects(findSoundCard("/dev/snd", listing(["pcmC2D0c", "controlC1", "pcmC1D0p", "pcmC0D3c"])), { message: "A microphone device was passed in (pcmC0D3c, pcmC2D0c). Jarvis must never have one, so this stops here. Check docker-compose.sound.yaml" });
  await assert.rejects(findSoundCard("/dev/snd", listing(["pcmC1D0c"])), { message: /A microphone device was passed in \(pcmC1D0c\)/ });
});

test("a microphone is its own kind of error, so a caller can tell it from every other problem", async () => {
  await assert.rejects(findSoundCard("/dev/snd", listing(["controlC1", "pcmC1D0p", "pcmC1D0c"])), (error: unknown) => error instanceof MicrophonePassedIn && error instanceof Error);
  await assert.rejects(findSoundCard("/dev/snd", listing(["pcmC1D0c"]), "Do this instead"), (error: unknown) => error instanceof MicrophonePassedIn);
  const missing = join(await scratch(), "snd");
  const others = [() => findSoundCard("/dev/snd", listing([])), () => findSoundCard("/dev/snd", listing(["controlC1"])), () => findSoundCard("/dev/snd", listing(["controlC0", "controlC1"])), () => findSoundCard(missing)];
  for (const other of others) await assert.rejects(other(), (error: unknown) => error instanceof Error && !(error instanceof MicrophonePassedIn));
});

test("names that only look a bit like a microphone aren't taken for one", async () => {
  assert.equal((await findSoundCard("/dev/snd", listing(["controlC1", "pcmC1D0p", "pcmC1D0cx", "xpcmC1D0c"]))).number, 1);
});

test("no mixer passed in is refused, since the speakers can't be opened without it", async () => {
  await assert.rejects(findSoundCard("/dev/snd", listing(["pcmC1D0p"])), { message: "No sound card's mixer was passed in, and the speakers can't be opened without it" });
  await assert.rejects(findSoundCard("/dev/snd", listing([])), { message: "No sound card's mixer was passed in, and the speakers can't be opened without it" });
  await assert.rejects(findSoundCard("/dev/snd", listing(["controlCx", "controlC", "controlC1x", "xcontrolC1", "pcmC1D0p"])), { message: "No sound card's mixer was passed in, and the speakers can't be opened without it" });
});

test("two cards are refused, since it isn't clear which to use", async () => {
  await assert.rejects(findSoundCard("/dev/snd", listing(["controlC0", "controlC1", "pcmC0D0p", "pcmC1D0p"])), { message: "More than one sound card was passed in (controlC0, controlC1), so it isn't clear which to use" });
});

test("more than one card is refused, naming them in order", async () => {
  await assert.rejects(findSoundCard("/dev/snd", listing(["controlC10", "controlC1", "controlC2", "pcmC1D0p"])), { message: "More than one sound card was passed in (controlC1, controlC2, controlC10), so it isn't clear which to use" });
});

test("a mixer without its speakers is refused", async () => {
  await assert.rejects(findSoundCard("/dev/snd", listing(["controlC1"])), { message: "Sound card 1's mixer was passed in, but not its speakers (pcmC1D0p)" });
  await assert.rejects(findSoundCard("/dev/snd", listing(["controlC1", "pcmC0D0p", "pcmC1D3p"])), { message: "Sound card 1's mixer was passed in, but not its speakers (pcmC1D0p)" });
});

test("the volume command sets Master on the card and unmutes it, or mutes it at 0", () => {
  assert.deepEqual(volumeArgs(1, 80), ["-q", "-c", "1", "sset", "Master", "80%", "unmute"]);
  assert.deepEqual(volumeArgs(0, 100), ["-q", "-c", "0", "sset", "Master", "100%", "unmute"]);
  assert.deepEqual(volumeArgs(1, 1), ["-q", "-c", "1", "sset", "Master", "1%", "unmute"]);
  assert.deepEqual(volumeArgs(1, 0), ["-q", "-c", "1", "sset", "Master", "0%", "mute"]);
});

test("setting the volume runs amixer once with those arguments", async () => {
  const runs: [string, readonly string[]][] = [];
  await setVolume(1, 80, async (command, args) => {
    runs.push([command, args]);
  });
  await setVolume(2, 45, async (command, args) => {
    runs.push([command, args]);
  });
  assert.deepEqual(runs, [
    ["amixer", ["-q", "-c", "1", "sset", "Master", "80%", "unmute"]],
    ["amixer", ["-q", "-c", "2", "sset", "Master", "45%", "unmute"]],
  ]);
});

test("a bad card or volume is refused before amixer runs", async () => {
  let runs = 0;
  const run = async () => {
    runs++;
  };
  for (const card of [-1, 1.5, Number.NaN]) await assert.rejects(setVolume(card, 80, run), { message: `A sound card's number must be a whole number from 0, not ${card}` });
  for (const volume of [-1, 101, 50.5, Number.NaN]) await assert.rejects(setVolume(1, volume, run), { message: `The volume must be a whole number from 0 to 100, not ${volume}` });
  assert.equal(runs, 0);
  await setVolume(0, 0, run);
  await setVolume(1, 100, run);
  assert.equal(runs, 2);
});

test("amixer failing is reported with the card and control", async () => {
  await assert.rejects(
    setVolume(1, 80, async () => {
      throw new Error("Unable to find simple control 'Master',0");
    }),
    { message: "Couldn't set Master on sound card 1: Unable to find simple control 'Master',0" },
  );
});

test("running a real command that works resolves", async () => {
  await runCommand(process.execPath, ["-e", "process.exit(0)"]);
});

test("the mixer gets only PATH from Jarvis's environment, never his keys or tokens", async () => {
  process.env.JARVIS_TEST_SECRET = "not for amixer";
  try {
    await runCommand(process.execPath, ["-e", "process.exit(Object.keys(process.env).join(',') === 'PATH' && process.env.PATH === " + JSON.stringify(process.env.PATH) + " ? 0 : 3)"]);
  } finally {
    delete process.env.JARVIS_TEST_SECRET;
  }
});

test("running a real command that fails reports what it said, tidied", async () => {
  await assert.rejects(runCommand(process.execPath, ["-e", "process.stderr.write('amixer: Invalid card number.\\n\\n');process.exit(1)"]), { message: "amixer: Invalid card number." });
});

test("running a real command that fails silently still reports something", async () => {
  await assert.rejects(runCommand(process.execPath, ["-e", "process.exit(4)"]), (error: Error) => error.message.includes("Command failed"));
});

test("running a real command that takes too long stops it and says so", async () => {
  const started = performance.now();
  await assert.rejects(runCommand(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"], 200), { message: `${process.execPath} took longer than 0.2 seconds` });
  assert.ok(performance.now() - started < 5000);
});

test("running a command that isn't there says it isn't installed", async () => {
  await assert.rejects(runCommand("jarvis-no-such-mixer", []), { message: "jarvis-no-such-mixer isn't installed here. Sound plays from Jarvis's own image, which bash host/jarvis.sh sound-test builds" });
});

test("a pretend amixer on the path is what setVolume runs by default", async () => {
  const folder = await scratch();
  const bin = join(folder, "bin");
  await mkdir(bin);
  const log = join(folder, "amixer.log");
  await writeFile(join(bin, "amixer"), `#!/bin/sh\necho "$@" > ${JSON.stringify(log)}\n`);
  await chmod(join(bin, "amixer"), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path ?? ""}`;
  try {
    await setVolume(1, 80);
  } finally {
    process.env.PATH = path;
  }
  assert.equal(await readFile(log, "utf8"), "-q -c 1 sset Master 80% unmute\n");
});
