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
  hiddenDetail?: string;
  groupId?: string;
  option?: string;
  optionsRead?: boolean;
};

export type ListingOption = {
  ref: string | null;
  price: number;
  text: string;
  inStock: boolean | null;
};

export type SearchResult = {
  listings: Listing[];
  total: number;
  complete: boolean;
  calls: number;
  skipped: number;
};

export type FailReason = "keys" | "access" | "busy" | "down" | "request" | "reply" | "gone";

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

export type FullListing = {
  listing: Listing;
  subtitle: string | null;
  description: string | null;
  conditionNote: string | null;
  categoryPath: string | null;
  brand: string | null;
  model: string | null;
  specifics: { name: string; value: string }[];
  returns: { accepted: boolean; days: number | null; paidBy: "buyer" | "seller" | null } | null;
  postageOptions: { cost: number | null; service: string | null; earliest: string | null; latest: string | null }[];
  collection: "only" | "offered" | "none" | null;
  inStock: boolean | null;
  available: number | null;
  sold: number | null;
  minimumBid: number | null;
  reserveMet: boolean | null;
  bidders: number | null;
  lotSize: number | null;
};

export type DetailNames = {
  categoryId: string | null;
  categories: { id: string; name: string; count: number }[];
  details: { name: string; values: { value: string; count: number }[] }[];
};

export type Categories = {
  categories: { id: string; name: string; path: string }[];
};

export type CategoryDetails = {
  categoryId: string;
  details: { name: string; required: boolean; freeText: boolean; values: string[]; moreValues: number }[];
};

export type Source = {
  noCalls?: boolean;
  search(search: Search, maxPages: number): Promise<SearchResult>;
  full?(ref: string): Promise<{ full: FullListing; calls: number }>;
  options?(groupId: string): Promise<{ options: ListingOption[]; calls: number }>;
  detailNames?(query: string, categoryId: string | null): Promise<{ names: DetailNames; calls: number }>;
  categories?(query: string): Promise<{ categories: Categories; calls: number }>;
  categoryDetails?(categoryId: string): Promise<{ details: CategoryDetails; calls: number }>;
};

const unseenCharacters = /[\u00AD\u061C\u115F\u1160\u200B-\u200F\u202A-\u202E\u2060-\u2069\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
const controlCharacters = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const tidy = value.slice(0, maxLength * 8).normalize("NFKC").replace(unseenCharacters, "").replace(controlCharacters, " ").replace(/\s+/g, " ").trim();
  return [...tidy].slice(0, maxLength).join("").trim();
}