import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthorized, tokenFromHeader } from "./token.js";

test("isAuthorized accepts the right token", () => {
  assert.equal(isAuthorized("test-token", "test-token"), true);
});

test("isAuthorized rejects a wrong token of the same length", () => {
  assert.equal(isAuthorized("test-tokeX", "test-token"), false);
});

test("isAuthorized rejects tokens of a different length", () => {
  assert.equal(isAuthorized("test", "test-token"), false);
  assert.equal(isAuthorized("", "test-token"), false);
});

test("isAuthorized rejects the right token with anything before or after it, or cut short", () => {
  for (const given of ["test-tokenX", "test-token ", "test-token\u0000", "Xtest-token", " test-token", "test-toke", "test-token".repeat(2)]) {
    assert.equal(isAuthorized(given, "test-token"), false, JSON.stringify(given));
  }
});

test("isAuthorized refuses everything when the expected token is empty", () => {
  assert.equal(isAuthorized("", ""), false);
  assert.equal(isAuthorized("anything", ""), false);
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