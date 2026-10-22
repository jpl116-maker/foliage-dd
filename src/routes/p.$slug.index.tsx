import { createFileRoute } from "@tanstack/react-router";
import { FilesPanel } from "@/components/dashboard/files-panel";
import { IssuesPanel } from "@/components/dashboard/issues-panel";
import { StatsRow } from "@/components/dashboard/stats-row";
import { useRole } from "@/components/auth/role-provider";

export const Route = createFileRoute("/p/$slug/")({
  component: ProjectHome,
});

function ProjectHome() {
  const { can } = useRole();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <StatsRow showReviewed />
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <FilesPanel />
        </div>
        {can("viewIssues") ? (
          <div className="min-w-0 lg:col-span-5 lg:sticky lg:top-24">
            <IssuesPanel />
          </div>
        ) : null}
      </div>
    </main>
  );
}
