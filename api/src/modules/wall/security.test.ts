import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createTally, mostKnocks, readBootTime, securityPage, type SecurityInput } from "./security.js";

const now = new Date("2026-11-30T10:00:00.000Z");
const base: SecurityInput = {
  guard: true,
  wallOn: true,
  tally: { token: 0, login: 0, pairing: 0, since: null },
  backup: { lastRun: { time: "2026-11-30T03:10:00.000Z", problem: null }, lastSuccess: "2026-11-30T03:10:00.000Z" },
  bootAt: new Date("2026-11-24T09:12:00.000Z"),
  apiAt: new Date("2026-11-30T07:05:00.000Z"),
  now,
};
const rowOf = (page: ReturnType<typeof securityPage>, card: string, k: string) => page.cards.find((one) => one.id === card)?.rows.find((row) => row.k === k);

test("with the guard on, nothing wrong today and a good backup, it's all quiet, and only the compose file's risky settings need a look", () => {
  const page = securityPage(base);
  assert.equal(page.kind, "security");
  assert.deepEqual([page.quiet, page.wrong, page.look, page.knocks], [true, 0, 2, 0]);
  assert.deepEqual(page.cards.map((card) => [card.id, card.look]), [["ways", false], ["keys", false], ["risky", true], ["secrets", false], ["today", false], ["running", false]]);
  assert.deepEqual(page.rings.map((ring) => [ring.id, ring.label, ring.tone]), [
    ["internet", "Internet: no way in", "plain"],
    ["tailscale", "Tailscale", "plain"],
    ["home", "Home network", "plain"],
    ["caddy", "Caddy · https", "good"],
    ["tokens", "Tokens", "good"],
    ["networks", "Separate networks", "good"],
  ]);
  assert.deepEqual(rowOf(page, "ways", "Docker's ports at home"), { k: "Docker's ports at home", v: "53, 80, 443, 6881, 8096", tone: "plain" });
  assert.deepEqual(page.cards[0].rows.map((row) => row.tone), ["plain", "plain", "plain"], "the router and Tailscale aren't something the hub can check, so the ways in are never shown as checked");
  assert.deepEqual(rowOf(page, "risky", "Docker socket mounted"), { k: "Docker socket mounted", v: "beszel-agent", tone: "warn" });
  assert.deepEqual(rowOf(page, "risky", "Privileged containers"), { k: "Privileged containers", v: "None", tone: "good" });
  assert.deepEqual(rowOf(page, "running", "Last backup"), { k: "Last backup", v: "03:10 · today", tone: "good" });
  assert.deepEqual(rowOf(page, "running", "Server running since"), { k: "Server running since", v: "Tue 24 Nov, 09:12", tone: "plain" });
  assert.deepEqual(rowOf(page, "running", "The hub running since"), { k: "The hub running since", v: "today, 07:05", tone: "plain" });
  assert.deepEqual(rowOf(page, "today", "Counting since"), { k: "Counting since", v: "midnight", tone: "plain" });
});

test("wrong tokens and codes today show on the tokens ring and the today card, with a knock each, up to five", () => {
  const page = securityPage({ ...base, tally: { token: 3, login: 1, pairing: 2, since: "07:05" } });
  assert.deepEqual([page.quiet, page.wrong, page.knocks], [false, 6, mostKnocks]);
  assert.deepEqual(page.rings.find((ring) => ring.id === "tokens"), { id: "tokens", label: "Tokens · 6 wrong today", tone: "warn" });
  assert.deepEqual(rowOf(page, "today", "Wrong tokens tried"), { k: "Wrong tokens tried", v: "4", tone: "warn" });
  assert.deepEqual(rowOf(page, "today", "Wrong pairing codes"), { k: "Wrong pairing codes", v: "2", tone: "warn" });
  assert.deepEqual(rowOf(page, "today", "Counting since"), { k: "Counting since", v: "the hub started, 07:05", tone: "plain" });
  assert.equal(page.look, 4);
  assert.equal(securityPage({ ...base, tally: { token: 2, login: 0, pairing: 0, since: null } }).knocks, 2);
  assert.equal(rowOf(securityPage({ ...base, tally: { token: 12345, login: 0, pairing: 0, since: null } }), "today", "Wrong tokens tried")?.v, "12,345");
});

test("the login guard off is something to look at, on the Caddy ring and the keys card", () => {
  const page = securityPage({ ...base, guard: false });
  assert.deepEqual(page.rings.find((ring) => ring.id === "caddy"), { id: "caddy", label: "Caddy · login guard off", tone: "warn" });
  assert.deepEqual(rowOf(page, "keys", "Login guard"), { k: "Login guard", v: "Off", tone: "warn" });
  assert.equal(page.look, 3);
  assert.deepEqual(rowOf(securityPage({ ...base, wallOn: false }), "keys", "Wall token · reads the wall"), { k: "Wall token · reads the wall", v: "Wall off", tone: "plain" });
});

test("a failed backup, no backup yet, or one that can't be read each say so", () => {
  assert.deepEqual(rowOf(securityPage({ ...base, backup: { lastRun: { time: "2026-11-30T03:10:00.000Z", problem: "restic exited 1" }, lastSuccess: null } }), "running", "Last backup"), { k: "Last backup", v: "Failed", tone: "warn" });
  assert.deepEqual(rowOf(securityPage({ ...base, backup: { lastRun: null, lastSuccess: null } }), "running", "Last backup"), { k: "Last backup", v: "None yet", tone: "warn" });
  assert.deepEqual(rowOf(securityPage({ ...base, backup: null }), "running", "Last backup"), { k: "Last backup", v: "Couldn't read it", tone: "plain" });
  assert.deepEqual(rowOf(securityPage({ ...base, bootAt: null }), "running", "Server running since"), { k: "Server running since", v: "Couldn't read it", tone: "plain" });
  assert.ok(!JSON.stringify(securityPage({ ...base, backup: { lastRun: { time: "x", problem: "restic: /home/someone/secret path" }, lastSuccess: null } })).includes("secret path"), "the backup's own error text never reaches the page");
});

test("the tally counts each kind for the London day, from when the hub started, and starts again at midnight", () => {
  const tally = createTally(new Date("2026-11-30T07:05:30.000Z"));
  assert.deepEqual(tally.view(new Date("2026-11-30T07:06:00.000Z")), { token: 0, login: 0, pairing: 0, since: "07:05" });
  tally.add("token", new Date("2026-11-30T08:00:00.000Z"));
  tally.add("token", new Date("2026-11-30T09:00:00.000Z"));
  tally.add("login", new Date("2026-11-30T09:00:00.000Z"));
  tally.add("pairing", new Date("2026-11-30T23:59:00.000Z"));
  assert.deepEqual(tally.view(new Date("2026-11-30T23:59:30.000Z")), { token: 2, login: 1, pairing: 1, since: "07:05" });
  assert.deepEqual(tally.view(new Date("2026-12-01T00:00:10.000Z")), { token: 0, login: 0, pairing: 0, since: null });
  tally.add("login", new Date("2026-12-01T06:00:00.000Z"));
  assert.deepEqual(tally.view(new Date("2026-12-01T06:00:00.000Z")), { token: 0, login: 1, pairing: 0, since: null });
  assert.equal(createTally(new Date("2026-06-30T23:30:00.000Z")).view(new Date("2026-06-30T23:31:00.000Z")).since, "00:30", "in summer, 23:30 UTC is already 00:30 the next London day");
});

test("the server's boot time comes from /proc/uptime, to the minute, and is null when it can't be read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uptime-"));
  await writeFile(join(dir, "uptime"), "86400.55 300000.12\n");
  assert.equal((await readBootTime(now, join(dir, "uptime")))?.toISOString(), "2026-11-29T09:59:00.000Z");
  await writeFile(join(dir, "bad"), "not a number\n");
  assert.equal(await readBootTime(now, join(dir, "bad")), null);
  assert.equal(await readBootTime(now, join(dir, "missing")), null);
});
