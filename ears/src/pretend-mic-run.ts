import { runPretendMic } from "./pretend-mic.js";

process.stdout.on("error", () => process.exit(0));
runPretendMic((sound) => process.stdout.write(sound));
