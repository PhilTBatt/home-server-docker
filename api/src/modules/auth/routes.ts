import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";
import { isAuthorized } from "../../token.js";

type LoginBody = {
  token: string;
};

const loginSchema = {
  body: {
    type: "object",
    required: ["token"],
    properties: {
      token: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};

export const auth: FastifyPluginAsync<Pick<Config, "apiToken">> = async (app, options) => {
  app.post<{ Body: LoginBody }>("/login", { schema: loginSchema }, async (request, reply) => {
    if (!isAuthorized(request.body.token, options.apiToken)) return reply.code(401).send({ error: "Unauthorized" });
    reply.setCookie("hub_token", request.body.token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
    return { status: "logged in" };
  });

  app.post("/logout", async (request, reply) => {
    reply.clearCookie("hub_token", { path: "/" });
    return { status: "logged out" };
  });
};