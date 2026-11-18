import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

export const playerCommand = "aplay";

export type PlayerExit = { code: number | null; signal: NodeJS.Signals | null } | { error: NodeJS.ErrnoException };

export type PlayerProcess = {
  stdin: Writable;
  stderr: Readable;
  kill(): void;
  ended: Promise<PlayerExit>;
};

export type Player = {
  write(sound: Uint8Array): Promise<void>;
  finish(): Promise<void>;
  stop(): void;
};

export function playerArgs(device: string, rate: number): string[] {
  return ["-q", "-t", "raw", "-f", "S16_LE", "-c", "1", "-r", String(rate), "-D", device];
}

export function spawnPlayer(args: readonly string[], command = playerCommand): PlayerProcess {
  const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
  if (child.stdin === null || child.stderr === null) throw new Error(`${command} started without its input and error pipes`);
  const ended = new Promise<PlayerExit>((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  return { stdin: child.stdin, stderr: child.stderr, kill: () => child.kill("SIGTERM"), ended };
}

export function shortError(text: string): string {
  const tidy = text
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return tidy.length > 300 ? `${tidy.slice(0, 299)}…` : tidy;
}

function failure(exit: PlayerExit, said: string): Error | null {
  if ("error" in exit) {
    if (exit.error.code === "ENOENT") return new Error(`${playerCommand} isn't installed here. Sound plays from Jarvis's own image, which bash host/jarvis.sh sound-test builds`);
    return new Error(`${playerCommand} couldn't start: ${shortError(exit.error.message)}`);
  }
  if (exit.code === 0) return null;
  const how = exit.code === null ? `was stopped by ${exit.signal}` : `stopped with code ${exit.code}`;
  const detail = shortError(said);
  return new Error(`${playerCommand} ${how}${detail === "" ? "" : `: ${detail}`}`);
}

export function startPlayer(options: { device: string; rate: number; spawn?: (args: readonly string[]) => PlayerProcess }): Player {
  if (!Number.isInteger(options.rate) || options.rate < 2000 || options.rate > 192_000) throw new Error(`The sound rate must be a whole number of Hz from 2000 to 192000, not ${options.rate}`);
  if (options.device.trim() === "") throw new Error("There's no sound device to play on");
  const child = (options.spawn ?? spawnPlayer)(playerArgs(options.device, options.rate));
  let said = "";
  let stopped = false;
  let finishing: Promise<void> | null = null;
  let exitedWith: Error | null | undefined;
  child.stderr.on("data", (chunk: Buffer | string) => {
    if (said.length < 4000) said += String(chunk);
  });
  child.stdin.on("error", () => {});
  const outcome = child.ended.then((exit) => {
    exitedWith = stopped ? null : failure(exit, said);
    return exitedWith;
  });

  return {
    async write(sound) {
      if (stopped || sound.length === 0) return;
      if (finishing !== null) throw new Error("The player is finishing, so no more sound can be added");
      if (exitedWith !== undefined) throw exitedWith ?? new Error(`${playerCommand} has already finished`);
      if (child.stdin.write(sound)) return;
      const drained = new Promise<"drained">((resolve) => child.stdin.once("drain", () => resolve("drained")));
      if ((await Promise.race([drained, outcome.then(() => "ended" as const)])) === "drained") return;
      if (stopped || (finishing !== null && exitedWith === null)) return;
      throw exitedWith ?? new Error(`${playerCommand} finished before it took all the sound`);
    },
    finish() {
      if (finishing === null) {
        child.stdin.end();
        finishing = outcome.then((error) => {
          if (error !== null) throw error;
        });
      }
      return finishing;
    },
    stop() {
      if (stopped || exitedWith !== undefined) return;
      stopped = true;
      child.stdin.destroy();
      child.kill();
    },
  };
}
