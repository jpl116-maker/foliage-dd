import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, ClipboardList, FolderOpen, ListChecks, ScanSearch } from "lucide-react";
import { listRoomStats } from "@/lib/data-room";
import { daysUntil } from "@/lib/status";
import { useDdStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRole } from "@/components/auth/role-provider";
import { useProject } from "@/components/project/project-provider";

export function StatsRow({ showReviewed }: { showReviewed?: boolean }) {
  const matter = useDdStore((s) => s.matter);
  const documents = useDdStore((s) => s.documents);
  const issues = useDdStore((s) => s.issues);
  const requests = useDdStore((s) => s.requests);
  const tests = useDdStore((s) => s.tests) ?? [];
  const workspace = useDdStore((s) => s.workspace);
  const project = useProject();
  const [roomStats, setRoomStats] = useState<{ files: number; reviewed: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRoomStats(null);
    void listRoomStats({ data: { projectId: project.id, workspace } })
      .then((s) => {
        if (!cancelled) setRoomStats({ files: s.files, reviewed: s.reviewed });
      })
      .catch(() => {
        if (!cancelled) setRoomStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, project.id]);

  const requestedCount = (requests ?? []).length;
  const openRequested = (requests ?? []).filter((r) => r.status === "open").length;
  const partialRequested = (requests ?? []).filter((r) => r.status === "partial").length;
  const closedRequested = (requests ?? []).filter((r) => r.status === "closed").length;
  const testCount = tests.length;
  const testsFailed = tests.filter((t) => t.status === "fail").length;
  const testsOpen = tests.filter((t) => t.status === "open").length;
  const testsPassed = tests.filter((t) => t.status === "pass").length;
  const requested = documents.filter((d) => d.status !== "not_applicable");
  const received = requested.filter((d) => d.status !== "not_received");
  const openIssues = issues.filter((i) => i.status !== "resolved");
  const critical = openIssues.filter((i) => i.severity === "critical").length;
  const remaining = daysUntil(matter.dueOn);
  const { can } = useRole();

  const reviewTotal = roomStats?.files ?? 0;
  const reviewDone = roomStats?.reviewed ?? 0;
  const reviewPct =
    reviewTotal === 0 ? 0 : Math.round((reviewDone / reviewTotal) * 100);

  const items = (
    [
      {
        label: "Request list",
        value: requestedCount === 1 ? "1 item" : `${requestedCount} items`,
        hint:
          requestedCount === 0
            ? "No files requested"
            : `${openRequested} open · ${partialRequested} partial · ${closedRequested} closed`,
        icon: ClipboardList,
        href: "/p/$slug/request-list" as const,
      },
      {
        label: "REIT Tests",
        value: String(testCount),
        hint:
          testsFailed > 0
            ? `${testsFailed} failed`
            : testsOpen > 0
              ? `${testsOpen} open`
              : testCount === 0
                ? "No tests yet"
                : `${testsPassed} passing`,
        icon: ListChecks,
        href: "/p/$slug/reit-tests" as const,
        alert: testsFailed > 0,
      },
      {
        label: "Open issues",
        value: String(openIssues.length),
        hint:
          critical > 0
            ? `${critical} critical`
            : openIssues.length === 0
              ? "None outstanding"
              : "None critical",
        icon: AlertTriangle,
        href: "/p/$slug/issues" as const,
        alert: critical > 0,
      },
      {
        label: "Data room",
        value: roomStats === null ? `${received.length}` : String(roomStats.files),
        hint: "Open folders and files",
        icon: FolderOpen,
        href: "/p/$slug/data-room" as const,
      },
      {
        label: "Reviewed",
        value: roomStats === null ? "—" : `${reviewDone}/${reviewTotal}`,
        hint:
          roomStats === null
            ? "Counting files"
            : reviewTotal === 0
              ? "No files in the data room"
              : `${reviewPct}% of files in the data room`,
        icon: ScanSearch,
        href: undefined,
      },
      {
        label: "Days remaining",
        value: remaining < 0 ? `${Math.abs(remaining)}` : String(remaining),
        hint: remaining < 0 ? "Past the due date" : "Until the due date",
        icon: CalendarClock,
        href: undefined,
      },
    ] as const
  ).filter((item) => {
    if (item.label === "REIT Tests") return can("viewTests");
    if (item.label === "Open issues") return can("viewIssues");
    if (item.label === "Reviewed") return showReviewed ?? can("viewReviewStatus");
    return true;
  });

  return (
    <section className="folia-enter grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => {
        const inner = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {item.label}
              </p>
              <item.icon
                className={"alert" in item && item.alert ? "size-4 text-danger" : "size-4 text-faint"}
                strokeWidth={1.75}
              />
            </div>
            <p className="mt-2 font-display text-3xl leading-none tracking-tight tabular-nums text-ink">
              {item.value}
            </p>
            <p className="mt-2 text-xs text-muted">{item.hint}</p>
          </>
        );
        const className = cn(
          "min-w-0 rounded-xl bg-surface px-4 py-4 text-left shadow-[var(--shadow-border)]",
          item.href &&
            "transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]",
        );
        if (item.href) {
          return (
            <Link
              key={item.label}
              to={item.href}
              params={{ slug: project.slug }}
              className={className}
            >
              {inner}
            </Link>
          );
        }
        return (
          <article key={item.label} className={className}>
            {inner}
          </article>
        );
      })}
    </section>
  );
}
