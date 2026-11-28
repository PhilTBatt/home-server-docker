import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { Features, PhoneSettings } from "../../config.js";
import { clearOnNtfy, sendToNtfy, type Notification } from "../notify/notifier.js";
import type { EventSink } from "../events/feed.js";

export const findAgainMs = 10_000;
export const repeatEveryMs = 5_000;

export const findNotification: Notification = { title: "Here's your phone", message: "Jarvis was asked to find your phone.", tags: "telephone_receiver", priority: 5, urgent: true };

type Ringing = { sequence: string; startedAt: number; sends: number; failed: number; stop: () => void };

export const phone: FastifyPluginAsync<{
  features: Features;
  ntfyTopic: string;
  ring?: PhoneSettings;
  send?: (topic: string, notification: Notification) => Promise<void>;
  clear?: (topic: string, sequence: string) => Promise<void>;
  now?: () => number;
  makeSequence?: () => string;
  events?: EventSink;
}> = async (app, options) => {
  const send = options.send ?? sendToNtfy;
  const clear = options.clear ?? clearOnNtfy;
  const now = options.now ?? (() => performance.now());
  const ring = options.ring ?? { ring: "once", seconds: 30 };
  const makeSequence = options.makeSequence ?? (() => `find-${randomBytes(4).toString("hex")}`);
  let lastAt = -Infinity;
  let ringing: Ringing | null = null;

  async function cleared(sequence: string): Promise<boolean> {
    try {
      await clear(options.ntfyTopic, sequence);
      return true;
    } catch {
      return false;
    }
  }

  async function finish(why: "time" | "found"): Promise<{ cleared: boolean | null }> {
    const was = ringing;
    if (was === null) return { cleared: null };
    ringing = null;
    was.stop();
    const clearing = why === "found" || ring.ring === "clear";
    const done = clearing ? await cleared(was.sequence) : null;
    app.log.info({ phone: { ring: ring.ring, why, seconds: Math.round((now() - was.startedAt) / 1000), sends: was.sends, failedSends: was.failed, cleared: done } }, why === "found" ? "finding the phone stopped: it was found" : "finding the phone stopped: its time was up");
    return { cleared: done };
  }

  app.post("/find", async (_request, reply) => {
    if (!options.features.findPhone) return reply.code(404).send({ error: "Finding the phone is switched off" });
    const at = now();
    if (ringing !== null) return reply.code(429).send({ error: "It's already ringing: say found it, or POST /phone/found, to stop it" });
    if (at - lastAt < findAgainMs) return reply.code(429).send({ error: `It was sent less than ${findAgainMs / 1000} seconds ago` });
    lastAt = at;
    if (ring.ring === "once") {
      try {
        await send(options.ntfyTopic, findNotification);
      } catch {
        lastAt = -Infinity;
        app.log.warn({ phone: { ring: "once" } }, "finding the phone: ntfy didn't take it");
        return reply.code(502).send({ error: "Couldn't reach ntfy" });
      }
      app.log.info({ phone: { ring: "once" } }, "finding the phone: sent once");
      options.events?.post("phone.rang");
      return { sent: true };
    }
    const sequence = makeSequence();
    const message = { ...findNotification, sequence };
    try {
      await send(options.ntfyTopic, message);
    } catch {
      lastAt = -Infinity;
      app.log.warn({ phone: { ring: ring.ring } }, "finding the phone: ntfy didn't take it");
      return reply.code(502).send({ error: "Couldn't reach ntfy" });
    }
    const timers: NodeJS.Timeout[] = [];
    const current: Ringing = { sequence, startedAt: at, sends: 1, failed: 0, stop: () => timers.forEach((timer) => clearTimeout(timer)) };
    ringing = current;
    if (ring.ring === "repeat") {
      const again = setInterval(() => {
        if (ringing !== current || current.sends + current.failed >= Math.ceil((ring.seconds * 1000) / repeatEveryMs)) return;
        send(options.ntfyTopic, message).then(
          () => void current.sends++,
          () => void current.failed++,
        );
      }, repeatEveryMs);
      timers.push(again);
    }
    timers.push(setTimeout(() => void finish("time"), ring.seconds * 1000));
    app.log.info({ phone: { ring: ring.ring, seconds: ring.seconds, sequence } }, "finding the phone: ringing");
    options.events?.post("phone.rang");
    return { sent: true, ring: ring.ring, seconds: ring.seconds };
  });

  app.post("/found", async (_request, reply) => {
    if (!options.features.findPhone) return reply.code(404).send({ error: "Finding the phone is switched off" });
    if (ringing === null) return { stopped: false };
    const { cleared: done } = await finish("found");
    return { stopped: true, cleared: done === true };
  });
};
