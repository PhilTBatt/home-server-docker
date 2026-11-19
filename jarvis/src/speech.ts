import type { Player } from "./player.js";

export type SpeechEngine = {
  readonly name: string;
  readonly sampleRate: number;
  readonly splitsSentences: boolean;
  speak(text: AsyncIterable<string>, signal: AbortSignal): AsyncIterable<Uint8Array>;
  check(signal: AbortSignal): Promise<void>;
};

export type StartPlayer = (options: { device: string; rate: number }) => Player;

async function* oneText(text: string): AsyncGenerator<string> {
  yield text;
}

function unlessCalledOff<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const calledOff = () => reject(signal.reason);
    if (signal.aborted) calledOff();
    signal.addEventListener("abort", calledOff, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", calledOff));
  });
}

export async function say(engine: SpeechEngine, text: string, device: string, startPlayer: StartPlayer, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  let player: Player | null = null;
  const stop = () => player?.stop();
  const sounds = engine.speak(oneText(text), signal)[Symbol.asyncIterator]();
  signal.addEventListener("abort", stop, { once: true });
  try {
    for (;;) {
      const next = await unlessCalledOff(sounds.next(), signal);
      signal.throwIfAborted();
      if (next.done === true) break;
      player ??= startPlayer({ device, rate: engine.sampleRate });
      await unlessCalledOff(player.write(next.value), signal);
    }
    if (player === null) throw new Error(`${engine.name} sent no sound`);
    await unlessCalledOff(player.finish(), signal);
  } catch (error) {
    player?.stop();
    void Promise.resolve().then(() => sounds.return?.()).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
