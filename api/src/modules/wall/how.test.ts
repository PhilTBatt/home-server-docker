import assert from "node:assert/strict";
import test from "node:test";
import type { Features } from "../../config.js";
import { howPage, reachRules, stepRules, wordRules, type Part } from "./how.js";

const allOn = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true, morning: true, switches: true } satisfies Features;

const told = (switches: Record<string, string>, ageMs = 60_000) => ({ switches: Object.entries(switches), ageMs });

const byId = (parts: Part[]) => Object.fromEntries(parts.map((part) => [part.id, part]));

const everything = {
  JARVIS_HUB_TOOLS: "on",
  JARVIS_HUB_ACTIONS: "off",
  JARVIS_SESSION_NOTES: "on",
  JARVIS_VOICE: "kokoro",
  JARVIS_SPEECH_BUNDLE: "on",
  JARVIS_EARS: "wake",
  JARVIS_TURN_CHECK: "on",
  JARVIS_TRAIN_ALERTS: "on",
  JARVIS_GUEST: "on",
  JARVIS_MODES: "on",
  JARVIS_REMINDERS: "on",
  JARVIS_MORNING: "on",
  JARVIS_PHONE: "on",
  JARVIS_WALL: "on",
  JARVIS_PROJECTOR: "on",
  JARVIS_WALL_PAGES: "on",
  JARVIS_WEB: "auto",
  JARVIS_SESSIONS: "on",
  JARVIS_CLOCK: "on",
  JARVIS_ENGINE: "api",
};

test("the page has every step of the line, everything he can reach and every group of code words, in the board's order", () => {
  const page = howPage(allOn, told(everything));
  assert.deepEqual(page.steps.map((part) => part.id), ["mic", "wake", "stop", "whisper", "words", "claude", "sentences", "voice", "speakers"]);
  assert.deepEqual(page.reach.map((part) => part.id), ["tools", "brain", "notes", "lookups", "wall", "phone", "modes", "trains", "reminders", "morning", "sessions", "opens"]);
  assert.deepEqual(page.words.map((part) => part.id), ["notes", "phone", "trains", "server", "clock", "lookup", "projector", "pages", "modes", "guest"]);
  assert.deepEqual([page.kind, page.told, page.ageMs], ["how", true, 60_000]);
  assert.equal(new Set([...stepRules, ...reachRules].map((rule) => rule.id)).size, stepRules.length + reachRules.length);
  assert.equal(new Set(wordRules.map((rule) => rule.id)).size, wordRules.length);
});

test("with everything on in Jarvis and the hub, every part is on, with the choice words that change how it's drawn", () => {
  const page = howPage(allOn, told(everything));
  for (const part of [...page.steps, ...page.reach, ...page.words]) assert.deepEqual([part.id, part.state, part.blockedBy], [part.id, "on", []]);
  const steps = byId(page.steps);
  const reach = byId(page.reach);
  assert.deepEqual([steps.mic.value, steps.stop.value, steps.claude.value, steps.sentences.value, steps.voice.value], ["wake", "on", "api", "on", "kokoro"]);
  assert.deepEqual([reach.tools.value, reach.lookups.value, reach.brain.value], ["off", "auto", null]);
});

test("until Jarvis has told the hub his switches, only Claude and the brain are known, and everything else says it wasn't told", () => {
  const page = howPage(allOn, null);
  assert.deepEqual([page.told, page.ageMs], [false, null]);
  for (const part of [...page.steps, ...page.reach, ...page.words]) {
    const always = part.id === "claude" || part.id === "brain";
    assert.deepEqual([part.id, part.state, part.value, part.blockedBy], [part.id, always ? "on" : "untold", null, []]);
  }
});

test("with ears off he's typed to: the mic, the wake word, hearing you stop, Whisper and the code words are off, and the phone waits on ears", () => {
  const page = howPage(allOn, told({ ...everything, JARVIS_EARS: "off" }));
  const steps = byId(page.steps);
  for (const id of ["mic", "wake", "stop", "whisper", "words"]) assert.equal(steps[id].state, "off", id);
  assert.equal(steps.mic.value, null);
  assert.deepEqual(byId(page.reach).phone, { id: "phone", state: "blocked", value: null, blockedBy: ["JARVIS_EARS"] });
  for (const part of page.words) assert.deepEqual([part.id, part.state, part.blockedBy], [part.id, "blocked", ["JARVIS_EARS"]]);
});

test("the talk button alone listens but has no wake word, and a turn check is only a choice word on hearing you stop", () => {
  const steps = byId(howPage(allOn, told({ ...everything, JARVIS_EARS: "push", JARVIS_TURN_CHECK: "off" })).steps);
  assert.deepEqual([steps.mic.state, steps.mic.value, steps.wake.state, steps.stop.state, steps.stop.value, steps.whisper.state], ["on", "push", "off", "on", "off", "on"]);
});

test("with his voice off there are no sentences, voice or speakers, whichever voice was named", () => {
  const steps = byId(howPage(allOn, told({ ...everything, JARVIS_VOICE: "off" })).steps);
  for (const id of ["sentences", "voice", "speakers"]) assert.equal(steps[id].state, "off", id);
  assert.equal(steps.voice.value, null);
  assert.equal(byId(howPage(allOn, told({ ...everything, JARVIS_VOICE: "piper" })).steps).voice.value, "piper");
});

test("a part Jarvis has on but whose hub switch is off is blocked, naming the hub's switch", () => {
  const hubOff = { ...allOn, wall: false, talk: false, modes: false, trainAlerts: false, reminders: false, morning: false, projector: false, sessions: false, memoryUpload: false, findPhone: false, trains: false };
  const page = howPage(hubOff, told(everything));
  const reach = byId(page.reach);
  assert.deepEqual(
    ["wall", "phone", "modes", "trains", "reminders", "morning", "sessions", "opens"].map((id) => [id, reach[id].state, reach[id].blockedBy]),
    [
      ["wall", "blocked", ["WALL"]],
      ["phone", "blocked", ["TALK"]],
      ["modes", "blocked", ["MODES"]],
      ["trains", "blocked", ["TRAIN_ALERTS"]],
      ["reminders", "blocked", ["REMINDERS"]],
      ["morning", "blocked", ["MORNING"]],
      ["sessions", "blocked", ["SESSIONS"]],
      ["opens", "blocked", ["WALL"]],
    ],
  );
  const words = byId(page.words);
  assert.deepEqual(
    ["notes", "phone", "trains", "server", "clock", "projector", "pages", "modes", "guest"].map((id) => [id, words[id].state, words[id].blockedBy]),
    [
      ["notes", "blocked", ["MEMORY_UPLOAD"]],
      ["phone", "blocked", ["FIND_PHONE"]],
      ["trains", "blocked", ["TRAINS"]],
      ["server", "on", []],
      ["clock", "on", []],
      ["projector", "blocked", ["PROJECTOR"]],
      ["pages", "blocked", ["WALL"]],
      ["modes", "blocked", ["MODES"]],
      ["guest", "on", []],
    ],
  );
});

test("without the hub's tools, everything that goes through the hub is blocked by JARVIS_HUB_TOOLS, first", () => {
  const page = howPage({ ...allOn, talk: false }, told({ ...everything, JARVIS_HUB_TOOLS: "off" }));
  const reach = byId(page.reach);
  assert.equal(reach.tools.state, "off");
  assert.deepEqual(reach.phone.blockedBy, ["JARVIS_HUB_TOOLS", "TALK"]);
  for (const id of ["wall", "modes", "trains", "reminders", "morning", "sessions", "opens"]) assert.deepEqual(reach[id].blockedBy, ["JARVIS_HUB_TOOLS"], id);
  const words = byId(page.words);
  for (const id of ["notes", "phone", "trains", "server"]) assert.equal(words[id].state, "off", id);
  assert.deepEqual(words.pages.blockedBy, ["JARVIS_HUB_TOOLS"]);
  assert.equal(words.lookup.state, "on");
});

test("pages he opens only when asked aren't something he does unasked, but their words still work", () => {
  const page = howPage(allOn, told({ ...everything, JARVIS_WALL_PAGES: "words" }));
  assert.deepEqual([byId(page.reach).opens.state, byId(page.words).pages.state], ["off", "on"]);
  assert.equal(byId(howPage(allOn, told(everything)).reach).opens.state, "on");
});

test("a switch Jarvis didn't send counts as off, and a needed one he didn't send blocks", () => {
  const page = howPage(allOn, told({ JARVIS_PHONE: "on", JARVIS_HUB_TOOLS: "on" }));
  const reach = byId(page.reach);
  assert.deepEqual([reach.phone.state, reach.phone.blockedBy], ["blocked", ["JARVIS_EARS"]]);
  assert.deepEqual([reach.wall.state, reach.notes.state, reach.tools.state, reach.tools.value], ["off", "off", "on", null]);
  assert.equal(byId(page.steps).claude.value, null, "an older Jarvis that doesn't send his engine leaves it unsaid");
});

test("only the choice words the page knows are passed on, so an unexpected word is never shown", () => {
  const page = howPage(allOn, told({ ...everything, JARVIS_ENGINE: "other", JARVIS_VOICE: "elevenlabs", JARVIS_WEB: "always", JARVIS_EARS: "always" }));
  const steps = byId(page.steps);
  const reach = byId(page.reach);
  assert.deepEqual([steps.claude.value, steps.voice.state, steps.voice.value, reach.lookups.state, steps.mic.state], [null, "off", null, "off", "off"]);
  for (const part of [...page.steps, ...page.reach, ...page.words]) assert.ok(part.value === null || ["wake", "push", "on", "off", "sdk", "api", "kokoro", "piper", "ask", "auto"].includes(part.value), `${part.id}: ${part.value}`);
});
