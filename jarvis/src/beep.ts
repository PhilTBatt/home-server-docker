export const beepPeak = 0.3;
export const fadeMs = 10;

function samplesFor(rate: number, ms: number): number {
  if (!Number.isInteger(rate) || rate < 2000 || rate > 192_000) throw new Error(`The sound rate must be a whole number of Hz from 2000 to 192000, not ${rate}`);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error(`A sound must last more than 0 ms, not ${ms}`);
  return Math.max(1, Math.round((rate * ms) / 1000));
}

export function silence(rate: number, ms: number): Uint8Array {
  return new Uint8Array(samplesFor(rate, ms) * 2);
}

export function beep(rate: number, hz: number, ms: number): Uint8Array {
  const samples = samplesFor(rate, ms);
  if (!Number.isFinite(hz) || hz <= 0 || hz >= rate / 2) throw new Error(`A beep at ${rate} Hz must be above 0 Hz and below ${rate / 2} Hz, not ${hz}`);
  const fade = Math.min(Math.round((rate * fadeMs) / 1000), Math.floor(samples / 2));
  const sound = new Uint8Array(samples * 2);
  const view = new DataView(sound.buffer);
  for (let i = 0; i < samples; i++) {
    const edge = Math.min(i, samples - 1 - i);
    const gain = fade > 0 && edge < fade ? edge / fade : 1;
    view.setInt16(i * 2, Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * beepPeak * 32767 * gain), true);
  }
  return sound;
}

export function joinSound(parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}
