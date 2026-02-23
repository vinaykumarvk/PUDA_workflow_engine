import { mkdtemp, rm, symlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageAdapter } from "./storage";

describe("LocalStorageAdapter", () => {
  let tempDir = "";
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "puda-storage-"));
    adapter = new LocalStorageAdapter(tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes and reads file inside storage base directory", async () => {
    const payload = Buffer.from("hello");
    await adapter.write("a/b/file.txt", payload);

    const loaded = await adapter.read("a/b/file.txt");
    expect(loaded?.toString("utf-8")).toBe("hello");
  });

  it("rejects path traversal attempts on write", async () => {
    await expect(adapter.write("../escape.txt", Buffer.from("x"))).rejects.toThrow(
      "INVALID_STORAGE_KEY"
    );
  });

  it("returns null for path traversal attempts on read", async () => {
    const loaded = await adapter.read("../escape.txt");
    expect(loaded).toBeNull();
  });

  it("rejects writes larger than configured max file size", async () => {
    const smallLimitAdapter = new LocalStorageAdapter(tempDir, 5);
    await expect(smallLimitAdapter.write("large.bin", Buffer.from("123456"))).rejects.toThrow(
      "FILE_TOO_LARGE"
    );
  });

  it("refuses to read through symlinked storage path", async () => {
    const outsidePath = path.join(tempDir, "..", "outside-read.txt");
    await writeFile(outsidePath, "outside");
    await symlink(outsidePath, path.join(tempDir, "linked.txt"));

    const loaded = await adapter.read("linked.txt");
    expect(loaded).toBeNull();
  });
});
