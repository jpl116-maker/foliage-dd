import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDot, XCircle } from "lucide-react";
import { useDdStore } from "@/lib/store";
import {
  REIT_TEST_STATUS_LABEL,
  type ReitTestStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { id: "all" | ReitTestStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pass", label: "Pass" },
  { id: "fail", label: "Fail" },
  { id: "open", label: "Open" },
];

const STATUS_BTN: Record<ReitTestStatus, { idle: string; active: string }> = {
  pass: {
    idle: "bg-ok/10 text-ok hover:bg-ok/15",
    active: "bg-ok text-paper",
  },
  fail: {
    idle: "bg-danger/10 text-danger hover:bg-danger/15",
    active: "bg-danger text-paper",
  },
  open: {
    idle: "bg-caution/15 text-caution hover:bg-caution/20",
    active: "bg-caution text-paper",
  },
};

const STATUS_ICON: Record<
  ReitTestStatus,
  { Icon: typeof CheckCircle2; className: string }
> = {
  pass: { Icon: CheckCircle2, className: "text-ok" },
  fail: { Icon: XCircle, className: "text-danger" },
  open: { Icon: CircleDot, className: "text-caution" },
};

export function ReitTestsPanel() {
  const tests = useDdStore((s) => s.tests) ?? [];
  const workspace = useDdStore((s) => s.workspace);
  const setTestStatus = useDdStore((s) => s.setTestStatus);
  const [filter, setFilter] = useState<"all" | ReitTestStatus>("all");

  useEffect(() => {
    setFilter("all");
  }, [workspace]);

  const visible = useMemo(
    () => (filter === "all" ? tests : tests.filter((t) => t.status === filter)),
    [filter, tests],
  );

  const passed = tests.filter((t) => t.status === "pass").length;
  const failed = tests.filter((t) => t.status === "fail").length;
  const open = tests.filter((t) => t.status === "open").length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          REIT Tests
        </p>
        <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">
          {tests.length} {tests.length === 1 ? "test" : "tests"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {passed} pass
          <span className="text-faint"> · </span>
          {failed} fail
          <span className="text-faint"> · </span>
          {open} open
        </p>
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
          No tests match that filter.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          {visible.map((test) => {
            const { Icon, className } = STATUS_ICON[test.status];
            return (
              <li
                key={test.id}
                className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:px-5"
              >
                <Icon
                  className={cn("mt-0.5 size-6 shrink-0", className)}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{test.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {test.detail}
                  </p>
                  {test.codeSection ? (
                    <p className="mt-1 font-mono text-xs text-faint">
                      {test.codeSection}
                    </p>
                  ) : null}
                </div>
                <div
                  className="flex h-11 w-full shrink-0 rounded-md bg-paper-2 p-0.5 sm:w-auto"
                  role="group"
                  aria-label={`Status for ${test.name}`}
                >
                  {(["pass", "fail", "open"] as const).map((status) => {
                    const active = test.status === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setTestStatus(test.id, status)}
                        className={cn(
                          "h-full min-h-10 flex-1 rounded-sm px-3 text-xs font-medium tracking-wide uppercase transition-colors duration-150 sm:flex-none",
                          active
                            ? STATUS_BTN[status].active
                            : STATUS_BTN[status].idle,
                        )}
                        aria-pressed={active}
                      >
                        {REIT_TEST_STATUS_LABEL[status]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
