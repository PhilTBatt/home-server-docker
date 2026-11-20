import { spawn as spawnChild } from "node:child_process";

export const recordingLimitMs = 30_000;
export const recordingRate = 16_000;
export const bytesPerSecond = recordingRate * 2;
export const killAfterMs = 1_000;

export type Recorder = { command: string; args: string[] };

export type Stopped = { reason: string; failed: boolean; bytes: number; ms: number };

export type Recording = { readonly pid: number | undefined; stop(reason: string): Promise<Stopped>; readonly ended: Promise<Stopped> };

export type RecordingOptions = { recorder: Recorder; limitMs?: number; maxBytes?: number; killAfterMs?: number; now?: () => number; spawn?: typeof spawnChild };

function shortReason(text: string): string {
  const line = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

export function startRecording(options: RecordingOptions): Recording {
  const now = options.now ?? (() => performance.now());
  const limitMs = options.limitMs ?? recordingLimitMs;
  const maxBytes = options.maxBytes ?? Math.ceil((limitMs / 1000) * bytesPerSecond * 1.25);
  const graceMs = options.killAfterMs ?? killAfterMs;
  const began = now();
  const child = (options.spawn ?? spawnChild)(options.recorder.command, options.recorder.args, { stdio: ["ignore", "pipe", "pipe"], detached: true, env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" } });
  let bytes = 0;
  let said = "";
  let reason: string | null = null;
  let failed = false;
  let ownEnd = false;
  let done = false;
  let finish: (stopped: Stopped) => void = () => {};
  const ended = new Promise<Stopped>((resolve) => (finish = resolve));
  const limit = setTimeout(() => void stop(`it reached the ${limitMs / 1000}-second limit`), limitMs);
  let killer: ReturnType<typeof setTimeout> | null = null;

  const signal = (name: NodeJS.Signals) => {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, name);
    } catch {
      child.kill(name);
    }
  };

  function stop(why: string): Promise<Stopped> {
    reason ??= why;
    if (!done) {
      signal("SIGTERM");
      killer ??= setTimeout(() => signal("SIGKILL"), graceMs);
    }
    return ended;
  }

  child.stdout?.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > maxBytes) void stop("more sound came than the time limit allows");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    if (said.length < 500) said += chunk.toString("utf8");
  });
  let closer: ReturnType<typeof setTimeout> | null = null;
  const over = () => {
    if (done) return;
    done = true;
    clearTimeout(limit);
    if (killer !== null) clearTimeout(killer);
    if (closer !== null) clearTimeout(closer);
    const told = ownEnd && said.trim() !== "" ? `${reason}: ${shortReason(said)}` : (reason ?? "the recorder ended");
    finish({ reason: told, failed, bytes, ms: now() - began });
  };
  child.on("error", (error) => {
    if (reason === null) {
      reason = `the recorder couldn't start: ${shortReason(error.message)}`;
      failed = true;
    }
    if (child.pid === undefined) over();
  });
  const endedBy = (code: number | null, by: NodeJS.Signals | null) => {
    if (reason !== null) return;
    reason = `the recorder ${by !== null ? `was ended by ${by}` : `ended by itself with code ${code}`}`;
    failed = true;
    ownEnd = true;
  };
  child.on("exit", (code, by) => {
    endedBy(code, by);
    signal("SIGKILL");
    closer = setTimeout(() => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      over();
    }, graceMs);
  });
  child.on("close", (code, by) => {
    endedBy(code, by);
    over();
  });

  return {
    get pid() {
      return child.pid;
    },
    stop,
    ended,
  };
}
