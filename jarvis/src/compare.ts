import { readFile } from "node:fs/promises";
import { answerLogFile } from "./answer-log.js";
import { compareReport, readLog } from "./comparison.js";

async function logText(): Promise<string> {
  try {
    return await readFile(answerLogFile, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

try {
  process.stdout.write(compareReport(readLog(await logText())));
} catch (error) {
  console.error(`Couldn't compare: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
