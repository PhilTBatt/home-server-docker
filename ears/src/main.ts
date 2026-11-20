import { readConfig } from "./config.js";
import { startService } from "./service.js";
import { whisperText } from "./whisper.js";

const log = (line: string) => process.stdout.write(`${line}\n`);

try {
  const config = readConfig(process.env);
  const service = await startService({ config, log, toText: whisperText() });
  process.on("SIGTERM", () => void service.close());
  process.on("SIGINT", () => void service.close());
  log(`Ears is ready and muted, with ${service.microphone}. Unmute it with bash host/ears.sh unmute.`);
} catch (error) {
  console.error(`Ears couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
