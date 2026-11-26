export type Verdict = "done" | "more" | "unsure";

export const checkAfterMs = 400;
export const doneAfterMs = 700;
export const moreAfterMs = 3_500;
export const judgeWithinMs = 1_500;

export const leadingOn = ["and", "or", "but", "because", "if", "while", "than", "the", "a", "an", "my", "your", "our", "their", "of", "into", "plus", "very", "um", "uh", "er", "erm", "hmm"];
export const rarelyLast = ["for", "in", "at", "to", "with", "from", "then", "you", "can", "could", "would", "is", "are", "was", "i", "we", "about"];

const address = /^\s*(?:(?:hey|hi|ok|okay)\b[\s,.!?]*)?(?:\S*vis\b[\s,.!?]*)?/i;

export function judgeWords(text: string): Verdict {
  const said = text.replace(/[‘’]/g, "'").replace(address, "").trim();
  const words = said.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.length === 0) return /[a-z0-9]/i.test(text) ? "more" : "unsure";
  if (/(?:\.{2,}|…|[,:;–—-])["')\]]*$/.test(said)) return "more";
  const last = words[words.length - 1];
  if (leadingOn.includes(last)) return "more";
  return /[.!?]["')\]]*$/.test(said) && !rarelyLast.includes(last) ? "done" : "unsure";
}
