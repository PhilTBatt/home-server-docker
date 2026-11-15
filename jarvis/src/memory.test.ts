import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryStatPath, readAnonMemoryMb } from "./memory.js";

function stat(text: string) {
  return (path: string) => {
    assert.equal(path, memoryStatPath);
    return text;
  };
}

test("reads the container's anonymous memory from cgroup v2", () => {
  assert.equal(memoryStatPath, "/sys/fs/cgroup/memory.stat");
});

test("turns the anon line's bytes into whole megabytes", () => {
  assert.equal(readAnonMemoryMb(stat("anon 314572800\nfile 1048576\n")), 300);
});

test("finds the anon line wherever it is", () => {
  assert.equal(readAnonMemoryMb(stat("file 999\nkernel 5\nanon 52428800\nsock 0")), 50);
});

test("doesn't mistake anon_thp for anon", () => {
  assert.equal(readAnonMemoryMb(stat("anon_thp 2097152\nanon 104857600")), 100);
});

test("rounds to the nearest megabyte", () => {
  assert.equal(readAnonMemoryMb(stat("anon 1572864")), 2);
});

test("unknown when there's no anon line", () => {
  assert.equal(readAnonMemoryMb(stat("file 1048576\n")), null);
});

test("unknown when the number is garbage", () => {
  assert.equal(readAnonMemoryMb(stat("anon lots")), null);
});

test("unknown when the number is negative", () => {
  assert.equal(readAnonMemoryMb(stat("anon -5")), null);
});

test("unknown when the file can't be read, for example outside a container", () => {
  const missing = () => {
    throw new Error("ENOENT");
  };
  assert.equal(readAnonMemoryMb(missing), null);
});