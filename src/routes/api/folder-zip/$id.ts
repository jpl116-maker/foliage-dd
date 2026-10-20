import { createFileRoute } from "@tanstack/react-router";
import { zipFolderForUser } from "@/lib/folder-zip.server";
import { requireRequestUser } from "@/lib/request-user.server";

export const Route = createFileRoute("/api/folder-zip/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const id =
            (params as { id?: string }).id ||
            new URL(request.url).pathname.split("/").pop() ||
            "";
          if (!id) return new Response("Folder not found", { status: 404 });
          const userId = await requireRequestUser(request);
          const zip = await zipFolderForUser(id, userId);
          const asciiName = zip.name.replace(/[^\x20-\x7E]/g, "_");
          return new Response(new Uint8Array(zip.bytes), {
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${asciiName}"`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Folder not found";
          const status =
            message === "Unauthorized"
              ? 401
              : message === "You do not have access to this project"
                ? 403
                : message === "This folder has no files to download" ||
                    message === "This folder is too large to download as one zip"
                  ? 400
                  : 404;
          return new Response(message, { status });
        }
      },
    },
  },
});
