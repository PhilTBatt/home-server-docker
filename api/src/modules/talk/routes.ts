import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Features } from "../../config.js";
import { createTalkDesk, idPattern, isWav, mostTalkBytes, mostVoiceBytes, mostVoicePieces, type Changed, type TalkDesk } from "./desk.js";

export const nextWaitMs = 20_000;
export const sweepMs = 60_000;
export const switchedOff = { error: "Talking to Jarvis from the phone is switched off" };
export const unknownId = { error: "There's no such recording: it may have been forgotten, after 10 minutes" };

const smallBody = 16 * 1024;
const quiet = { logLevel: "warn" as const };

type IdParams = { Params: { id: string } };

function readText(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function answered(reply: FastifyReply, changed: Changed, wrong: string) {
  if (changed === "unknown") return reply.code(404).send(unknownId);
  if (changed === "wrong state") return reply.code(409).send({ error: wrong });
  if (changed === "too big") return reply.code(413).send({ error: `An answer's voice can be at most ${mostVoicePieces} pieces and ${mostVoiceBytes / 1024 / 1024} MiB in all` });
  return { done: true };
}

export function partOf(query: unknown): number | undefined | null {
  const part = typeof query === "object" && query !== null ? (query as Record<string, unknown>).part : undefined;
  if (part === undefined) return undefined;
  if (typeof part !== "string" || !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) >= mostVoicePieces) return null;
  return Number(part);
}

const badPart = { error: `part must be a whole number from 0 to ${mostVoicePieces - 1}, the piece's place in the answer` };

export const talk: FastifyPluginAsync<{ features: Features; desk?: TalkDesk; now?: () => number; waitMs?: number }> = async (app, options) => {
  const desk = options.desk ?? createTalkDesk();
  const now = options.now ?? (() => Date.now());
  const waitMs = options.waitMs ?? nextWaitMs;
  const closing = new AbortController();
  const sweeping = setInterval(() => desk.sweep(now()), sweepMs);
  sweeping.unref();
  app.addHook("onClose", async () => {
    clearInterval(sweeping);
    closing.abort();
  });
  app.addContentTypeParser(["application/octet-stream", "audio/wav"], { parseAs: "buffer", bodyLimit: mostVoiceBytes }, (_request, body, done) => done(null, body));

  app.addHook("preHandler", async (request, reply) => {
    if (!options.features.talk) return reply.code(404).send(switchedOff);
    const id = (request.params as { id?: unknown } | undefined)?.id;
    if (typeof id === "string" && !idPattern.test(id)) return reply.code(404).send(unknownId);
  });

  app.get("/status", quiet, async () => {
    desk.sweep(now());
    return { jarvis: desk.jarvisSeen(now()) };
  });

  app.post("/", { bodyLimit: mostTalkBytes + 1024 }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: "Send the recording as application/octet-stream: 16-bit mono sound at 16,000 samples a second" });
    const added = desk.add(request.body, now());
    if ("refused" in added) return reply.code(added.status).send({ error: added.refused });
    app.log.info({ talk: { id: added.id, bytes: request.body.length } }, "a recording from the phone is waiting for Jarvis");
    return reply.code(202).send(added);
  });

  app.get("/next", quiet, async (_request, reply) => {
    let taken = desk.take(now());
    if (taken === null) {
      const gone = new AbortController();
      reply.raw.once("close", () => gone.abort());
      await desk.waitForWork(waitMs, AbortSignal.any([gone.signal, closing.signal]));
      if (gone.signal.aborted || closing.signal.aborted) return reply.code(204).send();
      taken = desk.take(now());
    }
    if (taken === null) return reply.code(204).send();
    app.log.info({ talk: { id: taken.id } }, "Jarvis took a recording from the phone");
    return reply.code(200).header("talk-id", taken.id).header("cache-control", "no-store").type("application/octet-stream").send(taken.audio);
  });

  app.get<IdParams>("/:id", quiet, async (request, reply) => {
    const view = desk.view(request.params.id, now());
    if (view === null) return reply.code(404).send(unknownId);
    return reply.header("cache-control", "no-store").send(view);
  });

  app.post<IdParams>("/:id/heard", { bodyLimit: smallBody }, async (request, reply) => {
    const text = readText(request.body, "text");
    if (text === null) return reply.code(400).send({ error: "text must be what Jarvis heard" });
    return answered(reply, desk.heard(request.params.id, text, now()), "Jarvis already said what he heard");
  });

  app.post<IdParams>("/:id/reply", { bodyLimit: smallBody }, async (request, reply) => {
    const text = readText(request.body, "text");
    if (text === null) return reply.code(400).send({ error: "text must be Jarvis's answer" });
    const voice = (request.body as Record<string, unknown>).voice;
    if (voice !== undefined && typeof voice !== "boolean") return reply.code(400).send({ error: "voice must be true or false: whether his voice will follow" });
    const changed = desk.reply(request.params.id, text, voice === true, now());
    if (changed === "done") app.log.info({ talk: { id: request.params.id } }, "Jarvis answered the phone");
    return answered(reply, changed, "That recording has already been answered");
  });

  app.post<IdParams>("/:id/failed", { bodyLimit: smallBody }, async (request, reply) => {
    const text = readText(request.body, "text");
    if (text === null) return reply.code(400).send({ error: "text must say what went wrong" });
    const changed = desk.fail(request.params.id, text, now());
    if (changed === "done") app.log.info({ talk: { id: request.params.id } }, "Jarvis couldn't answer the phone");
    return answered(reply, changed, "That recording has already been answered");
  });

  app.post<IdParams>("/:id/ask", { bodyLimit: smallBody }, async (request, reply) => {
    const question = readText(request.body, "question");
    if (question === null) return reply.code(400).send({ error: "question must be what Jarvis wants a yes or no to" });
    return answered(reply, desk.ask(request.params.id, question, now()), "Jarvis can only ask while he's working on it");
  });

  app.get<IdParams>("/:id/answer", quiet, async (request, reply) => {
    const got = desk.answerFor(request.params.id, now());
    if (got === null) return reply.code(404).send(unknownId);
    return got;
  });

  app.post<IdParams>("/:id/answer", { bodyLimit: smallBody }, async (request, reply) => {
    const yes = typeof request.body === "object" && request.body !== null ? (request.body as Record<string, unknown>).yes : undefined;
    if (typeof yes !== "boolean") return reply.code(400).send({ error: "yes must be true or false" });
    return answered(reply, desk.answer(request.params.id, yes, now()), "Jarvis isn't asking anything about that now");
  });

  app.post<IdParams>("/:id/voice", { ...quiet, bodyLimit: mostVoiceBytes }, async (request, reply) => {
    const part = partOf(request.query);
    if (part === null) return reply.code(400).send(badPart);
    if (!Buffer.isBuffer(request.body) || !isWav(request.body)) return reply.code(415).send({ error: "Send the voice as a WAV file, audio/wav" });
    const changed = desk.addVoice(request.params.id, request.body, now(), part);
    if (changed === "done") app.log.info({ talk: { id: request.params.id, part: part ?? "whole", bytes: request.body.length } }, "Jarvis's voice for the phone came");
    return answered(reply, changed, part === undefined ? "The voice only follows Jarvis's answer, once" : "Each piece of his voice comes once, in order, until he says it's done");
  });

  app.post<IdParams>("/:id/voice-done", { bodyLimit: smallBody }, async (request, reply) => answered(reply, desk.voiceDone(request.params.id, now()), "Only an answer with some of its voice, not yet done, can be told it's done"));

  app.post<IdParams>("/:id/no-voice", { bodyLimit: smallBody }, async (request, reply) => answered(reply, desk.noVoice(request.params.id, now()), "Only an answer still waiting for its voice can be told none is coming"));

  app.get<IdParams>("/:id/voice", quiet, async (request, reply) => {
    const part = partOf(request.query);
    if (part === null) return reply.code(400).send(badPart);
    const voice = desk.voiceOf(request.params.id, now(), part);
    if (voice === null) return reply.code(404).send({ error: "There's no voice for that answer" });
    return reply.header("cache-control", "no-store").type("audio/wav").send(voice);
  });
};
