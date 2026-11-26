import { isIP } from "node:net";

export const privateNames = ["localhost", "local", "home", "lan", "internal", "intranet", "corp", "arpa", "test", "invalid", "onion", "ts.net"];

export const notAnAddress = "That isn't a web address, so it isn't opened.";
export const notWeb = "Only http and https addresses are opened.";
export const hasLogin = "An address with a name or password in it isn't opened.";
export const oddPort = "Only the usual web ports are opened.";
export const bareNumber = "An address that is a number, not a name, isn't opened.";
export const privateName = "That name belongs to a private network, so it isn't opened.";
export const privatePlace = "That address leads to a private network, so it isn't opened.";

function v4Private(address: string): boolean {
  const [a, b, c] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

function v6Words(address: string): number[] | null {
  const plain = address.split("%")[0];
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(plain);
  let text = plain;
  if (tail !== null) {
    if (isIP(tail[1]) !== 4) return null;
    const [a, b, c, d] = tail[1].split(".").map(Number);
    text = `${plain.slice(0, -tail[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const words = (part: string) => (part === "" ? [] : part.split(":").map((word) => Number.parseInt(word, 16)));
  const head = words(halves[0]);
  const rest = halves.length === 2 ? words(halves[1]) : [];
  const gap = 8 - head.length - rest.length;
  if (halves.length === 1 ? gap !== 0 : gap < 1) return null;
  const all = [...head, ...Array<number>(halves.length === 2 ? gap : 0).fill(0), ...rest];
  return all.length === 8 && all.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff) ? all : null;
}

function v4From(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

export function privateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return v4Private(address);
  if (kind !== 6) return true;
  const words = v6Words(address);
  if (words === null) return true;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) return v4Private(v4From(words[6], words[7]));
  if (words[0] === 0x64 && words[1] === 0xff9b) return words.slice(2, 6).some((word) => word !== 0) || v4Private(v4From(words[6], words[7]));
  if (words[0] === 0x2002) return v4Private(v4From(words[1], words[2]));
  if ((words[0] & 0xe000) !== 0x2000) return true;
  if (words[0] === 0x2001 && (words[1] < 0x200 || words[1] === 0xdb8)) return true;
  if (words[0] === 0x3fff && words[1] < 0x1000) return true;
  return false;
}

export type Address = { host: string } | { refused: string };

export function addressOf(raw: string): Address {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { refused: notAnAddress };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { refused: notWeb };
  if (url.username !== "" || url.password !== "") return { refused: hasLogin };
  if (url.port !== "") return { refused: oddPort };
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host.startsWith("[") || isIP(host) !== 0) return { refused: bareNumber };
  if (!host.includes(".") || privateNames.some((name) => host === name || host.endsWith(`.${name}`))) return { refused: privateName };
  return { host };
}

export function twinsOf(host: string): string[] {
  const bare = host.replace(/^www\./, "");
  return [bare, `www.${bare}`].filter((name) => name !== host);
}

export function siteOf(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname.toLowerCase().replace(/\.+$/, "").replace(/^www\./, "") || null : null;
  } catch {
    return null;
  }
}
