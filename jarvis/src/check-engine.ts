import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { startApiSession } from "./api-session.js";
import { createBrainTools } from "./brain-tools.js";
import { apiChatSystem, apiMaxTokens, chatModel, chatSystem, questionTimeoutMs } from "./chat.js";
import { askDirect } from "./direct.js";
import { apiUnderTest, formatCheck, runEngineCheck, sdkUnderTest } from "./engine-check.js";
import { caseText, hiddenText, ignoredName, ignoredText, longName, longText, startStandInApi, type StandInApi } from "./stand-in-api.js";

const folders: string[] = [];
const apis: StandInApi[] = [];
const sessions: AgentSession[] = [];
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
  const markers = {
    inside: `stand-in brain ${randomUUID()}`,
    outside: `outside the brain ${randomUUID()}`,
    settings: `settings file ${randomUUID()}`,
    git: `git brain ${randomUUID()}`,
    hidden: `${hiddenText} ${randomUUID()}`,
    ignored: `${ignoredText} ${randomUUID()}`,
    mixedCase: `${caseText} ${randomUUID()}`,
  };
  await writeFile(join(brain, "index.md"), `# Index\n\n${markers.inside}\n`);
  await writeFile(join(brain, "CLAUDE.md"), `${markers.settings}\n`);
  await writeFile(join(brain, ".hidden-note.md"), `${markers.hidden}\n`);
  await writeFile(join(brain, ".gitignore"), `${ignoredName}\n`);
  await writeFile(join(brain, ignoredName), `${markers.ignored}\n`);
  await writeFile(join(brain, "mixed-case.md"), `${markers.mixedCase}\n`);
  await writeFile(join(brain, longName), `${longText} x${"🙂".repeat(1500)}\n`);
  await writeFile(join(outside, "secret.md"), `${markers.outside}\n`);
  await mkdir(join(brain, ".git"));
  await writeFile(join(brain, ".git", "config"), `${markers.git}\n`);
  await symlink(outside, join(brain, "linked"));
  const script = { insidePath: join(brain, "index.md"), outsidePath: join(outside, "secret.md"), gitPath: join(brain, ".git", "config"), linkedPath: join(brain, "linked", "secret.md") };
  const sdkApi = await startStandInApi(script, "sdk");
  const plainApi = await startStandInApi(script, "api");
  apis.push(sdkApi, plainApi);
  process.env.HOME = home;
  process.env.ANTHROPIC_BASE_URL = sdkApi.url;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  process.env.NO_PROXY = "127.0.0.1,localhost";
  const now = () => performance.now();
  const sdk = startAgentSession((prompt, options) => {
    engineEnv = options.env;
    return query({ prompt, options });
  }, { model: chatModel, system: chatSystem, cwd: brain, now });
  const plain = startApiSession(
    { apiKey: "sk-ant-test-key", model: chatModel, system: apiChatSystem, maxTokens: apiMaxTokens, timeoutMs: questionTimeoutMs, now, tools: createBrainTools(brain), thinkingHistory: "keep" },
    (request) => askDirect({ ...request, url: `${plainApi.url}/v1/messages` }),
  );
  sessions.push(sdk, plain);
  const results = await runEngineCheck({
    engines: [sdkUnderTest(sdk, sdkApi.requests), apiUnderTest(plain, plainApi.requests)],
    markers,
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
  for (const session of sessions) session.close();
  for (const api of apis) await api.close();
  for (const folder of folders) await rm(folder, { recursive: true, force: true });
}
