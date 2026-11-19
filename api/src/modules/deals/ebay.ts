import { conditionIds, type Buying, type Search } from "./searches.js";
import { SourceError, cleanText, type BuyingOption, type FailReason, type Listing, type SearchResult, type Source } from "./source.js";

export type EbayEnvironment = "production" | "sandbox";

export type EbayOptions = {
  clientId: string;
  clientSecret: string;
  environment: EbayEnvironment;
  now?: () => number;
};

export const pageSize = 200;

const apiHosts: Record<EbayEnvironment, string> = { production: "api.ebay.com", sandbox: "api.sandbox.ebay.com" };
const siteHosts: Record<EbayEnvironment, string> = { production: "www.ebay.co.uk", sandbox: "www.sandbox.ebay.co.uk" };
const scope = "https://api.ebay.com/oauth/api_scope";
const timeoutMs = 15_000;
const maxReplyLength = 5 * 1024 * 1024;
const maxRetryAfterMs = 24 * 60 * 60 * 1000;
const openEndedPrice = 10_000_000;
const buyingFilters: Record<Buying, BuyingOption> = { "buy it now": "FIXED_PRICE", "auction": "AUCTION" };
const knownBuying: BuyingOption[] = ["FIXED_PRICE", "AUCTION", "BEST_OFFER", "CLASSIFIED_AD"];

export const ebayMessages: Record<FailReason, string> = {
  keys: "eBay refused the keys",
  access: "eBay says these keys can't search listings",
  busy: "eBay says too many requests",
  down: "couldn't reach eBay",
  request: "eBay refused the search",
  reply: "eBay's reply didn't make sense",
};

function failure(reason: FailReason, detail = ""): SourceError {
  return new SourceError(reason, `${ebayMessages[reason]}${detail}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function searchUrl(host: string, search: Search, offset: number): string {
  const filters: string[] = [];
  const highest = [search.maxPrice, search.maxWithPostage].filter((limit) => limit !== null);
  const max = highest.length > 0 ? Math.min(...highest) : null;
  if (search.minPrice !== null) filters.push(`price:[${pounds(search.minPrice)}..${pounds(max ?? openEndedPrice)}]`, "priceCurrency:GBP");
  else if (max !== null) filters.push(`price:[..${pounds(max)}]`, "priceCurrency:GBP");
  if (search.conditions.length > 0) filters.push(`conditionIds:{${search.conditions.map((name) => conditionIds[name]).join("|")}}`);
  filters.push(`buyingOptions:{${search.buying.map((option) => buyingFilters[option]).join("|")}}`);
  filters.push(search.ukOnly ? "itemLocationCountry:GB" : "deliveryCountry:GB");

  const parts = [`q=${encodeURIComponent(search.query)}`, `filter=${encodeURIComponent(filters.join(","))}`];
  if (search.categoryId !== null) parts.push(`category_ids=${search.categoryId}`);
  parts.push("fieldgroups=MATCHING_ITEMS,EXTENDED", "sort=newlyListed", `limit=${pageSize}`, `offset=${offset}`);
  return `https://${host}/buy/browse/v1/item_summary/search?${parts.join("&")}`;
}

function money(raw: unknown): number | null {
  if (!isObject(raw) || raw.currency !== "GBP" || typeof raw.value !== "string") return null;
  if (!/^[0-9]{1,7}(\.[0-9]{1,2})?$/.test(raw.value)) return null;
  return Math.round(Number(raw.value) * 100);
}

function isoDate(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function countOf(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 1_000_000_000 ? raw : null;
}

function digits(raw: unknown): string | null {
  return typeof raw === "string" && /^[0-9]{1,20}$/.test(raw) ? raw : null;
}

function cheapestPostage(raw: unknown): number | null {
  if (!Array.isArray(raw)) return null;
  const costs = raw
    .slice(0, 20)
    .map((option) => (isObject(option) ? money(option.shippingCost) : null))
    .filter((cost) => cost !== null);
  return costs.length > 0 ? Math.min(...costs) : null;
}

function postageType(raw: unknown): Listing["postageType"] {
  if (!Array.isArray(raw)) return null;
  const types = raw.slice(0, 20).map((option) => (isObject(option) ? option.shippingCostType : null));
  if (types.includes("FIXED")) return "fixed";
  return types.includes("CALCULATED") ? "calculated" : null;
}

function textOrNull(raw: unknown, maxLength: number): string | null {
  const text = cleanText(raw, maxLength);
  return text === "" ? null : text;
}

export function toListing(raw: unknown, siteHost: string): Listing | null {
  if (!isObject(raw)) return null;
  const itemNumber = digits(raw.legacyItemId) ?? (typeof raw.itemId === "string" ? digits(raw.itemId.split("|")[1]) : null);
  if (itemNumber === null) return null;
  const title = cleanText(raw.title, 100);
  if (title === "") return null;

  const buying = Array.isArray(raw.buyingOptions) ? knownBuying.filter((option) => (raw.buyingOptions as unknown[]).includes(option)) : [];
  const auctionOnly = buying.includes("AUCTION") && !buying.includes("FIXED_PRICE");
  const price = (auctionOnly ? money(raw.currentBidPrice) : null) ?? money(raw.price);
  if (price === null) return null;

  const seller = isObject(raw.seller) ? raw.seller : {};
  const percent = typeof seller.feedbackPercentage === "string" && /^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(seller.feedbackPercentage) ? Number(seller.feedbackPercentage) : null;
  const location = isObject(raw.itemLocation) ? raw.itemLocation : {};
  const postcode = textOrNull(location.postalCode, 10);

  return {
    id: itemNumber,
    title,
    price,
    postage: cheapestPostage(raw.shippingOptions),
    condition: textOrNull(raw.condition, 40),
    conditionId: digits(raw.conditionId),
    buying,
    country: typeof location.country === "string" && /^[A-Z]{2}$/.test(location.country) ? location.country : null,
    listedAt: isoDate(raw.itemCreationDate) ?? isoDate(raw.itemOriginDate),
    endsAt: isoDate(raw.itemEndDate),
    bids: countOf(raw.bidCount),
    sellerPercent: percent !== null && percent <= 100 ? percent : null,
    sellerFeedback: countOf(seller.feedbackScore),
    url: `https://${siteHost}/itm/${itemNumber}`,
    ref: typeof raw.itemId === "string" && /^v1\|[0-9]{1,20}\|[0-9]{1,20}$/.test(raw.itemId) ? raw.itemId : null,
    sellerType: seller.sellerAccountType === "BUSINESS" ? "business" : seller.sellerAccountType === "INDIVIDUAL" ? "private" : null,
    topRated: typeof raw.topRatedBuyingExperience === "boolean" ? raw.topRatedBuyingExperience : null,
    postageType: postageType(raw.shippingOptions),
    city: textOrNull(location.city, 40),
    postcode: postcode !== null && /^[A-Za-z0-9 *]{2,10}$/.test(postcode) ? postcode : null,
    summary: textOrNull(raw.shortDescription, 400),
    variations: (typeof raw.itemGroupType === "string" && raw.itemGroupType !== "") || isObject(raw.primaryItemGroup),
    detailsMatch: null,
  };
}

export function isApiAddress(url: string, host: string): boolean {
  if (!URL.canParse(url)) return false;
  const target = new URL(url);
  return target.protocol === "https:" && target.host === host && target.username === "" && target.password === "";
}

export function retryAfterMs(header: string | null, now: number): number | null {
  if (header === null || header.length > 40) return null;
  const wait = /^[0-9]{1,6}$/.test(header.trim()) ? Number(header.trim()) * 1000 : Date.parse(header) - now;
  return Number.isFinite(wait) && wait > 0 ? Math.min(wait, maxRetryAfterMs) : null;
}

async function ask(url: string, init: RequestInit, host: string): Promise<Response> {
  if (!isApiAddress(url, host)) throw failure("request", " (the address isn't eBay's API)");
  try {
    return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw failure("down");
  }
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

async function readJson(response: Response): Promise<unknown> {
  const text = await readText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw failure("reply");
  }
}

async function errorNumber(response: Response): Promise<string> {
  const body = await readJson(response).catch(() => null);
  const first = isObject(body) && Array.isArray(body.errors) ? body.errors[0] : null;
  const errorId = isObject(first) ? countOf(first.errorId) : null;
  return errorId === null ? ` (status ${response.status})` : ` (eBay error ${errorId})`;
}

export function createEbaySource(options: EbayOptions): Source {
  const apiHost = apiHosts[options.environment];
  const siteHost = siteHosts[options.environment];
  const now = options.now ?? Date.now;
  const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
  let token: { value: string; expiresAt: number } | null = null;
  let minting: Promise<string> | null = null;

  function busy(response: Response): SourceError {
    const error = failure("busy");
    error.retryAfterMs = retryAfterMs(response.headers.get("retry-after"), now());
    return error;
  }

  async function mint(): Promise<string> {
    const response = await ask(`https://${apiHost}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: { "Authorization": `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    }, apiHost);
    if (response.status === 429) throw busy(response);
    if (response.status >= 500) throw failure("down");
    if (!response.ok) throw failure("keys");
    const body = await readJson(response);
    if (!isObject(body)) throw failure("reply");
    const value = body.access_token;
    const lifetime = body.expires_in;
    if (typeof value !== "string" || !/^[\x21-\x7E]{1,8000}$/.test(value)) throw failure("reply");
    if (typeof lifetime !== "number" || !Number.isFinite(lifetime) || lifetime <= 0) throw failure("reply");
    token = { value, expiresAt: now() + (Math.min(lifetime, 86_400) - 60) * 1000 };
    return value;
  }

  function currentToken(): Promise<string> {
    if (token !== null && now() < token.expiresAt) return Promise.resolve(token.value);
    minting ??= mint().finally(() => {
      minting = null;
    });
    return minting;
  }

  async function getPage(url: string, countCall: () => void): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      const bearer = await currentToken();
      countCall();
      const response = await ask(url, {
        headers: { "Authorization": `Bearer ${bearer}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB", "Accept": "application/json" },
      }, apiHost);
      if (response.ok) return readJson(response);
      if (response.status === 401) {
        token = null;
        if (attempt === 1) continue;
        throw failure("keys");
      }
      if (response.status === 403) throw failure("access");
      if (response.status === 429) throw busy(response);
      if (response.status >= 500) throw failure("down");
      throw failure("request", await errorNumber(response));
    }
  }

  return {
    async search(search: Search, maxPages: number): Promise<SearchResult> {
      let calls = 0;
      try {
        const listings: Listing[] = [];
        const ids = new Set<string>();
        let total = 0;
        let fetched = 0;
        let skipped = 0;
        let complete = false;
        for (let page = 0; page < maxPages && !complete; page++) {
          const body = await getPage(searchUrl(apiHost, search, page * pageSize), () => {
            calls += 1;
          });
          if (!isObject(body)) throw failure("reply");
          const summaries = body.itemSummaries ?? [];
          const count = countOf(body.total);
          if (!Array.isArray(summaries) || summaries.length > pageSize || count === null) throw failure("reply");
          total = count;
          fetched += summaries.length;
          for (const raw of summaries) {
            const listing = toListing(raw, siteHost);
            if (listing === null) skipped += 1;
            else if (!ids.has(listing.id)) {
              ids.add(listing.id);
              listings.push(listing);
            }
          }
          complete = summaries.length < pageSize || fetched >= total;
        }
        return { listings, total, complete, calls, skipped };
      } catch (error) {
        if (error instanceof SourceError) error.calls = calls;
        throw error;
      }
    },
  };
}