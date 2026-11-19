import type { Problem } from "../system/alerts.js";

export type Notification = {
  title: string;
  message: string;
  tags: string;
  click?: string;
  priority?: 1 | 2 | 3 | 4 | 5;
};

export function notificationFor(previousCodes: string[], problems: Problem[]): Notification | null {
  const before = [...previousCodes].sort().join(",");
  const now = problems
    .map((p) => p.code)
    .sort()
    .join(",");
  if (before === now) {
    return null;
  }
  if (problems.length === 0) {
    return { title: "Home Hub: all clear", message: "No problems on the server.", tags: "white_check_mark" };
  }
  return {
    title: problems.length === 1 ? "Home Hub: 1 problem" : `Home Hub: ${problems.length} problems`,
    message: problems.map((p) => p.message).join("\n"),
    tags: "warning",
  };
}

export function safeLink(link: string | undefined): string | null {
  if (link === undefined || !/^https:\/\/[\x21-\x7E]+$/.test(link) || link.length > 500) return null;
  if (!URL.canParse(link)) return null;
  const url = new URL(link);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  return url.href;
}

export async function sendToNtfy(topic: string, notification: Notification, timeoutMs = 10_000): Promise<void> {
  const headers: Record<string, string> = { Title: notification.title, Tags: notification.tags };
  const link = safeLink(notification.click);
  if (link !== null) headers.Click = link;
  if (notification.priority !== undefined && [1, 2, 4, 5].includes(notification.priority)) headers.Priority = String(notification.priority);
  const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers,
    body: notification.message,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`ntfy replied ${response.status}`);
  }
}

export function createNotifier(topic: string, getProblems: () => Promise<Problem[]>) {
  let lastCodes: string[] = [];
  return async function checkAndNotify(): Promise<boolean> {
    const problems = await getProblems();
    const notification = notificationFor(lastCodes, problems);
    if (notification === null) {
      return false;
    }
    await sendToNtfy(topic, notification);
    lastCodes = problems.map((p) => p.code);
    return true;
  };
}