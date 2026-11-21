import { runMicTest, sendSound } from "./mic-test.js";

process.stdout.on("error", () => process.exit(0));
process.exitCode = await runMicTest({ env: process.env, say: (line) => process.stderr.write(`${line}\n`), send: sendSound(process.stdout) });
