import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { applyMicSettings, findMicCard, micBoostArgs, micLevelArgs, mixerCommand, recorderArgs, recorderCommand, runCommand, setMicBoost, setMicLevel, soundDir, SpeakersPassedIn, startHint } from "./mic-card.js";

const folders: string[] = [];
after(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "ears-mic-card-test-"));
  folders.push(folder);
  return folder;
}

const listing = (names: string[]) => async () => names;

test("the microphone is looked for in /dev/snd, recorded with arecord, and its level set with amixer", () => {
  assert.deepEqual([soundDir, recorderCommand, mixerCommand], ["/dev/snd", "arecord", "amixer"]);
  assert.equal(startHint, "Start ears with bash host/ears.sh start, which passes in the card that EARS_SOUND_CARD names");
});

test("finds the one card passed in, with its microphone and mixer", async () => {
  assert.deepEqual(await findMicCard("/x", listing(["by-path", "controlC1", "pcmC1D0c", "timer", "seq"])), { number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" });
  assert.deepEqual(await findMicCard("/x", listing(["pcmC12D0c", "controlC12"])), { number: 12, device: "plughw:12,0", capture: "pcmC12D0c", mixer: "controlC12" });
});

test("any speaker device stops it, naming each one, even alongside a good microphone", async () => {
  await assert.rejects(findMicCard("/x", listing(["controlC1", "pcmC1D0c", "pcmC1D0p", "pcmC0D3p"])), (error: unknown) => {
    assert.ok(error instanceof SpeakersPassedIn);
    assert.equal(error.message, "A speaker device was passed in (pcmC0D3p, pcmC1D0p). Ears only ever gets a microphone, so this stops here. Check docker-compose.mic.yaml");
    return true;
  });
});

test("no devices at all, no mixer, two cards or a mixer without its microphone are each refused, saying why", async () => {
  await assert.rejects(findMicCard("/x", async () => Promise.reject(Object.assign(new Error("gone"), { code: "ENOENT" }))), { message: `No sound devices were passed in, so there's nothing to record from. ${startHint}` });
  await assert.rejects(findMicCard("/x", async () => Promise.reject(Object.assign(new Error("EACCES: permission\u0007 denied"), { code: "EACCES" }))), { message: "Couldn't read /x: EACCES: permission denied" });
  await assert.rejects(findMicCard("/x", listing(["pcmC1D0c"])), { message: `No sound card's mixer was passed in, and its microphone can't be opened without it. ${startHint}` });
  await assert.rejects(findMicCard("/x", listing(["controlC2", "controlC1", "pcmC1D0c"])), { message: "More than one sound card was passed in (controlC1, controlC2), so it isn't clear which to record from" });
  await assert.rejects(findMicCard("/x", listing(["controlC1", "pcmC1D1c", "pcmC2D0c"])), { message: "Sound card 1's mixer was passed in, but not its microphone (pcmC1D0c)" });
});

test("names that only look a bit like a device aren't taken for one", async () => {
  assert.deepEqual(await findMicCard("/x", listing(["controlC1", "pcmC1D0c", "pcmC1D0cp", "xpcmC1D0p", "controlC1x", "controlCx"])), { number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" });
});

test("reads a real folder by default", async () => {
  const folder = await scratch();
  await writeFile(join(folder, "controlC3"), "");
  await writeFile(join(folder, "pcmC3D0c"), "");
  assert.equal((await findMicCard(folder)).number, 3);
  await assert.rejects(findMicCard(join(folder, "missing")), { message: `No sound devices were passed in, so there's nothing to record from. ${startHint}` });
});

test("the recorder is arecord on the card, giving raw 16-bit mono at 16,000 Hz on its output", () => {
  assert.deepEqual(recorderArgs({ number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" }), ["-q", "-D", "plughw:1,0", "-t", "raw", "-f", "S16_LE", "-r", "16000", "-c", "1"]);
});

test("the level is set on the named control, switching capture on, or off at 0", () => {
  assert.deepEqual(micLevelArgs(1, "Capture", 80), ["-q", "-c", "1", "sset", "Capture", "80%", "cap"]);
  assert.deepEqual(micLevelArgs(2, "Internal Mic Boost", 0), ["-q", "-c", "2", "sset", "Internal Mic Boost", "0%", "nocap"]);
});

test("setting the level runs amixer once, and a bad card or level is refused before it runs", async () => {
  const ran: (readonly string[])[] = [];
  const run = async (command: string, args: readonly string[]) => {
    ran.push([command, ...args]);
  };
  await setMicLevel(1, "Capture", 80, run);
  assert.deepEqual(ran, [["amixer", "-q", "-c", "1", "sset", "Capture", "80%", "cap"]]);
  await assert.rejects(setMicLevel(-1, "Capture", 80, run), { message: "A sound card's number must be a whole number from 0, not -1" });
  await assert.rejects(setMicLevel(1.5, "Capture", 80, run), { message: "A sound card's number must be a whole number from 0, not 1.5" });
  await assert.rejects(setMicLevel(1, "Capture", 101, run), { message: "The microphone's level must be a whole number from 0 to 100, not 101" });
  await assert.rejects(setMicLevel(1, "Capture", 5.5, run), { message: "The microphone's level must be a whole number from 0 to 100, not 5.5" });
  assert.equal(ran.length, 1);
});

test("amixer failing says which control and card, and what to set instead", async () => {
  await assert.rejects(setMicLevel(1, "Capture", 80, async () => Promise.reject(new Error("Unable to find simple control 'Capture',0"))), {
    message: "Couldn't set Capture on sound card 1: Unable to find simple control 'Capture',0. Set EARS_MIC_CONTROL to one of the card's controls, or EARS_MIC_LEVEL=keep to leave its level alone",
  });
});

test("the boost is set on its control as a raw number of steps, which is how amixer takes a plain number", () => {
  assert.deepEqual(micBoostArgs(1, "Internal Mic Boost", 1), ["-q", "-c", "1", "sset", "Internal Mic Boost", "1"]);
  assert.deepEqual(micBoostArgs(3, "Mic Boost", 0), ["-q", "-c", "3", "sset", "Mic Boost", "0"]);
});

test("setting the boost runs amixer once, and a bad card or number of steps is refused before it runs", async () => {
  const ran: (readonly string[])[] = [];
  const run = async (command: string, args: readonly string[]) => {
    ran.push([command, ...args]);
  };
  await setMicBoost(1, "Internal Mic Boost", 2, run);
  await setMicBoost(0, "Mic Boost", 10, run);
  assert.deepEqual(ran, [
    ["amixer", "-q", "-c", "1", "sset", "Internal Mic Boost", "2"],
    ["amixer", "-q", "-c", "0", "sset", "Mic Boost", "10"],
  ]);
  await assert.rejects(setMicBoost(-1, "Mic Boost", 1, run), { message: "A sound card's number must be a whole number from 0, not -1" });
  await assert.rejects(setMicBoost(2.5, "Mic Boost", 1, run), { message: "A sound card's number must be a whole number from 0, not 2.5" });
  await assert.rejects(setMicBoost(1, "Mic Boost", 11, run), { message: "The microphone's boost must be a whole number of steps from 0 to 10, not 11" });
  await assert.rejects(setMicBoost(1, "Mic Boost", -1, run), { message: "The microphone's boost must be a whole number of steps from 0 to 10, not -1" });
  await assert.rejects(setMicBoost(1, "Mic Boost", 0.5, run), { message: "The microphone's boost must be a whole number of steps from 0 to 10, not 0.5" });
  assert.equal(ran.length, 2);
});

test("amixer failing on the boost says which control and card, and what to set instead", async () => {
  await assert.rejects(setMicBoost(1, "Internal Mic Boost", 1, async () => Promise.reject(new Error("Unable to find simple control 'Internal Mic Boost',0"))), {
    message: "Couldn't set Internal Mic Boost on sound card 1: Unable to find simple control 'Internal Mic Boost',0. Set EARS_MIC_BOOST_CONTROL to one of the card's controls, or EARS_MIC_BOOST=keep to leave its boost alone",
  });
});

test("the microphone's settings set the level, then the boost, each only when it isn't keep, and say what they did", async () => {
  const cases = [
    [{ micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost" }, [["level", 1, "Capture", 80]], "Capture set to 80%"],
    [{ micLevel: "keep", micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost" }, [], "at its own level"],
    [{ micLevel: 100, micControl: "Mic", micBoost: 2, micBoostControl: "Mic Boost" }, [["level", 1, "Mic", 100], ["boost", 1, "Mic Boost", 2]], "Mic set to 100%, Mic Boost set to 2"],
    [{ micLevel: "keep", micControl: "Capture", micBoost: 0, micBoostControl: "Internal Mic Boost" }, [["boost", 1, "Internal Mic Boost", 0]], "Capture at its own level, Internal Mic Boost set to 0"],
  ] as const;
  for (const [settings, calls, said] of cases) {
    const made: unknown[] = [];
    const told = await applyMicSettings(1, settings, { setLevel: async (...args) => void made.push(["level", ...args]), setBoost: async (...args) => void made.push(["boost", ...args]) });
    assert.deepEqual(made, calls);
    assert.equal(told, said);
  }
});

test("a level that can't be set stops the settings before the boost", async () => {
  let boosted = false;
  await assert.rejects(
    applyMicSettings(2, { micLevel: 80, micControl: "Capture", micBoost: 1, micBoostControl: "Internal Mic Boost" }, { setLevel: async () => Promise.reject(new Error("no Capture")), setBoost: async () => void (boosted = true) }),
    { message: "no Capture" },
  );
  assert.equal(boosted, false);
  await assert.rejects(applyMicSettings(2, { micLevel: 80, micControl: "Capture", micBoost: 1, micBoostControl: "Internal Mic Boost" }, { setLevel: async () => {}, setBoost: async () => Promise.reject(new Error("no boost")) }), { message: "no boost" });
});

test("running a real command: one that works resolves, one that fails says what it said, tidied, or something when it says nothing", async () => {
  const folder = await scratch();
  const works = join(folder, "works");
  const fails = join(folder, "fails");
  const quiet = join(folder, "quiet");
  await writeFile(works, "#!/bin/sh\nexit 0\n");
  await writeFile(fails, "#!/bin/sh\nprintf 'amixer: Unable\\tto find\\n  control\\n' >&2\nexit 1\n");
  await writeFile(quiet, "#!/bin/sh\nexit 3\n");
  await Promise.all([works, fails, quiet].map((file) => chmod(file, 0o755)));
  await runCommand(works, []);
  await assert.rejects(runCommand(fails, []), { message: "amixer: Unable to find control" });
  await assert.rejects(runCommand(quiet, []), (error: unknown) => error instanceof Error && error.message.startsWith("Command failed"));
});

test("running a command that takes too long stops it and says so, and one that isn't there says it isn't installed", async () => {
  const folder = await scratch();
  const slow = join(folder, "slow");
  await writeFile(slow, "#!/bin/sh\nsleep 5\n");
  await chmod(slow, 0o755);
  await assert.rejects(runCommand(slow, [], 100), { message: `${slow} took longer than 0.1 seconds` });
  await assert.rejects(runCommand("ears-no-such-mixer", []), { message: "ears-no-such-mixer isn't installed here. It comes with ears's own image, which bash host/ears.sh start builds" });
});

test("a command is given only PATH from ears's settings, so the token never reaches it", async () => {
  const folder = await scratch();
  const tell = join(folder, "tell");
  await writeFile(tell, `#!/bin/sh\nenv > ${join(folder, "env")}\nexit 1\n`);
  await chmod(tell, 0o755);
  process.env.EARS_TOKEN_TEST_ONLY = "secret";
  try {
    await assert.rejects(runCommand(tell, []));
  } finally {
    delete process.env.EARS_TOKEN_TEST_ONLY;
  }
  const seen = await readFile(join(folder, "env"), "utf8");
  assert.equal(seen.includes("secret"), false);
  assert.ok(seen.includes("PATH="));
});
