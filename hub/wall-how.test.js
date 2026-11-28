// @ts-check
import assert from "node:assert/strict";
import test from "node:test";
import { agoWords, howView, isHowPage, liveOf, reachIds, stepIds, unaskedOf, wordIds } from "./wall-how.js";

/**
 * @typedef {import("./wall-how.js").Part} Part
 * @typedef {import("./wall-how.js").HowPage} HowPage
 */

/**
 * @param {string[]} ids
 * @param {Record<string, Partial<Part>>} over
 * @param {Part["state"]} state
 * @returns {Part[]}
 */
function parts(ids, over, state) {
  return ids.map((id) => ({ id, state, value: null, blockedBy: [], ...over[id] }));
}

/**
 * @param {Record<string, Partial<Part>>} over
 * @param {Part["state"]} state
 * @returns {HowPage}
 */
function page(over = {}, state = "on") {
  return { kind: "how", told: state !== "untold", ageMs: state === "untold" ? null : 90_000, steps: parts(stepIds, over, state), reach: parts(reachIds, over, state), words: parts(wordIds, {}, state) };
}

const untold = () => {
  const made = page({}, "untold");
  for (const part of [...made.steps, ...made.reach]) if (part.id === "claude" || part.id === "brain") part.state = "on";
  return made;
};

/**
 * @param {import("./wall-how.js").HowView} view
 * @param {string} id
 */
const spot = (view, id) => {
  const found = [...view.steps, ...view.sats].find((one) => one.id === id);
  assert.ok(found, id);
  return found;
};

test("the page is checked before it's drawn: its parts in order, known states and choice words, and plain switch names", () => {
  assert.equal(isHowPage(page()), true);
  assert.equal(isHowPage(untold()), true);
  const good = page();
  for (const bad of [
    null,
    { ...good, kind: "code" },
    { ...good, told: "yes" },
    { ...good, ageMs: -1 },
    { ...good, steps: good.steps.slice(1) },
    { ...good, steps: [good.steps[1], good.steps[0], ...good.steps.slice(2)] },
    { ...good, reach: good.reach.map((part) => (part.id === "phone" ? { ...part, state: "maybe" } : part)) },
    { ...good, reach: good.reach.map((part) => (part.id === "lookups" ? { ...part, value: "always" } : part)) },
    { ...good, reach: good.reach.map((part) => (part.id === "phone" ? { ...part, blockedBy: ["talk"] } : part)) },
    { ...good, reach: good.reach.map((part) => (part.id === "phone" ? { ...part, blockedBy: ["A", "B", "C", "D", "E"] } : part)) },
    { ...good, words: good.words.slice(0, -1) },
  ]) assert.equal(isHowPage(bad), false, JSON.stringify(bad)?.slice(0, 120));
});

test("until Jarvis tells the hub his switches, the page draws how he's built, dashed, and says what it's waiting for", () => {
  const view = howView(untold(), "waiting", null);
  assert.deepEqual(view.steps.map((one) => [one.id, one.name, one.note]), [
    ["mic", "Mic", "owned by ears, never by him"],
    ["wake", "Wake word", "“Hey Jarvis”"],
    ["stop", "You stop", "it hears you finish"],
    ["whisper", "Whisper", "speech into words"],
    ["words", "Code words", "notes, find my phone, train times: his own code"],
    ["claude", "Claude", "thinks: Agent SDK or the plain API"],
    ["sentences", "Sentences", "spoken as they arrive"],
    ["voice", "His voice", "Kokoro or Piper"],
    ["speakers", "Speakers", "aplay, through the laptop"],
  ]);
  assert.deepEqual(view.sats.map((one) => [one.id, one.name, one.state]), [
    ["tools", "Hub tools", "untold"],
    ["brain", "The brain", "on"],
    ["notes", "Session notes", "untold"],
    ["lookups", "Look-ups", "untold"],
    ["wall", "The wall", "untold"],
    ["phone", "Your phone", "untold"],
    ["modes", "Modes", "untold"],
    ["unasked", "Unasked", "untold"],
  ]);
  assert.equal(spot(view, "unasked").note, "only reminders, train changes, the morning, a waiting session and opening pages");
  assert.deepEqual(view.pills, [{ text: "Now: Waiting", tone: "plain" }, { text: "Jarvis hasn't told the hub his switches", tone: "warn" }]);
  assert.match(view.note, /^This is how he's built\. Which parts are on shows once Jarvis tells the hub his switches, with JARVIS_WALL on\. He never touches the mic: ears owns it\.$/);
  assert.equal(view.flow, "demo");
});

test("with everything on, each part says what it is and how it's set, and the code words list what his code answers", () => {
  const view = howView(page({ mic: { value: "wake" }, stop: { value: "on" }, claude: { value: "api" }, sentences: { value: "on" }, voice: { value: "kokoro" }, tools: { value: "off" }, lookups: { value: "auto" } }), "waiting", null);
  assert.deepEqual(
    ["stop", "words", "claude", "sentences", "voice", "tools", "lookups", "notes", "phone"].map((id) => [id, spot(view, id).name, spot(view, id).note]),
    [
      ["stop", "You stop", "ears hears you finish; Claude checks"],
      ["words", "Code words", "his own code: notes, phone, trains, server, the time, look up, projector, pages, modes, guest"],
      ["claude", "Claude", "thinks: the plain API"],
      ["sentences", "Sentences", "spoken as they arrive, bundled"],
      ["voice", "Kokoro", "his voice"],
      ["tools", "Hub tools", "read only, bar opening pages"],
      ["lookups", "Look-ups", "when you ask or he decides: a guarded helper"],
      ["notes", "Session notes", "what the Claude Code chats remember"],
      ["phone", "Your phone", "hold to talk, answers back"],
    ],
  );
  assert.equal(spot(view, "unasked").note, "only reminders, train changes, the morning, a waiting session and opening pages");
  assert.deepEqual(view.pills[1], { text: "His switches, told a minute ago", tone: "plain" });
  assert.match(view.note, /^Drawn from the switches Jarvis last told the hub, and what he's doing now\./);
  assert.equal(howView(page({ voice: { value: "piper" }, claude: { value: "sdk" }, tools: { value: "on" }, lookups: { value: "ask" } }), "waiting", null).steps.find((one) => one.id === "voice")?.name, "Piper");
  const other = howView(page({ claude: { value: "sdk" }, tools: { value: "on" }, lookups: { value: "ask" } }), "waiting", null);
  assert.deepEqual([spot(other, "claude").note, spot(other, "tools").note, spot(other, "lookups").note], ["thinks: the Agent SDK", "most actions ask your yes", "when you say look up: a guarded helper"]);
  const readOnly = howView(page({ tools: { value: "off" }, opens: { state: "off" } }), "waiting", null);
  assert.equal(spot(readOnly, "tools").note, "read only");
  assert.equal(spot(howView(page({ tools: { value: "off" } }), "waiting", null), "tools").note, "read only, bar opening pages", "opening pages himself is an action that doesn't ask");
});

test("parts that are off say so plainly, and a wake word that's off says the talk button is used instead when it is", () => {
  const off = page({ mic: { state: "off" }, wake: { state: "off" }, stop: { state: "off" }, whisper: { state: "off" }, words: { state: "off" }, sentences: { state: "off" }, voice: { state: "off" }, speakers: { state: "off" }, tools: { state: "off" }, notes: { state: "off" }, lookups: { state: "off" } });
  const view = howView(off, "waiting", null);
  assert.deepEqual(
    ["mic", "wake", "stop", "whisper", "words", "sentences", "voice", "speakers", "tools", "notes", "lookups"].map((id) => [id, spot(view, id).note]),
    [
      ["mic", "ears is off: he's typed to"],
      ["wake", "off"],
      ["stop", "off"],
      ["whisper", "off"],
      ["words", "only for speech"],
      ["sentences", "his voice is off: text only"],
      ["voice", "off"],
      ["speakers", "quiet"],
      ["tools", "off"],
      ["notes", "off"],
      ["lookups", "off"],
    ],
  );
  assert.equal(spot(view, "voice").name, "His voice");
  const push = howView(page({ mic: { value: "push" }, wake: { state: "off" } }), "waiting", null);
  assert.equal(spot(push, "wake").note, "the talk button instead");
  const quiet = page();
  for (const word of quiet.words) word.state = "off";
  assert.equal(spot(howView(quiet, "waiting", null), "words").note, "never mind, stop listening");
  const someBlocked = page();
  for (const word of someBlocked.words) if (word.id !== "guest") word.state = "blocked";
  assert.equal(spot(howView(someBlocked, "waiting", null), "words").note, "his own code: guest", "a code word that's blocked isn't listed");
});

test("a part Jarvis has on that's waiting on another switch is drawn as blocked and names the switch", () => {
  const view = howView(page({ phone: { state: "blocked", blockedBy: ["JARVIS_EARS", "TALK"] }, wall: { state: "blocked", blockedBy: ["WALL"] }, modes: { state: "blocked", blockedBy: ["MODES"] } }), "waiting", null);
  assert.deepEqual(["phone", "wall", "modes"].map((id) => [spot(view, id).state, spot(view, id).note]), [
    ["blocked", "needs JARVIS_EARS and TALK"],
    ["blocked", "needs WALL"],
    ["blocked", "needs MODES"],
  ]);
});

test("what he says unasked is only what's on, with anything waiting on a switch said after", () => {
  /** @type {(id: string, state: Part["state"], blockedBy?: string[]) => Part} */
  const one = (id, state, blockedBy = []) => ({ id, state, value: null, blockedBy });
  /** @type {(states: Record<string, [Part["state"], string[]?]>) => Part[]} */
  const set = (states) => ["reminders", "trains", "morning", "sessions", "opens"].map((id) => one(id, states[id]?.[0] ?? "off", states[id]?.[1] ?? []));
  assert.deepEqual(unaskedOf(set({ reminders: ["on"], trains: ["on"], morning: ["on"] })), { state: "on", note: "only reminders, train changes and the morning" });
  assert.deepEqual(unaskedOf(set({ reminders: ["on"] })), { state: "on", note: "only reminders" });
  assert.deepEqual(unaskedOf(set({ opens: ["on"] })), { state: "on", note: "only opening pages" }, "opening a page himself is something he does unasked");
  assert.deepEqual(unaskedOf(set({ sessions: ["on"], trains: ["on"] })), { state: "on", note: "only train changes and a waiting session" });
  assert.deepEqual(unaskedOf(set({ trains: ["on"], reminders: ["blocked", ["REMINDERS"]], morning: ["blocked", ["MORNING"]] })), { state: "on", note: "only train changes; reminders and the morning need REMINDERS and MORNING" });
  assert.deepEqual(unaskedOf(set({ reminders: ["blocked", ["JARVIS_HUB_TOOLS", "REMINDERS"]], morning: ["blocked", ["JARVIS_HUB_TOOLS"]] })), { state: "blocked", note: "nothing yet; reminders and the morning need JARVIS_HUB_TOOLS and REMINDERS" });
  assert.deepEqual(unaskedOf(set({ trains: ["on"], reminders: ["blocked", ["REMINDERS"]] })), { state: "on", note: "only train changes; reminders need REMINDERS" });
  assert.deepEqual(unaskedOf(set({ trains: ["on"], morning: ["blocked", ["MORNING"]] })), { state: "on", note: "only train changes; the morning needs MORNING" });
  assert.deepEqual(unaskedOf(set({ trains: ["on"], sessions: ["blocked", ["SESSIONS"]] })), { state: "on", note: "only train changes; a waiting session needs SESSIONS" });
  assert.deepEqual(unaskedOf(set({ trains: ["on"], opens: ["blocked", ["WALL"]] })), { state: "on", note: "only train changes; opening pages needs WALL" });
  assert.deepEqual(unaskedOf(set({})), { state: "off", note: "nothing: he only answers" });
  assert.equal(unaskedOf(set({ reminders: ["untold"], trains: ["untold"], morning: ["untold"], sessions: ["untold"], opens: ["untold"] })).state, "untold");
});

test("a part he hasn't told the hub about still lights when he's using it", () => {
  const view = howView(untold(), "speaking", null);
  assert.deepEqual(view.steps.filter((one) => one.lit).map((one) => [one.id, one.state]), [["sentences", "untold"], ["voice", "untold"], ["speakers", "untold"]]);
});

test("what he's doing now lights his part of the line, and moves the dot the right way", () => {
  assert.deepEqual(liveOf("listening"), { flow: "ask", lit: ["mic", "wake", "stop"] });
  assert.deepEqual(liveOf("heard"), liveOf("listening"));
  assert.deepEqual(liveOf("thinking"), { flow: "think", lit: ["whisper", "words", "claude"] });
  assert.deepEqual(liveOf("looking"), { flow: "think", lit: ["claude", "lookups"] });
  assert.deepEqual(liveOf("needs"), { flow: "think", lit: ["claude", "tools"] });
  assert.deepEqual(liveOf("speaking"), { flow: "reply", lit: ["sentences", "voice", "speakers"] });
  for (const pose of ["off", "lost"]) assert.deepEqual(liveOf(pose), { flow: "still", lit: [] });
  for (const pose of ["waiting", "done", "muted", "guest", "sleepy"]) assert.deepEqual(liveOf(pose), { flow: "demo", lit: [] });
  const looking = howView(page(), "looking", null);
  assert.deepEqual([...looking.steps, ...looking.sats].filter((one) => one.lit).map((one) => one.id), ["claude", "lookups"]);
  assert.deepEqual(looking.pills[0], { text: "Now: Looking it up", tone: "good" });
  assert.deepEqual(howView(page(), "off", null).pills[0], { text: "Now: Jarvis is off", tone: "plain" });
  const muted = howView(page(), "muted", null);
  assert.deepEqual([spot(muted, "mic").muted, spot(muted, "mic").note], [true, "muted: ears isn't listening"]);
  assert.equal(spot(howView(page(), "waiting", null), "mic").muted, false);
  const push = howView(page({ wake: { state: "off" } }), "listening", null);
  assert.deepEqual(push.steps.filter((one) => one.lit).map((one) => one.id), ["mic", "stop"], "a part that's off never lights");
  const textOnly = howView(page({ sentences: { state: "off" }, voice: { state: "off" }, speakers: { state: "off" } }), "speaking", null);
  assert.deepEqual([textOnly.flow, textOnly.steps.some((one) => one.lit)], ["still", false], "with his voice off nothing travels to the speakers");
  const guestNeeds = howView(page(), "needs", "guest");
  assert.equal(spot(guestNeeds, "tools").lit, false, "out of reach in a guest chat, so never lit");
});

test("in guest mode the brain, his notes, the hub's tools and the phone are out of reach, nothing's said unasked, modes can't change and only a guest's code words are listed", () => {
  const view = howView(page(), "waiting", "guest");
  assert.deepEqual(["tools", "brain", "notes", "phone"].map((id) => [spot(view, id).state, spot(view, id).note]), [
    ["off", "not in a guest chat"],
    ["off", "not in a guest chat"],
    ["off", "not in a guest chat"],
    ["off", "not in a guest chat"],
  ]);
  assert.deepEqual([spot(view, "unasked").state, spot(view, "unasked").note], ["off", "nothing while a guest is here"]);
  assert.deepEqual([spot(view, "modes").state, spot(view, "modes").note], ["on", "can't be changed in guest mode"]);
  assert.equal(spot(view, "words").note, "his own code: the time, look up, pages, guest");
  assert.equal(spot(view, "lookups").state, "on", "a guest can still have something looked up");
  const offAnyway = howView(page({ notes: { state: "off" } }), "waiting", "guest");
  assert.equal(spot(offAnyway, "notes").note, "off");
});

test("how long ago he told the hub reads in whole minutes", () => {
  assert.deepEqual([null, 0, 59_000, 60_000, 119_000, 120_000, 14 * 60_000].map(agoWords), ["", "just now", "just now", "a minute ago", "a minute ago", "2 minutes ago", "14 minutes ago"]);
});

test("every part has a place on the board, the line's parts along it left to right and the rest above or below Claude", () => {
  const view = howView(page(), "waiting", null);
  assert.ok(view.steps.every((one, i) => one.y === 384 && (i === 0 || one.x > view.steps[i - 1].x)));
  assert.ok(view.sats.slice(0, 4).every((one) => one.y < 384) && view.sats.slice(4).every((one) => one.y > 384));
  assert.ok([...view.steps, ...view.sats].every((one) => one.x - 70 >= 0 && one.x + 70 <= 1280));
});
