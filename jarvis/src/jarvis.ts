import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { chatModel, chatSystem, promptWhileOpen, runChat } from "./chat.js";
import { brainDir, readConfig } from "./config.js";

const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
let session: AgentSession | null = null;
lines.on("SIGINT", () => {
  lines.close();
  session?.close();
});

try {
  readConfig(process.env);
  if (!existsSync(`${brainDir}/index.md`)) throw new Error(`No brain at ${brainDir}. Mount ~/hub-memory there, read-only.`);
  session = startAgentSession((prompt, options) => query({ prompt, options }), {
    model: chatModel,
    system: chatSystem,
    cwd: brainDir,
    now: () => performance.now(),
  });
  await runChat({
    lines,
    session,
    write: (text) => process.stdout.write(text),
    prompt: promptWhileOpen(lines),
    questionTimeoutMs: 120_000,
  });
} catch (error) {
  console.error(`Jarvis couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  lines.close();
}