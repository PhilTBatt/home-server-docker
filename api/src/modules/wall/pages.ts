export type WallPage = { id: string; title: string; say: readonly string[] };

export const pageShownMs = 120_000;
export const pageBys = ["words", "jarvis"] as const;
export type PageBy = (typeof pageBys)[number];

export const wallPages: readonly WallPage[] = [
  { id: "server", title: "The server", say: ["show me the server", "put the server on the wall"] },
  { id: "train", title: "Your trains", say: ["show me my trains", "show me the trains", "show me my journey", "show me my train", "show me the next train", "show me my next train"] },
  { id: "backup", title: "The backup", say: ["show me the backup"] },
  { id: "alerts", title: "Alerts", say: ["show me the alerts"] },
  { id: "deals", title: "Deals", say: ["show me the deals"] },
  { id: "reminder", title: "Reminders", say: ["show me my reminders", "show me the reminders"] },
  { id: "music", title: "Now playing", say: ["show me what's playing", "show me the music"] },
  { id: "switches", title: "The switches", say: ["show me the switches", "show me the switchboard"] },
  { id: "security", title: "What's protected", say: ["show me what's protected", "show me the security", "show me security"] },
  { id: "health", title: "The server's health", say: ["show me the server's health", "show me the health", "show me how the server is"] },
];

export const pageIds: readonly string[] = wallPages.map((page) => page.id);

export function isPageId(value: unknown): value is string {
  return typeof value === "string" && pageIds.includes(value);
}

export function isPageBy(value: unknown): value is PageBy {
  return typeof value === "string" && (pageBys as readonly string[]).includes(value);
}

export function readPrivatePages(text: string): string[] | null {
  const ids = text
    .split(",")
    .map((one) => one.trim())
    .filter((one) => one !== "");
  if (!ids.every(isPageId)) return null;
  return [...new Set(ids)];
}

export function hiddenNow(privatePages: readonly string[], mode: string | null): (id: string) => boolean {
  return (id) => mode === "guest" && privatePages.includes(id);
}
