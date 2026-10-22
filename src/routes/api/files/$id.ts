import { createFileRoute } from "@tanstack/react-router";
import { recordAudit } from "@/lib/audit";
import { readFileBytes } from "@/lib/data-room";
import { requireRequestUser } from "@/lib/request-user.server";

export const Route = createFileRoute("/api/files/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const id =
            (params as { id?: string }).id ||
            new URL(request.url).pathname.split("/").pop() ||
            "";
          if (!id) return new Response("File not found", { status: 404 });
          const userId = await requireRequestUser(request);
          const file = await readFileBytes(id, userId);
          const q = await import("@/lib/db").then((mod) => mod.getSql());
          const sql = await q;
          const project = await sql<{ project_id: string }>`
            select d.project_id
            from data_room_files f
            join data_room_folders d on d.id = f.folder_id
            where f.id = ${id}
            limit 1
          `;
          if (project[0]) {
            await recordAudit({
              projectId: project[0].project_id,
              userId,
              kind: "access",
              summary: `Opened ${file.name}`,
            });
          }
          const safeName = file.name.replace(/[\r\n"]/g, "_");
          return new Response(new Uint8Array(file.bytes), {
            headers: {
              "Content-Type": file.mimeType || "application/octet-stream",
              "Content-Disposition": `inline; filename="${safeName}"`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "File not found";
          const status = message === "Unauthorized" ? 401 : 404;
          return new Response(message, { status });
        }
      },
    },
  },
});
