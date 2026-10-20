import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FileText, Search } from "lucide-react";
import { searchFiles, type RoomSearchHit } from "@/lib/data-room";
import { useDdStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { useRole } from "@/components/auth/role-provider";
import { useProject } from "@/components/project/project-provider";

export function HomeSearch() {
  const workspace = useDdStore((s) => s.workspace);
  const { slug, id: projectId } = useProject();
  const { can } = useRole();
  const showIssues = can("viewIssues");
  const issues = useDdStore((s) => s.issues);
  const documents = useDdStore((s) => s.documents);
  const categories = useDdStore((s) => s.categories);
  const search = useDdStore((s) => s.search);
  const setSearch = useDdStore((s) => s.setSearch);
  const setFocusedIssueId = useDdStore((s) => s.setFocusedIssueId);

  const [hits, setHits] = useState<RoomSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const q = search.trim();
  const qLower = q.toLowerCase();

  useEffect(() => {
    if (!q) {
      setHits(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      void searchFiles({ data: { query: q, projectId, workspace } })
        .then((rows) => {
          if (!cancelled) setHits(rows);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, workspace, projectId]);

  useEffect(() => {
    if (!q) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setSearch("");
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearch("");
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [q, setSearch]);

  const issueHits = useMemo(() => {
    if (!qLower || !showIssues) return [];
    return issues.filter((issue) => {
      if (issue.status === "resolved") return false;
      const doc = documents.find((d) => d.id === issue.documentId);
      const cat = categories.find((c) => c.id === issue.categoryId);
      const hay =
        `${issue.title} ${issue.summary} ${issue.codeSection ?? ""} ${issue.roomFileName ?? ""} ${doc?.name ?? ""} ${cat?.name ?? ""}`.toLowerCase();
      return hay.includes(qLower);
    });
  }, [qLower, issues, documents, categories, showIssues]);

  const fileHits = hits ?? [];
  const showResults = q.length > 0;
  const empty =
    showResults && !searching && fileHits.length === 0 && issueHits.length === 0;

  return (
    <div className="relative mb-3" ref={rootRef}>
      <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-faint" />
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setFocusedIssueId(null);
        }}
        placeholder={
          showIssues
            ? "Search the data room and open issues"
            : "Search the data room"
        }
        className="min-w-0 pl-10"
        aria-label={
          showIssues
            ? "Search the data room and open issues"
            : "Search the data room"
        }
        autoComplete="off"
      />
      {showResults ? (
        <div
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl bg-surface shadow-[var(--shadow-border)]"
          role="listbox"
          aria-label="Search results"
        >
          {searching && hits === null ? (
            <p className="px-4 py-6 text-sm text-muted">Searching…</p>
          ) : empty ? (
            <p className="px-4 py-6 text-sm text-muted">
              No matching data-room files or open issues.
            </p>
          ) : (
            <div>
              {fileHits.length > 0 ? (
                <div>
                  <p className="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                    Data room
                  </p>
                  <ul>
                    {fileHits.slice(0, 8).map((file) => (
                      <li key={file.id}>
                        <Link
                          to="/p/$slug/data-room/$folderId"
                          params={{ slug, folderId: file.folderId }}
                          search={{ file: file.id }}
                          className="flex min-h-11 items-center gap-3 px-4 py-2.5 hover:bg-paper-2"
                          onClick={() => setSearch("")}
                        >
                          <FileText
                            className="size-4 shrink-0 text-muted"
                            strokeWidth={1.75}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">
                              {file.name}
                            </span>
                            <span className="block truncate text-xs text-faint">
                              {file.folderName}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {issueHits.length > 0 ? (
                <div>
                  <p className="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                    Open issues
                  </p>
                  <ul>
                    {issueHits.slice(0, 8).map((issue) => {
                      const cat = categories.find((c) => c.id === issue.categoryId);
                      return (
                        <li key={issue.id}>
                          <button
                            type="button"
                            className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-2"
                            onClick={() => {
                              setFocusedIssueId(issue.id);
                              setSearch("");
                              window.requestAnimationFrame(() => {
                                document
                                  .getElementById("issues-panel")
                                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
                              });
                            }}
                          >
                            <AlertTriangle
                              className="size-4 shrink-0 text-danger"
                              strokeWidth={1.75}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-ink">
                                {issue.title}
                              </span>
                              <span className="block truncate text-xs text-faint">
                                {cat?.name}
                                {issue.codeSection ? ` · ${issue.codeSection}` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
