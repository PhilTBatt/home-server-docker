export type Prices = {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  longPromptOver: number;
  longInput: number;
  longCacheWrite: number;
  longCacheRead: number;
  longOutput: number;
};

export const pricesPerMTok: Record<string, Prices> = {
  "claude-haiku-5-5": { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5, longPromptOver: 100_000, longInput: 0.5, longCacheWrite: 0.625, longCacheRead: 0.05, longOutput: 2.5 },
};

export type TokenUse = { input: number; cacheWrite: number; cacheRead: number; output: number };

export function answerCost(prices: Prices, used: TokenUse): number {
  const long = used.input + used.cacheWrite + used.cacheRead > prices.longPromptOver;
  const spent = long
    ? used.input * prices.longInput + used.cacheWrite * prices.longCacheWrite + used.cacheRead * prices.longCacheRead + used.output * prices.longOutput
    : used.input * prices.input + used.cacheWrite * prices.cacheWrite + used.cacheRead * prices.cacheRead + used.output * prices.output;
  return spent / 1_000_000;
}
