import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { sendToNtfy, type Notification } from "../notify/notifier.js";

export const findAgainMs = 10_000;

export const findNotification: Notification = { title: "Here's your phone", message: "Jarvis was asked to find your phone.", tags: "telephone_receiver", priority: 5 };

export const phone: FastifyPluginAsync<{ features: Features; ntfyTopic: string; send?: (topic: string, notification: Notification) => Promise<void>; now?: () => number }> = async (app, options) => {
  const send = options.send ?? sendToNtfy;
  const now = options.now ?? (() => performance.now());
  let lastAt = -Infinity;

  app.post("/find", async (_request, reply) => {
    if (!options.features.findPhone) return reply.code(404).send({ error: "Finding the phone is switched off" });
    const at = now();
    if (at - lastAt < findAgainMs) return reply.code(429).send({ error: `It was sent less than ${findAgainMs / 1000} seconds ago` });
    lastAt = at;
    try {
      await send(options.ntfyTopic, findNotification);
    } catch {
      lastAt = -Infinity;
      return reply.code(502).send({ error: "Couldn't reach ntfy" });
    }
    return { sent: true };
  });
};
