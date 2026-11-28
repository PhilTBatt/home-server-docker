import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { clearLine, createInterface, cursorTo } from "node:readline";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { answerLogFile, loggingNote, startAnswerLog, type AnswerLog } from "./answer-log.js";
import { lookUpsLine, type LookedUp } from "./look-up.js";
import { apiHelper } from "./look-up-api.js";
import { lookUpServer } from "./look-up-sdk.js";
import { createLookUpTool, withLookUp } from "./look-up-tool.js";
import { claudeHelper, findProgram, guardFile, noGuard, noProgram, planToken } from "./look-up-claude.js";
import { lookUpLogFile, lookUpLoggingNote, lookUpNumbers, startLookUpLog, type LookUpMode } from "./look-up-log.js";
import { speakerParts, startAnswerSpeech, type Speaker } from "./answer-speech.js";
import { startApiSession } from "./api-session.js";
import { brainFileExists, fileBrainQuestions } from "./brain-questions.js";
import { createBrainTools, noBrainTools } from "./brain-tools.js";
import { chimeFor } from "./chime.js";
import { projectorCodeWords, findPhone, keepPageWords, openWallPage, pageListFirstMs, phoneFound, saveVoiceNote, serverCheck, trainTimes, wallBack, wallPageList } from "./code-words.js";
import { fillerFor } from "./filler.js";
import { setUpChats, setUpNewChat, type ChatSetup } from "./chat-store.js";
import { apiChatSystem, guestChatSystem, apiMaxTokens, askOnce, chatModel, chatsLine, chatSystem, confirmMs, engineLine, heardLines, lengthHintsFor, lengthLineFor, newChatAdvice, printable, promptWhileOpen, questionTimeoutMs, runChat, settingsLine, systemFor } from "./chat.js";
import { brainDir, readConfig, type VoiceMode } from "./config.js";
import { earsCaller, guestDoor } from "./ears-client.js";
import { startHubTools, withHubTools, type HubTools } from "./hub-client.js";
import { checkHubServer, describeWithHub, hubServerFile, hubServerFor } from "./hub-tools.js";
import { factsWiring, liveFacts } from "./live-facts.js";
import { introLine, readIntro } from "./intro.js";
import { hubModes as modeHub, watchModes, whenCheck } from "./modes.js";
import { askHubForDue, hubReminders, watchReminders } from "./reminders.js";
import { morningWiring } from "./morning.js";
import { setVolume } from "./sound-card.js";
import { hubDesk, hubModeCheck, phoneVoice, watchPhone, whisperHears } from "./phone.js";
import { askHubForSessions, watchSessions } from "./session-news.js";
import { digestFor, digestLine, withDigest } from "./digest.js";
import { personaLine, readPersona } from "./persona.js";
import { pricesPerMTok } from "./prices.js";
import { notesFound, notesLine, readSessionNotes } from "./session-notes.js";
import { startTalk } from "./talk.js";
import { askHubForChanges, watchTrainChanges } from "./train-news.js";
import { turnCheck } from "./turn-check.js";
import { followOnCheck } from "./look-up-follow.js";
import { voiceFor } from "./voice.js";
import { createFollowAsk, eager, mutedFrom, spokenOf, startWakeHold, stopOnCutIn, watchWake } from "./wake.js";
import { createWall, hubWall, lookingOnWall, playOnWall, type Wall } from "./wall.js";
import { factsTold, featuresLine, hubFeaturesReader, watchHubFeatures } from "./hub-features.js";

const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
const heard = heardLines(lines, promptWhileOpen(lines));
let session: AgentSession | null = null;
let hubTools: HubTools | undefined;
const starting = new AbortController();
const closing = new AbortController();
const watching = new AbortController();
let wakeHold: { close(): void } | undefined;
let wall: Wall | undefined;
lines.on("close", () => closing.abort());
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
  const projectorWiring = projectorCodeWords(config.projector, config.hubToken);
  delete process.env.JARVIS_WEB_TOKEN;
  if (!existsSync(`${brainDir}/index.md`)) throw new Error(`No brain at ${brainDir}. Mount ~/hub-memory there, read-only.`);
  const now = () => performance.now();
  const warn = (message: string) => process.stdout.write(`  (${printable(message)})\n`);
  const noteLine = (line: string) => {
    if (process.stdout.isTTY) {
      cursorTo(process.stdout, 0);
      clearLine(process.stdout, 0);
    }
    process.stdout.write(`  (${printable(line)})\n`);
    heard.prompt();
  };
  wall = config.wall && config.hubToken !== null ? createWall({ send: hubWall(config.hubToken), now, note: noteLine }) : undefined;
  const shown = wall;
  const hints = lengthHintsFor(config.lengthHints, lengthLineFor(pricesPerMTok[chatModel], config.lengthWarn, config.lengthCap, newChatAdvice));
  if (config.hubToken !== null) checkHubServer(hubServerFile);
  const hubBase = config.hubToken === null ? undefined : hubServerFor(config.hubToken, config.hubActions, hubServerFile, config.musicYes);
  const hub = hubBase === undefined || config.wallPages !== "on" ? hubBase : { ...hubBase, wallPages: true };
  const hubNotes: string[] = [];
  hubTools = hub !== undefined && config.engine === "api" ? await startHubTools(hub, (note) => hubNotes.push(note)) : undefined;
  const notes = config.sessionNotes ? await readSessionNotes() : null;
  const persona = config.persona === null ? null : await readPersona(config.persona);
  const intro = config.intro ? await readIntro() : null;
  let voice: VoiceMode = "off";
  let speaker: Speaker | null = null;
  const anyHelper = config.web === "off" ? undefined : config.webBy === "api" ? apiHelper({ apiKey: config.apiKey, model: chatModel, now, prices: pricesPerMTok[chatModel] }) : config.webToken === null ? undefined : claudeHelper({ model: chatModel, credential: { [planToken]: config.webToken } });
  const webHelper = anyHelper === undefined ? undefined : lookingOnWall(anyHelper, shown);
  const lookUpLog =
    webHelper === undefined || !config.webLog
      ? undefined
      : startLookUpLog({
          append: async (text) => {
            await mkdir(dirname(lookUpLogFile), { recursive: true });
            await appendFile(lookUpLogFile, text);
          },
          now: () => new Date(),
          warn,
        });
  const guestDir = config.guest ? await mkdtemp(join(tmpdir(), "jarvis-guest-")) : null;
  const guestSetup: ChatSetup = { chats: "fresh", history: [], earlierQuestions: null, problem: null, failureHint: null };
  const modes = config.modes && config.hubToken !== null ? modeHub(config.hubToken) : undefined;
  const pageToken = config.hubToken;
  const pageWords = config.wallPages === "off" || pageToken === null ? undefined : keepPageWords((signal) => wallPageList(pageToken, signal), warn);
  closing.signal.addEventListener("abort", () => pageWords?.stop(), { once: true });
  const hubSwitches = config.hubToken === null || !config.liveFacts ? undefined : watchHubFeatures({ read: hubFeaturesReader(config.hubToken), signal: closing.signal });
  await hubSwitches?.first(starting.signal);
  await pageWords?.first(AbortSignal.any([starting.signal, AbortSignal.timeout(pageListFirstMs)]));
  const open = (setup: ChatSetup, guest = false) => {
    const spoken = voice !== "off" && config.spokenStyle;
    const hubOn = guest ? false : config.engine === "api" ? hubTools !== undefined : hub !== undefined;
    const atHub = hubSwitches?.latest() ?? null;
    const wired = factsWiring(config, { voice, guest, hubOn, atHub, wallPageIds: pageWords?.current()?.map((page) => page.id) ?? null });
    const facts = config.liveFacts ? liveFacts(wired.input) : null;
    const relevant = wired.relevant;
    const told = factsTold(atHub);
    const factsChange = !config.liveFacts || hubSwitches === undefined ? undefined : () => told.line(hubSwitches.latest(), relevant);
    const digest = config.digest ? digestFor({ guest }) : null;
    const instructions = (base: string) => withDigest(systemFor(guest ? guestChatSystem : base, { persona, intro, facts, spoken, notes: guest ? [] : (notes ?? []), clock: config.clock }), digest);
    const logged: { log?: AnswerLog } = {};
    const recordLookUp = async (mode: LookUpMode, looked: LookedUp) => {
      await lookUpLog?.(mode, config.webBy, looked, guest);
      await logged.log?.lookUp(lookUpNumbers(mode, config.webBy, looked, guest));
    };
    const lookUpTool = config.web === "auto" && webHelper !== undefined ? createLookUpTool({ helper: webHelper, now, record: (looked) => recordLookUp("auto", looked), closing: closing.signal }) : undefined;
    const chat =
      config.engine === "api"
        ? startApiSession({
            apiKey: config.apiKey,
            model: chatModel,
            system: instructions(apiChatSystem),
            maxTokens: apiMaxTokens,
            timeoutMs: questionTimeoutMs,
            now,
            tools: withLookUp(guest ? noBrainTools : withHubTools(createBrainTools(brainDir), hubTools), lookUpTool),
            thinkingHistory: config.thinkingHistory,
            history: setup.history,
            save: setup.save,
          })
        : startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: instructions(chatSystem), cwd: guest && guestDir !== null ? guestDir : brainDir, now, savedChats: guest ? undefined : setup.savedChats, hub: guest ? undefined : hub, web: lookUpTool === undefined ? undefined : lookUpServer(lookUpTool), ...(guest ? { brain: false } : {}) });
    session = chat;
    const log = config.log
      ? startAnswerLog(
          { engine: config.engine, thinking: config.thinkingHistory, model: chatModel, chats: setup.chats, lengthHints: config.lengthHints, hubTools: hubOn ? "on" : "off", hubActions: hubOn && config.hubActions ? "on" : "off", sessionNotes: !guest && notes !== null && notesFound(notes) ? "on" : "off", voice, kokoroSpeed: config.kokoroSpeed, speechStart: config.speechStart, speechStop: config.speechStop, speechBundle: config.speechBundle ? "on" : "off", spokenStyle: config.spokenStyle ? "on" : "off", persona: config.persona ?? "off", liveFacts: config.liveFacts ? "on" : "off", ...(guest ? { guest: true } : {}) },
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
    logged.log = log;
    return {
      session: chat,
      record: log?.record,
      rate: log?.rate,
      recordNewChat: log?.newChat,
      recordSpeech: log?.speech,
      web:
        webHelper === undefined
          ? undefined
          : {
              helper: webHelper,
              now,
              record: recordLookUp,
              tool: lookUpTool,
              followOn: followOnCheck({ apiKey: config.apiKey, model: chatModel }),
            },
      failureHint: setup.failureHint ?? undefined,
      lengthNote: hints.newLengthNote(),
      knownSize: setup.knownSize,
      rememberSize: setup.rememberSize,
      factsChange,
    };
  };
  const chats = await setUpChats(config.chats, config.engine);
  if (chats.problem !== null) warn(chats.problem);
  process.stdout.write(`${engineLine(config.engine, config.thinkingHistory)}\n`);
  process.stdout.write(`${settingsLine(config)}\n`);
  for (const note of hubNotes) warn(note);
  if (notes !== null) process.stdout.write(`${notesLine(notes)}\n`);
  if (config.persona !== null) process.stdout.write(`${personaLine(config.persona, persona)}\n`);
  if (config.intro) process.stdout.write(`${introLine(intro)}\n`);
  if (config.digest) process.stdout.write(`${digestLine(digestFor({ guest: false }))}\n`);
  if (shown !== undefined) process.stdout.write(`${printable(await shown.ready())}\n`);
  const earsCall = config.earsToken === null ? null : earsCaller(config.earsToken);
  const hold = earsCall === null || config.voice === "off" ? undefined : startWakeHold(earsCall);
  wakeHold = hold;
  const starts = voiceFor(config, starting.signal, (line) => process.stdout.write(`${line}\n`));
  hold?.during(() => starts.then(() => {}));
  const started = await starts;
  ({ mode: voice, speaker } = started);
  const speaking = speaker;
  const soundCard = started.card ?? null;
  shown?.voiced(speaking !== null);
  const talk = earsCall === null ? undefined : startTalk({ call: earsCall, wake: config.ears === "wake" });
  if (talk !== undefined) process.stdout.write(`${printable(await talk.check(starting.signal))}\n`);
  let chatReady = false;
  const speeches = new Set<{ stop(): void }>();
  const cutIn = stopOnCutIn(speeches);
  const follow = config.followUp === null ? undefined : createFollowAsk();
  const wake = earsCall === null || config.ears !== "wake" ? undefined : eager(watchWake({ call: earsCall, signal: AbortSignal.any([closing.signal, watching.signal]), busy: () => !chatReady, follow, judge: config.turnCheck ? turnCheck({ apiKey: config.apiKey, model: chatModel }) : undefined, speaking: () => hold?.active() ?? false }), (event) => {
    cutIn(event);
    if (event.kind === "status") shown?.muted(mutedFrom(event.line));
  });
  const followSeconds = config.followUp;
  if (hubSwitches !== undefined) process.stdout.write(`${featuresLine(hubSwitches.latest())}\n`);
  const first = open(chats);
  process.stdout.write(`${chatsLine(chats.chats, chats.earlierQuestions)}\n`);
  if (config.log) process.stdout.write(`${loggingNote}\n`);
  if (webHelper !== undefined) process.stdout.write(`${lookUpsLine(config.webBy, config.webBy === "api" ? null : (await findProgram()) === null ? noProgram : existsSync(guardFile) ? null : noGuard)}\n`);
  if (lookUpLog !== undefined) process.stdout.write(`${lookUpLoggingNote}\n`);
  await runChat({
    ...first,
    lines: heard.lines,
    write: (text) => process.stdout.write(text),
    prompt: heard.prompt,
    early: heard.early,
    questionTimeoutMs,
    sizeLine: hints.sizeLine,
    clock: config.clock ? () => new Date() : undefined,
    lengthCap: config.lengthCap ?? undefined,
    confirm: (query, signal) => askOnce(lines, query, confirmMs, signal),
    describe: hub === undefined ? undefined : describeWithHub(hub.token),
    speak:
      speaking === null
        ? undefined
        : (after, caption) => {
            const speech = startAnswerSpeech({ ...playOnWall(speakerParts(speaking), shown, speaking.engine.sampleRate, caption), now, start: config.speechStart, skipCode: config.spokenStyle, bundle: config.speechBundle, after, ...(config.filler ? { filler: fillerFor(speaking) } : {}) });
            speeches.add(speech);
            const over = spokenOf(speech)().finally(() => speeches.delete(speech));
            hold?.during(() => over);
            shown?.speech(over);
            return speech;
          },
    speechStop: config.speechStop,
    talk,
    closing: closing.signal,
    wake,
    ready: (yes) => (chatReady = yes),
    chime: wake === undefined || speaking === null ? undefined : chimeFor(speaking),
    followUp: wake === undefined || follow === undefined || followSeconds === null ? undefined : { seconds: followSeconds, ask: () => follow.ask(followSeconds * 1000) },
    codeWords: { note: (text, signal) => saveVoiceNote(text, config.hubToken, signal), phone: (signal) => findPhone(config.hubToken, signal), found: (signal) => phoneFound(config.hubToken, signal), trains: (signal) => trainTimes(config.hubToken, signal), server: (signal) => serverCheck(config.hubToken, signal), ...(projectorWiring.action === undefined ? {} : { projector: projectorWiring.action }) },
    wallWords: pageWords === undefined ? undefined : { page: (id, signal) => openWallPage(config.hubToken, id, signal), back: (signal) => wallBack(config.hubToken, signal) },
    projectorWords: projectorWiring.projectorWords,
    pageWords: pageWords === undefined ? undefined : () => pageWords.current(),
    questions: config.brainQuestions && config.hubToken !== null ? { exists: brainFileExists(), file: (text, signal) => fileBrainQuestions(text, config.hubToken, signal) } : undefined,
    trains: config.trainAlerts && config.hubToken !== null ? watchTrainChanges({ ask: askHubForChanges(config.hubToken), signal: closing.signal }) : undefined,
    interrupt: () => {
      if (!process.stdout.isTTY) return;
      cursorTo(process.stdout, 0);
      clearLine(process.stdout, 0);
    },
    modes: modes === undefined ? undefined : { hub: modes, events: watchModes({ hub: modes, signal: closing.signal }) },
    guest: config.guest ? { open: async () => ({ ...open(guestSetup, true), notes: [] }) } : undefined,
    when: config.modes ? whenCheck({ apiKey: config.apiKey, model: chatModel }) : undefined,
    voices: config.voices ? { other: config.otherVoices } : undefined,
    earsGuests: guestDoor(config.ears, earsCall),
    sessions: config.sessions && config.hubToken !== null ? watchSessions({ ask: askHubForSessions(config.hubToken), signal: closing.signal }) : undefined,
    reminders: config.reminders && config.hubToken !== null ? { news: watchReminders({ ask: askHubForDue(config.hubToken), signal: closing.signal }), hub: hubReminders(config.hubToken) } : undefined,
    morning: config.morning && config.hubToken !== null ? morningWiring({ token: config.hubToken, signal: closing.signal, speaker: speaking, volume: config.volume, setVolume: soundCard === null ? null : (level) => setVolume(soundCard, level) }) : undefined,
    wall: shown?.chat,
    features: hubSwitches?.events,
    phone: config.phone && config.hubToken !== null ? { news: watchPhone({ desk: hubDesk(config.hubToken), signal: closing.signal }), desk: hubDesk(config.hubToken), hear: whisperHears(), mode: hubModeCheck(config.hubToken), voice: speaking === null ? null : (text, signal, piece) => phoneVoice(speaking.engine, text, signal, config.spokenStyle, piece) } : undefined,
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
  watching.abort();
  wakeHold?.close();
  wall?.close();
  lines.close();
  await hubTools?.close().catch(() => {});
}