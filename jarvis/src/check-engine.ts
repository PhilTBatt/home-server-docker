import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { chatModel, chatSystem } from "./chat.js";
import { formatCheck, runEngineCheck } from "./engine-check.js";
import { startStandInApi, type StandInApi } from "./stand-in-api.js";

const folders: string[] = [];
let api: StandInApi | null = null;
let session: AgentSession | null = null;
let engineEnv: Record<string, string | undefined> | undefined;

async function countFiles(folder: string, ending: string): Promise<number> {
  const entries = await readdir(folder, { recursive: true }).catch(() => []);
  return entries.filter((entry) => entry.endsWith(ending)).length;
}

try {
  const home = await mkdtemp(join(tmpdir(), "jarvis-check-home-"));
  const brain = await mkdtemp(join(tmpdir(), "jarvis-check-brain-"));
  const outside = await mkdtemp(join(tmpdir(), "jarvis-check-outside-"));
  folders.push(home, brain, outside);
  const insideMarker = `stand-in brain ${randomUUID()}`;
  const outsideMarker = `outside the brain ${randomUUID()}`;
  const settingsMarker = `settings file ${randomUUID()}`;
  await writeFile(join(brain, "index.md"), `# Index\n\n${insideMarker}\n`);
  await writeFile(join(brain, "CLAUDE.md"), `${settingsMarker}\n`);
  await writeFile(join(outside, "secret.md"), `${outsideMarker}\n`);
  api = await startStandInApi({ insidePath: join(brain, "index.md"), outsidePath: join(outside, "secret.md") });
  process.env.HOME = home;
  process.env.ANTHROPIC_BASE_URL = api.url;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  process.env.NO_PROXY = "127.0.0.1,localhost";
  session = startAgentSession((prompt, options) => {
    engineEnv = options.env;
    return query({ prompt, options });
  }, { model: chatModel, system: chatSystem, cwd: brain, now: () => performance.now() });
  const results = await runEngineCheck({
    session,
    requests: api.requests,
    insideMarker,
    outsideMarker,
    settingsMarker,
    systemMarker: chatSystem.slice(0, 40),
    model: chatModel,
    timeoutMs: 60_000,
    settleMs: 2000,
    countTranscripts: () => countFiles(join(home, ".claude", "projects"), ".jsonl"),
    engineEnv: () => engineEnv,
  });
  for (const line of formatCheck(results)) console.log(line);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} catch (error) {
  console.error(`The engine check couldn't run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  session?.close();
  await api?.close();
  for (const folder of folders) await rm(folder, { recursive: true, force: true });
}
