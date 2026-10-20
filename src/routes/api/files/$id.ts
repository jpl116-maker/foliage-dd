import { createFileRoute } from "@tanstack/react-router";
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
