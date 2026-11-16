export type AnswerStats = {
  rounds: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  earlierThinkingBlocks: number | null;
  recovered: boolean;
};

export type Answer = {
  text: string;
  firstWordsMs: number | null;
  totalMs: number;
  stats?: AnswerStats;
};

export type Summary = {
  median: number;
  min: number;
  max: number;
  count: number;
};

export function summarise(values: number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { median, min: sorted[0], max: sorted[sorted.length - 1], count: sorted.length };
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

export function describe(values: number[]): string {
  const summary = summarise(values);
  if (summary === null) return "no data";
  if (summary.count === 1) return seconds(summary.median);
  return `${seconds(summary.median)} (${seconds(summary.min)} to ${seconds(summary.max)}, ${summary.count} tries)`;
}