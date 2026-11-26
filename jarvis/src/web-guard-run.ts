import { lookup } from "node:dns/promises";
import { guardAnswer, notChecked } from "./web-guard.js";

async function read(): Promise<string> {
  let raw = "";
  for await (const piece of process.stdin) raw += piece;
  return raw;
}

function refuse(reason: string): void {
  process.stderr.write(reason, () => process.exit(2));
}

try {
  const answer = await guardAnswer(await read(), { resolve: async (host) => (await lookup(host, { all: true })).map((found) => found.address) });
  if (answer.code === 0) process.stdout.write(answer.out, () => process.exit(0));
  else refuse(answer.err);
} catch {
  refuse(notChecked);
}
