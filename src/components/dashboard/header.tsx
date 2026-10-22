import { useState, useSyncExternalStore, type FormEvent } from "react";
import { FolderOpen, Home, LayoutGrid, ScrollText, Settings, Users } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { daysUntil, formatDay } from "@/lib/status";
import { useDdStore } from "@/lib/store";
import { WORKSPACES, type WorkspaceId } from "@/lib/workspace";
import { RequestListSync } from "@/components/dashboard/request-list-sync";
import { IssuesSync } from "@/components/dashboard/issues-sync";
import { useRole } from "@/components/auth/role-provider";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { FOLIA_ROLES, ROLE_LABEL } from "@/lib/roles";
import { useProject } from "@/components/project/project-provider";
import { setProjectWorkspace, updateProject } from "@/lib/projects-db";

export function Header() {
  const matter = useDdStore((s) => s.matter);
  const workspace = useDdStore((s) => s.workspace);
  const setWorkspace = useDdStore((s) => s.setWorkspace);
  const remaining = daysUntil(matter.dueOn);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = useRole();
  const project = useProject();

  function onWorkspaceChange(next: string) {
    if (!can("switchWorkspace")) return;
    const workspace = next as WorkspaceId;
    setWorkspace(workspace);
    void setProjectWorkspace({
      data: { projectId: project.id, workspace },
    }).catch(() => {
      toast("Could not save diligence type");
    });
    if (pathname.includes("/data-room")) {
      void navigate({ to: "/p/$slug/data-room", params: { slug: project.slug } });
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-paper/90 backdrop-blur-sm">
      <RequestListSync />
      <IssuesSync />
      <div className="h-0.5 bg-forest" />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 basis-52 items-center gap-3">
          <AccountChip />
          <span className="h-6 w-px shrink-0 bg-ink-2" aria-hidden />
          <Link to="/" className="shrink-0 leading-none">
            <span className="font-display text-2xl tracking-tight text-ink">
              Foliage
            </span>
          </Link>
          <span className="h-6 w-px shrink-0 bg-ink-2" aria-hidden />
          <div className="min-w-0">
            <Link
              to="/p/$slug"
              params={{ slug: project.slug }}
              className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink hover:underline"
            >
              <Home className="size-3.5 shrink-0 text-muted" />
              <span className="truncate">{matter.name}</span>
            </Link>
            <p className="truncate text-xs text-muted">
              {matter.client}
              <span className="text-faint"> · </span>
              {matter.target}
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <Select
            value={workspace}
            onValueChange={onWorkspaceChange}
            disabled={!can("switchWorkspace")}
          >
            <SelectTrigger
              aria-label="Diligence type"
              className={
                can("switchWorkspace")
                  ? "h-9 w-36 shrink-0 whitespace-nowrap bg-transparent px-2.5 shadow-none hover:bg-paper-2"
                  : "h-9 w-36 shrink-0 cursor-default whitespace-nowrap bg-transparent px-2.5 shadow-none [&_svg]:hidden disabled:opacity-100"
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {WORKSPACES.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <LayoutGrid className="size-4" />
              Projects
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/p/$slug/data-room" params={{ slug: project.slug }}>
              <FolderOpen className="size-4" />
              Data room
            </Link>
          </Button>
          {can("manageUsers") ? (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/p/$slug/users" params={{ slug: project.slug }}>
                <Users className="size-4" />
                Users
              </Link>
            </Button>
          ) : null}
          {can("manageUsers") ? (
            <Button variant="ghost" size="sm" asChild>
              <Link
                to="/p/$slug/users"
                params={{ slug: project.slug }}
                hash="activity"
                onClick={() => {
                  window.dispatchEvent(new Event("foliage-activity"));
                }}
              >
                <ScrollText className="size-4" />
                Activity
              </Link>
            </Button>
          ) : null}
          <div className="px-1 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Diligence due
            </p>
            <p className="font-mono text-sm tabular-nums text-ink">
              {formatDay(matter.dueOn)}
              <span className="text-muted">
                {" "}
                · {remaining < 0 ? `${Math.abs(remaining)}d late` : `${remaining}d`}
              </span>
            </p>
          </div>
          {can("editMatter") ? <MatterSettings /> : null}
        </div>
      </div>
    </header>
  );
}

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

function AccountChip() {
  const user = useCurrentUser();
  const { role, realRole, setViewAs } = useRole();
  const [signingOut, setSigningOut] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  const showSignOut = authEnabled && !gateSession;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="size-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper-2 text-xs font-medium text-ink">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 max-w-36 leading-tight sm:max-w-48">
        <p className="truncate text-sm font-medium text-ink">
          {label}
          <span className="font-normal text-muted"> · {ROLE_LABEL[role]}</span>
        </p>
        {showSignOut ? (
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut().catch(() => setSigningOut(false));
            }}
            className="text-xs text-muted hover:text-ink hover:underline disabled:cursor-wait"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        ) : null}
        {realRole === "admin" ? (
          <Popover.Root open={viewOpen} onOpenChange={setViewOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="block text-xs text-muted hover:text-ink hover:underline"
              >
                View: {ROLE_LABEL[role]}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={6}
                className="z-50 w-40 rounded-md bg-surface p-1 text-ink shadow-[var(--shadow-border)]"
              >
                {FOLIA_ROLES.map((next) => (
                  <button
                    key={next}
                    type="button"
                    className="flex h-11 w-full items-center px-3 text-left text-sm hover:bg-paper-2"
                    onClick={() => {
                      setViewAs(next);
                      setViewOpen(false);
                    }}
                  >
                    {ROLE_LABEL[next]}
                  </button>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
      </div>
    </div>
  );
}

function MatterSettings() {
  const matter = useDdStore((s) => s.matter);
  const updateMatter = useDdStore((s) => s.updateMatter);
  const project = useProject();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(matter.name);
  const [client, setClient] = useState(matter.client);
  const [portfolio, setPortfolio] = useState(matter.target);
  const [dueOn, setDueOn] = useState(matter.dueOn);

  function loadFromMatter() {
    setName(matter.name);
    setClient(matter.client);
    setPortfolio(matter.target);
    setDueOn(matter.dueOn);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const nextName = name.trim();
    const nextClient = client.trim();
    const nextPortfolio = portfolio.trim();
    if (!nextName || !nextClient || !nextPortfolio || !dueOn) {
      toast("All fields are required");
      return;
    }
    updateMatter({
      name: nextName,
      client: nextClient,
      target: nextPortfolio,
      dueOn,
    });
    void updateProject({
      data: {
        projectId: project.id,
        name: nextName,
        clientName: nextClient,
        portfolio: nextPortfolio,
        dueOn,
      },
    }).catch(() => {
      toast("Could not save to the server");
    });
    toast("Matter updated");
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) loadFromMatter();
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Matter settings">
          <Settings className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(calc(100vw-1.5rem),22rem)] rounded-xl bg-surface p-4 text-ink shadow-[var(--shadow-border)]"
        >
          <form className="grid gap-3" onSubmit={save}>
            <p className="font-display text-lg leading-tight tracking-tight">
              Matter settings
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="matter-name">Project name</Label>
              <Input
                id="matter-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matter-client">Client name</Label>
              <Input
                id="matter-client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matter-portfolio">Portfolio name</Label>
              <Input
                id="matter-portfolio"
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matter-due">Due date</Label>
              <Input
                id="matter-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}