import { messagesUrl } from "./direct.js";

export const turnCheckMs = 1_200;
export const turnCheckMost = 500;

export const turnCheckSystem = "You decide whether someone speaking to a voice assistant has finished what they were saying. You are given what a speech recogniser has written so far, which often leaves off the final punctuation. Reply with exactly one word: done if it reads as a complete request, question or remark, or more if it stops part way through a thought.";

export type TurnVerdict = "done" | "more";

export type TurnCheck = (text: string, signal: AbortSignal) => Promise<TurnVerdict | null>;

export type TurnCheckOptions = { apiKey: string; model: string; url?: string; ms?: number };

export function readTurnVerdict(body: unknown): TurnVerdict | null {
  const content = typeof body === "object" && body !== null ? (body as { content?: unknown }).content : null;
  const first = Array.isArray(content) ? (content[0] as { type?: unknown; text?: unknown } | undefined) : undefined;
  const word = first?.type === "text" && typeof first.text === "string" ? first.text.trim().toLowerCase().replace(/[^a-z]+$/, "") : "";
  return word === "done" || word === "more" ? word : null;
}

export function turnCheck(options: TurnCheckOptions): TurnCheck {
  return async (text, signal) => {
    try {
      const response = await fetch(options.url ?? messagesUrl, {
        method: "POST",
        headers: { "x-api-key": options.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: options.model, max_tokens: 4, system: turnCheckSystem, messages: [{ role: "user", content: text.slice(0, turnCheckMost) }] }),
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(options.ms ?? turnCheckMs)]),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return null;
      }
      return readTurnVerdict(await response.json());
    } catch {
      return null;
    }
  };
}
