import { runVoiceEnrol, sendText } from "./voice-tools.js";

process.stdout.on("error", () => process.exit(0));
process.exitCode = await runVoiceEnrol({ env: process.env, say: (line) => process.stderr.write(`${line}\n`), send: sendText(process.stdout) });
