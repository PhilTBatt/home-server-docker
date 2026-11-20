import type { Notification } from "../notify/notifier.js";
import { cautions, guidePercent, isAuctionOnly, priorityFor, totalPrice, underGuide, unitPrice, type Standing } from "./match.js";
import type { Search } from "./searches.js";
import type { Listing } from "./source.js";

export type Started = {
  name: string;
  count: number;
  cheapest: number | null;
};

export function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function ordinal(place: number): string {
  const lastTwo = place % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${place}th`;
  return `${place}${["th", "st", "nd", "rd"][place % 10] ?? "th"}`;
}

export function timeLeft(endsAt: string, now: Date): string {
  const minutes = Math.floor((Date.parse(endsAt) - now.getTime()) / 60_000);
  if (!(minutes > 0)) return "under a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function priceLine(listing: Listing): string {
  if (listing.postage === null) return `${money(listing.price)}, postage not shown`;
  if (listing.postage === 0) return `${money(listing.price)} with free postage`;
  return `${money(listing.price)} + ${money(listing.postage)} postage = ${money(totalPrice(listing))}`;
}

function buyingLine(listing: Listing, now: Date): string {
  const condition = listing.condition === null ? "" : `${listing.condition}. `;
  if (isAuctionOnly(listing)) {
    const bids = listing.bids === null ? "" : `, ${listing.bids} bid${listing.bids === 1 ? "" : "s"} so far`;
    const ends = listing.endsAt === null ? "" : `, ends in ${timeLeft(listing.endsAt, now)}`;
    return `${condition}Auction${bids}${ends}.`;
  }
  return `${condition}Buy it now${listing.buying.includes("BEST_OFFER") ? ", or make an offer" : ""}.`;
}

function standingLine(listing: Listing, place: Standing | null): string | null {
  if (place === null) return null;
  if (place.place > 1) return `${ordinal(place.place)} cheapest of ${place.of} matches right now; the cheapest is ${money(place.other)}.`;
  if (place.other === totalPrice(listing)) return `Joint cheapest of ${place.of} matches right now.`;
  return `Cheapest of ${place.of} matches right now; the next is ${money(place.other)}.`;
}

function sellerLine(listing: Listing): string | null {
  const kind = listing.sellerType === "business" ? "Business seller" : listing.sellerType === "private" ? "Private seller" : "Seller";
  if (listing.sellerPercent === null) return listing.sellerType === null ? null : `${kind}.`;
  const ratings = listing.sellerFeedback === null ? "" : ` from ${listing.sellerFeedback.toLocaleString("en-GB")} rating${listing.sellerFeedback === 1 ? "" : "s"}`;
  return `${kind}: ${listing.sellerPercent}% positive${ratings}.`;
}

const guideGoesStaleAfter = 30 * 24 * 60 * 60 * 1000;

function guideLine(search: Search, listing: Listing, now: Date): string | null {
  const under = underGuide(search, listing);
  if (under === null || search.guidePrice === null) return null;
  const stale = search.guideDate !== null && now.getTime() - Date.parse(search.guideDate) > guideGoesStaleAfter;
  const guide = `your ${money(search.guidePrice)} guide price${stale ? ` (set ${search.guideDate}, so check it's still right)` : ""}`;
  if (under > 0) return `${under}% under ${guide}.`;
  return under < 0 ? `${-under}% over ${guide}.` : `Right on ${guide}.`;
}

function bidLine(search: Search, listing: Listing): string | null {
  const percent = guidePercent(search, listing);
  if (percent === null || search.guidePrice === null) return null;
  const guide = `your ${money(search.guidePrice)} guide price`;
  if (percent > 0) return `The bid so far is ${percent}% under ${guide}.`;
  return percent < 0 ? `The bid so far is ${-percent}% over ${guide}.` : `The bid so far is right on ${guide}.`;
}

function unitLine(search: Search, listing: Listing): string | null {
  const per = unitPrice(search, listing);
  if (per === null) return null;
  return `About ${money(per.pence)} per ${per.unit} (${Number(per.amount.toFixed(2))} ${per.unit}, read from the ${listing.variations ? "option" : "title"}).`;
}

function detailsLine(listing: Listing): string | null {
  if (listing.detailsMatch === null) return null;
  return listing.detailsMatch ? "eBay's item details match what you asked for." : "eBay's item details don't confirm what you asked for.";
}

function cautionLine(search: Search, listing: Listing): string | null {
  const found = cautions(search, listing).filter((caution) => !caution.startsWith("postage"));
  return found.length === 0 ? null : `Check first: ${found.join("; ")}.`;
}

export function dealNotification(search: Search, listing: Listing, place: Standing | null, was: number | null, now: Date, sandbox: boolean): Notification {
  const drop = was !== null;
  const price = isAuctionOnly(listing) ? `Current bid ${priceLine(listing)}` : priceLine(listing);
  const lines = [
    listing.title,
    drop ? `Was ${money(was)}, now ${priceLine(listing)}` : price,
    buyingLine(listing, now),
    guideLine(search, listing, now),
    unitLine(search, listing),
    standingLine(listing, place),
    detailsLine(listing),
    sellerLine(listing),
    cautionLine(search, listing),
  ];
  const kind = drop ? "price drop" : "deal";
  const priority = priorityFor(search, listing);
  return {
    title: `${sandbox ? `Sandbox ${kind}` : `${kind[0].toUpperCase()}${kind.slice(1)}`}: ${search.name}`,
    message: lines.filter((line) => line !== null).join("\n"),
    tags: drop ? "chart_with_downwards_trend" : "moneybag",
    click: listing.url,
    ...(priority === 3 ? {} : { priority }),
  };
}

export function endingNotification(search: Search, listing: Listing, now: Date, sandbox: boolean): Notification {
  const lines = [listing.title, `Current bid ${priceLine(listing)}`, buyingLine(listing, now), bidLine(search, listing), sellerLine(listing)];
  return {
    title: `${sandbox ? "Sandbox ending soon" : "Ending soon"}: ${search.name}`,
    message: lines.filter((line) => line !== null).join("\n"),
    tags: "hourglass_flowing_sand",
    click: listing.url,
    priority: 4,
  };
}

export function moreNotification(search: Search, rest: Listing[], sandbox: boolean): Notification {
  const shown = rest.slice(0, 5).map((listing) => `${money(totalPrice(listing))}: ${listing.title}`);
  if (rest.length > shown.length) shown.push(`And ${rest.length - shown.length} more.`);
  return {
    title: `${sandbox ? "Sandbox deals" : "Deals"}: ${rest.length} more for ${search.name}`,
    message: shown.join("\n"),
    tags: "moneybag",
  };
}

export function watchingNotification(started: Started[], sandbox: boolean): Notification {
  const lines = started.map((search) => {
    if (search.count === 0 || search.cheapest === null) return `${search.name}: nothing matches yet.`;
    return `${search.name}: ${search.count} match${search.count === 1 ? "" : "es"} now, from ${money(search.cheapest)}.`;
  });
  lines.push("You'll hear about new ones as they appear.");
  return { title: sandbox ? "Deal watcher: now watching (sandbox)" : "Deal watcher: now watching", message: lines.join("\n"), tags: "eyes" };
}

export function capNotification(alertsPerDay: number): Notification {
  return {
    title: "Deal watcher: alerts paused",
    message: `Today's limit of ${alertsPerDay} deal alerts is used up. Alerts start again tomorrow, with anything still unseen.`,
    tags: "zzz",
  };
}