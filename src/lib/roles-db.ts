import { createServerFn } from "@tanstack/react-start";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { emailToUsername, passwordIssue, usernameIssue, usernameToEmail } from "@/lib/folia-username";
import {
  can,
  isFoliaRole,
  type FoliaRole,
  type RoleAction,
} from "@/lib/roles";
import { uid } from "@/lib/utils";

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

let schemaReady = false;

async function ensureSchema() {
  const q = await sql();
  if (!schemaReady) {
    await q.query(`
      create table if not exists folia_roles (
        user_id text primary key,
        role text not null check (role in ('admin', 'reviewer', 'client')),
        updated_at timestamptz not null default now()
      )
    `);
    schemaReady = true;
  }
}

export async function createFoliaAccount(input: {
  username: string;
  password: string;
  role: FoliaRole;
}): Promise<{ userId: string; username: string }> {
  const nameIssue = usernameIssue(input.username);
  if (nameIssue) throw new Error(nameIssue);
  const passIssue = passwordIssue(input.password);
  if (passIssue) throw new Error(passIssue);
  await ensureSchema();
  const q = await sql();
  const username = input.username.trim();
  const email = usernameToEmail(username);
  const existing = await q<{ id: string }>`
    select id from "user" where lower(email) = ${email}
  `;
  if (existing[0]) throw new Error("That username is taken. Choose another.");
  const userId = uid("usr");
  const accountId = uid("acc");
  const passwordHash = await hashPassword(input.password);
  await q`
    insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${username}, ${email}, true, now(), now())
  `;
  await q`
    insert into account (
      "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
    )
    values (
      ${accountId}, ${userId}, ${"credential"}, ${userId}, ${passwordHash}, now(), now()
    )
  `;
  await q`
    insert into folia_roles (user_id, role, updated_at)
    values (${userId}, ${input.role}, now())
    on conflict (user_id) do update set role = excluded.role, updated_at = excluded.updated_at
  `;
  return { userId, username };
}

export async function siteRoleFor(userId: string): Promise<FoliaRole> {
  return roleFor(userId);
}

async function roleFor(userId: string): Promise<FoliaRole> {
  await ensureSchema();
  const q = await sql();
  const existing = await q<{ role: string }>`
    select role from folia_roles where user_id = ${userId}
  `;
  if (existing[0] && isFoliaRole(existing[0].role)) return existing[0].role;

  const admins = await q<{ user_id: string }>`
    select user_id from folia_roles where role = 'admin' limit 1
  `;
  const role: FoliaRole = admins[0] ? "client" : "admin";
  await q`
    insert into folia_roles (user_id, role)
    values (${userId}, ${role})
    on conflict (user_id) do nothing
  `;
  const again = await q<{ role: string }>`
    select role from folia_roles where user_id = ${userId}
  `;
  return again[0] && isFoliaRole(again[0].role) ? again[0].role : role;
}

export async function assertUserCan(userId: string, action: RoleAction): Promise<FoliaRole> {
  const role = await roleFor(userId);
  if (!can(role, action)) {
    throw new Error("You do not have permission to do that");
  }
  return role;
}

export async function assertCan(action: RoleAction): Promise<FoliaRole> {
  const { requireUserId } = await import("@/lib/auth/verify.server");
  const userId = await requireUserId();
  return assertUserCan(userId, action);
}

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<FoliaRole> => {
    return roleFor(context.userId);
  });

export const claimSignupRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      role: z.enum(["client", "reviewer"]),
      keyword: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<{ role: FoliaRole }> => {
    const current = await roleFor(context.userId);
    if (current === "admin") return { role: current };
    if (data.role === "client") return { role: current };
    const { reviewerSignupKeyword } = await import("@/lib/reviewer-keyword.server");
    if (data.keyword?.trim() !== reviewerSignupKeyword()) {
      throw new Error("Keyword is incorrect");
    }
    const q = await sql();
    await q`
      insert into folia_roles (user_id, role, updated_at)
      values (${context.userId}, ${"reviewer"}, now())
      on conflict (user_id) do update set role = ${"reviewer"}, updated_at = excluded.updated_at
    `;
    return { role: "reviewer" };
  });

export type FoliaUserRow = {
  id: string;
  name: string;
  username: string;
  role: FoliaRole;
};

export const listFoliaUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<FoliaUserRow[]> => {
    const role = await roleFor(context.userId);
    if (!can(role, "manageUsers")) {
      throw new Error("You do not have permission to do that");
    }
    await ensureSchema();
    const q = await sql();
    const rows = await q<{
      id: string;
      name: string;
      email: string;
      role: string | null;
    }>`
      select u.id, u.name, u.email, r.role
      from "user" u
      left join folia_roles r on r.user_id = u.id
      order by u.name
    `;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: emailToUsername(row.email) || row.name,
      role: row.role && isFoliaRole(row.role) ? row.role : "client",
    }));
  });

export const setFoliaRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string().min(1).max(80),
      role: z.enum(["admin", "reviewer", "client"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const mine = await roleFor(context.userId);
    if (!can(mine, "manageUsers")) {
      throw new Error("You do not have permission to do that");
    }
    await ensureSchema();
    const q = await sql();
    if (data.role !== "admin") {
      const admins = await q<{ user_id: string }>`
        select user_id from folia_roles where role = 'admin'
      `;
      const remaining = admins.filter((row) => row.user_id !== data.userId);
      const target = admins.some((row) => row.user_id === data.userId);
      if (target && remaining.length === 0) {
        throw new Error("Keep at least one admin");
      }
    }
    await q`
      insert into folia_roles (user_id, role, updated_at)
      values (${data.userId}, ${data.role}, now())
      on conflict (user_id) do update set role = excluded.role, updated_at = excluded.updated_at
    `;
    return { ok: true as const };
  });

export const removeSiteUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    const mine = await roleFor(context.userId);
    if (!can(mine, "manageUsers")) {
      throw new Error("You do not have permission to do that");
    }
    if (data.userId === context.userId) {
      throw new Error("You cannot remove yourself");
    }
    await ensureSchema();
    const q = await sql();
    const target = await q<{ role: string | null }>`
      select role from folia_roles where user_id = ${data.userId}
    `;
    if (target[0]?.role === "admin") {
      const admins = await q<{ user_id: string }>`
        select user_id from folia_roles where role = 'admin'
      `;
      if (admins.length <= 1) {
        throw new Error("Keep at least one admin");
      }
    }
    const existing = await q<{ id: string }>`
      select id from "user" where id = ${data.userId}
    `;
    if (!existing[0]) throw new Error("User not found");
    await q`delete from project_members where user_id = ${data.userId}`;
    await q`delete from folia_roles where user_id = ${data.userId}`;
    await q`delete from "user" where id = ${data.userId}`;
    return { ok: true as const };
  });
