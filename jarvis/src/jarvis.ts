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
import { apiChatSystem, apiMaxTokens, chatModel, chatSystem, engineLine, printable, promptWhileOpen, questionTimeoutMs, runChat } from "./chat.js";
import { brainDir, readConfig } from "./config.js";

const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
let session: AgentSession | null = null;
lines.on("SIGINT", () => {
  lines.close();
  session?.close();
});

try {
  const config = readConfig(process.env);
  if (!existsSync(`${brainDir}/index.md`)) throw new Error(`No brain at ${brainDir}. Mount ~/hub-memory there, read-only.`);
  const now = () => performance.now();
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
        })
      : startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: chatSystem, cwd: brainDir, now });
  process.stdout.write(`${engineLine(config.engine, config.thinkingHistory)}\n`);
  if (config.log) process.stdout.write(`${loggingNote}\n`);
  const log = config.log
    ? startAnswerLog(
        { engine: config.engine, thinking: config.thinkingHistory, model: chatModel },
        {
          append: async (text) => {
            await mkdir(dirname(answerLogFile), { recursive: true });
            await appendFile(answerLogFile, text);
          },
          now: () => new Date(),
          chat: randomUUID(),
          warn: (message) => process.stdout.write(`  (${printable(message)})\n`),
          costSoFar: () => session?.costUsd() ?? null,
        },
      )
    : undefined;
  await runChat({
    lines,
    session,
    write: (text) => process.stdout.write(text),
    prompt: promptWhileOpen(lines),
    questionTimeoutMs,
    record: log?.record,
    rate: log?.rate,
  });
} catch (error) {
  console.error(`Jarvis couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  lines.close();
}