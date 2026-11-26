import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { startApiSession } from "./api-session.js";
import { createBrainTools } from "./brain-tools.js";
import { savedSdkChats, setUpChats, setUpNewChat } from "./chat-store.js";
import { apiChatSystem, apiMaxTokens, chatModel, chatSystem, questionTimeoutMs, systemFor } from "./chat.js";
import { askDirect } from "./direct.js";
import { apiUnderTest, formatCheck, runActionsCheck, runEngineCheck, runHubCheck, runNotesCheck, runPersonaCheck, runSavedChatsCheck, sdkUnderTest } from "./engine-check.js";
import { startHubTools, withHubTools, type HubTools } from "./hub-client.js";
import { hubProblemNote, hubToolPrefix, type HubServer } from "./hub-tools.js";
import { liveFacts } from "./live-facts.js";
import { readPersona } from "./persona.js";
import { withTimeout } from "./run.js";
import { readSessionNotes, withNotes } from "./session-notes.js";
import { caseText, hiddenText, ignoredName, ignoredText, longName, longText, startStandInApi } from "./stand-in-api.js";
import { standInHubFile, type HubCall } from "./stand-in-hub.js";
import { claudeHelper } from "./look-up-claude.js";
import { startStandInWeb } from "./stand-in-web.js";
import { runLookUpToolCheck, runWebCheck } from "./web-check.js";
import { guardAllows } from "./web-guard.js";
import { lookUpServer } from "./look-up-sdk.js";
import { createLookUpTool, withLookUp } from "./look-up-tool.js";

const folders: string[] = [];
const apis: Array<{ close(): Promise<void> }> = [];
const sessions: AgentSession[] = [];
const hubs: HubTools[] = [];
let engineEnv: Record<string, string | undefined> | undefined;

async function commandLines(): Promise<string[]> {
  const ids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name));
  const lines = await Promise.all(ids.map((id) => readFile(`/proc/${id}/cmdline`, "utf8").catch(() => "")));
  return lines.map((line) => line.replaceAll("\0", " ").trim()).filter((line) => line !== "");
}

async function runningIn(places: string[]): Promise<boolean> {
  const ids = (await readdir("/proc").catch(() => [])).filter((name) => /^\d+$/.test(name) && Number(name) !== process.pid);
  const workingFolders = await Promise.all(ids.map((id) => readlink(`/proc/${id}/cwd`).catch(() => "")));
  return workingFolders.some((folder) => places.some((place) => folder === place || folder.startsWith(`${place}/`)));
}

async function hubCalls(file: string): Promise<HubCall[]> {
  const text = await readFile(file, "utf8").catch(() => "");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as HubCall);
}

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
  const shared = await runEngineCheck({
    engines: [sdkUnderTest(sdk, sdkApi.requests), apiUnderTest(plain, plainApi.requests)],
    markers,
    model: chatModel,
    timeoutMs: 60_000,
    settleMs: 2000,
    countTranscripts: () => countFiles(join(home, ".claude", "projects"), ".jsonl"),
    engineEnv: () => engineEnv,
  });
  const chatsDir = await mkdtemp(join(tmpdir(), "jarvis-check-chats-"));
  folders.push(chatsDir);
  const places = { sdkChatsFolder: join(chatsDir, "agent-sdk"), apiChatFile: join(chatsDir, "plain-api.json") };
  const savedSdkApi = await startStandInApi(script, "sdk");
  const savedPlainApi = await startStandInApi(script, "api");
  apis.push(savedSdkApi, savedPlainApi);
  const saved = await runSavedChatsCheck({
    engines: [
      {
        engine: "sdk",
        requests: savedSdkApi.requests,
        saved: () => savedSdkChats(places.sdkChatsFolder),
        start: async (mode) => {
          const setup = mode === "new" ? await setUpNewChat("resume", "sdk", places) : await setUpChats(mode, "sdk", places);
          const session = startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: chatSystem, cwd: brain, now, env: { ...process.env, ANTHROPIC_BASE_URL: savedSdkApi.url }, savedChats: setup.savedChats });
          sessions.push(session);
          return Object.assign(session, { knownSize: setup.knownSize, rememberSize: setup.rememberSize });
        },
      },
      {
        engine: "api",
        requests: savedPlainApi.requests,
        saved: () => access(places.apiChatFile).then(() => 1, () => 0),
        start: async (mode) => {
          const setup = mode === "new" ? await setUpNewChat("resume", "api", places) : await setUpChats(mode, "api", places);
          const session = startApiSession(
            { apiKey: "sk-ant-test-key", model: chatModel, system: apiChatSystem, maxTokens: apiMaxTokens, timeoutMs: questionTimeoutMs, now, tools: createBrainTools(brain), thinkingHistory: "keep", history: setup.history, save: setup.save },
            (request) => askDirect({ ...request, url: `${savedPlainApi.url}/v1/messages` }),
          );
          sessions.push(session);
          return Object.assign(session, { knownSize: setup.knownSize });
        },
      },
    ],
    marker: `saved chat ${randomUUID()}`,
    timeoutMs: 60_000,
    settleMs: 1000,
  });
  const hubToken = `hub-token-${randomUUID()}`;
  const hubSdkApi = await startStandInApi(script, "sdk");
  apis.push(hubSdkApi);
  const hubSdkLog = join(home, "hub-sdk.jsonl");
  const sdkWithHub = (hub: HubServer) =>
    startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: chatSystem, cwd: brain, now, env: { ...process.env, ANTHROPIC_BASE_URL: hubSdkApi.url, API_TOKEN: hubToken }, hub });
  const hubSdk = sdkWithHub({ command: process.execPath, args: [standInHubFile, hubSdkLog], token: hubToken });
  sessions.push(hubSdk);
  const hubPlainApi = await startStandInApi(script, "api");
  apis.push(hubPlainApi);
  const hubPlainLog = join(home, "hub-api.jsonl");
  const plainHubTools = await startHubTools({ command: process.execPath, args: [standInHubFile, hubPlainLog], token: hubToken }, () => {});
  if (plainHubTools !== undefined) hubs.push(plainHubTools);
  const hubPlain = startApiSession(
    { apiKey: "sk-ant-test-key", model: chatModel, system: apiChatSystem, maxTokens: apiMaxTokens, timeoutMs: questionTimeoutMs, now, tools: withHubTools(createBrainTools(brain), plainHubTools), thinkingHistory: "keep" },
    (request) => askDirect({ ...request, url: `${hubPlainApi.url}/v1/messages` }),
  );
  sessions.push(hubPlain);
  const hub = await runHubCheck({
    engines: [
      {
        engine: "sdk",
        session: hubSdk,
        requests: hubSdkApi.requests,
        toolName: (name) => `${hubToolPrefix}${name}`,
        calls: () => hubCalls(hubSdkLog),
        broken: async () => {
          const notes: string[] = [];
          const session = sdkWithHub({ command: process.execPath, args: [join(home, "missing-server.js")], token: hubToken });
          sessions.push(session);
          await withTimeout(session.ask("Hello", { note: (note) => notes.push(note) }), 60_000, () => session.close()).catch(() => {});
          return notes[0] ?? null;
        },
      },
      {
        engine: "api",
        session: hubPlain,
        requests: hubPlainApi.requests,
        toolName: (name) => name,
        calls: () => hubCalls(hubPlainLog),
        broken: async () => {
          const notes: string[] = [];
          const tools = await startHubTools({ command: process.execPath, args: [join(home, "missing-server.js")], token: hubToken }, (note) => notes.push(note));
          await tools?.close();
          return notes[0] ?? null;
        },
      },
    ],
    token: hubToken,
    brokenNote: () => hubProblemNote("failed"),
    commandLines,
    timeoutMs: 60_000,
  });
  const actionsSdkApi = await startStandInApi(script, "sdk");
  const actionsPlainApi = await startStandInApi(script, "api");
  apis.push(actionsSdkApi, actionsPlainApi);
  const actionsSdkLog = join(home, "actions-sdk.jsonl");
  const actionsPlainLog = join(home, "actions-api.jsonl");
  const actionsSdk = startAgentSession((prompt, options) => query({ prompt, options }), {
    model: chatModel,
    system: chatSystem,
    cwd: brain,
    now,
    env: { ...process.env, ANTHROPIC_BASE_URL: actionsSdkApi.url },
    hub: { command: process.execPath, args: [standInHubFile, actionsSdkLog], token: hubToken, actions: true },
  });
  const plainActionTools = await startHubTools({ command: process.execPath, args: [standInHubFile, actionsPlainLog], token: hubToken, actions: true }, () => {});
  if (plainActionTools !== undefined) hubs.push(plainActionTools);
  const actionsPlain = startApiSession(
    { apiKey: "sk-ant-test-key", model: chatModel, system: apiChatSystem, maxTokens: apiMaxTokens, timeoutMs: questionTimeoutMs, now, tools: withHubTools(createBrainTools(brain), plainActionTools), thinkingHistory: "keep" },
    (request) => askDirect({ ...request, url: `${actionsPlainApi.url}/v1/messages` }),
  );
  sessions.push(actionsSdk, actionsPlain);
  const actions = await runActionsCheck({
    engines: [
      { engine: "sdk", session: actionsSdk, requests: actionsSdkApi.requests, toolName: (name) => `${hubToolPrefix}${name}`, calls: () => hubCalls(actionsSdkLog) },
      { engine: "api", session: actionsPlain, requests: actionsPlainApi.requests, toolName: (name) => name, calls: () => hubCalls(actionsPlainLog) },
    ],
    timeoutMs: 60_000,
  });
  const notesHome = await mkdtemp(join(tmpdir(), "jarvis-check-notes-"));
  folders.push(notesHome);
  await mkdir(join(notesHome, "docker"));
  const notesText = `- Building the hub's tools (\"both engines\"), marker ${randomUUID()}\n- It's going well`;
  await writeFile(join(notesHome, "docker", "MEMORY.md"), `${notesText}\n`);
  const sessionNotes = await readSessionNotes(notesHome);
  const notesSdkApi = await startStandInApi(script, "sdk");
  const notesPlainApi = await startStandInApi(script, "api");
  apis.push(notesSdkApi, notesPlainApi);
  const notesSdk = startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: withNotes(chatSystem, sessionNotes), cwd: brain, now, env: { ...process.env, ANTHROPIC_BASE_URL: notesSdkApi.url } });
  const notesPlain = startApiSession(
    { apiKey: "sk-ant-test-key", model: chatModel, system: withNotes(apiChatSystem, sessionNotes), maxTokens: apiMaxTokens, timeoutMs: questionTimeoutMs, now, tools: createBrainTools(brain), thinkingHistory: "keep" },
    (request) => askDirect({ ...request, url: `${notesPlainApi.url}/v1/messages` }),
  );
  sessions.push(notesSdk, notesPlain);
  const notes = await runNotesCheck({
    engines: [
      { engine: "sdk", session: notesSdk, requests: notesSdkApi.requests },
      { engine: "api", session: notesPlain, requests: notesPlainApi.requests },
    ],
    notes: notesText,
    commandLines,
    timeoutMs: 60_000,
  });
  const personaHome = await mkdtemp(join(tmpdir(), "jarvis-check-persona-"));
  folders.push(personaHome);
  await writeFile(join(personaHome, "check.md"), `# Check\n- Calm and \"dry\", marker ${randomUUID()}\n`);
  const personaText = await readPersona("check", personaHome);
  const factsText = liveFacts({ voice: "kokoro", ears: "wake", followUp: 6, hubTools: false, hubActions: false, codeWordsReachHub: false, trainAlerts: true, brainQuestions: false, clock: false, web: "off" });
  const personaSdkApi = await startStandInApi(script, "sdk");
  const personaPlainApi = await startStandInApi(script, "api");
  apis.push(personaSdkApi, personaPlainApi);
  const personaSystem = (base: string) => systemFor(base, { persona: personaText, facts: factsText, spoken: false, notes: [], clock: false });
  const personaSdk = startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: personaSystem(chatSystem), cwd: brain, now, env: { ...process.env, ANTHROPIC_BASE_URL: personaSdkApi.url } });
  const personaPlain = startApiSession(
    { apiKey: "sk-ant-test-key", model: chatModel, system: personaSystem(apiChatSystem), maxTokens: apiMaxTokens, timeoutMs: questionTimeoutMs, now, tools: createBrainTools(brain), thinkingHistory: "keep" },
    (request) => askDirect({ ...request, url: `${personaPlainApi.url}/v1/messages` }),
  );
  sessions.push(personaSdk, personaPlain);
  const persona = await runPersonaCheck({
    engines: [
      { engine: "sdk", session: personaSdk, requests: personaSdkApi.requests },
      { engine: "api", session: personaPlain, requests: personaPlainApi.requests },
    ],
    persona: personaText,
    facts: factsText,
    commandLines,
    timeoutMs: 60_000,
  });
  const webApi = await startStandInWeb();
  apis.push(webApi);
  const secrets = { ANTHROPIC_API_KEY: `sk-ant-jarvis-${randomUUID()}`, API_TOKEN: `hub-${randomUUID()}`, JARVIS_WEB_TOKEN: `plan-${randomUUID()}` };
  const kept = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, API_TOKEN: process.env.API_TOKEN, JARVIS_WEB_TOKEN: process.env.JARVIS_WEB_TOKEN };
  Object.assign(process.env, secrets);
  const guards = await mkdtemp(join(tmpdir(), "jarvis-check-guards-"));
  folders.push(guards);
  await writeFile(join(guards, "quiet.mjs"), "");
  await writeFile(join(guards, "yes.mjs"), `process.stdout.write(${JSON.stringify(guardAllows)});\n`);
  const webCredential = { ANTHROPIC_API_KEY: "sk-ant-test-key", ANTHROPIC_BASE_URL: webApi.url };
  const web = await runWebCheck({ helper: claudeHelper({ model: chatModel, credential: webCredential }), quietGuard: claudeHelper({ model: chatModel, credential: webCredential, guard: join(guards, "quiet.mjs") }), yesGuard: claudeHelper({ model: chatModel, credential: webCredential, guard: join(guards, "yes.mjs") }), requests: webApi.requests, markers: Object.values(secrets), stopAfterMs: 1_500, stopWithinMs: 5_000 }).finally(() => {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const lookUpHelper = claudeHelper({ model: chatModel, credential: { ANTHROPIC_API_KEY: "sk-ant-test-key", ANTHROPIC_BASE_URL: webApi.url } });
  const lookUpEngine = (engine: "sdk" | "api") => {
    const asked: string[] = [];
    return { engine, asked, tool: createLookUpTool({ helper: (question, signal) => (asked.push(question), lookUpHelper(question, signal)), now }) };
  };
  const lookSdkApi = await startStandInApi(script, "sdk");
  const lookPlainApi = await startStandInApi(script, "api");
  apis.push(lookSdkApi, lookPlainApi);
  const lookSdk = lookUpEngine("sdk");
  const lookPlain = lookUpEngine("api");
  const lookSdkSession = startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: chatSystem, cwd: brain, now, env: { ...process.env, ANTHROPIC_BASE_URL: lookSdkApi.url }, web: lookUpServer(lookSdk.tool) });
  const lookPlainSession = startApiSession(
    { apiKey: "sk-ant-test-key", model: chatModel, system: apiChatSystem, maxTokens: apiMaxTokens, timeoutMs: questionTimeoutMs, now, tools: withLookUp(createBrainTools(brain), lookPlain.tool), thinkingHistory: "keep" },
    (request) => askDirect({ ...request, url: `${lookPlainApi.url}/v1/messages` }),
  );
  sessions.push(lookSdkSession, lookPlainSession);
  const lookUps = await runLookUpToolCheck({ engines: [{ ...lookSdk, session: lookSdkSession, requests: lookSdkApi.requests }, { ...lookPlain, session: lookPlainSession, requests: lookPlainApi.requests }], timeoutMs: 90_000 });
  const results = [...shared, ...saved, ...hub, ...actions, ...notes, ...persona, ...web, ...lookUps];
  for (const line of formatCheck(results)) console.log(line);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} catch (error) {
  console.error(`The engine check couldn't run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  for (const session of sessions) session.close();
  for (const hub of hubs) await hub.close().catch(() => {});
  const places = await Promise.all(folders.map((folder) => realpath(folder).catch(() => folder)));
  const until = Date.now() + 10_000;
  while (Date.now() < until && (await runningIn(places))) await new Promise((resolve) => setTimeout(resolve, 100));
  for (const api of apis) await api.close();
  for (const folder of folders) await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  for (const folder of folders) if (await access(folder).then(() => true, () => false)) console.error(`Couldn't remove ${folder}`);
}
