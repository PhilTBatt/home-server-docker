import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { startApiSession } from "./api-session.js";
import { apiChatSystem, chatModel, chatSystem, engineLine, promptWhileOpen, questionTimeoutMs, runChat } from "./chat.js";
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
      ? startApiSession({ apiKey: config.apiKey, model: chatModel, system: apiChatSystem, maxTokens: 4000, timeoutMs: questionTimeoutMs, now })
      : startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: chatSystem, cwd: brainDir, now });
  process.stdout.write(`${engineLine(config.engine)}\n`);
  await runChat({
    lines,
    session,
    write: (text) => process.stdout.write(text),
    prompt: promptWhileOpen(lines),
    questionTimeoutMs,
  });
} catch (error) {
  console.error(`Jarvis couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  lines.close();
}