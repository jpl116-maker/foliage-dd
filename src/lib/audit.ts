import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { emailToUsername } from "@/lib/folia-username";
import { assertProjectCan } from "@/lib/projects-db";

export type AuditKind = "access" | "change";

export type AuditRow = {
  id: string;
  at: string;
  username: string;
  kind: AuditKind;
  summary: string;
};

let ready = false;

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ensureAudit() {
  if (ready) return;
  const q = await sql();
  await q.query(`
    create table if not exists audit_events (
      id bigserial primary key,
      project_id text not null,
      user_id text not null,
      username text not null,
      kind text not null,
      summary text not null,
      created_at timestamptz not null default now()
    )
  `);
  await q.query(`
    create index if not exists audit_events_project_idx
      on audit_events (project_id, created_at desc)
  `);
  ready = true;
}

export async function recordAudit(input: {
  projectId: string;
  userId: string;
  kind: AuditKind;
  summary: string;
}) {
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!input.projectId || !summary) return;
  try {
    await ensureAudit();
    const q = await sql();
    const users = await q<{ name: string | null; email: string | null }>`
      select name, email from "user" where id = ${input.userId} limit 1
    `;
    const person = users[0];
    const username = emailToUsername(person?.email) || person?.name?.trim() || "Unknown";
    await q`
      insert into audit_events (project_id, user_id, username, kind, summary)
      values (${input.projectId}, ${input.userId}, ${username}, ${input.kind}, ${summary})
    `;
  } catch {
    /* A failed log must not block the action. */
  }
}

function stamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

export const listProjectAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      kind: z.enum(["all", "access", "change"]).default("all"),
    }),
  )
  .handler(async ({ context, data }): Promise<AuditRow[]> => {
    await assertProjectCan(context.userId, data.projectId, "manageUsers");
    await ensureAudit();
    const q = await sql();
    const rows = await q<{
      id: number | string;
      created_at: unknown;
      username: string;
      kind: string;
      summary: string;
    }>`
      select id, created_at, username, kind, summary
      from audit_events
      where project_id = ${data.projectId}
        and (${data.kind} = 'all' or kind = ${data.kind})
      order by created_at desc
      limit 200
    `;
    return rows.map((row) => ({
      id: String(row.id),
      at: stamp(row.created_at),
      username: row.username,
      kind: row.kind === "access" ? "access" : "change",
      summary: row.summary,
    }));
  });
