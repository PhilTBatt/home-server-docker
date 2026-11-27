import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { couldBeSecret, isPlain, isRealDate, loadList, readList } from "./list.js";

const list = (items: unknown) => JSON.stringify({ items });

test("reads each item's name, date and note, in the order written", () => {
  assert.deepEqual(readList(list([{ name: "Alpha key", date: "2027-03-31", note: "Renew it from the admin page" }, { name: "Beta", date: "2026-12-01" }])), [
    { name: "Alpha key", date: "2027-03-31", note: "Renew it from the admin page" },
    { name: "Beta", date: "2026-12-01", note: null },
  ]);
});

test("a note can hold a web address, as long as no part of it between dots and slashes could be a key", () => {
  assert.deepEqual(readList(list([{ name: "Alpha", date: "2027-01-01", note: "Renew at https://login.example.com/admin/machines" }]))[0].note, "Renew at https://login.example.com/admin/machines");
  assert.equal(readList(list([{ name: "Alpha", date: "2027-01-01", note: "https://example.org/a-long-ish-path/settings_page." }]))[0].note, "https://example.org/a-long-ish-path/settings_page.");
  for (const note of ["Reset at https://example.com/reset/made1up2key3x", "See https://example.com/abcdefghijklmnopqrstuv", "Go to https://abcdefghijklmnopqrstuvw.example.com", "Use http://login.example.com/admin/machines-and-more-pages"]) {
    assert.throws(() => readList(list([{ name: "Alpha", date: "2027-01-01", note }])), (error: Error) => error.message.includes("note was refused because it could be a key or token") && !error.message.includes("example"), note);
  }
  assert.throws(() => readList(list([{ name: "https://login.example.com/admin/machines", date: "2027-01-01" }])), (error: Error) => error.message.includes("name was refused"), "names don't get the web address allowance");
});

test("a note of null counts as no note, like an empty one", () => {
  assert.deepEqual(readList(list([{ name: "Alpha", date: "2027-01-01", note: null }])), [{ name: "Alpha", date: "2027-01-01", note: null }]);
});

test("an empty list is fine, and an empty note counts as no note", () => {
  assert.deepEqual(readList(list([])), []);
  assert.deepEqual(readList(list([{ name: "Alpha", date: "2027-01-01", note: "" }])), [{ name: "Alpha", date: "2027-01-01", note: null }]);
});

test("a file that isn't JSON, or isn't an object with an items list, is refused naming the file", () => {
  assert.throws(() => readList("{ items: [] "), { message: "expiry/items.json isn't valid JSON" });
  for (const text of ["[]", "{}", '{"items": {}}', "null", '"items"']) {
    assert.throws(() => readList(text), { message: 'expiry/items.json must be an object with an "items" list' }, text);
  }
});

test("anything but items at the top is refused without repeating what it was", () => {
  assert.throws(() => readList(JSON.stringify({ items: [], "tskey-made-up": 1 })), (error: Error) => error.message === 'expiry/items.json must have nothing but "items" at the top' && !error.message.includes("tskey"));
});

test("more than 50 items is refused", () => {
  const items = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Item ${index}`, date: "2027-01-01" }));
  assert.equal(readList(list(items(50))).length, 50);
  assert.throws(() => readList(list(items(51))), { message: "expiry/items.json has more than 50 items" });
});

test("an entry that isn't an object, or has anything but a name, date and note, is refused by its number", () => {
  assert.throws(() => readList(list(["Alpha"])), { message: "expiry/items.json: entry 1 must be an object with a name and a date" });
  assert.throws(() => readList(list([{ name: "Alpha", date: "2027-01-01" }, { name: "Beta", date: "2027-01-01", token: "made-up" }])), { message: "expiry/items.json: entry 2 must have nothing but a name, a date and a note" });
});

test("a name is 1 to 40 plain characters with no space at either end", () => {
  assert.equal(readList(list([{ name: "A".repeat(20) + " " + "b".repeat(19), date: "2027-01-01" }]))[0].name.length, 40);
  assert.deepEqual(readList(list([{ name: "Server's key (old) - v2, A&B/C+D: e_f.", date: "2027-01-01" }])).length, 1);
  const refusal = "expiry/items.json: entry 1's name must be 1 to 40 characters of letters, digits, spaces and ' - . , ( ) & / + : _, with no space at either end";
  for (const name of ["", "A".repeat(20) + " " + "b".repeat(20), " Alpha", "Alpha ", "Alpha=beta", "Alpha#1", "Alé", "Alpha\nBeta", 42, null]) {
    assert.throws(() => readList(list([{ name, date: "2027-01-01" }])), { message: refusal }, String(name));
  }
  assert.throws(() => readList(list([{ date: "2027-01-01" }])), { message: refusal });
});

test("a name or note that could be a key or token is refused without repeating it", () => {
  const made = ["tskey-auth-kMadeUp1234-AbCdEf", "ghp_MadeUpMadeUpMadeUpMadeUp", "abcdefghijklmnopqrstu", "made1up2key3", "Key abc123def456"];
  for (const name of made) {
    assert.throws(
      () => readList(list([{ name, date: "2027-01-01" }])),
      (error: Error) => error.message === "expiry/items.json: entry 1's name was refused because it could be a key or token (a word over 20 characters, or one of 12 or more mixing letters and digits)" && !error.message.includes(name),
      name,
    );
    assert.throws(
      () => readList(list([{ name: "Alpha", date: "2027-01-01", note: `Renew ${name}` }])),
      (error: Error) => error.message === "expiry/items.json: entry 1 (Alpha)'s note was refused because it could be a key or token (a word over 20 characters, or one of 12 or more mixing letters and digits; in a web address, each part between dots and slashes counts as a word)" && !error.message.includes(name),
      name,
    );
  }
});

test("couldBeSecret allows ordinary words, dates and short codes, and catches long or mixed ones", () => {
  for (const text of ["Re-authenticate", "2027-03-31", "api/.env", "RAIL_DATA_KEY", "abcdefghijklmnopqrst", "a1b2c3d4e5f", "internationalisation"]) assert.equal(couldBeSecret(text), false, text);
  for (const text of ["abcdefghijklmnopqrstu", "a1b2c3d4e5f6", "word a1b2c3d4e5f6", "123456789012x"]) assert.equal(couldBeSecret(text), true, text);
  assert.equal(couldBeSecret("123456789012345"), false, "digits alone are allowed up to the word limit");
});

test("isPlain needs at least one character, no more than the most, and nothing else", () => {
  assert.equal(isPlain("abc", 3), true);
  assert.equal(isPlain("abcd", 3), false);
  assert.equal(isPlain("", 3), false);
  assert.equal(isPlain("a b", 3), true);
  assert.equal(isPlain("a\tb", 3), false);
});

test("a note is up to 100 plain characters, said by the entry's name once the name is fine", () => {
  assert.equal(readList(list([{ name: "Alpha", date: "2027-01-01", note: "word ".repeat(19) + "words" }]))[0].note?.length, 100);
  for (const note of ["word ".repeat(20) + "w", " Leading", "Trailing ", "Key=value", 7, false]) {
    assert.throws(() => readList(list([{ name: "Alpha", date: "2027-01-01", note }])), { message: "expiry/items.json: entry 1 (Alpha)'s note must be 1 to 100 characters of letters, digits, spaces and ' - . , ( ) & / + : _, with no space at either end" }, String(note));
  }
});

test("a date must be a real day written YYYY-MM-DD, from 2000 to 2099", () => {
  for (const date of ["2027-02-28", "2028-02-29", "2000-01-01", "2099-12-31"]) assert.equal(readList(list([{ name: "Alpha", date }]))[0].date, date);
  for (const date of ["2027-02-29", "2027-13-01", "2027-00-10", "2027-04-31", "2027-1-01", "27-01-01", "2027/01/01", "1999-12-31", "2100-01-01", " 2027-01-01", "2027-01-01T00:00", 20270101, undefined]) {
    assert.throws(() => readList(list([{ name: "Alpha", date }])), { message: "expiry/items.json: entry 1 (Alpha)'s date must be a real date written YYYY-MM-DD, like 2027-03-31" }, String(date));
  }
  assert.equal(isRealDate("2027-12-31"), true);
  assert.equal(isRealDate("2027-12-32"), false);
});

test("two items with the same name, in any case, are refused", () => {
  assert.throws(() => readList(list([{ name: "Alpha", date: "2027-01-01" }, { name: "Beta", date: "2027-01-01" }, { name: "alpha", date: "2028-01-01" }])), {
    message: "expiry/items.json: entry 3 (alpha) has the same name as entry 1",
  });
  assert.throws(() => readList(list([{ name: "beta", date: "2027-01-01" }, { name: "BETA", date: "2027-01-01" }])), {
    message: "expiry/items.json: entry 2 (BETA) has the same name as entry 1",
  });
});

test("every problem is named at once, up to three, with a count of the rest", () => {
  assert.throws(() => readList(list([{ name: "Alpha", date: "x" }, { name: "Beta", date: "y" }])), {
    message: "expiry/items.json: entry 1 (Alpha)'s date must be a real date written YYYY-MM-DD, like 2027-03-31; entry 2 (Beta)'s date must be a real date written YYYY-MM-DD, like 2027-03-31",
  });
  assert.throws(() => readList(list(["a", "b", "c", "d", "e"])), {
    message: "expiry/items.json: entry 1 must be an object with a name and a date; entry 2 must be an object with a name and a date; entry 3 must be an object with a name and a date; and 2 more",
  });
  assert.throws(() => readList(list(["a", "b", "c"])), {
    message: "expiry/items.json: entry 1 must be an object with a name and a date; entry 2 must be an object with a name and a date; entry 3 must be an object with a name and a date",
  });
});

test("a refused name leaves the entry known only by its number", () => {
  assert.throws(() => readList(list([{ name: "Alpha=1", date: "bad", note: "Fine" }])), (error: Error) => error.message.includes("entry 1's date") && !error.message.includes("Alpha"));
});

test("the tracked example is a valid list, with placeholder dates and generic names", async () => {
  const text = await readFile(new URL("../../../src/modules/expiry/items.example.json", import.meta.url), "utf8");
  const items = readList(text);
  assert.deepEqual(items.map((item) => item.name), ["Server's Tailscale key", "GitHub token", "Yearly subscription"]);
  assert.ok(items.every((item) => item.date.startsWith("2099-")));
});

test("loadList reads the file it's given", async () => {
  const dir = await mkdtemp(join(tmpdir(), "expiry-"));
  await writeFile(join(dir, "items.json"), list([{ name: "Alpha", date: "2027-01-01" }]));
  assert.deepEqual(await loadList(join(dir, "items.json")), [{ name: "Alpha", date: "2027-01-01", note: null }]);
});

test("a missing list says to copy the example, and one that can't be read says so, both naming the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "expiry-"));
  await assert.rejects(loadList(join(dir, "items.json")), { message: "there's no expiry/items.json yet: copy api/src/modules/expiry/items.example.json there to start" });
  await mkdir(join(dir, "folder.json"));
  await assert.rejects(loadList(join(dir, "folder.json")), { message: "expiry/items.json couldn't be read" });
});

test("a list over 64 KB is refused before it's read as JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "expiry-"));
  await writeFile(join(dir, "items.json"), list([]) + " ".repeat(64 * 1024));
  await assert.rejects(loadList(join(dir, "items.json")), { message: "expiry/items.json is bigger than 64 KB" });
  await writeFile(join(dir, "items.json"), (list([]) + " ".repeat(64 * 1024)).slice(0, 64 * 1024));
  assert.deepEqual(await loadList(join(dir, "items.json")), []);
});
