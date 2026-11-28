import { boardAheadMinutes, clockMinutes, readDays, readWindow, type AlertSettings } from "./modules/trains/alerts.js";
import { safeBoardUrl, type TrainSettings } from "./modules/trains/board.js";
import { detailedBoardUrl } from "./modules/trains/journeys.js";
import { mostRepos, readRepos, validToken } from "./modules/catchup/github.js";
import { latestBedtimeFrom, latestBedtimeUntil, type ModeSettings } from "./modules/modes/modes.js";
import { readRedirectUri, validClientId, type SpotifySettings } from "./modules/spotify/auth.js";
import { projectorPowers, type ProjectorSettings } from "./modules/projector/projector.js";
import { readMorningAt, type MorningSettings } from "./modules/morning/morning.js";
import { pageIds, readPrivatePages } from "./modules/wall/pages.js";

export type Features = {
  alerts: boolean;
  heartbeat: boolean;
  dailySummary: boolean;
  memoryInbox: boolean;
  memoryUpload: boolean;
  deals: boolean;
  findPhone: boolean;
  trains: boolean;
  trainAlerts: boolean;
  expiryAlerts: boolean;
  watchers: boolean;
  catchUp: boolean;
  modes: boolean;
  reminders: boolean;
  chores: boolean;
  sessions: boolean;
  spotify: boolean;
  talk: boolean;
  wall: boolean;
  projector: boolean;
  events: boolean;
  morning: boolean;
  switches: boolean;
};

export type DealSettings = {
  seen: "memory" | "disk";
  ebayEnvironment: "production" | "sandbox";
  ebayClientId: string;
  ebayClientSecret: string;
  ai: boolean;
};

export type PhoneSettings = {
  ring: "once" | "clear" | "repeat";
  seconds: number;
};

export const wallSpeakings = ["wobble", "string"] as const;

export type WallSettings = {
  token: string;
  speaking: (typeof wallSpeakings)[number];
  privatePages: string[];
  remote: boolean;
};

export type CatchUpSettings = {
  repos: string[];
  token: string;
};

export type LoginSettings = {
  guard: boolean;
};

export type Config = {
  apiToken: string;
  qbitApiKey: string;
  jellyfinApiKey: string;
  ntfyTopic: string;
  healthcheckUrl: string;
  deals: DealSettings;
  trains: TrainSettings;
  trainAlerts: AlertSettings;
  catchUp: CatchUpSettings;
  modes: ModeSettings;
  phone: PhoneSettings;
  spotify: SpotifySettings;
  wall: WallSettings;
  login: LoginSettings;
  projector: ProjectorSettings;
  morning: MorningSettings;
  features: Features;
};

export const switchKeys: Record<keyof Features, string> = {
  alerts: "ALERTS",
  heartbeat: "HEARTBEAT",
  dailySummary: "DAILY_SUMMARY",
  memoryInbox: "MEMORY_INBOX",
  memoryUpload: "MEMORY_UPLOAD",
  deals: "DEALS",
  findPhone: "FIND_PHONE",
  trains: "TRAINS",
  trainAlerts: "TRAIN_ALERTS",
  expiryAlerts: "EXPIRY_ALERTS",
  watchers: "WATCHERS",
  catchUp: "CATCH_UP",
  modes: "MODES",
  reminders: "REMINDERS",
  chores: "CHORES",
  sessions: "SESSIONS",
  spotify: "SPOTIFY",
  talk: "TALK",
  wall: "WALL",
  projector: "PROJECTOR",
  events: "EVENTS",
  morning: "MORNING",
  switches: "SWITCHES",
};

export const featureLabels: Record<keyof Features, string> = {
  alerts: "alerts",
  heartbeat: "heartbeat",
  dailySummary: "daily summary",
  memoryInbox: "brain inbox",
  memoryUpload: "note uploads",
  deals: "deal watcher",
  findPhone: "find my phone",
  trains: "train times",
  trainAlerts: "train alerts",
  expiryAlerts: "expiry alerts",
  watchers: "watchers",
  catchUp: "catch-up",
  modes: "modes",
  reminders: "reminders",
  chores: "dev chores",
  sessions: "sessions",
  spotify: "Spotify",
  talk: "talk to Jarvis",
  wall: "the wall",
  projector: "the projector",
  events: "the events feed",
  morning: "the morning",
  switches: "switch flipping",
};

export function privateIPv4(text: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (match === null) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part, i) => part > 255 || String(part) !== match[i + 1])) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function switchedOff(features: Features): string[] {
  return Object.entries(featureLabels)
    .filter(([key]) => !features[key as keyof Features])
    .map(([, label]) => label);
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const missing: string[] = [];
  const notOnOrOff: string[] = [];
  const notAllowed: string[] = [];

  const read = (name: string, needed = true): string => {
    const value = env[name] ?? "";
    if (value === "" && needed) missing.push(name);
    return value;
  };
  const readSwitch = (name: string, needed = true): boolean => {
    const value = read(name, needed);
    if (value !== "" && value !== "on" && value !== "off") notOnOrOff.push(name);
    return value === "on";
  };
  const readChoice = <Choice extends string>(name: string, choices: readonly Choice[], needed: boolean): Choice => {
    const value = read(name, needed);
    const chosen = choices.find((choice) => choice === value);
    if (value !== "" && chosen === undefined) notAllowed.push(`${name} (${choices.join(" or ")})`);
    return chosen ?? choices[0];
  };

  const apiToken = read("API_TOKEN");
  const qbitApiKey = read("QBIT_API_KEY");
  const jellyfinApiKey = read("JELLYFIN_API_KEY");
  const features = {
    alerts: readSwitch(switchKeys.alerts),
    heartbeat: readSwitch(switchKeys.heartbeat),
    dailySummary: readSwitch(switchKeys.dailySummary),
    memoryInbox: readSwitch(switchKeys.memoryInbox),
    memoryUpload: readSwitch(switchKeys.memoryUpload),
    deals: readSwitch(switchKeys.deals),
    findPhone: readSwitch(switchKeys.findPhone),
    trains: readSwitch(switchKeys.trains),
    trainAlerts: readSwitch(switchKeys.trainAlerts),
    expiryAlerts: readSwitch(switchKeys.expiryAlerts),
    watchers: readSwitch(switchKeys.watchers),
    catchUp: readSwitch(switchKeys.catchUp),
    modes: readSwitch(switchKeys.modes),
    reminders: readSwitch(switchKeys.reminders),
    chores: readSwitch(switchKeys.chores),
    sessions: readSwitch(switchKeys.sessions),
    spotify: readSwitch(switchKeys.spotify),
    talk: readSwitch(switchKeys.talk),
    wall: readSwitch(switchKeys.wall),
    projector: readSwitch(switchKeys.projector),
    events: readSwitch(switchKeys.events),
    morning: readSwitch(switchKeys.morning),
    switches: readSwitch(switchKeys.switches),
  };
  const ntfyTopic = read("NTFY_TOPIC", features.alerts || features.dailySummary || features.deals || features.findPhone || features.trainAlerts || features.expiryAlerts || features.watchers || features.reminders);
  const healthcheckUrl = read("HEALTHCHECK_URL", features.heartbeat);
  const deals: DealSettings = {
    seen: readChoice("DEALS_SEEN", ["memory", "disk"], features.deals),
    ebayEnvironment: readChoice("EBAY_ENVIRONMENT", ["production", "sandbox"], features.deals),
    ebayClientId: read("EBAY_CLIENT_ID", features.deals),
    ebayClientSecret: read("EBAY_CLIENT_SECRET", features.deals),
    ai: readSwitch("DEALS_AI", features.deals),
  };
  const readStation = (name: string): string => {
    const value = read(name, features.trains);
    if (value !== "" && !/^[A-Z]{3}$/.test(value)) notAllowed.push(`${name} (a station's three-letter code in capitals, like KGX)`);
    return value;
  };
  const railKey = read("RAIL_DATA_KEY", features.trains);
  if (railKey !== "" && !/^[\x21-\x7E]{1,200}$/.test(railKey)) notAllowed.push("RAIL_DATA_KEY (printable characters with no spaces)");
  const from = readStation("TRAINS_FROM");
  const to = readStation("TRAINS_TO");
  if (to !== "" && to === from) notAllowed.push("TRAINS_TO (a different station from TRAINS_FROM)");
  const boardUrl = read("TRAINS_BOARD_URL", features.trains);
  if (boardUrl !== "" && safeBoardUrl(boardUrl) === null) notAllowed.push("TRAINS_BOARD_URL (an https address on raildata.org.uk ending just before the station code, with no ?, # or {crs} part)");
  const changeAt = read("TRAINS_CHANGE_AT", false);
  if (changeAt !== "" && !/^[A-Z]{3}$/.test(changeAt)) notAllowed.push("TRAINS_CHANGE_AT (a station's three-letter code in capitals, like KGX)");
  else if (changeAt !== "" && (changeAt === from || changeAt === to)) notAllowed.push("TRAINS_CHANGE_AT (a different station from TRAINS_FROM and TRAINS_TO)");
  const journeyNeeded = features.trains && changeAt !== "";
  const walkText = read("TRAINS_CHANGE_MINUTES", journeyNeeded);
  const walk = /^\d{1,2}$/.test(walkText) && Number(walkText) >= 1 && Number(walkText) <= 30 ? Number(walkText) : null;
  if (walkText !== "" && walk === null) notAllowed.push("TRAINS_CHANGE_MINUTES (a whole number of minutes from 1 to 30, like 3)");
  const arrivalsKey = read("RAIL_ARRIVALS_KEY", journeyNeeded);
  if (arrivalsKey !== "" && !/^[\x21-\x7E]{1,200}$/.test(arrivalsKey)) notAllowed.push("RAIL_ARRIVALS_KEY (printable characters with no spaces)");
  const arrivalsText = read("TRAINS_ARRIVALS_URL", journeyNeeded);
  const arrivalsUrl = arrivalsText === "" ? null : safeBoardUrl(arrivalsText);
  if (arrivalsText !== "" && (arrivalsUrl === null || !arrivalsUrl.endsWith("/GetArrBoardWithDetails"))) notAllowed.push("TRAINS_ARRIVALS_URL (the Live Arrival Board's https address on raildata.org.uk, ending in GetArrBoardWithDetails, with no ?, # or {crs} part)");
  const detailsUrl = detailedBoardUrl(safeBoardUrl(boardUrl) ?? "");
  if (changeAt !== "" && safeBoardUrl(boardUrl) !== null && detailsUrl === null) notAllowed.push("TRAINS_BOARD_URL (with TRAINS_CHANGE_AT set, an address ending in GetDepartureBoard or GetDepBoardWithDetails)");
  const journey = changeAt !== "" && walk !== null && arrivalsUrl !== null && detailsUrl !== null ? { at: changeAt, walk, arrivalsKey, arrivalsUrl, detailsUrl } : undefined;
  const trains: TrainSettings = { key: railKey, from, to, boardUrl: safeBoardUrl(boardUrl) ?? "", ...(journey === undefined ? {} : { journey }) };
  if (features.trainAlerts && env.TRAINS === "off") notAllowed.push("TRAIN_ALERTS (on needs TRAINS=on too)");
  const daysText = read("TRAIN_ALERT_DAYS", features.trainAlerts);
  const days = daysText === "" ? [] : readDays(daysText);
  if (days === null) notAllowed.push("TRAIN_ALERT_DAYS (days from mon, tue, wed, thu, fri, sat and sun, with commas between, like mon,wed)");
  const windowText = read("TRAIN_ALERT_WINDOW", features.trainAlerts);
  const alertWindow = windowText === "" ? null : readWindow(windowText);
  if (windowText !== "" && alertWindow === null) notAllowed.push("TRAIN_ALERT_WINDOW (two 24-hour times with a dash between, the first earlier and the second no later than 22:59, like 07:00-08:30)");
  const reminderText = read("TRAIN_ALERT_REMINDER", features.trainAlerts);
  const reminder = reminderText === "" ? null : clockMinutes(reminderText);
  if (reminderText !== "" && reminder === null) notAllowed.push("TRAIN_ALERT_REMINDER (a 24-hour time, like 06:45)");
  if (reminder !== null && alertWindow !== null && reminder >= alertWindow.end) notAllowed.push("TRAIN_ALERT_REMINDER (a time before TRAIN_ALERT_WINDOW ends)");
  if (reminder !== null && alertWindow !== null && reminder < alertWindow.end - boardAheadMinutes) notAllowed.push(`TRAIN_ALERT_REMINDER (no more than ${boardAheadMinutes / 60} hours before TRAIN_ALERT_WINDOW ends, since the board only looks about that far ahead)`);
  const trainAlerts: AlertSettings = { days: days ?? [], start: alertWindow?.start ?? 0, end: alertWindow?.end ?? 0, reminder: reminder ?? 0 };
  const reposText = read("CATCH_UP_REPOS", false);
  const repos = reposText === "" ? [] : readRepos(reposText);
  if (repos === null) notAllowed.push(`CATCH_UP_REPOS (up to ${mostRepos} GitHub repos as owner/repo, each once, with commas and no spaces between, like alpha/one,beta/two)`);
  const githubToken = read("CATCH_UP_GITHUB_TOKEN", false);
  if (githubToken !== "" && !validToken(githubToken)) notAllowed.push("CATCH_UP_GITHUB_TOKEN (a fine-grained GitHub token, starting github_pat_)");
  const catchUp: CatchUpSettings = { repos: repos ?? [], token: githubToken };
  const fromText = read("BEDTIME_FROM", false);
  const from24 = fromText === "" || fromText === "off" ? null : clockMinutes(fromText);
  if (fromText !== "" && fromText !== "off" && (from24 === null || from24 > latestBedtimeFrom)) notAllowed.push("BEDTIME_FROM (off, or a 24-hour time from 00:00 to 05:59, like 00:30)");
  const bedtimeFrom = from24 !== null && from24 <= latestBedtimeFrom ? from24 : null;
  const untilText = read("BEDTIME_UNTIL", features.modes && bedtimeFrom !== null);
  const until24 = untilText === "" ? null : clockMinutes(untilText);
  if (untilText !== "" && (until24 === null || until24 > latestBedtimeUntil)) notAllowed.push("BEDTIME_UNTIL (a 24-hour time before midday, like 07:30)");
  else if (until24 !== null && bedtimeFrom !== null && until24 <= bedtimeFrom) notAllowed.push("BEDTIME_UNTIL (a time later than BEDTIME_FROM)");
  const modes: ModeSettings = { bedtimeFrom, bedtimeUntil: until24 !== null && until24 <= latestBedtimeUntil && (bedtimeFrom === null || until24 > bedtimeFrom) ? until24 : null };
  const ring = readChoice("FIND_PHONE_RING", ["once", "clear", "repeat"], false);
  const secondsText = read("FIND_PHONE_SECONDS", false);
  const seconds = /^[1-9]\d{1,2}$/.test(secondsText) && Number(secondsText) >= 10 && Number(secondsText) <= 120 ? Number(secondsText) : null;
  if (secondsText !== "" && seconds === null) notAllowed.push("FIND_PHONE_SECONDS (a whole number of seconds from 10 to 120, like 30)");
  const phone: PhoneSettings = { ring, seconds: seconds ?? 30 };
  const spotifyClientId = read("SPOTIFY_CLIENT_ID", features.spotify);
  if (spotifyClientId !== "" && !validClientId(spotifyClientId)) notAllowed.push("SPOTIFY_CLIENT_ID (your app's Client ID from Spotify's developer dashboard: 32 characters, 0 to 9 and a to f)");
  const redirectText = read("SPOTIFY_REDIRECT_URI", features.spotify);
  const redirectUri = redirectText === "" ? "" : readRedirectUri(redirectText);
  if (redirectUri === null) notAllowed.push("SPOTIFY_REDIRECT_URI (exactly the Redirect URI in your app's settings: an https address, or http on 127.0.0.1 or [::1] with a port, with a path and no ?, # or spaces, like https://hub.home/spotify.html)");
  const spotify: SpotifySettings = { clientId: spotifyClientId, redirectUri: redirectUri ?? "" };
  const wallToken = read("WALL_TOKEN", features.wall);
  if (wallToken !== "" && !/^[\x21-\x7E]{32,200}$/.test(wallToken)) notAllowed.push("WALL_TOKEN (32 to 200 printable characters with no spaces, like what openssl rand -hex 24 prints)");
  else if (wallToken !== "" && wallToken === apiToken) notAllowed.push("WALL_TOKEN (a different token from API_TOKEN, since it only lets a screen show the wall)");
  const privatePages = readPrivatePages(read("WALL_PRIVATE_PAGES", false));
  if (privatePages === null) notAllowed.push(`WALL_PRIVATE_PAGES (the wall's pages to hide in guest mode, by name, with commas between: ${pageIds.join(", ")})`);
  const wall: WallSettings = { token: wallToken, speaking: readChoice("WALL_SPEAKING", wallSpeakings, features.wall), privatePages: privatePages ?? [], remote: readChoice("WALL_REMOTE", ["off", "on"] as const, false) === "on" };
  const login: LoginSettings = { guard: readSwitch("LOGIN_GUARD") };
  const projectorHost = read("PROJECTOR_HOST", features.projector);
  if (projectorHost !== "" && !privateIPv4(projectorHost)) notAllowed.push("PROJECTOR_HOST (the projector's own address on your home network, like 192.168.1.23: an IPv4 address in 10.x, 172.16.x to 172.31.x or 192.168.x)");
  const projector: ProjectorSettings = { host: projectorHost, power: readChoice("PROJECTOR_POWER", projectorPowers, false) };
  const morningAtText = read("MORNING_AT", features.morning);
  const morningAt = morningAtText === "" ? null : readMorningAt(morningAtText);
  if (morningAtText !== "" && morningAt === null) notAllowed.push("MORNING_AT (when Jarvis first says morning, from 04:00 to 11:00, like 06:45; the wall starts brightening 15 minutes before)");
  const morningDaysText = read("MORNING_DAYS", false);
  const morningDays = morningDaysText === "" ? ["mon", "tue", "wed", "thu", "fri"] : readDays(morningDaysText);
  if (morningDays === null) notAllowed.push("MORNING_DAYS (days from mon, tue, wed, thu, fri, sat and sun, with commas between, like mon,tue,wed,thu,fri)");
  const morning: MorningSettings = { at: morningAt ?? 6 * 60 + 45, days: morningDays ?? [] };
  const problems: string[] = [];

  if (missing.length > 0) problems.push(`Missing settings in api/.env: ${missing.join(", ")}`);
  if (notOnOrOff.length > 0) problems.push(`Settings in api/.env that must be on or off: ${notOnOrOff.join(", ")}`);
  if (notAllowed.length > 0) problems.push(`Settings in api/.env with a value that isn't allowed: ${notAllowed.join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join(". "));

  return { apiToken, qbitApiKey, jellyfinApiKey, ntfyTopic, healthcheckUrl, deals, trains, trainAlerts, catchUp, modes, phone, spotify, wall, login, projector, morning, features };
}