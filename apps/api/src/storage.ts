/**
 * C9: Pluggable document storage abstraction.
 * Default: local filesystem. S3 adapter can be plugged in via configuration.
 */
import { promises as fs } from "fs";
import path from "path";
import { logInfo } from "./logger";

export interface StorageAdapter {
  name: string;
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

function resolveStorageMaxFileBytes(): number {
  const parsed = Number.parseInt(process.env.STORAGE_MAX_FILE_BYTES || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
}

// Local filesystem storage (default)
export class LocalStorageAdapter implements StorageAdapter {
  name = "local";
  constructor(
    private baseDir: string,
    private maxFileBytes: number = resolveStorageMaxFileBytes()
  ) {}

  private resolveSafePath(key: string): string {
    const base = path.resolve(this.baseDir);
    const resolved = path.resolve(base, key);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
      throw new Error("INVALID_STORAGE_KEY");
    }
    return resolved;
  }

  private async assertNoSymlinkInPath(resolvedPath: string): Promise<void> {
    const base = path.resolve(this.baseDir);
    const relative = path.relative(base, resolvedPath);
    if (!relative || relative === ".") return;

    const segments = relative.split(path.sep).filter(Boolean);
    let current = base;
    for (const segment of segments) {
      current = path.join(current, segment);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) {
          throw new Error("INVALID_STORAGE_KEY");
        }
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          return;
        }
        throw error;
      }
    }
  }

  async write(key: string, data: Buffer): Promise<void> {
    if (data.length > this.maxFileBytes) {
      throw new Error("FILE_TOO_LARGE");
    }
    const fullPath = this.resolveSafePath(key);
    await this.assertNoSymlinkInPath(fullPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
  }

  async read(key: string): Promise<Buffer | null> {
    let fullPath: string;
    try {
      fullPath = this.resolveSafePath(key);
    } catch {
      return null;
    }
    try {
      await this.assertNoSymlinkInPath(fullPath);
      return await fs.readFile(fullPath);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    let fullPath: string;
    try {
      fullPath = this.resolveSafePath(key);
    } catch {
      return;
    }
    try {
      await this.assertNoSymlinkInPath(fullPath);
      await fs.unlink(fullPath);
    } catch {}
  }
}

// S3-compatible storage (stub - implement with @aws-sdk/client-s3 when ready)
export class S3StorageAdapter implements StorageAdapter {
  name = "s3";
  constructor(private bucket: string, private region: string = "ap-south-1") {}

  async write(key: string, data: Buffer): Promise<void> {
    // In production: use @aws-sdk/client-s3 PutObjectCommand
    logInfo("S3 PUT requested (stub)", { bucket: this.bucket, region: this.region, key, bytes: data.length });
    throw new Error("S3 adapter not yet configured. Install @aws-sdk/client-s3 and provide credentials.");
  }

  async read(key: string): Promise<Buffer | null> {
    logInfo("S3 GET requested (stub)", { bucket: this.bucket, region: this.region, key });
    throw new Error("S3 adapter not yet configured.");
  }

  async delete(key: string): Promise<void> {
    logInfo("S3 DELETE requested (stub)", { bucket: this.bucket, region: this.region, key });
    throw new Error("S3 adapter not yet configured.");
  }
}

// Singleton instance — configure at startup
let _storageAdapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!_storageAdapter) {
    // Default to local storage
    const baseDir = process.env.STORAGE_BASE_DIR || path.resolve(__dirname, "..", "..", "..", "uploads");
    _storageAdapter = new LocalStorageAdapter(baseDir);
  }
  return _storageAdapter;
}

export function setStorage(adapter: StorageAdapter): void {
  _storageAdapter = adapter;
  logInfo("Storage adapter configured", { adapter: adapter.name });
}
