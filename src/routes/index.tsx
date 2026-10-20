import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRole } from "@/components/auth/role-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject, listMyProjects } from "@/lib/projects-db";
import { projectHome, slugify, type Project } from "@/lib/projects";
import { WORKSPACE_LABEL } from "@/lib/workspace";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ROLE_LABEL } from "@/lib/roles";
import { UsersDirectory } from "@/components/dashboard/users-directory";

export const Route = createFileRoute("/")({ component: ProjectsHome });

function ProjectsHome() {
  const { can, siteRole } = useRole();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    void listMyProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("Give the project a name");
      return;
    }
    setBusy(true);
    try {
      const created = await createProject({
        data: {
          name: name.trim(),
          slug: slug.trim() || undefined,
        },
      });
      toast("Project created");
      setName("");
      setSlug("");
      void navigate({ to: "/p/$slug", params: { slug: created.slug } });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-border">
        <div className="h-0.5 bg-forest" />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="font-display text-2xl tracking-tight">Foliage</p>
          <div className="text-right">
            <p className="text-sm text-ink">
              {user?.displayName ?? "Signed in"}
              <span className="text-muted"> · {ROLE_LABEL[siteRole]}</span>
            </p>
            <button
              type="button"
              className="text-xs text-muted hover:text-ink hover:underline"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Engagements</p>
        <h1 className="font-display mt-1 text-3xl tracking-tight">Projects</h1>
        <p className="mt-2 text-sm text-muted">
          Each project has its own link, files, and people. Admin sets Entity DD or Asset DD on the project; everyone sees that instance when they open it.
        </p>

        <ul className="mt-6 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          {projects === null ? (
            <li className="px-5 py-10 text-sm text-muted">Loading projects…</li>
          ) : projects.length === 0 ? (
            <li className="px-5 py-10 text-sm text-muted">No projects yet.</li>
          ) : (
            projects.map((project) => (
              <li key={project.id} className="border-b border-border last:border-b-0">
                <Link
                  to="/p/$slug"
                  params={{ slug: project.slug }}
                  className="block px-5 py-4 hover:bg-paper-2"
                >
                  <p className="text-sm font-medium text-ink">{project.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {project.clientName || "No client yet"}
                    <span className="text-faint"> · </span>
                    {WORKSPACE_LABEL[project.workspace]}
                    <span className="text-faint"> · </span>
                    {projectHome(project.slug)}
                  </p>
                </Link>
              </li>
            ))
          )}
        </ul>

        {can("manageUsers") ? <UsersDirectory /> : null}

        {siteRole === "admin" ? (
          <form
            className="mt-8 grid gap-3 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]"
            onSubmit={(e) => void onCreate(e)}
          >
            <p className="text-sm font-medium text-ink">New project</p>
            <p className="text-xs text-muted">
              Entity DD copies Project Oakridge’s request list. Asset DD copies Project Harbor’s.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(slugify(e.target.value));
                }}
                placeholder="Project Oakridge"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-slug">Link</Label>
              <Input
                id="project-slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="oakridge"
              />
              <p className="text-xs text-muted">
                Share <span className="font-mono">/p/{slug || "your-link"}</span> with the client and the team on this matter.
              </p>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create project"}
            </Button>
          </form>
        ) : null}
      </main>
    </div>
  );
}
