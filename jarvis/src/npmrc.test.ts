import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("npm is told not to print its notice that a newer npm exists, and the file holds nothing else", async () => {
  assert.equal(await readFile(new URL("../.npmrc", import.meta.url), "utf8"), "update-notifier=false\n");
});
