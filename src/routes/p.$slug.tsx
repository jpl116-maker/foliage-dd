import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Header } from "@/components/dashboard/header";
import { ProjectProvider } from "@/components/project/project-provider";

export const Route = createFileRoute("/p/$slug")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { slug } = Route.useParams();
  return (
    <ProjectProvider slug={slug}>
      <div className="min-h-dvh overflow-x-clip bg-paper text-ink">
        <Header />
        <Outlet />
      </div>
    </ProjectProvider>
  );
}
