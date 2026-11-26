// @ts-check
/**
 * @typedef {object} Download
 * @property {string} name
 * @property {number} percent
 * @property {number} speedKBps
 * @property {number | null} etaSeconds
 * @property {string} state
 */

/**
 * @typedef {object} LibraryCounts
 * @property {number} movies
 * @property {number} series
 * @property {number} episodes
 */

/**
 * @typedef {object} Reconnect
 * @property {string} time
 * @property {string} message
 */

/**
 * @typedef {object} WifiReconnects
 * @property {number} total
 * @property {Reconnect[]} recent
 */


/**
 * @typedef {object} ServerStatus
 * @property {number} uptimeSeconds
 * @property {number} memoryTotalMB
 * @property {number} memoryAvailableMB
 * @property {number} diskTotalGB
 * @property {number} diskAvailableGB
 */

/**
 * @typedef {object} Problem
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {object} Alerts
 * @property {boolean} ok
 * @property {Problem[]} problems
 */

/**
 * @typedef {object} DoctorCheck
 * @property {string} name
 * @property {"ok" | "warn" | "problem" | "off"} state
 * @property {string} detail
 * @property {string | null} next
 */

/**
 * @typedef {object} DoctorReport
 * @property {"ok" | "warn" | "problem"} state
 * @property {string} summary
 * @property {string} checkedAt
 * @property {DoctorCheck[]} checks
 */

/**
 * @typedef {object} Features
 * @property {boolean} alerts
 * @property {boolean} heartbeat
 * @property {boolean} dailySummary
 * @property {boolean} memoryInbox
 * @property {boolean} memoryUpload
 * @property {boolean} deals
 * @property {boolean} findPhone
 * @property {boolean} trains
 * @property {boolean} trainAlerts
 * @property {boolean} expiryAlerts
 */

/**
 * @typedef {object} ExpiryItem
 * @property {string} name
 * @property {string} date
 * @property {string | null} note
 * @property {number} daysLeft
 * @property {boolean} overdue
 */

/**
 * @typedef {object} ExpiryList
 * @property {string} today
 * @property {ExpiryItem[]} items
 */

/**
 * @typedef {object} BackupRun
 * @property {string} time
 * @property {string | null} problem
 */

/**
 * @typedef {object} BackupState
 * @property {BackupRun | null} lastRun
 * @property {string | null} lastSuccess
 */

/**
 * @typedef {object} InboxCount
 * @property {number} waiting
 */

/**
 * @typedef {object} SavedNote
 * @property {string} saved
 * @property {number} [waiting]
 */

/**
 * @typedef {object} DealListing
 * @property {string} title
 * @property {number} price
 * @property {number | null} postage
 * @property {number} total
 * @property {string | null} condition
 * @property {string[]} buying
 * @property {string} url
 * @property {string | null} endsAt
 * @property {"business" | "private" | null} [sellerType]
 * @property {number | null} [underGuide]
 * @property {{ unit: string, amount: number, pence: number } | null} [perUnit]
 * @property {boolean | null} [detailsMatch]
 * @property {boolean} [great]
 * @property {string[]} [cautions]
 */

/**
 * @typedef {object} DealSearch
 * @property {string} id
 * @property {string} name
 * @property {string | null} group
 * @property {boolean} on
 * @property {number | null} matches
 * @property {string | null} lastChecked
 * @property {string | null} problem
 * @property {boolean} snoozed
 * @property {string | null} snoozedUntil
 * @property {Record<string, number> | null} hidden
 * @property {{ fitted: number, unknown: number, unread: number } | null} [options]
 * @property {string[]} [notes]
 * @property {string} [source]
 * @property {number} [callsToday]
 * @property {DealHealth[]} [health]
 */

/**
 * @typedef {object} DealHealth
 * @property {"incomplete" | "mostlyHidden" | "nothingFound" | "noMatch"} kind
 * @property {string} text
 */

/**
 * @typedef {object} DealCut
 * @property {string} filter
 * @property {number} total
 * @property {{ name: string, count: number }[]} by
 */

/**
 * @typedef {object} DealCuts
 * @property {number} asWatched
 * @property {DealCut[]} without
 * @property {{ total: number, categoryId: string | null, categories: { id: string, name: string, count: number }[] }} wordsAlone
 * @property {{ at: string, total: number, read: number, complete: boolean } | null} [lastCheck]
 */

/**
 * @typedef {object} DealExplainedItem
 * @property {string} title
 * @property {number} total
 * @property {string | null} [condition]
 * @property {string | null} [country]
 * @property {string} url
 * @property {boolean | null} inStock
 * @property {string | null} [note]
 */

/**
 * @typedef {object} DealExplainReason
 * @property {"eBay" | "watcher"} by
 * @property {string} text
 */

/**
 * @typedef {object} DealExplainedSearch
 * @property {string} name
 * @property {boolean} on
 * @property {boolean} snoozed
 * @property {string | null} [option]
 * @property {string} says
 * @property {string} [alert]
 * @property {DealExplainReason[]} reasons
 */

/**
 * @typedef {object} DealExplained
 * @property {DealExplainedItem} item
 * @property {DealExplainedSearch[]} searches
 * @property {string} about
 */

/**
 * @typedef {object} DealHidden
 * @property {Record<string, number>} hidden
 * @property {Record<string, string[]>} examples
 */

/**
 * @typedef {object} DealGroup
 * @property {string} id
 * @property {string} name
 * @property {string | null} group
 * @property {string} source
 * @property {string} checkedAt
 * @property {number} count
 * @property {DealListing[]} listings
 */

/**
 * @typedef {object} DealStatus
 * @property {string | null} lastRun
 * @property {number} callsToday
 * @property {number} callsPerDay
 * @property {number} alertsToday
 * @property {number} alertsPerDay
 * @property {string | null} note
 * @property {Problem[]} problems
 * @property {{ from: string, to: string, allow: string, now: boolean } | null} [quiet]
 * @property {{ at: string, sentToday: boolean, skippedToday: boolean } | null} [digest]
 */

/**
 * @typedef {object} DealCheck
 * @property {number} checked
 * @property {number} alerts
 * @property {number} failed
 * @property {boolean} unsent
 */

/**
 * @typedef {object} ApiError
 * @property {string} [error]
 * @property {string} [message]
 */

/** @type {Record<string, string>} */
const featureLabels = { alerts: "alerts", heartbeat: "heartbeat", dailySummary: "daily summary", memoryInbox: "brain inbox", memoryUpload: "note uploads", deals: "deal watcher", findPhone: "find my phone", trains: "train times", trainAlerts: "train alerts", expiryAlerts: "expiry alerts" };

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`No element with id "${id}"`);
  }
  return element;
}

const message = byId("message");
const loginForm = byId("login-form");
const tokenInput = /** @type {HTMLInputElement} */ (byId("token"));
const dashboard = byId("dashboard");
const logoutButton = byId("logout");
const downloadsList = byId("downloads");
const libraryText = byId("library");
const wifiText = byId("wifi");
const serverText = byId("server");
const backupText = byId("backup");
const alertsList = byId("alerts");
const doctorSummary = byId("doctor-summary");
const doctorChecks = byId("doctor-checks");
const switchesText = byId("switches");
const scanButton = /** @type {HTMLButtonElement} */ (byId("scan-library"));
const brainSection = byId("brain");
const inboxText = byId("brain-inbox");
const noteForm = /** @type {HTMLFormElement} */ (byId("note-form"));
const noteTitle = /** @type {HTMLInputElement} */ (byId("note-title"));
const noteText = /** @type {HTMLTextAreaElement} */ (byId("note-text"));
const sendNoteButton = /** @type {HTMLButtonElement} */ (byId("send-note"));
const noteStatus = byId("note-status");
const dealsSection = byId("deals");
const dealsStatus = byId("deals-status");
const dealsBest = byId("deals-best");
const dealsList = byId("deals-list");
const dealsSearches = byId("deals-searches");
const checkDealsButton = /** @type {HTMLButtonElement} */ (byId("check-deals"));
const explainForm = /** @type {HTMLFormElement} */ (byId("explain-form"));
const explainInput = /** @type {HTMLInputElement} */ (byId("explain-item"));
const explainButton = /** @type {HTMLButtonElement} */ (byId("explain-button"));
const explainResult = byId("explain-result");
const expirySection = byId("expiry");
const expiryList = byId("expiry-list");
const listingLinkStarts = ["https://www.ebay.co.uk/itm/", "https://www.sandbox.ebay.co.uk/itm/", "https://www.hotukdeals.com/deals/"];
/** @type {number | undefined} */ let refreshTimer;
/** @type {Set<string>} */ const openDealSections = new Set();
/** @type {Map<string, "counting" | string[]>} */ const dealCuts = new Map();
const dealsShownPerSearch = 5;
const dealsReadPerSearch = 15;
const dealsFreshMs = 6 * 60 * 60 * 1000;
const bestDealsShown = 10;
/** @type {[string, string][]} */
const partTypes = [["whole pc", "Whole PCs"], ["server", "Servers"], ["cpu", "CPUs"], ["motherboard", "Motherboards"], ["ram", "RAM"], ["storage", "Storage"], ["graphics", "Graphics cards"], ["power supply", "Power supplies"], ["case", "Cases"], ["cooling", "Cooling"], ["network", "Network"], ["expansion", "Expansion cards"], ["ups", "UPS"], ["other", "Other"]];

/**
 * @param {boolean} loggedIn
 */
function showView(loggedIn) {
  loginForm.hidden = loggedIn;
  dashboard.hidden = !loggedIn;
  clearInterval(refreshTimer);

  if (loggedIn) {
    loadDownloads();
    loadLibrary();
    loadWifi();
    loadServer();
    loadBackup();
    loadAlerts();
    loadDoctor();
    loadSwitches();

    refreshTimer = setInterval(refreshDownloads, 10_000);
  }
}

function refreshDownloads() {
  if (document.hidden) {
    return;
  }
  loadDownloads();
}

/**
 * @param {string} text
 * @returns {HTMLLIElement}
 */
function listItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

/**
 * @param {number | null} seconds
 * @returns {string}
 */
function formatEta(seconds) {
  if (seconds === null) {
    return "unknown";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}


/**
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  if (days === 0) {
    return formatEta(seconds);
  }
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

async function loadDownloads() {
  const response = await fetch("/api/media/downloads");
  if (!response.ok) {
    downloadsList.replaceChildren(listItem(`Couldn't load downloads: the API replied ${response.status}.`));
    return;
  }
  /** @type {Download[]} */
  const downloads = await response.json();
  if (downloads.length === 0) {
    downloadsList.replaceChildren(listItem("Nothing downloading."));
    return;
  }
  downloadsList.replaceChildren(
    ...downloads.map((d) => listItem(`${d.name}: ${d.percent}% at ${d.speedKBps} KB/s, ETA ${formatEta(d.etaSeconds)}`)),
  );
}

async function loadLibrary() {
  const response = await fetch("/api/media/library");
  if (!response.ok) {
    libraryText.textContent = `Couldn't load the library: the API replied ${response.status}.`;
    return;
  }
  /** @type {LibraryCounts} */
  const counts = await response.json();
  libraryText.textContent = `${counts.movies} movies, ${counts.series} series, ${counts.episodes} episodes`;
}

async function loadWifi() {
  const response = await fetch("/api/system/wifi-reconnects");
  if (!response.ok) {
    wifiText.textContent = `Couldn't load Wi-Fi reconnects: the API replied ${response.status}.`;
    return;
  }
  /** @type {WifiReconnects} */
  const wifi = await response.json();
  if (wifi.total === 0) {
    wifiText.textContent = "No reconnects logged.";
    return;
  }
  const last = new Date(wifi.recent[0].time).toLocaleString();
  wifiText.textContent = `${wifi.total} reconnect${wifi.total === 1 ? "" : "s"}, last at ${last}.`;
}


async function loadServer() {
  const response = await fetch("/api/system/status");
  if (!response.ok) {
    serverText.textContent = `Couldn't load the server status: the API replied ${response.status}.`;
    return;
  }
  /** @type {ServerStatus} */
  const status = await response.json();
  const memoryFree = (status.memoryAvailableMB / 1024).toFixed(1);
  const memoryTotal = (status.memoryTotalMB / 1024).toFixed(1);
  serverText.textContent = `Up ${formatUptime(status.uptimeSeconds)}. Memory: ${memoryFree} of ${memoryTotal} GB available. Disk: ${status.diskAvailableGB} of ${status.diskTotalGB} GB free.`;
}

/**
 * @param {BackupState} backup
 * @returns {string}
 */
function backupSummary(backup) {
  if (backup.lastRun === null) return "Never run.";
  const ran = new Date(backup.lastRun.time).toLocaleString();
  if (backup.lastRun.problem === null) return `Last ran ${ran}.`;
  const lastGood = backup.lastSuccess === null ? "No good backup yet." : `Last good backup: ${new Date(backup.lastSuccess).toLocaleString()}.`;
  return `The last run (${ran}) failed: ${backup.lastRun.problem}. ${lastGood}`;
}

async function loadBackup() {
  const response = await fetch("/api/system/backup");
  if (!response.ok) {
    backupText.textContent = `Couldn't load the backup status: the API replied ${response.status}.`;
    return;
  }
  /** @type {BackupState} */
  const backup = await response.json();
  backupText.textContent = backupSummary(backup);
}

async function loadAlerts() {
  const response = await fetch("/api/system/alerts");
  if (!response.ok) {
    alertsList.replaceChildren(listItem(`Couldn't load alerts: the API replied ${response.status}.`));
    return;
  }
  /** @type {Alerts} */
  const alerts = await response.json();
  if (alerts.ok) {
    alertsList.replaceChildren(listItem("All good."));
    return;
  }
  alertsList.replaceChildren(...alerts.problems.map((p) => listItem(p.message)));
}

/**
 * @param {unknown} reply
 * @returns {reply is DoctorReport}
 */
function isDoctorReport(reply) {
  return isObject(reply) && typeof reply.summary === "string" && Array.isArray(reply.checks) && reply.checks.every((check) => isObject(check) && typeof check.name === "string" && typeof check.state === "string" && typeof check.detail === "string" && (check.next === null || typeof check.next === "string"));
}

/**
 * @param {DoctorReport} report
 * @returns {HTMLLIElement[]}
 */
function doctorItems(report) {
  /** @param {string} state */
  const named = (state) => report.checks.filter((check) => check.state === state).map((check) => check.name);
  const items = ["problem", "warn"].flatMap((state) => report.checks.filter((check) => check.state === state)).map((check) => listItem(`${check.state === "problem" ? "Problem" : "Look at"}: ${check.name}. ${check.detail}${check.next === null ? "" : ` Try: ${check.next}`}`));
  const fine = named("ok");
  const off = named("off");
  if (fine.length > 0) items.push(listItem(`Fine: ${fine.join(", ")}.`));
  if (off.length > 0) items.push(listItem(`Switched off: ${off.join(", ")}.`));
  return items;
}

async function loadDoctor() {
  const got = await fetchReply("/api/system/doctor", "Couldn't check the server");
  if ("text" in got) {
    doctorSummary.textContent = got.text;
    doctorChecks.replaceChildren();
    return;
  }
  if (!isDoctorReport(got.reply)) {
    doctorSummary.textContent = "Couldn't read the API's reply.";
    doctorChecks.replaceChildren();
    return;
  }
  doctorSummary.textContent = got.reply.summary;
  doctorChecks.replaceChildren(...doctorItems(got.reply));
}

async function loadSwitches() {
  const response = await fetch("/api/system/features");
  if (!response.ok) {
    switchesText.textContent = `Couldn't load the switches: the API replied ${response.status}.`;
    return;
  }
  /** @type {Features} */
  const features = await response.json();
  const off = Object.entries(features)
    .filter(([, on]) => !on)
    .map(([name]) => featureLabels[name] ?? name);
  switchesText.textContent = off.length === 0 ? "All on." : `Off: ${off.join(", ")}.`;
  showBrain(features);
  showDeals(features);
  showExpiry(features);
}

/**
 * @param {Features} features
 */
function showBrain(features) {
  brainSection.hidden = !features.memoryInbox && !features.memoryUpload;
  inboxText.hidden = !features.memoryInbox;
  noteForm.hidden = !features.memoryUpload;
  if (features.memoryInbox) loadInbox();
}

/**
 * @param {number} waiting
 * @returns {string}
 */
function waitingText(waiting) {
  if (waiting === 0) return "No notes waiting.";
  return `${waiting} note${waiting === 1 ? "" : "s"} waiting.`;
}

async function loadInbox() {
  const response = await fetch("/api/memory/inbox");
  if (!response.ok) {
    inboxText.textContent = `Couldn't load the inbox: the API replied ${response.status}.`;
    return;
  }
  /** @type {InboxCount} */
  const count = await response.json();
  inboxText.textContent = waitingText(count.waiting);
}

/**
 * @param {Features} features
 */
function showExpiry(features) {
  expirySection.hidden = !features.expiryAlerts;
  if (features.expiryAlerts) loadExpiry();
}

/**
 * @param {ExpiryItem} item
 * @returns {string}
 */
function expiryText(item) {
  const date = new Date(`${item.date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const days = Math.abs(item.daysLeft);
  const when = item.overdue ? `overdue by ${days} day${days === 1 ? "" : "s"}` : item.daysLeft === 0 ? "expires today" : `${days} day${days === 1 ? "" : "s"} left`;
  return `${item.name}: ${when} (${date})${item.note === null ? "" : `. ${item.note}`}`;
}

async function loadExpiry() {
  const response = await fetch("/api/expiry");
  if (!response.ok) {
    /** @type {ApiError | null} */
    const body = await response.json().catch(() => null);
    expiryList.replaceChildren(listItem(`Couldn't load the list: ${body?.error ?? `the API replied ${response.status}`}.`));
    return;
  }
  /** @type {ExpiryList} */
  const list = await response.json();
  expiryList.replaceChildren(...(list.items.length === 0 ? [listItem("Nothing on the list.")] : list.items.map((item) => listItem(expiryText(item)))));
}

/**
 * @param {Features} features
 */
function showDeals(features) {
  dealsSection.hidden = !features.deals;
  if (features.deals) loadDeals();
}

/**
 * @param {number} pence
 * @returns {string}
 */
function formatMoney(pence) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

/**
 * @param {number} count
 * @returns {string}
 */
function formatCount(count) {
  return count.toLocaleString("en-GB");
}

/**
 * @param {DealListing} listing
 * @returns {string}
 */
function dealPrice(listing) {
  if (listing.postage === null) return `${formatMoney(listing.price)}, postage not shown`;
  if (listing.postage === 0) return `${formatMoney(listing.price)} with free postage`;
  return `${formatMoney(listing.price)} + ${formatMoney(listing.postage)} postage = ${formatMoney(listing.total)}`;
}

/**
 * @param {string} title
 * @param {string} url
 * @returns {HTMLAnchorElement | string}
 */
function listingLink(title, url) {
  if (!listingLinkStarts.some((start) => url.startsWith(start))) return title;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = title;
  return link;
}

/**
 * @param {DealListing} listing
 * @returns {HTMLLIElement}
 */
function dealItem(listing) {
  const item = document.createElement("li");
  item.append(listingLink(listing.title, listing.url));
  const auction = listing.buying.includes("AUCTION") && !listing.buying.includes("FIXED_PRICE");
  const details = [dealPrice(listing)];
  if (listing.condition !== null) details.push(listing.condition);
  if (auction) details.push(listing.endsAt === null ? "auction" : `auction, ends ${new Date(listing.endsAt).toLocaleString()}`);
  if (listing.sellerType === "business" || listing.sellerType === "private") details.push(`${listing.sellerType} seller`);
  if (typeof listing.underGuide === "number") details.push(listing.underGuide < 0 ? `${-listing.underGuide}% over guide` : `${listing.underGuide}% under guide`);
  if (listing.perUnit) details.push(`about ${formatMoney(listing.perUnit.pence)} per ${listing.perUnit.unit}`);
  if (listing.detailsMatch === true) details.push("item details match");
  if (Array.isArray(listing.cautions) && listing.cautions.length > 0) details.push(`check: ${listing.cautions.join("; ")}`);
  item.append(`: ${details.join(", ")}`);
  return item;
}

/**
 * @param {string | null} group
 * @returns {string}
 */
function partTypeName(group) {
  if (group === null) return "No part type";
  return partTypes.find(([id]) => id === group)?.[1] ?? group;
}

/**
 * @template {{ group: string | null }} Item
 * @param {Item[]} items
 * @returns {[string | null, Item[]][]}
 */
function byPartType(items) {
  /** @type {(string | null)[]} */
  const order = [...partTypes.map(([id]) => id), ...new Set(items.map((item) => item.group).filter((group) => group !== null && !partTypes.some(([id]) => id === group))), null];
  return order.map((group) => /** @type {[string | null, Item[]]} */ ([group, items.filter((item) => item.group === group)])).filter(([, found]) => found.length > 0);
}

/**
 * @param {string} key
 * @param {string} summaryText
 * @param {Node[]} contents
 * @returns {HTMLDetailsElement}
 */
function dealSection(key, summaryText, contents) {
  const section = document.createElement("details");
  section.open = openDealSections.has(key);
  section.addEventListener("toggle", () => {
    if (section.open) openDealSections.add(key);
    else openDealSections.delete(key);
  });
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  section.append(summary, ...contents);
  return section;
}

/**
 * @param {Record<string, number> | null} hidden
 * @returns {string}
 */
function hiddenText(hidden) {
  const reasons = Object.entries(hidden ?? {}).filter(([, count]) => count > 0);
  if (reasons.length === 0) return "";
  return `hidden: ${reasons.map(([reason, count]) => `${count} by ${reason}`).join(", ")}`;
}

/**
 * @param {DealSearch} search
 * @returns {HTMLLIElement}
 */
function dealSearchItem(search) {
  const until = search.snoozedUntil === null ? "until woken" : `until ${new Date(search.snoozedUntil).toLocaleString()}`;
  const parts = [search.snoozed ? `snoozed ${until}` : search.matches === null ? "not checked yet" : `${search.matches} matching`];
  const hidden = hiddenText(search.hidden);
  if (!search.snoozed && hidden !== "") parts.push(hidden);
  if (search.options) parts.push(`options: ${search.options.fitted} fitted, ${search.options.unknown} couldn't tell, ${search.options.unread} not read yet`);
  if (search.problem) parts.push(`problem: ${search.problem}`);
  for (const note of search.notes ?? []) parts.push(`note: ${note}`);
  for (const note of search.health ?? []) parts.push(note.text.replace(/\.$/, ""));
  if (search.callsToday) parts.push(`${search.callsToday} eBay call${search.callsToday === 1 ? "" : "s"} today`);
  const item = listItem(`${search.name}: ${parts.join("; ")}. `);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = search.snoozed ? "Wake" : "Snooze for a day";
  button.addEventListener("click", () => snoozeDealSearch(search, button));
  item.append(button);
  /** @type {HTMLUListElement[]} */
  const lists = [];
  const recent = search.lastChecked !== null && Date.now() - Date.parse(search.lastChecked) <= dealsFreshMs;
  if (!search.snoozed && hidden !== "" && recent) {
    const show = document.createElement("button");
    show.type = "button";
    show.textContent = "What was hidden";
    const examples = document.createElement("ul");
    show.addEventListener("click", () => showHiddenExamples(search, show, examples));
    item.append(" ", show);
    lists.push(examples);
  }
  if (search.source === "ebay") {
    const count = document.createElement("button");
    count.type = "button";
    count.textContent = "What cuts it";
    count.setAttribute("aria-label", `What cuts ${search.name}`);
    count.dataset.cuts = search.id;
    const cuts = document.createElement("ul");
    cuts.setAttribute("aria-live", "polite");
    cuts.dataset.cuts = search.id;
    count.addEventListener("click", () => showCuts(search.id));
    showCutsState(search.id, count, cuts);
    item.append(" ", count);
    lists.push(cuts);
  }
  item.append(...lists);
  return item;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {string} path
 * @param {string} failing
 * @returns {Promise<{ reply: unknown } | { text: string }>}
 */
async function fetchReply(path, failing) {
  /** @type {Response} */
  let response;
  /** @type {unknown} */
  let reply;
  try {
    response = await fetch(path);
    reply = response.ok ? await response.json() : await response.json().catch(() => null);
  } catch {
    return { text: "Couldn't reach the API." };
  }
  if (response.ok) return { reply };
  const error = isObject(reply) && typeof reply.error === "string" ? reply.error : `the API replied ${response.status}`;
  return { text: `${failing}: ${error}.` };
}

/**
 * @param {unknown} part
 * @returns {boolean}
 */
function isNamedCount(part) {
  return isObject(part) && typeof part.name === "string" && typeof part.count === "number";
}

/**
 * @param {unknown} reply
 * @returns {reply is DealCuts}
 */
function isDealCuts(reply) {
  if (!isObject(reply) || typeof reply.asWatched !== "number" || !Array.isArray(reply.without) || !isObject(reply.wordsAlone)) return false;
  const alone = reply.wordsAlone;
  const cutsOk = reply.without.every((cut) => isObject(cut) && typeof cut.filter === "string" && typeof cut.total === "number" && Array.isArray(cut.by) && cut.by.every(isNamedCount));
  const last = reply.lastCheck;
  const lastOk = last === undefined || last === null || (isObject(last) && typeof last.at === "string" && typeof last.total === "number" && typeof last.read === "number" && typeof last.complete === "boolean");
  return cutsOk && lastOk && typeof alone.total === "number" && (alone.categoryId === null || typeof alone.categoryId === "string") && Array.isArray(alone.categories) && alone.categories.every(isNamedCount);
}

/**
 * @param {DealCuts} cuts
 * @returns {string[]}
 */
function cutLines(cuts) {
  const lines = [`As it's set: ${formatCount(cuts.asWatched)} listing${cuts.asWatched === 1 ? "" : "s"}`];
  const last = cuts.lastCheck;
  if (last !== undefined && last !== null) lines.push(`At its last check, ${new Date(last.at).toLocaleString()}: ${formatCount(last.total)}`);
  for (const cut of cuts.without) {
    const by = cut.by.length === 0 ? "" : ` (${cut.by.map((part) => `${part.name} ${formatCount(part.count)}`).join(", ")})`;
    lines.push(`Without ${cut.filter}: ${formatCount(cut.total)}${by}`);
  }
  const alone = cuts.wordsAlone;
  const categories = alone.categories.slice(0, 5).map((category) => `${category.name} ${formatCount(category.count)}`).join(", ");
  const where = [alone.categoryId === null ? "" : `mostly in category ${alone.categoryId}`, categories].filter((part) => part !== "");
  lines.push(`Words alone: ${formatCount(alone.total)}${where.length === 0 ? "" : ` (${where.join("; ")})`}`);
  return lines;
}

/**
 * @param {string} id
 * @param {HTMLButtonElement} button
 * @param {HTMLUListElement} list
 */
function showCutsState(id, button, list) {
  const state = dealCuts.get(id);
  button.disabled = state === "counting";
  button.hidden = Array.isArray(state);
  list.replaceChildren(...(state === undefined ? [] : state === "counting" ? [listItem("Counting, which can take half a minute...")] : state.map(listItem)));
}

/**
 * @param {string} id
 * @returns {{ button: HTMLButtonElement, list: HTMLUListElement } | null}
 */
function cutsRow(id) {
  const button = [...dealsSearches.querySelectorAll("button")].find((element) => element.dataset.cuts === id);
  const list = [...dealsSearches.querySelectorAll("ul")].find((element) => element.dataset.cuts === id);
  return button === undefined || list === undefined ? null : { button, list };
}

/**
 * @param {string} id
 */
async function showCuts(id) {
  dealCuts.set(id, "counting");
  const counting = cutsRow(id);
  if (counting !== null) showCutsState(id, counting.button, counting.list);
  const got = await fetchReply(`/api/deals/searches/${encodeURIComponent(id)}/cuts`, "Couldn't count them");
  const lines = "text" in got ? got.text : isDealCuts(got.reply) ? cutLines(got.reply) : "Couldn't read the API's reply.";
  if (Array.isArray(lines)) dealCuts.set(id, lines);
  else dealCuts.delete(id);
  const row = cutsRow(id);
  if (row === null) return;
  showCutsState(id, row.button, row.list);
  if (!Array.isArray(lines)) row.list.replaceChildren(listItem(lines));
}

/**
 * @param {DealSearch} search
 * @param {HTMLButtonElement} button
 * @param {HTMLUListElement} examples
 */
async function showHiddenExamples(search, button, examples) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/deals/searches/${encodeURIComponent(search.id)}/hidden`);
    if (!response.ok) {
      /** @type {ApiError | null} */
      const body = await response.json().catch(() => null);
      examples.replaceChildren(listItem(`Couldn't load them: ${body?.error ?? `the API replied ${response.status}`}.`));
      button.disabled = false;
      return;
    }
    /** @type {DealHidden} */
    const found = await response.json();
    const reasons = Object.entries(found.examples);
    examples.replaceChildren(...(reasons.length === 0 ? [listItem("Nothing hidden at the last check.")] : reasons.map(([reason, titles]) => listItem(`By ${reason} (${found.hidden[reason] ?? titles.length}): ${titles.join(" | ")}`))));
    button.hidden = true;
  } catch {
    examples.replaceChildren(listItem("Couldn't reach the API."));
    button.disabled = false;
  }
}

/**
 * @param {DealSearch} search
 * @param {HTMLButtonElement} button
 */
async function snoozeDealSearch(search, button) {
  button.disabled = true;
  const path = `/api/deals/searches/${encodeURIComponent(search.id)}/${search.snoozed ? "wake" : "snooze"}`;
  try {
    const response = search.snoozed
      ? await fetch(path, { method: "POST" })
      : await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: 24 }) });
    if (response.ok) {
      await loadDeals();
      return;
    }
    /** @type {ApiError | null} */
    const body = await response.json().catch(() => null);
    dealsStatus.textContent = `Couldn't ${search.snoozed ? "wake" : "snooze"} ${search.name}: ${body?.error ?? `the API replied ${response.status}`}.`;
  } catch {
    dealsStatus.textContent = "Couldn't reach the API.";
  }
  button.disabled = false;
}

/**
 * @param {DealGroup} group
 * @returns {HTMLElement[]}
 */
function dealGroup(group) {
  const heading = document.createElement("h4");
  const sourceName = group.source === "ebay" ? "eBay" : group.source;
  heading.textContent = `${group.name}: ${group.count} on ${sourceName}, checked ${new Date(group.checkedAt).toLocaleTimeString()}`;
  const list = document.createElement("ul");
  const shown = group.listings.slice(0, dealsShownPerSearch);
  list.replaceChildren(...shown.map(dealItem));
  if (group.count > shown.length) list.append(listItem(`And ${group.count - shown.length} more.`));
  return [heading, list];
}

/**
 * @param {DealGroup[]} groups
 * @returns {HTMLLIElement[]}
 */
function bestDeals(groups) {
  const under = groups.flatMap((group) => group.listings.filter((listing) => typeof listing.underGuide === "number" && listing.underGuide > 0).map((listing) => ({ group, listing })));
  under.sort((a, b) => Number(b.listing.great === true) - Number(a.listing.great === true) || (b.listing.underGuide ?? 0) - (a.listing.underGuide ?? 0));
  if (under.length === 0) return [listItem("Nothing under its guide price right now.")];
  return under.slice(0, bestDealsShown).map(({ group, listing }) => {
    const item = dealItem(listing);
    item.prepend(`${listing.great ? "Great deal, " : ""}${group.name}: `);
    return item;
  });
}

/**
 * @param {DealGroup[]} groups
 * @returns {HTMLElement[]}
 */
function partTypeSections(groups) {
  return byPartType(groups).map(([type, found]) => {
    const withMatches = found.filter((group) => group.count > 0);
    const total = withMatches.reduce((sum, group) => sum + group.count, 0);
    const best = Math.max(...found.flatMap((group) => group.listings.map((listing) => listing.underGuide ?? Number.NEGATIVE_INFINITY)));
    const bestText = best > 0 ? `, best ${best}% under guide` : "";
    const empty = found.filter((group) => group.count === 0).map((group) => group.name);
    const contents = withMatches.flatMap(dealGroup);
    if (empty.length > 0) {
      const none = document.createElement("p");
      none.textContent = `No matches: ${empty.join(", ")}.`;
      contents.push(none);
    }
    return dealSection(`matches:${type}`, `${partTypeName(type)}: ${total} match${total === 1 ? "" : "es"} in ${found.length} search${found.length === 1 ? "" : "es"}${bestText}`, contents);
  });
}

/**
 * @param {DealSearch[]} searches
 * @returns {HTMLElement[]}
 */
function searchSections(searches) {
  const on = searches.filter((search) => search.on);
  const sections = byPartType(on).map(([type, found]) => {
    const list = document.createElement("ul");
    list.replaceChildren(...found.map(dealSearchItem));
    const trouble = found.filter((search) => search.problem || (search.notes ?? []).length > 0 || (search.health ?? []).length > 0).length;
    return dealSection(`searches:${type}`, `${partTypeName(type)}: ${found.length} search${found.length === 1 ? "" : "es"}${trouble > 0 ? `, ${trouble} with a problem or note` : ""}`, [list]);
  });
  const all = dealSection("searches", `Searches: ${on.length} switched on`, sections);
  const needing = on.filter((search) => !search.snoozed).map((search) => ({ search, notes: (search.health ?? []).filter((note) => note.kind !== "nothingFound") })).filter(({ notes }) => notes.length > 0);
  if (needing.length === 0) return [all];
  const list = document.createElement("ul");
  list.replaceChildren(...needing.map(({ search, notes }) => listItem(`${search.name}: ${notes.map((note) => note.text).join(" ")}`)));
  return [dealSection("health", `Needs a look: ${needing.length} search${needing.length === 1 ? "" : "es"}`, [list]), all];
}

/**
 * @param {DealStatus} status
 * @returns {string}
 */
function dealSummary(status) {
  const ran = status.lastRun === null ? "Not checked yet." : `Last checked ${new Date(status.lastRun).toLocaleString()}.`;
  const used = `Today: ${status.callsToday} of ${status.callsPerDay} calls, ${status.alertsToday} of ${status.alertsPerDay} alerts.`;
  const parts = [ran, used, ...status.problems.map((problem) => problem.message)];
  if (status.quiet?.now) parts.push(`Quiet hours until ${status.quiet.to}: ${status.quiet.allow === "great" ? "only great deals and ending-soon alerts come through" : "alerts are held"}.`);
  if (status.digest) parts.push(status.digest.sentToday ? `Today's digest has gone; the next is at ${status.digest.at} tomorrow.` : status.digest.skippedToday ? `Today's digest didn't go (quiet hours, or no check in its three hours); the next is at ${status.digest.at} tomorrow.` : `Digest at ${status.digest.at}.`);
  if (status.note !== null) parts.push(status.note);
  return parts.join(" ");
}

async function loadDeals() {
  const [statusResponse, matchesResponse, searchesResponse] = await Promise.all([fetch("/api/deals/status"), fetch(`/api/deals/matches?most=${dealsReadPerSearch}`), fetch("/api/deals/searches")]);
  if (!statusResponse.ok || !matchesResponse.ok) {
    const status = statusResponse.ok ? matchesResponse.status : statusResponse.status;
    dealsStatus.textContent = `Couldn't load the deals: the API replied ${status}.`;
    dealsBest.replaceChildren();
    dealsList.replaceChildren();
    dealsSearches.replaceChildren();
    return;
  }
  /** @type {unknown} */
  const searches = searchesResponse.ok ? await searchesResponse.json() : [];
  dealsSearches.replaceChildren(...searchSections(Array.isArray(searches) ? /** @type {DealSearch[]} */ (searches) : []));
  /** @type {DealStatus} */
  const status = await statusResponse.json();
  /** @type {DealGroup[]} */
  const groups = await matchesResponse.json();
  dealsStatus.textContent = dealSummary(status);
  if (groups.length === 0) {
    dealsBest.replaceChildren();
    dealsList.replaceChildren("Nothing checked in the last six hours.");
    return;
  }
  dealsBest.replaceChildren(...bestDeals(groups));
  dealsList.replaceChildren(...partTypeSections(groups));
}

checkDealsButton.addEventListener("click", async () => {
  checkDealsButton.disabled = true;
  dealsStatus.textContent = "Checking...";
  try {
    const response = await fetch("/api/deals/check", { method: "POST" });
    if (response.ok) {
      /** @type {DealCheck} */
      const result = await response.json();
      await loadDeals();
      const failed = result.failed === 0 ? "" : `, ${result.failed} failed`;
      const unsent = result.unsent ? " Some alerts couldn't be sent and will be tried again." : "";
      dealsStatus.textContent = `Checked ${result.checked} search${result.checked === 1 ? "" : "es"}${failed}, ${result.alerts} alert${result.alerts === 1 ? "" : "s"} sent.${unsent} ${dealsStatus.textContent}`;
    } else {
      /** @type {ApiError | null} */
      const body = await response.json().catch(() => null);
      dealsStatus.textContent = `Couldn't check: ${body?.error ?? `the API replied ${response.status}`}.`;
    }
  } catch {
    dealsStatus.textContent = "Couldn't reach the API.";
  }
  checkDealsButton.disabled = false;
});

/**
 * @param {unknown} reply
 * @returns {reply is DealExplained}
 */
function isDealExplained(reply) {
  if (!isObject(reply) || !isObject(reply.item) || !Array.isArray(reply.searches)) return false;
  const item = reply.item;
  const searchesOk = reply.searches.every((search) => isObject(search) && typeof search.name === "string" && typeof search.says === "string" && Array.isArray(search.reasons) && search.reasons.every((reason) => isObject(reason) && typeof reason.text === "string"));
  return searchesOk && typeof item.title === "string" && typeof item.url === "string" && typeof item.total === "number";
}

/**
 * @param {DealExplained} explained
 * @returns {HTMLLIElement[]}
 */
function explainedItems(explained) {
  const listing = explained.item;
  const first = document.createElement("li");
  first.append(listingLink(listing.title, listing.url));
  const details = [formatMoney(listing.total)];
  if (listing.condition) details.push(listing.condition);
  if (listing.inStock === false) details.push("sold out");
  if (listing.country && listing.country !== "GB") details.push(`in ${listing.country}`);
  first.append(`: ${details.join(", ")}`);
  const items = [first];
  if (typeof listing.note === "string" && listing.note !== "") items.push(listItem(listing.note));
  for (const search of explained.searches) {
    const option = typeof search.option === "string" ? ` (at option: ${search.option})` : "";
    const state = search.on === false ? " (switched off)" : search.snoozed === true ? " (snoozed)" : "";
    const alert = typeof search.alert === "string" && search.alert !== "" ? ` ${search.alert}` : "";
    const item = listItem(`${search.name}${option}${state}: ${search.says}${alert}`);
    if (search.reasons.length > 0) {
      const reasons = document.createElement("ul");
      reasons.replaceChildren(...search.reasons.map((reason) => listItem(`${reason.by === "eBay" ? "eBay" : "Watcher"}: ${reason.text}`)));
      item.append(reasons);
    }
    items.push(item);
  }
  if (explained.searches.length === 0) items.push(listItem("None of the searches have words from its title."));
  const about = document.createElement("small");
  about.textContent = explained.about;
  const last = document.createElement("li");
  last.append(about);
  items.push(last);
  return items;
}

explainForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  explainButton.disabled = true;
  explainResult.replaceChildren(listItem("Reading the listing..."));
  const got = await fetchReply(`/api/deals/explain?item=${encodeURIComponent(explainInput.value)}`, "Couldn't explain it");
  explainResult.replaceChildren(...("text" in got ? [listItem(got.text)] : isDealExplained(got.reply) ? explainedItems(got.reply) : [listItem("Couldn't read the API's reply.")]));
  explainButton.disabled = false;
});

async function checkLogin() {
  const response = await fetch("/api/health");
  if (response.ok) {
    showView(true);
    message.textContent = "Logged in.";
  } else if (response.status === 401) {
    showView(false);
    message.textContent = "Enter your token to log in.";
  } else {
    message.textContent = `The API replied ${response.status}.`;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenInput.value }),
  });
  if (response.ok) {
    tokenInput.value = "";
    showView(true);
    message.textContent = "Logged in.";
  } else if (response.status === 401) {
    message.textContent = "Wrong token.";
  } else {
    message.textContent = `The API replied ${response.status}.`;
  }
});

logoutButton.addEventListener("click", async () => {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (response.ok || response.status === 401) {
    showView(false);
    message.textContent = "Logged out.";
  } else {
    message.textContent = `The API replied ${response.status}.`;
  }
});

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;
  libraryText.textContent = "Starting scan...";
  const response = await fetch("/api/media/library/scan", { method: "POST" });
  if (response.ok) {
    libraryText.textContent = "Scan started. Refresh in a minute for new counts.";
  } else {
    libraryText.textContent = `Couldn't start a scan: the API replied ${response.status}.`;
  }
  scanButton.disabled = false;
});

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (noteText.value.trim() === "") {
    noteStatus.textContent = "Write something first.";
    return;
  }
  sendNoteButton.disabled = true;
  noteStatus.textContent = "Sending...";
  try {
    const response = await fetch("/api/memory/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: noteTitle.value, text: noteText.value }),
    });
    if (response.ok) {
      /** @type {SavedNote} */
      const result = await response.json();
      noteForm.reset();
      noteStatus.textContent = `Saved as ${result.saved}.`;
      if (result.waiting !== undefined) inboxText.textContent = waitingText(result.waiting);
    } else {
      /** @type {ApiError | null} */
      const body = await response.json().catch(() => null);
      const reason = body?.message ?? body?.error ?? `the API replied ${response.status}`;
      noteStatus.textContent = `Couldn't save the note: ${reason}. Your note is still here.`;
    }
  } catch {
    noteStatus.textContent = "Couldn't reach the API. Your note is still here.";
  }
  sendNoteButton.disabled = false;
});

checkLogin();