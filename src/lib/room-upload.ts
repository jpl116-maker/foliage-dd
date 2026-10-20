import { getBearerToken } from "@/lib/auth/client";
import { beginUpload, completeUpload } from "@/lib/data-room";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, UPLOAD_CHUNK_BYTES } from "@/lib/file-limits";
import type { WorkspaceId } from "@/lib/workspace";

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL };

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function uploadRoomFile(input: {
  file: File;
  folderId?: string;
  request?: {
    projectId: string;
    workspace: WorkspaceId;
    documentId: string;
    categoryId: string;
    folderName: string;
  };
}): Promise<{ id: string; folderId: string }> {
  if (input.file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${input.file.name} is over ${MAX_UPLOAD_LABEL}`);
  }
  const started = await beginUpload({
    data: {
      folderId: input.folderId,
      name: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      sizeBytes: input.file.size,
      request: input.request,
    },
  });
  const total = Math.max(1, Math.ceil(input.file.size / UPLOAD_CHUNK_BYTES));
  for (let index = 0; index < total; index += 1) {
    const start = index * UPLOAD_CHUNK_BYTES;
    const slice = input.file.slice(start, start + UPLOAD_CHUNK_BYTES);
    const body = await slice.arrayBuffer();
    const res = await fetch("/api/files/chunk", {
      method: "POST",
      credentials: "include",
      headers: authHeaders({
        "x-storage-key": started.storageKey,
        "x-chunk-index": String(index),
      }),
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Upload failed");
    }
  }
  return completeUpload({ data: { id: started.id } });
}

export async function fetchRoomFileBlob(id: string): Promise<Blob> {
  const res = await fetch(`/api/files/${id}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Could not open file");
  }
  return res.blob();
}

export async function fetchFolderZip(id: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api/folder-zip/${encodeURIComponent(id)}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Could not download folder");
  }
  const blob = await res.blob();
  const disp = res.headers.get("content-disposition") ?? "";
  const match = disp.match(/filename="([^"]+)"/);
  return { blob, filename: match?.[1] || "folder.zip" };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
