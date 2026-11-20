import { askCommand } from "./ask-api.js";

process.exitCode = await askCommand(process.argv[2], process.env.EARS_TOKEN?.trim() ?? "", (line) => (line.startsWith("Usage") ? process.stderr : process.stdout).write(`${line}\n`));
