import { createFileRoute } from "@tanstack/react-router";
import { IssuesListPanel } from "@/components/dashboard/issues-list-panel";
import { RoleRoute } from "@/components/auth/role-provider";

export const Route = createFileRoute("/p/$slug/issues")({
  component: IssuesPage,
});

function IssuesPage() {
  return (
    <RoleRoute action="viewIssues">
      <IssuesListPanel />
    </RoleRoute>
  );
}
