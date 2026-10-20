import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/roles";
import { DEFAULT_PROJECT_ID, listScope } from "@/lib/projects";
import { assertProjectAccess } from "@/lib/projects-db";
import { ASSET_SEED } from "@/lib/seed-asset";
import { ENTITY_SEED } from "@/lib/seed";
import type { Category, RequestItem } from "@/lib/types";
import type { WorkspaceId } from "@/lib/workspace";

const workspaceSchema = z.enum(["entity", "asset"]);
const projectIdSchema = z.string().min(1).max(80);

/** Bump when the bundled seed list changes so a published DB is replaced. */
export const LIST_SEED_REV = 3;

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const q = await sql();
  await q.query(`
    create table if not exists dd_list_meta (
      workspace text primary key,
      updated_at timestamptz not null default now(),
      seed_rev integer not null default 0
    )
  `);
  await q.query(`
    alter table dd_list_meta add column if not exists seed_rev integer not null default 0
  `);
  await q.query(`
    create table if not exists dd_categories (
      workspace text not null,
      id text not null,
      name text not null,
      blurb text not null default '',
      sort_order integer not null default 0,
      primary key (workspace, id)
    )
  `);
  await q.query(`
    create table if not exists dd_requests (
      workspace text not null,
      id text not null,
      category_id text not null,
      document_id text,
      name text not null,
      detail text not null default '',
      status text not null default 'open',
      comments_json text not null default '[]',
      linked_files_json text not null default '[]',
      sort_order integer not null default 0,
      primary key (workspace, id)
    )
  `);
  schemaReady = true;
  await q.query(`
    update dd_list_meta
    set workspace = 'default::' || workspace
    where workspace in ('entity', 'asset')
  `);
  await q.query(`
    update dd_categories
    set workspace = 'default::' || workspace
    where workspace in ('entity', 'asset')
  `);
  await q.query(`
    update dd_requests
    set workspace = 'default::' || workspace
    where workspace in ('entity', 'asset')
  `);
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const categorySchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  blurb: z.string().max(400).optional(),
});

const requestSchema = z.object({
  id: z.string().min(1).max(80),
  categoryId: z.string().min(1).max(80),
  documentId: z.string().max(80).nullable(),
  name: z.string().trim().min(1).max(180),
  detail: z.string().max(8000),
  status: z.enum(["open", "partial", "closed"]),
  comments: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        body: z.string().max(4000),
        author: z.string().max(120),
        createdAt: z.string().max(40),
      }),
    )
    .max(100)
    .optional(),
  linkedFiles: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        folderId: z.string().min(1).max(80),
        name: z.string().min(1).max(180),
        kind: z.enum(["file", "folder"]).optional(),
      }),
    )
    .max(80)
    .optional(),
});

const listInput = z.object({
  projectId: projectIdSchema,
  workspace: workspaceSchema,
});

function mapStoredList(
  catRows: { id: string; name: string; blurb: string }[],
  reqRows: {
    id: string;
    category_id: string;
    document_id: string | null;
    name: string;
    detail: string;
    status: string;
    comments_json: string;
    linked_files_json: string;
  }[],
): { categories: Category[]; requests: RequestItem[] } {
  return {
    categories: catRows.map((row) => ({
      id: row.id,
      name: row.name,
      blurb: row.blurb ?? "",
    })),
    requests: reqRows.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      documentId: row.document_id,
      name: row.name,
      detail: row.detail ?? "",
      status: (row.status === "partial" || row.status === "closed" ? row.status : "open") as RequestItem["status"],
      comments: parseJson(row.comments_json, []),
      linkedFiles: parseJson(row.linked_files_json, []),
    })),
  };
}

export async function readStoredRequestList(
  projectId: string,
  workspace: WorkspaceId,
): Promise<{ categories: Category[]; requests: RequestItem[] } | null> {
  await ensureSchema();
  const scope = listScope(projectId, workspace);
  const q = await sql();
  const catRows = await q<{
    id: string;
    name: string;
    blurb: string;
  }>`
    select id, name, blurb
    from dd_categories
    where workspace = ${scope}
    order by sort_order, name
  `;
  const reqRows = await q<{
    id: string;
    category_id: string;
    document_id: string | null;
    name: string;
    detail: string;
    status: string;
    comments_json: string;
    linked_files_json: string;
  }>`
    select id, category_id, document_id, name, detail, status, comments_json, linked_files_json
    from dd_requests
    where workspace = ${scope}
    order by sort_order, name
  `;
  if (catRows.length === 0 && reqRows.length === 0) return null;
  return mapStoredList(catRows, reqRows);
}

function listFromSeed(workspace: WorkspaceId): { categories: Category[]; requests: RequestItem[] } {
  const seed = workspace === "asset" ? ASSET_SEED : ENTITY_SEED;
  return {
    categories: seed.categories.map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
    })),
    requests: (seed.requests ?? []).map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      documentId: r.documentId ?? null,
      name: r.name,
      detail: r.detail,
      status: r.status,
      comments: r.comments ?? [],
      linkedFiles: r.linkedFiles ?? [],
    })),
  };
}

/** Oakridge entity list / Harbor asset list, as a fresh checklist for a new matter. */
export async function templateRequestList(workspace: WorkspaceId): Promise<{
  categories: Category[];
  requests: RequestItem[];
}> {
  const stored = await readStoredRequestList(DEFAULT_PROJECT_ID, workspace);
  const source = stored ?? listFromSeed(workspace);
  return {
    categories: source.categories.map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
    })),
    requests: source.requests.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      documentId: r.documentId ?? null,
      name: r.name,
      detail: r.detail,
      status: "open" as const,
      comments: [],
      linkedFiles: [],
    })),
  };
}

export async function writeRequestList(
  projectId: string,
  workspace: WorkspaceId,
  list: { categories: Category[]; requests: RequestItem[] },
) {
  await ensureSchema();
  const scope = listScope(projectId, workspace);
  const q = await sql();
  await q`delete from dd_requests where workspace = ${scope}`;
  await q`delete from dd_categories where workspace = ${scope}`;
  for (const [i, cat] of list.categories.entries()) {
    await q`
      insert into dd_categories (workspace, id, name, blurb, sort_order)
      values (${scope}, ${cat.id}, ${cat.name}, ${cat.blurb ?? ""}, ${i})
    `;
  }
  for (const [i, item] of list.requests.entries()) {
    const comments = JSON.stringify(item.comments ?? []);
    const linked = JSON.stringify(item.linkedFiles ?? []);
    await q`
      insert into dd_requests (
        workspace, id, category_id, document_id, name, detail, status,
        comments_json, linked_files_json, sort_order
      )
      values (
        ${scope}, ${item.id}, ${item.categoryId}, ${item.documentId ?? null},
        ${item.name}, ${item.detail}, ${item.status}, ${comments}, ${linked}, ${i}
      )
    `;
  }
  await q`
    insert into dd_list_meta (workspace, updated_at, seed_rev)
    values (${scope}, now(), ${LIST_SEED_REV})
    on conflict (workspace) do update set updated_at = excluded.updated_at, seed_rev = excluded.seed_rev
  `;
}

export const loadRequestList = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(async ({ context, data }) => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureSchema();
    const workspace = listScope(data.projectId, data.workspace as WorkspaceId);
    const q = await sql();
    const meta = await q<{ workspace: string; seed_rev: number | string | null }>`
      select workspace, seed_rev from dd_list_meta where workspace = ${workspace}
    `;
    const storedRev = Number(meta[0]?.seed_rev ?? 0);
    if (meta.length === 0 && data.projectId !== DEFAULT_PROJECT_ID) {
      const list = await templateRequestList(data.workspace as WorkspaceId);
      await writeRequestList(data.projectId, data.workspace as WorkspaceId, list);
      const { ensureListFolders } = await import("@/lib/data-room");
      await ensureListFolders(
        data.projectId,
        data.workspace as WorkspaceId,
        list.categories.map((c) => ({ id: c.id, name: c.name })),
        list.requests.map((r) => ({
          documentId: r.documentId ?? null,
          categoryId: r.categoryId,
          name: r.name,
        })),
      );
      return { empty: false as const, ...list };
    }
    if (meta.length === 0 || storedRev < LIST_SEED_REV) {
      return { empty: true as const, categories: [] as Category[], requests: [] as RequestItem[] };
    }
    const catRows = await q<{
      id: string;
      name: string;
      blurb: string;
    }>`
      select id, name, blurb
      from dd_categories
      where workspace = ${workspace}
      order by sort_order, name
    `;
    const reqRows = await q<{
      id: string;
      category_id: string;
      document_id: string | null;
      name: string;
      detail: string;
      status: string;
      comments_json: string;
      linked_files_json: string;
    }>`
      select id, category_id, document_id, name, detail, status, comments_json, linked_files_json
      from dd_requests
      where workspace = ${workspace}
      order by sort_order, name
    `;
    const mapped = mapStoredList(catRows, reqRows);
    return { empty: false as const, ...mapped };
  });

export const saveRequestList = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: projectIdSchema,
      workspace: workspaceSchema,
      categories: z.array(categorySchema).max(80),
      requests: z.array(requestSchema).max(200),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectAccess(context.userId, data.projectId);
    await writeRequestList(data.projectId, data.workspace as WorkspaceId, {
      categories: data.categories.map((c) => ({
        id: c.id,
        name: c.name,
        blurb: c.blurb ?? "",
      })),
      requests: data.requests,
    });
    return { ok: true as const };
  });

export const cloneRequestList = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: projectIdSchema,
      sourceProjectId: projectIdSchema,
      workspace: workspaceSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const access = await assertProjectAccess(context.userId, data.projectId);
    if (!can(access.role, "editRequestList")) {
      throw new Error("You do not have permission to do that");
    }
    await assertProjectAccess(context.userId, data.sourceProjectId);
    if (data.projectId === data.sourceProjectId) {
      throw new Error("Pick a different project to clone from");
    }
    const workspace = data.workspace as WorkspaceId;
    const source = await readStoredRequestList(data.sourceProjectId, workspace);
    if (!source || (source.categories.length === 0 && source.requests.length === 0)) {
      throw new Error("That project has no request list for this diligence type");
    }
    const list = {
      categories: source.categories.map((c) => ({
        id: c.id,
        name: c.name,
        blurb: c.blurb ?? "",
      })),
      requests: source.requests.map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        documentId: r.documentId ?? null,
        name: r.name,
        detail: r.detail,
        status: "open" as const,
        comments: [],
        linkedFiles: [],
      })),
    };
    await writeRequestList(data.projectId, workspace, list);
    const { ensureListFolders } = await import("@/lib/data-room");
    await ensureListFolders(
      data.projectId,
      workspace,
      list.categories.map((c) => ({ id: c.id, name: c.name })),
      list.requests.map((r) => ({
        documentId: r.documentId ?? null,
        categoryId: r.categoryId,
        name: r.name,
      })),
    );
    return { ok: true as const, ...list };
  });
