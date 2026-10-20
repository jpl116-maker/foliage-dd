import { createFileRoute } from "@tanstack/react-router";
import { putBlobChunk } from "@/lib/blob-store.server";
import { UPLOAD_CHUNK_BYTES } from "@/lib/file-limits";
import { assertFolderAccess } from "@/lib/projects-db";
import { requireRequestUser } from "@/lib/request-user.server";

async function assertOpenUploadAccess(userId: string, storageKey: string) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ folder_id: string }>`
    select folder_id from data_room_files
    where storage_key = ${storageKey} and coalesce(ready, false) = false
    limit 1
  `;
  if (!rows[0]) throw new Error("Upload is not open");
  await assertFolderAccess(userId, rows[0].folder_id);
}

export const Route = createFileRoute("/api/files/chunk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await requireRequestUser(request);
          const storageKey = request.headers.get("x-storage-key")?.trim() ?? "";
          const index = Number.parseInt(request.headers.get("x-chunk-index") ?? "", 10);
          if (!storageKey || storageKey.length > 80 || !Number.isFinite(index) || index < 0) {
            return new Response("Invalid upload", { status: 400 });
          }
          await assertOpenUploadAccess(userId, storageKey);
          const buf = new Uint8Array(await request.arrayBuffer());
          if (buf.byteLength === 0 || buf.byteLength > UPLOAD_CHUNK_BYTES) {
            return new Response("Invalid chunk", { status: 400 });
          }
          await putBlobChunk(storageKey, index, buf);
          return Response.json({ ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          const status =
            message === "Unauthorized"
              ? 401
              : message === "You do not have access to this project"
                ? 403
                : 400;
          return new Response(message, { status });
        }
      },
    },
  },
});
