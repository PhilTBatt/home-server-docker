import { timingSafeEqual } from "node:crypto";

export function isAuthorized(token: string, apiToken: string): boolean {
  if (apiToken === "") {
    return false;
  }
  const given = Buffer.from(token);
  const expected = Buffer.from(apiToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function tokenFromHeader(header: string | undefined): string | undefined {
  if (header === undefined) return undefined; 

  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}