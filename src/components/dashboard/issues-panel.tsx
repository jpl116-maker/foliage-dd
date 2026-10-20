import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IssueDeleteButton } from "@/components/dashboard/issue-delete-button";
import { RaiseIssueDialog } from "@/components/dashboard/raise-issue-dialog";
import { issueFileRef } from "@/lib/issue-file";
import { useDdStore, type IssueFilter } from "@/lib/store";
import {
  ISSUE_STATUS_LABEL,
  SEVERITY_LABEL,
  type Issue,
  type IssueStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRole } from "@/components/auth/role-provider";
import { useProject } from "@/components/project/project-provider";

const FILTERS: { id: IssueFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "open", label: "Open" },
  { id: "monitoring", label: "Watch" },
  { id: "resolved", label: "Closed" },
  { id: "all", label: "All" },
];

function matchesFilter(issue: Issue, filter: IssueFilter) {
  if (filter === "all") return true;
  if (filter === "active") return issue.status === "open" || issue.status === "monitoring";
  return issue.status === filter;
}

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const DOT: Record<Issue["severity"], string> = {
  critical: "bg-paper",
  high: "bg-paper/70",
  medium: "bg-paper/45",
  low: "bg-paper/25",
};

export function IssuesPanel() {
  const { can } = useRole();
  const canRaise = can("raiseIssues");
  const issues = useDdStore((s) => s.issues);
  const documents = useDdStore((s) => s.documents);
  const categories = useDdStore((s) => s.categories);
  const workspace = useDdStore((s) => s.workspace);
  const { slug, id: projectId } = useProject();
  const filter = useDdStore((s) => s.issueFilter);
  const setIssueFilter = useDdStore((s) => s.setIssueFilter);
  const focusedIssueId = useDdStore((s) => s.focusedIssueId);
  const setFocusedIssueId = useDdStore((s) => s.setFocusedIssueId);
  const setIssueStatus = useDdStore((s) => s.setIssueStatus);
  const [openId, setOpenId] = useState<string | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [editing, setEditing] = useState<Issue | null>(null);

  useEffect(() => {
    if (focusedIssueId) setOpenId(focusedIssueId);
  }, [focusedIssueId]);

  const visible = useMemo(() => {
    const scoped = focusedIssueId
      ? issues.filter((i) => i.id === focusedIssueId)
      : issues.filter((i) => matchesFilter(i, filter));
    return scoped.slice().sort((a, b) => {
      if (a.status === "resolved" && b.status !== "resolved") return 1;
      if (b.status === "resolved" && a.status !== "resolved") return -1;
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    });
  }, [issues, filter, focusedIssueId]);

  const activeCount = issues.filter(
    (i) => i.status === "open" || i.status === "monitoring",
  ).length;
  const criticalCount = issues.filter(
    (i) => i.severity === "critical" && i.status !== "resolved",
  ).length;

  return (
    <section
      id="issues-panel"
      className="folia-enter folia-enter-3 overflow-hidden rounded-2xl bg-ink text-paper shadow-[var(--shadow-border)]"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-paper/55">
            Potential issues
          </p>
          <h2 className="font-display mt-1 text-2xl leading-tight tracking-tight">
            {activeCount === 0 ? "No active findings" : `${activeCount} identified`}
          </h2>
          <p className="mt-1 text-sm text-paper/65">
            {criticalCount > 0
              ? `${criticalCount} critical.`
              : "Raised from review of the client files."}
          </p>
        </div>
        {canRaise ? (
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 bg-paper/10 text-paper hover:bg-paper/15"
          onClick={() => {
            setEditing(null);
            setRaiseOpen(true);
          }}
        >
          <Plus className="size-4" />
          Raise
        </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pb-4">
        {focusedIssueId ? (
          <button
            type="button"
            onClick={() => setFocusedIssueId(null)}
            className="h-11 rounded-full bg-paper px-3 text-xs font-medium text-ink transition-colors duration-150"
          >
            Show all
          </button>
        ) : (
          FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setIssueFilter(f.id)}
              className={cn(
                "h-11 rounded-full px-3 text-xs font-medium transition-colors duration-150",
                filter === f.id
                  ? "bg-paper text-ink"
                  : "bg-paper/10 text-paper/75 hover:bg-paper/15",
              )}
            >
              {f.label}
            </button>
          ))
        )}
      </div>

      <div className="border-t border-paper/10">
        {visible.length === 0 ? (
          <p className="px-5 py-8 text-sm text-paper/60">
            Nothing in this view. Raise an issue from a file, or switch filters.
          </p>
        ) : (
          <ul>
            {visible.map((issue) => {
              const doc = documents.find((d) => d.id === issue.documentId);
              const cat = categories.find((c) => c.id === issue.categoryId);
              const fileRef = issueFileRef(issue, workspace, doc?.name, projectId);
              const open = openId === issue.id;
              return (
                <li key={issue.id} className="border-b border-paper/10 last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-5 py-3.5 text-left"
                    onClick={() => setOpenId(open ? null : issue.id)}
                    aria-expanded={open}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        DOT[issue.severity],
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium break-words text-paper">
                          {issue.title}
                        </span>
                        <span className="rounded-full bg-paper/12 px-2 py-0.5 text-xs font-medium tracking-wide text-paper/80 uppercase">
                          {SEVERITY_LABEL[issue.severity]}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs break-words text-paper/55">
                        {cat?.name}
                        {fileRef ? ` · ${fileRef.name}` : ""}
                        {issue.codeSection ? ` · ${issue.codeSection}` : ""}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "mt-1 size-4 shrink-0 text-paper/45 transition-transform duration-200",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  {open ? (
                    <div className="px-5 pt-0 pb-4 pl-10">
                      <p className="text-sm leading-relaxed text-paper/80">
                        {issue.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-paper/12 px-2 py-0.5 text-xs font-medium tracking-wide text-paper/80 uppercase">
                          {ISSUE_STATUS_LABEL[issue.status]}
                        </span>
                        <span className="text-xs text-paper/45">
                          {issue.raisedBy} · {issue.raisedOn}
                        </span>
                        {fileRef ? (
                          <>
                            <span className="min-w-0 max-w-[14rem] truncate text-xs text-paper/80">
                              {fileRef.name}
                            </span>
                            {fileRef.fileId ? (
                              <Link
                                to="/p/$slug/data-room/$folderId"
                                params={{ slug, folderId: fileRef.folderId }}
                                search={{ file: fileRef.fileId }}
                                className="shrink-0 text-xs text-paper underline-offset-2 hover:underline"
                              >
                                Open in data room
                              </Link>
                            ) : (
                              <Link
                                to="/p/$slug/data-room/$folderId"
                                params={{ slug, folderId: fileRef.folderId }}
                                className="shrink-0 text-xs text-paper underline-offset-2 hover:underline"
                              >
                                Open in data room
                              </Link>
                            )}
                          </>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canRaise
                          ? (["open", "monitoring", "resolved"] as IssueStatus[]).map(
                          (st) => (
                            <Button
                              key={st}
                              size="sm"
                              variant={issue.status === st ? "secondary" : "ghost"}
                              className={cn(
                                "h-11 text-xs",
                                issue.status === st
                                  ? "bg-paper text-ink hover:bg-paper"
                                  : "text-paper/80 hover:bg-paper/10",
                              )}
                              onClick={() => {
                                setIssueStatus(issue.id, st);
                                toast(
                                  st === "resolved"
                                    ? "Issue marked resolved"
                                    : `Issue set to ${ISSUE_STATUS_LABEL[st].toLowerCase()}`,
                                );
                              }}
                            >
                              {ISSUE_STATUS_LABEL[st]}
                            </Button>
                          ),
                        )
                          : (
                            <p className="text-xs font-medium tracking-wide text-paper/70 uppercase">
                              {ISSUE_STATUS_LABEL[issue.status]}
                            </p>
                          )}
                        {canRaise ? (
                          <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11 text-xs text-paper/80 hover:bg-paper/10"
                          onClick={() => {
                            setEditing(issue);
                            setRaiseOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <IssueDeleteButton
                          id={issue.id}
                          title={issue.title}
                          tone="dark"
                        />
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RaiseIssueDialog
        open={raiseOpen}
        onOpenChange={(open) => {
          setRaiseOpen(open);
          if (!open) setEditing(null);
        }}
        issue={editing}
      />
    </section>
  );
}
