export const microphones = ["pretend"] as const;
export type Microphone = (typeof microphones)[number];

export type Config = { token: string; microphone: Microphone | null };

export const shortestToken = 32;

export function readConfig(env: Record<string, string | undefined>): Config {
  const token = env.EARS_TOKEN?.trim() ?? "";
  if (token === "") throw new Error("Missing setting: EARS_TOKEN. Make one with: openssl rand -hex 32");
  if (token.length < shortestToken) throw new Error(`EARS_TOKEN must be at least ${shortestToken} characters, like the 64 that openssl rand -hex 32 makes`);
  const microphone = env.EARS_MICROPHONE?.trim() || "";
  if (microphone !== "" && !(microphones as readonly string[]).includes(microphone)) throw new Error(`EARS_MICROPHONE must be pretend, or left out until a real microphone is set up, not "${microphone}"`);
  return { token, microphone: microphone === "" ? null : (microphone as Microphone) };
}
