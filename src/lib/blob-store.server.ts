import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptBytes, encryptBytes } from "@/lib/file-crypto.server";

const DISK_ROOT = path.join(process.cwd(), "data", "blobs");

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function useDisk() {
  // File bytes belong in the database (data_room_blobs), not on the local disk.
  return false;
}

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  if (useDisk()) {
    await mkdir(DISK_ROOT, { recursive: true });
    schemaReady = true;
    return;
  }
  const q = await sql();
  await q.query(`
    create table if not exists data_room_blobs (
      storage_key text not null,
      chunk_index integer not null,
      payload bytea not null,
      primary key (storage_key, chunk_index)
    )
  `);
  schemaReady = true;
}

function chunkPath(storageKey: string, index: number) {
  return path.join(DISK_ROOT, storageKey, `${String(index).padStart(5, "0")}.bin`);
}

export async function putBlobChunk(
  storageKey: string,
  index: number,
  plain: Uint8Array,
) {
  await ensureSchema();
  const packed = encryptBytes(plain, `${storageKey}:${index}`);
  if (useDisk()) {
    const dir = path.join(DISK_ROOT, storageKey);
    await mkdir(dir, { recursive: true });
    await writeFile(chunkPath(storageKey, index), packed);
    return;
  }
  const q = await sql();
  await q.query(
    `insert into data_room_blobs (storage_key, chunk_index, payload)
     values ($1, $2, $3)
     on conflict (storage_key, chunk_index) do update set payload = excluded.payload`,
    [storageKey, index, packed],
  );
}

export async function listBlobChunkIndexes(storageKey: string): Promise<number[]> {
  await ensureSchema();
  if (useDisk()) {
    const { readdir } = await import("node:fs/promises");
    try {
      const names = await readdir(path.join(DISK_ROOT, storageKey));
      return names
        .filter((name) => name.endsWith(".bin"))
        .map((name) => Number.parseInt(name, 10))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
    } catch {
      return [];
    }
  }
  const q = await sql();
  const rows = await q.query<{ chunk_index: number }>(
    `select chunk_index from data_room_blobs where storage_key = $1 order by chunk_index`,
    [storageKey],
  );
  return rows.map((row) => Number(row.chunk_index));
}

export async function readBlob(storageKey: string): Promise<Buffer> {
  await ensureSchema();
  const indexes = await listBlobChunkIndexes(storageKey);
  const parts: Buffer[] = [];
  if (indexes.length > 0) {
    const q = await sql();
    const rows = await q.query<{ chunk_index: number; payload: unknown }>(
      `select chunk_index, payload from data_room_blobs
       where storage_key = $1 order by chunk_index`,
      [storageKey],
    );
    for (const row of rows) {
      const packed = toBuffer(row.payload);
      parts.push(decryptBytes(packed, `${storageKey}:${row.chunk_index}`));
    }
    return Buffer.concat(parts);
  }
  const { readdir } = await import("node:fs/promises");
  try {
    const names = await readdir(path.join(DISK_ROOT, storageKey));
    const diskIndexes = names
      .filter((name) => name.endsWith(".bin"))
      .map((name) => Number.parseInt(name, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    for (const index of diskIndexes) {
      const packed = await readFile(chunkPath(storageKey, index));
      parts.push(decryptBytes(packed, `${storageKey}:${index}`));
    }
    if (parts.length) return Buffer.concat(parts);
  } catch {
    /* no leftover disk blob */
  }
  throw new Error("File data is missing");
}

export async function deleteBlob(storageKey: string) {
  if (!storageKey) return;
  await ensureSchema();
  if (useDisk()) {
    await rm(path.join(DISK_ROOT, storageKey), { recursive: true, force: true });
    return;
  }
  const q = await sql();
  await q.query(`delete from data_room_blobs where storage_key = $1`, [storageKey]);
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "base64");
  throw new Error("Stored file is corrupt");
}
