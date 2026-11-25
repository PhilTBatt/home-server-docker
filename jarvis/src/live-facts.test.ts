import assert from "node:assert/strict";
import { test } from "node:test";
import { codeWordIn } from "./code-words.js";
import { factsLead, liveFacts, withLiveFacts, type FactsInput } from "./live-facts.js";

const typed: FactsInput = { voice: "off", ears: "off", followUp: null, hubTools: false, hubActions: false, codeWordsReachHub: false, trainAlerts: false };
const all: FactsInput = { voice: "kokoro", ears: "wake", followUp: 6, hubTools: true, hubActions: true, codeWordsReachHub: true, trainAlerts: true };
const sentences = (text: string) => text.split(/(?<=[.:;]) /);

test("live facts start by saying they're from his own code, written as the chat started, and outrank older notes about him", () => {
  assert.equal(factsLead, "What's switched on for you in this chat, written by your own code as it started. Trust it over anything older you've read about yourself, in notes or anywhere else.");
  for (const input of [typed, all]) assert.ok(liveFacts(input).startsWith(factsLead), liveFacts(input));
});

test("with everything off, they say he's text only, typed to, without the hub, and can't act", () => {
  assert.equal(
    liveFacts(typed),
    `${factsLead} Your voice is off: Phil reads your answers on screen. He can only type to you: you're not connected to ears, the service that listens for you. You don't have the hub's tools in this chat. You can't run commands, change files, browse the web, or set reminders or timers.`,
  );
});

test("they name the voice that's actually running, which may not be the one asked for", () => {
  assert.ok(liveFacts({ ...typed, voice: "kokoro" }).includes("Your voice is on: Phil hears your answers read aloud by Kokoro, as well as seeing them on screen."));
  assert.ok(liveFacts({ ...typed, voice: "piper" }).includes("read aloud by Piper"));
  assert.ok(!liveFacts({ ...typed, voice: "piper" }).includes("Your voice is off"));
});

test("they say how Phil can speak to him: /talk with push, and the wake word and talk button with wake, with the follow-up window if it's on", () => {
  assert.ok(liveFacts({ ...typed, ears: "push" }).includes("He can type, or speak to you after typing /talk."));
  assert.ok(liveFacts({ ...typed, ears: "wake" }).includes("He can type, or speak to you after typing /talk, saying Hey Jarvis or pressing his talk button. You don't"));
  assert.ok(liveFacts(all).includes("pressing his talk button. After you answer something he said with Hey Jarvis or the button, you listen for 6 seconds for a follow-up without the wake word."));
  assert.ok(!liveFacts({ ...typed, ears: "push" }).includes("Hey Jarvis"));
});

test("they say whether he has the hub's tools, and its actions, which only come with the tools", () => {
  assert.ok(liveFacts({ ...typed, hubTools: true }).includes("You have the hub's read-only tools."));
  assert.ok(liveFacts(all).includes("You have the hub's read-only tools, and actions that each need his yes before they run."));
  assert.ok(liveFacts({ ...typed, hubActions: true }).includes("You don't have the hub's tools in this chat."));
});

test("with ears on, they list the code words his own code handles, and tell him to give Phil the words without guessing whether he typed or spoke, or claiming he did it", () => {
  for (const ears of ["push", "wake"] as const) {
    const facts = liveFacts({ ...all, ears });
    for (const word of ["note this, followed by anything, saves it as a voice note in his brain's inbox", "find my phone sends his phone a notification", "train times reads out his next three trains", "never mind or that's all asks nothing", "stop listening, said on its own, makes ears mute itself until he unmutes it on the server"]) assert.ok(facts.includes(word), word);
    assert.ok(facts.includes("Some things he says out loud never reach you, because your own code acts on them first when they're all he says or the last sentence of it"), facts);
    assert.ok(facts.includes("If he asks you for one of those and it reaches you, your code didn't catch it. Typed messages never count, but typed and spoken messages reach you the same way, so you can't tell which this was: never say he typed it or said it, and never say you've done it. Tell him to say the words out loud, on their own or as the last thing he says, for example: say find my phone."), facts);
    assert.ok(!/he typed it or his words|didn't match|reached you as typed/.test(facts), "never offers typing as a likely reason");
    assert.ok(!facts.includes("won't work until"), facts);
  }
  assert.ok(!liveFacts(typed).includes("never reach you"));
  assert.ok(!liveFacts({ ...all, ears: "off" }).includes("find my phone"));
});

test("every phrase the live facts tell him to give is one his code really answers, when said out loud", () => {
  const facts = liveFacts(all);
  const phrases: [string, string, string][] = [
    ["note this, followed by anything", "note this, buy milk", "note"],
    ["find my phone", "find my phone", "phone"],
    ["train times", "train times", "trains"],
    ["never mind", "never mind", "never mind"],
    ["that's all", "that's all", "never mind"],
    ["stop listening, said on its own", "stop listening", "stop listening"],
    ["say find my phone", "find my phone", "phone"],
  ];
  for (const [named, said, kind] of phrases) {
    assert.ok(facts.includes(named), named);
    assert.equal(codeWordIn(said)?.kind, kind, said);
  }
});

test("with ears on but no hub token, they say notes, the phone and train times won't work until hub tools are on", () => {
  const facts = liveFacts({ ...all, codeWordsReachHub: false });
  assert.ok(facts.includes("Notes, finding his phone and train times go through the hub, so they won't work until he turns your hub tools on."), facts);
  assert.ok(facts.indexOf("won't work until") < facts.indexOf("If he asks you for one of those"), facts);
});

test("with train changes on, they say his code passes them on once he's quiet, that he doesn't see them, and where Phil can find them", () => {
  assert.ok(liveFacts(all).includes("When the hub finds a change to his morning trains, your own code says it aloud once you're quiet. You don't see what it says, so if he asks about it, tell him to say train times, or check his phone."), liveFacts(all));
  assert.ok(liveFacts({ ...typed, hubTools: true, codeWordsReachHub: true, trainAlerts: true }).includes("your own code shows it on screen once you're quiet. You don't see what it says, so if he asks about it, tell him to check his phone, where the hub sends it too."));
  assert.ok(!liveFacts({ ...all, trainAlerts: false }).includes("morning trains"));
  assert.ok(liveFacts(all).indexOf("morning trains") < liveFacts(all).indexOf("You can't run commands"));
});

test("they never use double quotes, and every sentence ends cleanly, whatever is switched on", () => {
  for (const voice of ["off", "kokoro", "piper"] as const) {
    for (const ears of ["off", "push", "wake"] as const) {
      for (const [hubTools, hubActions, codeWordsReachHub, trainAlerts] of [[false, false, false, false], [true, false, true, true], [true, true, true, false], [false, false, true, false]] as const) {
        const facts = liveFacts({ voice, ears, followUp: ears === "wake" ? 4 : null, hubTools, hubActions, codeWordsReachHub, trainAlerts });
        assert.ok(!facts.includes('"'), facts);
        assert.ok(facts.endsWith("."), facts);
        assert.ok(!/\s{2}|\.\./.test(facts), facts);
        assert.ok(sentences(facts).length >= 5, facts);
      }
    }
  }
});

test("live facts go after the instructions, after a blank line, and nothing is added when they're off", () => {
  assert.equal(withLiveFacts("Base.", null), "Base.");
  assert.equal(withLiveFacts("Base.", "Facts."), "Base.\n\nFacts.");
});
