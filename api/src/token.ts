import { timingSafeEqual } from "node:crypto";

const apiToken = process.env.API_TOKEN;
if (!apiToken) {
  throw new Error("API_TOKEN is not set");
}
const expected = Buffer.from(`Bearer ${apiToken}`);

export function isAuthorized(presented: string): boolean {
  const given = Buffer.from(presented);
  return given.length === expected.length && timingSafeEqual(given, expected);
}