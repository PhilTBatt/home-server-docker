import type { Problem } from "../system/alerts.js";

export type Notification = {
  title: string;
  message: string;
  tags: string;
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

export async function sendToNtfy(topic: string, notification: Notification): Promise<void> {
  const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: { Title: notification.title, Tags: notification.tags },
    body: notification.message,
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