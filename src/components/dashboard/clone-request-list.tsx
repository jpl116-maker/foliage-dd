import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useRole } from "@/components/auth/role-provider";
import { useProject } from "@/components/project/project-provider";
import { cloneRequestList } from "@/lib/request-list-db";
import { listMyProjects } from "@/lib/projects-db";
import type { Project } from "@/lib/projects";
import { useDdStore } from "@/lib/store";
import { WORKSPACE_LABEL } from "@/lib/workspace";

export function CloneRequestListButton() {
  const { can } = useRole();
  const project = useProject();
  const workspace = useDdStore((s) => s.workspace);
  const hydrateRequestList = useDdStore((s) => s.hydrateRequestList);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProjects(null);
    setSourceId("");
    void listMyProjects()
      .then((rows) => {
        if (cancelled) return;
        const others = rows.filter((row) => row.id !== project.id);
        setProjects(others);
        setSourceId(others[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project.id]);

  if (!can("editRequestList")) return null;

  async function onClone() {
    if (!sourceId) return;
    setBusy(true);
    try {
      const result = await cloneRequestList({
        data: {
          projectId: project.id,
          sourceProjectId: sourceId,
          workspace,
        },
      });
      hydrateRequestList({
        categories: result.categories,
        requests: result.requests,
      });
      const source = (projects ?? []).find((row) => row.id === sourceId);
      toast(
        `Cloned ${result.requests.length} ${result.requests.length === 1 ? "item" : "items"} from ${source?.name ?? "that project"}`,
      );
      setOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not clone the request list");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="size-4" />
        Clone from project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Clone a request list</DialogTitle>
          <DialogDescription>
            Copy categories and line items from another project into this{" "}
            {WORKSPACE_LABEL[workspace]} list. Linked files and comments are not
            copied. This replaces the current request list.
          </DialogDescription>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="clone-source">Project</Label>
              {projects === null ? (
                <p className="text-sm text-muted">Loading projects…</p>
              ) : projects.length === 0 ? (
                <p className="text-sm text-muted">No other projects to clone from.</p>
              ) : (
                <select
                  id="clone-source"
                  className="h-11 w-full min-w-0 rounded-md bg-surface px-3 text-sm text-ink shadow-[var(--shadow-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  {projects.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {row.clientName ? ` · ${row.clientName}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void onClone()}
                disabled={busy || !sourceId}
              >
                Clone list
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
