import { assertFolderAccess } from "@/lib/projects-db";
import { readFileBytes } from "@/lib/data-room";
import { MAX_UPLOAD_BYTES } from "@/lib/file-limits";
import { zipBuffers, zipPath } from "@/lib/zip.server";

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function zipFileName(folderName: string) {
  const base =
    folderName
      .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
      .replace(/[^\x20-\x7E]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.\s-]+|[.\s-]+$/g, "")
      .trim() || "folder";
  return `${base}.zip`;
}

export async function zipFolderForUser(
  folderId: string,
  userId: string,
): Promise<{ name: string; bytes: Buffer; fileCount: number }> {
  const access = await assertFolderAccess(userId, folderId);
  const q = await sql();
  const folderRows = await q<{
    id: string;
    parent_id: string | null;
    name: string;
  }>`
    select id, parent_id, name
    from data_room_folders
    where project_id = ${access.project.id}
  `;
  const folder = folderRows.find((row) => row.id === folderId);
  if (!folder) throw new Error("Folder not found");

  const kids = new Map<string | null, string[]>();
  const byId = new Map(folderRows.map((row) => [row.id, row]));
  for (const row of folderRows) {
    const list = kids.get(row.parent_id) ?? [];
    list.push(row.id);
    kids.set(row.parent_id, list);
  }
  const tree = new Set<string>();
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    if (tree.has(id)) continue;
    tree.add(id);
    for (const child of kids.get(id) ?? []) stack.push(child);
  }

  const relative = new Map<string, string[]>();
  relative.set(folderId, [folder.name]);
  const walk = (id: string, parts: string[]) => {
    for (const child of kids.get(id) ?? []) {
      const row = byId.get(child);
      if (!row) continue;
      const next = [...parts, row.name];
      relative.set(child, next);
      walk(child, next);
    }
  };
  walk(folderId, [folder.name]);

  const allFiles = await q<{
    id: string;
    folder_id: string;
    name: string;
    size_bytes: number;
  }>`
    select f.id, f.folder_id, f.name, f.size_bytes
    from data_room_files f
    join data_room_folders d on d.id = f.folder_id
    where d.project_id = ${access.project.id}
      and coalesce(f.ready, true) = true
    order by f.name
  `;
  const files = allFiles.filter((file) => tree.has(file.folder_id));

  if (files.length === 0) {
    throw new Error("This folder has no files to download");
  }

  const total = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  if (total > MAX_UPLOAD_BYTES) {
    throw new Error("This folder is too large to download as one zip");
  }

  const entries = [];
  for (const file of files) {
    const stored = await readFileBytes(file.id, userId);
    const parts = [...(relative.get(file.folder_id) ?? [folder.name]), file.name];
    entries.push({
      name: zipPath(parts),
      data: stored.bytes,
    });
  }

  return {
    name: zipFileName(folder.name),
    bytes: zipBuffers(entries),
    fileCount: files.length,
  };
}
