import { LINDEN_PACK } from "@/lib/linden-pack";
import { ensureProjectRoom } from "@/lib/data-room";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { roomIdPrefix, roomRoot, type WorkspaceId } from "@/lib/workspace";

const FOLDERS: Record<string, string> = {
  income: "Test DD — Income statements",
  gl: "Test DD — General ledgers",
  contracts: "Test DD — Service contracts",
};

const ASSET_REQUEST_FOLDERS: Record<string, string> = {
  income: "d-apa-1",
  gl: "d-apa-2",
  contracts: "d-ttl-3",
};

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function slugName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function bytesOf(b64: string) {
  return Buffer.from(b64, "base64").byteLength;
}

async function upsertFolder(input: {
  id: string;
  parentId: string;
  name: string;
  sortOrder: number;
  projectId: string;
}) {
  const q = await sql();
  await q`
    insert into data_room_folders (id, parent_id, name, sort_order, project_id)
    values (${input.id}, ${input.parentId}, ${input.name}, ${input.sortOrder}, ${input.projectId})
    on conflict (id) do update set
      name = excluded.name,
      sort_order = excluded.sort_order,
      parent_id = excluded.parent_id,
      project_id = excluded.project_id
  `;
}

async function upsertFile(input: {
  id: string;
  folderId: string;
  name: string;
  mime: string;
  b64: string;
}) {
  const q = await sql();
  const size = bytesOf(input.b64);
  await q`
    insert into data_room_files (
      id, folder_id, name, mime_type, size_bytes, content_b64, storage_key, ready
    )
    values (
      ${input.id}, ${input.folderId}, ${input.name}, ${input.mime}, ${size},
      ${input.b64}, ${null}, true
    )
    on conflict (id) do update set
      folder_id = excluded.folder_id,
      name = excluded.name,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      content_b64 = excluded.content_b64,
      storage_key = null,
      ready = true
  `;
}

async function dropNamedFolders(projectId: string, names: string[]) {
  const q = await sql();
  for (const name of names) {
    await q`
      delete from data_room_folders
      where project_id = ${projectId}
        and name = ${name}
        and id not like ${"%testdd-%"}
    `;
  }
  await q`
    delete from data_room_files
    where name = ${"README.txt"}
      and folder_id in (
        select id from data_room_folders
        where project_id = ${projectId} and parent_id is null
      )
      and id not like ${"%testdd-%"}
  `;
}

async function seedWorkspace(projectId: string, workspace: WorkspaceId) {
  const prefix = roomIdPrefix(projectId, workspace);
  const rootId = roomRoot(projectId, workspace);
  const q = await sql();
  const root = await q<{ id: string }>`select id from data_room_folders where id = ${rootId}`;
  if (!root[0]) return;

  const folderIds: Record<string, string> = {};
  let order = 0;
  for (const [key, name] of Object.entries(FOLDERS)) {
    const id = `${prefix}testdd-${key}`;
    folderIds[key] = id;
    await upsertFolder({
      id,
      parentId: rootId,
      name,
      sortOrder: order,
      projectId,
    });
    order += 1;
  }

  for (const item of LINDEN_PACK) {
    if (item.key === "root") {
      await upsertFile({
        id: `${prefix}testdd-${slugName(item.name)}`,
        folderId: rootId,
        name: item.name,
        mime: item.mime,
        b64: item.b64,
      });
      continue;
    }
    const folderId = folderIds[item.key];
    if (!folderId) continue;
    await upsertFile({
      id: `${prefix}testdd-${slugName(item.name)}`,
      folderId,
      name: item.name,
      mime: item.mime,
      b64: item.b64,
    });
    if (workspace === "asset") {
      const docId = ASSET_REQUEST_FOLDERS[item.key];
      if (!docId) continue;
      const requestFolderId = `${prefix}req-${docId}`;
      const exists = await q<{ id: string }>`
        select id from data_room_folders where id = ${requestFolderId}
      `;
      if (!exists[0]) continue;
      await upsertFile({
        id: `${prefix}testdd-req-${slugName(item.name)}`,
        folderId: requestFolderId,
        name: item.name,
        mime: item.mime,
        b64: item.b64,
      });
    }
  }
}

export async function seedLindenPack(projectId = DEFAULT_PROJECT_ID) {
  await dropNamedFolders(projectId, Object.values(FOLDERS));
  await seedWorkspace(projectId, "entity");
  await seedWorkspace(projectId, "asset");
}

export async function loadTestDdIntoOakridge() {
  await ensureProjectRoom(DEFAULT_PROJECT_ID, { sampleFiles: true });
  await seedLindenPack(DEFAULT_PROJECT_ID);
  return {
    projectId: DEFAULT_PROJECT_ID,
    slug: "oakridge",
    name: "Project Oakridge",
    storedIn: "database",
  };
}
