import { avoidLists, conditionIds, type Buying, type Search } from "./searches.js";
import type { BuyingOption, Listing, ListingOption } from "./source.js";

const hourMs = 60 * 60 * 1000;
const buyingNames: Record<Buying, BuyingOption> = { "buy it now": "FIXED_PRICE", "auction": "AUCTION" };

export function plainWords(text: string): string {
  const words = text
    .replace(/\p{S}/gu, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([0-9])(gb|tb|mb|mhz|ghz|w)(?![a-z0-9])/g, "$1 $2")
    .trim();
  return ` ${words} `;
}

export function hasPhrase(title: string, phrase: string): boolean {
  const startsWith = phrase.trim().endsWith("*");
  const wanted = plainWords(phrase);
  if (wanted.trim() === "") return false;
  return plainWords(title).includes(startsWith ? wanted.trimEnd() : wanted);
}

export function alwaysExcluded(must: string, exclude: string): boolean {
  const kept = must.trim().endsWith("*") ? plainWords(must).trimEnd() : plainWords(must);
  const dropped = exclude.trim().endsWith("*") ? plainWords(exclude).trimEnd() : plainWords(exclude);
  return dropped.trim() !== "" && kept.includes(dropped);
}

export function totalPrice(listing: Listing): number {
  return listing.price + (listing.postage ?? 0);
}

export function isAuctionOnly(listing: Listing): boolean {
  return listing.buying.includes("AUCTION") && !listing.buying.includes("FIXED_PRICE");
}

export const hiddenReasons = ["price", "condition", "place", "buying", "ending", "seller", "postage", "words", "avoid", "details", "options"] as const;

export type HiddenReason = (typeof hiddenReasons)[number];

export type RuleCheck = {
  rule: HiddenReason;
  setting: string;
  text: string;
};

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

const buyingWords: Record<string, string> = { FIXED_PRICE: "buy it now", AUCTION: "an auction", BEST_OFFER: "best offer", CLASSIFIED_AD: "a classified ad" };

function* failingRules(search: Search, listing: Listing, now: Date): Generator<RuleCheck> {
  if (search.minPrice !== null && listing.price < search.minPrice) yield { rule: "price", setting: "minPrice", text: `its price, ${pounds(listing.price)}, is under the search's ${pounds(search.minPrice)} minimum` };
  if (search.maxPrice !== null && listing.price > search.maxPrice) yield { rule: "price", setting: "maxPrice", text: `its price, ${pounds(listing.price)}, is over the search's ${pounds(search.maxPrice)} top price` };
  if (search.maxWithPostage !== null && totalPrice(listing) > search.maxWithPostage) {
    yield { rule: "price", setting: "maxWithPostage", text: `with postage it's ${pounds(totalPrice(listing))}, over the search's ${pounds(search.maxWithPostage)} top with postage` };
  }

  if (search.conditions.length > 0 && listing.conditionId !== null) {
    if (!search.conditions.some((name) => conditionIds[name] === listing.conditionId)) {
      yield { rule: "condition", setting: "conditions", text: `its condition, ${listing.condition ?? `number ${listing.conditionId}`}, isn't one the search takes (${search.conditions.join(", ")})` };
    }
  }
  if (search.ukOnly && listing.country !== null && listing.country !== "GB") yield { rule: "place", setting: "ukOnly", text: `it's in ${listing.country}, and the search only takes items in the UK` };

  const wanted = search.buying.map((option) => buyingNames[option]);
  if (listing.buying.length > 0 && !listing.buying.some((option) => wanted.includes(option))) {
    yield { rule: "buying", setting: "buying", text: `it's ${listing.buying.map((option) => buyingWords[option] ?? option).join(" or ")}, and the search takes ${search.buying.join(" or ")}` };
  }

  if (search.endingWithinHours !== null && isAuctionOnly(listing)) {
    const left = listing.endsAt === null ? Number.NaN : Date.parse(listing.endsAt) - now.getTime();
    if (!(left > 0 && left <= search.endingWithinHours * hourMs)) yield { rule: "ending", setting: "endingWithinHours", text: `the auction doesn't end within the search's ${search.endingWithinHours} hours` };
  }

  if (search.sellerMinPercent !== null && !(listing.sellerPercent !== null && listing.sellerPercent >= search.sellerMinPercent)) {
    yield { rule: "seller", setting: "sellerMinPercent", text: listing.sellerPercent === null ? `its seller's feedback isn't shown, and the search needs ${search.sellerMinPercent}% positive` : `its seller is ${listing.sellerPercent}% positive, under the search's ${search.sellerMinPercent}%` };
  }
  if (search.sellerMinFeedback !== null && !(listing.sellerFeedback !== null && listing.sellerFeedback >= search.sellerMinFeedback)) {
    yield { rule: "seller", setting: "sellerMinFeedback", text: listing.sellerFeedback === null ? `its seller's feedback score isn't shown, and the search needs ${search.sellerMinFeedback}` : `its seller's feedback score is ${listing.sellerFeedback}, under the search's ${search.sellerMinFeedback}` };
  }
  if (search.sellerType !== null && listing.sellerType !== null && listing.sellerType !== search.sellerType) yield { rule: "seller", setting: "sellerType", text: `its seller is ${listing.sellerType}, and the search takes ${search.sellerType} sellers only` };
  if (search.postageShown && listing.postage === null) yield { rule: "postage", setting: "postageShown", text: "it shows no postage price, and the search needs one" };

  for (const phrase of search.mustInclude) {
    if (!hasPhrase(listing.title, phrase)) yield { rule: "words", setting: "mustInclude", text: `its title doesn't have "${phrase}", which the search needs` };
  }
  for (const phrase of search.exclude) {
    if (hasPhrase(listing.title, phrase)) yield { rule: "words", setting: "exclude", text: `its title has "${phrase}", which the search leaves out` };
  }
  for (const name of search.avoid) {
    const word = (avoidLists[name] ?? []).find((phrase) => hasPhrase(listing.title, phrase));
    if (word !== undefined) yield { rule: "avoid", setting: "avoid", text: `its title has "${word}", from the ${name} avoid list` };
  }
  if (listing.hiddenDetail !== undefined) yield { rule: "details", setting: "hideDetails", text: `eBay says its ${listing.hiddenDetail} is one the search hides` };
  if (search.hideVariations && listing.variations && listing.option === undefined) yield { rule: "options", setting: "hideVariations", text: "it has several options, and the search hides those" };
}

export function ruleChecks(search: Search, listing: Listing, now: Date): RuleCheck[] {
  return [...failingRules(search, listing, now)];
}

export function whyNot(search: Search, listing: Listing, now: Date): HiddenReason | null {
  const first = failingRules(search, listing, now).next();
  return first.done === true ? null : first.value.rule;
}

export function matches(search: Search, listing: Listing, now: Date): boolean {
  return whyNot(search, listing, now) === null;
}

export function sizesIn(title: string): number[] {
  const text = title.toLowerCase();
  const sizes: number[] = [];
  const inGb = (amount: string, unit: string) => Number(amount) * (unit === "tb" ? 1000 : 1);
  for (const kit of text.matchAll(/(?<![0-9.])([1-9][0-9]?) ?x ?([0-9]{1,4}(?:\.[0-9])?) ?(gb|tb)(?![a-z0-9])/g)) sizes.push(Number(kit[1]) * inGb(kit[2], kit[3]));
  for (const kit of text.matchAll(/(?<![0-9.])([0-9]{1,4}(?:\.[0-9])?) ?(gb|tb) ?x ?([1-9][0-9]?)(?![a-z0-9])/g)) sizes.push(Number(kit[3]) * inGb(kit[1], kit[2]));
  for (const single of text.matchAll(/(?<![0-9.])([0-9]{1,4}(?:\.[0-9])?) ?(gb|tb)(?![a-z0-9])/g)) sizes.push(inGb(single[1], single[2]));
  return sizes;
}

export function sizeInTitle(title: string): number | null {
  const largest = Math.max(0, ...sizesIn(title));
  return largest > 0 && largest <= 1_000_000 ? largest : null;
}

export type UnitPrice = {
  unit: "GB" | "TB";
  amount: number;
  pence: number;
};

export function priceKnown(listing: Listing): boolean {
  return !listing.variations || typeof listing.option === "string";
}

export function unitPrice(search: Search, listing: Listing): UnitPrice | null {
  if (search.unit === null || !priceKnown(listing) || isAuctionOnly(listing)) return null;
  const gigabytes = sizeInTitle(listing.variations ? (listing.option ?? "") : listing.title);
  if (gigabytes === null) return null;
  const amount = search.unit === "TB" ? gigabytes / 1000 : gigabytes;
  return { unit: search.unit, amount, pence: Math.round(totalPrice(listing) / amount) };
}

export function guidePercent(search: Search, listing: Listing): number | null {
  if (search.guidePrice === null) return null;
  const percent = ((search.guidePrice - totalPrice(listing)) * 100) / search.guidePrice;
  return percent >= 0 ? Math.floor(percent) : -Math.ceil(-percent);
}

export function underGuide(search: Search, listing: Listing): number | null {
  return isAuctionOnly(listing) ? null : guidePercent(search, listing);
}

export function isGreat(search: Search, listing: Listing): boolean {
  return search.guidePrice !== null && !isAuctionOnly(listing) && priceKnown(listing) && totalPrice(listing) * 100 <= search.guidePrice * (100 - search.greatPercent);
}

export function priorityFor(search: Search, listing: Listing): 2 | 3 | 4 {
  if (search.guidePrice === null || isAuctionOnly(listing)) return 3;
  if (isGreat(search, listing)) return 4;
  return totalPrice(listing) > search.guidePrice ? 2 : 3;
}

const offEbayPhrases = [
  "cash on collection",
  "cash only",
  "cash on pick up",
  "cash on pickup",
  "bank transfer",
  "paypal friends",
  "paypal f f",
  "whatsapp",
  "pay outside",
  "payment outside",
];
const phoneNumber = /(?<![0-9])(?:\+44 ?7|07)[0-9]{3} ?[0-9]{3} ?[0-9]{3}(?![0-9])/;

export function offEbaySign(text: string): string | null {
  const phrase = offEbayPhrases.find((wanted) => hasPhrase(text, wanted));
  if (phrase !== undefined) return `"${phrase}"`;
  return phoneNumber.test(text) ? "a phone number" : null;
}

export function cautions(search: Search, listing: Listing, description: string | null = null): string[] {
  const found: string[] = [];
  const sign = [listing.title, listing.summary ?? "", description ?? ""].map(offEbaySign).find((found) => found !== null);
  if (sign !== undefined && sign !== null) found.push(`it mentions ${sign}, a sign of paying or talking outside eBay, which loses eBay's Money Back Guarantee`);
  if (listing.sellerFeedback !== null && listing.sellerFeedback < 10) found.push("the seller has under 10 ratings");
  if (search.guidePrice !== null && !isAuctionOnly(listing) && totalPrice(listing) * 2 < search.guidePrice) found.push("it's under half your guide price");
  if (listing.variations) found.push(typeof listing.option === "string" ? `the listing has more than one option, and this is the price of ${listing.option}` : "the listing has more than one option, so this may be its lowest price");
  if (listing.postage === null && search.source === "ebay") found.push("postage isn't shown, so it may be collection only");
  if (search.source !== "ebay") found.push("it's a deal someone posted, so check the price, postage and stock at the shop");
  return found;
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

function searchSizes(search: Search): number[] {
  const named = sizesIn(search.mustInclude.join(" "));
  return named.length > 0 ? named : sizesIn(search.query);
}

export function readsOptions(search: Search): boolean {
  return search.readOptions && searchSizes(search).length > 0;
}

export function chooseOption(search: Search, options: ListingOption[]): ListingOption | null {
  const wanted = searchSizes(search);
  if (wanted.length === 0) return null;
  const largest = Math.max(...wanted);
  const fitting = options.filter((option) => {
    if (option.inStock === false || option.ref === null || search.exclude.some((phrase) => hasPhrase(option.text, phrase))) return false;
    const sizes = sizesIn(option.text);
    return sizes.length > 0 && Math.max(...sizes) === largest && wanted.every((size) => sizes.includes(size));
  });
  if (fitting.length === 0) return null;
  const inRange = search.minPrice === null ? fitting : fitting.filter((option) => option.price >= (search.minPrice as number));
  const pool = inRange.length > 0 ? inRange : fitting;
  return pool.reduce((cheapest, option) => (option.price < cheapest.price ? option : cheapest));
}

export function withOption(listing: Listing, option: ListingOption | null): Listing {
  const read = { ...listing, optionsRead: true };
  return option === null || option.ref === null ? read : { ...read, price: option.price, ref: option.ref, option: option.text };
}
