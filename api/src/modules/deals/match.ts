import { conditionIds, type Buying, type Search } from "./searches.js";
import type { BuyingOption, Listing } from "./source.js";

const hourMs = 60 * 60 * 1000;
const buyingNames: Record<Buying, BuyingOption> = { "buy it now": "FIXED_PRICE", "auction": "AUCTION" };

export function plainWords(text: string): string {
  const words = text
    .replace(/\p{S}/gu, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${words} `;
}

export function hasPhrase(title: string, phrase: string): boolean {
  const startsWith = phrase.trim().endsWith("*");
  const wanted = plainWords(phrase);
  if (wanted.trim() === "") return false;
  return plainWords(title).includes(startsWith ? wanted.trimEnd() : wanted);
}

export function totalPrice(listing: Listing): number {
  return listing.price + (listing.postage ?? 0);
}

export function isAuctionOnly(listing: Listing): boolean {
  return listing.buying.includes("AUCTION") && !listing.buying.includes("FIXED_PRICE");
}

export function matches(search: Search, listing: Listing, now: Date): boolean {
  if (search.minPrice !== null && listing.price < search.minPrice) return false;
  if (search.maxPrice !== null && listing.price > search.maxPrice) return false;
  if (search.maxWithPostage !== null && totalPrice(listing) > search.maxWithPostage) return false;

  if (search.conditions.length > 0 && listing.conditionId !== null) {
    if (!search.conditions.some((name) => conditionIds[name] === listing.conditionId)) return false;
  }
  if (search.ukOnly && listing.country !== null && listing.country !== "GB") return false;

  const wanted = search.buying.map((option) => buyingNames[option]);
  if (listing.buying.length > 0 && !listing.buying.some((option) => wanted.includes(option))) return false;

  if (search.endingWithinHours !== null && isAuctionOnly(listing)) {
    const left = listing.endsAt === null ? Number.NaN : Date.parse(listing.endsAt) - now.getTime();
    if (!(left > 0 && left <= search.endingWithinHours * hourMs)) return false;
  }

  if (search.sellerMinPercent !== null && !(listing.sellerPercent !== null && listing.sellerPercent >= search.sellerMinPercent)) return false;
  if (search.sellerMinFeedback !== null && !(listing.sellerFeedback !== null && listing.sellerFeedback >= search.sellerMinFeedback)) return false;

  if (search.mustInclude.some((phrase) => !hasPhrase(listing.title, phrase))) return false;
  if (search.exclude.some((phrase) => hasPhrase(listing.title, phrase))) return false;
  return true;
}

export type Standing = {
  place: number;
  of: number;
  other: number;
};

export function standing(matched: Listing[], listing: Listing): Standing | null {
  if (matched.length < 2 || !matched.some((other) => other.id === listing.id)) return null;
  const total = totalPrice(listing);
  const others = matched.filter((other) => other.id !== listing.id).map(totalPrice);
  const place = others.filter((other) => other < total).length + 1;
  return { place, of: matched.length, other: Math.min(...others) };
}