import { fetchModel } from "./fetch-model.js";
import { sileroModelPath } from "./silero.js";

try {
  await fetchModel(process.argv[2] ?? sileroModelPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
