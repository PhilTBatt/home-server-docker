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
 * @property {boolean} watchers
 * @property {boolean} catchUp
 * @property {boolean} modes
 * @property {boolean} [reminders]
 * @property {boolean} [chores]
 * @property {boolean} [sessions]
 * @property {boolean} [spotify]
 * @property {boolean} [talk]
 */

/**
 * @typedef {object} TalkView
 * @property {string} id
 * @property {"waiting" | "taken" | "heard" | "asking" | "answered" | "failed"} state
 * @property {string | null} heard
 * @property {string | null} text
 * @property {string | null} question
 * @property {number} asks
 * @property {boolean} voiceComing
 * @property {boolean} voice
 */

/**
 * @typedef {object} TrainLeg
 * @property {string} leaves
 * @property {string} expected
 * @property {string | null} platform
 * @property {boolean} cancelled
 */

/**
 * @typedef {object} ReminderItem
 * @property {string} text
 * @property {string | null} at
 * @property {string | null} snoozedTo
 */

/**
 * @typedef {object} PlayingNow
 * @property {boolean} playing
 * @property {{ name: string, by: string[] } | null} item
 * @property {{ name: string } | null} device
 */

/**
 * @typedef {object} ModeNow
 * @property {string} mode
 * @property {string} since
 * @property {string | null} until
 * @property {string} by
 * @property {number} held
 * @property {boolean} spotify
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
 * @typedef {object} Watcher
 * @property {string} id
 * @property {string} what
 * @property {string} expiresAt
 * @property {{ at: string, ok: boolean } | null} lastCheck
 * @property {boolean} waitingToSend
 */

/**
 * @typedef {object} WatcherList
 * @property {number} most
 * @property {Watcher[]} watchers
 */

/**
 * @typedef {object} CatchUpCommit
 * @property {string} at
 * @property {string} message
 */

/**
 * @typedef {object} CatchUpRepo
 * @property {string} repo
 * @property {number} [count]
 * @property {boolean} [more]
 * @property {{ day: string, commits: CatchUpCommit[] }[]} [days]
 * @property {string} [failed]
 */

/**
 * @typedef {object} CatchUpReport
 * @property {string} summary
 * @property {CatchUpRepo[]} repos
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
const featureLabels = { alerts: "alerts", heartbeat: "heartbeat", dailySummary: "daily summary", memoryInbox: "brain inbox", memoryUpload: "note uploads", deals: "deal watcher", findPhone: "find my phone", trains: "train times", trainAlerts: "train alerts", expiryAlerts: "expiry alerts", watchers: "watchers", catchUp: "catch-up", modes: "modes", spotify: "Spotify", talk: "talk to Jarvis", wall: "the wall" };

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
const watchersSection = byId("watchers");
const watchersList = byId("watchers-list");
const catchUpSection = byId("catch-up");
const catchUpSummary = byId("catch-up-summary");
const catchUpRepos = byId("catch-up-repos");
const modeSection = byId("mode");
const modeNow = byId("mode-now");
const modeButtons = byId("mode-buttons");
const loginView = byId("login-view");
const homeStatus = byId("home-status");
const findPhoneButton = /** @type {HTMLButtonElement} */ (byId("find-phone"));
const openNoteButton = /** @type {HTMLButtonElement} */ (byId("open-note"));
const noteDialog = /** @type {HTMLDialogElement} */ (byId("note-dialog"));
const closeNoteButton = byId("close-note");
const ringButton = byId("ring");
const ringTitle = byId("ring-title");
const ringSub = byId("ring-sub");
const ringServices = byId("ring-services");
const ringBackup = byId("ring-backup");
const ringAlerts = byId("ring-alerts");
const ringServicesText = byId("ring-services-text");
const ringBackupText = byId("ring-backup-text");
const ringAlertsText = byId("ring-alerts-text");
const ringDiskText = byId("ring-disk-text");
const trainCard = byId("train-card");
const trainTime = byId("train-time");
const trainTo = byId("train-to");
const trainState = byId("train-state");
const remindersCard = byId("reminders-card");
const remindersList = byId("reminders-list");
const spotifyCard = byId("spotify-card");
const spotifyNow = byId("spotify-now");
const nowPlaying = byId("now-playing");
const playingTitle = byId("playing-title");
const playingDevice = byId("playing-device");
const playingPause = /** @type {HTMLButtonElement} */ (byId("playing-pause"));
const playingNext = /** @type {HTMLButtonElement} */ (byId("playing-next"));
const tabButtons = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll(".tabs button[data-tab]")]);
const talkButton = /** @type {HTMLButtonElement} */ (byId("talk"));
const talkSheet = byId("talk-sheet");
const talkStatus = byId("talk-status");
const talkHeard = byId("talk-heard");
const talkAnswer = byId("talk-answer");
const talkAsking = byId("talk-asking");
const talkQuestion = byId("talk-question");
const talkYes = /** @type {HTMLButtonElement} */ (byId("talk-yes"));
const talkNo = /** @type {HTMLButtonElement} */ (byId("talk-no"));
const talkPlay = /** @type {HTMLButtonElement} */ (byId("talk-play"));
const talkClose = byId("talk-close");
const talkRate = 16_000;
const talkMostMs = 30_000;
const talkLeastMs = 400;
const talkPollMs = 700;
const talkGiveUpMs = 7 * 60_000;
const talkMostMisses = 3;
/** @type {{ attempt: number, asks: number, misses: number, context: AudioContext | null, worklet: boolean, stream: MediaStream | null, source: MediaStreamAudioSourceNode | null, node: AudioWorkletNode | null, mute: GainNode | null, chunks: Float32Array[], holding: boolean, startedAt: number, stopTimer: number | undefined, id: string | null, since: number, pollTimer: number | undefined, played: boolean, voice: AudioBuffer | null, playing: AudioBufferSourceNode | null }} */
const talking = { attempt: 0, asks: 0, misses: 0, context: null, worklet: false, stream: null, source: null, node: null, mute: null, chunks: [], holding: false, startedAt: 0, stopTimer: undefined, id: null, since: 0, pollTimer: undefined, played: false, voice: null, playing: null };
/** @type {[string, string][]} */
const modeChoices = [["normal", "Normal"], ["guest", "Guest"], ["bedtime", "Bedtime"], ["gaming", "Gaming"], ["coding", "Coding"], ["away", "Away"]];
/** @type {Record<string, { colour: string, paths: string }>} */
const modeIcons = {
  normal: { colour: "currentColor", paths: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"></path>' },
  guest: { colour: "#5EE3B0", paths: '<circle cx="9" cy="8" r="3"></circle><path d="M3 20a6 6 0 0 1 12 0"></path><path d="M17 11v6M14 14h6"></path>' },
  bedtime: { colour: "#8FA8FF", paths: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"></path>' },
  gaming: { colour: "#FF9F5A", paths: '<rect x="2" y="7" width="20" height="11" rx="5"></rect><path d="M7 10.5v4M5 12.5h4M16 11.5h.01M18 13.5h.01"></path>' },
  coding: { colour: "#F5D547", paths: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"></path>' },
  away: { colour: "#C9D4E0", paths: '<path d="M3 12h13M12 7l5 5-5 5"></path><path d="M20 4v16"></path>' },
};
const ringLength = 502.65;
const ringParts = { services: [0, 200], backup: [218, 130], alerts: [366, 118.65] };
const ringColours = { services: "#5EE3B0", backup: "#8FA8FF", alerts: "#F5D547", problem: "#FF9F5A", unknown: "#3A4A63" };
/** @type {{ services: "ok" | "problem" | "unknown", backup: "ok" | "problem" | "unknown", alerts: "ok" | "problem" | "unknown", worst: string | null, doctor: "ok" | "warn" | "problem" | null }} */
const ringState = { services: "unknown", backup: "unknown", alerts: "unknown", worst: null, doctor: null };
/** @type {Features | null} */ let knownFeatures = null;
/** @type {number | undefined} */ let homeTimer;
/** @type {number | undefined} */ let phoneRingingTimer;
let lastTrainAt = 0;
const trainEveryMs = 120_000;
const tabNames = ["home", "media", "deals", "server"];
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
  loginView.hidden = loggedIn;
  dashboard.hidden = !loggedIn;
  clearInterval(refreshTimer);
  clearInterval(homeTimer);

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
    homeTimer = setInterval(refreshHome, 30_000);
    showTab(tabFromHash());
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
  ringDiskText.textContent = status.diskTotalGB > 0 ? `${Math.round((status.diskAvailableGB / status.diskTotalGB) * 100)}%` : "-";
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
  ringState.backup = backup.lastRun === null ? "unknown" : backup.lastRun.problem === null ? "ok" : "problem";
  ringBackupText.textContent = backup.lastRun === null ? "never" : new Date(backup.lastRun.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  showRing();
}

async function loadAlerts() {
  const response = await fetch("/api/system/alerts");
  if (!response.ok) {
    alertsList.replaceChildren(listItem(`Couldn't load alerts: the API replied ${response.status}.`));
    return;
  }
  /** @type {Alerts} */
  const alerts = await response.json();
  ringState.alerts = alerts.ok ? "ok" : "problem";
  ringAlertsText.textContent = String(alerts.ok ? 0 : alerts.problems.length);
  showRing();
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
  const counted = got.reply.checks.filter((check) => check.state !== "off");
  const bad = counted.filter((check) => check.state === "problem" || check.state === "warn");
  ringState.services = bad.length === 0 ? "ok" : "problem";
  ringState.doctor = got.reply.state;
  ringState.worst = bad.length === 0 ? null : (bad.find((check) => check.state === "problem") ?? bad[0]).name;
  ringServicesText.textContent = `${counted.length - bad.length}/${counted.length}`;
  showRing();
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
  showWatchers(features);
  showCatchUp(features);
  showMode(features);
  showHome(features);
}

/**
 * @param {Features} features
 */
function showBrain(features) {
  brainSection.hidden = !features.memoryInbox && !features.memoryUpload;
  openNoteButton.hidden = brainSection.hidden;
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
function showWatchers(features) {
  watchersSection.hidden = !features.watchers;
  if (features.watchers) loadWatchers();
}

/**
 * @param {Watcher} watcher
 * @returns {string}
 */
function watcherText(watcher) {
  const until = new Date(watcher.expiresAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const state = watcher.waitingToSend ? "; it happened, and the notification will be tried again" : watcher.lastCheck?.ok === false ? "; the last check couldn't read it" : "";
  return `${watcher.what[0].toUpperCase()}${watcher.what.slice(1)}, until ${until}${state}. `;
}

/**
 * @param {Watcher} watcher
 * @returns {HTMLLIElement}
 */
function watcherItem(watcher) {
  const item = listItem(watcherText(watcher));
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Cancel";
  button.addEventListener("click", () => cancelWatcher(watcher, button));
  item.append(button);
  return item;
}

async function loadWatchers() {
  const got = await fetchReply("/api/watchers", "Couldn't load what's being watched");
  if ("text" in got) {
    watchersList.replaceChildren(listItem(got.text));
    return;
  }
  const list = /** @type {WatcherList} */ (got.reply);
  watchersList.replaceChildren(...(list.watchers.length === 0 ? [listItem("Nothing. Ask Claude or Jarvis to tell you when something happens.")] : list.watchers.map(watcherItem)));
}

/**
 * @param {Watcher} watcher
 * @param {HTMLButtonElement} button
 */
async function cancelWatcher(watcher, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/watchers/${encodeURIComponent(watcher.id)}`, { method: "DELETE" });
    if (response.ok || response.status === 404) {
      await loadWatchers();
      return;
    }
    /** @type {ApiError | null} */
    const body = await response.json().catch(() => null);
    watchersList.prepend(listItem(`Couldn't cancel it: ${body?.error ?? `the API replied ${response.status}`}.`));
  } catch {
    watchersList.prepend(listItem("Couldn't reach the API."));
  }
  button.disabled = false;
}

/**
 * @param {Features} features
 */
function showCatchUp(features) {
  catchUpSection.hidden = !features.catchUp;
  if (features.catchUp) loadCatchUp();
}

/**
 * @param {unknown} reply
 * @returns {reply is CatchUpReport}
 */
function isCatchUpReport(reply) {
  return isObject(reply) && typeof reply.summary === "string" && Array.isArray(reply.repos) && reply.repos.every((repo) => isObject(repo) && typeof repo.repo === "string" && (typeof repo.failed === "string" || (typeof repo.count === "number" && Array.isArray(repo.days))));
}

/**
 * @param {CatchUpRepo} repo
 * @returns {string}
 */
function catchUpText(repo) {
  if (repo.failed !== undefined) return `${repo.repo}: couldn't read it: ${repo.failed}.`;
  const latest = repo.days?.[0]?.commits[0];
  if (latest === undefined) return `${repo.repo}: no commits.`;
  const count = `${repo.more ? "at least " : ""}${repo.count} commit${repo.count === 1 ? "" : "s"}`;
  return `${repo.repo}: ${count}, the latest ${new Date(latest.at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: ${latest.message}`;
}

async function loadCatchUp() {
  const got = await fetchReply("/api/catch-up", "Couldn't catch up");
  if ("text" in got) {
    catchUpSummary.textContent = got.text;
    catchUpRepos.replaceChildren();
    return;
  }
  if (!isCatchUpReport(got.reply)) {
    catchUpSummary.textContent = "Couldn't read the API's reply.";
    catchUpRepos.replaceChildren();
    return;
  }
  catchUpSummary.textContent = got.reply.summary;
  catchUpRepos.replaceChildren(...got.reply.repos.map((repo) => listItem(catchUpText(repo))));
}

/**
 * @param {Features} features
 */
function showMode(features) {
  modeSection.hidden = !features.modes;
  if (features.modes) loadMode();
}

/**
 * @param {unknown} reply
 * @returns {reply is ModeNow}
 */
function isModeNow(reply) {
  return isObject(reply) && typeof reply.mode === "string" && typeof reply.since === "string" && (reply.until === null || typeof reply.until === "string") && typeof reply.by === "string" && typeof reply.held === "number";
}

/**
 * @param {ModeNow} now
 * @returns {string}
 */
function modeText(now) {
  const time = (/** @type {string} */ iso) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const by = now.by === "start" ? "since the API started" : now.by === "schedule" ? "set on a timer" : `set by ${now.by}`;
  const until = now.until === null ? "" : `, until ${time(now.until)}`;
  const held = now.held === 0 ? "" : ` ${now.held} phone alert${now.held === 1 ? " is" : "s are"} held until bedtime ends.`;
  return `${now.mode[0].toUpperCase()}${now.mode.slice(1)} since ${time(now.since)}${until} (${by}).${held}`;
}

/**
 * @param {string} mode
 * @param {string} label
 * @param {boolean} current
 * @returns {HTMLButtonElement}
 */
function modeButton(mode, label, current) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-pressed", String(current));
  const icon = modeIcons[mode];
  if (icon !== undefined) {
    const holder = document.createElement("span");
    holder.setAttribute("aria-hidden", "true");
    holder.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${icon.colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.paths}</svg>`;
    button.append(holder.firstElementChild ?? holder);
  }
  button.append(label);
  button.disabled = current;
  button.addEventListener("click", () => setMode(mode));
  return button;
}

/**
 * @param {ModeNow} now
 */
function showModeNow(now) {
  modeNow.textContent = modeText(now);
  modeButtons.replaceChildren(...modeChoices.map(([mode, label]) => modeButton(mode, label, now.mode === mode)));
}

async function loadMode() {
  const got = await fetchReply("/api/mode", "Couldn't load the mode");
  if ("text" in got) {
    modeNow.textContent = got.text;
    modeButtons.replaceChildren();
    return;
  }
  if (!isModeNow(got.reply)) {
    modeNow.textContent = "Couldn't read the API's reply.";
    return;
  }
  showModeNow(got.reply);
}

/**
 * @param {string} mode
 */
async function setMode(mode) {
  for (const button of modeButtons.querySelectorAll("button")) button.disabled = true;
  try {
    const response = await fetch("/api/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, by: "phone" }) });
    /** @type {unknown} */
    const reply = await response.json().catch(() => null);
    if (response.ok && isModeNow(reply)) {
      showModeNow(reply);
      return;
    }
    const error = isObject(reply) && typeof reply.error === "string" ? reply.error : `the API replied ${response.status}`;
    modeNow.textContent = `Couldn't switch the mode: ${error}.`;
  } catch {
    modeNow.textContent = "Couldn't reach the API.";
  }
  await loadMode();
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

/**
 * @returns {string}
 */
function tabFromHash() {
  const asked = location.hash.slice(1);
  return tabNames.includes(asked) ? asked : "home";
}

/**
 * @param {string} name
 */
function showTab(name) {
  for (const button of tabButtons) {
    const chosen = button.dataset.tab === name;
    if (chosen) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    byId(`tab-${button.dataset.tab}`).hidden = !chosen;
  }
  const hash = name === "home" ? "" : `#${name}`;
  if (location.hash !== hash) history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  window.scrollTo(0, 0);
  if (name === "home") refreshHome();
}

/**
 * @param {"services" | "backup" | "alerts"} part
 * @returns {string}
 */
function ringColour(part) {
  const state = ringState[part];
  return state === "ok" ? ringColours[part] : state === "problem" ? ringColours.problem : ringColours.unknown;
}

function showRing() {
  /** @type {["services" | "backup" | "alerts", HTMLElement, HTMLElement][]} */
  const parts = [["services", ringServices, ringServicesText], ["backup", ringBackup, ringBackupText], ["alerts", ringAlerts, ringAlertsText]];
  for (const [part, segment, text] of parts) {
    segment.setAttribute("stroke", ringColour(part));
    text.parentElement?.querySelector(".dot")?.classList.toggle("problem", ringState[part] === "problem");
  }
  const states = [ringState.services, ringState.backup, ringState.alerts];
  if (states.includes("problem")) {
    ringTitle.textContent = "Needs a look";
    ringSub.textContent = ringState.worst ?? (ringState.backup === "problem" ? "Backup failed" : ringState.alerts === "problem" ? "Alerts are up" : "Tap for details");
  } else if (states.includes("unknown")) {
    ringTitle.textContent = "Checking";
    ringSub.textContent = "Tap for details";
  } else {
    ringTitle.textContent = "All good";
    ringSub.textContent = "Tap for details";
  }
}

/**
 * @param {Features} features
 */
function showHome(features) {
  knownFeatures = features;
  findPhoneButton.hidden = !features.findPhone;
  trainCard.hidden = !features.trains;
  remindersCard.hidden = features.reminders !== true;
  spotifyCard.hidden = features.spotify !== true;
  talkButton.hidden = features.talk !== true;
  if (features.spotify !== true) nowPlaying.hidden = true;
  lastTrainAt = 0;
  refreshHome();
}

function refreshHome() {
  if (document.hidden || knownFeatures === null || dashboard.hidden) return;
  if (knownFeatures.spotify === true) loadPlaying();
  if (knownFeatures.talk === true) loadTalkStatus();
  if (byId("tab-home").hidden) return;
  if (knownFeatures.reminders === true) loadReminders();
  if (knownFeatures.trains && Date.now() - lastTrainAt >= trainEveryMs) {
    lastTrainAt = Date.now();
    loadTrain();
  }
}

/**
 * @param {unknown} leg
 * @returns {leg is TrainLeg}
 */
function isTrainLeg(leg) {
  return isObject(leg) && typeof leg.expected === "string" && typeof leg.cancelled === "boolean" && (leg.platform === null || typeof leg.platform === "string") && (typeof leg.leaves === "string" || typeof leg.due === "string");
}

/**
 * @param {unknown} reply
 * @returns {{ to: string, legs: TrainLeg[] } | null}
 */
function trainLegs(reply) {
  if (!isObject(reply) || typeof reply.to !== "string") return null;
  if (Array.isArray(reply.journeys)) return reply.journeys.every(isTrainLeg) ? { to: reply.to, legs: reply.journeys } : null;
  if (!Array.isArray(reply.departures)) return null;
  const legs = reply.departures.map((departure) => (isObject(departure) ? { ...departure, leaves: departure.due } : departure));
  return legs.every(isTrainLeg) ? { to: reply.to, legs } : null;
}

/**
 * @param {TrainLeg} leg
 * @returns {{ text: string, late: boolean }}
 */
function trainStateText(leg) {
  if (leg.cancelled) return { text: "Cancelled", late: true };
  if (leg.expected === "On time") return { text: "On time", late: false };
  if (/^\d\d:\d\d$/.test(leg.expected)) return { text: `Expected ${leg.expected}`, late: true };
  return { text: leg.expected, late: true };
}

async function loadTrain() {
  const got = await fetchReply("/api/trains", "Couldn't load the trains");
  if ("text" in got) {
    trainTime.textContent = "-";
    trainTo.textContent = got.text;
    trainState.textContent = "";
    return;
  }
  const read = trainLegs(got.reply);
  if (read === null) {
    trainTime.textContent = "-";
    trainTo.textContent = "Couldn't read the API's reply.";
    trainState.textContent = "";
    return;
  }
  const leg = read.legs[0];
  if (leg === undefined) {
    trainTime.textContent = "-";
    trainTo.textContent = `No trains to ${read.to} listed right now.`;
    trainState.textContent = "";
    return;
  }
  const state = trainStateText(leg);
  trainTime.textContent = leg.leaves;
  trainTo.textContent = leg.platform === null ? `To ${read.to}` : `To ${read.to}, platform ${leg.platform}`;
  trainState.textContent = state.text;
  trainState.classList.toggle("late", state.late);
}

/**
 * @param {unknown} reminder
 * @returns {reminder is ReminderItem}
 */
function isReminderItem(reminder) {
  return isObject(reminder) && typeof reminder.text === "string" && (reminder.at === null || typeof reminder.at === "string") && (reminder.snoozedTo === null || typeof reminder.snoozedTo === "string");
}

/**
 * @param {Date} when
 * @returns {string}
 */
function reminderTime(when) {
  const today = when.toDateString() === new Date().toDateString();
  return today ? when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : when.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

async function loadReminders() {
  const got = await fetchReply("/api/reminders", "Couldn't load the reminders");
  if ("text" in got) {
    remindersList.replaceChildren(listItem(got.text));
    return;
  }
  if (!isObject(got.reply) || !Array.isArray(got.reply.reminders) || !got.reply.reminders.every(isReminderItem)) {
    remindersList.replaceChildren(listItem("Couldn't read the API's reply."));
    return;
  }
  /** @type {ReminderItem[]} */
  const reminders = got.reply.reminders;
  const coming = reminders
    .map((reminder) => ({ text: reminder.text, at: reminder.snoozedTo ?? reminder.at }))
    .filter((reminder) => reminder.at !== null)
    .map((reminder) => ({ text: reminder.text, when: new Date(/** @type {string} */ (reminder.at)) }))
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .slice(0, 3);
  if (coming.length === 0) {
    remindersList.replaceChildren(listItem("Nothing coming up."));
    return;
  }
  remindersList.replaceChildren(
    ...coming.map((reminder) => {
      const item = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = reminder.text;
      const when = document.createElement("span");
      when.className = reminder.when.getTime() - Date.now() < 60 * 60 * 1000 ? "when soon" : "when";
      when.textContent = reminderTime(reminder.when);
      item.append(text, when);
      return item;
    }),
  );
}

/**
 * @param {unknown} reply
 * @returns {reply is PlayingNow}
 */
function isPlayingNow(reply) {
  if (!isObject(reply) || typeof reply.playing !== "boolean") return false;
  const item = reply.item;
  const device = reply.device;
  const itemOk = item === null || (isObject(item) && typeof item.name === "string" && Array.isArray(item.by) && item.by.every((name) => typeof name === "string"));
  const deviceOk = device === null || (isObject(device) && typeof device.name === "string");
  return itemOk && deviceOk;
}

async function loadPlaying() {
  const got = await fetchReply("/api/spotify/playing", "Couldn't check Spotify");
  if ("text" in got || !isPlayingNow(got.reply)) {
    nowPlaying.hidden = true;
    spotifyNow.textContent = "text" in got ? got.text : "Couldn't read the API's reply.";
    return;
  }
  const playing = got.reply;
  const item = playing.item;
  const words = item === null ? "" : item.by.length === 0 ? item.name : `${item.name} - ${item.by.join(", ")}`;
  spotifyNow.textContent = item === null ? "Nothing playing." : `${playing.playing ? "Playing" : "Paused"}: ${words}`;
  nowPlaying.hidden = !playing.playing || item === null;
  playingTitle.textContent = words;
  playingDevice.textContent = playing.device === null ? "" : `On ${playing.device.name}`;
}

/**
 * @param {"pause" | "next"} action
 * @param {HTMLButtonElement} button
 */
async function controlPlaying(action, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/spotify/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!response.ok) {
      /** @type {unknown} */
      const reply = await response.json().catch(() => null);
      const error = isObject(reply) && typeof reply.error === "string" ? reply.error : `the API replied ${response.status}`;
      homeStatus.textContent = `Couldn't ${action === "pause" ? "pause" : "skip"}: ${error}.`;
    }
  } catch {
    homeStatus.textContent = "Couldn't reach the API.";
  }
  button.disabled = false;
  setTimeout(loadPlaying, 600);
}

async function findPhone() {
  findPhoneButton.disabled = true;
  const ringing = phoneRingingTimer !== undefined;
  try {
    const response = await fetch(ringing ? "/api/phone/found" : "/api/phone/find", { method: "POST" });
    /** @type {unknown} */
    const reply = await response.json().catch(() => null);
    if (!response.ok) {
      const error = isObject(reply) && typeof reply.error === "string" ? reply.error : `the API replied ${response.status}`;
      homeStatus.textContent = `Couldn't ${ringing ? "stop it" : "find the phone"}: ${error}.`;
    } else if (ringing) {
      clearTimeout(phoneRingingTimer);
      phoneRingingTimer = undefined;
      findPhoneButton.setAttribute("aria-label", "Find my phone");
      homeStatus.textContent = "Stopped ringing.";
    } else if (isObject(reply) && typeof reply.seconds === "number") {
      homeStatus.textContent = "Ringing the phone. Tap the phone button again to stop it.";
      findPhoneButton.setAttribute("aria-label", "Stop ringing");
      phoneRingingTimer = setTimeout(() => {
        phoneRingingTimer = undefined;
        findPhoneButton.setAttribute("aria-label", "Find my phone");
      }, reply.seconds * 1000);
    } else {
      homeStatus.textContent = "Sent to the phone.";
    }
  } catch {
    homeStatus.textContent = "Couldn't reach the API.";
  }
  findPhoneButton.disabled = false;
}

for (const button of tabButtons) button.addEventListener("click", () => showTab(button.dataset.tab ?? "home"));

async function loadTalkStatus() {
  const got = await fetchReply("/api/talk/status", "Couldn't check on Jarvis");
  const running = !("text" in got) && isObject(got.reply) && got.reply.jarvis === true;
  talkButton.classList.toggle("asleep", !running);
  talkButton.setAttribute("aria-label", running ? "Hold to talk to Jarvis" : "Hold to talk to Jarvis, who isn't running right now");
}

/**
 * @param {unknown} reply
 * @returns {reply is TalkView}
 */
function isTalkView(reply) {
  const text = (/** @type {unknown} */ value) => value === null || typeof value === "string";
  return isObject(reply) && typeof reply.id === "string" && ["waiting", "taken", "heard", "asking", "answered", "failed"].includes(String(reply.state)) && text(reply.heard) && text(reply.text) && text(reply.question) && typeof reply.asks === "number" && typeof reply.voiceComing === "boolean" && typeof reply.voice === "boolean";
}

/**
 * @param {Float32Array[]} chunks
 * @param {number} fromRate
 * @returns {Int16Array<ArrayBuffer>}
 */
function toPcm16(chunks, fromRate) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const all = new Float32Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  const step = fromRate / talkRate;
  const pcm = new Int16Array(Math.floor(total / step));
  for (let index = 0; index < pcm.length; index++) {
    const start = Math.floor(index * step);
    const end = Math.max(start + 1, Math.min(total, Math.floor((index + 1) * step)));
    let sum = 0;
    for (let sample = start; sample < end; sample++) sum += all[sample];
    pcm[index] = Math.round(Math.max(-1, Math.min(1, sum / (end - start))) * 0x7fff);
  }
  return pcm;
}

function stopTalkPolling() {
  clearTimeout(talking.pollTimer);
  talking.pollTimer = undefined;
  talking.id = null;
}

function stopVoice() {
  try {
    talking.playing?.stop();
  } catch {}
  talking.playing = null;
}

function releaseMicrophone() {
  if (talking.node !== null) talking.node.port.onmessage = null;
  talking.source?.disconnect();
  talking.node?.disconnect();
  talking.mute?.disconnect();
  for (const track of talking.stream?.getTracks() ?? []) track.stop();
  talking.stream = null;
  talking.source = null;
  talking.node = null;
  talking.mute = null;
  talkButton.classList.remove("recording");
}

/**
 * @param {string} status
 */
function openTalk(status) {
  talkSheet.hidden = false;
  talkStatus.textContent = status;
}

function clearTalk() {
  stopTalkPolling();
  stopVoice();
  talking.voice = null;
  talking.played = false;
  talking.asks = 0;
  talking.misses = 0;
  talkQuestion.textContent = "";
  talkHeard.hidden = true;
  talkAnswer.hidden = true;
  talkAsking.hidden = true;
  talkPlay.hidden = true;
}

function wakeSound() {
  if (talkButton.hidden || typeof AudioContext === "undefined") return;
  talking.context ??= new AudioContext();
  talking.context.resume().catch(() => {});
}

async function startTalking() {
  if (talking.holding) return;
  talking.holding = true;
  const attempt = ++talking.attempt;
  const current = () => talking.attempt === attempt && talking.holding;
  clearTalk();
  if (!window.isSecureContext || navigator.mediaDevices?.getUserMedia === undefined || typeof AudioWorkletNode === "undefined") {
    talking.holding = false;
    openTalk("Talking needs the secure address: open https://hub.home on this phone.");
    return;
  }
  if (talkButton.classList.contains("asleep")) {
    talking.holding = false;
    openTalk("Jarvis isn't running on the server right now, so there's no one to hear it.");
    loadTalkStatus();
    return;
  }
  openTalk("Getting the microphone...");
  /** @type {MediaStream | null} */
  let stream = null;
  try {
    wakeSound();
    const context = /** @type {AudioContext} */ (talking.context);
    if (!talking.worklet) {
      await context.audioWorklet.addModule("talk-worklet.js");
      talking.worklet = true;
    }
    if (!current()) {
      if (talking.attempt === attempt) talkStatus.textContent = "Hold the button while you talk, then let go.";
      return;
    }
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!current()) {
      for (const track of stream.getTracks()) track.stop();
      if (talking.attempt === attempt) talkStatus.textContent = "The microphone's ready: hold the button while you talk, then let go.";
      return;
    }
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "talk-recorder");
    const mute = context.createGain();
    mute.gain.value = 0;
    talking.chunks = [];
    node.port.onmessage = (event) => {
      if (talking.node === node) talking.chunks.push(event.data);
    };
    source.connect(node);
    node.connect(mute);
    mute.connect(context.destination);
    Object.assign(talking, { stream, source, node, mute, startedAt: performance.now() });
    talking.stopTimer = setTimeout(() => {
      if (talking.attempt === attempt) finishTalking();
    }, talkMostMs - 250);
    talkButton.classList.add("recording");
    navigator.vibrate?.(15);
    talkStatus.textContent = "Listening: let go to send.";
  } catch (error) {
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (talking.attempt !== attempt) return;
    talking.holding = false;
    releaseMicrophone();
    const name = error instanceof Error ? error.name : "";
    talkStatus.textContent = name === "NotAllowedError" ? "The microphone isn't allowed: allow it for hub.home in the browser's site settings." : `Couldn't start the microphone: ${error instanceof Error ? error.message : String(error)}.`;
  }
}

async function finishTalking() {
  if (!talking.holding) return;
  talking.holding = false;
  clearTimeout(talking.stopTimer);
  const context = talking.context;
  if (talking.node === null || context === null) return;
  const chunks = talking.chunks;
  talking.chunks = [];
  const heldMs = performance.now() - talking.startedAt;
  releaseMicrophone();
  if (heldMs < talkLeastMs) {
    talkStatus.textContent = "Hold the button while you talk, then let go.";
    return;
  }
  if (chunks.length === 0) {
    talkStatus.textContent = "Nothing was recorded: the browser hadn't let the page use sound yet. Hold the button again.";
    return;
  }
  const pcm = toPcm16(chunks, context.sampleRate);
  talkStatus.textContent = "Sending...";
  try {
    const response = await fetch("/api/talk", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: pcm.buffer });
    /** @type {unknown} */
    const reply = await response.json().catch(() => null);
    if (response.status !== 202 || !isObject(reply) || typeof reply.id !== "string") {
      const error = isObject(reply) && typeof reply.error === "string" ? reply.error : `the API replied ${response.status}`;
      talkStatus.textContent = `Couldn't send it: ${error}.`;
      if (response.status === 503) talkButton.classList.add("asleep");
      return;
    }
    talkButton.classList.remove("asleep");
    talking.id = reply.id;
    talking.since = Date.now();
    talkStatus.textContent = "Waiting for Jarvis to pick it up...";
    talking.pollTimer = setTimeout(pollTalk, talkPollMs);
  } catch {
    talkStatus.textContent = "Couldn't reach the API.";
  }
}

/**
 * @param {TalkView} view
 */
function showTalkView(view) {
  talkHeard.hidden = view.heard === null;
  talkHeard.textContent = view.heard ?? "";
  talkAnswer.hidden = view.text === null;
  talkAnswer.textContent = view.text ?? "";
  talkAsking.hidden = view.state !== "asking";
  if (view.state === "asking" && view.asks !== talking.asks) {
    talking.asks = view.asks;
    talkQuestion.textContent = view.question ?? "";
    talkYes.disabled = false;
    talkNo.disabled = false;
  }
  const words = {
    waiting: "Waiting for Jarvis to pick it up...",
    taken: "Jarvis is listening to it...",
    heard: "Jarvis is thinking...",
    asking: "Jarvis needs a yes or no first:",
    answered: view.voiceComing ? "His voice is on its way..." : "",
    failed: "Jarvis couldn't answer.",
  };
  talkStatus.textContent = words[view.state];
}

async function pollTalk() {
  const id = talking.id;
  if (id === null) return;
  const got = await fetchReply(`/api/talk/${id}`, "Couldn't check on Jarvis");
  if (talking.id !== id) return;
  if ("text" in got || !isTalkView(got.reply)) {
    talking.misses += 1;
    if (talking.misses < talkMostMisses) {
      talking.pollTimer = setTimeout(pollTalk, talkPollMs * 3);
      return;
    }
    talkStatus.textContent = "text" in got ? got.text : "Couldn't read the API's reply.";
    stopTalkPolling();
    return;
  }
  talking.misses = 0;
  const view = got.reply;
  showTalkView(view);
  if (view.voice && !talking.played) {
    talking.played = true;
    playVoice(id);
  }
  const over = view.state === "failed" || (view.state === "answered" && !view.voiceComing);
  if (over) {
    talking.pollTimer = undefined;
    return;
  }
  if (Date.now() - talking.since > talkGiveUpMs) {
    talkStatus.textContent = "Stopped waiting: Jarvis took longer than 7 minutes.";
    stopTalkPolling();
    return;
  }
  talking.pollTimer = setTimeout(pollTalk, talkPollMs);
}

function playBuffer() {
  const context = talking.context;
  if (context === null || talking.voice === null) return;
  stopVoice();
  const source = context.createBufferSource();
  source.buffer = talking.voice;
  source.connect(context.destination);
  source.start();
  talking.playing = source;
}

/**
 * @param {string} id
 */
async function playVoice(id) {
  const context = talking.context;
  if (context === null) return;
  try {
    const response = await fetch(`/api/talk/${id}/voice`);
    if (!response.ok) throw new Error(`the API replied ${response.status}`);
    talking.voice = await context.decodeAudioData(await response.arrayBuffer());
    talkPlay.hidden = false;
    await context.resume();
    if (context.state !== "running") {
      talkPlay.textContent = "Play";
      return;
    }
    talkPlay.textContent = "Play again";
    playBuffer();
  } catch (error) {
    talkStatus.textContent = `Couldn't play his voice: ${error instanceof Error ? error.message : String(error)}.`;
  }
}

/**
 * @param {boolean} yes
 */
async function answerTalk(yes) {
  const id = talking.id;
  if (id === null) return;
  talkYes.disabled = true;
  talkNo.disabled = true;
  try {
    const response = await fetch(`/api/talk/${id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yes }) });
    if (!response.ok) {
      /** @type {unknown} */
      const reply = await response.json().catch(() => null);
      talkStatus.textContent = `Couldn't send your answer: ${isObject(reply) && typeof reply.error === "string" ? reply.error : `the API replied ${response.status}`}.`;
      return;
    }
    talkAsking.hidden = true;
    talkStatus.textContent = yes ? "Told him yes." : "Told him no.";
  } catch {
    talkStatus.textContent = "Couldn't reach the API.";
  }
}

talkButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  talkButton.setPointerCapture(event.pointerId);
  startTalking();
});
talkButton.addEventListener("pointerup", finishTalking);
talkButton.addEventListener("pointercancel", finishTalking);
talkButton.addEventListener("lostpointercapture", finishTalking);
talkButton.addEventListener("contextmenu", (event) => event.preventDefault());
talkButton.addEventListener("keydown", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  if (!event.repeat) startTalking();
});
talkButton.addEventListener("keyup", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  finishTalking();
});
talkYes.addEventListener("click", () => answerTalk(true));
talkNo.addEventListener("click", () => answerTalk(false));
talkPlay.addEventListener("click", async () => {
  await talking.context?.resume();
  talkPlay.textContent = "Play again";
  playBuffer();
});
talkClose.addEventListener("click", () => {
  clearTalk();
  talkSheet.hidden = true;
});

ringButton.addEventListener("click", () => showTab("server"));
findPhoneButton.addEventListener("click", findPhone);
openNoteButton.addEventListener("click", () => {
  noteStatus.textContent = "";
  noteDialog.showModal();
});
closeNoteButton.addEventListener("click", () => noteDialog.close());
playingPause.addEventListener("click", () => controlPlaying("pause", playingPause));
playingNext.addEventListener("click", () => controlPlaying("next", playingNext));
document.addEventListener("visibilitychange", refreshHome);
document.addEventListener("pointerup", wakeSound, { passive: true });

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