import { randomUUID } from "node:crypto";
import { londonNow } from "./alerts.js";

export type Change = { id: number; at: string; lines: string[] };
export type ChangesAnswer = { run: string; latest: number; changes: Change[] };
export type ChangeFeed = { add(lines: string[], at: Date): void; since(after: number | null, run: string | null, now: Date): ChangesAnswer };

export const keptChanges = 50;

export function createChangeFeed(run: string = randomUUID()): ChangeFeed {
  let latest = 0;
  let day = "";
  let kept: Change[] = [];
  return {
    add(lines, at) {
      if (lines.length === 0) return;
      const today = londonNow(at).day;
      if (today !== day) {
        day = today;
        kept = [];
      }
      latest++;
      kept.push({ id: latest, at: at.toISOString(), lines: [...lines] });
      if (kept.length > keptChanges) kept = kept.slice(-keptChanges);
    },
    since(after, asked, now) {
      const today = londonNow(now).day === day ? kept : [];
      const from = asked === run && after !== null ? after : 0;
      return { run, latest, changes: today.filter((change) => change.id > from).map((change) => ({ ...change, lines: [...change.lines] })) };
    },
  };
}
