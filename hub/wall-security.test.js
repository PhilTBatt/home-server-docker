// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSecurityPage, knockAngles, ringRadii, securityCentre, securityNote, securityView } from "./wall-security.js";

/** @returns {import("./wall-security.js").SecurityPage} */
function page(wrong = 0, look = 2) {
  const ids = ["internet", "tailscale", "home", "caddy", "tokens", "networks"];
  return {
    kind: "security",
    quiet: wrong === 0,
    wrong,
    look,
    rings: ids.map((id) => ({ id, label: id === "tokens" && wrong > 0 ? `Tokens · ${wrong} wrong today` : id, tone: id === "tokens" && wrong > 0 ? "warn" : "good" })),
    cards: ["ways", "keys", "risky", "secrets", "today", "running"].map((id) => ({ id, title: `The ${id}`, rows: [{ k: "A row", v: "None", tone: "good" }], look: id === "risky" })),
    knocks: Math.min(5, wrong),
  };
}

test("the hub's security page is checked before it's drawn", () => {
  assert.equal(isSecurityPage(page()), true);
  const good = page();
  for (const bad of [
    null,
    { ...good, kind: "server" },
    { ...good, quiet: "yes" },
    { ...good, wrong: -1 },
    { ...good, knocks: 6 },
    { ...good, knocks: 1.5 },
    { ...good, rings: good.rings.slice(1) },
    { ...good, rings: [good.rings[1], good.rings[0], ...good.rings.slice(2)] },
    { ...good, rings: good.rings.map((ring) => ({ ...ring, tone: "red" })) },
    { ...good, rings: good.rings.map((ring) => ({ ...ring, label: "x".repeat(41) })) },
    { ...good, cards: good.cards.slice(0, 5) },
    { ...good, cards: good.cards.map((card) => ({ ...card, rows: [{ k: "A", v: "x".repeat(41), tone: "good" }] })) },
    { ...good, cards: good.cards.map((card) => ({ ...card, rows: Array.from({ length: 5 }, () => card.rows[0]) })) },
    { ...good, cards: good.cards.map((card) => ({ ...card, look: "no" })) },
    { ...good, cards: good.cards.map((card) => ({ ...card, rows: [{ k: "A", v: "B", tone: "red" }] })) },
    { ...good, cards: good.cards.map((card) => ({ ...card, rows: [{ k: "", v: "B", tone: "good" }] })) },
  ]) assert.equal(isSecurityPage(bad), false, JSON.stringify(bad)?.slice(0, 100));
});

test("the rings are drawn round one centre, biggest first, each label just above its ring", () => {
  const view = securityView(page());
  assert.deepEqual(view.rings.map((ring) => ring.size), ringRadii.map((r) => r * 2));
  for (const ring of view.rings) {
    assert.equal(ring.left + ring.size / 2, securityCentre.x, ring.id);
    assert.equal(ring.top + ring.size / 2, securityCentre.y, ring.id);
    assert.equal(ring.labelTop, ring.top - 8, ring.id);
  }
  assert.ok(view.rings.every((ring) => ring.left >= 0 && ring.left + ring.size <= 608), "the rings stay left of the cards");
});

test("with nothing wrong it's all quiet with no knocks, and any wrong tokens knock once each, up to five", () => {
  const quiet = securityView(page(0, 2));
  assert.deepEqual([quiet.quiet, quiet.look, quiet.lookTone, quiet.knocks], ["All quiet", "· 2 things to look at", "warn", []]);
  assert.equal(securityView(page(0, 1)).look, "· 1 thing to look at");
  assert.equal(securityView(page(0, 0)).look, "");
  const busy = securityView(page(7, 3));
  assert.deepEqual([busy.quiet, busy.lookTone], ["7 wrong today", "warm"]);
  assert.deepEqual(busy.knocks.map((knock) => knock.angle), knockAngles);
  assert.deepEqual(securityView(page(2)).knocks, [{ angle: 180, delay: -0 }, { angle: 140, delay: -0.9 }]);
  assert.equal(busy.rings.find((ring) => ring.id === "tokens")?.warn, true);
  assert.equal(securityView(page(1234)).quiet, "1,234 wrong today");
  assert.match(securityNote, /White dots bouncing off the outside are a picture/, "the page says which knocks are real");
  assert.match(securityNote, /^No way in from the internet and Tailscale only are how the router and Tailscale were set up, which the hub can't check\./, "and which claims nothing checks");
});
