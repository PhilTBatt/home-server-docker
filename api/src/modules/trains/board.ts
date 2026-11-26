export type JourneySettings = { at: string; walk: number; arrivalsKey: string; arrivalsUrl: string; detailsUrl: string };

export type TrainSettings = { key: string; from: string; to: string; boardUrl: string; journey?: JourneySettings };

export type BoardAsk = { url: string; key: string; name: string; setting: string };

export type Departure = { due: string; expected: string; platform: string | null; cancelled: boolean; reason: string | null; destination: string | null };

export type Board = { from: string; to: string; departures: Departure[]; buses: number; messages: string[] };

export const boardRows = 5;
export const boardMs = 8_000;

export function safeBoardUrl(value: string): string | null {
  if (!/^https:\/\/[\x21-\x7E]+$/.test(value) || /[{}]/.test(value) || value.length > 300 || !URL.canParse(value)) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null;
  if (url.hostname !== "raildata.org.uk" && !url.hostname.endsWith(".raildata.org.uk")) return null;
  return url.href.replace(/\/+$/, "");
}

const namedEntities: Record<string, string> = { quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">", ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", hellip: "\u2026", pound: "\u00a3", amp: "&" };

export function onTime(value: string): string {
  return /^on ?time$/i.test(value.trim()) ? "On time" : value;
}

export function text(value: unknown, limit = 120): string | null {
  if (typeof value !== "string") return null;
  const plain = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d{1,6});/g, (_entity, code: string) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_entity, code: string) => String.fromCodePoint(Math.min(parseInt(code, 16), 0x10ffff)))
    .replace(/&([a-z]+);/g, (entity, name: string) => namedEntities[name] ?? entity)
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,;:!?])/g, "$1")
    .trim();
  return plain === "" ? null : plain.slice(0, limit);
}

export function placeName(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "object" || first === null) return null;
  const fields = first as Record<string, unknown>;
  if (Array.isArray(fields.location)) return placeName(fields.location);
  return text(fields.locationName);
}

function departureOf(value: unknown): Departure | null {
  if (typeof value !== "object" || value === null) return null;
  const fields = value as Record<string, unknown>;
  const due = text(fields.std, 10);
  const shown = text(fields.etd, 20);
  if (due === null || shown === null) return null;
  const expected = onTime(shown);
  const cancelled = fields.isCancelled === true || fields.filterLocationCancelled === true || expected.toLowerCase() === "cancelled";
  return { due, expected, platform: text(fields.platform, 10), cancelled, reason: text(cancelled ? fields.cancelReason : (fields.delayReason ?? fields.cancelReason), 200), destination: placeName(fields.destination) };
}

export function messagesOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).message) ? ((value as Record<string, unknown>).message as unknown[]) : [];
  return list.flatMap((item) => {
    const found = typeof item === "string" ? text(item, 300) : typeof item === "object" && item !== null ? text((item as Record<string, unknown>).Value ?? (item as Record<string, unknown>).value, 300) : null;
    return found === null ? [] : [found];
  }).slice(0, 3);
}

export function readBoard(body: unknown, settings: Pick<TrainSettings, "from" | "to">, rows = boardRows): Board {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("the reply wasn't a departure board");
  const fields = body as Record<string, unknown>;
  if (fields.crs !== settings.from && typeof fields.generatedAt !== "string") throw new Error("the reply wasn't a departure board");
  const services = fields.trainServices ?? null;
  const list = Array.isArray(services) ? services : typeof services === "object" && services !== null && Array.isArray((services as Record<string, unknown>).service) ? ((services as Record<string, unknown>).service as unknown[]) : services === null ? [] : null;
  if (list === null) throw new Error("the reply's trains weren't a list");
  return {
    from: text(fields.locationName) ?? settings.from,
    to: text(fields.filterLocationName) ?? settings.to,
    departures: list.flatMap((item) => {
      const departure = departureOf(item);
      return departure === null ? [] : [departure];
    }).slice(0, rows),
    buses: Array.isArray(fields.busServices) ? fields.busServices.length : 0,
    messages: messagesOf(fields.nrccMessages),
  };
}

export async function askBoard(ask: BoardAsk, signal?: AbortSignal, fetcher: typeof fetch = fetch, ms = boardMs): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(ask.url, { headers: { "x-apikey": ask.key, accept: "application/json" }, redirect: "error", signal: signal === undefined ? AbortSignal.timeout(ms) : AbortSignal.any([signal, AbortSignal.timeout(ms)]) });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    if (cause.includes("redirect")) throw new Error(`${ask.name}'s address redirected somewhere else, so check ${ask.setting}`);
    throw new Error(`${ask.name} couldn't be reached (${error instanceof Error && error.name === "TimeoutError" ? `no answer within ${ms / 1000} seconds` : "no connection"})`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 || response.status === 403 ? `${ask.name} refused the key, or the address isn't the product the key is for (${response.status})` : response.status === 404 ? `${ask.name} replied 404, so check ${ask.setting} ends just before the station code` : `${ask.name} replied ${response.status}`);
  }
  return await response.json().catch((error: unknown) => {
    throw new Error(error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? `${ask.name} couldn't be reached (no answer within ${ms / 1000} seconds)` : `${ask.name}'s reply wasn't JSON`);
  });
}

export async function fetchBoard(settings: TrainSettings, signal?: AbortSignal, fetcher: typeof fetch = fetch, ms = boardMs, rows = boardRows): Promise<Board> {
  const url = `${settings.boardUrl}/${settings.from}?numRows=${rows}&filterCrs=${settings.to}&filterType=to`;
  const body = await askBoard({ url, key: settings.key, name: "the board", setting: "TRAINS_BOARD_URL" }, signal, fetcher, ms);
  return readBoard(body, settings, rows);
}
