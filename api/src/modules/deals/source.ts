import type { Search } from "./searches.js";

export type BuyingOption = "FIXED_PRICE" | "AUCTION" | "BEST_OFFER" | "CLASSIFIED_AD";

export type Listing = {
  id: string;
  title: string;
  price: number;
  postage: number | null;
  condition: string | null;
  conditionId: string | null;
  buying: BuyingOption[];
  country: string | null;
  listedAt: string | null;
  endsAt: string | null;
  bids: number | null;
  sellerPercent: number | null;
  sellerFeedback: number | null;
  url: string;
  ref: string | null;
  sellerType: "business" | "private" | null;
  topRated: boolean | null;
  postageType: "fixed" | "calculated" | null;
  city: string | null;
  postcode: string | null;
  summary: string | null;
  variations: boolean;
  detailsMatch: boolean | null;
};

export type SearchResult = {
  listings: Listing[];
  total: number;
  complete: boolean;
  calls: number;
  skipped: number;
};

export type FailReason = "keys" | "access" | "busy" | "down" | "request" | "reply";

export class SourceError extends Error {
  reason: FailReason;
  calls = 0;
  retryAfterMs: number | null = null;

  constructor(reason: FailReason, message: string) {
    super(message);
    this.name = "SourceError";
    this.reason = reason;
  }
}

export type Source = {
  search(search: Search, maxPages: number): Promise<SearchResult>;
};

const unseenCharacters = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;
const controlCharacters = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const tidy = value.slice(0, maxLength * 8).normalize("NFKC").replace(unseenCharacters, "").replace(controlCharacters, " ").replace(/\s+/g, " ").trim();
  return [...tidy].slice(0, maxLength).join("").trim();
}