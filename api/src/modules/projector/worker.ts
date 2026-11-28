import { parentPort, workerData } from "node:worker_threads";
import { createAndroidRemote, RemoteKeyCode } from "@kud/androidtv-remote";
import { pairingDone, startProblem, type LinkCommand, type LinkEvent, type LinkStart, type PowerKey } from "./link.js";

const port = parentPort;
if (port === null) throw new Error("The projector's link only runs as a worker");
const start = workerData as LinkStart;
const post = (event: LinkEvent) => port.postMessage(event);
const keys: Record<PowerKey, number> = { wake: RemoteKeyCode.KEYCODE_WAKEUP, sleep: RemoteKeyCode.KEYCODE_SLEEP, power: RemoteKeyCode.KEYCODE_POWER };
const remote = createAndroidRemote(start.host, { cert: start.pairing ?? undefined, service_name: "home-hub", manufacturer: "home-hub", model: "home-hub" });
let codeTaken = false;

remote.on("secret", () => post({ kind: "secret" }));
remote.on("ready", () => post({ kind: "ready" }));
remote.on("powered", (on) => post({ kind: "powered", on: on === true }));
remote.on("unpaired", () => post({ kind: "unpaired" }));
remote.on("error", () => post({ kind: "problem", why: "the projector sent back an error" }));

port.on("message", (command: LinkCommand) => {
  if (command.kind === "code") {
    codeTaken = remote.sendCode(command.code);
    if (!codeTaken) post({ kind: "problem", why: "wrong code" });
  } else if (command.kind === "key") {
    remote.sendKey(keys[command.key]);
  } else {
    remote.stop();
    port.close();
  }
});

const started = await remote.start();
if (pairingDone(start, started, codeTaken)) {
  const { key, cert } = remote.getCertificate();
  post({ kind: "paired", key, cert });
}
const problem = startProblem(start, started, codeTaken);
if (problem !== null) post({ kind: "problem", why: problem });
