// @ts-check

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

/**
 * Shows the dashboard when logged in, otherwise the login form.
 * @param {boolean} loggedIn
 */
function showView(loggedIn) {
  loginForm.hidden = loggedIn;
  dashboard.hidden = !loggedIn;
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

checkLogin();