/**
 * C9: Pluggable document storage abstraction.
 * Default: local filesystem. S3 adapter can be plugged in via configuration.
 */
import { promises as fs, createReadStream } from "fs";
import { createWriteStream } from "fs";
import path from "path";
import { PassThrough, Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { logInfo } from "./logger";
import { UploadErrorCode } from "./upload-errors";

export interface StorageAdapter {
  name: string;
  write(key: string, data: Buffer): Promise<void>;
  /** Stream data to storage with size enforcement. Returns bytes written. */
  writeStream(key: string, stream: Readable, maxBytes?: number): Promise<number>;
  read(key: string): Promise<Buffer | null>;
  /** PERF-011: Stream read for downloads — avoids buffering entire file in memory. */
  readStream(key: string): Promise<Readable | null>;
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
      throw new Error(UploadErrorCode.INVALID_STORAGE_KEY);
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
          throw new Error(UploadErrorCode.INVALID_STORAGE_KEY);
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
      throw new Error(UploadErrorCode.FILE_TOO_LARGE);
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
          callback(new Error(UploadErrorCode.FILE_TOO_LARGE));
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

  async readStream(key: string): Promise<Readable | null> {
    let fullPath: string;
    try {
      fullPath = this.resolveSafePath(key);
    } catch {
      return null;
    }
    try {
      await this.assertNoSymlinkInPath(fullPath);
      await fs.access(fullPath);
      return createReadStream(fullPath);
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

// S3-compatible storage (works with AWS S3, MinIO, and other S3-compatible providers)
export class S3StorageAdapter implements StorageAdapter {
  name = "s3";
  private client: import("@aws-sdk/client-s3").S3Client;

  constructor(
    private bucket: string,
    private region: string = "ap-south-1",
    endpoint?: string,
    private maxFileBytes: number = resolveStorageMaxFileBytes()
  ) {
    // Lazy-import at construction so the SDK is only required when STORAGE_PROVIDER=s3
    const { S3Client } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  async write(key: string, data: Buffer): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
    }));
  }

  async writeStream(key: string, stream: Readable, maxBytes?: number): Promise<number> {
    const limit = maxBytes ?? this.maxFileBytes;
    const { Upload } = await import("@aws-sdk/lib-storage");

    let bytesWritten = 0;
    const sizeGuard = new Transform({
      transform(chunk, _encoding, callback) {
        bytesWritten += chunk.length;
        if (bytesWritten > limit) {
          callback(new Error(UploadErrorCode.FILE_TOO_LARGE));
        } else {
          callback(null, chunk);
        }
      },
    });
    const guarded = stream.pipe(sizeGuard);

    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: guarded },
    });
    await upload.done();
    return bytesWritten;
  }

  async read(key: string): Promise<Buffer | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const res = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async readStream(key: string): Promise<Readable | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const res = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      if (!res.Body) return null;
      // S3 SDK v3 Body is a Readable-compatible stream
      return res.Body as unknown as Readable;
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}

// Singleton instance — configure at startup
let _storageAdapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!_storageAdapter) {
    if (process.env.STORAGE_PROVIDER === "s3") {
      const bucket = process.env.S3_BUCKET;
      if (!bucket) throw new Error("S3_BUCKET env var is required when STORAGE_PROVIDER=s3");
      _storageAdapter = new S3StorageAdapter(
        bucket,
        process.env.S3_REGION || "ap-south-1",
        process.env.S3_ENDPOINT || undefined
      );
    } else {
      const baseDir = process.env.STORAGE_BASE_DIR || path.resolve(__dirname, "..", "..", "..", "uploads");
      _storageAdapter = new LocalStorageAdapter(baseDir);
    }
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
            return callback(new Error(UploadErrorCode.MIME_MISMATCH));
          }
          headerValidated = true;
        }
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      // Reject empty files
      if (!headerBuf || headerBuf.length === 0) {
        return callback(new Error(UploadErrorCode.EMPTY_FILE));
      }
      // If file was very small and we never reached 8 bytes
      if (!headerValidated) {
        if (!validateMagicBytes(headerBuf, declaredMime)) {
          return callback(new Error(UploadErrorCode.MIME_MISMATCH));
        }
      }
      callback();
    },
  });

  const storage = getStorage();
  // Use pipeline() for proper error propagation — errors from validator
  // are caught here rather than surfacing as unhandled exceptions.
  const pass = new PassThrough();
  const writePromise = storage.writeStream(storageKey, pass, maxBytes);
  await pipeline(stream, validator, pass);
  const bytesWritten = await writePromise;
  return { bytesWritten, checksum: hash.digest("hex") };
}
