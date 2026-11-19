import type { Notification } from "../notify/notifier.js";
import { isAuctionOnly, totalPrice, type Standing } from "./match.js";
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
  if (listing.sellerPercent === null) return null;
  const ratings = listing.sellerFeedback === null ? "" : ` from ${listing.sellerFeedback.toLocaleString("en-GB")} rating${listing.sellerFeedback === 1 ? "" : "s"}`;
  return `Seller: ${listing.sellerPercent}% positive${ratings}.`;
}

export function dealNotification(search: Search, listing: Listing, place: Standing | null, was: number | null, now: Date, sandbox: boolean): Notification {
  const drop = was !== null;
  const price = isAuctionOnly(listing) ? `Current bid ${priceLine(listing)}` : priceLine(listing);
  const lines = [
    listing.title,
    drop ? `Was ${money(was)}, now ${priceLine(listing)}` : price,
    buyingLine(listing, now),
    standingLine(listing, place),
    sellerLine(listing),
  ];
  const kind = drop ? "price drop" : "deal";
  return {
    title: `${sandbox ? `Sandbox ${kind}` : `${kind[0].toUpperCase()}${kind.slice(1)}`}: ${search.name}`,
    message: lines.filter((line) => line !== null).join("\n"),
    tags: drop ? "chart_with_downwards_trend" : "moneybag",
    click: listing.url,
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