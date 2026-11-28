import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { choreJobFor, choreJobs, idPattern, type Chores } from "./chores.js";

export const chores: FastifyPluginAsync<{ features: Features; chores?: Chores; now?: () => Date }> = async (app, options) => {
  const switchedOff = { error: "Chores are switched off" };
  const isJob = choreJobFor(options.features.sessions, options.features.switches);
  const jobsText = `job must be one of ${choreJobs.join(", ")}${options.features.sessions ? ", or session-start-<name> or session-stop-<name> for a session the runner knows" : ""}${options.features.switches ? ", or switch-on-<switch> or switch-off-<switch> for one of the hub's switches, like switch-on-reminders" : ""}`;

  app.post<{ Params: { job: string } }>("/:job", { bodyLimit: 1024 }, async (request, reply) => {
    if (!options.features.chores || options.chores === undefined) return reply.code(404).send(switchedOff);
    if (!isJob(request.params.job)) return reply.code(400).send({ error: jobsText });
    const asked = await options.chores.request(request.params.job, options.now?.() ?? new Date());
    if ("refused" in asked) return reply.code(asked.status).send({ error: asked.refused });
    return asked;
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!options.features.chores || options.chores === undefined) return reply.code(404).send(switchedOff);
    if (!idPattern.test(request.params.id)) return reply.code(400).send({ error: "id must be a chore's id, as POST /chores/<job> gave it" });
    const found = await options.chores.result(request.params.id);
    if (found === null) return reply.code(404).send({ error: "No chore with that id" });
    return found;
  });
};
