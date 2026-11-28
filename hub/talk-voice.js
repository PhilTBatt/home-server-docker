// @ts-check

/**
 * @param {{ voices?: number, voice: boolean }} view
 * @returns {number}
 */
export function voicePieces(view) {
  return view.voices ?? (view.voice ? 1 : 0);
}

/**
 * @param {string} id
 * @param {number} part
 * @returns {string}
 */
export function voiceUrl(id, part) {
  return `/api/talk/${encodeURIComponent(id)}/voice?part=${part}`;
}

/**
 * @param {number} now
 * @param {number} playAt
 * @param {number} duration
 * @returns {{ at: number, next: number }}
 */
export function slotFor(now, playAt, duration) {
  const at = Math.max(now, playAt);
  return { at, next: at + duration };
}

/**
 * @param {boolean} played
 * @param {boolean} live
 * @returns {"start" | "play" | "keep"}
 */
export function onArrival(played, live) {
  if (!played) return "start";
  return live ? "play" : "keep";
}
