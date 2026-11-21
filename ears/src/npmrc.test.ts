import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("npm is told not to check for a newer npm, and not to fetch onnxruntime's CUDA files, which ears never uses", async () => {
  assert.equal(await readFile(new URL("../.npmrc", import.meta.url), "utf8"), "update-notifier=false\nonnxruntime-node-install=skip\n");
});
