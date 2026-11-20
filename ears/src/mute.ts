export const switchFile = "/switch/mute";
export const switchEveryMs = 200;

export type SwitchSays = { muted: true } | { muted: false; id: string };

export function readSwitch(text: string | null): SwitchSays {
  const line = text?.replace(/\r?\n$/, "") ?? "";
  const unmuted = /^unmuted ([0-9A-Za-z._-]{1,64})$/.exec(line);
  return unmuted === null ? { muted: true } : { muted: false, id: unmuted[1] };
}

export type Reading = { text: string | null; readable: boolean };

export type MuteSwitch = { saw(reading: Reading): "mute" | "unmute" | null };

export function createMuteSwitch(atStart: Reading): MuteSwitch {
  const seen = new Set<string>();
  const remember = (text: string | null) => {
    const says = readSwitch(text);
    if (!says.muted) seen.add(says.id);
  };
  let waiting = !atStart.readable;
  let last = atStart.text;
  if (!waiting) remember(atStart.text);
  return {
    saw(reading) {
      if (waiting) {
        if (!reading.readable) return null;
        waiting = false;
        last = reading.text;
        remember(reading.text);
        return null;
      }
      if (reading.text === last) return null;
      last = reading.text;
      const says = readSwitch(reading.text);
      if (says.muted) return "mute";
      if (seen.has(says.id)) return null;
      seen.add(says.id);
      return "unmute";
    },
  };
}

export function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

export type SwitchWatch = { stop(): void };

export async function watchSwitch(options: { read: () => Promise<string>; everyMs?: number; onMute: () => void; onUnmute: () => void }): Promise<SwitchWatch> {
  const read = (): Promise<Reading> => options.read().then((text) => ({ text, readable: true }), (error: unknown) => ({ text: null, readable: missing(error) }));
  const switched = createMuteSwitch(await read());
  let reading = false;
  let stopped = false;
  const timer = setInterval(async () => {
    if (reading || stopped) return;
    reading = true;
    try {
      const change = switched.saw(await read());
      if (stopped) return;
      if (change === "mute") options.onMute();
      if (change === "unmute") options.onUnmute();
    } finally {
      reading = false;
    }
  }, options.everyMs ?? switchEveryMs);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
