import { hasPhrase } from "./match.js";
import type { Search } from "./searches.js";
import { SourceError, cleanText, type FailReason, type Listing, type SearchResult, type Source } from "./source.js";

export type FeedOptions = {
  now?: () => number;
};

export const feedUrl = "https://www.hotukdeals.com/rss/new";
const dealPattern = /^(https:\/\/www\.hotukdeals\.com\/deals\/[a-z0-9-]{1,200}-([0-9]{1,12}))(\?[^\s#]*)?$/;
const pricePattern = /^£([0-9]{1,3}(?:,?[0-9]{3})*)(?:\.([0-9]{2}))?$/;
const temperaturePattern = /^-?[0-9]{1,6}° - /;
const timeoutMs = 15_000;
const maxReplyLength = 512 * 1024;
const maxItemLength = 16 * 1024;
const keptFor = 5 * 60 * 1000;
const maxItems = 100;
const userAgent = "home-hub-deal-watcher/1.0 (a personal RSS reader, one read every five minutes at most)";
const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", pound: "£" };

export const feedMessages: Record<FailReason, string> = {
  keys: "HotUKDeals refused the request",
  access: "HotUKDeals refused the request",
  busy: "HotUKDeals says too many requests",
  down: "couldn't reach HotUKDeals",
  request: "HotUKDeals refused the request",
  reply: "HotUKDeals' feed didn't make sense",
  gone: "HotUKDeals says that deal has gone",
};

function failure(reason: FailReason, detail = ""): SourceError {
  return new SourceError(reason, `${feedMessages[reason]}${detail}`);
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (whole, name: string) => {
    if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
  });
}

function outline(item: string): string {
  let shown = "";
  let from = 0;
  for (;;) {
    const start = item.indexOf("<![CDATA[", from);
    if (start === -1) return shown + item.slice(from);
    const end = item.indexOf("]]>", start);
    const stop = end === -1 ? item.length : end + 3;
    shown += item.slice(from, start) + " ".repeat(stop - start);
    from = stop;
  }
}

function tagAt(shape: string, name: string, from = 0): { start: number; end: number } | null {
  for (let at = shape.indexOf(`<${name}`, from); at !== -1; at = shape.indexOf(`<${name}`, at + 1)) {
    const next = shape[at + name.length + 1];
    if (next !== ">" && next !== "/" && next !== " " && next !== "\t" && next !== "\n" && next !== "\r") continue;
    const end = shape.indexOf(">", at);
    return end === -1 ? null : { start: at, end: end + 1 };
  }
  return null;
}

function elementText(item: string, shape: string, name: string): string | null {
  const open = tagAt(shape, name);
  if (open === null) return null;
  const close = shape.indexOf(`</${name}>`, open.end);
  if (close === -1) return null;
  const raw = item.slice(open.end, close);
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return cdata === null ? decode(raw) : cdata[1];
}

function attribute(shape: string, element: string, name: string): string | null {
  const tag = tagAt(shape, element);
  if (tag === null) return null;
  const found = new RegExp(`(?:^|\\s)${name}="([^"<>]*)"`).exec(shape.slice(tag.start + element.length + 1, tag.end - 1));
  return found === null ? null : decode(found[1]);
}

export function penceOf(price: string | null): number | null {
  const match = price === null ? null : pricePattern.exec(price.trim());
  if (match === null) return null;
  const pence = Number(match[1].replace(/,/g, "")) * 100 + Number(match[2] ?? "0");
  return pence > 0 && pence <= 10_000_000 ? pence : null;
}

export function toFeedListing(item: string): Listing | null {
  if (item.length > maxItemLength) return null;
  const shape = outline(item);
  const deal = dealPattern.exec(cleanText(elementText(item, shape, "link"), 300));
  const title = cleanText(elementText(item, shape, "title"), 200).replace(temperaturePattern, "");
  const price = penceOf(attribute(shape, "pepper:merchant", "price"));
  if (deal === null || title === "" || price === null) return null;
  const [, link, number] = deal;
  const merchant = cleanText(attribute(shape, "pepper:merchant", "name"), 60);
  const posted = Date.parse(cleanText(elementText(item, shape, "pubDate"), 60));
  return {
    id: `hukd-${number}`,
    title,
    price,
    postage: null,
    condition: null,
    conditionId: null,
    buying: ["FIXED_PRICE"],
    country: null,
    listedAt: Number.isNaN(posted) ? null : new Date(posted).toISOString(),
    endsAt: null,
    bids: null,
    sellerPercent: null,
    sellerFeedback: null,
    url: link,
    ref: null,
    sellerType: null,
    topRated: null,
    postageType: null,
    city: null,
    postcode: null,
    summary: merchant === "" ? "A deal posted on HotUKDeals" : `A deal posted on HotUKDeals, at ${merchant}`,
    variations: false,
    detailsMatch: null,
  };
}

export function readFeed(text: string): { listings: Listing[]; skipped: number } | null {
  if (!/<rss[\s>]/i.test(text) || !/<channel[\s>]/i.test(text)) return null;
  const listings: Listing[] = [];
  const ids = new Set<string>();
  let skipped = 0;
  const shape = outline(text);
  let from = 0;
  while (listings.length + skipped < maxItems) {
    const open = tagAt(shape, "item", from);
    if (open === null) break;
    const start = open.end;
    const end = shape.indexOf("</item>", start);
    if (end === -1) {
      skipped += 1;
      break;
    }
    from = end + 7;
    const body = text.slice(start, end);
    const listing = body.includes("<item") ? null : toFeedListing(body);
    if (listing === null || ids.has(listing.id)) skipped += 1;
    else {
      ids.add(listing.id);
      listings.push(listing);
    }
  }
  return { listings, skipped };
}

async function readText(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? "0") > maxReplyLength) throw failure("reply");
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read().catch(() => {
      throw failure("down");
    });
    if (done) break;
    size += value.byteLength;
    if (size > maxReplyLength) {
      await reader.cancel().catch(() => undefined);
      throw failure("reply");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function wanted(search: Search, listing: Listing): boolean {
  return search.query.split(/\s+/).every((word) => hasPhrase(listing.title, word));
}

export function createFeedSource(options: FeedOptions = {}): Source {
  const now = options.now ?? Date.now;
  let kept: { at: number; listings: Listing[]; skipped: number } | null = null;
  let reading: Promise<{ listings: Listing[]; skipped: number }> | null = null;
  let failed: { at: number; reason: FailReason; detail: string } | null = null;

  async function fetchFeed(): Promise<{ listings: Listing[]; skipped: number }> {
    let response: Response;
    try {
      response = await fetch(feedUrl, { headers: { "Accept": "application/rss+xml, application/xml", "User-Agent": userAgent }, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw failure("down");
    }
    if (response.status === 429) throw failure("busy");
    if (response.status >= 500) throw failure("down");
    if (!response.ok) throw failure("request", ` (status ${response.status})`);
    const feed = readFeed(await readText(response));
    if (feed === null) throw failure("reply");
    return feed;
  }

  return {
    noCalls: true,
    async search(search: Search): Promise<SearchResult> {
      if (failed !== null && now() - failed.at < keptFor) throw failure(failed.reason, failed.detail);
      if (kept === null || now() - kept.at >= keptFor) {
        reading ??= fetchFeed().finally(() => {
          reading = null;
        });
        try {
          const feed = await reading;
          kept = { at: now(), ...feed };
          failed = null;
        } catch (error) {
          const reason = error instanceof SourceError ? error.reason : "reply";
          failed = { at: now(), reason, detail: error instanceof SourceError ? error.message.slice(feedMessages[reason].length) : "" };
          throw failure(reason, failed.detail);
        }
      }
      const listings = kept.listings.filter((listing) => wanted(search, listing)).map((listing) => ({ ...listing, buying: [...listing.buying] }));
      return { listings, total: listings.length, complete: true, calls: 0, skipped: kept.listings.length === 0 ? kept.skipped : 0 };
    },
  };
}
