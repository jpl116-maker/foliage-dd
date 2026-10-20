import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEFAULT_PROJECT_ID, listScope } from "@/lib/projects";
import { assertProjectAccess, assertProjectCan } from "@/lib/projects-db";
import { ASSET_SEED } from "@/lib/seed-asset";
import { ENTITY_SEED } from "@/lib/seed";
import type { Issue, IssueSeverity, IssueStatus } from "@/lib/types";
import type { WorkspaceId } from "@/lib/workspace";

const workspaceSchema = z.enum(["entity", "asset"]);
const projectIdSchema = z.string().min(1).max(80);

const issueSchema = z.object({
  id: z.string().min(1).max(80),
  documentId: z.string().max(80).nullable(),
  categoryId: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  summary: z.string().max(8000),
  severity: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "monitoring", "resolved"]),
  codeSection: z.string().max(160).optional(),
  raisedOn: z.string().max(40),
  raisedBy: z.string().max(120),
  roomFileId: z.string().max(80).nullable().optional(),
  roomFolderId: z.string().max(80).nullable().optional(),
  roomFileName: z.string().max(180).nullable().optional(),
});

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const q = await sql();
  await q.query(`
    create table if not exists dd_issue_meta (
      workspace text primary key,
      updated_at timestamptz not null default now()
    )
  `);
  await q.query(`
    create table if not exists dd_issues (
      workspace text not null,
      id text not null,
      document_id text,
      category_id text not null,
      title text not null,
      summary text not null default '',
      severity text not null,
      status text not null,
      code_section text,
      raised_on text not null,
      raised_by text not null default '',
      room_file_id text,
      room_folder_id text,
      room_file_name text,
      sort_order integer not null default 0,
      primary key (workspace, id)
    )
  `);
  schemaReady = true;
}

function mapIssue(row: {
  id: string;
  document_id: string | null;
  category_id: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  code_section: string | null;
  raised_on: string;
  raised_by: string;
  room_file_id: string | null;
  room_folder_id: string | null;
  room_file_name: string | null;
}): Issue {
  const severity: IssueSeverity =
    row.severity === "critical" || row.severity === "high" || row.severity === "low"
      ? row.severity
      : "medium";
  const status: IssueStatus =
    row.status === "monitoring" || row.status === "resolved" ? row.status : "open";
  return {
    id: row.id,
    documentId: row.document_id,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary ?? "",
    severity,
    status,
    codeSection: row.code_section || undefined,
    raisedOn: row.raised_on,
    raisedBy: row.raised_by || "Team",
    roomFileId: row.room_file_id,
    roomFolderId: row.room_folder_id,
    roomFileName: row.room_file_name,
  };
}

function seedIssues(workspace: WorkspaceId): Issue[] {
  const seed = workspace === "asset" ? ASSET_SEED : ENTITY_SEED;
  return structuredClone(seed.issues);
}

export async function writeIssues(
  projectId: string,
  workspace: WorkspaceId,
  issues: Issue[],
) {
  await ensureSchema();
  const scope = listScope(projectId, workspace);
  const q = await sql();
  await q`delete from dd_issues where workspace = ${scope}`;
  for (const [i, issue] of issues.entries()) {
    await q`
      insert into dd_issues (
        workspace, id, document_id, category_id, title, summary, severity, status,
        code_section, raised_on, raised_by, room_file_id, room_folder_id, room_file_name,
        sort_order
      )
      values (
        ${scope}, ${issue.id}, ${issue.documentId ?? null}, ${issue.categoryId},
        ${issue.title}, ${issue.summary}, ${issue.severity}, ${issue.status},
        ${issue.codeSection ?? null}, ${issue.raisedOn}, ${issue.raisedBy},
        ${issue.roomFileId ?? null}, ${issue.roomFolderId ?? null},
        ${issue.roomFileName ?? null}, ${i}
      )
    `;
  }
  await q`
    insert into dd_issue_meta (workspace, updated_at)
    values (${scope}, now())
    on conflict (workspace) do update set updated_at = excluded.updated_at
  `;
}

async function readIssues(projectId: string, workspace: WorkspaceId): Promise<Issue[]> {
  await ensureSchema();
  const scope = listScope(projectId, workspace);
  const q = await sql();
  const rows = await q<{
    id: string;
    document_id: string | null;
    category_id: string;
    title: string;
    summary: string;
    severity: string;
    status: string;
    code_section: string | null;
    raised_on: string;
    raised_by: string;
    room_file_id: string | null;
    room_folder_id: string | null;
    room_file_name: string | null;
  }>`
    select id, document_id, category_id, title, summary, severity, status,
           code_section, raised_on, raised_by, room_file_id, room_folder_id, room_file_name
    from dd_issues
    where workspace = ${scope}
    order by sort_order, raised_on desc
  `;
  return rows.map(mapIssue);
}

export const loadIssues = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: projectIdSchema,
      workspace: workspaceSchema,
    }),
  )
  .handler(async ({ context, data }): Promise<Issue[]> => {
    await assertProjectAccess(context.userId, data.projectId);
    await ensureSchema();
    const workspace = data.workspace as WorkspaceId;
    const scope = listScope(data.projectId, workspace);
    const q = await sql();
    const meta = await q<{ workspace: string }>`
      select workspace from dd_issue_meta where workspace = ${scope}
    `;
    if (meta.length === 0) {
      const issues =
        data.projectId === DEFAULT_PROJECT_ID ? seedIssues(workspace) : [];
      await writeIssues(data.projectId, workspace, issues);
      return issues;
    }
    return readIssues(data.projectId, workspace);
  });

export const saveIssues = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: projectIdSchema,
      workspace: workspaceSchema,
      issues: z.array(issueSchema).max(200),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectCan(context.userId, data.projectId, "raiseIssues");
    await writeIssues(data.projectId, data.workspace as WorkspaceId, data.issues);
    return { ok: true as const };
  });
