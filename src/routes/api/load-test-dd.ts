import { createFileRoute } from "@tanstack/react-router";
import { loadTestDdIntoOakridge } from "@/lib/load-test-dd";
import { requireRequestUser } from "@/lib/request-user.server";
import { siteRoleFor } from "@/lib/roles-db";

export const Route = createFileRoute("/api/load-test-dd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await requireRequestUser(request);
          const role = await siteRoleFor(userId);
          if (role !== "admin") {
            return new Response("Only Admin can load the test data set", { status: 403 });
          }
          const result = await loadTestDdIntoOakridge();
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load test files";
          const status = message === "Unauthorized" ? 401 : 400;
          return new Response(message, { status });
        }
      },
    },
  },
});
