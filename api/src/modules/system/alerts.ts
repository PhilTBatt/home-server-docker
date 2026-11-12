export type Status = {
  uptimeSeconds: number;
  memoryTotalMB: number;
  memoryAvailableMB: number;
  diskTotalGB: number;
  diskAvailableGB: number;
};

export type Problem = {
  code: "disk-low" | "memory-low" | "wifi-reconnects";
  message: string;
};

const lowFraction = 0.1;
const dayMs = 24 * 60 * 60 * 1000;

export function findProblems(status: Status, reconnectTimes: string[], now: Date): Problem[] {
  const problems: Problem[] = [];

  if (status.diskAvailableGB < status.diskTotalGB * lowFraction) {
    problems.push({
      code: "disk-low",
      message: `Disk is low: ${status.diskAvailableGB} of ${status.diskTotalGB} GB free.`,
    });
  }

  if (status.memoryAvailableMB < status.memoryTotalMB * lowFraction) {
    problems.push({
      code: "memory-low",
      message: `Memory is low: ${status.memoryAvailableMB} of ${status.memoryTotalMB} MB available.`,
    });
  }

  const dayAgo = now.getTime() - dayMs;
  const recentCount = reconnectTimes.filter((time) => new Date(time).getTime() >= dayAgo).length;
  if (recentCount > 0) {
    problems.push({
      code: "wifi-reconnects",
      message: `Wi-Fi reconnected ${recentCount} time${recentCount === 1 ? "" : "s"} in the last 24 hours.`,
    });
  }

  return problems;
}