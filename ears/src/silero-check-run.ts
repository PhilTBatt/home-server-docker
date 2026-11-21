import { sileroCheck } from "./silero-check.js";
import { loadSilero, sileroModelPath } from "./silero.js";

const say = (line: string) => process.stdout.write(`${line}\n`);
try {
  process.exitCode = await sileroCheck(await loadSilero(process.argv[2] ?? sileroModelPath), say);
} catch (error) {
  say(`The speech detector couldn't load: ${error instanceof Error ? error.message : String(error)}.`);
  process.exitCode = 1;
}
