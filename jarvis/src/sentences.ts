import type { SpeechStart } from "./config.js";
import { codeSpansIn, looseMarkIn, speakable } from "./speakable.js";

export const maxPieceChars = 400;
export const firstClauseChars = 20;

export type Sentences = {
  push(text: string): string[];
  end(): string[];
};

const bySentence = new Intl.Segmenter("en", { granularity: "sentence" });
const shortForm = /(^|[\s("'])(Dr|Mr|Mrs|Ms|Prof|St|vs|Vs|e\.g|E\.g|i\.e|I\.e)\.$/;
const initial = /(^|[\s("'.])[A-Z]\.$/;
const listNumber = /^\s*([-*+•]\s+)?\d{1,3}\.\s*$/;
const clauseEnd = /[,;:]\s|\s[–-]\s|\s?—\s?/g;

const fenceLine = /^\s*(?:>\s*)*(?:(?:[-*+•]|\d{1,3}[.)])\s+)?(`{3,}|~{3,})([\s\S]*)$/;

type Fence = { mark: string; info: string };

function fenceOf(line: string): Fence | null {
  const found = fenceLine.exec(line);
  if (found === null) return null;
  const [, mark, info] = found;
  return mark.startsWith("`") && info.includes("`") ? null : { mark, info };
}

function closes(fence: Fence, open: string): boolean {
  return fence.mark[0] === open[0] && fence.mark.length >= open.length && fence.info.trim() === "";
}

function unclosed(text: string): boolean {
  const count = (mark: string) => text.split(mark).length - 1;
  return count("[") > count("]") || count("(") > count(")") || count("`") % 2 === 1;
}

function joinsNext(piece: string): boolean {
  const end = piece.trimEnd();
  return shortForm.test(end) || initial.test(end) || listNumber.test(piece);
}

function cutPoint(text: string, limit: number): number {
  const head = text.slice(0, limit);
  const clause = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
  if (clause > 0) return clause + 2;
  const space = head.lastIndexOf(" ");
  return space > 0 ? space + 1 : limit;
}

function fitting(piece: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = piece;
  while (rest.length > limit) {
    const cut = cutPoint(rest, limit);
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return [...parts, rest];
}

function firstClause(text: string, least: number, skipCode: boolean): number | null {
  for (const found of text.matchAll(clauseEnd)) {
    const end = found.index + found[0].length;
    if (!unclosed(text.slice(0, end)) && speakable(text.slice(0, end), { skipCode }).length >= least) return end;
  }
  return null;
}

export function createSentences(options: { start: SpeechStart; skipCode?: boolean; maxChars?: number; clauseChars?: number }): Sentences {
  const limit = options.maxChars ?? maxPieceChars;
  const least = options.clauseChars ?? firstClauseChars;
  const skipCode = options.skipCode === true;
  let line = "";
  let midLine = false;
  let code: string | null = null;
  let given = 0;

  const say = (pieces: string[]): string[] => {
    const spoken = pieces.flatMap((piece) => fitting(piece, limit)).flatMap((piece) => {
      const text = speakable(piece, { skipCode });
      return text === "" ? [] : [text];
    });
    given += spoken.length;
    return spoken;
  };

  const split = (text: string, whole: boolean): { pieces: string[]; held: string } => {
    const pieces: string[] = [];
    let current = "";
    const segments = [...bySentence.segment(text)].map((part) => part.segment);
    const spans = skipCode ? codeSpansIn(text) : [];
    const loose = skipCode && !whole ? looseMarkIn(text, spans) : null;
    const inCode = (at: number) => spans.some(([start, end]) => start < at && at < end) || (loose !== null && loose < at);
    let at = 0;
    segments.forEach((segment, index) => {
      current += segment;
      at += segment.length;
      if (index === segments.length - 1 || joinsNext(current) || inCode(at)) return;
      pieces.push(current);
      current = "";
    });
    if (whole) return { pieces: current === "" ? pieces : [...pieces, current], held: "" };
    if (pieces.length > 0 && !/\p{L}/u.test(current)) current = (pieces.pop() ?? "") + current;
    return { pieces, held: current };
  };

  const closeLine = (): string[] => {
    const whole = line;
    const startsLine = !midLine;
    line = "";
    midLine = false;
    const fence = startsLine ? fenceOf(whole) : null;
    if (code !== null) {
      if (fence !== null && closes(fence, code)) code = null;
      return [];
    }
    if (fence !== null) {
      code = fence.mark;
      return [];
    }
    return say(split(whole, true).pieces);
  };

  const openLine = (): string[] => {
    if (code !== null || (!midLine && fenceOf(line) !== null)) return [];
    const { pieces, held } = split(line, false);
    const out = say(pieces);
    line = held;
    if (pieces.length > 0) midLine = true;
    if (options.start === "clause" && given === 0) {
      const end = firstClause(line, least, skipCode);
      if (end !== null) {
        out.push(...say([line.slice(0, end)]));
        line = line.slice(end);
        midLine = true;
      }
    }
    while (line.length > limit) {
      const cut = cutPoint(line, limit);
      out.push(...say([line.slice(0, cut)]));
      line = line.slice(cut);
      midLine = true;
    }
    return out;
  };

  return {
    push(text) {
      const out: string[] = [];
      const lines = text.split("\n");
      lines.forEach((part, index) => {
        line += part;
        out.push(...(index < lines.length - 1 ? closeLine() : openLine()));
      });
      return out;
    },
    end() {
      const out = closeLine();
      code = null;
      given = 0;
      return out;
    },
  };
}
