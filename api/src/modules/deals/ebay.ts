import { conditionIds, type Buying, type Search } from "./searches.js";
import { SourceError, cleanText, type BuyingOption, type Categories, type CategoryDetails, type Cut, type Cuts, type DetailNames, type ItemRead, type FailReason, type FullListing, type Listing, type ListingOption, type SearchResult, type Source } from "./source.js";

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
  gone: "eBay says that listing has gone",
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

function searchParts(search: Search, withDetails: boolean, aspects: Record<string, string[]> | null): string[] {
  const filters: string[] = [];
  const highest = [search.maxPrice, search.maxWithPostage].filter((limit) => limit !== null);
  const max = highest.length > 0 ? Math.min(...highest) : null;
  if (search.minPrice !== null) filters.push(`price:[${pounds(search.minPrice)}..${pounds(max ?? openEndedPrice)}]`, "priceCurrency:GBP");
  else if (max !== null) filters.push(`price:[..${pounds(max)}]`, "priceCurrency:GBP");
  if (search.conditions.length > 0) filters.push(`conditionIds:{${search.conditions.map((name) => conditionIds[name]).join("|")}}`);
  filters.push(`buyingOptions:{${search.buying.map((option) => buyingFilters[option]).join("|")}}`);
  filters.push(search.ukOnly ? "itemLocationCountry:GB" : "deliveryCountry:GB");
  if (search.sellerType !== null) filters.push(`sellerAccountTypes:{${search.sellerType === "business" ? "BUSINESS" : "INDIVIDUAL"}}`);
  if (search.returnsOnly) filters.push("returnsAccepted:true");
  if (search.freePostage) filters.push("maxDeliveryCost:0");
  if (search.collection !== null) {
    filters.push("deliveryOptions:{SELLER_ARRANGED_LOCAL_PICKUP}", "pickupCountry:GB", `pickupPostalCode:${search.collection.postcode}`, `pickupRadius:${search.collection.miles}`, "pickupRadiusUnit:mi");
  }

  const parts = [`q=${encodeURIComponent(search.query)}`, `filter=${encodeURIComponent(filters.join(","))}`];
  if (search.categoryId !== null) parts.push(`category_ids=${search.categoryId}`);
  if (withDetails && aspects !== null && search.categoryId !== null) {
    const wanted = Object.entries(aspects).map(([name, values]) => `${name}:{${values.join("|")}}`);
    parts.push(`aspect_filter=${encodeURIComponent(`categoryId:${search.categoryId},${wanted.join(",")}`)}`);
  }
  if (search.autoCorrect) parts.push("auto_correct=KEYWORD");
  return parts;
}

export function searchUrl(host: string, search: Search, offset: number, withDetails = false, aspects: Record<string, string[]> | null = withDetails ? search.details : null): string {
  const parts = [...searchParts(search, withDetails, aspects), "fieldgroups=MATCHING_ITEMS,EXTENDED", "sort=newlyListed", `limit=${pageSize}`, `offset=${offset}`];
  return `https://${host}/buy/browse/v1/item_summary/search?${parts.join("&")}`;
}

export type CutStep = {
  filter: string;
  change: Partial<Search>;
  refine: "BUYING_OPTION_REFINEMENTS" | "CONDITION_REFINEMENTS" | null;
};

export function cutSteps(search: Search): CutStep[] {
  const steps: CutStep[] = [];
  if (search.buying.length === 1) steps.push({ filter: `${search.buying[0]} only`, change: { buying: ["buy it now", "auction"] }, refine: "BUYING_OPTION_REFINEMENTS" });
  if (search.ukOnly) steps.push({ filter: "items in the UK", change: { ukOnly: false }, refine: null });
  const highest = [search.maxPrice, search.maxWithPostage].filter((limit) => limit !== null);
  const max = highest.length > 0 ? Math.min(...highest) : null;
  if (search.minPrice !== null || max !== null) {
    const range = search.minPrice === null ? `up to £${pounds(max ?? 0)}` : max === null ? `from £${pounds(search.minPrice)}` : `£${pounds(search.minPrice)} to £${pounds(max)}`;
    steps.push({ filter: `price ${range}`, change: { minPrice: null, maxPrice: null, maxWithPostage: null }, refine: null });
  }
  if (search.conditions.length > 0) steps.push({ filter: `condition ${search.conditions.join(", ")}`, change: { conditions: [] }, refine: "CONDITION_REFINEMENTS" });
  const detailsOnly = search.details !== null && search.detailsMode === "only";
  if (search.categoryId !== null) steps.push({ filter: detailsOnly ? `category ${search.categoryId} and item details` : `category ${search.categoryId}`, change: { categoryId: null }, refine: null });
  if (detailsOnly) steps.push({ filter: "item details", change: { details: null }, refine: null });
  const others = [
    ...(search.sellerType === null ? [] : [`${search.sellerType} sellers`]),
    ...(search.returnsOnly ? ["returns accepted"] : []),
    ...(search.freePostage ? ["free postage"] : []),
    ...(search.collection === null ? [] : [`collection within ${search.collection.miles} miles`]),
  ];
  if (others.length > 0) steps.push({ filter: others.join(", "), change: { sellerType: null, returnsOnly: false, freePostage: false, collection: null }, refine: null });
  return steps;
}

export function countUrl(host: string, search: Search, refine: CutStep["refine"]): string {
  const withDetails = search.details !== null && search.detailsMode === "only";
  const parts = [...searchParts(search, withDetails, withDetails ? search.details : null), `fieldgroups=${refine === null ? "MATCHING_ITEMS" : `MATCHING_ITEMS,${refine}`}`, "limit=1"];
  return `https://${host}/buy/browse/v1/item_summary/search?${parts.join("&")}`;
}

export function wordsUrl(host: string, query: string): string {
  return `https://${host}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&fieldgroups=CATEGORY_REFINEMENTS&limit=1`;
}

const buyingWords: Record<string, string> = { FIXED_PRICE: "buy it now", AUCTION: "auction", BEST_OFFER: "best offer", CLASSIFIED_AD: "classified ad" };

export function toCut(raw: unknown, filter: string, refine: CutStep["refine"]): Cut | null {
  if (!isObject(raw)) return null;
  const total = countOf(raw.total);
  if (total === null) return null;
  const refinement = isObject(raw.refinement) ? raw.refinement : {};
  const field = refine === "BUYING_OPTION_REFINEMENTS" ? refinement.buyingOptionDistributions : refine === "CONDITION_REFINEMENTS" ? refinement.conditionDistributions : null;
  const by: Cut["by"] = [];
  for (const entry of Array.isArray(field) ? field.slice(0, 20) : []) {
    if (!isObject(entry)) continue;
    const name = refine === "BUYING_OPTION_REFINEMENTS" ? (typeof entry.buyingOption === "string" ? (buyingWords[entry.buyingOption] ?? "") : "") : cleanText(entry.condition, 40);
    const count = countOf(entry.matchCount);
    if (name !== "" && count !== null) by.push({ name, count });
  }
  by.sort((a, b) => b.count - a.count);
  return { filter, total, by };
}

export function fullUrl(host: string, ref: string): string {
  return `https://${host}/buy/browse/v1/item/${encodeURIComponent(ref)}`;
}

export function legacyUrl(host: string, itemNumber: string): string {
  return `https://${host}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${itemNumber}`;
}

export function categoryIdsOf(raw: unknown): string[] {
  if (!isObject(raw)) return [];
  if (typeof raw.categoryIdPath !== "string") {
    const leaf = digits(raw.categoryId);
    return leaf === null || leaf.length > 10 ? [] : [leaf];
  }
  return raw.categoryIdPath
    .slice(0, 200)
    .split("|")
    .slice(0, 10)
    .flatMap((part) => {
      const id = digits(part);
      return id === null || id.length > 10 ? [] : [id];
    });
}

export function optionsUrl(host: string, groupId: string): string {
  return `https://${host}/buy/browse/v1/item/get_items_by_item_group?item_group_id=${groupId}`;
}

export function detailNamesUrl(host: string, query: string, categoryId: string | null): string {
  const parts = [`q=${encodeURIComponent(query)}`];
  if (categoryId !== null) parts.push(`category_ids=${categoryId}`);
  parts.push("fieldgroups=ASPECT_REFINEMENTS,CATEGORY_REFINEMENTS", "limit=1");
  return `https://${host}/buy/browse/v1/item_summary/search?${parts.join("&")}`;
}

export function treeIdUrl(host: string): string {
  return `https://${host}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_GB`;
}

export function categoriesUrl(host: string, treeId: string, query: string): string {
  return `https://${host}/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(query)}`;
}

export function categoryDetailsUrl(host: string, treeId: string, categoryId: string): string {
  return `https://${host}/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`;
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

function groupIdOf(raw: Record<string, unknown>): string | null {
  const fromGroup = isObject(raw.primaryItemGroup) ? digits(raw.primaryItemGroup.itemGroupId) : null;
  if (fromGroup !== null) return fromGroup;
  const href = typeof raw.itemGroupHref === "string" ? /[?&]item_group_id=([0-9]{1,20})(?:&|$)/.exec(raw.itemGroupHref.slice(0, 400)) : null;
  return href === null ? null : href[1];
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
  const district = typeof location.postalCode === "string" ? location.postalCode.trim().split(/[ *]/)[0].toUpperCase() : "";
  const ref = typeof raw.itemId === "string" && /^v1\|[0-9]{1,20}\|[0-9]{1,20}$/.test(raw.itemId) && raw.itemId.split("|")[1] === itemNumber ? raw.itemId : null;
  const variations = (typeof raw.itemGroupType === "string" && raw.itemGroupType !== "") || isObject(raw.primaryItemGroup);
  const groupId = variations ? groupIdOf(raw) : null;

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
    ref,
    sellerType: seller.sellerAccountType === "BUSINESS" ? "business" : seller.sellerAccountType === "INDIVIDUAL" ? "private" : null,
    topRated: typeof raw.topRatedBuyingExperience === "boolean" ? raw.topRatedBuyingExperience : null,
    postageType: postageType(raw.shippingOptions),
    city: textOrNull(location.city, 40),
    postcode: /^[A-Z]{1,2}[0-9][A-Z0-9]?$/.test(district) ? district : null,
    summary: textOrNull(raw.shortDescription, 400),
    variations,
    detailsMatch: null,
    ...(groupId === null ? {} : { groupId }),
  };
}

const maxOptions = 100;

export function toOptions(raw: unknown): ListingOption[] | null {
  if (!isObject(raw) || !Array.isArray(raw.items) || raw.items.length > maxOptions) return null;
  const read = raw.items
    .filter(isObject)
    .map((item) => {
      const aspects = new Map<string, string>();
      for (const aspect of Array.isArray(item.localizedAspects) ? item.localizedAspects.slice(0, 60) : []) {
        const name = isObject(aspect) ? cleanText(aspect.name, 60) : "";
        const value = isObject(aspect) ? cleanText(aspect.value, 60) : "";
        if (name !== "" && value !== "" && !aspects.has(name)) aspects.set(name, value);
      }
      const availability = Array.isArray(item.estimatedAvailabilities) && isObject(item.estimatedAvailabilities[0]) ? item.estimatedAvailabilities[0] : {};
      const status = availability.estimatedAvailabilityStatus;
      return {
        ref: typeof item.itemId === "string" && /^v1\|[0-9]{1,20}\|[0-9]{1,20}$/.test(item.itemId) ? item.itemId : null,
        price: money(item.price),
        aspects,
        inStock: status === "IN_STOCK" || status === "LIMITED_STOCK" ? true : status === "OUT_OF_STOCK" ? false : null,
      };
    });
  const names = [...new Set(read.flatMap((option) => [...option.aspects.keys()]))];
  const showsSize = (name: string) => read.some((option) => /(?<![0-9.])[0-9]{1,4}(?:\.[0-9])? ?(gb|tb)(?![a-z0-9])/i.test(option.aspects.get(name) ?? ""));
  const varying = names.filter((name) => new Set(read.map((option) => option.aspects.get(name) ?? "")).size > 1).sort((a, b) => Number(showsSize(b)) - Number(showsSize(a)));
  const options: ListingOption[] = [];
  for (const option of read) {
    if (option.price === null) continue;
    const text = varying
      .filter((name) => option.aspects.has(name))
      .map((name) => `${name}: ${option.aspects.get(name)}`)
      .join(", ");
    options.push({ ref: option.ref, price: option.price, text: cleanText(text, 200), inStock: option.inStock });
  }
  return options;
}

const entities: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", pound: "\u00A3" };

const blocks = ["script", "style", "noscript", "template", "title"].map((name) => ({ open: new RegExp(`<${name}(?![a-z0-9-])`, "iy"), close: new RegExp(`</${name}(?![a-z0-9-])`, "ig") }));

function tagEnd(html: string, open: number, missing: Set<string>): number {
  for (let at = open + 1; at < html.length; at++) {
    const character = html[at];
    if (character === ">") return at;
    if ((character === "\"" || character === "'") && !missing.has(character)) {
      const closing = html.indexOf(character, at + 1);
      if (closing === -1) missing.add(character);
      else at = closing;
    }
  }
  return -1;
}

export function plainText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const html = raw.slice(0, 400_000);
  const missing = new Set<string>();
  let text = "";
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf("<", at);
    if (open === -1) {
      text += html.slice(at);
      break;
    }
    text += html.slice(at, open);
    if (!/[A-Za-z/!?]/.test(html[open + 1] ?? "")) {
      text += "<";
      at = open + 1;
      continue;
    }
    text += " ";
    let close: number;
    if (html.startsWith("<!--", open)) {
      const end = html.indexOf("-->", open + 4);
      close = end === -1 ? -1 : end + 2;
    } else {
      const block = blocks.find((entry) => {
        entry.open.lastIndex = open;
        return entry.open.test(html);
      });
      let from = open;
      if (block !== undefined) {
        block.close.lastIndex = open;
        const end = block.close.exec(html);
        from = end === null ? -1 : end.index;
      }
      close = from === -1 ? -1 : tagEnd(html, from, missing);
    }
    if (close === -1) break;
    at = close + 1;
  }
  const decoded = text.replace(/&(#[0-9]{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,6});/gi, (whole, name: string) => {
    if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? whole;
    const code = /^#x/i.test(name) ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
  });
  return textOrNull(decoded.replace(/\s+/g, " ").trim(), maxLength);
}

function days(raw: unknown): number | null {
  if (!isObject(raw)) return null;
  const value = countOf(raw.value);
  if (value === null || typeof raw.unit !== "string") return null;
  if (raw.unit.includes("DAY")) return value;
  return raw.unit === "MONTH" ? value * 30 : null;
}

export function toFull(raw: unknown, siteHost: string): FullListing | null {
  const listing = toListing(raw, siteHost);
  if (listing === null || !isObject(raw)) return null;
  const list = (value: unknown, most: number): unknown[] => (Array.isArray(value) ? value.slice(0, most) : []);

  const specifics: FullListing["specifics"] = [];
  for (const aspect of list(raw.localizedAspects, 60)) {
    const name = isObject(aspect) ? cleanText(aspect.name, 60) : "";
    const value = isObject(aspect) ? cleanText(aspect.value, 200) : "";
    if (name !== "" && value !== "") specifics.push({ name, value });
  }

  const terms = isObject(raw.returnTerms) ? raw.returnTerms : null;
  const payer = terms?.returnShippingCostPayer;
  const availabilities = list(raw.estimatedAvailabilities, 5).filter(isObject);
  const ways = availabilities.flatMap((availability) => list(availability.deliveryOptions, 10));
  const pickup = ways.includes("SELLER_ARRANGED_LOCAL_PICKUP");
  const posted = ways.includes("SHIP_TO_HOME");
  const status = availabilities[0]?.estimatedAvailabilityStatus;

  return {
    listing,
    subtitle: textOrNull(raw.subtitle, 100),
    description: plainText(raw.description, 3000),
    conditionNote: textOrNull(raw.conditionDescription, 500),
    categoryPath: textOrNull(raw.categoryPath, 200),
    brand: textOrNull(raw.brand, 60),
    model: textOrNull(raw.mpn, 60),
    specifics,
    returns: terms === null ? null : { accepted: terms.returnsAccepted === true, days: days(terms.returnPeriod), paidBy: payer === "BUYER" ? "buyer" : payer === "SELLER" ? "seller" : null },
    postageOptions: list(raw.shippingOptions, 5)
      .filter(isObject)
      .map((option) => ({
        cost: money(option.shippingCost),
        service: textOrNull(option.shippingServiceCode, 60),
        earliest: isoDate(option.minEstimatedDeliveryDate),
        latest: isoDate(option.maxEstimatedDeliveryDate),
      })),
    collection: pickup ? (posted ? "offered" : "only") : posted ? "none" : null,
    inStock: status === "IN_STOCK" || status === "LIMITED_STOCK" ? true : status === "OUT_OF_STOCK" ? false : null,
    available: countOf(availabilities[0]?.estimatedAvailableQuantity),
    sold: countOf(availabilities[0]?.estimatedSoldQuantity),
    minimumBid: money(raw.minimumPriceToBid),
    reserveMet: typeof raw.reservePriceMet === "boolean" ? raw.reservePriceMet : null,
    bidders: countOf(raw.uniqueBidderCount),
    lotSize: countOf(raw.lotSize),
  };
}

export function toDetailNames(raw: unknown): DetailNames | null {
  if (!isObject(raw)) return null;
  const refinement = isObject(raw.refinement) ? raw.refinement : {};
  const list = (value: unknown, most: number): Record<string, unknown>[] => (Array.isArray(value) ? value.slice(0, most).filter(isObject) : []);
  const categories: DetailNames["categories"] = [];
  for (const category of list(refinement.categoryDistributions, 20)) {
    const id = digits(category.categoryId);
    const name = cleanText(category.categoryName, 60);
    if (id !== null && name !== "") categories.push({ id, name, count: countOf(category.matchCount) ?? 0 });
  }
  const details: DetailNames["details"] = [];
  for (const aspect of list(refinement.aspectDistributions, 40)) {
    const name = cleanText(aspect.localizedAspectName, 60);
    const values = list(aspect.aspectValueDistributions, 200)
      .map((entry) => ({ value: cleanText(entry.localizedAspectValue, 60), count: countOf(entry.matchCount) ?? 0 }))
      .filter((entry) => entry.value !== "")
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
    if (name !== "" && values.length > 0) details.push({ name, values });
  }
  return { categoryId: digits(refinement.dominantCategoryId), categories, details };
}

const valuesShown = 100;

export function toCategories(raw: unknown): Categories | null {
  if (!isObject(raw)) return null;
  const list = (value: unknown, most: number): Record<string, unknown>[] => (Array.isArray(value) ? value.slice(0, most).filter(isObject) : []);
  const categories: Categories["categories"] = [];
  for (const suggestion of list(raw.categorySuggestions, 20)) {
    const category = isObject(suggestion.category) ? suggestion.category : {};
    const id = digits(category.categoryId);
    const name = cleanText(category.categoryName, 60);
    if (id === null || name === "" || categories.some((known) => known.id === id)) continue;
    const above = list(suggestion.categoryTreeNodeAncestors, 10)
      .map((ancestor) => ({ level: countOf(ancestor.categoryTreeNodeLevel) ?? 0, name: cleanText(ancestor.categoryName, 60) }))
      .filter((ancestor) => ancestor.name !== "")
      .sort((a, b) => a.level - b.level);
    categories.push({ id, name, path: [...above.map((ancestor) => ancestor.name), name].join(" > ") });
  }
  return { categories };
}

export function toCategoryDetails(raw: unknown, categoryId: string): CategoryDetails | null {
  if (!isObject(raw)) return null;
  const aspects = Array.isArray(raw.aspects) ? raw.aspects.slice(0, 100).filter(isObject) : [];
  const details: CategoryDetails["details"] = [];
  for (const aspect of aspects) {
    const name = cleanText(aspect.localizedAspectName, 60);
    if (name === "" || details.some((known) => known.name === name)) continue;
    const rule = isObject(aspect.aspectConstraint) ? aspect.aspectConstraint : {};
    const given = Array.isArray(aspect.aspectValues) ? aspect.aspectValues.slice(0, 5000).filter(isObject) : [];
    const values = [...new Set(given.map((entry) => cleanText(entry.localizedValue, 60)).filter((value) => value !== ""))];
    details.push({
      name,
      required: rule.aspectRequired === true,
      freeText: rule.aspectMode !== "SELECTION_ONLY",
      values: values.slice(0, valuesShown),
      moreValues: Math.max(0, values.length - valuesShown),
    });
  }
  return { categoryId, details };
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
  let tree: string | null = null;

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

  async function getPage(url: string, countCall: () => void, missing: FailReason = "request"): Promise<unknown> {
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
      if (response.status === 404 && missing !== "request") throw failure(missing);
      if (response.status === 429) throw busy(response);
      if (response.status >= 500) throw failure("down");
      throw failure("request", await errorNumber(response));
    }
  }

  async function treeId(countCall: () => void): Promise<string> {
    if (tree !== null) return tree;
    const body = await getPage(treeIdUrl(apiHost), countCall);
    const id = isObject(body) ? digits(body.categoryTreeId) : null;
    if (id === null || id.length > 6) throw failure("reply");
    tree = id;
    return id;
  }

  async function readPages(search: Search, pages: number, withDetails: boolean, countCall: () => void, aspects: Record<string, string[]> | null = withDetails ? search.details : null) {
    const listings: Listing[] = [];
    const ids = new Set<string>();
    let total = 0;
    let fetched = 0;
    let skipped = 0;
    let complete = false;
    let read = 0;
    for (let page = 0; page < pages && !complete; page++) {
      read += 1;
      const body = await getPage(searchUrl(apiHost, search, page * pageSize, withDetails, aspects), countCall);
      if (!isObject(body)) throw failure("reply");
      const summaries = body.itemSummaries ?? [];
      const count = countOf(body.total);
      if (!Array.isArray(summaries) || summaries.length > pageSize || count === null) throw failure("reply");
      if (withDetails && Array.isArray(body.warnings) && body.warnings.length > 0) {
        const warning = isObject(body.warnings[0]) ? countOf(body.warnings[0].errorId) : null;
        throw failure("request", warning === null ? " (eBay warned about the item details)" : ` (eBay warning ${warning} about the item details)`);
      }
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
    return { listings, total, complete, skipped, pages: read };
  }

  async function counted<Reply>(work: (countCall: () => void) => Promise<Reply>): Promise<{ reply: Reply; calls: number }> {
    let calls = 0;
    try {
      const reply = await work(() => {
        calls += 1;
      });
      return { reply, calls };
    } catch (error) {
      if (error instanceof SourceError) error.calls = calls;
      throw error;
    }
  }

  return {
    async search(search: Search, maxPages: number): Promise<SearchResult> {
      const mode = search.details === null ? null : search.detailsMode;
      const hides = Object.entries(search.hideDetails ?? {});
      const both = mode === "prefer" && maxPages >= 2 + hides.length;
      const mainPages = Math.max(1, Math.floor((maxPages - (both ? 1 : 0)) / (1 + hides.length)));
      const { reply, calls } = await counted(async (countCall) => {
        const main = await readPages(search, mainPages, mode === "only", countCall);
        if (mode === "only") for (const listing of main.listings) listing.detailsMatch = true;
        let skipped = main.skipped;
        if (both) {
          const tagged = await readPages(search, 1, true, countCall);
          const byId = new Map(main.listings.map((listing) => [listing.id, listing]));
          if (tagged.complete) for (const listing of main.listings) listing.detailsMatch = false;
          for (const listing of tagged.listings) {
            const same = byId.get(listing.id);
            if (same === undefined) main.listings.push({ ...listing, detailsMatch: true });
            else same.detailsMatch = true;
          }
          skipped += tagged.skipped;
        }
        for (const [name, values] of hides) {
          const unwanted = await readPages(search, main.pages, true, countCall, mode === "only" ? { ...search.details, [name]: values } : { [name]: values });
          if (main.total > 0 && unwanted.total >= main.total) throw failure("request", ` (hiding by ${name} would hide every listing, so check the name and values)`);
          const ids = new Set(unwanted.listings.map((listing) => listing.id));
          for (const listing of main.listings) if (listing.hiddenDetail === undefined && ids.has(listing.id)) listing.hiddenDetail = name;
        }
        return { listings: main.listings, total: main.total, complete: main.complete, skipped };
      });
      return { ...reply, calls };
    },

    async full(ref: string) {
      if (!/^v1\|[0-9]{1,20}\|[0-9]{1,20}$/.test(ref)) throw failure("request", " (that isn't one of eBay's item references)");
      const { reply, calls } = await counted(async (countCall) => {
        const full = toFull(await getPage(fullUrl(apiHost, ref), countCall, "gone"), siteHost);
        if (full === null) throw failure("reply");
        return full;
      });
      return { full: reply, calls };
    },

    async options(groupId: string) {
      if (!/^[0-9]{1,20}$/.test(groupId)) throw failure("request", " (that isn't one of eBay's item group numbers)");
      const { reply, calls } = await counted(async (countCall) => {
        const options = toOptions(await getPage(optionsUrl(apiHost, groupId), countCall, "gone"));
        if (options === null) throw failure("reply");
        return options;
      });
      return { options: reply, calls };
    },

    async detailNames(query: string, categoryId: string | null) {
      const { reply, calls } = await counted(async (countCall) => {
        const names = toDetailNames(await getPage(detailNamesUrl(apiHost, query, categoryId), countCall));
        if (names === null) throw failure("reply");
        return names;
      });
      return { names: reply, calls };
    },

    async categories(query: string) {
      const { reply, calls } = await counted(async (countCall) => {
        const found = toCategories(await getPage(categoriesUrl(apiHost, await treeId(countCall), query), countCall));
        if (found === null) throw failure("reply");
        return found;
      });
      return { categories: reply, calls };
    },

    async item(itemNumber: string) {
      if (!/^[0-9]{1,20}$/.test(itemNumber)) throw failure("request", " (that isn't an eBay item number)");
      const { reply, calls } = await counted(async (countCall): Promise<ItemRead> => {
        let body: unknown;
        try {
          body = await getPage(legacyUrl(apiHost, itemNumber), countCall, "gone");
        } catch (error) {
          if (error instanceof SourceError && error.message.endsWith("(eBay error 11003)")) throw failure("gone");
          if (!(error instanceof SourceError && error.message.endsWith("(eBay error 11006)"))) throw error;
          const group = await getPage(optionsUrl(apiHost, itemNumber), countCall, "gone");
          const first = isObject(group) && Array.isArray(group.items) ? group.items[0] : undefined;
          const full = toFull(first, siteHost);
          const options = toOptions(group);
          if (full === null || options === null) throw failure("reply");
          const inStock = options.filter((option) => option.inStock !== false);
          const prices = (inStock.length > 0 ? inStock : options).map((option) => option.price);
          const price = prices.length > 0 ? Math.min(...prices) : full.listing.price;
          const listing = { ...full.listing, id: itemNumber, url: `https://${siteHost}/itm/${itemNumber}`, price, variations: true, groupId: itemNumber };
          return { full: { ...full, listing }, categoryIds: categoryIdsOf(first), options };
        }
        const full = toFull(body, siteHost);
        if (full === null) throw failure("reply");
        return { full, categoryIds: categoryIdsOf(body), options: null };
      });
      return { item: reply, calls };
    },

    async cuts(search: Search) {
      const { reply, calls } = await counted(async (countCall) => {
        const watched = toCut(await getPage(countUrl(apiHost, search, null), countCall), "", null);
        if (watched === null) throw failure("reply");
        const without: Cut[] = [];
        for (const step of cutSteps(search)) {
          const cut = toCut(await getPage(countUrl(apiHost, { ...search, ...step.change }, step.refine), countCall), step.filter, step.refine);
          if (cut === null) throw failure("reply");
          without.push(cut);
        }
        const body = await getPage(wordsUrl(apiHost, search.query), countCall);
        const total = isObject(body) ? countOf(body.total) : null;
        const names = toDetailNames(body);
        if (total === null || names === null) throw failure("reply");
        const cuts: Cuts = { asWatched: watched.total, without, wordsAlone: { total, categoryId: names.categoryId, categories: names.categories } };
        return cuts;
      });
      return { cuts: reply, calls };
    },

    async categoryDetails(categoryId: string) {
      if (!/^[0-9]{1,10}$/.test(categoryId)) throw failure("request", " (that isn't one of eBay's category numbers)");
      const { reply, calls } = await counted(async (countCall) => {
        const body = await getPage(categoryDetailsUrl(apiHost, await treeId(countCall), categoryId), countCall).catch((error: unknown) => {
          if (error instanceof SourceError && error.message.endsWith("(eBay error 62009)")) throw failure("request", " (that category has categories under it, and only the last level has item details)");
          throw error;
        });
        const details = toCategoryDetails(body, categoryId);
        if (details === null) throw failure("reply");
        return details;
      });
      return { details: reply, calls };
    },
  };
}