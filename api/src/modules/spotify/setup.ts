import { createSpotifyAuth, type SpotifyLog, type SpotifySettings } from "./auth.js";
import { createSpotifyClient } from "./client.js";
import type { SpotifyParts } from "./routes.js";

export function spotifyFor(settings: SpotifySettings, log: SpotifyLog): SpotifyParts {
  const auth = createSpotifyAuth({ settings, log });
  return { auth, client: createSpotifyClient({ auth, log }) };
}
