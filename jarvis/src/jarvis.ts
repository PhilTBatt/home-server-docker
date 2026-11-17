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
import { setUpChats } from "./chat-store.js";
import { apiChatSystem, apiMaxTokens, chatModel, chatsLine, chatSystem, engineLine, lengthLineFor, listenNow, printable, promptWhileOpen, questionTimeoutMs, runChat, settingsLine, startLengthNotes } from "./chat.js";
import { brainDir, readConfig } from "./config.js";
import { pricesPerMTok } from "./prices.js";

const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
const typed = listenNow(lines);
const prompt = promptWhileOpen(lines);
let session: AgentSession | null = null;
lines.on("SIGINT", () => {
  lines.close();
  session?.close();
});

try {
  const config = readConfig(process.env);
  if (!existsSync(`${brainDir}/index.md`)) throw new Error(`No brain at ${brainDir}. Mount ~/hub-memory there, read-only.`);
  const now = () => performance.now();
  const warn = (message: string) => process.stdout.write(`  (${printable(message)})\n`);
  const chats = await setUpChats(config.chats, config.engine);
  if (chats.problem !== null) warn(chats.problem);
  const lengthLine = lengthLineFor(pricesPerMTok[chatModel], chats.startOver);
  const lengthNotes = lengthLine === null ? null : startLengthNotes(lengthLine);
  session =
    config.engine === "api"
      ? startApiSession({
          apiKey: config.apiKey,
          model: chatModel,
          system: apiChatSystem,
          maxTokens: apiMaxTokens,
          timeoutMs: questionTimeoutMs,
          now,
          tools: createBrainTools(brainDir),
          thinkingHistory: config.thinkingHistory,
          history: chats.history,
          save: chats.save,
        })
      : startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: chatSystem, cwd: brainDir, now, savedChats: chats.savedChats });
  process.stdout.write(`${engineLine(config.engine, config.thinkingHistory)}\n`);
  process.stdout.write(`${settingsLine(config)}\n`);
  process.stdout.write(`${chatsLine(chats.chats, chats.earlierQuestions)}\n`);
  if (config.log) process.stdout.write(`${loggingNote}\n`);
  const log = config.log
    ? startAnswerLog(
        { engine: config.engine, thinking: config.thinkingHistory, model: chatModel, chats: chats.chats },
        {
          append: async (text) => {
            await mkdir(dirname(answerLogFile), { recursive: true });
            await appendFile(answerLogFile, text);
          },
          now: () => new Date(),
          chat: randomUUID(),
          warn,
          costSoFar: () => session?.costUsd() ?? null,
        },
      )
    : undefined;
  await runChat({
    lines: typed,
    session,
    write: (text) => process.stdout.write(text),
    prompt,
    questionTimeoutMs,
    record: log?.record,
    rate: log?.rate,
    failureHint: chats.failureHint ?? undefined,
    lengthNote: lengthNotes ?? undefined,
  });
} catch (error) {
  console.error(`Jarvis couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  lines.close();
}