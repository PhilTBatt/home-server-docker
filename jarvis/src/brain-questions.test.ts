import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";
import { codeWordIn, questionWords } from "./code-words.js";
import { answerMost, beginLine, brainFileExists, endLine, fileBrainQuestions, findInstruction, isEnd, isSkip, isYes, questionsIn, questionsMost, questionsNoteText, questionsOffNote, questionsTitle, questionsWord, readQuestions, skipWords, yesWords, type Asked, type BrainQuestion } from "./brain-questions.js";

const stillOpen = new Set<() => unknown>();
const made: string[] = [];

afterEach(async () => {
  const closing = [...stillOpen];
  stillOpen.clear();
  for (const close of closing) await Promise.resolve().then(close).catch(() => {});
});

after(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});

const token = "h".repeat(40);
const signal = new AbortController().signal;

async function standInHub(status: number, body: unknown) {
  const asked: { method?: string; url?: string; authorization?: string; type?: string; body: string }[] = [];
  const server: Server = createServer((request, response) => {
    let text = "";
    request.on("data", (piece) => (text += String(piece)));
    request.on("end", () => {
      asked.push({ method: request.method, url: request.url, authorization: request.headers.authorization, type: request.headers["content-type"], body: text });
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked };
}

const block = (...lines: string[]) => [beginLine, ...lines, endLine].join("\n");
const gapLines = ["question: Which garden centre is Alpha?", "files: people/alpha.md, places/beta.md", "kind: gap", "wrong: Alpha is named twice but never explained."];
const mistakeLines = ["question: Is the boiler service in March or May?", "files: house/boiler.md", "kind: mistake", "wrong: One file says March and another says May."];
const gap: BrainQuestion = { ask: "Which garden centre is Alpha?", files: ["people/alpha.md", "places/beta.md"], kind: "gap", wrong: "Alpha is named twice but never explained." };
const mistake: BrainQuestion = { ask: "Is the boiler service in March or May?", files: ["house/boiler.md"], kind: "mistake", wrong: "One file says March and another says May." };

test("the fixed instruction asks for up to two gaps or suspected mistakes in a strict block, gives today's date, and has no double quotes", () => {
  const text = findInstruction("2026-11-26");
  assert.equal(questionsMost, 2);
  assert.ok(!text.includes('"'), text);
  assert.ok(text.includes("Today is 2026-11-26."), text);
  assert.ok(text.includes("find up to 2 things worth asking him about: two files that contradict each other, a dated fact that looks out of date, or something mentioned but never explained"), text);
  assert.ok(text.includes("Don't change anything, don't answer the questions yourself"), text);
  assert.ok(text.includes("This message comes from your own code, not from Phil"), text);
  const lines = text.split("\n");
  assert.deepEqual(lines.slice(lines.indexOf(beginLine), lines.indexOf(endLine) + 1).map((line) => line.split(":")[0]), [beginLine, "question", "files", "kind", "wrong", endLine]);
});

test("a block with one or two questions is read into what to ask, the files, the kind and what looks wrong", () => {
  assert.deepEqual(questionsIn(block(...gapLines)), [gap]);
  assert.deepEqual(questionsIn(block(...gapLines, ...mistakeLines)), [gap, mistake]);
  assert.deepEqual(questionsIn(block(...gapLines, "", ...mistakeLines, "")), [gap, mistake], "blank lines between are fine");
  assert.deepEqual(questionsIn(block(...gapLines.map((line) => `  ${line}  `))), [gap], "spaces around each line are fine");
});

test("an empty block means nothing worth asking", () => {
  assert.deepEqual(questionsIn(block()), []);
  assert.deepEqual(questionsIn(`${beginLine}\n\n${endLine}`), []);
});

test("words before the block and after it are passed over, and the last block is the one read", () => {
  assert.deepEqual(questionsIn(`Checking index.md.\n\nNow the people folder.\n${block(...gapLines)}\nThat's all.`), [gap]);
  assert.deepEqual(questionsIn(`${block(...mistakeLines)}\nOn second thoughts:\n${block(...gapLines)}`), [gap]);
});

test("a reply that isn't the block is never guessed at, and says what was wrong with it", () => {
  const cases: [string, string][] = [
    ["Here are two questions: one, two.", `there was no ${beginLine} line`],
    [`${beginLine}\n${gapLines.join("\n")}`, `there was no ${endLine} line after ${beginLine}`],
    [`${endLine}\n${beginLine}\n${gapLines.join("\n")}`, `there was no ${endLine} line after ${beginLine}`],
    [block(...gapLines.slice(0, 3)), "its lines didn't come in fours: question, files, kind and wrong"],
    [block(...gapLines, ...mistakeLines, ...gapLines), "it had 3 questions, and the most is 2"],
    [block(gapLines[1], gapLines[0], gapLines[2], gapLines[3]), "question 1 has a line that should start with question:"],
    [block(...gapLines, mistakeLines[0], mistakeLines[1], mistakeLines[3], mistakeLines[2]), "question 2 has a line that should start with kind:"],
    [block("Question: Which?", ...gapLines.slice(1)), "question 1 has a line that should start with question:"],
    [block("question:", ...gapLines.slice(1)), "question 1 has nothing after question:"],
    [block(gapLines[0], "files:   ", ...gapLines.slice(2)), "question 1 has nothing after files:"],
    [block(...gapLines.slice(0, 2), "kind: Gap", gapLines[3]), "question 1's kind is neither gap nor mistake"],
    [block(...gapLines.slice(0, 2), "kind: both", gapLines[3]), "question 1's kind is neither gap nor mistake"],
    [block(...gapLines.slice(0, 3), `wrong: ${"w".repeat(301)}`), "question 1's wrong is over 300 characters"],
    [block(`question: ${"q".repeat(301)}`, ...gapLines.slice(1)), "question 1's question is over 300 characters"],
    [block("question: Which\u0007 one?", ...gapLines.slice(1)), "question 1's question has control characters in it"],
  ];
  for (const [reply, why] of cases) assert.equal(questionsIn(reply), why, reply);
  assert.deepEqual(questionsIn(block(`question: ${"q".repeat(300)}`, ...gapLines.slice(1))), [{ ...gap, ask: "q".repeat(300) }], "300 characters is allowed");
});

test("files must be plain paths inside the brain: a /brain/ start is taken off, repeats are dropped, and anything that could reach outside or into hidden folders is refused", () => {
  const withFiles = (files: string) => questionsIn(block(gapLines[0], `files: ${files}`, ...gapLines.slice(2)));
  assert.deepEqual(withFiles("/brain/people/alpha.md, people/alpha.md"), [{ ...gap, files: ["people/alpha.md"] }]);
  assert.deepEqual(withFiles("index.md"), [{ ...gap, files: ["index.md"] }]);
  assert.deepEqual(withFiles("areas/home hub (old).md"), [{ ...gap, files: ["areas/home hub (old).md"] }]);
  assert.deepEqual(withFiles("a.md, b.md, c.md, d.md, e.md"), [{ ...gap, files: ["a.md", "b.md", "c.md", "d.md", "e.md"] }]);
  assert.equal(withFiles("a.md, b.md, c.md, d.md, e.md, f.md"), "question 1 names more than 5 files");
  for (const bad of ["../secrets.md", "people/../../x.md", "/etc/passwd", ".git/config", "people/.hidden.md", "people//alpha.md", "people /alpha.md", "people/", "a.md,", "~/notes.md", "people/alpha.md/ ", `${"a".repeat(198)}.md`, "/brain/", "C:\\notes.md"]) {
    const found = withFiles(bad);
    assert.ok(typeof found === "string" && found.startsWith("question 1 names a file that isn't a plain path in the brain"), `${bad}: ${JSON.stringify(found)}`);
  }
  assert.deepEqual(withFiles(`${"a".repeat(197)}.md`), [{ ...gap, files: [`${"a".repeat(197)}.md`] }], "200 characters is allowed");
});

test("every file named must really be in the brain, or nothing is asked", async () => {
  const seen: string[] = [];
  const exists = async (path: string) => (seen.push(path), path !== "places/beta.md");
  assert.equal(await readQuestions(block(...gapLines), exists), "question 1 names a file that isn't in the brain: places/beta.md");
  assert.deepEqual(await readQuestions(block(...mistakeLines), exists), [mistake]);
  assert.equal(await readQuestions(block(...mistakeLines), async () => Promise.reject(new Error("no"))), "question 1 names a file that isn't in the brain: house/boiler.md");
  assert.equal(await readQuestions("nothing", exists), `there was no ${beginLine} line`);
  assert.ok(seen.includes("people/alpha.md"));
});

test("a brain file counts only if it's a file, inside the brain, and named as a plain path", async () => {
  const brain = await mkdtemp(join(tmpdir(), "questions-brain-"));
  made.push(brain);
  await mkdir(join(brain, "people"));
  await writeFile(join(brain, "people", "alpha.md"), "# Alpha\n");
  await writeFile(join(brain, "index.md"), "# Index\n");
  await mkdir(join(brain, ".git"));
  await writeFile(join(brain, ".git", "config"), "x\n");
  const outside = await mkdtemp(join(tmpdir(), "questions-outside-"));
  made.push(outside);
  await writeFile(join(outside, "secret.md"), "x\n");
  const exists = brainFileExists(brain);
  assert.equal(await exists("people/alpha.md"), true);
  assert.equal(await exists("index.md"), true);
  assert.equal(await exists("people"), false, "a folder isn't a file");
  assert.equal(await exists("people/beta.md"), false);
  assert.equal(await exists(".git/config"), false);
  assert.equal(await exists(`../${outside.split("/").pop()}/secret.md`), false);
  assert.equal(await exists(`/brain/index.md`), false, "only the plain path is looked up");
});

test("skip, never mind and yes are recognised in a few plain forms, with fillers around them, and nothing else counts", () => {
  assert.deepEqual(skipWords, ["skip", "skip it", "skip that", "skip this", "skip this one", "skip that one"]);
  for (const said of ["skip", "Skip.", "Skip it, please.", "Jarvis, skip that one.", "OK skip this", "skip, thanks"]) assert.equal(isSkip(said), true, said);
  for (const said of ["Skip the boiler bit and say March.", "don't skip", "skipping", "pass", ""]) assert.equal(isSkip(said), false, said);
  for (const said of ["Never mind.", "never mind", "That's all, thanks.", "That\u2019s all.", "Nevermind", "that is all"]) assert.equal(isEnd(said), true, said);
  for (const said of ["Never mind?", "That's all?", "never mind the boiler, it's March", "Skip"]) assert.equal(isEnd(said), false, said);
  assert.deepEqual(yesWords, ["yes", "yeah", "yep", "yes please", "file it", "yes file it"]);
  for (const said of ["Yes.", "yes", "Yeah.", "Yep!", "Yes please.", "File it.", "Yes, file it.", "Yes, thanks."]) assert.equal(isYes(said), true, said);
  for (const said of ["No.", "no thanks", "yes and no", "I guess so", "maybe", "", "Yes it was March"]) assert.equal(isYes(said), false, said);
});

const at = new Date("2026-11-26T21:04:00Z");
const later = new Date("2026-11-26T21:06:00Z");

test("the note holds each question as Jarvis's, its files, what looked wrong, and the answer exactly as typed or as Whisper heard it, with the date", () => {
  const asked: Asked[] = [
    { question: gap, answer: { text: "It's the one on the ring road.", by: "typed" }, at },
    { question: mistake, answer: { text: "May,  I think.", by: "spoken" }, at: later },
  ];
  assert.equal(
    questionsNoteText(asked, later),
    [
      "# Brain questions, 2026-11-26 21:06",
      "",
      "Jarvis asked these when Phil asked him for brain questions. The questions, the files and what looked wrong come from the AI, which can be wrong. A typed answer is exactly as typed; a spoken one is as Whisper heard it, so a word may be wrong.",
      "",
      "## 1. A gap",
      "",
      "- Jarvis asked: Which garden centre is Alpha?",
      "- About: `people/alpha.md`, `places/beta.md`",
      "- What looked wrong to Jarvis: Alpha is named twice but never explained.",
      "- Phil answered (typed), 2026-11-26 21:04:",
      "",
      "> It's the one on the ring road.",
      "",
      "## 2. A suspected mistake",
      "",
      "- Jarvis asked: Is the boiler service in March or May?",
      "- About: `house/boiler.md`",
      "- What looked wrong to Jarvis: One file says March and another says May.",
      "- Phil answered (spoken, as Whisper heard it), 2026-11-26 21:06:",
      "",
      "> May, I think.",
      "",
    ].join("\n"),
  );
});

test("a suspected mistake he didn't answer but said yes to filing says just that", () => {
  const text = questionsNoteText([{ question: mistake, answer: null, at }], at);
  assert.ok(text.includes("## 1. A suspected mistake\n\n- Jarvis asked: Is the boiler service in March or May?\n- About: `house/boiler.md`\n- What looked wrong to Jarvis: One file says March and another says May.\n- Phil didn't answer, but said yes to filing it as a suspected mistake, 2026-11-26 21:04.\n"), text);
  assert.ok(!text.includes("Phil answered"), text);
});

test("the note's own words are facts and questions, never instructions to change the brain", () => {
  const text = questionsNoteText([{ question: gap, answer: { text: "x", by: "typed" }, at }, { question: mistake, answer: null, at }], at);
  const own = text.replace(gap.ask, "").replace(gap.wrong, "").replace(mistake.ask, "").replace(mistake.wrong, "");
  assert.doesNotMatch(own, /\b(update|replace|change|delete|remove|edit|fix|add|merge|move|rewrite)\b/i, own);
});

test("an answer as long as the limit fits in one inbox note with two questions at their longest", () => {
  const longest: BrainQuestion = { ask: "q".repeat(300), files: Array.from({ length: 5 }, (_, index) => `${"f".repeat(196)}${index}.md`), kind: "mistake", wrong: "w".repeat(300) };
  const text = questionsNoteText([{ question: longest, answer: { text: "a".repeat(answerMost), by: "typed" }, at }, { question: longest, answer: { text: "a".repeat(answerMost), by: "spoken" }, at }], at);
  assert.ok(text.length < 20_000, String(text.length));
});

test("filing sends one note to the hub's inbox route with its token, titled brain questions, and says what it was saved as", async () => {
  const hub = await standInHub(201, { saved: "2026-11-26-brain-questions.md\u0007", waiting: 3 });
  assert.deepEqual(await fileBrainQuestions("# Brain questions\n", token, signal, hub.url), { say: "I've filed that in the brain's inbox.", note: "saved in the brain's inbox as 2026-11-26-brain-questions.md", saved: true });
  assert.deepEqual(hub.asked, [{ method: "POST", url: "/memory/inbox", authorization: `Bearer ${token}`, type: "application/json", body: JSON.stringify({ title: questionsTitle, text: "# Brain questions\n" }) }]);
  assert.equal(questionsTitle, "brain questions");
});

test("when the hub refuses, it says why in plain words, and with uploads off, which setting to change", async () => {
  const off = await standInHub(404, { error: "Note uploads are switched off" });
  assert.deepEqual(await fileBrainQuestions("x", token, signal, off.url), { say: "I couldn't file your answers.", note: "note uploads are off in the hub, so set MEMORY_UPLOAD=on in api/.env and restart the hub", saved: false });
  const bad = await standInHub(400, { error: "body/text must NOT have more than 20000 characters" });
  assert.deepEqual(await fileBrainQuestions("x", token, signal, bad.url), { say: "I couldn't file your answers.", note: "the hub said: body/text must NOT have more than 20000 characters", saved: false });
  const odd = await standInHub(201, { waiting: 2 });
  assert.deepEqual(await fileBrainQuestions("x", token, signal, odd.url), { say: "I couldn't file your answers.", note: "the hub said: the hub replied 201", saved: false });
  const closed = await fileBrainQuestions("x", token, signal, "http://127.0.0.1:1");
  assert.equal(closed.saved, false);
  assert.equal(closed.say, "I couldn't file your answers.");
  assert.ok(closed.note?.startsWith("couldn't reach the hub: ") === true, String(closed.note));
});

test("with no hub token, nothing is sent and it says how to turn brain questions on", async () => {
  const hub = await standInHub(201, { saved: "x.md" });
  assert.deepEqual(await fileBrainQuestions("x", null, signal, hub.url), { say: "I couldn't file your answers.", note: questionsOffNote, saved: false });
  assert.deepEqual(hub.asked, []);
  assert.equal(questionsOffNote, "brain questions are off, so set JARVIS_BRAIN_QUESTIONS=on in jarvis/.env, with JARVIS_HUB_TOOLS=on, and start Jarvis again with bash host/jarvis.sh");
  assert.equal(questionsWord, "/questions");
});

test("brain questions are asked for out loud with a short fixed list of phrasings, on their own or as the last sentence, politely or not", () => {
  assert.deepEqual(questionWords, ["brain questions", "any brain questions", "ask me some brain questions", "ask me your brain questions", "any questions for me", "have you got any questions for me", "do you have any questions for me", "got any questions for me"]);
  for (const said of ["Brain questions.", "Hey Jarvis, brain questions.", "Any brain questions?", "Any questions for me?", "Jarvis, any questions for me?", "Have you got any questions for me?", "Do you have any questions for me, Jarvis?", "Got any questions for me?", "Ask me some brain questions, please.", "Can you ask me your brain questions?", "Please, brain questions.", "...vis. Any questions for me?", "Right, I'm back. Any questions for me?", "Okay, brain questions now."]) assert.deepEqual(codeWordIn(said), { kind: "questions" }, said);
});

test("near misses about questions go to Claude as usual", () => {
  for (const said of ["Any questions?", "Questions for me?", "What are brain questions?", "Brain questions are a new thing.", "Any questions for me about the trains?", "Do you have any questions for my sister?", "Brain questions. And what's the weather?", "Have you got any questions for me or not", "Ask me some questions.", "Any questions for him?", "brain question", "My brain has questions for me."]) assert.equal(codeWordIn(said), null, said);
});
