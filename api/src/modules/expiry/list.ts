import { readFile } from "node:fs/promises";

export type ExpiryItem = {
  name: string;
  date: string;
  note: string | null;
};

export const listName = "expiry/items.json";
export const maxItems = 50;
export const maxListBytes = 64 * 1024;
export const nameLength = 40;
export const noteLength = 100;
export const longestWord = 20;
export const mixedWord = 12;
export const problemsShown = 3;

const plainCharacters = /^[A-Za-z0-9 '\-.,()&/+:_]+$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const fields = ["name", "date", "note"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPlain(text: string, most: number): boolean {
  return text.length <= most && plainCharacters.test(text) && text.trim() === text;
}

export function couldBeSecret(text: string): boolean {
  return text.split(" ").some((word) => word.length > longestWord || (word.length >= mixedWord && /[A-Za-z]/.test(word) && /[0-9]/.test(word)));
}

export function isRealDate(text: string): boolean {
  const match = datePattern.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2099 && date.getUTCMonth() === month - 1;
}

function textProblem(label: string, field: string, value: unknown, most: number): string | null {
  if (typeof value !== "string" || !isPlain(value, most)) return `${label}'s ${field} must be 1 to ${most} characters of letters, digits, spaces and ' - . , ( ) & / + : _, with no space at either end`;
  if (couldBeSecret(value)) return `${label}'s ${field} was refused because it could be a key or token (a word over ${longestWord} characters, or one of ${mixedWord} or more mixing letters and digits)`;
  return null;
}

function joined(problems: string[]): string {
  const shown = problems.slice(0, problemsShown).join("; ");
  return problems.length > problemsShown ? `${shown}; and ${problems.length - problemsShown} more` : shown;
}

export function readList(text: string): ExpiryItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${listName} isn't valid JSON`);
  }
  if (!isObject(parsed) || !Array.isArray(parsed.items)) throw new Error(`${listName} must be an object with an "items" list`);
  if (Object.keys(parsed).some((key) => key !== "items")) throw new Error(`${listName} must have nothing but "items" at the top`);
  if (parsed.items.length > maxItems) throw new Error(`${listName} has more than ${maxItems} items`);

  const problems: string[] = [];
  const items: ExpiryItem[] = [];
  const names = new Map<string, number>();
  parsed.items.forEach((raw: unknown, index: number) => {
    const entry = `entry ${index + 1}`;
    if (!isObject(raw)) {
      problems.push(`${entry} must be an object with a name and a date`);
      return;
    }
    if (Object.keys(raw).some((key) => !fields.includes(key))) problems.push(`${entry} must have nothing but a name, a date and a note`);
    const nameProblem = textProblem(entry, "name", raw.name, nameLength);
    if (nameProblem !== null) problems.push(nameProblem);
    const name = nameProblem === null ? String(raw.name) : null;
    const label = name === null ? entry : `${entry} (${name})`;
    const dateOk = typeof raw.date === "string" && isRealDate(raw.date);
    if (!dateOk) problems.push(`${label}'s date must be a real date written YYYY-MM-DD, like 2027-03-31`);
    const noteProblem = raw.note === undefined || raw.note === "" ? null : textProblem(label, "note", raw.note, noteLength);
    if (noteProblem !== null) problems.push(noteProblem);
    if (name !== null) {
      const first = names.get(name.toLowerCase());
      if (first !== undefined) problems.push(`${label} has the same name as entry ${first}`);
      else names.set(name.toLowerCase(), index + 1);
    }
    items.push({ name: String(raw.name), date: String(raw.date), note: typeof raw.note === "string" && raw.note !== "" ? raw.note : null });
  });
  if (problems.length > 0) throw new Error(`${listName}: ${joined(problems)}`);
  return items;
}

export async function loadList(path: string): Promise<ExpiryItem[]> {
  const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw new Error(error.code === "ENOENT" ? `there's no ${listName} yet: copy api/src/modules/expiry/items.example.json there to start` : `${listName} couldn't be read`);
  });
  if (Buffer.byteLength(text) > maxListBytes) throw new Error(`${listName} is bigger than ${maxListBytes / 1024} KB`);
  return readList(text);
}
