// @ts-check

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} event
 * @returns {event is { at: string, title: string }}
 */
function isHubEvent(event) {
  return isObject(event) && typeof event.at === "string" && Number.isFinite(Date.parse(event.at)) && typeof event.title === "string";
}

/**
 * @param {unknown} reply
 * @param {(at: string) => string} timeOf
 * @returns {string[] | null}
 */
export function todayLines(reply, timeOf) {
  if (!isObject(reply) || !Array.isArray(reply.events) || !reply.events.every(isHubEvent) || typeof reply.more !== "number") return null;
  /** @type {{ at: string, title: string }[]} */
  const events = reply.events;
  const lines = [...events].reverse().map((event) => `${timeOf(event.at)} ${event.title}`);
  if (reply.more > 0) lines.push(`and ${reply.more} earlier`);
  return lines.length === 0 ? ["Nothing yet today."] : lines;
}
