import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/components/auth/role-provider";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listSiteUsers, type SiteUserRow } from "@/lib/projects-db";
import { removeSiteUser, setFoliaRole } from "@/lib/roles-db";
import { FOLIA_ROLES, ROLE_LABEL, type FoliaRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function UsersDirectory({
  className,
  defaultOpen = false,
}: {
  className?: string;
  defaultOpen?: boolean;
}) {
  const { refresh } = useRole();
  const me = useCurrentUser();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SiteUserRow[] | null>(null);

  function load() {
    void listSiteUsers()
      .then(setRows)
      .catch(() => {
        toast("Could not load users");
        setRows([]);
      });
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      if (row.username.toLowerCase().includes(needle)) return true;
      if (row.name.toLowerCase().includes(needle)) return true;
      if (ROLE_LABEL[row.role].toLowerCase().includes(needle)) return true;
      return row.projects.some(
        (project) =>
          project.name.toLowerCase().includes(needle) ||
          project.slug.toLowerCase().includes(needle),
      );
    });
  }, [rows, query]);

  async function onRole(userId: string, role: FoliaRole) {
    try {
      await setFoliaRole({ data: { userId, role } });
      setRows((cur) =>
        (cur ?? []).map((row) => (row.userId === userId ? { ...row, role } : row)),
      );
      refresh();
      toast("Role updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update role");
    }
  }

  async function onRemove(userId: string) {
    try {
      await removeSiteUser({ data: { userId } });
      setRows((cur) => (cur ?? []).filter((row) => row.userId !== userId));
      toast("User removed");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove user");
    }
  }

  const count = rows?.length ?? 0;

  return (
    <section id="users" className={cn("mt-10", className)}>
      <article className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        <button
          type="button"
          onClick={() => setOpen((cur) => !cur)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Access</p>
            <h2 className="font-display mt-1 text-2xl tracking-tight text-ink">Users</h2>
            <p className="mt-1 text-sm text-muted">
              {rows === null
                ? "Every account on this site"
                : `${count} ${count === 1 ? "account" : "accounts"}`}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "mt-1 size-4 shrink-0 text-faint transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        {open ? (
          <div className="border-t border-border">
            <p className="px-4 pt-4 text-sm text-muted sm:px-5">
              Site role is separate from access on a matter — grant that on the
              project’s Users page.
            </p>
            <div className="px-4 py-3 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, role, or project"
                  className="pl-10"
                  aria-label="Search users"
                  autoComplete="off"
                />
              </div>
            </div>
            {rows === null ? (
              <p className="px-5 py-8 text-sm text-muted">Loading users…</p>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">
                {query.trim() ? "No matching users." : "No users yet."}
              </p>
            ) : (
              <ul>
                {filtered.map((row) => (
                  <li
                    key={row.userId}
                    className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{row.username}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {row.role === "admin" ? (
                          "All projects"
                        ) : row.projects.length === 0 ? (
                          "No projects yet"
                        ) : (
                          row.projects.map((project, i) => (
                            <span key={project.id}>
                              {i > 0 ? <span className="text-faint"> · </span> : null}
                              <Link
                                to="/p/$slug"
                                params={{ slug: project.slug }}
                                className="hover:text-ink hover:underline"
                              >
                                {project.name}
                              </Link>
                            </span>
                          ))
                        )}
                      </p>
                    </div>
                    <Select
                      value={row.role}
                      onValueChange={(value) => onRole(row.userId, value as FoliaRole)}
                    >
                      <SelectTrigger
                        aria-label={`Role for ${row.username}`}
                        className="h-11 w-40"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLIA_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {me?.id === row.userId ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => void onRemove(row.userId)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </article>
    </section>
  );
}
