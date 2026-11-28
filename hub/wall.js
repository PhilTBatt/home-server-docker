// @ts-check
import { fitKey, letterbox, matrixFor, moveCorner, readFit, writeFit } from "./wall-fit.js";
import { bubbleAround, bubbleFor, byLine, cardFor, cornerStep, detailEveryMs, detailPages, detailsShown, fitChip, framesASecond, fromHub, isPageView, isTrainDetails, itemBox, movePointer, nextCorner, nextDetails, openHere, pageLeftMs, pageShownMs, pointerShown, privateOf, stillOpen, trailMs, trailOf, trainRowView, trainView } from "./wall-cards.js";
import { morningTrainCard, morningView } from "./wall-morning.js";
import { isServerMap, mapHalos, mapView, stateWord } from "./wall-map.js";
import { isSwitchboard, switchboardView } from "./wall-switches.js";
import { isSecurityPage, securityNote, securityView } from "./wall-security.js";
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
const card = byId("card");
const pointer = byId("pointer");
const trail = byId("trail");
const bubble = byId("bubble");
const fitChipBox = byId("fit-chip");
const fps = byId("fps");

/** @type {{ picture: WallPicture | null, pictureAt: number, jarvis: JarvisView | null, jarvisAt: number, speakingAt: number, seq: number, pictureFailures: number, jarvisFailures: number, arrival: string | null, arrivalUntil: number, lastItems: WallItem[] | null, pose: string | null, loggedOut: boolean, running: AbortController | null }} */
const state = { picture: null, pictureAt: 0, jarvis: null, jarvisAt: 0, speakingAt: -Infinity, seq: -1, pictureFailures: 0, jarvisFailures: 0, arrival: null, arrivalUntil: 0, lastItems: null, pose: null, loggedOut: false, running: null };

/** @type {Map<string, HTMLElement>} */
const shown = new Map();

/**
 * @typedef {{ kind: "item" | "card" | "fit", key: string, box: import("./wall-cards.js").Box }} Target
 */

/** @type {{ opened: import("./wall-cards.js").Opened | null, seen: import("./wall-cards.js").Seen, privateNow: string[], point: import("./wall-cards.js").Spot, movedAt: number, points: import("./wall-cards.js").Point[], boxes: Array<{ key: string, box: import("./wall-cards.js").Box }>, reached: Target | null, closeTimer: ReturnType<typeof setTimeout> | null, facts: string }} */
const pages = { opened: null, seen: { opens: null, backs: null }, privateNow: [], point: { x: 640, y: 375 }, movedAt: -Infinity, points: [], boxes: [], reached: null, closeTimer: null, facts: "" };

/** @type {import("./wall-cards.js").HeldDetails & { fetchedAt: number, asking: boolean, shown: string }} */
const detail = { id: null, details: null, at: "", goodAt: -Infinity, fetchedAt: -Infinity, asking: false, shown: "" };

/**
 * @param {string} id
 */
async function readDetails(id) {
  detail.asking = true;
  try {
    const response = await fetch(`/api/wall/pages/${id}`, { cache: "no-store", signal: limited(state.running?.signal ?? new AbortController().signal, pictureLimitMs) });
    if (refused(response)) return;
    const body = response.ok ? await response.json() : null;
    const got = response.ok ? { details: body?.details ?? null, at: typeof body?.at === "string" ? body.at : "" } : response.status === 403 || response.status === 404 ? null : undefined;
    Object.assign(detail, nextDetails(detail, id, got, Date.now()), { fetchedAt: Date.now() });
  } catch {
    Object.assign(detail, nextDetails(detail, id, undefined, Date.now()), { fetchedAt: Date.now() });
  } finally {
    detail.asking = false;
  }
  render();
}

/**
 * @param {number} now
 */
function followDetails(now) {
  const id = pages.opened?.page.id ?? (document.body.classList.contains("morning-on") ? "train" : null);
  if (id === null || !detailPages.includes(id) || detail.asking) return;
  if (detail.id === id && now - detail.fetchedAt < detailEveryMs) return;
  void readDetails(id);
}

/**
 * @param {WallPicture | null} picture
 * @param {string} clockNow
 */
function showMorning(picture, clockNow) {
  const box = byId("morning");
  const [hours, minutes] = clockNow.split(":");
  const snoozed = picture?.morning?.snoozedUntil ?? null;
  const view = picture === null ? null : morningView(picture.morning ?? null, Number(hours) * 60 + Number(minutes) + new Date().getSeconds() / 60, snoozed === null ? "" : londonClock(new Date(snoozed)), picture.train);
  document.body.classList.toggle("morning-on", view !== null);
  box.hidden = view === null;
  if (view === null || picture === null) return;
  setText(byId("morning-wake"), view.wake);
  setText(byId("morning-hours"), hours ?? "");
  setText(byId("morning-minutes"), minutes ?? "");
  const glow = byId("morning-glow");
  glow.style.opacity = String(view.glow);
  glow.style.transform = `translateY(${Math.round((1 - view.glow) * 130)}px)`;
  const key = JSON.stringify([view.chips, view.steps]);
  if (box.dataset.shown !== key) {
    box.dataset.shown = key;
    byId("morning-chips").replaceChildren(
      ...view.chips.map((chip) => {
        const one = document.createElement("span");
        one.className = `morning-chip ${chip.tone}`;
        one.textContent = chip.text;
        return one;
      }),
    );
    byId("morning-steps").replaceChildren(
      ...view.steps.map((step) => {
        const one = document.createElement("li");
        one.className = `morning-step ${step.state}`;
        const dot = document.createElement("span");
        dot.className = "morning-dot";
        dot.setAttribute("aria-hidden", "true");
        const time = document.createElement("span");
        time.className = "morning-time";
        time.textContent = step.time;
        const what = document.createElement("span");
        what.className = "morning-what";
        what.textContent = step.what;
        one.append(dot, time, what);
        return one;
      }),
    );
  }
  const shownDetails = detailsShown(detail, "train", Date.now());
  const details = isTrainDetails(shownDetails) ? shownDetails : null;
  const row = details === null || picture.train === null ? undefined : details.rows.find((one) => one.leaves === picture.train?.leaves);
  const trainCard = morningTrainCard(picture.train, row === undefined || details === null ? "" : trainRowView(row, details.via).second);
  const trainBox = byId("morning-train");
  trainBox.hidden = trainCard === null;
  if (trainCard === null) return;
  trainBox.classList.toggle("warm", trainCard.tone === "warm");
  setText(byId("morning-train-main"), trainCard.main);
  setText(byId("morning-train-sub"), trainCard.sub);
}

/**
 * @param {import("./wall-cards.js").TrainRowView} view
 * @returns {HTMLElement}
 */
function trainRowElement(view) {
  const line = document.createElement("div");
  line.className = `train-row ${view.tone}`;
  line.setAttribute("role", "row");
  const main = document.createElement("div");
  main.className = "train-main";
  /**
   * @param {string} name
   * @param {string} text
   * @param {string | null} was
   */
  const cell = (name, text, was) => {
    const one = document.createElement("span");
    one.className = name;
    one.setAttribute("role", "cell");
    if (was !== null) {
      const struck = document.createElement("s");
      struck.textContent = was;
      one.append(struck);
    }
    one.append(text);
    return one;
  };
  const status = cell(`train-status ${view.tone}`, view.status, null);
  main.append(cell("train-time", view.leaves, view.leavesWas), cell("train-arrives", view.arrives, view.arrivesWas), cell("train-platform", view.platform, null), status);
  const second = document.createElement("span");
  second.className = "train-change";
  second.textContent = view.second;
  line.append(main, second);
  return line;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function showDetails(id) {
  const rows = byId("card-rows");
  const sub = byId("card-sub");
  const facts = byId("card-facts");
  const details = detailsShown(detail, id, Date.now());
  const rich = isTrainDetails(details);
  card.classList.toggle("rich", rich);
  rows.hidden = !rich;
  sub.hidden = !rich;
  facts.hidden = rich;
  if (!rich) return false;
  const view = trainView(details, detail.at === "" ? "" : londonClock(new Date(detail.at)));
  setText(byId("card-kind"), "Trains");
  setText(byId("card-title"), view.title);
  setText(sub, view.sub);
  const key = JSON.stringify(view);
  if (detail.shown !== key) {
    detail.shown = key;
    if (view.empty !== null) {
      const empty = document.createElement("p");
      empty.className = "train-change";
      empty.textContent = view.empty;
      rows.replaceChildren(empty);
    } else rows.replaceChildren(...view.rows.map(trainRowElement));
  }
  return true;
}

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
  return pages.opened === null && currentMiddle() === null ? centre : aside;
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
  pages.boxes = circling.map((item, i) => ({ key: item.key, box: itemBox(slots[i].x, slots[i].y, slots[i].side) }));
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

/**
 * @param {number} now
 */
function showCard(now) {
  const open = pages.opened;
  stage.classList.toggle("opened", open !== null);
  const mapShown = showMap(open, now);
  const boardShown = showSwitches(open, now);
  const securityShown = showSecurity(open, now);
  if (mapShown || boardShown || securityShown) {
    card.hidden = true;
    card.classList.add("shut");
    return;
  }
  if (open === null) {
    if (card.hidden || card.classList.contains("shut")) return;
    card.classList.add("shut");
    if (pages.closeTimer !== null) clearTimeout(pages.closeTimer);
    pages.closeTimer = setTimeout(() => {
      pages.closeTimer = null;
      if (pages.opened === null) card.hidden = true;
    }, 1200);
    return;
  }
  const shownCard = cardFor(open.page, state.picture, Date.now() - state.pictureAt);
  setText(byId("card-kind"), shownCard.kind);
  setText(byId("card-by"), shownCard.by);
  setText(byId("card-title"), shownCard.title);
  const facts = JSON.stringify(shownCard.facts);
  if (pages.facts !== facts) {
    pages.facts = facts;
    byId("card-facts").replaceChildren(
      ...shownCard.facts.map((fact) => {
        const line = document.createElement("li");
        line.textContent = fact;
        return line;
      }),
    );
  }
  card.classList.toggle("empty", shownCard.empty);
  card.classList.toggle("warm", shownCard.colour === "warm");
  showDetails(open.page.id);
  byId("card-left").style.transform = `scaleX(${pageLeftMs(open, now) / pageShownMs})`;
  if (!card.hidden && !card.classList.contains("shut")) return;
  if (pages.closeTimer !== null) clearTimeout(pages.closeTimer);
  pages.closeTimer = null;
  card.hidden = false;
  void card.offsetWidth;
  card.classList.remove("shut");
}

/**
 * @param {string} tag
 * @param {string} className
 * @returns {HTMLElement}
 */
function made(tag, className) {
  const one = document.createElement(tag);
  one.className = className;
  return one;
}

/**
 * @param {string} fx
 * @returns {Element[]}
 */
function effectOf(fx) {
  const dots = (/** @type {number} */ count, /** @type {string} */ name) => {
    const box = made("span", `map-fx fx-${name}`);
    box.append(...Array.from({ length: count }, () => document.createElement("span")));
    return box;
  };
  if (fx === "sound") return [made("span", "map-fx fx-sound"), made("span", "map-fx fx-sound-late")];
  if (fx === "type") return [dots(3, "type")];
  if (fx === "grid") return [dots(4, "grid")];
  if (fx === "bars") return [dots(3, "bars")];
  if (fx === "orbit") return [dots(1, "orbit")];
  if (fx === "heart") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "map-fx fx-heart");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 30 16");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", "0,8 8,8 11,2 15,14 18,8 30,8");
    svg.append(line);
    return [svg];
  }
  if (fx === "plain" || fx === "external") return [];
  return [made("span", `map-fx fx-${fx}`)];
}

/**
 * @param {import("./wall-cards.js").Opened | null} open
 * @param {number} now
 * @returns {boolean}
 */
function showMap(open, now) {
  const box = byId("map");
  const details = open?.page.id === "server" ? detailsShown(detail, "server", Date.now()) : null;
  const mapped = open !== null && isServerMap(details);
  stage.classList.toggle("mapped", mapped);
  box.hidden = !mapped;
  if (!mapped || open === null || !isServerMap(details)) return false;
  setText(byId("map-by"), byLine(open.page.by) || "On the wall");
  byId("map-left").style.transform = `scaleX(${pageLeftMs(open, now) / pageShownMs})`;
  const key = JSON.stringify(details);
  if (box.dataset.shown === key) return true;
  box.dataset.shown = key;
  const view = mapView(details);
  setText(byId("map-host-name"), view.host);
  setText(byId("map-watched"), view.watched);
  byId("map-halos").replaceChildren(
    ...mapHalos.flatMap((halo) => {
      const ring = made("span", `map-halo g-${halo.group}`);
      Object.assign(ring.style, { left: `${halo.x}px`, top: `${halo.y}px`, width: `${halo.w}px`, height: `${halo.h}px` });
      const label = made("span", `map-group g-${halo.group}`);
      Object.assign(label.style, { left: `${halo.lx}px`, top: `${halo.ly}px` });
      label.textContent = halo.label;
      return [ring, label];
    }),
  );
  byId("map-links").replaceChildren(
    ...view.links.map((link) => {
      const line = made("div", `map-link${link.dashed ? " map-dashed" : ""}`);
      Object.assign(line.style, { left: `${link.x}px`, top: `${link.y}px`, width: `${link.len}px`, transform: `rotate(${link.deg}deg)` });
      if (link.packet) {
        const packet = made("span", "map-packet");
        packet.style.setProperty("--len", `${link.len}px`);
        packet.style.animationDuration = `${link.seconds}s`;
        packet.style.animationDelay = `${link.offset}s`;
        line.append(packet);
      }
      return line;
    }),
  );
  byId("map-nodes").replaceChildren(
    ...view.nodes.map((node) => {
      const one = made("div", `map-node g-${node.group} s-${node.state}${node.fx === "external" ? " ext" : ""}`);
      Object.assign(one.style, { left: `${node.left}px`, top: `${node.top}px`, width: `${node.size}px`, height: `${node.size}px`, animationDelay: `${node.delayMs}ms` });
      const label = made("span", "map-label");
      Object.assign(label.style, { left: `${node.lx}px`, top: `${node.ly}px`, textAlign: node.align });
      const note = [stateWord(node.state), node.note].filter((part) => part !== "").join(", ");
      label.append(node.id);
      if (note !== "") {
        const extra = made("span", "map-note");
        extra.textContent = ` ${note}`;
        label.append(extra);
      }
      one.append(...effectOf(node.fx), made("span", "map-dot"), label);
      return one;
    }),
  );
  byId("map-chips").replaceChildren(
    ...view.chips.map((chip) => {
      const one = made("span", `map-chip t-${chip.tone}`);
      one.textContent = chip.text;
      return one;
    }),
  );
  return true;
}

/** @type {import("./wall-switches.js").SeenSwitches} */
let seenSwitches = {};

/**
 * @param {import("./wall-cards.js").Opened | null} open
 * @param {number} now
 * @returns {boolean}
 */
function showSwitches(open, now) {
  const box = byId("switches");
  const details = open?.page.id === "switches" ? detailsShown(detail, "switches", Date.now()) : null;
  const shown = open !== null && isSwitchboard(details);
  stage.classList.toggle("switched", shown);
  box.hidden = !shown;
  if (!shown || open === null || !isSwitchboard(details)) return false;
  setText(byId("sw-by"), byLine(open.page.by) || "On the wall");
  byId("sw-left").style.transform = `scaleX(${pageLeftMs(open, now) / pageShownMs})`;
  const key = JSON.stringify(details);
  if (box.dataset.shown === key) return true;
  box.dataset.shown = key;
  const built = switchboardView(details, seenSwitches, Date.now());
  seenSwitches = built.seen;
  setText(byId("sw-said"), built.view.said);
  setText(byId("sw-how"), built.view.how);
  byId("sw-panels").replaceChildren(
    ...built.view.panels.map((panel) => {
      const one = made("section", `sw-panel p-${panel.id}`);
      one.setAttribute("aria-label", `${panel.title} switches`);
      const head = made("div", "sw-head");
      const name = made("h2", "sw-name");
      name.textContent = panel.title;
      const count = made("span", "sw-count");
      count.textContent = panel.count;
      head.append(name, count);
      one.append(head);
      if (panel.empty !== "") {
        const empty = made("p", "sw-empty");
        empty.textContent = panel.empty;
        one.append(empty);
        return one;
      }
      const grid = made("div", "sw-grid");
      grid.append(
        ...panel.rows.map((row) => {
          const line = made("div", `sw-row${row.on ? " on" : ""}${row.hand ? " hand" : ""}${row.flipped ? " flipped" : ""}`);
          const pill = made("span", "sw-pill");
          pill.setAttribute("role", "img");
          pill.setAttribute("aria-label", `${row.label}: ${row.on ? "on" : "off"}`);
          pill.append(made("span", "sw-knob"));
          const words = made("div", "sw-words");
          const label = made("span", "sw-label");
          label.textContent = row.label;
          const sub = made("span", "sw-key");
          sub.textContent = row.sub;
          words.append(label, sub);
          line.append(pill, words);
          return line;
        }),
      );
      one.append(grid);
      return one;
    }),
  );
  return true;
}

/**
 * @param {import("./wall-cards.js").Opened | null} open
 * @param {number} now
 * @returns {boolean}
 */
function showSecurity(open, now) {
  const box = byId("security");
  const details = open?.page.id === "security" ? detailsShown(detail, "security", Date.now()) : null;
  const shown = open !== null && isSecurityPage(details);
  stage.classList.toggle("secured", shown);
  box.hidden = !shown;
  if (!shown || open === null || !isSecurityPage(details)) return false;
  setText(byId("sec-by"), byLine(open.page.by) || "On the wall");
  byId("sec-left").style.transform = `scaleX(${pageLeftMs(open, now) / pageShownMs})`;
  const key = JSON.stringify(details);
  if (box.dataset.shown === key) return true;
  box.dataset.shown = key;
  const view = securityView(details);
  setText(byId("sec-quiet"), view.quiet);
  setText(byId("sec-look"), view.look);
  byId("sec-look").classList.toggle("warm", view.lookTone === "warm");
  byId("sec-dot").classList.toggle("warm", !details.quiet);
  setText(byId("sec-note"), securityNote);
  byId("sec-rings").replaceChildren(
    ...view.rings.flatMap((ring) => {
      const circle = made("span", `sec-ring r-${ring.id}${ring.warn ? " warn" : ""}`);
      circle.setAttribute("aria-hidden", "true");
      Object.assign(circle.style, { left: `${ring.left}px`, top: `${ring.top}px`, width: `${ring.size}px`, height: `${ring.size}px` });
      const label = made("span", `sec-ring-label r-${ring.id}${ring.warn ? " warn" : ""}`);
      Object.assign(label.style, { left: `${ring.labelLeft}px`, top: `${ring.labelTop}px` });
      const words = document.createElement("span");
      words.textContent = ring.label;
      label.append(words);
      return [circle, label];
    }),
  );
  byId("sec-knocks").replaceChildren(
    ...view.knocks.map((knock) => {
      const arm = made("div", "sec-arm");
      arm.style.transform = `rotate(${knock.angle}deg)`;
      const dot = made("span", "sec-knock");
      dot.style.animationDelay = `${knock.delay}s`;
      arm.append(dot);
      return arm;
    }),
  );
  byId("sec-cards").replaceChildren(
    ...view.cards.map((card) => {
      const one = made("section", `sec-card c-${card.id}${card.look ? " look" : ""}`);
      one.setAttribute("aria-label", card.title);
      const title = made("h2", "sec-card-title");
      title.textContent = card.title;
      one.append(
        title,
        ...card.rows.map((row) => {
          const line = made("div", "sec-row");
          const k = made("span", "sec-k");
          k.textContent = row.k;
          const v = made("span", `sec-v t-${row.tone}`);
          v.textContent = row.v;
          line.append(k, v);
          return line;
        }),
      );
      return one;
    }),
  );
  return true;
}

/**
 * @returns {Target[]}
 */
function targets() {
  /** @type {Target[]} */
  const list = [];
  if (pages.opened !== null && !card.hidden) list.push({ kind: "card", key: pages.opened.page.id, box: { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight } });
  else if (!["mapped", "switched", "secured"].some((name) => stage.classList.contains(name))) list.push(...pages.boxes.map((one) => /** @type {Target} */ ({ kind: "item", key: one.key, box: one.box })));
  if (!fitChipBox.hidden) list.push({ kind: "fit", key: "fit", box: fitChip });
  return list;
}

/**
 * @param {number} now
 */
function drawPointer(now) {
  const showing = pointerShown(pages.movedAt, now) && login.hidden && setup.hidden;
  pointer.hidden = !showing;
  fitChipBox.hidden = !showing;
  pointer.style.transform = `translate(${pages.point.x}px, ${pages.point.y}px)`;
  const dots = showing ? trailOf(pages.points, now) : [];
  trail.replaceChildren(
    ...dots.map((one, i) => {
      const dot = document.createElement("span");
      dot.style.left = `${one.x}px`;
      dot.style.top = `${one.y}px`;
      dot.style.opacity = String(((i + 1) / (dots.length + 1)) * 0.4);
      return dot;
    }),
  );
  const list = showing ? targets() : [];
  const reached = bubbleFor(pages.point, list.map((one) => one.box));
  pages.reached = reached === null ? null : list[reached];
  const box = reached === null ? { left: pages.point.x - 18, top: pages.point.y - 18, width: 36, height: 36 } : bubbleAround(list[reached].box);
  bubble.style.left = `${box.left}px`;
  bubble.style.top = `${box.top}px`;
  bubble.style.width = `${box.width}px`;
  bubble.style.height = `${box.height}px`;
  bubble.classList.toggle("on", reached !== null);
}

/**
 * @param {unknown} view
 */
function takePages(view) {
  pages.privateNow = privateOf(view, pages.privateNow);
  if (!isPageView(view)) return;
  const next = fromHub(pages.opened, view, pages.seen, Date.now());
  pages.opened = next.opened;
  pages.seen = next.seen;
}

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function pointerKey(event) {
  if (state.picture?.remote !== true) return false;
  const now = Date.now();
  const showing = pointerShown(pages.movedAt, now);
  if (["Escape", "Backspace", "GoBack", "BrowserBack"].includes(event.key) && pages.opened !== null) {
    event.preventDefault();
    pages.opened = null;
    render();
    return true;
  }
  const moved = movePointer(pages.point, event.key, { repeat: event.repeat, shift: event.shiftKey });
  if (moved !== null) {
    event.preventDefault();
    if (showing) {
      pages.points = trailOf([...pages.points, { ...pages.point, at: now }], now);
      pages.point = moved;
    } else pages.points = [];
    pages.movedAt = now;
    drawPointer(now);
    setTimeout(() => drawPointer(Date.now()), trailMs + 30);
    return true;
  }
  if (event.key !== "Enter" || !showing) return false;
  event.preventDefault();
  pages.movedAt = now;
  const reached = pages.reached;
  if (reached?.kind === "fit") {
    openSetup();
    return true;
  }
  if (reached?.kind === "card") pages.opened = null;
  if (reached?.kind === "item") {
    const item = state.picture?.items.find((one) => one.key === reached.key);
    const next = item === undefined ? null : openHere(item, pages.privateNow, now);
    if (next !== null) pages.opened = next;
  }
  render();
  return true;
}

export function render() {
  const picture = state.picture;
  const now = Date.now();
  pages.opened = stillOpen(pages.opened, now);
  const accent = modeColour(picture?.mode ?? null);
  document.documentElement.style.setProperty("--accent", accent);
  for (const phase of ["morning", "daytime", "bedtime"]) document.body.classList.toggle(`phase-${phase}`, (picture?.phase ?? "daytime") === phase);
  const clockNow = londonClock(new Date());
  setText(byId("clock"), clockNow);
  setText(byId("day"), picture?.day ?? "");
  showMorning(picture, clockNow);
  const connected = state.pictureFailures < failuresBeforeLost && state.jarvisFailures < failuresBeforeLost;
  const pose = poseFor({ jarvis: state.jarvis, connected, mode: picture?.mode ?? null, phase: picture?.phase ?? "daytime" });
  showPose(pose === "speaking" && picture?.speaking === "string" ? "string" : pose);
  setText(label, poseLabels[pose]);
  poseBox.setAttribute("aria-label", `Jarvis: ${poseLabels[pose]}`);
  const chosen = pages.opened === null ? currentMiddle() : null;
  const spot = jarvisSpot();
  const scale = picture?.phase === "bedtime" ? bedtimeSpot.scale : 1;
  jarvisBox.style.transform = `translate(${spot.x - 120}px, ${spot.y - 120}px) scale(${scale})`;
  jarvisBox.classList.toggle("centred-off", chosen !== null || pages.opened !== null || picture?.phase !== "daytime");
  const quietPoses = ["waiting", "guest", "done", "sleepy", "muted"];
  sun.hidden = (picture?.playing ?? null) === null || !quietPoses.includes(pose);
  const counting = picture === null ? null : countdownOf(picture.timers, now);
  countdown.toggleAttribute("hidden", counting === null || picture?.phase === "bedtime");
  if (counting !== null) countdownLeft.setAttribute("stroke-dashoffset", String(-(1 - counting.fraction) * circumference));
  if (picture !== null) {
    showMiddle(chosen, picture);
    showOrbit(picture, pages.opened !== null ? pages.opened.page.id : middleKey(chosen), accent);
    showArcs(picture);
    setText(byId("quiet-clock"), londonClock(new Date()));
    setText(byId("quiet-words"), bedtimeLine(picture));
  }
  followDetails(now);
  showCard(now);
  drawPointer(now);
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
      const response = await fetch(`/api/wall/jarvis?after=${state.seq}&private=${encodeURIComponent(pages.privateNow.join(","))}`, { cache: "no-store", signal: limited(signal, jarvisLimitMs) });
      if (refused(response)) return;
      if (!response.ok) throw new Error(`the hub answered ${response.status}`);
      /** @type {JarvisView} */
      const jarvis = await response.json();
      state.jarvis = jarvis;
      takePages(jarvis);
      state.jarvisAt = Date.now();
      state.seq = jarvis.seq;
      state.jarvisFailures = 0;
      render();
    } catch {
      if (signal.aborted) return;
      state.jarvisFailures++;
      pages.seen = { opens: null, backs: null };
      render();
      await pause(retryMs, signal);
    }
  }
}

function start() {
  state.running?.abort();
  const running = new AbortController();
  state.running = running;
  pages.seen = { opens: null, backs: null };
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
  byId("setup-remote").hidden = state.picture?.remote !== true;
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
    if (pointerKey(event)) return;
    if (event.key === "f" || event.key === "F") openSetup();
    else offerSetup();
    return;
  }
  if (event.key === "Enter" && state.picture?.remote === true) {
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && setup.contains(active) && !active.classList.contains("handle")) return;
    event.preventDefault();
    const next = nextCorner(fitting.picked);
    fitting.picked = next === "save" ? null : next;
    placeHandles();
    if (next === "save") byId("fit-save").focus();
    else if (active instanceof HTMLElement) active.blur();
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
  const by = cornerStep(event.repeat && state.picture?.remote === true, event.shiftKey);
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

if (new URLSearchParams(window.location.search).get("debug") === "1") {
  fps.hidden = false;
  /** @type {number[]} */
  const frames = [];
  let shownAt = 0;
  /**
   * @param {number} at
   */
  const frame = (at) => {
    frames.push(at);
    while (frames.length > 0 && at - frames[0] > 2000) frames.shift();
    if (at - shownAt > 500) {
      shownAt = at;
      setText(fps, `${framesASecond(frames, at)} fps`);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
