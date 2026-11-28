// @ts-check
import { fitKey, letterbox, matrixFor, moveCorner, readFit, writeFit } from "./wall-fit.js";
import { arrivalShownMs, arrivalsBetween, pairingLine, pairRefusedLine, pairRetryMs, spacedCode, bedtimeLine, captionFor, countdownOf, countdownText, itemColour, leavesText, londonClock, middleFor, middleKey, modeColour, orbitSlots, poseFor, poseLabels, trainState } from "./wall-logic.js";

/**
 * @typedef {import("./wall-logic.js").WallPicture} WallPicture
 * @typedef {import("./wall-logic.js").JarvisView} JarvisView
 * @typedef {import("./wall-logic.js").WallItem} WallItem
 * @typedef {import("./wall-logic.js").Pose} Pose
 */

export const pictureEveryMs = 30_000;
export const retryMs = 3_000;
export const tickMs = 1_000;
export const failuresBeforeLost = 2;
export const pictureLimitMs = 10_000;
export const jarvisLimitMs = 30_000;
export const width = 1280;
export const height = 720;
export const orbit = { cx: 640, cy: 375, rx: 440, ry: 245 };
export const centre = { x: 640, y: 375 };
export const aside = { x: 400, y: 375 };
export const bedtimeSpot = { x: 640, y: 360, scale: 0.45 };
export const circumference = 2 * Math.PI * 118;
export const fitButtonMs = 5_000;

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`No #${id} on the page`);
  return found;
}

const stage = byId("stage");
const items = byId("items");
const jarvisBox = byId("jarvis");
const poseBox = byId("pose");
const label = byId("label");
const sun = byId("sun");
const countdown = byId("countdown");
const countdownLeft = byId("countdown-left");
const sparks = byId("sparks");
const middle = byId("middle");
const caption = byId("caption");
const login = byId("login");
const pairCode = byId("pair-code");
const pairMessage = byId("login-message");
const setup = byId("setup");
const fitOpen = byId("fit-open");
const handles = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".handle")]);

/** @type {{ picture: WallPicture | null, pictureAt: number, jarvis: JarvisView | null, jarvisAt: number, speakingAt: number, seq: number, pictureFailures: number, jarvisFailures: number, arrival: string | null, arrivalUntil: number, lastItems: WallItem[] | null, pose: string | null, loggedOut: boolean, running: AbortController | null }} */
const state = { picture: null, pictureAt: 0, jarvis: null, jarvisAt: 0, speakingAt: -Infinity, seq: -1, pictureFailures: 0, jarvisFailures: 0, arrival: null, arrivalUntil: 0, lastItems: null, pose: null, loggedOut: false, running: null };

/** @type {Map<string, HTMLElement>} */
const shown = new Map();

/**
 * @param {HTMLElement} element
 * @param {string} text
 */
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/**
 * @param {AbortSignal} signal
 * @param {number} ms
 * @returns {AbortSignal}
 */
function limited(signal, ms) {
  const both = new AbortController();
  const timer = setTimeout(() => stop(), ms);
  const stop = () => {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    both.abort();
  };
  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
  return both.signal;
}

/**
 * @param {number} ms
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function pause(ms, signal) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** @type {string | null} */
let unsaved = null;

/**
 * @returns {string | null}
 */
function savedFit() {
  try {
    return window.localStorage.getItem(fitKey);
  } catch {
    return null;
  }
}

/**
 * @returns {import("./wall-fit.js").Corners}
 */
function cornersNow() {
  return readFit(savedFit(), window.innerWidth, window.innerHeight) ?? readFit(unsaved, window.innerWidth, window.innerHeight) ?? letterbox(window.innerWidth, window.innerHeight, width, height);
}

/**
 * @param {import("./wall-fit.js").Corners} corners
 * @returns {boolean}
 */
function showFit(corners) {
  const matrix = matrixFor(corners, width, height);
  if (matrix === null) return false;
  stage.style.transform = matrix;
  return true;
}

export function fitStage() {
  if (!setup.hidden) return;
  showFit(cornersNow());
}

function buildRays() {
  for (let i = 0; i < 24; i++) {
    const ray = document.createElement("div");
    ray.className = "ray";
    ray.style.transform = `rotate(${i * 15}deg)`;
    const bar = document.createElement("span");
    bar.style.animationDelay = `${-((i * 0.23) % 0.6).toFixed(2)}s`;
    ray.append(bar);
    sun.append(ray);
  }
  for (let i = 0; i < 12; i++) {
    const spark = document.createElement("div");
    spark.className = "spark";
    spark.style.transform = `rotate(${i * 30}deg)`;
    const dot = document.createElement("span");
    dot.style.animationDelay = `${(i % 3) * 0.08}s`;
    spark.append(dot);
    sparks.append(spark);
  }
  countdownLeft.setAttribute("stroke-dasharray", String(circumference));
}

function burst() {
  sparks.classList.remove("burst");
  void sparks.offsetWidth;
  sparks.classList.add("burst");
}

/**
 * @param {string} pose
 */
function showPose(pose) {
  if (state.pose === pose) return;
  state.pose = pose;
  const template = /** @type {HTMLTemplateElement | null} */ (document.getElementById(`pose-${pose}`));
  poseBox.replaceChildren(...(template === null ? [] : [template.content.cloneNode(true)]));
}

/**
 * @param {WallItem} item
 * @returns {HTMLElement}
 */
function itemElement(item) {
  const known = shown.get(item.key);
  if (known !== undefined) {
    known.classList.remove("gone");
    return known;
  }
  const element = document.createElement("div");
  element.className = "item hidden";
  element.dataset.key = item.key;
  const dot = document.createElement("span");
  dot.className = "dot";
  const words = document.createElement("div");
  words.className = "words";
  for (const part of ["label", "value", "note"]) {
    const line = document.createElement("span");
    line.className = `item-${part}`;
    words.append(line);
  }
  element.append(dot, words);
  const from = jarvisSpot();
  element.style.transform = `translate(${from.x}px, ${from.y}px)`;
  items.append(element);
  shown.set(item.key, element);
  return element;
}

/**
 * @param {HTMLElement} element
 * @param {WallItem} item
 * @param {string} accent
 */
function fillItem(element, item, accent) {
  const [labelLine, valueLine, noteLine] = /** @type {HTMLElement[]} */ ([...element.querySelectorAll(".words span")]);
  setText(labelLine, item.label);
  setText(valueLine, item.value);
  setText(noteLine, item.note);
  noteLine.classList.toggle("good", item.note === "all good" || item.note.startsWith("on time"));
  noteLine.classList.toggle("bad", item.colour === "warm");
  const dot = /** @type {HTMLElement} */ (element.querySelector(".dot"));
  dot.style.setProperty("--dot", itemColour(item.colour, accent));
  dot.classList.toggle("hollow", item.key === "alerts" && !item.needs);
}

/**
 * @returns {{ x: number, y: number }}
 */
function jarvisSpot() {
  const picture = state.picture;
  if (picture?.phase === "bedtime") return bedtimeSpot;
  return currentMiddle() === null ? centre : aside;
}

/**
 * @returns {import("./wall-logic.js").Middle}
 */
function currentMiddle() {
  const picture = state.picture;
  if (picture === null || picture.phase === "bedtime") return null;
  const now = Date.now();
  if (state.arrival !== null && now >= state.arrivalUntil) state.arrival = null;
  return middleFor({ items: picture.items, phase: picture.phase, train: picture.train, timers: picture.timers, arrival: state.arrival, now });
}

/**
 * @param {import("./wall-logic.js").Middle} chosen
 * @param {WallPicture} picture
 */
function showMiddle(chosen, picture) {
  const parts = { label: byId("middle-label"), value: byId("middle-value"), note: byId("middle-note"), state: byId("middle-state"), extra: byId("middle-extra") };
  middle.hidden = chosen === null;
  middle.classList.toggle("warm", chosen?.kind === "needs");
  if (chosen === null) return;
  const since = Date.now() - state.pictureAt;
  /** @type {{ label: string, value: string, note: string, state: string, extra: string, bad: boolean }} */
  let words = { label: "", value: "", note: "", state: "", extra: "", bad: false };
  if (chosen.kind === "train" && picture.train !== null) {
    const train = picture.train;
    words = { label: "Your train", value: train.leaves, note: [train.to === "" ? "" : `to ${train.to}`, train.platform === null ? "" : `platform ${train.platform}`].filter((part) => part !== "").join(" · "), state: trainState(train), extra: leavesText(train.inMinutes, since), bad: train.late };
  } else if (chosen.kind === "timer") {
    const counting = countdownOf([chosen.timer], Date.now());
    words = { label: "Timer", value: countdownText(counting?.remainingMs ?? 0), note: chosen.timer.text, state: "", extra: "", bad: false };
  } else if (chosen.kind === "needs" || chosen.kind === "arrival") {
    const item = picture.items.find((one) => one.key === chosen.key);
    if (item !== undefined) words = { label: item.label, value: item.value, note: item.note, state: chosen.kind === "needs" ? "Needs a look" : "", extra: "", bad: chosen.kind === "needs" };
  }
  setText(parts.label, words.label);
  setText(parts.value, words.value);
  setText(parts.note, words.note);
  setText(parts.state, words.state);
  setText(parts.extra, words.extra);
  parts.state.classList.toggle("bad", words.bad);
}

/**
 * @param {WallPicture} picture
 * @param {string | null} away
 * @param {string} accent
 */
function showOrbit(picture, away, accent) {
  const circling = picture.items.filter((item) => item.key !== away);
  const slots = orbitSlots(circling.length, orbit);
  const keys = new Set(circling.map((item) => item.key));
  circling.forEach((item, i) => {
    const element = itemElement(item);
    fillItem(element, item, accent);
    const slot = slots[i];
    element.classList.remove("left", "right", "top-side", "bottom-side");
    element.classList.add(slot.side === "top" ? "top-side" : slot.side === "bottom" ? "bottom-side" : slot.side);
    const target = `translate(${slot.x}px, ${slot.y}px)`;
    if (element.classList.contains("hidden")) {
      void element.offsetWidth;
      element.classList.remove("hidden");
    }
    if (element.style.transform !== target) element.style.transform = target;
  });
  for (const [key, element] of shown) {
    if (keys.has(key)) continue;
    const inMiddle = key === away;
    if (inMiddle) {
      const spot = jarvisSpot();
      element.classList.add("gone");
      element.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
      continue;
    }
    if (!picture.items.some((item) => item.key === key)) {
      element.classList.add("gone");
      shown.delete(key);
      setTimeout(() => element.remove(), 1000);
    }
  }
}

/**
 * @param {WallPicture} picture
 */
function showArcs(picture) {
  const bad = (/** @type {string} */ key) => picture.items.some((item) => item.key === key && (item.needs || item.colour === "warm"));
  byId("arc-server").classList.toggle("bad", bad("server"));
  byId("arc-backup").classList.toggle("bad", bad("backup"));
  byId("arc-alerts").classList.toggle("bad", bad("alerts"));
}

export function render() {
  const picture = state.picture;
  const now = Date.now();
  const accent = modeColour(picture?.mode ?? null);
  document.documentElement.style.setProperty("--accent", accent);
  for (const phase of ["morning", "daytime", "bedtime"]) document.body.classList.toggle(`phase-${phase}`, (picture?.phase ?? "daytime") === phase);
  setText(byId("clock"), londonClock(new Date()));
  setText(byId("day"), picture?.day ?? "");
  const connected = state.pictureFailures < failuresBeforeLost && state.jarvisFailures < failuresBeforeLost;
  const pose = poseFor({ jarvis: state.jarvis, connected, mode: picture?.mode ?? null, phase: picture?.phase ?? "daytime" });
  showPose(pose === "speaking" && picture?.speaking === "string" ? "string" : pose);
  setText(label, poseLabels[pose]);
  poseBox.setAttribute("aria-label", `Jarvis: ${poseLabels[pose]}`);
  const chosen = currentMiddle();
  const spot = jarvisSpot();
  const scale = picture?.phase === "bedtime" ? bedtimeSpot.scale : 1;
  jarvisBox.style.transform = `translate(${spot.x - 120}px, ${spot.y - 120}px) scale(${scale})`;
  jarvisBox.classList.toggle("centred-off", chosen !== null || picture?.phase !== "daytime");
  const quietPoses = ["waiting", "guest", "done", "sleepy", "muted"];
  sun.hidden = (picture?.playing ?? null) === null || !quietPoses.includes(pose);
  const counting = picture === null ? null : countdownOf(picture.timers, now);
  countdown.toggleAttribute("hidden", counting === null || picture?.phase === "bedtime");
  if (counting !== null) countdownLeft.setAttribute("stroke-dashoffset", String(-(1 - counting.fraction) * circumference));
  if (picture !== null) {
    showMiddle(chosen, picture);
    showOrbit(picture, middleKey(chosen), accent);
    showArcs(picture);
    setText(byId("quiet-clock"), londonClock(new Date()));
    setText(byId("quiet-words"), bedtimeLine(picture));
  }
  if (state.jarvis?.activity === "speaking") state.speakingAt = now;
  const words = connected ? captionFor(state.jarvis, now - state.jarvisAt, accent, now - state.speakingAt) : null;
  caption.hidden = words === null;
  if (words !== null) {
    setText(byId("caption-who"), words.who === "you" ? "You said" : words.who === "them" ? "Heard" : "Jarvis");
    setText(byId("caption-text"), words.who === "him" ? words.text : `“${words.text}”`);
    caption.style.setProperty("--voice", words.colour);
  }
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function refused(response) {
  if (response.status !== 401) return false;
  if (login.hidden) showLogin();
  return true;
}

/**
 * @param {AbortSignal} signal
 */
async function followPicture(signal) {
  while (!signal.aborted) {
    try {
      const response = await fetch("/api/wall", { cache: "no-store", signal: limited(signal, pictureLimitMs) });
      if (refused(response)) return;
      if (!response.ok) throw new Error(`the hub answered ${response.status}`);
      /** @type {WallPicture} */
      const picture = await response.json();
      const arrived = arrivalsBetween(state.lastItems, picture.items);
      state.lastItems = picture.items;
      state.picture = picture;
      state.pictureAt = Date.now();
      state.pictureFailures = 0;
      if (arrived.length > 0) {
        state.arrival = arrived[0];
        state.arrivalUntil = Date.now() + arrivalShownMs;
        burst();
      }
    } catch {
      if (signal.aborted) return;
      state.pictureFailures++;
    }
    render();
    await pause(state.pictureFailures > 0 ? retryMs * 2 : pictureEveryMs, signal);
  }
}

/**
 * @param {AbortSignal} signal
 */
async function followJarvis(signal) {
  while (!signal.aborted) {
    try {
      const response = await fetch(`/api/wall/jarvis?after=${state.seq}`, { cache: "no-store", signal: limited(signal, jarvisLimitMs) });
      if (refused(response)) return;
      if (!response.ok) throw new Error(`the hub answered ${response.status}`);
      /** @type {JarvisView} */
      const jarvis = await response.json();
      state.jarvis = jarvis;
      state.jarvisAt = Date.now();
      state.seq = jarvis.seq;
      state.jarvisFailures = 0;
      render();
    } catch {
      if (signal.aborted) return;
      state.jarvisFailures++;
      render();
      await pause(retryMs, signal);
    }
  }
}

function start() {
  state.running?.abort();
  const running = new AbortController();
  state.running = running;
  login.hidden = true;
  void followPicture(running.signal);
  void followJarvis(running.signal);
}

function showLogin() {
  state.running?.abort();
  const pairing = new AbortController();
  state.running = pairing;
  login.hidden = false;
  void pairScreen(pairing.signal);
}

/**
 * @param {AbortSignal} signal
 */
async function pairScreen(signal) {
  while (!signal.aborted) {
    setText(pairCode, "");
    setText(pairMessage, "Asking the hub for a code...");
    /** @type {{ code: string, seconds: number } | null} */
    let started = null;
    try {
      const response = await fetch("/api/wall/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: limited(signal, pictureLimitMs) });
      if (response.ok) started = await response.json();
      else {
        setText(pairMessage, pairRefusedLine(response.status));
        await pause(response.status === 429 ? pairRetryMs : retryMs * 3, signal);
        continue;
      }
    } catch {
      if (signal.aborted) return;
      setText(pairMessage, "Couldn't reach the hub. Trying again in a moment.");
      await pause(retryMs, signal);
      continue;
    }
    if (started === null) {
      await pause(retryMs, signal);
      continue;
    }
    setText(pairCode, spacedCode(started.code));
    setText(pairMessage, pairingLine(started.seconds));
    for (;;) {
      if (signal.aborted) return;
      try {
        const response = await fetch("/api/wall/pair", { cache: "no-store", signal: limited(signal, jarvisLimitMs) });
        if (!response.ok) throw new Error(`the hub answered ${response.status}`);
        /** @type {{ state: "waiting" | "paired" | "gone", seconds: number }} */
        const looked = await response.json();
        if (looked.state === "paired") {
          setText(pairCode, "");
          setText(pairMessage, "");
          start();
          return;
        }
        if (looked.state === "gone") break;
        setText(pairMessage, pairingLine(looked.seconds));
      } catch {
        if (signal.aborted) return;
        await pause(retryMs, signal);
      }
    }
  }
}

/** @type {{ corners: import("./wall-fit.js").Corners, before: import("./wall-fit.js").Corners, picked: number | null, dragging: number | null, buttonTimer: ReturnType<typeof setTimeout> | null }} */
const fitting = { corners: cornersNow(), before: cornersNow(), picked: null, dragging: null, buttonTimer: null };

function placeHandles() {
  handles.forEach((handle, i) => {
    const [x, y] = fitting.corners[i];
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
    handle.classList.toggle("picked", fitting.picked === i);
  });
}

/**
 * @param {import("./wall-fit.js").Corners} corners
 */
function tryCorners(corners) {
  const message = byId("setup-message");
  fitting.corners = corners;
  placeHandles();
  setText(message, showFit(corners) ? "" : "That shape folds over itself or is too small, so it isn't used: move a corner back.");
}

function openSetup() {
  fitting.corners = cornersNow();
  fitting.before = fitting.corners;
  fitting.picked = null;
  setup.hidden = false;
  fitOpen.hidden = true;
  document.body.classList.add("fitting");
  setText(byId("setup-message"), "");
  placeHandles();
}

function closeSetup() {
  setup.hidden = true;
  document.body.classList.remove("fitting");
  fitStage();
}

function offerSetup() {
  if (!setup.hidden || !login.hidden) return;
  fitOpen.hidden = false;
  if (fitting.buttonTimer !== null) clearTimeout(fitting.buttonTimer);
  fitting.buttonTimer = setTimeout(() => (fitOpen.hidden = true), fitButtonMs);
}

handles.forEach((handle, i) => {
  handle.addEventListener("pointerdown", (event) => {
    fitting.picked = i;
    fitting.dragging = i;
    handle.setPointerCapture(event.pointerId);
    placeHandles();
  });
  handle.addEventListener("pointermove", (event) => {
    if (fitting.dragging !== i) return;
    tryCorners(moveCorner(fitting.corners, i, [event.clientX, event.clientY], window.innerWidth, window.innerHeight));
  });
  const letGo = () => {
    if (fitting.dragging === i) fitting.dragging = null;
  };
  handle.addEventListener("pointerup", letGo);
  handle.addEventListener("pointercancel", letGo);
  handle.addEventListener("click", () => {
    fitting.picked = i;
    placeHandles();
  });
});

/** @type {Record<string, [number, number]>} */
const nudges = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

window.addEventListener("keydown", (event) => {
  if (!login.hidden) return;
  if (setup.hidden) {
    if (event.key === "f" || event.key === "F") openSetup();
    else offerSetup();
    return;
  }
  if (event.key === "Escape") {
    showFit(fitting.before);
    closeSetup();
    return;
  }
  const step = nudges[event.key];
  if (step === undefined || fitting.picked === null) return;
  event.preventDefault();
  const by = event.shiftKey ? 10 : 1;
  const [x, y] = fitting.corners[fitting.picked];
  tryCorners(moveCorner(fitting.corners, fitting.picked, [x + step[0] * by, y + step[1] * by], window.innerWidth, window.innerHeight));
});

window.addEventListener("pointermove", offerSetup);
fitOpen.addEventListener("click", openSetup);
byId("fit-save").addEventListener("click", () => {
  if (matrixFor(fitting.corners, width, height) === null) return;
  const fit = writeFit(fitting.corners, window.innerWidth, window.innerHeight);
  try {
    window.localStorage.setItem(fitKey, fit);
    unsaved = null;
  } catch {
    unsaved = fit;
  }
  closeSetup();
});
byId("fit-reset").addEventListener("click", () => {
  fitting.picked = null;
  tryCorners(letterbox(window.innerWidth, window.innerHeight, width, height));
});
byId("fit-cancel").addEventListener("click", () => {
  showFit(fitting.before);
  closeSetup();
});

window.addEventListener("resize", fitStage);
buildRays();
fitStage();
render();
start();
setInterval(render, tickMs);
