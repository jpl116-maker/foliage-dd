import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { RoleRoute, useRole } from "@/components/auth/role-provider";
import { useProject } from "@/components/project/project-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listProjectAudit, type AuditKind, type AuditRow } from "@/lib/audit";
import {
  addProjectMember,
  createProjectUser,
  listProjectMembers,
  listSiteUsers,
  removeProjectMember,
  setProjectMemberRole,
  type ProjectMemberRow,
  type SiteUserRow,
} from "@/lib/projects-db";
import { FOLIA_ROLES, ROLE_LABEL, type FoliaRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$slug/users")({
  component: ProjectUsersPage,
});

function ProjectUsersPage() {
  return (
    <RoleRoute action="manageUsers">
      <ProjectUsersPanel />
    </RoleRoute>
  );
}

function ProjectUsersPanel() {
  const project = useProject();
  const { refresh } = useRole();
  const [rows, setRows] = useState<ProjectMemberRow[] | null>(null);
  const [directory, setDirectory] = useState<SiteUserRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<FoliaRole>("client");
  const [busy, setBusy] = useState(false);

  function loadMembers() {
    void listProjectMembers({ data: { projectId: project.id } })
      .then(setRows)
      .catch(() => {
        toast("Could not load users");
        setRows([]);
      });
  }

  function loadDirectory() {
    void listSiteUsers()
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }

  useEffect(() => {
    loadMembers();
    loadDirectory();
  }, [project.id]);

  async function onRole(userId: string, next: FoliaRole) {
    try {
      await setProjectMemberRole({ data: { projectId: project.id, userId, role: next } });
      setRows((cur) =>
        (cur ?? []).map((row) => (row.userId === userId ? { ...row, role: next } : row)),
      );
      refresh();
      toast("Role updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update role");
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) {
      toast("Enter a username");
      return;
    }
    setBusy(true);
    try {
      if (password) {
        await createProjectUser({
          data: { projectId: project.id, username: name, password, role },
        });
        toast("Account created and added to this project");
      } else {
        await addProjectMember({
          data: { projectId: project.id, username: name, role },
        });
        toast("User added to this project");
      }
      setUsername("");
      setPassword("");
      loadMembers();
      loadDirectory();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add user");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(userId: string) {
    try {
      await removeProjectMember({ data: { projectId: project.id, userId } });
      setRows((cur) => (cur ?? []).filter((row) => row.userId !== userId));
      toast("Removed from this project");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove user");
    }
  }

  const memberNames = useMemo(
    () => new Set((rows ?? []).map((row) => row.username.toLowerCase())),
    [rows],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Access</p>
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">
        Project users
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Create an account with a username and password, or search for someone who
        already signed up. User type is their role on this matter.
      </p>

      <form
        className="mt-6 grid gap-3 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end"
        onSubmit={(e) => void onAdd(e)}
      >
        <UsernameSearch
          id="add-username"
          value={username}
          onChange={setUsername}
          users={directory}
          exclude={memberNames}
        />
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="add-password">Password</Label>
          <Input
            id="add-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </div>
        <div className="grid gap-2">
          <Label>User type</Label>
          <Select value={role} onValueChange={(value) => setRole(value as FoliaRole)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOLIA_ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {ROLE_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : password ? "Create user" : "Add existing"}
        </Button>
        <p className="text-xs text-muted sm:col-span-4">
          New accounts need a password. Leave password blank to add a username that
          already exists.
        </p>
      </form>

      <section className="mt-6 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        {rows === null ? (
          <p className="px-5 py-10 text-sm text-muted">Loading users…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-muted">No users on this project yet.</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li
                key={row.userId}
                className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{row.username}</p>
                  <p className="text-xs text-muted">{ROLE_LABEL[row.role]}</p>
                </div>
                <Select
                  value={row.role}
                  onValueChange={(value) => void onRole(row.userId, value as FoliaRole)}
                >
                  <SelectTrigger
                    aria-label={`Role for ${row.username}`}
                    className="h-11 w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLIA_ROLES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {ROLE_LABEL[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger hover:bg-danger/10"
                  onClick={() => void onRemove(row.userId)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ActivityLog projectId={project.id} />
    </div>
  );
}

function ActivityLog({ projectId }: { projectId: string }) {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"all" | AuditKind>("all");
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (hash.replace(/^#/, "") === "activity") setOpen(true);
  }, [hash]);

  useEffect(() => {
    function openFromHeader() {
      setOpen(true);
    }
    window.addEventListener("foliage-activity", openFromHeader);
    return () => window.removeEventListener("foliage-activity", openFromHeader);
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setRows(null);
    void listProjectAudit({ data: { projectId, kind } })
      .then((next) => {
        if (!cancel) setRows(next);
      })
      .catch(() => {
        if (!cancel) {
          toast("Could not load activity");
          setRows([]);
        }
      });
    return () => {
      cancel = true;
    };
  }, [open, kind, projectId]);

  return (
    <section id="activity" ref={panelRef} className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left shadow-[var(--shadow-border)] sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted">
            Record
          </span>
          <span className="block text-sm text-ink">Activity</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-faint transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          <div className="flex gap-1 border-b border-border px-3 py-2 sm:px-4">
            {(
              [
                ["all", "All"],
                ["access", "Access"],
                ["change", "Changes"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs",
                  kind === id ? "bg-paper-2 font-medium text-ink" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {rows === null ? (
            <p className="px-4 py-6 text-sm text-muted sm:px-5">Loading activity…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted sm:px-5">No activity yet.</p>
          ) : (
            <ul>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="border-b border-border px-4 py-2 last:border-b-0 sm:px-5"
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                    <time className="font-mono tabular-nums" dateTime={row.at}>
                      {whenLabel(row.at)}
                    </time>
                    <span className="font-medium text-ink">{row.username}</span>
                  </p>
                  <p className="text-sm text-ink">{row.summary}</p>
                </li>
              ))}
            </ul>
          )}
          {rows && rows.length === 200 ? (
            <p className="border-t border-border px-4 py-2 text-xs text-muted sm:px-5">
              Showing the latest 200 records.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function whenLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function UsernameSearch({
  id,
  value,
  onChange,
  users,
  exclude,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  users: SiteUserRow[];
  exclude: Set<string>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const suggestions = useMemo(() => {
    const needle = value.trim().toLowerCase();
    return users
      .filter((row) => !exclude.has(row.username.toLowerCase()))
      .filter((row) => {
        if (!needle) return true;
        return (
          row.username.toLowerCase().includes(needle) ||
          row.name.toLowerCase().includes(needle)
        );
      })
      .slice(0, 8);
  }, [users, exclude, value]);

  useEffect(() => {
    setActive(0);
  }, [value, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(row: SiteUserRow) {
    onChange(row.username);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((n) => (n + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((n) => (n - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      const hit = suggestions[active];
      if (hit) {
        e.preventDefault();
        pick(hit);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative grid min-w-0 gap-2">
      <Label htmlFor={id}>Username</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search existing users"
          autoComplete="off"
          className="pl-9"
        />
      </div>
      {open && suggestions.length > 0 ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute top-[calc(100%+4px)] z-20 max-h-64 w-full overflow-auto rounded-md bg-paper py-1 shadow-[var(--shadow-border)]"
        >
          {suggestions.map((row, i) => (
            <li key={row.userId} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col px-3 py-2 text-left",
                  i === active ? "bg-paper-2" : "hover:bg-paper-2",
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(row)}
              >
                <span className="truncate text-sm font-medium text-ink">{row.username}</span>
                <span className="truncate text-xs text-muted">{ROLE_LABEL[row.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : open && value.trim() ? (
        <p className="absolute top-[calc(100%+4px)] z-20 w-full rounded-md bg-paper px-3 py-2 text-xs text-muted shadow-[var(--shadow-border)]">
          No matching users. Enter a password to create this username.
        </p>
      ) : null}
    </div>
  );
}
