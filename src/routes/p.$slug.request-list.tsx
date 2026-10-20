import { createFileRoute } from "@tanstack/react-router";
import { RequestListPanel } from "@/components/dashboard/request-list-panel";

export const Route = createFileRoute("/p/$slug/request-list")({
  component: RequestListPage,
});

function RequestListPage() {
  return <RequestListPanel />;
}
