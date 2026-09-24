/**
 * Durable, multi-instance-safe database persistence via Vercel Blob.
 *
 * Problem this solves: on Vercel each serverless instance gets its own
 * ephemeral SQLite file in /tmp. Without persistence, every cold start wiped
 * admin imports and user data. With naive snapshotting (upload after every
 * write, download on boot), two concurrent instances could still clobber each
 * other — a stale instance flushing after a fresh one restored deleted rows
 * and erased newer writes (last-writer-wins).
 *
 * This version adds **merge-on-flush**: before uploading, the instance checks
 * the remote snapshot's etag; if another instance uploaded since our last
 * sync, that snapshot is downloaded and merged additively
 * (`INSERT OR IGNORE` per table — local data is never deleted or overwritten).
 * Concurrent instances therefore converge on the UNION of their writes
 * instead of erasing each other.
 *
 * Known limitation (documented in docs/DEPLOYMENT.md): deletions do not
 * replicate reliably — a row deleted on instance A can re-appear from
 * instance B's stale copy until B merges. For this demo profile that is the
 * right trade-off; real multi-master safety means Postgres (see
 * docs/DATABASE.md §PostgreSQL migration).
 *
 * Failure modes are handled conservatively:
 *  - No BLOB_READ_WRITE_TOKEN (local dev) → persistence disabled, as before.
 *  - Corrupt/unreadable snapshot → ignored, fresh seed (never crash boot).
 *  - Flush/merge failures are logged and retried on the next write.
 */

import { getDb } from "./index";

const BLOB_PATH = "dbsnapshots/medsafe-latest.db";
const MIN_SNAPSHOT_BYTES = 4096; // an initialized+seeded schema is never smaller

type BlobClient = {
  head: (pathname: string, opts: { access: "private" }) => Promise<{
    size: number;
    uploadedAt?: Date;
    etag?: string;
  }>;
  get: (pathname: string, opts: { access: "private" }) => Promise<
    | { stream: ReadableStream | null; blob: { size: number | null; uploadedAt: Date; etag?: string } }
    | null
  >;
  put: (
    pathname: string,
    body: Buffer,
    opts: { access: "private"; addRandomSuffix: false }
  ) => Promise<{ etag?: string } | undefined>;
};

let cached: BlobClient | null = null;
/** Etag of the snapshot this instance last downloaded/uploaded (null = unknown). */
let lastSyncedEtag: string | null = null;

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
 * Tables merged from remote snapshots, in foreign-key-safe order
 * (parents before children). `sessions` is intentionally excluded —
 * sessions are stateless signed cookies since the serverless fix.
 */
const MERGE_TABLES = [
  "users",
  "admins",
  "sources",
  "active_ingredients",
  "medicines",
  "medicine_ingredients",
  "warnings",
  "interactions",
  "user_medicines",
  "reminders",
  "scan_history",
  "reports",
  "translations",
  "search_stats",
  "audit_log",
  "import_history",
] as const;

/**
 * Download the newest snapshot into the local SQLite file, if one exists and
 * looks healthy. Called from instrumentation.ts before seeding so a restored
 * database is never overwritten by demo data.
 */
export async function restoreLatestSnapshot(): Promise<void> {
  const blob = await getBlobClient();
  if (!blob) return;
  try {
    const meta = await blob.head(BLOB_PATH, { access: "private" }).catch(() => null);
    if (!meta || meta.size < MIN_SNAPSHOT_BYTES) return;
    const data = await blob.get(BLOB_PATH, { access: "private" });
    if (!data || !data.stream) return;
    const buf = Buffer.from(await new Response(data.stream).arrayBuffer());
    if (buf.length < MIN_SNAPSHOT_BYTES || buf.subarray(0, 15).toString("utf8") !== "SQLite format 3") {
      console.warn("[medsafe:persistence] snapshot failed integrity check; starting fresh");
      return;
    }
    const fs = await import("node:fs");
    fs.writeFileSync(dbFilePath(), buf);
    lastSyncedEtag = meta.etag ?? data.blob?.etag ?? null;
    console.log(
      `[medsafe:persistence] restored database snapshot (${buf.length} bytes, uploaded ${meta.uploadedAt?.toISOString?.() ?? "unknown"})`
    );
  } catch (err) {
    console.warn("[medsafe:persistence] restore skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * Merge a freshly downloaded remote snapshot into the local database,
 * additively: existing local rows always win, remote-only rows are added.
 * Tables whose schema differs from the local one are skipped (version skew
 * during deploys) so a partially-compatible snapshot never corrupts data.
 */
async function mergeRemoteSnapshot(buf: Buffer): Promise<number> {
  if (buf.length < MIN_SNAPSHOT_BYTES || buf.subarray(0, 15).toString("utf8") !== "SQLite format 3") return 0;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const remotePath = path.join(path.dirname(dbFilePath()), `medsafe-remote-${Date.now()}.db`);
  fs.writeFileSync(remotePath, buf);

  const db = getDb();
  let added = 0;
  try {
    db.exec(`ATTACH DATABASE '${remotePath.replace(/'/g, "''")}' AS merge_src`);
    try {
      // FK checks stay off for the merge: snapshots are internally consistent,
      // and row-level inserts in PK order can transiently violate FKs.
      db.pragma("foreign_keys = OFF");
      const run = db.transaction(() => {
        for (const table of MERGE_TABLES) {
          try {
            const localCols = (db.prepare(`PRAGMA main.table_info("${table}")`).all() as Array<{ name: string }>)
              .map((c) => c.name)
              .join("|");
            const remoteCols = (db.prepare(`PRAGMA merge_src.table_info("${table}")`).all() as Array<{ name: string }>)
              .map((c) => c.name)
              .join("|");
            if (!localCols || localCols !== remoteCols) continue; // schema skew: skip table
            const info = db
              .prepare(`INSERT OR IGNORE INTO main."${table}" SELECT * FROM merge_src."${table}"`)
              .run();
            added += Number(info.changes);
          } catch (err) {
            console.warn(`[medsafe:persistence] merge skipped table ${table}:`, err instanceof Error ? err.message : err);
          }
        }
      });
      run();
      db.pragma("foreign_keys = ON");
    } finally {
      db.exec("DETACH DATABASE merge_src");
    }
  } finally {
    fs.rmSync(remotePath, { force: true });
  }
  return added;
}

let flushing: Promise<void> | null = null;

/**
 * Upload the current database to Blob storage, merging any snapshot another
 * instance uploaded since our last sync first. Safe to call on every write:
 * concurrent calls coalesce into one in-flight upload and failures never
 * propagate to the request that triggered the write.
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
      // 1. If another instance uploaded since our last sync, merge its rows in
      //    first so the upload is a superset rather than a blind overwrite.
      const head = await blob.head(BLOB_PATH, { access: "private" }).catch(() => null);
      const remoteEtag = head?.etag ?? null;
      if (remoteEtag && remoteEtag !== lastSyncedEtag) {
        const data = await blob.get(BLOB_PATH, { access: "private" });
        if (data?.stream) {
          const buf = Buffer.from(await new Response(data.stream).arrayBuffer());
          const merged = await mergeRemoteSnapshot(buf);
          if (merged > 0) {
            console.log(`[medsafe:persistence] merged ${merged} remote row(s) before flush`);
          }
        }
        lastSyncedEtag = remoteEtag; // even a failed table merge shouldn't loop
      }

      // 2. Checkpoint WAL into the main file, then upload atomically.
      const db = getDb();
      db.pragma("wal_checkpoint(TRUNCATE)");
      const fs = await import("node:fs");
      const buf = fs.readFileSync(dbFilePath());
      if (buf.length < MIN_SNAPSHOT_BYTES) return;
      const res = await blob.put(BLOB_PATH, buf, { access: "private", addRandomSuffix: false });
      lastSyncedEtag = res?.etag ?? lastSyncedEtag;
    } catch (err) {
      console.warn("[medsafe:persistence] flush failed:", err instanceof Error ? err.message : err);
    } finally {
      flushing = null;
    }
  })();
}
