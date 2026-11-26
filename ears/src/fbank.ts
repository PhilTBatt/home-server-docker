import { recordingRate } from "./recorder.js";

export const fbankBins = 80;
export const fbankFrameSamples = (recordingRate * 25) / 1000;
export const fbankShiftSamples = (recordingRate * 10) / 1000;
export const fbankFftSize = 512;
export const fbankLowHz = 20;
export const fbankPreemphasis = 0.97;
export const fbankFloor = 1.1920928955078125e-7;

export function melOf(hz: number): number {
  return 1127 * Math.log(1 + hz / 700);
}

export function hammingWindow(size = fbankFrameSamples): Float64Array {
  const window = new Float64Array(size);
  for (let index = 0; index < size; index++) window[index] = 0.54 - 0.46 * Math.cos((2 * Math.PI * index) / (size - 1));
  return window;
}

export type MelBank = { first: number; weights: Float64Array };

export function melBanks(bins = fbankBins, fftSize = fbankFftSize, rate = recordingRate, lowHz = fbankLowHz): MelBank[] {
  const fftBins = fftSize / 2;
  const width = rate / fftSize;
  const low = melOf(lowHz);
  const step = (melOf(rate / 2) - low) / (bins + 1);
  const banks: MelBank[] = [];
  for (let bin = 0; bin < bins; bin++) {
    const left = low + bin * step;
    const centre = low + (bin + 1) * step;
    const right = low + (bin + 2) * step;
    let first = -1;
    const weights: number[] = [];
    for (let index = 0; index < fftBins; index++) {
      const mel = melOf(width * index);
      if (mel <= left || mel >= right) continue;
      if (first === -1) first = index;
      weights.push(mel <= centre ? (mel - left) / (centre - left) : (right - mel) / (right - centre));
    }
    banks.push({ first, weights: Float64Array.from(weights) });
  }
  return banks;
}

function fftTables(size: number) {
  const bits = Math.log2(size);
  const reversed = new Uint32Array(size);
  for (let index = 0; index < size; index++) {
    let flipped = 0;
    for (let bit = 0; bit < bits; bit++) flipped |= ((index >> bit) & 1) << (bits - 1 - bit);
    reversed[index] = flipped;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let index = 0; index < size / 2; index++) {
    cos[index] = Math.cos((2 * Math.PI * index) / size);
    sin[index] = -Math.sin((2 * Math.PI * index) / size);
  }
  return { reversed, cos, sin };
}

export function powerSpectrum(frame: Float64Array, size = fbankFftSize, tables = fftTables(size)): Float64Array {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < frame.length && index < size; index++) real[tables.reversed[index]] = frame[index];
  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    const stride = size / span;
    for (let start = 0; start < size; start += span) {
      for (let at = 0; at < half; at++) {
        const twiddleReal = tables.cos[at * stride];
        const twiddleImaginary = tables.sin[at * stride];
        const even = start + at;
        const odd = even + half;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
      }
    }
  }
  const power = new Float64Array(size / 2 + 1);
  for (let index = 0; index <= size / 2; index++) power[index] = real[index] * real[index] + imaginary[index] * imaginary[index];
  return power;
}

export function samplesOf(sound: Uint8Array): Float64Array {
  const view = new DataView(sound.buffer, sound.byteOffset, sound.length - (sound.length % 2));
  const samples = new Float64Array(view.byteLength / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true);
  return samples;
}

export function frameCount(samples: number): number {
  return samples < fbankFrameSamples ? 0 : 1 + Math.floor((samples - fbankFrameSamples) / fbankShiftSamples);
}

export type Fbank = (samples: Float64Array) => Float32Array[];

export function createFbank(): Fbank {
  const window = hammingWindow();
  const banks = melBanks();
  const tables = fftTables(fbankFftSize);
  return (samples) => {
    const frames: Float32Array[] = [];
    const piece = new Float64Array(fbankFrameSamples);
    for (let frame = 0; frame < frameCount(samples.length); frame++) {
      const from = frame * fbankShiftSamples;
      let sum = 0;
      for (let index = 0; index < fbankFrameSamples; index++) sum += samples[from + index];
      const mean = sum / fbankFrameSamples;
      for (let index = 0; index < fbankFrameSamples; index++) piece[index] = samples[from + index] - mean;
      for (let index = fbankFrameSamples - 1; index > 0; index--) piece[index] -= fbankPreemphasis * piece[index - 1];
      piece[0] -= fbankPreemphasis * piece[0];
      for (let index = 0; index < fbankFrameSamples; index++) piece[index] *= window[index];
      const power = powerSpectrum(piece, fbankFftSize, tables);
      const energies = new Float32Array(banks.length);
      banks.forEach((bank, bin) => {
        let energy = 0;
        for (let index = 0; index < bank.weights.length; index++) energy += bank.weights[index] * power[bank.first + index];
        energies[bin] = Math.log(Math.max(energy, fbankFloor));
      });
      frames.push(energies);
    }
    return frames;
  };
}

export function subtractMean(frames: readonly Float32Array[]): Float32Array {
  const bins = frames[0]?.length ?? 0;
  const mean = new Float64Array(bins);
  for (const frame of frames) for (let bin = 0; bin < bins; bin++) mean[bin] += frame[bin];
  for (let bin = 0; bin < bins; bin++) mean[bin] /= frames.length;
  const flat = new Float32Array(frames.length * bins);
  frames.forEach((frame, at) => {
    for (let bin = 0; bin < bins; bin++) flat[at * bins + bin] = frame[bin] - mean[bin];
  });
  return flat;
}
