/**
 * C9: Pluggable document storage abstraction.
 * Default: local filesystem. S3 adapter can be plugged in via configuration.
 */
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { logInfo } from "./logger";

export interface StorageAdapter {
  name: string;
  write(key: string, data: Buffer): Promise<void>;
  /** Stream data to storage with size enforcement. Returns bytes written. */
  writeStream(key: string, stream: Readable, maxBytes?: number): Promise<number>;
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

  async writeStream(key: string, stream: Readable, maxBytes?: number): Promise<number> {
    const limit = maxBytes ?? this.maxFileBytes;
    const fullPath = this.resolveSafePath(key);
    await this.assertNoSymlinkInPath(fullPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    let bytesWritten = 0;
    const sizeGuard = new Transform({
      transform(chunk, _encoding, callback) {
        bytesWritten += chunk.length;
        if (bytesWritten > limit) {
          callback(new Error("FILE_TOO_LARGE"));
        } else {
          callback(null, chunk);
        }
      },
    });

    try {
      await pipeline(stream, sizeGuard, createWriteStream(fullPath));
    } catch (err: any) {
      // Clean up partial file on failure
      await fs.unlink(fullPath).catch(() => {});
      throw err;
    }
    return bytesWritten;
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

  async writeStream(key: string, _stream: Readable, _maxBytes?: number): Promise<number> {
    logInfo("S3 PUT stream requested (stub)", { bucket: this.bucket, region: this.region, key });
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

// ── Magic-byte MIME validation ──

const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },         // %PDF
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },                     // JPEG SOI
  { mime: "image/png", bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A] },   // PNG signature
];

/**
 * Validate that the first bytes of a buffer match the declared MIME type.
 * Returns true if the magic bytes match or if the MIME type has no known signature.
 */
export function validateMagicBytes(header: Buffer, declaredMime: string): boolean {
  const rule = MAGIC_BYTES.find((m) => m.mime === declaredMime);
  if (!rule) return true; // Unknown MIME type — no magic bytes to check
  if (header.length < rule.bytes.length + (rule.offset || 0)) return false;
  const offset = rule.offset || 0;
  return rule.bytes.every((b, i) => header[offset + i] === b);
}

/**
 * Stream a multipart file to storage with size enforcement and magic-byte MIME validation.
 * Returns { bytesWritten, checksum } on success.
 */
export async function streamToStorageWithValidation(
  stream: Readable,
  storageKey: string,
  declaredMime: string,
  maxBytes?: number
): Promise<{ bytesWritten: number; checksum: string }> {
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256");
  let headerBuf: Buffer | null = null;
  let headerValidated = false;

  const validator = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      // Validate magic bytes on first chunk
      if (!headerValidated) {
        headerBuf = headerBuf ? Buffer.concat([headerBuf, chunk]) : chunk;
        if (headerBuf.length >= 8) {
          if (!validateMagicBytes(headerBuf, declaredMime)) {
            return callback(new Error("MIME_MISMATCH"));
          }
          headerValidated = true;
        }
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      // If file was very small and we never reached 8 bytes
      if (!headerValidated && headerBuf) {
        if (!validateMagicBytes(headerBuf, declaredMime)) {
          return callback(new Error("MIME_MISMATCH"));
        }
      }
      callback();
    },
  });

  const storage = getStorage();
  // Pipe through validator then to storage
  const validated = stream.pipe(validator);
  const bytesWritten = await storage.writeStream(storageKey, validated, maxBytes);
  return { bytesWritten, checksum: hash.digest("hex") };
}
