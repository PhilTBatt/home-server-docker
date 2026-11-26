import { runVoiceCheck } from "./voice-tools.js";

process.exitCode = await runVoiceCheck({ env: process.env, say: (line) => process.stdout.write(`${line}\n`) });
