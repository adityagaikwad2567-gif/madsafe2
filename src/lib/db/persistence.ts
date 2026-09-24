/**
 * Durable database persistence via Vercel Blob.
 *
 * Problem this solves: on Vercel the SQLite file lives in per-instance /tmp,
 * which resets on every cold start — admin imports (and registrations,
 * reports, cabinet items) vanished moments after being written.
 *
 * Solution: after any write, the whole database is snapshotted to Blob
 * storage; on boot the latest snapshot is downloaded before the server
 * accepts requests. The dataset is tiny (<1 MB), so the round trip is
 * effectively instant and runs once per cold instance.
 *
 * Failure modes are handled conservatively:
 *  - No BLOB_READ_WRITE_TOKEN (local dev) → persistence disabled, as before.
 *  - Corrupt/unreadable snapshot → ignored, fresh seed (never crash boot).
 *  - Flush failures are logged and retried on the next write.
 */

import { getDb } from "./index";

const BLOB_PATH = "dbsnapshots/medsafe-latest.db";
const MIN_SNAPSHOT_BYTES = 4096; // an initialized+seeded schema is never smaller

type BlobClient = {
  head: (pathname: string, opts?: { download?: boolean }) => Promise<{ size: number; uploadedAt?: Date }>;
  get: (pathname: string, opts?: { download?: boolean }) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>;
  put: (pathname: string, body: Buffer, opts: { access: "private"; addRandomSuffix: false }) => Promise<unknown>;
};

let cached: BlobClient | null = null;

async function getBlobClient(): Promise<BlobClient | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  if (cached) return cached;
  try {
    const mod = (await import("@vercel/blob")) as unknown as BlobClient;
    cached = mod;
    return cached;
  } catch {
    return null;
  }
}

function dbFilePath(): string {
  return process.env.MEDSAFE_DB_PATH ?? "/tmp/medsafe.db";
}

/**
 * Download the newest snapshot into the local SQLite file, if one exists and
 * looks healthy. Called from instrumentation.ts before seeding so a restored
 * database is never overwritten by demo data.
 */
export async function restoreLatestSnapshot(): Promise<void> {
  const blob = await getBlobClient();
  if (!blob) return;
  try {
    const meta = await blob.head(BLOB_PATH, { download: false }).catch(() => null);
    if (!meta || meta.size < MIN_SNAPSHOT_BYTES) return;
    const data = await blob.get(BLOB_PATH, { download: true });
    if (!data) return;
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length < MIN_SNAPSHOT_BYTES || buf.subarray(0, 15).toString("utf8") !== "SQLite format 3") {
      console.warn("[medsafe:persistence] snapshot failed integrity check; starting fresh");
      return;
    }
    const fs = await import("node:fs");
    fs.writeFileSync(dbFilePath(), buf);
    console.log(
      `[medsafe:persistence] restored database snapshot (${buf.length} bytes, uploaded ${meta.uploadedAt?.toISOString?.() ?? "unknown"})`
    );
  } catch (err) {
    console.warn("[medsafe:persistence] restore skipped:", err instanceof Error ? err.message : err);
  }
}

let flushing: Promise<void> | null = null;

/**
 * Upload the current database to Blob storage. Safe to call on every write:
 * concurrent calls share one in-flight upload, and failures never propagate
 * to the request that triggered the write.
 */
export function flushSnapshot(): void {
  void flushSnapshotAsync();
}

async function flushSnapshotAsync(): Promise<void> {
  const blob = await getBlobClient();
  if (!blob) return;
  if (flushing) return;
  flushing = (async () => {
    try {
      // Checkpoint WAL into the main file, then read it atomically.
      const db = getDb();
      db.pragma("wal_checkpoint(TRUNCATE)");
      const fs = await import("node:fs");
      const buf = fs.readFileSync(dbFilePath());
      if (buf.length < MIN_SNAPSHOT_BYTES) return;
      await blob.put(BLOB_PATH, buf, { access: "private", addRandomSuffix: false });
    } catch (err) {
      console.warn("[medsafe:persistence] flush failed:", err instanceof Error ? err.message : err);
    } finally {
      flushing = null;
    }
  })();
}
