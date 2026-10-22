import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, FileDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IssueDeleteButton } from "@/components/dashboard/issue-delete-button";
import { RaiseIssueDialog } from "@/components/dashboard/raise-issue-dialog";
import { issueFileRef } from "@/lib/issue-file";
import {
  buildIssueReport,
  downloadIssueReport,
  reportIssues,
  type ReportFormat,
} from "@/lib/issue-report";
import { polishIssueReport } from "@/lib/issue-report-polish";
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
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "monitoring", label: "Watch" },
  { id: "resolved", label: "Closed" },
  { id: "active", label: "Active" },
];

function matchesFilter(issue: Issue, filter: IssueFilter) {
  if (filter === "all") return true;
  if (filter === "active") return issue.status === "open" || issue.status === "monitoring";
  return issue.status === filter;
}

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const SEV_BADGE: Record<Issue["severity"], string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/15 text-warn",
  medium: "bg-caution/15 text-caution",
  low: "bg-paper-2 text-muted",
};

export function IssuesListPanel() {
  const { can } = useRole();
  const canRaise = can("raiseIssues");
  const updateIssue = useDdStore((s) => s.updateIssue);
  const issues = useDdStore((s) => s.issues);
  const documents = useDdStore((s) => s.documents);
  const categories = useDdStore((s) => s.categories);
  const matter = useDdStore((s) => s.matter);
  const workspace = useDdStore((s) => s.workspace);
  const { slug, id: projectId } = useProject();
  const setIssueStatus = useDdStore((s) => s.setIssueStatus);
  const [filter, setFilter] = useState<IssueFilter>("all");
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [reportFormat, setReportFormat] = useState<ReportFormat>("docx");
  const [formatOpen, setFormatOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  function trackerText(current: string, next: string) {
    const cleaned = next.trim();
    if (!cleaned) return current;
    const limit = Math.max(current.length + 80, Math.ceil(current.length * 1.35));
    if (current.trim() && cleaned.length > limit) return current;
    return cleaned;
  }

  async function downloadReport() {
    if (reportBusy) return;
    setReportBusy(true);
    try {
      const preparedOn = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      let rows = reportIssues({
        issues,
        documents,
        categories,
        workspace,
        projectId,
      });
      let corrected = 0;
      try {
        const result = await polishIssueReport({
          data: {
            projectId,
            client: matter.client,
            target: matter.target,
            deal: matter.dealType,
            issues: rows.map((issue) => ({
              id: issue.id,
              title: issue.title,
              summary: issue.finding,
              code: issue.code,
              status: issue.status,
              severity: issue.severity,
              where: issue.where,
            })),
          },
        });
        if (result.ok && result.issues.length > 0) {
          const byId = new Map(result.issues.map((issue) => [issue.id, issue]));
          rows = rows.map((issue) => {
            const next = byId.get(issue.id);
            if (!next) return issue;
            const title = trackerText(issue.title, next.title);
            const finding = next.finding.trim() || issue.finding;
            return { ...issue, title, finding };
          });
          if (canRaise) {
            for (const issue of issues) {
              const next = byId.get(issue.id);
              if (!next) continue;
              const title = trackerText(issue.title, next.title);
              const summary = trackerText(issue.summary, next.summary);
              if (title === issue.title && summary === issue.summary) continue;
              updateIssue(issue.id, {
                title,
                summary,
                severity: issue.severity,
                categoryId: issue.categoryId,
                documentId: issue.documentId,
                codeSection: issue.codeSection,
                roomFileId: issue.roomFileId,
                roomFolderId: issue.roomFolderId,
                roomFileName: issue.roomFileName,
              });
              corrected += 1;
            }
          }
        }
      } catch {
        /* The report still downloads from the issues as written. */
      }
      const report = buildIssueReport({
        matter,
        workspace,
        preparedOn,
        issues: rows,
      });
      const extension = reportFormat === "pdf" ? "pdf" : "docx";
      downloadIssueReport(`${slug}-issues-report.${extension}`, report, reportFormat);
      toast(
        corrected > 0
          ? "Issue report downloaded. Typos were corrected on the issues list."
          : "Issue report downloaded",
      );
    } finally {
      setReportBusy(false);
    }
  }

  useEffect(() => {
    setFilter("all");
  }, [workspace]);

  const visible = useMemo(() => {
    return issues
      .filter((i) => matchesFilter(i, filter))
      .slice()
      .sort((a, b) => {
        if (a.status === "resolved" && b.status !== "resolved") return 1;
        if (b.status === "resolved" && a.status !== "resolved") return -1;
        return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      });
  }, [issues, filter]);

  const open = issues.filter((i) => i.status === "open").length;
  const watch = issues.filter((i) => i.status === "monitoring").length;
  const closed = issues.filter((i) => i.status === "resolved").length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Issues
          </p>
          <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">
            {issues.length} {issues.length === 1 ? "issue" : "issues"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {open} open
            <span className="text-faint"> · </span>
            {watch} watch
            <span className="text-faint"> · </span>
            {closed} closed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-md shadow-[var(--shadow-border)]">
            <button
              type="button"
              onClick={() => void downloadReport()}
              disabled={reportBusy}
              className="inline-flex items-center gap-2 px-3 text-sm font-medium text-ink hover:bg-paper-2 disabled:opacity-40"
            >
              <FileDown className="size-4" />
              {reportBusy ? "Writing…" : "Report"}
              <span className="text-muted">{reportFormat === "pdf" ? "PDF" : "Word"}</span>
            </button>
            <Popover.Root open={formatOpen} onOpenChange={setFormatOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  aria-label="Report format"
                  className="inline-flex w-8 items-center justify-center border-l border-border text-ink hover:bg-paper-2"
                >
                  <ChevronDown className="size-4" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 w-36 rounded-md bg-surface p-1 text-ink shadow-[var(--shadow-border)]"
                >
                  {(
                    [
                      ["docx", "Word"],
                      ["pdf", "PDF"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className="flex h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-paper-2"
                      onClick={() => {
                        setReportFormat(value);
                        setFormatOpen(false);
                      }}
                    >
                      {label}
                      {reportFormat === value ? <Check className="size-4 text-forest" /> : null}
                    </button>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          {canRaise ? (
          <Button
            size="sm"
            className="shrink-0"
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
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "h-11 rounded-full px-3 text-xs font-medium transition-colors duration-150",
              filter === f.id
                ? "bg-ink text-paper"
                : "bg-paper-2 text-muted hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-surface px-5 py-12 text-center text-sm text-muted shadow-[var(--shadow-border)]">
          No issues match that filter.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          {visible.map((issue) => {
            const doc = documents.find((d) => d.id === issue.documentId);
            const cat = categories.find((c) => c.id === issue.categoryId);
            const fileRef = issueFileRef(issue, workspace, doc?.name, projectId);
            return (
              <li
                key={issue.id}
                className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{issue.title}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium tracking-wide uppercase",
                        SEV_BADGE[issue.severity],
                      )}
                    >
                      {SEVERITY_LABEL[issue.severity]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {issue.summary}
                  </p>
                  <p className="mt-1 text-xs text-faint">
                    {cat?.name}
                    {fileRef ? (
                      <>
                        {" · "}
                        {fileRef.fileId ? (
                          <Link
                            to="/p/$slug/data-room/$folderId"
                            params={{ slug, folderId: fileRef.folderId }}
                            search={{ file: fileRef.fileId }}
                            className="text-forest hover:underline"
                          >
                            {fileRef.name}
                          </Link>
                        ) : (
                          <Link
                            to="/p/$slug/data-room/$folderId"
                            params={{ slug, folderId: fileRef.folderId }}
                            className="text-forest hover:underline"
                          >
                            {fileRef.name}
                          </Link>
                        )}
                      </>
                    ) : null}
                    {issue.codeSection ? ` · ${issue.codeSection}` : ""}
                    {` · ${issue.raisedBy} · ${issue.raisedOn}`}
                  </p>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
                  {canRaise ? (
                  <div
                    className="flex h-11 w-full rounded-md bg-paper-2 p-0.5 sm:w-auto"
                    role="group"
                    aria-label={`Status for ${issue.title}`}
                  >
                    {(["open", "monitoring", "resolved"] as IssueStatus[]).map(
                      (status) => {
                        const active = issue.status === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              setIssueStatus(issue.id, status);
                              toast(
                                status === "resolved"
                                  ? "Issue marked resolved"
                                  : `Issue set to ${ISSUE_STATUS_LABEL[status].toLowerCase()}`,
                              );
                            }}
                            className={cn(
                              "h-full min-h-10 flex-1 rounded-sm px-3 text-xs font-medium tracking-wide uppercase transition-colors duration-150 sm:flex-none",
                              active
                                ? "bg-ink text-paper"
                                : "text-muted hover:text-ink",
                            )}
                            aria-pressed={active}
                          >
                            {ISSUE_STATUS_LABEL[status]}
                          </button>
                        );
                      },
                    )}
                  </div>
                  ) : (
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">
                      {ISSUE_STATUS_LABEL[issue.status]}
                    </p>
                  )}
                  {canRaise ? (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-11 flex-1 text-xs sm:flex-none"
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
                      className="flex-1 sm:flex-none sm:w-auto"
                    />
                  </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RaiseIssueDialog
        open={raiseOpen}
        onOpenChange={(open) => {
          setRaiseOpen(open);
          if (!open) setEditing(null);
        }}
        issue={editing}
      />
    </div>
  );
}
