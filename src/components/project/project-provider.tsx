import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { useRole } from "@/components/auth/role-provider";
import { getProjectBySlug } from "@/lib/projects-db";
import { projectHome, type Project } from "@/lib/projects";
import { useDdStore } from "@/lib/store";
import type { FoliaRole } from "@/lib/roles";

type ProjectContextValue = Project & {
  role: FoliaRole;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("Not inside a project");
  return value;
}

export function useOptionalProject() {
  return useContext(ProjectContext);
}

export function ProjectProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const { setProjectRole } = useRole();
  const setProject = useDdStore((s) => s.setProject);
  const updateMatter = useDdStore((s) => s.updateMatter);
  const [project, setLoaded] = useState<ProjectContextValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError(null);
    void getProjectBySlug({ data: { slug } })
      .then((row) => {
        if (cancelled) return;
        setProject(row.id, row.workspace);
        setProjectRole(row.role);
        updateMatter({
          name: row.name,
          client: row.clientName || "Client",
          target: row.portfolio || row.name,
          dueOn: row.dueOn || "2026-12-31",
        });
        setLoaded(row);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Project not found");
        setProjectRole(null);
      });
    return () => {
      cancelled = true;
      setProjectRole(null);
    };
  }, [slug, setProject, setProjectRole, updateMatter]);

  const value = useMemo(() => project, [project]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <p className="font-display text-2xl tracking-tight text-ink">No access</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <Link to="/" className="mt-6 inline-block text-sm text-forest hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <div className="h-8 w-40 animate-pulse rounded-md bg-paper-2" />
      </div>
    );
  }

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function projectLink(slug: string, path = "") {
  return `${projectHome(slug)}${path}`;
}
