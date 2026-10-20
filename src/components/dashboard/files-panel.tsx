import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, File as FileIcon, Flag, Folder } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { HomeSearch } from "@/components/dashboard/home-search";
import { DataRoomAsk } from "@/components/dashboard/data-room-ask";
import { useRole } from "@/components/auth/role-provider";
import {
  assignRoomItem,
  listRoomReviewTree,
  setFileFlagged,
  type RoomReviewFile,
  type RoomReviewFolder,
} from "@/lib/data-room";
import { listProjectMembers, type ProjectMemberRow } from "@/lib/projects-db";
import { useDdStore, type FileFilter } from "@/lib/store";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { categoryFolderId } from "@/lib/workspace";
import { useProject } from "@/components/project/project-provider";

const FILTERS: { id: FileFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unreviewed", label: "Not reviewed" },
  { id: "reviewed", label: "Reviewed" },
];

const UNASSIGNED = "none";

type FolderNode = {
  id: string;
  name: string;
  assignedUserId: string | null;
  assignedUsername: string | null;
  folders: FolderNode[];
  files: RoomReviewFile[];
};

function fileMatches(file: RoomReviewFile, filter: FileFilter) {
  if (filter === "all") return true;
  if (filter === "reviewed") return file.reviewed;
  return !file.reviewed;
}

function filterNode(node: FolderNode, filter: FileFilter): FolderNode | null {
  const folders = node.folders
    .map((child) => filterNode(child, filter))
    .filter((child): child is FolderNode => child !== null);
  const files = node.files.filter((file) => fileMatches(file, filter));
  if (filter !== "all" && folders.length === 0 && files.length === 0) return null;
  return { ...node, folders, files };
}

function countFlagged(node: FolderNode): number {
  let n = 0;
  const walk = (item: FolderNode) => {
    for (const file of item.files) if (file.flagged) n += 1;
    for (const child of item.folders) walk(child);
  };
  walk(node);
  return n;
}

function countFiles(node: FolderNode): { reviewed: number; total: number } {
  let reviewed = 0;
  let total = 0;
  const walk = (n: FolderNode) => {
    for (const file of n.files) {
      total += 1;
      if (file.reviewed) reviewed += 1;
    }
    for (const child of n.folders) walk(child);
  };
  walk(node);
  return { reviewed, total };
}

function buildNode(
  id: string,
  name: string,
  byParent: Map<string | null, RoomReviewFolder[]>,
  filesByFolder: Map<string, RoomReviewFile[]>,
  self?: RoomReviewFolder,
): FolderNode {
  const folders = (byParent.get(id) ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((folder) =>
      buildNode(folder.id, folder.name, byParent, filesByFolder, folder),
    );
  const files = (filesByFolder.get(id) ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id,
    name,
    assignedUserId: self?.assignedUserId ?? null,
    assignedUsername: self?.assignedUsername ?? null,
    folders,
    files,
  };
}

export function FilesPanel() {
  const categories = useDdStore((s) => s.categories);
  const issues = useDdStore((s) => s.issues);
  const workspace = useDdStore((s) => s.workspace);
  const project = useProject();
  const { can } = useRole();
  const canAssign = can("assignFiles");
  const rawFilter = useDdStore((s) => s.fileFilter);
  const fileFilter: FileFilter =
    rawFilter === "reviewed" || rawFilter === "unreviewed" ? rawFilter : "all";
  const setFileFilter = useDdStore((s) => s.setFileFilter);
  const expanded = useDdStore((s) => s.expanded);
  const toggleCategory = useDdStore((s) => s.toggleCategory);

  const [folders, setFolders] = useState<RoomReviewFolder[]>([]);
  const [files, setFiles] = useState<RoomReviewFile[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listRoomReviewTree({ data: { projectId: project.id, workspace } })
      .then((tree) => {
        if (cancelled) return;
        setFolders(tree.folders);
        setFiles(tree.files);
      })
      .catch(() => {
        if (cancelled) return;
        setFolders([]);
        setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, project.id]);

  useEffect(() => {
    if (!canAssign) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    void listProjectMembers({ data: { projectId: project.id } })
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canAssign, project.id]);

  const groups = useMemo(() => {
    const byParent = new Map<string | null, RoomReviewFolder[]>();
    const byId = new Map<string, RoomReviewFolder>();
    for (const folder of folders) {
      const list = byParent.get(folder.parentId) ?? [];
      list.push(folder);
      byParent.set(folder.parentId, list);
      byId.set(folder.id, folder);
    }
    const filesByFolder = new Map<string, RoomReviewFile[]>();
    for (const file of files) {
      const list = filesByFolder.get(file.folderId) ?? [];
      list.push(file);
      filesByFolder.set(file.folderId, list);
    }

    return categories
      .map((cat) => {
        const folderId = categoryFolderId(workspace, cat.id, project.id);
        const raw = buildNode(
          folderId,
          cat.name,
          byParent,
          filesByFolder,
          byId.get(folderId),
        );
        const tree = filterNode(raw, fileFilter) ?? {
          ...raw,
          folders: [],
          files: [],
        };
        const progress = countFiles(fileFilter === "all" ? raw : tree);
        return {
          cat,
          tree,
          progress,
          allProgress: countFiles(raw),
          flaggedCount: countFlagged(raw),
        };
      })
      .filter((g) =>
        fileFilter === "all"
          ? true
          : g.tree.folders.length > 0 || g.tree.files.length > 0,
      );
  }, [categories, folders, files, fileFilter, workspace, project.id]);

  function applyAssignment(result: {
    assignedUserId: string | null;
    assignedUsername: string | null;
    fileIds: string[];
    folderIds: string[];
  }) {
    const fileSet = new Set(result.fileIds);
    const folderSet = new Set(result.folderIds);
    setFiles((rows) =>
      rows.map((file) =>
        fileSet.has(file.id)
          ? {
              ...file,
              assignedUserId: result.assignedUserId,
              assignedUsername: result.assignedUsername,
            }
          : file,
      ),
    );
    setFolders((rows) =>
      rows.map((folder) =>
        folderSet.has(folder.id)
          ? {
              ...folder,
              assignedUserId: result.assignedUserId,
              assignedUsername: result.assignedUsername,
            }
          : folder,
      ),
    );
  }

  return (
    <section id="files-reviewed" className="folia-enter folia-enter-2 min-w-0">
      <div className="mb-3 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Data room
        </p>
        <h2 className="font-display text-2xl leading-tight tracking-tight text-ink">
          Files reviewed
        </h2>
      </div>

      <HomeSearch />
      <DataRoomAsk />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFileFilter(f.id)}
            className={cn(
              "h-11 rounded-full px-3 text-xs font-medium transition-colors duration-150",
              fileFilter === f.id
                ? "bg-ink text-paper"
                : "bg-paper-2 text-muted hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {groups.length === 0 ? (
          <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted shadow-[var(--shadow-border)]">
            No files match that filter.
          </p>
        ) : (
          groups.map(({ cat, tree, progress, allProgress, flaggedCount }) => {
            const isOpen = expanded[cat.id] !== false;
            const notReviewed = allProgress.total - allProgress.reviewed;
            const relatedIssues = issues.filter(
              (i) => i.categoryId === cat.id && i.status !== "resolved",
            ).length;
            return (
              <CategoryCard
                key={cat.id}
                cat={cat}
                isOpen={isOpen}
                progress={progress}
                notReviewed={notReviewed}
                relatedIssues={relatedIssues}
                flaggedCount={flaggedCount}
                tree={tree}
                members={members}
                canAssign={canAssign}
                onToggle={() => toggleCategory(cat.id)}
                onFlagged={(id, flagged) =>
                  setFiles((rows) =>
                    rows.map((file) => (file.id === id ? { ...file, flagged } : file)),
                  )
                }
                onAssigned={applyAssignment}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function CategoryCard({
  cat,
  isOpen,
  progress,
  notReviewed,
  relatedIssues,
  flaggedCount,
  tree,
  members,
  canAssign,
  onToggle,
  onFlagged,
  onAssigned,
}: {
  cat: Category;
  isOpen: boolean;
  progress: { reviewed: number; total: number };
  notReviewed: number;
  relatedIssues: number;
  flaggedCount: number;
  tree: FolderNode;
  members: ProjectMemberRow[];
  canAssign: boolean;
  onToggle: () => void;
  onFlagged: (id: string, flagged: boolean) => void;
  onAssigned: (result: {
    assignedUserId: string | null;
    assignedUsername: string | null;
    fileIds: string[];
    folderIds: string[];
  }) => void;
}) {
  const pct =
    progress.total === 0
      ? 0
      : Math.round((progress.reviewed / progress.total) * 100);
  const empty = tree.folders.length === 0 && tree.files.length === 0;

  return (
    <article className="min-w-0 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full min-w-0 items-start gap-3 px-4 py-4 text-left sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-medium tracking-tight text-ink">
              {cat.name}
            </h3>
            {notReviewed > 0 ? (
              <Badge tone="muted">{notReviewed} not reviewed</Badge>
            ) : null}
            {flaggedCount > 0 ? (
              <Badge tone="danger">{flaggedCount} flagged</Badge>
            ) : null}
            {relatedIssues > 0 ? (
              <Badge tone="warn">
                {relatedIssues} {relatedIssues === 1 ? "issue" : "issues"}
              </Badge>
            ) : null}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2">
              <div
                className="h-full rounded-full bg-forest transition-[width] duration-200 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {progress.reviewed}/{progress.total}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-faint transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        empty ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted sm:px-5">
            No folders or files in this category yet.
          </p>
        ) : (
          <div className="border-t border-border">
            <TreeList
              node={tree}
              members={members}
              canAssign={canAssign}
              onFlagged={onFlagged}
              onAssigned={onAssigned}
            />
          </div>
        )
      ) : null}
    </article>
  );
}

function TreeList({
  node,
  members,
  canAssign,
  onFlagged,
  onAssigned,
}: {
  node: FolderNode;
  members: ProjectMemberRow[];
  canAssign: boolean;
  onFlagged: (id: string, flagged: boolean) => void;
  onAssigned: (result: {
    assignedUserId: string | null;
    assignedUsername: string | null;
    fileIds: string[];
    folderIds: string[];
  }) => void;
}) {
  return (
    <ul>
      {node.folders.map((folder) => (
        <FolderRow
          key={folder.id}
          node={folder}
          members={members}
          canAssign={canAssign}
          onFlagged={onFlagged}
          onAssigned={onAssigned}
        />
      ))}
      {node.files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          members={members}
          canAssign={canAssign}
          onFlagged={onFlagged}
          onAssigned={onAssigned}
        />
      ))}
    </ul>
  );
}

function FolderRow({
  node,
  members,
  canAssign,
  onFlagged,
  onAssigned,
}: {
  node: FolderNode;
  members: ProjectMemberRow[];
  canAssign: boolean;
  onFlagged: (id: string, flagged: boolean) => void;
  onAssigned: (result: {
    assignedUserId: string | null;
    assignedUsername: string | null;
    fileIds: string[];
    folderIds: string[];
  }) => void;
}) {
  const { slug } = useProject();
  const [open, setOpen] = useState(true);
  const nested = node.folders.length > 0 || node.files.length > 0;

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-2 pr-2 sm:flex-nowrap sm:pr-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-11 w-11 shrink-0 items-center justify-center text-faint"
          aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        <Link
          to="/p/$slug/data-room/$folderId"
          params={{ slug, folderId: node.id }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 pr-2"
        >
          <Folder className="size-4 shrink-0 text-forest" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {node.name}
          </span>
        </Link>
        <AssigneeControl
          kind="folder"
          id={node.id}
          name={node.name}
          assignedUserId={node.assignedUserId}
          assignedUsername={node.assignedUsername}
          members={members}
          canAssign={canAssign}
          onAssigned={onAssigned}
        />
      </div>
      {open && nested ? (
        <div className="border-t border-border bg-paper/40 pl-3 sm:pl-4">
          <TreeList
            node={node}
            members={members}
            canAssign={canAssign}
            onFlagged={onFlagged}
            onAssigned={onAssigned}
          />
        </div>
      ) : null}
    </li>
  );
}

function FileRow({
  file,
  members,
  canAssign,
  onFlagged,
  onAssigned,
}: {
  file: RoomReviewFile;
  members: ProjectMemberRow[];
  canAssign: boolean;
  onFlagged: (id: string, flagged: boolean) => void;
  onAssigned: (result: {
    assignedUserId: string | null;
    assignedUsername: string | null;
    fileIds: string[];
    folderIds: string[];
  }) => void;
}) {
  const { slug } = useProject();
  const { can } = useRole();
  const canFlag = can("markReviewed");
  const [busy, setBusy] = useState(false);

  async function toggleFlag(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canFlag || busy) return;
    const next = !file.flagged;
    onFlagged(file.id, next);
    setBusy(true);
    try {
      await setFileFlagged({ data: { id: file.id, flagged: next } });
    } catch (err) {
      onFlagged(file.id, file.flagged);
      toast(err instanceof Error ? err.message : "Could not update flag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={cn(
        "border-b border-border last:border-b-0",
        file.flagged && "bg-danger/12",
      )}
    >
      <div className="flex min-h-11 min-w-0 flex-wrap items-center sm:flex-nowrap">
        {canFlag ? (
          <button
            type="button"
            onClick={(event) => void toggleFlag(event)}
            disabled={busy}
            aria-pressed={file.flagged}
            aria-label={file.flagged ? `Unflag ${file.name}` : `Flag ${file.name}`}
            title={file.flagged ? "Remove flag" : "Flag this file"}
            className={cn(
              "flex w-11 shrink-0 items-center justify-center transition-colors duration-150 disabled:opacity-40",
              file.flagged ? "text-danger" : "text-faint hover:text-danger",
            )}
          >
            <Flag
              className="size-4"
              strokeWidth={1.75}
              fill={file.flagged ? "currentColor" : "none"}
            />
          </button>
        ) : file.flagged ? (
          <span className="flex w-11 shrink-0 items-center justify-center text-danger">
            <Flag className="size-4" strokeWidth={1.75} fill="currentColor" />
          </span>
        ) : (
          <span className="flex w-11 shrink-0 items-center justify-center text-muted">
            <FileIcon className="size-4" strokeWidth={1.75} />
          </span>
        )}
        <Link
          to="/p/$slug/data-room/$folderId"
          params={{ slug, folderId: file.folderId }}
          search={{ file: file.id }}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2"
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm text-ink">{file.name}</span>
              {file.flagged ? (
                <Flag
                  className="size-3.5 shrink-0 text-danger"
                  strokeWidth={2}
                  fill="currentColor"
                  aria-hidden
                />
              ) : null}
            </span>
            {file.reviewed && file.reviewedBy ? (
              <span className="block truncate text-xs text-muted">
                Reviewed by {file.reviewedBy}
              </span>
            ) : null}
          </span>
          <Badge tone={file.reviewed ? "ok" : "muted"}>
            {file.reviewed ? "Reviewed" : "Not reviewed"}
          </Badge>
        </Link>
        <div className="flex items-center pr-2 sm:pr-4">
          <AssigneeControl
            kind="file"
            id={file.id}
            name={file.name}
            assignedUserId={file.assignedUserId}
            assignedUsername={file.assignedUsername}
            members={members}
            canAssign={canAssign}
            onAssigned={onAssigned}
          />
        </div>
      </div>
    </li>
  );
}

function AssigneeControl({
  kind,
  id,
  name,
  assignedUserId,
  assignedUsername,
  members,
  canAssign,
  onAssigned,
}: {
  kind: "file" | "folder";
  id: string;
  name: string;
  assignedUserId: string | null;
  assignedUsername: string | null;
  members: ProjectMemberRow[];
  canAssign: boolean;
  onAssigned: (result: {
    assignedUserId: string | null;
    assignedUsername: string | null;
    fileIds: string[];
    folderIds: string[];
  }) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onChange(value: string) {
    const userId = value === UNASSIGNED ? null : value;
    setBusy(true);
    try {
      const result = await assignRoomItem({ data: { kind, id, userId } });
      onAssigned(result);
      toast(
        result.assignedUsername
          ? kind === "folder"
            ? `Folder assigned to ${result.assignedUsername}`
            : `Assigned to ${result.assignedUsername}`
          : kind === "folder"
            ? "Folder unassigned"
            : "Assignment removed",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not assign");
    } finally {
      setBusy(false);
    }
  }

  if (!canAssign) {
    if (!assignedUsername) return null;
    return (
      <span className="max-w-28 truncate px-1 text-xs text-muted" title={assignedUsername}>
        {assignedUsername}
      </span>
    );
  }

  const known = members.some((row) => row.userId === assignedUserId);

  return (
    <select
      aria-label={kind === "folder" ? `Assign folder ${name}` : `Assign ${name}`}
      value={assignedUserId ?? UNASSIGNED}
      disabled={busy}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => void onChange(event.target.value)}
      className="h-11 w-32 shrink-0 rounded-md bg-paper px-2 text-xs text-ink shadow-[var(--shadow-border)] sm:w-36"
    >
      <option value={UNASSIGNED}>Unassigned</option>
      {!known && assignedUserId ? (
        <option value={assignedUserId}>{assignedUsername || "Assigned"}</option>
      ) : null}
      {members.map((row) => (
        <option key={row.userId} value={row.userId}>
          {row.username}
        </option>
      ))}
    </select>
  );
}
