import assert from "node:assert/strict";
import { test } from "node:test";

process.env.API_TOKEN = "test-token";
const { isAuthorized, tokenFromHeader } = await import("./token.js");

test("isAuthorized accepts the right token", () => {
  assert.equal(isAuthorized("test-token"), true);
});

test("isAuthorized rejects a wrong token of the same length", () => {
  assert.equal(isAuthorized("test-tokeX"), false);
});

test("isAuthorized rejects tokens of a different length", () => {
  assert.equal(isAuthorized("test"), false);
  assert.equal(isAuthorized(""), false);
});

test("tokenFromHeader returns undefined when no header was sent", () => {
  assert.equal(tokenFromHeader(undefined), undefined);
});

test("tokenFromHeader strips Bearer from a well-formed header", () => {
  assert.equal(tokenFromHeader("Bearer abc123"), "abc123");
});

test("tokenFromHeader returns an empty string for any other format", () => {
  assert.equal(tokenFromHeader("Basic abc123"), "");
  assert.equal(tokenFromHeader("bearer abc123"), "");
  assert.equal(tokenFromHeader("abc123"), "");
});