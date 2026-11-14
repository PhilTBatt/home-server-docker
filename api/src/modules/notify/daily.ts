import { switchedOff, type Features } from "../../config.js";
import type { Problem, Status } from "../system/alerts.js";
import { sendToNtfy, type Notification } from "./notifier.js";

export function londonTime(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function brainLine(waiting: number | null): string {
  if (waiting === null) return "Brain: couldn't read the inbox.";
  if (waiting === 0) return "Brain: no notes waiting.";
  return `Brain: ${waiting} note${waiting === 1 ? "" : "s"} waiting.`;
}

export function summaryFor(status: Status, problems: Problem[], features: Features, waiting: number | null): Notification {
  const memoryFree = (status.memoryAvailableMB / 1024).toFixed(1);
  const memoryTotal = (status.memoryTotalMB / 1024).toFixed(1);
  const off = switchedOff(features);
  const lines = [
    `Up ${formatUptime(status.uptimeSeconds)}.`,
    `Memory: ${memoryFree} of ${memoryTotal} GB available.`,
    `Disk: ${status.diskAvailableGB} of ${status.diskTotalGB} GB free.`,
    problems.length === 0 ? "No problems." : `Problems:\n${problems.map((p) => p.message).join("\n")}`,
  ];
  if (features.memoryInbox) lines.push(brainLine(waiting));
  if (off.length > 0) lines.push(`Switched off: ${off.join(", ")}.`);
  return { title: "Home Hub: daily summary", message: lines.join("\n"), tags: "memo" };
}

export function createDailySummary(
  topic: string,
  getStatus: () => Promise<Status>,
  getProblems: () => Promise<Problem[]>,
  hour: number,
  features: Features,
  getWaiting: () => Promise<number>
) {
  let lastSentDay = "";
  return async function sendIfDue(now: Date): Promise<boolean> {
    const time = londonTime(now);
    if (time.hour !== hour || time.day === lastSentDay) {
      return false;
    }
    const status = await getStatus();
    const problems = await getProblems();
    const waiting = features.memoryInbox ? await getWaiting().catch(() => null) : null;
    await sendToNtfy(topic, summaryFor(status, problems, features, waiting));
    lastSentDay = time.day;
    return true;
  };
}