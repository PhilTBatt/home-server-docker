import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { apiChatFile, chatsFolder, isSavedTurns, loadChat, questionsIn, savedChatVersion, savedSdkChats, sdkChatsFolder, setUpChats, startChatSaver } from "./chat-store.js";
import type { Turn } from "./direct.js";

const turns: Turn[] = [
  { role: "user", content: "What's in my notes?" },
  { role: "assistant", content: [{ type: "thinking", thinking: "Check the index.", signature: "sig" }, { type: "tool_use", id: "t1", name: "read_file", input: { path: "index.md" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "# Index" }] },
  { role: "assistant", content: [{ type: "text", text: "Your notes cover the hub." }] },
  { role: "user", content: "Thanks" },
  { role: "assistant", content: "Any time." },
];

async function inFolder(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-chats-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const unsaveable = (dir: string) => join(dir, `${"c".repeat(220)}.json`);

test("saved chats live in jarvis/data/chats, git-ignored with the rest of data", () => {
  assert.equal(chatsFolder, fileURLToPath(new URL("../data/chats/", import.meta.url)));
  assert.equal(apiChatFile, join(chatsFolder, "plain-api.json"));
  assert.equal(sdkChatsFolder, join(chatsFolder, "agent-sdk"));
});

test("a saved chat comes back exactly as it was saved, thinking and signatures included, readable only by its owner", async () => {
  await inFolder(async (dir) => {
    const file = join(dir, "chats", "plain-api.json");
    assert.equal(await startChatSaver(file)(turns), null);
    assert.deepEqual(await loadChat(file), { turns, problem: null, canSave: true });
    assert.equal(JSON.parse(await readFile(file, "utf8")).v, savedChatVersion);
    assert.deepEqual(await readdir(join(dir, "chats")), ["plain-api.json"]);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await stat(join(dir, "chats"))).mode & 0o777, 0o700);
  });
});

test("with nothing saved, a chat starts empty and nothing is wrong", async () => {
  await inFolder(async (dir) => {
    assert.deepEqual(await loadChat(join(dir, "nothing.json")), { turns: [], problem: null, canSave: true });
  });
});

test("a saved chat that isn't one Jarvis can read is moved aside, and a new saved chat starts", async () => {
  const bad = ["not json", JSON.stringify({ v: 2, turns }), JSON.stringify({ v: 1, turns: turns.slice(0, 3) }), JSON.stringify({ v: 1 }), "null", JSON.stringify([turns])];
  for (const text of bad) {
    await inFolder(async (dir) => {
      const file = join(dir, "plain-api.json");
      await writeFile(file, text);
      const loaded = await loadChat(file);
      const [aside] = await readdir(dir);
      assert.match(aside, /^plain-api\.json\.unreadable-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/, text);
      assert.deepEqual(loaded, { turns: [], problem: `The saved chat isn't one Jarvis can read, so it was moved aside as ${aside}`, canSave: true }, text);
      assert.equal(await readFile(join(dir, aside), "utf8"), text);
    });
  }
});

test("a second unreadable chat is moved aside next to the first, not over it", async () => {
  await inFolder(async (dir) => {
    const file = join(dir, "plain-api.json");
    await writeFile(file, "first broken chat");
    await loadChat(file);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(file, "second broken chat");
    await loadChat(file);
    const kept = await Promise.all((await readdir(dir)).map((name) => readFile(join(dir, name), "utf8")));
    assert.deepEqual(kept.sort(), ["first broken chat", "second broken chat"]);
  });
});

test("a saved chat that can't be opened is left alone, and this chat isn't saved over it", async () => {
  await inFolder(async (dir) => {
    const file = join(dir, "plain-api.json");
    await mkdir(file);
    assert.deepEqual(await loadChat(file), { turns: [], problem: "The saved chat couldn't be read (EISDIR), so this chat won't be saved, to leave that one alone", canSave: false });
    assert.deepEqual(await readdir(dir), ["plain-api.json"]);
  });
});

test("a saved chat Jarvis can't read or move aside is left alone, and this chat isn't saved over it", async () => {
  await inFolder(async (dir) => {
    const file = join(dir, `${"c".repeat(230)}.json`);
    await writeFile(file, "not json");
    assert.deepEqual(await loadChat(file), { turns: [], problem: "The saved chat isn't one Jarvis can read and couldn't be moved aside, so this chat won't be saved, to leave that one alone", canSave: false });
    assert.equal(await readFile(file, "utf8"), "not json");
  });
});

test("only alternating user and assistant turns count as a saved chat", () => {
  assert.equal(isSavedTurns(turns), true);
  assert.equal(isSavedTurns([]), true);
  assert.equal(isSavedTurns(turns.slice(0, 5)), false);
  assert.equal(isSavedTurns([turns[1], turns[0]]), false);
  assert.equal(isSavedTurns([{ role: "user", content: [] }, turns[3]]), false);
  assert.equal(isSavedTurns([{ role: "user", content: ["text"] }, turns[3]]), false);
  assert.equal(isSavedTurns([{ role: "user", content: 3 }, turns[3]]), false);
  assert.equal(isSavedTurns([["user", "hi"], turns[3]]), false);
  assert.equal(isSavedTurns("turns"), false);
});

test("a saved chat must answer every tool request with its result, and end with an answer, as the API requires", () => {
  assert.equal(isSavedTurns(turns.slice(0, 2)), false);
  assert.equal(isSavedTurns([turns[2], turns[3]]), false);
  assert.equal(isSavedTurns([turns[0], turns[1], { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "# Index" }] }, turns[3]]), false);
  assert.equal(isSavedTurns([turns[0], turns[1], { role: "user", content: [{ type: "text", text: "Never mind" }] }, turns[3]]), false);
  const two = { role: "assistant", content: [{ type: "tool_use", id: "a", name: "read_file", input: {} }, { type: "tool_use", id: "b", name: "read_file", input: {} }] };
  const both = { role: "user", content: [{ type: "tool_result", tool_use_id: "b", content: "" }, { type: "tool_result", tool_use_id: "a", content: "" }] };
  assert.equal(isSavedTurns([turns[0], two, both, turns[3]]), true);
  assert.equal(isSavedTurns([turns[0], two, { role: "user", content: [both.content[0]] }, turns[3]]), false);
});

test("earlier questions are counted from the questions asked, not tool results", () => {
  assert.equal(questionsIn(turns), 2);
  assert.equal(questionsIn([]), 0);
});

test("a chat that can't be saved says so once, then stops trying, and leaves nothing half-written", async () => {
  await inFolder(async (dir) => {
    await writeFile(join(dir, "blocked"), "a file where the folder should be");
    const save = startChatSaver(join(dir, "blocked", "plain-api.json"));
    assert.match((await save(turns)) ?? "", /^Couldn't save the chat, so the rest of it won't be saved: /);
    assert.equal(await save(turns), null);
    assert.deepEqual(await readdir(dir), ["blocked"]);
    await mkdir(join(dir, "plain-api.json"));
    assert.match((await startChatSaver(join(dir, "plain-api.json"))(turns)) ?? "", /^Couldn't save the chat/);
    assert.deepEqual((await readdir(dir)).sort(), ["blocked", "plain-api.json"]);
  });
});

test("a save that can't finish leaves the last saved chat as it was", async () => {
  await inFolder(async (dir) => {
    const file = unsaveable(dir);
    await writeFile(file, "the last saved chat");
    assert.match((await startChatSaver(file)(turns)) ?? "", /^Couldn't save the chat/);
    assert.equal(await readFile(file, "utf8"), "the last saved chat");
    assert.deepEqual(await readdir(dir), [file.slice(dir.length + 1)]);
  });
});

test("saving again replaces the saved chat with the whole chat so far", async () => {
  await inFolder(async (dir) => {
    const file = join(dir, "plain-api.json");
    const save = startChatSaver(file);
    await save(turns.slice(0, 4));
    await save(turns);
    assert.deepEqual((await loadChat(file)).turns, turns);
  });
});

test("two Jarvises saving the same chat at once both finish, and the file holds one whole chat", async () => {
  await inFolder(async (dir) => {
    const file = join(dir, "plain-api.json");
    const one = startChatSaver(file);
    const two = startChatSaver(file);
    for (let round = 0; round < 20; round++) {
      assert.deepEqual(await Promise.all([one(turns.slice(0, 4)), two(turns)]), [null, null]);
      assert.equal(isSavedTurns((await loadChat(file)).turns), true);
    }
    assert.deepEqual(await readdir(dir), ["plain-api.json"]);
  });
});

test("the Agent SDK's saved chats are counted from its transcript files", async () => {
  await inFolder(async (dir) => {
    assert.equal(await savedSdkChats(dir), 0);
    await mkdir(join(dir, "projects", "-brain"), { recursive: true });
    await writeFile(join(dir, "projects", "-brain", "a.jsonl"), "{}\n");
    await writeFile(join(dir, "projects", "-brain", "notes.txt"), "");
    assert.equal(await savedSdkChats(dir), 1);
  });
});

test("a fresh chat loads and saves nothing, on either engine", async () => {
  await inFolder(async (dir) => {
    const places = { apiChatFile: join(dir, "plain-api.json"), sdkChatsFolder: join(dir, "agent-sdk") };
    await startChatSaver(places.apiChatFile)(turns);
    for (const engine of ["api", "sdk"] as const) {
      assert.deepEqual(await setUpChats("fresh", engine, places), { chats: "fresh", history: [], earlierQuestions: 0, problem: null, failureHint: null });
    }
    assert.deepEqual(await readdir(dir), ["plain-api.json"]);
  });
});

test("a resumed plain API chat carries on the saved one, saves as it goes, and says how to start over if questions fail", async () => {
  await inFolder(async (dir) => {
    const places = { apiChatFile: join(dir, "plain-api.json"), sdkChatsFolder: join(dir, "agent-sdk") };
    const first = await setUpChats("resume", "api", places);
    assert.deepEqual({ ...first, save: typeof first.save }, { chats: "resume", history: [], earlierQuestions: 0, save: "function", problem: null, failureHint: null });
    await first.save?.(turns);
    const picked = await setUpChats("resume", "api", places);
    assert.deepEqual(picked.history, turns);
    assert.equal(picked.earlierQuestions, 2);
    assert.equal(picked.failureHint, "This chat carries on a saved one. If every question fails, the saved chat may be why: delete jarvis/data/chats/plain-api.json to start a new one");
    assert.equal(picked.savedChats, undefined);
  });
});

test("a resumed plain API chat whose saved chat can't be read runs as a fresh chat, so nothing is saved over it", async () => {
  await inFolder(async (dir) => {
    const places = { apiChatFile: join(dir, "plain-api.json"), sdkChatsFolder: join(dir, "agent-sdk") };
    await mkdir(places.apiChatFile);
    const setup = await setUpChats("resume", "api", places);
    assert.deepEqual(setup, { chats: "fresh", history: [], earlierQuestions: 0, problem: "The saved chat couldn't be read (EISDIR), so this chat won't be saved, to leave that one alone", failureHint: null });
  });
});

test("a resumed plain API chat whose saved chat was moved aside starts a new saved chat, and says why", async () => {
  await inFolder(async (dir) => {
    const places = { apiChatFile: join(dir, "plain-api.json"), sdkChatsFolder: join(dir, "agent-sdk") };
    await writeFile(places.apiChatFile, "not json");
    const setup = await setUpChats("resume", "api", places);
    assert.equal(setup.chats, "resume");
    assert.match(setup.problem ?? "", /^The saved chat isn't one Jarvis can read, so it was moved aside as plain-api\.json\.unreadable-/);
    assert.equal(typeof setup.save, "function");
    assert.equal(setup.failureHint, null);
  });
});

test("a resumed Agent SDK chat uses Jarvis's own folder, made private, and only hints at starting over once something is saved", async () => {
  await inFolder(async (dir) => {
    const places = { apiChatFile: join(dir, "chats", "plain-api.json"), sdkChatsFolder: join(dir, "chats", "agent-sdk") };
    assert.deepEqual(await setUpChats("resume", "sdk", places), { chats: "resume", history: [], earlierQuestions: 0, savedChats: places.sdkChatsFolder, problem: null, failureHint: null });
    assert.equal((await stat(join(dir, "chats"))).mode & 0o777, 0o700);
    assert.equal((await stat(places.sdkChatsFolder)).mode & 0o777, 0o700);
    await mkdir(join(places.sdkChatsFolder, "projects", "-brain"), { recursive: true });
    await writeFile(join(places.sdkChatsFolder, "projects", "-brain", "a.jsonl"), "{}\n");
    const picked = await setUpChats("resume", "sdk", places);
    assert.equal(picked.earlierQuestions, null);
    assert.equal(picked.failureHint, "This chat carries on a saved one. If every question fails, the saved chat may be why: delete jarvis/data/chats/agent-sdk to start a new one");
  });
});

test("a resumed Agent SDK chat whose folder can't be made runs as a fresh chat, and says why, instead of stopping Jarvis", async () => {
  await inFolder(async (dir) => {
    await writeFile(join(dir, "chats"), "a file where the folder should be");
    const places = { apiChatFile: join(dir, "chats", "plain-api.json"), sdkChatsFolder: join(dir, "chats", "agent-sdk") };
    assert.deepEqual(await setUpChats("resume", "sdk", places), { chats: "fresh", history: [], earlierQuestions: 0, problem: "The saved chats folder can't be written to (ENOTDIR), so this chat won't be saved", failureHint: null });
  });
});

test("a resumed Agent SDK chat whose folder Jarvis can't write to runs as a fresh chat", { skip: process.getuid?.() === 0 ? "root can write anywhere" : false }, async () => {
  await inFolder(async (dir) => {
    const places = { apiChatFile: join(dir, "chats", "plain-api.json"), sdkChatsFolder: join(dir, "chats", "agent-sdk") };
    await mkdir(places.sdkChatsFolder, { recursive: true });
    await chmod(places.sdkChatsFolder, 0o500);
    try {
      assert.deepEqual(await setUpChats("resume", "sdk", places), { chats: "fresh", history: [], earlierQuestions: 0, problem: "The saved chats folder can't be written to (EACCES), so this chat won't be saved", failureHint: null });
    } finally {
      await chmod(places.sdkChatsFolder, 0o700);
    }
  });
});
