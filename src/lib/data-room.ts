import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { ASSET_SEED } from "@/lib/seed-asset";
import { SEED } from "@/lib/seed";
import type { DdState } from "@/lib/types";
import { uid } from "@/lib/utils";
import {
  categoryFolderId,
  requestFolderId,
  roomRoot,
  roomIdPrefix,
  type WorkspaceId,
} from "@/lib/workspace";
import { emailToUsername } from "@/lib/folia-username";
import { can } from "@/lib/roles";
import { assertFolderAccess, assertProjectAccess } from "@/lib/projects-db";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, UPLOAD_CHUNK_BYTES } from "@/lib/file-limits";

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, UPLOAD_CHUNK_BYTES };

const workspaceSchema = z.enum(["entity", "asset"]);
const projectIdSchema = z.string().min(1).max(80);

let requestFoldersSynced = new Set<string>();

export type RoomFolder = {
  id: string;
  parentId: string | null;
  name: string;
  projectId: string;
};

export type RoomFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdOn: string;
  reviewed: boolean;
};

export type RoomListing = {
  folder: RoomFolder;
  crumbs: RoomFolder[];
  folders: Array<RoomFolder & { fileCount: number }>;
  files: RoomFile[];
};

export type RoomStats = {
  files: number;
  folders: number;
  reviewed: number;
};

export type RoomSearchHit = RoomFile & {
  folderId: string;
  folderName: string;
};

export type RoomFolderOption = {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
};

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function placeholderPdf(title: string, room: string): { b64: string; bytes: number } {
  const safe = title.replace(/[()\\]/g, " ").slice(0, 80);
  const roomSafe = room.replace(/[()\\]/g, " ").slice(0, 80);
  const stream = `BT /F1 14 Tf 72 720 Td (${safe}) Tj /F1 10 Tf 0 -24 Td (${roomSafe} data room) Tj ET`;
  const body = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
trailer<< /Root 1 0 R >>
%%EOF
`;
  const bytes = new TextEncoder().encode(body);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return { b64: btoa(binary), bytes: bytes.length };
}

function mimeFor(kind: string) {
  if (kind === "pdf") return "application/pdf";
  if (kind === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (kind === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (kind === "zip") return "application/zip";
  return "application/octet-stream";
}

function folderNameForDoc(doc: { name: string; period?: string }) {
  const base = doc.period ? `${doc.name} (${doc.period})` : doc.name;
  return base.slice(0, 120);
}

async function seedTree(
  rootId: string,
  seed: DdState,
  idPrefix: string,
  projectId: string,
  withFiles: boolean,
) {
  const q = await sql();
  await q`
    insert into data_room_folders (id, parent_id, name, sort_order, project_id)
    values (${rootId}, null, ${seed.matter.name}, 0, ${projectId})
    on conflict (id) do nothing
  `;
  for (const [i, cat] of seed.categories.entries()) {
    await q`
      insert into data_room_folders (id, parent_id, name, sort_order, project_id)
      values (${`${idPrefix}dir-${cat.id}`}, ${rootId}, ${cat.name}, ${i + 1}, ${projectId})
      on conflict (id) do nothing
    `;
  }
  for (const [i, doc] of seed.documents.entries()) {
    if (doc.status === "not_applicable") continue;
    const itemFolderId = `${idPrefix}req-${doc.id}`;
    const parentId = `${idPrefix}dir-${doc.categoryId}`;
    await q`
      insert into data_room_folders (id, parent_id, name, sort_order, project_id)
      values (${itemFolderId}, ${parentId}, ${folderNameForDoc(doc)}, ${i + 1}, ${projectId})
      on conflict (id) do nothing
    `;
    if (!withFiles || !doc.receivedOn) continue;
    const ext = doc.kind;
    const name = `${folderNameForDoc(doc)}.${ext}`;
    const { b64, bytes } = placeholderPdf(name, seed.matter.name);
    await q`
      insert into data_room_files (id, folder_id, name, mime_type, size_bytes, content_b64)
      values (
        ${`${idPrefix}file-${doc.id}`},
        ${itemFolderId},
        ${name},
        ${mimeFor(doc.kind)},
        ${bytes},
        ${b64}
      )
      on conflict (id) do nothing
    `;
  }
}

async function syncRequestFolders(seed: DdState, idPrefix: string, projectId: string) {
  const q = await sql();
  for (const doc of seed.documents) {
    if (doc.status === "not_applicable") continue;
    const itemFolderId = `${idPrefix}req-${doc.id}`;
    const parentId = `${idPrefix}dir-${doc.categoryId}`;
    const parent = await folderRow(parentId);
    if (!parent) continue;
    await q`
      insert into data_room_folders (id, parent_id, name, sort_order, project_id)
      values (${itemFolderId}, ${parentId}, ${folderNameForDoc(doc)}, ${1000}, ${projectId})
      on conflict (id) do update set name = excluded.name
    `;
    const fileId = `${idPrefix}file-${doc.id}`;
    await q`
      update data_room_files
      set folder_id = ${itemFolderId}
      where id = ${fileId} and folder_id <> ${itemFolderId}
    `;
  }
}

async function ensureOneRequestFolder(input: {
  projectId: string;
  workspace: WorkspaceId;
  documentId: string;
  categoryId: string;
  name: string;
}): Promise<string> {
  const parentId = categoryFolderId(input.workspace, input.categoryId, input.projectId);
  let parent = await folderRow(parentId);
  if (!parent) {
    const rootId = roomRoot(input.projectId, input.workspace);
    const q = await sql();
    await q`
      insert into data_room_folders (id, parent_id, name, sort_order, project_id)
      values (${parentId}, ${rootId}, ${"Category"}, 1000, ${input.projectId})
      on conflict (id) do nothing
    `;
    parent = await folderRow(parentId);
  }
  if (!parent) throw new Error("Category folder not found");
  const id = requestFolderId(input.workspace, input.documentId, input.projectId);
  const existing = await folderRow(id);
  const name = input.name.trim().slice(0, 120) || "Requested file";
  const q = await sql();
  if (existing) {
    if (existing.name !== name) {
      await q`update data_room_folders set name = ${name} where id = ${id}`;
    }
    return id;
  }
  await q`
    insert into data_room_folders (id, parent_id, name, sort_order, project_id)
    values (${id}, ${parent.id}, ${name}, 1000, ${input.projectId})
    on conflict (id) do nothing
  `;
  return id;
}

async function ensureReviewedColumn() {
  const q = await sql();
  await q.query(`
    alter table data_room_files
    add column if not exists reviewed boolean not null default false
  `);
  await q.query(`
    alter table data_room_files
    add column if not exists reviewed_by text
  `);
  await q.query(`
    alter table data_room_files
    add column if not exists storage_key text
  `);
  await q.query(`
    alter table data_room_files
    add column if not exists ready boolean not null default true
  `);
  await q.query(`
    alter table data_room_files
    add column if not exists flagged boolean not null default false
  `);
  await q.query(`
    alter table data_room_folders
    add column if not exists project_id text not null default '${DEFAULT_PROJECT_ID}'
  `);
  await q.query(`
    alter table data_room_files
    add column if not exists assigned_user_id text
  `);
  await q.query(`
    alter table data_room_folders
    add column if not exists assigned_user_id text
  `);
}

function documentIdFromFolderId(folderId: string): string | null {
  const asset = folderId.match(/(?:^|-)asset-req-(.+)$/);
  if (asset) return asset[1];
  const req = folderId.match(/(?:^|-)req-(.+)$/);
  if (req) return req[1];
  return null;
}

export async function ensureProjectRoom(
  projectId: string,
  opts: { sampleFiles?: boolean; name?: string } = {},
) {
  await ensureReviewedColumn();
  const withFiles = opts.sampleFiles ?? projectId === DEFAULT_PROJECT_ID;
  const q = await sql();
  const entityRoot = roomRoot(projectId, "entity");
  const assetRoot = roomRoot(projectId, "asset");
  const roots = await q<{ id: string }>`
    select id from data_room_folders where id in (${entityRoot}, ${assetRoot})
  `;
  const ids = new Set(roots.map((r) => r.id));
  const entitySeed = opts.name ? { ...SEED, matter: { ...SEED.matter, name: opts.name } } : SEED;
  const assetSeed = opts.name
    ? { ...ASSET_SEED, matter: { ...ASSET_SEED.matter, name: opts.name } }
    : ASSET_SEED;
  if (!ids.has(entityRoot)) {
    await seedTree(
      entityRoot,
      entitySeed,
      roomIdPrefix(projectId, "entity"),
      projectId,
      withFiles,
    );
  }
  if (!ids.has(assetRoot)) {
    await seedTree(
      assetRoot,
      assetSeed,
      roomIdPrefix(projectId, "asset"),
      projectId,
      withFiles,
    );
  }
  await q`
    update data_room_folders set project_id = ${projectId}
    where id = ${entityRoot} or id = ${assetRoot}
  `;
  if (opts.name) {
    await q`
      update data_room_folders set name = ${opts.name}
      where id = ${entityRoot} or id = ${assetRoot}
    `;
  }
  if (!requestFoldersSynced.has(projectId)) {
    await syncRequestFolders(SEED, roomIdPrefix(projectId, "entity"), projectId);
    await syncRequestFolders(ASSET_SEED, roomIdPrefix(projectId, "asset"), projectId);
    requestFoldersSynced.add(projectId);
  }
  if (projectId === DEFAULT_PROJECT_ID) {
    const { seedLindenPack } = await import("@/lib/load-test-dd");
    await seedLindenPack(projectId);
  }
}

async function ensureSeeded() {
  await ensureProjectRoom(DEFAULT_PROJECT_ID, { sampleFiles: true });
}

async function folderIdsInTree(rootId: string, projectId: string): Promise<Set<string>> {
  const q = await sql();
  const rows = await q<{ id: string; parent_id: string | null }>`
    select id, parent_id from data_room_folders where project_id = ${projectId}
  `;
  const kids = new Map<string | null, string[]>();
  for (const row of rows) {
    const list = kids.get(row.parent_id) ?? [];
    list.push(row.id);
    kids.set(row.parent_id, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of kids.get(id) ?? []) stack.push(child);
  }
  return out;
}

async function subtreeFileCounts(
  rootIds: string[],
  projectId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (rootIds.length === 0) return counts;
  const q = await sql();
  const folderRows = await q<{ id: string; parent_id: string | null }>`
    select id, parent_id from data_room_folders where project_id = ${projectId}
  `;
  const kids = new Map<string, string[]>();
  for (const row of folderRows) {
    if (!row.parent_id) continue;
    const list = kids.get(row.parent_id) ?? [];
    list.push(row.id);
    kids.set(row.parent_id, list);
  }
  const fileRows = await q<{ folder_id: string }>`
    select f.folder_id
    from data_room_files f
    join data_room_folders d on d.id = f.folder_id
    where d.project_id = ${projectId}
      and coalesce(f.ready, true) = true
  `;
  const direct = new Map<string, number>();
  for (const row of fileRows) {
    direct.set(row.folder_id, (direct.get(row.folder_id) ?? 0) + 1);
  }
  const walk = (id: string): number => {
    let n = direct.get(id) ?? 0;
    for (const child of kids.get(id) ?? []) n += walk(child);
    return n;
  };
  for (const id of rootIds) counts.set(id, walk(id));
  return counts;
}

type FolderRecord = { id: string; parentId: string | null; name: string };

async function allFolderRecords(projectId: string): Promise<FolderRecord[]> {
  const q = await sql();
  const rows = await q<{ id: string; parent_id: string | null; name: string }>`
    select id, parent_id, name from data_room_folders where project_id = ${projectId}
  `;
  return rows.map((r) => ({ id: r.id, parentId: r.parent_id, name: r.name }));
}

function parentMap(rows: FolderRecord[]) {
  return new Map(rows.map((r) => [r.id, r.parentId]));
}

function rootOf(id: string, parents: Map<string, string | null>) {
  let cur = id;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(cur)) return cur;
    seen.add(cur);
    const parent = parents.get(cur);
    if (!parent) return cur;
    cur = parent;
  }
}

function pathOf(id: string, byId: Map<string, FolderRecord>) {
  const parts: string[] = [];
  let cur: FolderRecord | undefined = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(" / ");
}

function isSelfOrDescendant(
  ancestorId: string,
  nodeId: string,
  parents: Map<string, string | null>,
) {
  let cur: string | null = nodeId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = parents.get(cur) ?? null;
  }
  return false;
}

async function folderRow(id: string): Promise<RoomFolder | null> {
  const q = await sql();
  const rows = await q<{
    id: string;
    parent_id: string | null;
    name: string;
    project_id: string | null;
  }>`select id, parent_id, name, project_id from data_room_folders where id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    projectId: row.project_id || DEFAULT_PROJECT_ID,
  };
}

async function crumbsFor(folder: RoomFolder): Promise<RoomFolder[]> {
  const chain: RoomFolder[] = [];
  let cursor: RoomFolder | null = folder;
  while (cursor) {
    chain.unshift(cursor);
    if (!cursor.parentId) break;
    const parent = await folderRow(cursor.parentId);
    if (!parent || parent.projectId !== folder.projectId) break;
    cursor = parent;
  }
  return chain;
}

export const listRoomStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ projectId: projectIdSchema, workspace: workspaceSchema }))
  .handler(async ({ context, data }): Promise<RoomStats> => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureProjectRoom(data.projectId);
    const ids = await folderIdsInTree(
      roomRoot(data.projectId, data.workspace as WorkspaceId),
      data.projectId,
    );
    const q = await sql();
    const files = await q<{ folder_id: string; reviewed: boolean | null }>`
      select f.folder_id, f.reviewed
      from data_room_files f
      join data_room_folders d on d.id = f.folder_id
      where d.project_id = ${data.projectId}
        and coalesce(f.ready, true) = true
    `;
    const inRoom = files.filter((f) => ids.has(f.folder_id));
    return {
      files: inRoom.length,
      folders: ids.size,
      reviewed: inRoom.filter((f) => Boolean(f.reviewed)).length,
    };
  });

export const listFolder = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ folderId: z.string() }))
  .handler(async ({ context, data }): Promise<RoomListing> => {
    await ensureSeeded();
    const folder = await folderRow(data.folderId);
    if (!folder) throw new Error("Folder not found");
    await assertFolderAccess(context.userId, folder.id);
    const q = await sql();
    const folders = await q<{
      id: string;
      parent_id: string | null;
      name: string;
    }>`
      select f.id, f.parent_id, f.name
      from data_room_folders f
      where f.parent_id = ${folder.id}
        and f.project_id = ${folder.projectId}
      order by f.sort_order, f.name
    `;
    const files = await q<{
      id: string;
      name: string;
      mime_type: string;
      size_bytes: number;
      created_on: string;
      reviewed: boolean;
    }>`
      select id, name, mime_type, size_bytes, to_char(created_at, 'YYYY-MM-DD') as created_on,
        reviewed
      from data_room_files
      where folder_id = ${folder.id}
        and coalesce(ready, true) = true
      order by name
    `;
    const counts = await subtreeFileCounts(
      folders.map((f) => f.id),
      folder.projectId,
    );
    return {
      folder,
      crumbs: await crumbsFor(folder),
      folders: folders.map((f) => ({
        id: f.id,
        parentId: f.parent_id,
        name: f.name,
        projectId: folder.projectId,
        fileCount: counts.get(f.id) ?? 0,
      })),
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mime_type,
        sizeBytes: f.size_bytes,
        createdOn: f.created_on,
        reviewed: Boolean(f.reviewed),
      })),
    };
  });

export const searchFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      query: z.string().trim().min(1).max(120),
      projectId: projectIdSchema,
      workspace: workspaceSchema,
    }),
  )
  .handler(async ({ context, data }): Promise<RoomSearchHit[]> => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureProjectRoom(data.projectId);
    const needle = data.query.toLowerCase();
    const ids = await folderIdsInTree(
      roomRoot(data.projectId, data.workspace as WorkspaceId),
      data.projectId,
    );
    const q = await sql();
    const rows = await q<{
      id: string;
      name: string;
      mime_type: string;
      size_bytes: number;
      created_on: string;
      folder_id: string;
      folder_name: string;
      reviewed: boolean;
    }>`
      select f.id, f.name, f.mime_type, f.size_bytes,
        to_char(f.created_at, 'YYYY-MM-DD') as created_on,
        f.folder_id, d.name as folder_name, f.reviewed
      from data_room_files f
      join data_room_folders d on d.id = f.folder_id
      where d.project_id = ${data.projectId}
        and coalesce(f.ready, true) = true
      order by f.name
    `;
    return rows
      .filter((f) => ids.has(f.folder_id) && f.name.toLowerCase().includes(needle))
      .map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mime_type,
        sizeBytes: f.size_bytes,
        createdOn: f.created_on,
        reviewed: Boolean(f.reviewed),
        folderId: f.folder_id,
        folderName: f.folder_name,
      }));
  });

export const createFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      parentId: z.string(),
      name: z.string().trim().min(1).max(120),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureSeeded();
    const parent = await folderRow(data.parentId);
    if (!parent) throw new Error("Folder not found");
    await assertFolderAccess(context.userId, parent.id);
    const id = uid("dir");
    const q = await sql();
    await q`
      insert into data_room_folders (id, parent_id, name, sort_order, project_id)
      values (${id}, ${parent.id}, ${data.name}, 1000, ${parent.projectId})
    `;
    return { id };
  });

export const ensureFolderPath = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      parentId: z.string(),
      segments: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureSeeded();
    let parent = await folderRow(data.parentId);
    if (!parent) throw new Error("Folder not found");
    await assertFolderAccess(context.userId, parent.id);
    const q = await sql();
    for (const raw of data.segments) {
      const name = raw.trim().slice(0, 120);
      if (!name) continue;
      const rows = await q<{ id: string }>`
        select id from data_room_folders
        where parent_id = ${parent.id} and lower(name) = ${name.toLowerCase()}
        order by name
        limit 1
      `;
      if (rows[0]) {
        const next = await folderRow(rows[0].id);
        if (!next) throw new Error("Folder not found");
        parent = next;
        continue;
      }
      const id = uid("dir");
      await q`
        insert into data_room_folders (id, parent_id, name, sort_order, project_id)
        values (${id}, ${parent.id}, ${name}, 1000, ${parent.projectId})
      `;
      parent = { id, parentId: parent.id, name, projectId: parent.projectId };
    }
    return { id: parent.id };
  });

export const beginUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      folderId: z.string().min(1).max(80).optional(),
      name: z.string().trim().min(1).max(180),
      mimeType: z.string().min(1).max(120),
      sizeBytes: z.number().int().positive(),
      request: z
        .object({
          projectId: projectIdSchema,
          workspace: workspaceSchema,
          documentId: z.string().min(1).max(80),
          categoryId: z.string().min(1).max(80),
          folderName: z.string().trim().min(1).max(120),
        })
        .optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    if (data.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`File is over the ${MAX_UPLOAD_LABEL} limit`);
    }
    let folderId = data.folderId ?? "";
    if (data.request) {
      await assertProjectAccess(context.userId, data.request.projectId);
      await ensureProjectRoom(data.request.projectId);
      folderId = await ensureOneRequestFolder({
        projectId: data.request.projectId,
        workspace: data.request.workspace as WorkspaceId,
        documentId: data.request.documentId,
        categoryId: data.request.categoryId,
        name: data.request.folderName,
      });
    }
    const folder = await folderRow(folderId);
    if (!folder) throw new Error("Folder not found");
    await assertFolderAccess(context.userId, folder.id);
    const id = uid("file");
    const storageKey = uid("blob");
    const q = await sql();
    await ensureReviewedColumn();
    const folderAssign = await q<{ assigned_user_id: string | null }>`
      select assigned_user_id from data_room_folders where id = ${folder.id}
    `;
    const assignedUserId = folderAssign[0]?.assigned_user_id ?? null;
    await q`
      insert into data_room_files (
        id, folder_id, name, mime_type, size_bytes, content_b64, storage_key, ready, assigned_user_id
      )
      values (
        ${id}, ${folder.id}, ${data.name}, ${data.mimeType}, ${data.sizeBytes},
        ${""}, ${storageKey}, false, ${assignedUserId}
      )
    `;
    return { id, folderId: folder.id, storageKey, chunkBytes: UPLOAD_CHUNK_BYTES };
  });

export const completeUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    await ensureSeeded();
    const q = await sql();
    const rows = await q<{
      id: string;
      folder_id: string;
      size_bytes: number;
      storage_key: string | null;
    }>`
      select id, folder_id, size_bytes, storage_key
      from data_room_files
      where id = ${data.id}
    `;
    const row = rows[0];
    if (!row?.storage_key) throw new Error("Upload not found");
    await assertFolderAccess(context.userId, row.folder_id);
    const { listBlobChunkIndexes } = await import("@/lib/blob-store.server");
    const indexes = await listBlobChunkIndexes(row.storage_key);
    const expected = Math.max(1, Math.ceil(row.size_bytes / UPLOAD_CHUNK_BYTES));
    if (indexes.length !== expected) {
      throw new Error("Upload is incomplete");
    }
    await q`
      update data_room_files set ready = true where id = ${row.id}
    `;
    return { id: row.id, folderId: row.folder_id };
  });

export const uploadFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      folderId: z.string(),
      name: z.string().trim().min(1).max(180),
      mimeType: z.string().min(1).max(120),
      contentB64: z.string().min(1),
      sizeBytes: z.number().int().positive(),
    }),
  )
  .handler(async () => {
    throw new Error("Use the secure upload flow");
  });

export const uploadToRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      workspace: workspaceSchema,
      documentId: z.string().min(1).max(80),
      categoryId: z.string().min(1).max(80),
      folderName: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(180),
      mimeType: z.string().min(1).max(120),
      contentB64: z.string().min(1),
      sizeBytes: z.number().int().positive(),
    }),
  )
  .handler(async () => {
    throw new Error("Use the secure upload flow");
  });

export const ensureRequestFolders = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: projectIdSchema,
      workspace: workspaceSchema,
      items: z
        .array(
          z.object({
            documentId: z.string().min(1).max(80),
            categoryId: z.string().min(1).max(80),
            name: z.string().trim().min(1).max(120),
          }),
        )
        .max(200),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureProjectRoom(data.projectId);
    for (const item of data.items) {
      await ensureOneRequestFolder({
        projectId: data.projectId,
        workspace: data.workspace as WorkspaceId,
        documentId: item.documentId,
        categoryId: item.categoryId,
        name: item.name,
      });
    }
    return { ok: true as const };
  });

export const ensureCategoryFolders = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: projectIdSchema,
      workspace: workspaceSchema,
      categories: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            name: z.string().trim().min(1).max(120),
          }),
        )
        .max(80),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureProjectRoom(data.projectId);
    const rootId = roomRoot(data.projectId, data.workspace as WorkspaceId);
    const q = await sql();
    for (const [i, cat] of data.categories.entries()) {
      const id = categoryFolderId(data.workspace as WorkspaceId, cat.id, data.projectId);
      await q`
        insert into data_room_folders (id, parent_id, name, sort_order, project_id)
        values (${id}, ${rootId}, ${cat.name}, ${1000 + i}, ${data.projectId})
        on conflict (id) do update set name = excluded.name
      `;
    }
    return { ok: true as const };
  });

export async function ensureListFolders(
  projectId: string,
  workspace: WorkspaceId,
  categories: { id: string; name: string }[],
  requests: { documentId: string | null; categoryId: string; name: string }[],
) {
  await ensureProjectRoom(projectId);
  const rootId = roomRoot(projectId, workspace);
  const q = await sql();
  for (const [i, cat] of categories.entries()) {
    const id = categoryFolderId(workspace, cat.id, projectId);
    await q`
      insert into data_room_folders (id, parent_id, name, sort_order, project_id)
      values (${id}, ${rootId}, ${cat.name}, ${1000 + i}, ${projectId})
      on conflict (id) do update set name = excluded.name
    `;
  }
  for (const item of requests) {
    if (!item.documentId) continue;
    await ensureOneRequestFolder({
      projectId,
      workspace,
      documentId: item.documentId,
      categoryId: item.categoryId,
      name: item.name.slice(0, 120),
    });
  }
}

export const getFile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    await ensureReviewedColumn();
    const q = await sql();
    const rows = await q<{
      id: string;
      name: string;
      mime_type: string;
      size_bytes: number;
      reviewed: boolean;
      folder_id: string;
      ready: boolean | null;
    }>`
      select id, name, mime_type, size_bytes, reviewed, folder_id, ready
      from data_room_files
      where id = ${data.id}
    `;
    const row = rows[0];
    if (!row || row.ready === false) throw new Error("File not found");
    await assertFolderAccess(context.userId, row.folder_id);
    return {
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      reviewed: Boolean(row.reviewed),
      folderId: row.folder_id,
    };
  });

export async function readFileBytes(
  id: string,
  userId: string,
): Promise<{
  name: string;
  mimeType: string;
  bytes: Buffer;
}> {
  await ensureReviewedColumn();
  const q = await sql();
  const rows = await q<{
    name: string;
    mime_type: string;
    content_b64: string | null;
    storage_key: string | null;
    ready: boolean | null;
    folder_id: string;
  }>`
    select name, mime_type, content_b64, storage_key, ready, folder_id
    from data_room_files
    where id = ${id}
  `;
  const row = rows[0];
  if (!row || row.ready === false) throw new Error("File not found");
  await assertFolderAccess(userId, row.folder_id);
  if (row.storage_key) {
    const { readBlob } = await import("@/lib/blob-store.server");
    const bytes = await readBlob(row.storage_key);
    return { name: row.name, mimeType: row.mime_type, bytes };
  }
  const b64 = row.content_b64 ?? "";
  return {
    name: row.name,
    mimeType: row.mime_type,
    bytes: Buffer.from(b64, "base64"),
  };
}

export const setFileReviewed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1).max(80),
      reviewed: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureReviewedColumn();
    const q = await sql();
    const rows = await q<{ id: string; folder_id: string }>`
      select id, folder_id from data_room_files where id = ${data.id}
    `;
    const row = rows[0];
    if (!row) throw new Error("File not found");
    const access = await assertFolderAccess(context.userId, row.folder_id);
    if (!can(access.role, "markReviewed")) {
      throw new Error("You do not have permission to do that");
    }
    let reviewedBy: string | null = null;
    if (data.reviewed) {
      const users = await q<{ name: string; email: string }>`
        select name, email from "user" where id = ${context.userId}
      `;
      const person = users[0];
      reviewedBy =
        person?.name?.trim() ||
        emailToUsername(person?.email) ||
        "Unknown";
    }
    await q`
      update data_room_files
      set reviewed = ${data.reviewed}, reviewed_by = ${reviewedBy}
      where id = ${data.id}
    `;
    const documentId = documentIdFromFolderId(row.folder_id);
    let documentReviewed = data.reviewed;
    if (documentId) {
      const counts = await q<{ n: number }>`
        select count(*)::int as n
        from data_room_files
        where folder_id = ${row.folder_id} and reviewed = true
      `;
      documentReviewed = (counts[0]?.n ?? 0) > 0;
    }
    return {
      ok: true as const,
      reviewed: data.reviewed,
      documentId,
      documentReviewed,
    };
  });

export const setFileFlagged = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1).max(80),
      flagged: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureReviewedColumn();
    const q = await sql();
    const rows = await q<{ id: string; folder_id: string }>`
      select id, folder_id from data_room_files where id = ${data.id}
    `;
    const row = rows[0];
    if (!row) throw new Error("File not found");
    const access = await assertFolderAccess(context.userId, row.folder_id);
    if (!can(access.role, "markReviewed")) {
      throw new Error("You do not have permission to do that");
    }
    await q`
      update data_room_files set flagged = ${data.flagged} where id = ${data.id}
    `;
    return { ok: true as const, flagged: data.flagged };
  });

export const assignRoomItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      kind: z.enum(["file", "folder"]),
      id: z.string().min(1).max(80),
      userId: z.string().min(1).max(80).nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureReviewedColumn();
    const q = await sql();
    let folderId: string;
    if (data.kind === "file") {
      const rows = await q<{ id: string; folder_id: string }>`
        select id, folder_id from data_room_files where id = ${data.id}
      `;
      if (!rows[0]) throw new Error("File not found");
      folderId = rows[0].folder_id;
    } else {
      const folder = await folderRow(data.id);
      if (!folder) throw new Error("Folder not found");
      folderId = folder.id;
    }
    const access = await assertFolderAccess(context.userId, folderId);
    if (!can(access.role, "assignFiles")) {
      throw new Error("You do not have permission to do that");
    }
    let username: string | null = null;
    if (data.userId) {
      const members = await q<{ user_id: string; name: string; email: string }>`
        select m.user_id, u.name, u.email
        from project_members m
        join "user" u on u.id = m.user_id
        where m.project_id = ${access.project.id} and m.user_id = ${data.userId}
      `;
      if (!members[0]) throw new Error("That person is not on this project");
      username = emailToUsername(members[0].email) || members[0].name;
    }
    const assigned = data.userId;
    const fileIds: string[] = [];
    const folderIds: string[] = [];
    if (data.kind === "file") {
      await q`
        update data_room_files set assigned_user_id = ${assigned} where id = ${data.id}
      `;
      fileIds.push(data.id);
    } else {
      const ids = await folderIdsInTree(data.id, access.project.id);
      for (const id of ids) {
        await q`
          update data_room_folders set assigned_user_id = ${assigned} where id = ${id}
        `;
        folderIds.push(id);
        const files = await q<{ id: string }>`
          select id from data_room_files where folder_id = ${id}
        `;
        for (const file of files) {
          await q`
            update data_room_files set assigned_user_id = ${assigned} where id = ${file.id}
          `;
          fileIds.push(file.id);
        }
      }
    }
    return {
      ok: true as const,
      assignedUserId: assigned,
      assignedUsername: username,
      fileIds,
      folderIds,
    };
  });

export const removeFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const q = await sql();
    const rows = await q<{ id: string; storage_key: string | null; folder_id: string }>`
      select id, storage_key, folder_id from data_room_files where id = ${data.id}
    `;
    if (!rows[0]) throw new Error("File not found");
    const access = await assertFolderAccess(context.userId, rows[0].folder_id);
    if (!can(access.role, "deleteRoom")) {
      throw new Error("You do not have permission to do that");
    }
    if (rows[0].storage_key) {
      const { deleteBlob } = await import("@/lib/blob-store.server");
      await deleteBlob(rows[0].storage_key);
    }
    await q`delete from data_room_files where id = ${data.id}`;
    return { ok: true as const, fileIds: [data.id] };
  });

export const removeFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    await ensureSeeded();
    const folder = await folderRow(data.id);
    if (!folder) throw new Error("Folder not found");
    const access = await assertFolderAccess(context.userId, folder.id);
    if (!can(access.role, "deleteRoom")) {
      throw new Error("You do not have permission to do that");
    }
    if (
      !folder.parentId ||
      folder.id === roomRoot(folder.projectId, "entity") ||
      folder.id === roomRoot(folder.projectId, "asset")
    ) {
      throw new Error("The data-room root cannot be deleted");
    }
    const ids = await folderIdsInTree(folder.id, folder.projectId);
    const q = await sql();
    const files = await q<{ id: string; folder_id: string; storage_key: string | null }>`
      select f.id, f.folder_id, f.storage_key
      from data_room_files f
      join data_room_folders d on d.id = f.folder_id
      where d.project_id = ${folder.projectId}
    `;
    const inTree = files.filter((f) => ids.has(f.folder_id));
    const fileIds = inTree.map((f) => f.id);
    const { deleteBlob } = await import("@/lib/blob-store.server");
    for (const file of inTree) {
      if (file.storage_key) await deleteBlob(file.storage_key);
    }
    await q`delete from data_room_folders where id = ${folder.id}`;
    return { ok: true as const, fileIds, folderIds: [...ids] };
  });

export const listFolderOptions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ projectId: projectIdSchema, workspace: workspaceSchema }))
  .handler(async ({ context, data }): Promise<RoomFolderOption[]> => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureProjectRoom(data.projectId);
    const rootId = roomRoot(data.projectId, data.workspace as WorkspaceId);
    const ids = await folderIdsInTree(rootId, data.projectId);
    const rows = await allFolderRecords(data.projectId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return rows
      .filter((r) => ids.has(r.id))
      .map((r) => ({
        id: r.id,
        parentId: r.parentId,
        name: r.name,
        path: pathOf(r.id, byId),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  });

export type RoomFileOption = {
  id: string;
  name: string;
  folderId: string;
  path: string;
};

export type RoomReviewFolder = {
  id: string;
  parentId: string | null;
  name: string;
  assignedUserId: string | null;
  assignedUsername: string | null;
};

export type RoomReviewFile = {
  id: string;
  folderId: string;
  name: string;
  reviewed: boolean;
  reviewedBy: string | null;
  flagged: boolean;
  assignedUserId: string | null;
  assignedUsername: string | null;
};

export const listRoomReviewTree = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ projectId: projectIdSchema, workspace: workspaceSchema }))
  .handler(async ({ context, data }): Promise<{
    folders: RoomReviewFolder[];
    files: RoomReviewFile[];
  }> => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureProjectRoom(data.projectId);
    const rootId = roomRoot(data.projectId, data.workspace as WorkspaceId);
    const ids = await folderIdsInTree(rootId, data.projectId);
    const q = await sql();
    const folderRows = await q<{
      id: string;
      parent_id: string | null;
      name: string;
      assigned_user_id: string | null;
    }>`
      select id, parent_id, name, assigned_user_id
      from data_room_folders
      where project_id = ${data.projectId}
    `;
    const fileRows = await q<{
      id: string;
      folder_id: string;
      name: string;
      reviewed: boolean;
      reviewed_by: string | null;
      flagged: boolean | null;
      assigned_user_id: string | null;
    }>`
      select f.id, f.folder_id, f.name, f.reviewed, f.reviewed_by, f.flagged, f.assigned_user_id
      from data_room_files f
      join data_room_folders d on d.id = f.folder_id
      where d.project_id = ${data.projectId}
        and coalesce(f.ready, true) = true
      order by f.name
    `;
    const assigneeIds = [
      ...new Set(
        [...folderRows, ...fileRows]
          .map((row) => row.assigned_user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users: { id: string; name: string; email: string }[] = [];
    for (const id of assigneeIds) {
      const rows = await q<{ id: string; name: string; email: string }>`
        select id, name, email from "user" where id = ${id}
      `;
      if (rows[0]) users.push(rows[0]);
    }
    const nameById = new Map(
      users.map((row) => [row.id, emailToUsername(row.email) || row.name]),
    );
    const folders = folderRows
      .filter((r) => ids.has(r.id))
      .map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        assignedUserId: r.assigned_user_id,
        assignedUsername: r.assigned_user_id
          ? nameById.get(r.assigned_user_id) ?? null
          : null,
      }));
    return {
      folders,
      files: fileRows
        .filter((f) => ids.has(f.folder_id))
        .map((f) => ({
          id: f.id,
          folderId: f.folder_id,
          name: f.name,
          reviewed: Boolean(f.reviewed),
          reviewedBy: f.reviewed_by || null,
          flagged: Boolean(f.flagged),
          assignedUserId: f.assigned_user_id,
          assignedUsername: f.assigned_user_id
            ? nameById.get(f.assigned_user_id) ?? null
            : null,
        })),
    };
  });

export const listRoomFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ projectId: projectIdSchema, workspace: workspaceSchema }))
  .handler(async ({ context, data }): Promise<RoomFileOption[]> => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureProjectRoom(data.projectId);
    const rootId = roomRoot(data.projectId, data.workspace as WorkspaceId);
    const ids = await folderIdsInTree(rootId, data.projectId);
    const folders = await allFolderRecords(data.projectId);
    const byId = new Map(folders.map((r) => [r.id, r]));
    const q = await sql();
    const files = await q<{ id: string; name: string; folder_id: string }>`
      select f.id, f.name, f.folder_id
      from data_room_files f
      join data_room_folders d on d.id = f.folder_id
      where d.project_id = ${data.projectId}
      order by f.name
    `;
    return files
      .filter((f) => ids.has(f.folder_id))
      .map((f) => ({
        id: f.id,
        name: f.name,
        folderId: f.folder_id,
        path: `${pathOf(f.folder_id, byId)} / ${f.name}`,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  });

export const moveFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      folderId: z.string(),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureSeeded();
    const dest = await folderRow(data.folderId);
    if (!dest) throw new Error("Folder not found");
    const access = await assertFolderAccess(context.userId, dest.id);
    if (!can(access.role, "moveFiles")) {
      throw new Error("You do not have permission to do that");
    }
    const q = await sql();
    const files = await q<{ id: string; folder_id: string; name: string }>`
      select id, folder_id, name from data_room_files where id = ${data.id}
    `;
    const file = files[0];
    if (!file) throw new Error("File not found");
    const source = await folderRow(file.folder_id);
    if (!source) throw new Error("File not found");
    await assertFolderAccess(context.userId, source.id);
    if (source.projectId !== dest.projectId) {
      throw new Error("Stay inside this data room");
    }
    if (file.folder_id === dest.id) return { ok: true as const };

    const rows = await allFolderRecords(source.projectId);
    const parents = parentMap(rows);
    if (rootOf(file.folder_id, parents) !== rootOf(dest.id, parents)) {
      throw new Error("Stay inside this data room");
    }
    const clash = await q<{ id: string }>`
      select id from data_room_files
      where folder_id = ${dest.id} and lower(name) = ${file.name.toLowerCase()}
      limit 1
    `;
    if (clash[0]) {
      throw new Error(`A file named “${file.name}” is already in that folder`);
    }
    await q`
      update data_room_files set folder_id = ${dest.id} where id = ${file.id}
    `;
    return { ok: true as const };
  });

export const moveFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      parentId: z.string(),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureSeeded();
    const folder = await folderRow(data.id);
    if (!folder) throw new Error("Folder not found");
    const access = await assertFolderAccess(context.userId, folder.id);
    if (!can(access.role, "moveFiles")) {
      throw new Error("You do not have permission to do that");
    }
    if (!folder.parentId) throw new Error("The data-room root cannot be moved");
    const dest = await folderRow(data.parentId);
    if (!dest) throw new Error("Folder not found");
    await assertFolderAccess(context.userId, dest.id);
    if (folder.projectId !== dest.projectId) {
      throw new Error("Stay inside this data room");
    }
    if (folder.parentId === dest.id) return { ok: true as const };

    const rows = await allFolderRecords(folder.projectId);
    const parents = parentMap(rows);
    if (rootOf(folder.id, parents) !== rootOf(dest.id, parents)) {
      throw new Error("Stay inside this data room");
    }
    if (isSelfOrDescendant(folder.id, dest.id, parents)) {
      throw new Error("Cannot move a folder into itself");
    }
    const q = await sql();
    const clash = await q<{ id: string }>`
      select id from data_room_folders
      where parent_id = ${dest.id}
        and lower(name) = ${folder.name.toLowerCase()}
        and id <> ${folder.id}
      limit 1
    `;
    if (clash[0]) {
      throw new Error(`A folder named “${folder.name}” is already in that location`);
    }
    await q`
      update data_room_folders set parent_id = ${dest.id} where id = ${folder.id}
    `;
    return { ok: true as const };
  });
