export const memoryStatPath = "/sys/fs/cgroup/memory.stat";

export function readAnonMemoryMb(read: (path: string) => string): number | null {
  try {
    const line = read(memoryStatPath).split("\n").find((entry) => entry.startsWith("anon "));
    if (line === undefined) return null;
    const bytes = Number(line.slice(5));
    if (!Number.isFinite(bytes) || bytes < 0) return null;
    return Math.round(bytes / 1024 / 1024);
  } catch {
    return null;
  }
}