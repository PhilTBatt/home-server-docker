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
 * @typedef {object} Features
 * @property {boolean} alerts
 * @property {boolean} heartbeat
 * @property {boolean} dailySummary
 * @property {boolean} memoryInbox
 * @property {boolean} memoryUpload
 * @property {boolean} deals
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
 * @property {string[]} [cautions]
 */

/**
 * @typedef {object} DealSearch
 * @property {string} id
 * @property {string} name
 * @property {boolean} on
 * @property {number | null} matches
 * @property {boolean} snoozed
 * @property {string | null} snoozedUntil
 * @property {Record<string, number> | null} hidden
 */

/**
 * @typedef {object} DealGroup
 * @property {string} id
 * @property {string} name
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
const featureLabels = { alerts: "alerts", heartbeat: "heartbeat", dailySummary: "daily summary", memoryInbox: "brain inbox", memoryUpload: "note uploads", deals: "deal watcher" };

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
const dealsList = byId("deals-list");
const dealsSearches = byId("deals-searches");
const checkDealsButton = /** @type {HTMLButtonElement} */ (byId("check-deals"));
const listingLinkStarts = ["https://www.ebay.co.uk/itm/", "https://www.sandbox.ebay.co.uk/itm/"];
/** @type {number | undefined} */ let refreshTimer;

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
 * @param {DealListing} listing
 * @returns {string}
 */
function dealPrice(listing) {
  if (listing.postage === null) return `${formatMoney(listing.price)}, postage not shown`;
  if (listing.postage === 0) return `${formatMoney(listing.price)} with free postage`;
  return `${formatMoney(listing.price)} + ${formatMoney(listing.postage)} postage = ${formatMoney(listing.total)}`;
}

/**
 * @param {DealListing} listing
 * @returns {HTMLLIElement}
 */
function dealItem(listing) {
  const item = document.createElement("li");
  if (listingLinkStarts.some((start) => listing.url.startsWith(start))) {
    const link = document.createElement("a");
    link.href = listing.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = listing.title;
    item.append(link);
  } else {
    item.append(listing.title);
  }
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
 * @param {DealSearch} search
 * @returns {HTMLLIElement}
 */
function dealSearchItem(search) {
  const hidden = Object.values(search.hidden ?? {}).reduce((sum, count) => sum + count, 0);
  const found = search.matches === null ? "not checked yet" : `${search.matches} matching${hidden > 0 ? `, ${hidden} hidden by its rules` : ""}`;
  const until = search.snoozedUntil === null ? "until woken" : `until ${new Date(search.snoozedUntil).toLocaleString()}`;
  const item = listItem(`${search.name}: ${search.snoozed ? `snoozed ${until}` : found}. `);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = search.snoozed ? "Wake" : "Snooze for a day";
  button.addEventListener("click", () => snoozeDealSearch(search, button));
  item.append(button);
  return item;
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
  const heading = document.createElement("h3");
  const sourceName = group.source === "ebay" ? "eBay" : group.source;
  heading.textContent = `${group.name}: ${group.count} on ${sourceName}, checked ${new Date(group.checkedAt).toLocaleTimeString()}`;
  if (group.count === 0) return [heading];
  const list = document.createElement("ul");
  list.replaceChildren(...group.listings.map(dealItem));
  if (group.count > group.listings.length) list.append(listItem(`And ${group.count - group.listings.length} more.`));
  return [heading, list];
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
  if (status.note !== null) parts.push(status.note);
  return parts.join(" ");
}

async function loadDeals() {
  const [statusResponse, matchesResponse, searchesResponse] = await Promise.all([fetch("/api/deals/status"), fetch("/api/deals/matches"), fetch("/api/deals/searches")]);
  if (!statusResponse.ok || !matchesResponse.ok) {
    const status = statusResponse.ok ? matchesResponse.status : statusResponse.status;
    dealsStatus.textContent = `Couldn't load the deals: the API replied ${status}.`;
    dealsList.replaceChildren();
    dealsSearches.replaceChildren();
    return;
  }
  /** @type {unknown} */
  const searches = searchesResponse.ok ? await searchesResponse.json() : [];
  dealsSearches.replaceChildren(...(Array.isArray(searches) ? /** @type {DealSearch[]} */ (searches) : []).filter((search) => search.on).map(dealSearchItem));
  /** @type {DealStatus} */
  const status = await statusResponse.json();
  /** @type {DealGroup[]} */
  const groups = await matchesResponse.json();
  dealsStatus.textContent = dealSummary(status);
  if (groups.length === 0) {
    dealsList.replaceChildren("Nothing checked in the last six hours.");
    return;
  }
  dealsList.replaceChildren(...groups.flatMap(dealGroup));
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