import { timingSafeEqual } from "node:crypto";

const apiToken = process.env.API_TOKEN;
if (!apiToken) {
  throw new Error("API_TOKEN is not set");
}
const expected = Buffer.from(apiToken);

export function isAuthorized(token: string): boolean {
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function tokenFromHeader(header: string | undefined): string | undefined {
  if (header === undefined) return undefined; 

  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}