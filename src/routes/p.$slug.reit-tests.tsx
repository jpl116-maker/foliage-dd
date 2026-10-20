import { createFileRoute } from "@tanstack/react-router";
import { ReitTestsPanel } from "@/components/dashboard/reit-tests-panel";
import { RoleRoute } from "@/components/auth/role-provider";

export const Route = createFileRoute("/p/$slug/reit-tests")({
  component: ReitTestsPage,
});

function ReitTestsPage() {
  return (
    <RoleRoute action="viewTests">
      <ReitTestsPanel />
    </RoleRoute>
  );
}
