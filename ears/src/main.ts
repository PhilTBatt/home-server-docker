import { readConfig } from "./config.js";
import { secondsText } from "./ears.js";
import { startService } from "./service.js";
import { doneAfterMs, moreAfterMs } from "./turn.js";
import { whisperText } from "./whisper.js";

const log = (line: string) => process.stdout.write(`${line}\n`);

try {
  const config = readConfig(process.env);
  const service = await startService({ config, log, toText: whisperText() });
  process.on("SIGTERM", () => void service.close());
  process.on("SIGINT", () => void service.close());
  log(`Ears is ready and muted, with ${service.microphone}. Unmute it with bash host/ears.sh unmute.`);
  if (config.wake) log(`The wake word is on: ears listens for it whenever it's unmuted and a Jarvis chat with JARVIS_EARS=wake is open. A recording after it ends when ${config.wakeEnd === "silero" ? "the speech detector hears no speech" : "it goes quiet"} for ${secondsText(config.wakePauseMs)} after you speak.`);
  if (config.wake && config.turnWords) log(`Your words are looked at too: at each pause ears turns what you've said so far into text, ends sooner (${secondsText(doneAfterMs)}) when it reads as finished, and waits longer (${secondsText(Math.max(config.wakePauseMs, moreAfterMs))}) when it reads as unfinished.`);
  if (config.wake && config.interrupt === "wake") log("Jarvis can be interrupted: ears keeps listening for the wake word while he speaks.");
  if (config.wake && config.interrupt === "speech") log("Jarvis can be interrupted: ears keeps listening for the wake word, and for any speech, while he speaks. That only works with a microphone that doesn't hear him.");
  if (config.voiceId.mode === "observe") log(`Voice ID is on to observe: each recording's voice is scored against your voiceprint and the score is logged, against a threshold of ${config.voiceId.threshold}. Nothing is blocked.`);
  if (config.voiceId.mode === "require") log(`Voice ID is required: a recording after the wake word or in a follow-up whose voice scores under ${config.voiceId.threshold} against your voiceprint isn't turned into text. The talk button and /talk aren't blocked, and under a second of speech can't be judged, so it goes through.`);
} catch (error) {
  console.error(`Ears couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
