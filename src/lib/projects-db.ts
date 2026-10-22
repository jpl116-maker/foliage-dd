import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { emailToUsername } from "@/lib/folia-username";
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_SLUG,
  isReservedSlug,
  slugify,
  type Project,
} from "@/lib/projects";
import { can, isFoliaRole, ROLE_LABEL, type FoliaRole, type RoleAction } from "@/lib/roles";
import { createFoliaAccount, siteRoleFor } from "@/lib/roles-db";
import { uid } from "@/lib/utils";
import { roomIdPrefix, roomRoot, type WorkspaceId } from "@/lib/workspace";

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function recordChange(projectId: string, userId: string, summary: string) {
  const { recordAudit } = await import("@/lib/audit");
  await recordAudit({ projectId, userId, kind: "change", summary });
}

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const q = await sql();
  await q.query(`
    create table if not exists projects (
      id text primary key,
      slug text not null unique,
      name text not null,
      client_name text not null default '',
      portfolio text not null default '',
      due_on text not null default '',
      created_at timestamptz not null default now()
    )
  `);
  await q.query(`
    alter table projects
    add column if not exists workspace text not null default 'entity'
  `);
  await q.query(`
    create table if not exists project_members (
      project_id text not null,
      user_id text not null,
      role text not null,
      created_at timestamptz not null default now(),
      primary key (project_id, user_id)
    )
  `);
  await q.query(`
    alter table data_room_folders
    add column if not exists project_id text not null default '${DEFAULT_PROJECT_ID}'
  `);
  schemaReady = true;
  await bootstrapDefaultProject();
}

async function bootstrapDefaultProject() {
  const q = await sql();
  const existing = await q<{ id: string }>`
    select id from projects where id = ${DEFAULT_PROJECT_ID}
  `;
  const created = !existing[0];
  if (created) {
    await q`
      insert into projects (id, slug, name, client_name, portfolio, due_on)
      values (
        ${DEFAULT_PROJECT_ID},
        ${DEFAULT_PROJECT_SLUG},
        ${"Project Oakridge"},
        ${"Northbridge Capital Partners"},
        ${"Oakridge Properties, Inc."},
        ${"2026-09-18"}
      )
      on conflict (id) do nothing
    `;
  }
  if (!created) return;
  const users = await q<{ user_id: string; role: string }>`
    select user_id, role from folia_roles
  `;
  for (const row of users) {
    const role = isFoliaRole(row.role) ? row.role : "client";
    await q`
      insert into project_members (project_id, user_id, role)
      values (${DEFAULT_PROJECT_ID}, ${row.user_id}, ${role})
      on conflict (project_id, user_id) do nothing
    `;
  }
}

function mapProject(row: {
  id: string;
  slug: string;
  name: string;
  client_name: string;
  portfolio: string;
  due_on: string;
  workspace?: string | null;
}): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    clientName: row.client_name,
    portfolio: row.portfolio,
    dueOn: row.due_on,
    workspace: row.workspace === "asset" ? "asset" : "entity",
  };
}

export async function memberRole(
  userId: string,
  projectId: string,
): Promise<FoliaRole | null> {
  await ensureSchema();
  const site = await siteRoleFor(userId);
  const q = await sql();
  const rows = await q<{ role: string }>`
    select role from project_members
    where project_id = ${projectId} and user_id = ${userId}
  `;
  if (rows[0] && isFoliaRole(rows[0].role)) return rows[0].role;
  if (site === "admin") return "admin";
  return null;
}

export async function assertProjectAccess(
  userId: string,
  projectId: string,
): Promise<{ role: FoliaRole; project: Project }> {
  await ensureSchema();
  const q = await sql();
  const rows = await q<{
    id: string;
    slug: string;
    name: string;
    client_name: string;
    portfolio: string;
    due_on: string;
    workspace: string;
  }>`
    select id, slug, name, client_name, portfolio, due_on, workspace
    from projects where id = ${projectId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Project not found");
  const role = await memberRole(userId, projectId);
  if (!role) throw new Error("You do not have access to this project");
  return { role, project: mapProject(row) };
}

export async function assertProjectCan(
  userId: string,
  projectId: string,
  action: RoleAction,
): Promise<FoliaRole> {
  const { role } = await assertProjectAccess(userId, projectId);
  if (!can(role, action)) {
    throw new Error("You do not have permission to do that");
  }
  return role;
}

export async function projectIdForFolder(folderId: string): Promise<string | null> {
  await ensureSchema();
  const q = await sql();
  const rows = await q<{ project_id: string | null }>`
    select project_id from data_room_folders where id = ${folderId}
  `;
  return rows[0]?.project_id ?? null;
}

export async function assertFolderAccess(userId: string, folderId: string) {
  const projectId = await projectIdForFolder(folderId);
  if (!projectId) throw new Error("Folder not found");
  return assertProjectAccess(userId, projectId);
}

export const listMyProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Project[]> => {
    await ensureSchema();
    const site = await siteRoleFor(context.userId);
    const q = await sql();
    const rows =
      site === "admin"
        ? await q<{
            id: string;
            slug: string;
            name: string;
            client_name: string;
            portfolio: string;
            due_on: string;
            workspace: string;
          }>`
            select id, slug, name, client_name, portfolio, due_on, workspace
            from projects order by name
          `
        : await q<{
            id: string;
            slug: string;
            name: string;
            client_name: string;
            portfolio: string;
            due_on: string;
            workspace: string;
          }>`
            select p.id, p.slug, p.name, p.client_name, p.portfolio, p.due_on, p.workspace
            from projects p
            join project_members m on m.project_id = p.id
            where m.user_id = ${context.userId}
            order by p.name
          `;
    return rows.map(mapProject);
  });

export type SiteUserRow = {
  userId: string;
  name: string;
  username: string;
  role: FoliaRole;
  projects: { id: string; slug: string; name: string; role: FoliaRole }[];
};

export const listSiteUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SiteUserRow[]> => {
    await ensureSchema();
    const site = await siteRoleFor(context.userId);
    if (site !== "admin") throw new Error("You do not have permission to do that");
    const q = await sql();
    const users = await q<{
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
    const memberships = await q<{
      user_id: string;
      role: string;
      id: string;
      slug: string;
      name: string;
    }>`
      select m.user_id, m.role, p.id, p.slug, p.name
      from project_members m
      join projects p on p.id = m.project_id
      order by p.name
    `;
    const byUser = new Map<string, SiteUserRow["projects"]>();
    for (const row of memberships) {
      const list = byUser.get(row.user_id) ?? [];
      list.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        role: isFoliaRole(row.role) ? row.role : "client",
      });
      byUser.set(row.user_id, list);
    }
    return users.map((row) => ({
      userId: row.id,
      name: row.name,
      username: emailToUsername(row.email) || row.name,
      role: row.role && isFoliaRole(row.role) ? row.role : "client",
      projects: byUser.get(row.id) ?? [],
    }));
  });

export const getProjectBySlug = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ slug: z.string().min(1).max(40) }))
  .handler(async ({ context, data }): Promise<Project & { role: FoliaRole }> => {
    await ensureSchema();
    const q = await sql();
    const rows = await q<{
      id: string;
      slug: string;
      name: string;
      client_name: string;
      portfolio: string;
      due_on: string;
      workspace: string;
    }>`
      select id, slug, name, client_name, portfolio, due_on, workspace
      from projects where slug = ${data.slug}
    `;
    const row = rows[0];
    if (!row) throw new Error("Project not found");
    const { role, project } = await assertProjectAccess(context.userId, row.id);
    const { ensureProjectRoom } = await import("@/lib/data-room");
    await ensureProjectRoom(project.id, { name: project.name });
    return { ...project, role };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().trim().min(2).max(120),
      slug: z.string().trim().max(40).optional(),
      clientName: z.string().trim().max(160).optional(),
      portfolio: z.string().trim().max(160).optional(),
      dueOn: z.string().trim().max(20).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<Project> => {
    await ensureSchema();
    const site = await siteRoleFor(context.userId);
    if (site !== "admin") throw new Error("Only Admin can create a project");
    const slug = slugify(data.slug || data.name);
    if (!slug || slug.length < 2) throw new Error("Choose a longer project link");
    if (isReservedSlug(slug)) throw new Error("That link is reserved");
    const q = await sql();
    const clash = await q<{ id: string }>`select id from projects where slug = ${slug}`;
    if (clash[0]) throw new Error("That project link is already in use");
    const id = uid("prj");
    await q`
      insert into projects (id, slug, name, client_name, portfolio, due_on)
      values (
        ${id},
        ${slug},
        ${data.name.trim()},
        ${data.clientName?.trim() || ""},
        ${data.portfolio?.trim() || ""},
        ${data.dueOn?.trim() || ""}
      )
    `;
    await q`
      insert into project_members (project_id, user_id, role)
      values (${id}, ${context.userId}, ${"admin"})
    `;
    const { ensureProjectRoom, ensureListFolders } = await import("@/lib/data-room");
    await ensureProjectRoom(id, { sampleFiles: false, name: data.name.trim() });
    const { writeRequestList, templateRequestList } = await import("@/lib/request-list-db");
    for (const workspace of ["entity", "asset"] as WorkspaceId[]) {
      const list = await templateRequestList(workspace);
      await writeRequestList(id, workspace, list);
      await ensureListFolders(
        id,
        workspace,
        list.categories.map((c) => ({ id: c.id, name: c.name })),
        list.requests.map((r) => ({
          documentId: r.documentId ?? null,
          categoryId: r.categoryId,
          name: r.name,
        })),
      );
    }
    await recordChange(id, context.userId, "Created this project");
    return {
      id,
      slug,
      name: data.name.trim(),
      clientName: data.clientName?.trim() || "",
      portfolio: data.portfolio?.trim() || "",
      dueOn: data.dueOn?.trim() || "",
      workspace: "entity",
    };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      name: z.string().trim().min(2).max(120),
      clientName: z.string().trim().max(160),
      portfolio: z.string().trim().max(160),
      dueOn: z.string().trim().max(20),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectCan(context.userId, data.projectId, "editMatter");
    const q = await sql();
    const prior = await q<{
      name: string;
      client_name: string;
      portfolio: string;
      due_on: string;
    }>`
      select name, client_name, portfolio, due_on from projects where id = ${data.projectId}
    `;
    await q`
      update projects
      set name = ${data.name},
          client_name = ${data.clientName},
          portfolio = ${data.portfolio},
          due_on = ${data.dueOn}
      where id = ${data.projectId}
    `;
    const before = prior[0];
    if (before) {
      const bits: string[] = [];
      if (before.name !== data.name) bits.push("name");
      if (before.client_name !== data.clientName) bits.push("client");
      if (before.portfolio !== data.portfolio) bits.push("target");
      if (before.due_on !== data.dueOn) bits.push("due date");
      if (bits.length) {
        await recordChange(
          data.projectId,
          context.userId,
          `Updated the project ${bits.join(", ")}`,
        );
      }
    }
    const entityRoot = roomRoot(data.projectId, "entity");
    const assetRoot = roomRoot(data.projectId, "asset");
    await q`
      update data_room_folders set name = ${data.name}
      where id = ${entityRoot} or id = ${assetRoot}
    `;
    return { ok: true as const };
  });

export const setProjectWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      workspace: z.enum(["entity", "asset"]),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectCan(context.userId, data.projectId, "switchWorkspace");
    const q = await sql();
    const prior = await q<{ workspace: string }>`
      select workspace from projects where id = ${data.projectId}
    `;
    await q`
      update projects
      set workspace = ${data.workspace}
      where id = ${data.projectId}
    `;
    const current = prior[0]?.workspace === "asset" ? "asset" : "entity";
    if (current !== data.workspace) {
      await recordChange(
        data.projectId,
        context.userId,
        `Switched the default diligence to ${data.workspace === "asset" ? "Asset" : "Entity"}`,
      );
    }
    return { ok: true as const };
  });

export type ProjectMemberRow = {
  userId: string;
  name: string;
  username: string;
  role: FoliaRole;
};

export const listProjectMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ projectId: z.string().min(1).max(80) }))
  .handler(async ({ context, data }): Promise<ProjectMemberRow[]> => {
    await assertProjectCan(context.userId, data.projectId, "manageUsers");
    const q = await sql();
    const rows = await q<{
      user_id: string;
      name: string;
      email: string;
      role: string;
    }>`
      select m.user_id, u.name, u.email, m.role
      from project_members m
      join "user" u on u.id = m.user_id
      where m.project_id = ${data.projectId}
      order by u.name
    `;
    return rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      username: emailToUsername(row.email) || row.name,
      role: isFoliaRole(row.role) ? row.role : "client",
    }));
  });

export const addProjectMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      username: z.string().trim().min(1).max(80),
      role: z.enum(["admin", "reviewer", "client"]),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectCan(context.userId, data.projectId, "manageUsers");
    const q = await sql();
    const needle = data.username.trim().toLowerCase();
    const users = await q<{ id: string; name: string; email: string }>`
      select id, name, email from "user"
    `;
    const match = users.find((row) => {
      const uname = (emailToUsername(row.email) || row.name).toLowerCase();
      return uname === needle || row.name.toLowerCase() === needle;
    });
    if (!match) throw new Error("No user with that username");
    const existing = await q<{ role: string }>`
      select role from project_members
      where project_id = ${data.projectId} and user_id = ${match.id}
    `;
    await q`
      insert into project_members (project_id, user_id, role)
      values (${data.projectId}, ${match.id}, ${data.role})
      on conflict (project_id, user_id) do update set role = excluded.role
    `;
    const username = emailToUsername(match.email) || match.name;
    const label = ROLE_LABEL[data.role];
    if (!existing[0]) {
      await recordChange(data.projectId, context.userId, `Added ${username} as ${label}`);
    } else if (existing[0].role !== data.role) {
      await recordChange(data.projectId, context.userId, `Set ${username} to ${label}`);
    }
    return { ok: true as const };
  });

export const createProjectUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      username: z.string().trim().min(1).max(80),
      password: z.string().min(1).max(72),
      role: z.enum(["admin", "reviewer", "client"]),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectCan(context.userId, data.projectId, "manageUsers");
    const created = await createFoliaAccount({
      username: data.username,
      password: data.password,
      role: data.role,
    });
    const q = await sql();
    await q`
      insert into project_members (project_id, user_id, role)
      values (${data.projectId}, ${created.userId}, ${data.role})
      on conflict (project_id, user_id) do update set role = excluded.role
    `;
    await recordChange(
      data.projectId,
      context.userId,
      `Created account ${created.username} as ${ROLE_LABEL[data.role]}`,
    );
    return { username: created.username };
  });

export const setProjectMemberRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      userId: z.string().min(1).max(80),
      role: z.enum(["admin", "reviewer", "client"]),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectCan(context.userId, data.projectId, "manageUsers");
    const q = await sql();
    const prior = await q<{ role: string; name: string; email: string }>`
      select m.role, u.name, u.email
      from project_members m
      join "user" u on u.id = m.user_id
      where m.project_id = ${data.projectId} and m.user_id = ${data.userId}
    `;
    if (data.role !== "admin") {
      const admins = await q<{ user_id: string }>`
        select user_id from project_members
        where project_id = ${data.projectId} and role = 'admin'
      `;
      if (admins.length <= 1 && admins[0]?.user_id === data.userId) {
        throw new Error("Keep at least one Admin on the project");
      }
    }
    await q`
      update project_members
      set role = ${data.role}
      where project_id = ${data.projectId} and user_id = ${data.userId}
    `;
    const person = prior[0];
    if (person && person.role !== data.role) {
      const username = emailToUsername(person.email) || person.name || "a user";
      await recordChange(
        data.projectId,
        context.userId,
        `Set ${username} to ${ROLE_LABEL[data.role]}`,
      );
    }
    return { ok: true as const };
  });

export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      userId: z.string().min(1).max(80),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectCan(context.userId, data.projectId, "manageUsers");
    if (data.userId === context.userId) {
      throw new Error("You cannot remove yourself");
    }
    const q = await sql();
    const prior = await q<{ name: string; email: string }>`
      select u.name, u.email
      from project_members m
      join "user" u on u.id = m.user_id
      where m.project_id = ${data.projectId} and m.user_id = ${data.userId}
    `;
    await q`
      delete from project_members
      where project_id = ${data.projectId} and user_id = ${data.userId}
    `;
    if (prior[0]) {
      const username = emailToUsername(prior[0].email) || prior[0].name || "a user";
      await recordChange(data.projectId, context.userId, `Removed ${username} from the project`);
    }
    return { ok: true as const };
  });

export function roomPrefixFor(projectId: string, workspace: WorkspaceId) {
  return roomIdPrefix(projectId, workspace);
}

export function rootFor(projectId: string, workspace: WorkspaceId) {
  return roomRoot(projectId, workspace);
}
