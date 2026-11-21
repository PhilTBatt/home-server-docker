import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { clearLine, createInterface, cursorTo } from "node:readline";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { startAgentSession, type AgentSession } from "./agent.js";
import { answerLogFile, loggingNote, startAnswerLog } from "./answer-log.js";
import { speakerParts, startAnswerSpeech, type Speaker } from "./answer-speech.js";
import { startApiSession } from "./api-session.js";
import { createBrainTools } from "./brain-tools.js";
import { chimeFor } from "./chime.js";
import { setUpChats, setUpNewChat, type ChatSetup } from "./chat-store.js";
import { apiChatSystem, apiMaxTokens, askOnce, chatModel, chatsLine, chatSystem, confirmMs, engineLine, heardLines, lengthHintsFor, lengthLineFor, newChatAdvice, printable, promptWhileOpen, questionTimeoutMs, runChat, settingsLine, withSpokenStyle } from "./chat.js";
import { brainDir, readConfig, type VoiceMode } from "./config.js";
import { earsCaller } from "./ears-client.js";
import { startHubTools, withHubTools, type HubTools } from "./hub-client.js";
import { checkHubServer, describeWithHub, hubServerFile, hubServerFor } from "./hub-tools.js";
import { pricesPerMTok } from "./prices.js";
import { notesFound, notesLine, readSessionNotes, withNotes } from "./session-notes.js";
import { startTalk } from "./talk.js";
import { voiceFor } from "./voice.js";
import { eager, spokenOf, startWakeHold, watchWake } from "./wake.js";

const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
const heard = heardLines(lines, promptWhileOpen(lines));
let session: AgentSession | null = null;
let hubTools: HubTools | undefined;
const starting = new AbortController();
const closing = new AbortController();
const watching = new AbortController();
let wakeHold: { close(): void } | undefined;
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
  let speaker: Speaker | null = null;
  const open = (setup: ChatSetup) => {
    const spoken = voice !== "off" && config.spokenStyle;
    const chat =
      config.engine === "api"
        ? startApiSession({
            apiKey: config.apiKey,
            model: chatModel,
            system: withNotes(withSpokenStyle(apiChatSystem, spoken), notes ?? []),
            maxTokens: apiMaxTokens,
            timeoutMs: questionTimeoutMs,
            now,
            tools: withHubTools(createBrainTools(brainDir), hubTools),
            thinkingHistory: config.thinkingHistory,
            history: setup.history,
            save: setup.save,
          })
        : startAgentSession((prompt, options) => query({ prompt, options }), { model: chatModel, system: withNotes(withSpokenStyle(chatSystem, spoken), notes ?? []), cwd: brainDir, now, savedChats: setup.savedChats, hub });
    session = chat;
    const log = config.log
      ? startAnswerLog(
          { engine: config.engine, thinking: config.thinkingHistory, model: chatModel, chats: setup.chats, lengthHints: config.lengthHints, hubTools: (config.engine === "api" ? hubTools !== undefined : hub !== undefined) ? "on" : "off", hubActions: (config.engine === "api" ? hubTools !== undefined : hub !== undefined) && config.hubActions ? "on" : "off", sessionNotes: notes !== null && notesFound(notes) ? "on" : "off", voice, speechStart: config.speechStart, speechStop: config.speechStop, speechBundle: config.speechBundle ? "on" : "off", spokenStyle: config.spokenStyle ? "on" : "off" },
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
      recordSpeech: log?.speech,
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
  const earsCall = config.earsToken === null ? null : earsCaller(config.earsToken);
  const hold = earsCall === null || config.voice === "off" ? undefined : startWakeHold(earsCall);
  wakeHold = hold;
  const starts = voiceFor(config, starting.signal, (line) => process.stdout.write(`${line}\n`));
  hold?.during(() => starts.then(() => {}));
  ({ mode: voice, speaker } = await starts);
  const speaking = speaker;
  const talk = earsCall === null ? undefined : startTalk({ call: earsCall, wake: config.ears === "wake" });
  if (talk !== undefined) process.stdout.write(`${printable(await talk.check(starting.signal))}\n`);
  let chatReady = false;
  const wake = earsCall === null || config.ears !== "wake" ? undefined : eager(watchWake({ call: earsCall, signal: AbortSignal.any([closing.signal, watching.signal]), busy: () => !chatReady }));
  const first = open(chats);
  process.stdout.write(`${chatsLine(chats.chats, chats.earlierQuestions)}\n`);
  if (config.log) process.stdout.write(`${loggingNote}\n`);
  await runChat({
    ...first,
    lines: heard.lines,
    write: (text) => process.stdout.write(text),
    prompt: heard.prompt,
    early: heard.early,
    questionTimeoutMs,
    sizeLine: hints.sizeLine,
    lengthCap: config.lengthCap ?? undefined,
    confirm: (query, signal) => askOnce(lines, query, confirmMs, signal),
    describe: hub === undefined ? undefined : describeWithHub(hub.token),
    speak:
      speaking === null
        ? undefined
        : (after) => {
            const speech = startAnswerSpeech({ ...speakerParts(speaking), now, start: config.speechStart, skipCode: config.spokenStyle, bundle: config.speechBundle, after });
            hold?.during(spokenOf(speech));
            return speech;
          },
    speechStop: config.speechStop,
    talk,
    closing: closing.signal,
    wake,
    ready: (yes) => (chatReady = yes),
    chime: wake === undefined || speaking === null ? undefined : chimeFor(speaking),
    interrupt: () => {
      if (!process.stdout.isTTY) return;
      cursorTo(process.stdout, 0);
      clearLine(process.stdout, 0);
    },
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
  lines.close();
  await hubTools?.close().catch(() => {});
}