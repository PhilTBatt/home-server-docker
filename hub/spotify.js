// @ts-check
/**
 * @typedef {object} SignInStatus
 * @property {boolean} signedIn
 * @property {string[] | null} scopes
 * @property {string | null} signedInAt
 * @property {string | null} refreshedAt
 * @property {boolean} signingIn
 * @property {string | null} problem
 */

/**
 * @typedef {object} ApiError
 * @property {string} [error]
 * @property {string} [message]
 */

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

const message = byId("spotify-message");
const controls = byId("spotify-controls");
const signInButton = /** @type {HTMLButtonElement} */ (byId("spotify-sign-in"));
const signOutButton = /** @type {HTMLButtonElement} */ (byId("spotify-sign-out"));
const pasteForm = /** @type {HTMLFormElement} */ (byId("spotify-paste"));
const addressInput = /** @type {HTMLInputElement} */ (byId("spotify-address"));

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function reasonOf(response) {
  if (response.status === 401) return "you're not logged in to the hub: log in on the hub page first, then come back";
  if (response.status === 404) return "Spotify is switched off (SPOTIFY in api/.env)";
  /** @type {ApiError | null} */
  const body = await response.json().catch(() => null);
  return body?.error ?? body?.message ?? `the API replied ${response.status}`;
}

/**
 * @param {SignInStatus} status
 * @returns {string}
 */
function statusText(status) {
  if (status.problem !== null) return status.problem;
  if (!status.signedIn) return "Not signed in to Spotify.";
  const since = status.signedInAt === null ? "" : ` since ${new Date(status.signedInAt).toLocaleString()}`;
  return `Signed in to Spotify${since}, with ${status.scopes?.length ?? 0} permissions.`;
}

async function loadStatus() {
  const response = await fetch("/api/spotify/status");
  if (!response.ok) {
    message.textContent = `Couldn't check Spotify: ${await reasonOf(response)}.`;
    controls.hidden = response.status === 401 || response.status === 404;
    return;
  }
  /** @type {SignInStatus} */
  const status = await response.json();
  message.textContent = statusText(status);
  controls.hidden = false;
}

/**
 * @param {URLSearchParams} params
 */
async function finish(params) {
  const state = params.get("state");
  const code = params.get("code");
  const error = params.get("error");
  if (state === null || (code === null && error === null)) {
    message.textContent = "That address has no answer from Spotify in it.";
    return;
  }
  message.textContent = "Finishing the sign-in...";
  /** @type {Record<string, string>} */
  const body = { state };
  if (code !== null) body.code = code;
  if (error !== null) body.error = error;
  const response = await fetch("/api/spotify/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) {
    await loadStatus();
    message.textContent = `Signed in. ${message.textContent}`;
  } else {
    message.textContent = `Couldn't sign in: ${await reasonOf(response)}.`;
    controls.hidden = false;
  }
}

signInButton.addEventListener("click", async () => {
  signInButton.disabled = true;
  const response = await fetch("/api/spotify/sign-in", { method: "POST" });
  if (response.ok) {
    /** @type {{ url: string }} */
    const started = await response.json();
    if (started.url.startsWith("https://accounts.spotify.com/authorize?")) {
      window.location.assign(started.url);
      return;
    }
    message.textContent = "The hub gave an address that isn't Spotify's, so it wasn't opened.";
  } else {
    message.textContent = `Couldn't start signing in: ${await reasonOf(response)}.`;
  }
  signInButton.disabled = false;
});

pasteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let pasted;
  try {
    pasted = new URL(addressInput.value.trim());
  } catch {
    message.textContent = "That isn't an address. Copy the whole address from the browser's address bar.";
    return;
  }
  addressInput.value = "";
  await finish(pasted.searchParams);
});

signOutButton.addEventListener("click", async () => {
  const response = await fetch("/api/spotify/sign-out", { method: "POST" });
  message.textContent = response.ok ? "Signed out of Spotify." : `Couldn't sign out: ${await reasonOf(response)}.`;
});

const answer = new URLSearchParams(window.location.search);
if (answer.has("state")) {
  window.history.replaceState(null, "", window.location.pathname);
  void finish(answer);
} else {
  void loadStatus();
}
