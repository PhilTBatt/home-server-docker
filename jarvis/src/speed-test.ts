import { existsSync, readFileSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession } from "./agent.js";
import { brainDir, readConfig } from "./config.js";
import { askDirect } from "./direct.js";
import { readAnonMemoryMb } from "./memory.js";
import { formatReport, model, runSpeedTest, system } from "./run.js";

const now = () => performance.now();

try {
  const config = readConfig(process.env);
  if (!existsSync(`${brainDir}/index.md`)) throw new Error(`No brain at ${brainDir}. Mount ~/hub-memory there, read-only.`);
  const results = await runSpeedTest({
    askDirect: (question, thinkingOff) => askDirect({ apiKey: config.apiKey, model, system, question, maxTokens: 4000, thinkingOff, now }),
    startSession: () => startAgentSession((prompt, options) => query({ prompt, options }), { model, system, cwd: brainDir, now }),
    readMemoryMb: () => readAnonMemoryMb((path) => readFileSync(path, "utf8")),
    questionTimeoutMs: 120_000,
    log: (line) => console.log(line),
  });
  for (const line of formatReport(results)) console.log(line);
} catch (error) {
  console.error(`Speed test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}