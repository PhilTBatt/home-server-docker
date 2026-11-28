import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";
import { isAuthorized } from "../../token.js";

type LoginBody = {
  token: string;
};

type AuthOptions = Pick<Config, "apiToken"> & {
  guard?: boolean;
  now?: () => number;
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

export const mostWrongLogins = 10;
export const wrongLoginWindowMs = 60_000;
export const plainHttpRefused = { error: "Log in at https://hub.home: with LOGIN_GUARD on, logins over plain http are refused" };
export const tooManyWrong = { error: "Too many wrong tokens in the last minute, so logins are paused: try again in a minute" };

export const auth: FastifyPluginAsync<AuthOptions> = async (app, options) => {
  const guard = options.guard === true;
  const now = options.now ?? (() => Date.now());
  const wrong: number[] = [];

  app.post<{ Body: LoginBody }>("/login", { schema: loginSchema }, async (request, reply) => {
    if (guard) {
      if (request.protocol !== "https") {
        app.log.warn({ login: { refused: "plain http" } }, "a login was refused: it came over plain http");
        return reply.code(403).send(plainHttpRefused);
      }
      const at = now();
      while (wrong.length > 0 && at - wrong[0] >= wrongLoginWindowMs) wrong.shift();
      if (wrong.length >= mostWrongLogins) {
        app.log.warn({ login: { refused: "paused", wrongInLastMinute: wrong.length } }, "a login was refused: logins are paused after too many wrong tokens");
        return reply.code(429).send(tooManyWrong);
      }
    }
    if (!isAuthorized(request.body.token, options.apiToken)) {
      if (guard) {
        wrong.push(now());
        app.log.warn({ login: { refused: "wrong token", wrongInLastMinute: wrong.length } }, "a login was refused: wrong token");
      }
      return reply.code(401).send({ error: "Unauthorized" });
    }
    reply.setCookie("hub_token", request.body.token, {
      httpOnly: true,
      secure: guard ? true : "auto",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
    return { status: "logged in" };
  });

  app.post("/logout", async (request, reply) => {
    reply.clearCookie("hub_token", { path: "/", secure: guard ? true : "auto" });
    return { status: "logged out" };
  });
};
