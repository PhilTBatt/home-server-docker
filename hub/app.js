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
 * Finds the element with this id, or stops the script if there isn't one.
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
const alertsList = byId("alerts");
const scanButton = /** @type {HTMLButtonElement} */ (byId("scan-library"));
/** @type {number | undefined} */ let refreshTimer;

/**
 * Shows the dashboard when logged in, otherwise the login form.
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
    loadAlerts();

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
 * Makes a list item containing this text.
 * @param {string} text
 * @returns {HTMLLIElement}
 */
function listItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

/**
 * Turns seconds into something like "1h 23m", "12m" or "45s".
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

checkLogin();