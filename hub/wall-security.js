// @ts-check

export const securityRingIds = ["internet", "tailscale", "home", "caddy", "tokens", "networks"];
export const securityCardIds = ["ways", "keys", "risky", "secrets", "today", "running"];
export const securityTones = ["good", "warn", "plain"];
export const securityCentre = { x: 304, y: 400 };
export const ringRadii = [240, 200, 160, 120, 80, 46];
export const knockAngles = [180, 140, 220, 270, 90];

/**
 * @typedef {{ k: string, v: string, tone: string }} SecurityRow
 * @typedef {{ id: string, title: string, rows: SecurityRow[], look: boolean }} SecurityCard
 * @typedef {{ id: string, label: string, tone: string }} SecurityRing
 * @typedef {{ kind: "security", quiet: boolean, wrong: number, look: number, rings: SecurityRing[], cards: SecurityCard[], knocks: number }} SecurityPage
 * @typedef {{ id: string, label: string, warn: boolean, left: number, top: number, size: number, labelLeft: number, labelTop: number }} RingView
 * @typedef {{ angle: number, delay: number }} KnockView
 * @typedef {{ quiet: string, look: string, lookTone: string, rings: RingView[], knocks: KnockView[], cards: SecurityCard[] }} SecurityView
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {number} most
 * @returns {boolean}
 */
function isText(value, most) {
  return typeof value === "string" && value.length > 0 && value.length <= most;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * @param {unknown} value
 * @returns {value is SecurityPage}
 */
export function isSecurityPage(value) {
  if (!isObject(value) || value.kind !== "security" || typeof value.quiet !== "boolean" || !isCount(value.wrong) || !isCount(value.look) || !isCount(value.knocks) || Number(value.knocks) > knockAngles.length) return false;
  if (!Array.isArray(value.rings) || value.rings.length !== securityRingIds.length || !Array.isArray(value.cards) || value.cards.length !== securityCardIds.length) return false;
  const ringsFit = value.rings.every((ring, i) => isObject(ring) && ring.id === securityRingIds[i] && isText(ring.label, 40) && securityTones.includes(String(ring.tone)));
  const cardsFit = value.cards.every((card, i) => isObject(card) && card.id === securityCardIds[i] && isText(card.title, 60) && typeof card.look === "boolean" && Array.isArray(card.rows) && card.rows.length <= 4 && card.rows.every((row) => isObject(row) && isText(row.k, 40) && isText(row.v, 40) && securityTones.includes(String(row.tone))));
  return ringsFit && cardsFit;
}

/**
 * @param {SecurityPage} page
 * @returns {SecurityView}
 */
export function securityView(page) {
  const { x, y } = securityCentre;
  const rings = page.rings.map((ring, i) => {
    const r = ringRadii[i];
    return { id: ring.id, label: ring.label, warn: ring.tone === "warn", left: x - r, top: y - r, size: r * 2, labelLeft: x - 90, labelTop: y - r - 8 };
  });
  const knocks = knockAngles.slice(0, page.knocks).map((angle, i) => ({ angle, delay: -i * 0.9 }));
  return {
    quiet: page.quiet ? "All quiet" : `${page.wrong.toLocaleString("en-GB")} wrong today`,
    look: page.look === 0 ? "" : `· ${page.look} ${page.look === 1 ? "thing" : "things"} to look at`,
    lookTone: page.quiet ? "warn" : "warm",
    rings,
    knocks,
    cards: page.cards,
  };
}

export const securityNote = "No way in from the internet and Tailscale only are how the router and Tailscale were set up, which the hub can't check. The risky settings, Docker's ports and the secrets are checked by the repo's tests against the compose files; the keys, today and the backups are the hub's own. White dots bouncing off the outside are a picture; yellow ones at the tokens ring are today's real wrong tokens.";
