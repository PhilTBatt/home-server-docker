import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenNow, isPageBy, isPageId, pageIds, pageShownMs, readPrivatePages, wallPages } from "./pages.js";

test("the wall's pages are one list, each with a short name, a title and the words that open it", () => {
  assert.deepEqual(pageIds, ["server", "train", "backup", "alerts", "deals", "reminder", "music", "switches", "security", "health", "code"]);
  assert.equal(new Set(pageIds).size, pageIds.length);
  const said = wallPages.flatMap((page) => page.say);
  assert.equal(new Set(said).size, said.length, "no two pages share words");
  for (const words of said) assert.match(words, /^(?:show me|put) [a-z' ]{2,40}[a-z]$/, words);
  for (const page of wallPages) assert.ok(page.say.length > 0 && page.title.length > 0, page.id);
  assert.equal(pageShownMs, 120_000);
});

test("only a listed page and a known way of opening it are taken", () => {
  for (const id of pageIds) assert.ok(isPageId(id));
  for (const id of ["Server", "servers", "", "../server", 3, null, undefined]) assert.equal(isPageId(id), false, String(id));
  for (const by of ["words", "jarvis"]) assert.ok(isPageBy(by));
  for (const by of ["claude", "phone", "", null, "Words"]) assert.equal(isPageBy(by), false, String(by));
});

test("the private list is page names with commas between, each once, empty when left out, and refused when it names anything else", () => {
  assert.deepEqual(readPrivatePages(""), []);
  assert.deepEqual(readPrivatePages(" deals , reminder,deals "), ["deals", "reminder"]);
  assert.deepEqual(readPrivatePages("deals,,"), ["deals"]);
  assert.equal(readPrivatePages("deals,brain"), null);
  assert.equal(readPrivatePages("Deals"), null);
});

test("a private page is hidden only while the hub says it's in guest mode", () => {
  const hidden = (mode: string | null) => hiddenNow(["deals"], mode);
  assert.equal(hidden("guest")("deals"), true);
  assert.equal(hidden("guest")("server"), false);
  for (const mode of ["normal", "bedtime", "gaming", null]) assert.equal(hidden(mode)("deals"), false, String(mode));
});
