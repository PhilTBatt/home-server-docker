import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const helper = join(fileURLToPath(new URL(".", import.meta.url)), "ask.js");

test("the helper refuses anything but state, start, stop or health, with the usage and exit code 1, before asking anything", async () => {
  for (const args of [[], ["status"], ["mute"]]) {
    await assert.rejects(promisify(execFile)(process.execPath, [helper, ...args], { env: { EARS_TOKEN: "t".repeat(64) } }), (error: { code?: number; stderr?: string; stdout?: string }) => error.code === 1 && error.stderr === "Usage: node dist/ask.js state|start|stop|health\n" && error.stdout === "", JSON.stringify(args));
  }
});
