export const sessionStates = ["waiting", "working", "stopped"] as const;
export const namePattern = /^[a-z0-9-]{1,20}$/;
export const mostSessions = 10;
export const keptChanges = 50;
export const keptChangesMs = 24 * 60 * 60 * 1000;

export type SessionState = (typeof sessionStates)[number];
export type Session = { name: string; state: SessionState; since: string; lastSeen: string };
export type SessionChange = { seq: number; name: string; state: SessionState; was: SessionState | null; at: string };
export type ChangesAnswer = { seq: number; changes: Omit<SessionChange, "seq">[] };
export type SessionLog = {
  info?: (fields: Record<string, unknown>, message: string) => void;
  warn?: (fields: Record<string, unknown>, message: string) => void;
};
export type Sessions = {
  set(name: string, state: SessionState, now: Date): Session | { refused: string };
  list(): Session[];
  changes(after: number, now: Date): ChangesAnswer;
};

export function createSessions(options: { log?: SessionLog } = {}): Sessions {
  const { log } = options;
  const sessions = new Map<string, Session>();
  let feed: SessionChange[] = [];
  let seq = 0;
  return {
    set(name, state, now) {
      const at = now.toISOString();
      const before = sessions.get(name);
      if (before === undefined && sessions.size >= mostSessions) {
        log?.warn?.({ sessions: sessions.size }, "a session's state was refused: the hub already knows the most it keeps");
        return { refused: `The hub already knows ${mostSessions} sessions, the most it keeps` };
      }
      if (before !== undefined && before.state === state) {
        before.lastSeen = at;
        return { ...before };
      }
      const session: Session = { name, state, since: at, lastSeen: at };
      sessions.set(name, session);
      seq++;
      feed.push({ seq, name, state, was: before?.state ?? null, at });
      feed = feed.filter((one) => Date.parse(one.at) + keptChangesMs > now.getTime()).slice(-keptChanges);
      log?.info?.({ name, from: before?.state ?? null, to: state, seq, forSeconds: before === undefined ? null : Math.round((now.getTime() - Date.parse(before.since)) / 1000), sessions: sessions.size }, "session state changed");
      return { ...session };
    },
    list() {
      return [...sessions.values()].map((one) => ({ ...one })).sort((a, b) => a.name.localeCompare(b.name));
    },
    changes(after, now) {
      return { seq, changes: feed.filter((one) => one.seq > after && Date.parse(one.at) + keptChangesMs > now.getTime()).map(({ seq: _seq, ...rest }) => rest) };
    },
  };
}
