import { join } from "node:path";
import type { Config } from "../../config.js";
import { sendToNtfy } from "../notify/notifier.js";
import { createEbaySource } from "./ebay.js";
import { loadSearches } from "./searches.js";
import type { Source } from "./source.js";
import { createStore } from "./store.js";
import { createDealWatcher, type DealWatcher } from "./watcher.js";

const dealsDir = "/deals";

export function dealWatcherFor(config: Pick<Config, "deals" | "ntfyTopic">, dir = dealsDir): DealWatcher {
  const sources: Record<string, Source> = {
    ebay: createEbaySource({
      clientId: config.deals.ebayClientId,
      clientSecret: config.deals.ebayClientSecret,
      environment: config.deals.ebayEnvironment,
    }),
  };
  return createDealWatcher({
    loadSearches: () => loadSearches(join(dir, "searches.json"), Object.keys(sources)),
    sources,
    store: createStore(join(dir, "state.json"), config.deals.seen === "disk"),
    notify: (notification) => sendToNtfy(config.ntfyTopic, notification),
    sandbox: config.deals.ebayEnvironment === "sandbox",
  });
}