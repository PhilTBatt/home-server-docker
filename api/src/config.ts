import { boardAheadMinutes, clockMinutes, readDays, readWindow, type AlertSettings } from "./modules/trains/alerts.js";
import { safeBoardUrl, type TrainSettings } from "./modules/trains/board.js";
import { detailedBoardUrl } from "./modules/trains/journeys.js";

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
};

export type DealSettings = {
  seen: "memory" | "disk";
  ebayEnvironment: "production" | "sandbox";
  ebayClientId: string;
  ebayClientSecret: string;
  ai: boolean;
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
  features: Features;
};

const featureLabels: Record<keyof Features, string> = {
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
};

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
    alerts: readSwitch("ALERTS"),
    heartbeat: readSwitch("HEARTBEAT"),
    dailySummary: readSwitch("DAILY_SUMMARY"),
    memoryInbox: readSwitch("MEMORY_INBOX"),
    memoryUpload: readSwitch("MEMORY_UPLOAD"),
    deals: readSwitch("DEALS"),
    findPhone: readSwitch("FIND_PHONE"),
    trains: readSwitch("TRAINS"),
    trainAlerts: readSwitch("TRAIN_ALERTS"),
    expiryAlerts: readSwitch("EXPIRY_ALERTS"),
    watchers: readSwitch("WATCHERS"),
  };
  const ntfyTopic = read("NTFY_TOPIC", features.alerts || features.dailySummary || features.deals || features.findPhone || features.trainAlerts || features.expiryAlerts || features.watchers);
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
  const problems: string[] = [];

  if (missing.length > 0) problems.push(`Missing settings in api/.env: ${missing.join(", ")}`);
  if (notOnOrOff.length > 0) problems.push(`Settings in api/.env that must be on or off: ${notOnOrOff.join(", ")}`);
  if (notAllowed.length > 0) problems.push(`Settings in api/.env with a value that isn't allowed: ${notAllowed.join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join(". "));

  return { apiToken, qbitApiKey, jellyfinApiKey, ntfyTopic, healthcheckUrl, deals, trains, trainAlerts, features };
}