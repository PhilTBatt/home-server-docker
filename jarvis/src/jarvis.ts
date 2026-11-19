import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { answerLogFile, loggingNote, startAnswerLog } from "./answer-log.js";
import { startApiSession } from "./api-session.js";
import { createBrainTools } from "./brain-tools.js";
import { setUpChats, setUpNewChat, type ChatSetup } from "./chat-store.js";
import { apiChatSystem, apiMaxTokens, askOnce, chatModel, chatsLine, chatSystem, confirmMs, engineLine, lengthHintsFor, lengthLineFor, listenNow, newChatAdvice, printable, promptWhileOpen, questionTimeoutMs, runChat, settingsLine } from "./chat.js";
import { brainDir, readConfig, type VoiceMode } from "./config.js";
import { startHubTools, withHubTools, type HubTools } from "./hub-client.js";
import { checkHubServer, describeWithHub, hubServerFile, hubServerFor } from "./hub-tools.js";
import { pricesPerMTok } from "./prices.js";
import { notesFound, notesLine, readSessionNotes, withNotes } from "./session-notes.js";
import { voiceFor } from "./voice.js";

const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
const typed = listenNow(lines);
const prompt = promptWhileOpen(lines);
let session: AgentSession | null = null;
let hubTools: HubTools | undefined;
const starting = new AbortController();
lines.on("SIGINT", () => {
  if (session === null) {
    starting.abort();
    process.exit(130);
  }
  lines.close();
  session.close();
});

try {
  const config = readConfig(process.env);
  if (!existsSync(`${brainDir}/index.md`)) throw new Error(`No brain at ${brainDir}. Mount ~/hub-memory there, read-only.`);
  const now = () => performance.now();
  const warn = (message: string) => process.stdout.write(`  (${printable(message)})\n`);
  const hints = lengthHintsFor(config.lengthHints, lengthLineFor(pricesPerMTok[chatModel], config.lengthWarn, config.lengthCap, newChatAdvice));
  if (config.hubToken !== null) checkHubServer(hubServerFile);
  const hub = config.hubToken === null ? undefined : hubServerFor(config.hubToken, config.hubActions);
  const hubNotes: string[] = [];
  hubTools = hub !== undefined && config.engine === "api" ? await startHubTools(hub, (note) => hubNotes.push(note)) : undefined;
  const notes = config.sessionNotes ? await readSessionNotes() : null;
  let voice: VoiceMode = "off";
  const open = (setup: ChatSetup) => {
    const chat =
      config.engine === "api"
        ? startApiSession({
            apiKey: config.apiKey,
            model: chatModel,
            system: withNotes(apiChatSystem, notes ?? []),
            maxTokens: apiMaxTokens,
            timeoutMs: questionTimeoutMs,
            now,
            tools: withHubTools(createBrainTools(brainDir), hubTools),
            thinkingHistory: config.thinkingHistory,
            history: setup.history,
            save: setup.save,
          })
        : startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: withNotes(chatSystem, notes ?? []), cwd: brainDir, now, savedChats: setup.savedChats, hub });
    session = chat;
    const log = config.log
      ? startAnswerLog(
          { engine: config.engine, thinking: config.thinkingHistory, model: chatModel, chats: setup.chats, lengthHints: config.lengthHints, hubTools: (config.engine === "api" ? hubTools !== undefined : hub !== undefined) ? "on" : "off", hubActions: (config.engine === "api" ? hubTools !== undefined : hub !== undefined) && config.hubActions ? "on" : "off", sessionNotes: notes !== null && notesFound(notes) ? "on" : "off", voice },
          {
            append: async (text) => {
              await mkdir(dirname(answerLogFile), { recursive: true });
              await appendFile(answerLogFile, text);
            },
            now: () => new Date(),
            chat: randomUUID(),
            warn,
            costSoFar: () => chat.costUsd(),
          },
        )
      : undefined;
    return {
      session: chat,
      record: log?.record,
      rate: log?.rate,
      recordNewChat: log?.newChat,
      failureHint: setup.failureHint ?? undefined,
      lengthNote: hints.newLengthNote(),
      knownSize: setup.knownSize,
      rememberSize: setup.rememberSize,
    };
  };
  const chats = await setUpChats(config.chats, config.engine);
  if (chats.problem !== null) warn(chats.problem);
  process.stdout.write(`${engineLine(config.engine, config.thinkingHistory)}\n`);
  process.stdout.write(`${settingsLine(config)}\n`);
  for (const note of hubNotes) warn(note);
  if (notes !== null) process.stdout.write(`${notesLine(notes)}\n`);
  voice = await voiceFor(config, starting.signal, (line) => process.stdout.write(`${line}\n`));
  const first = open(chats);
  process.stdout.write(`${chatsLine(chats.chats, chats.earlierQuestions)}\n`);
  if (config.log) process.stdout.write(`${loggingNote}\n`);
  await runChat({
    ...first,
    lines: typed,
    write: (text) => process.stdout.write(text),
    prompt,
    questionTimeoutMs,
    sizeLine: hints.sizeLine,
    lengthCap: config.lengthCap ?? undefined,
    confirm: (query, signal) => askOnce(lines, query, confirmMs, signal),
    describe: hub === undefined ? undefined : describeWithHub(hub.token),
    newChat: async () => {
      const setup = await setUpNewChat(config.chats, config.engine);
      const notes = [setup.problem, setup.movedTo === undefined ? null : `The old chat is in jarvis/data/chats/${setup.movedTo}, if you want it back`].flatMap((note) => (note === null ? [] : [`  (${printable(note)})`]));
      return { ...open(setup), notes: [...notes, chatsLine(setup.chats, setup.earlierQuestions)] };
    },
  });
} catch (error) {
  console.error(`Jarvis couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  lines.close();
  await hubTools?.close().catch(() => {});
}