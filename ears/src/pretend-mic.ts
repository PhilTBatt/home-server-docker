import { bytesPerSecond, recordingRate } from "./recorder.js";

export const pretendChunkMs = 100;

export function pretendSound(from: number, samples: number): Buffer {
  const sound = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index++) sound.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * (from + index)) / recordingRate) * 1000), index * 2);
  return sound;
}

export function runPretendMic(write: (sound: Buffer) => boolean, everyMs = pretendChunkMs): () => void {
  const samples = (bytesPerSecond / 2) * (everyMs / 1000);
  let sent = 0;
  const timer = setInterval(() => {
    write(pretendSound(sent, samples));
    sent += samples;
  }, everyMs);
  return () => clearInterval(timer);
}
