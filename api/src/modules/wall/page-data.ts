export const mostTrainRows = 6;
export const mostNameChars = 40;

export type TrainChange = { arrives: string | null; leaves: string; expected: string; platform: string | null; minutes: number | null; bus: boolean };
export type TrainRow = { leaves: string; expected: string; late: boolean; cancelled: boolean; bus: boolean; platform: string | null; destination: string | null; arrives: string | null; arrivesExpected: string | null; change: TrainChange | null; tight: boolean };
export type TrainPage = { kind: "trains"; from: string; via: string | null; to: string; rows: TrainRow[]; updates: number };

function fieldsOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function name(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return text.length > mostNameChars ? `${text.slice(0, mostNameChars - 1)}…` : text;
}

function clock(value: unknown): string | null {
  return typeof value === "string" && /^\d\d:\d\d$/.test(value) ? value : null;
}

function expectedOf(value: unknown): string {
  if (typeof value !== "string") return "No time yet";
  if (/^\d\d:\d\d$/.test(value)) return value;
  return ["On time", "Delayed", "Cancelled"].includes(value) ? value : "No time yet";
}

function platformOf(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,4}$/.test(value) ? value : null;
}

function minutesOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 600 ? value : null;
}

function isLate(leaves: string, expected: string): boolean {
  return expected === "Delayed" || (/^\d\d:\d\d$/.test(expected) && expected !== leaves);
}

function changeOf(value: unknown, arrives: string | null): TrainChange | null {
  const connection = fieldsOf(value);
  const leaves = clock(connection?.leaves);
  if (connection === null || leaves === null) return null;
  return { arrives, leaves, expected: expectedOf(connection.expected), platform: platformOf(connection.platform), minutes: minutesOf(connection.change), bus: connection.bus === true };
}

function journeyRow(value: unknown): TrainRow | null {
  const journey = fieldsOf(value);
  const leaves = clock(journey?.leaves);
  if (journey === null || leaves === null) return null;
  const expected = expectedOf(journey.expected);
  const best = fieldsOf(journey.best);
  const change = changeOf(journey.best, clock(journey.arrives));
  return {
    leaves,
    expected,
    late: isLate(leaves, expected),
    cancelled: journey.cancelled === true || expected === "Cancelled",
    bus: journey.bus === true,
    platform: platformOf(journey.platform),
    destination: null,
    arrives: clock(best?.arrives),
    arrivesExpected: best === null ? null : clock(best.arrivesExpected) ?? (typeof best.arrivesExpected === "string" ? expectedOf(best.arrivesExpected) : null),
    change,
    tight: fieldsOf(journey.tight) !== null,
  };
}

function departureRow(value: unknown): TrainRow | null {
  const departure = fieldsOf(value);
  const leaves = clock(departure?.due);
  if (departure === null || leaves === null) return null;
  const expected = expectedOf(departure.expected);
  return { leaves, expected, late: isLate(leaves, expected), cancelled: departure.cancelled === true || expected === "Cancelled", bus: false, platform: platformOf(departure.platform), destination: name(departure.destination), arrives: null, arrivesExpected: null, change: null, tight: false };
}

export function trainPage(reply: unknown): TrainPage {
  const fields = fieldsOf(reply);
  if (fields === null) throw new Error("the train times weren't a board");
  const messages = Array.isArray(fields.messages) ? fields.messages.length : 0;
  if (Array.isArray(fields.journeys)) {
    const rows = fields.journeys.map(journeyRow).filter((row) => row !== null).slice(0, mostTrainRows);
    return { kind: "trains", from: name(fields.from) ?? "Your station", via: name(fields.via), to: name(fields.to) ?? "where you're going", rows, updates: messages };
  }
  if (Array.isArray(fields.departures)) {
    const rows = fields.departures.map(departureRow).filter((row) => row !== null).slice(0, mostTrainRows);
    return { kind: "trains", from: name(fields.from) ?? "Your station", via: null, to: name(fields.to) ?? "where you're going", rows, updates: messages };
  }
  throw new Error("the train times weren't a board");
}
