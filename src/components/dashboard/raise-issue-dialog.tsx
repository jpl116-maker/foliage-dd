import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FileText, Folder, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  listFolderOptions,
  listRoomFiles,
  type RoomFileOption,
  type RoomFolderOption,
} from "@/lib/data-room";
import { documentIdFromRoomFile, seedRoomFileId } from "@/lib/issue-file";
import { useDdStore } from "@/lib/store";
import {
  ISSUE_SEVERITIES,
  SEVERITY_LABEL,
  type CategoryId,
  type Issue,
  type IssueSeverity,
} from "@/lib/types";
import { requestFolderId } from "@/lib/workspace";
import { useProject } from "@/components/project/project-provider";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { emailToUsername } from "@/lib/folia-username";

type RoomLink =
  | { kind: "file"; id: string; folderId: string; name: string; path: string }
  | { kind: "folder"; id: string; name: string; path: string };

export function RaiseIssueDialog({
  open,
  onOpenChange,
  presetDocumentId = null,
  presetCategoryId,
  presetFile = null,
  issue = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetDocumentId?: string | null;
  presetCategoryId?: CategoryId;
  presetFile?: { id: string; folderId: string; name: string } | null;
  issue?: Issue | null;
}) {
  const categories = useDdStore((s) => s.categories);
  const workspace = useDdStore((s) => s.workspace);
  const project = useProject();
  const user = useCurrentUser();
  const addIssue = useDdStore((s) => s.addIssue);
  const updateIssue = useDdStore((s) => s.updateIssue);
  const editing = Boolean(issue);

  const fallbackCategory =
    (issue?.categoryId && categories.some((c) => c.id === issue.categoryId)
      ? issue.categoryId
      : null) ??
    (presetCategoryId && categories.some((c) => c.id === presetCategoryId)
      ? presetCategoryId
      : (categories.find((c) => c.id === "federal")?.id ?? categories[0]?.id ?? ""));

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [categoryId, setCategoryId] = useState<CategoryId>(fallbackCategory);
  const [link, setLink] = useState<RoomLink | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [codeSection, setCodeSection] = useState("");
  const [files, setFiles] = useState<RoomFileOption[] | null>(null);
  const [folders, setFolders] = useState<RoomFolderOption[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(issue?.title ?? "");
    setSummary(issue?.summary ?? "");
    setSeverity(issue?.severity ?? "medium");
    setCategoryId(fallbackCategory);
    setCodeSection(issue?.codeSection ?? "");
    setLink(null);
    setFileQuery("");
    let cancelled = false;
    setFiles(null);
    setFolders(null);
    void Promise.all([
      listRoomFiles({ data: { projectId: project.id, workspace } }),
      listFolderOptions({ data: { projectId: project.id, workspace } }),
    ])
      .then(([fileRows, folderRows]) => {
        if (cancelled) return;
        setFiles(fileRows);
        setFolders(folderRows);
        setLink(
          resolveLink(
            issue,
            presetDocumentId,
            presetFile,
            workspace,
            project.id,
            fileRows,
            folderRows,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
          setFolders([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // fallbackCategory is derived from issue/presets for this open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, issue, workspace, project.id, presetDocumentId, presetFile?.id]);

  const folderHits = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return [];
    return (folders ?? [])
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [folders, fileQuery]);

  const fileHits = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return [];
    return (files ?? [])
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [files, fileQuery]);

  const searching = fileQuery.trim().length > 0;
  const loadingRoom = files === null || folders === null;
  const noHits = searching && !loadingRoom && folderHits.length === 0 && fileHits.length === 0;

  function payload() {
    return {
      title: title.trim(),
      summary: summary.trim(),
      severity,
      categoryId,
      documentId:
        link?.kind === "file"
          ? documentIdFromRoomFile(link.id, workspace)
          : editing
            ? null
            : (presetDocumentId ?? null),
      codeSection: codeSection.trim() || undefined,
      roomFileId: link?.kind === "file" ? link.id : null,
      roomFolderId: link ? (link.kind === "file" ? link.folderId : link.id) : null,
      roomFileName: link?.name ?? null,
    };
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) {
      toast("Title and summary are required");
      return;
    }
    if (issue) {
      updateIssue(issue.id, payload());
      toast("Issue updated");
    } else {
      addIssue({
        ...payload(),
        raisedBy:
          emailToUsername(user?.primaryEmail) || user?.displayName || "You",
      });
      toast("Issue raised");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-3 max-h-[calc(100dvh-1.5rem)] translate-y-0 sm:top-1/2 sm:max-h-[90dvh] sm:-translate-y-1/2">
        <DialogTitle>{editing ? "Edit issue" : "Raise an issue"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the finding and the linked data-room file or folder."
            : "Flag a finding from due diligence and link the data-room file or folder where you saw it."}
        </DialogDescription>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Related-party rent from TRS parking"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-summary">Summary</Label>
            <Textarea
              id="issue-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What you saw, why it matters, what to do next."
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as IssueSeverity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issue-code">Code section</Label>
              <Input
                id="issue-code"
                value={codeSection}
                onChange={(e) => setCodeSection(e.target.value)}
                placeholder="IRC § 856(c)"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => setCategoryId(v as CategoryId)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-file-search">Found in (data room)</Label>
            {link ? (
              <div className="flex min-h-11 items-center gap-2 rounded-md bg-paper px-3 py-2 shadow-[var(--shadow-border)]">
                {link.kind === "folder" ? (
                  <Folder className="size-4 shrink-0 text-forest" strokeWidth={1.75} />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{link.name}</span>
                  <span className="block truncate text-xs text-faint">
                    {link.kind === "folder" ? "Folder" : parentPath(link.path, link.name)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setLink(null)}
                >
                  <X className="size-4" />
                  Clear
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted">
                No file or folder linked yet. Search to attach one.
              </p>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-faint" />
              <Input
                id="issue-file-search"
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                  if (e.key === "Escape") setFileQuery("");
                }}
                placeholder="Search files and folders"
                className="min-w-0 pl-10"
                autoComplete="off"
              />
            </div>
            {searching ? (
              loadingRoom ? (
                <p className="px-1 text-sm text-muted">Loading data room…</p>
              ) : noHits ? (
                <p className="rounded-xl bg-paper px-4 py-6 text-center text-sm text-muted shadow-[var(--shadow-border)]">
                  No files or folders match that search.
                </p>
              ) : (
                <div
                  className="max-h-56 overflow-auto rounded-xl bg-paper shadow-[var(--shadow-border)]"
                  role="listbox"
                  aria-label="Matching data-room items"
                >
                  {folderHits.length > 0 ? (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                        Folders
                      </p>
                      <ul>
                        {folderHits.map((folder) => (
                          <li key={`dir-${folder.id}`}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={
                                link?.kind === "folder" && link.id === folder.id
                              }
                              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-2"
                              onClick={() => {
                                setLink({
                                  kind: "folder",
                                  id: folder.id,
                                  name: folder.name,
                                  path: folder.path,
                                });
                                setFileQuery("");
                              }}
                            >
                              <Folder
                                className="size-4 shrink-0 text-forest"
                                strokeWidth={1.75}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-ink">
                                  {folder.name}
                                </span>
                                <span className="block truncate text-xs text-faint">
                                  {folder.path}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {fileHits.length > 0 ? (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                        Files
                      </p>
                      <ul>
                        {fileHits.map((file) => (
                          <li key={`file-${file.id}`}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={
                                link?.kind === "file" && link.id === file.id
                              }
                              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-2"
                              onClick={() => {
                                setLink({
                                  kind: "file",
                                  id: file.id,
                                  folderId: file.folderId,
                                  name: file.name,
                                  path: file.path,
                                });
                                setFileQuery("");
                              }}
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
                                  {parentPath(file.path, file.name)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save" : "Raise issue"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function parentPath(path: string, name: string) {
  const suffix = ` / ${name}`;
  if (path.endsWith(suffix)) return path.slice(0, -suffix.length);
  return path;
}

function resolveLink(
  issue: Issue | null,
  presetDocumentId: string | null,
  presetFile: { id: string; folderId: string; name: string } | null,
  workspace: Parameters<typeof seedRoomFileId>[0],
  projectId: string,
  files: RoomFileOption[],
  folders: RoomFolderOption[],
): RoomLink | null {
  if (issue?.roomFileId) {
    const file = files.find((f) => f.id === issue.roomFileId);
    if (file) {
      return {
        kind: "file",
        id: file.id,
        folderId: file.folderId,
        name: file.name,
        path: file.path,
      };
    }
  }
  if (issue?.roomFolderId && !issue.roomFileId) {
    const folder = folders.find((f) => f.id === issue.roomFolderId);
    if (folder) {
      return {
        kind: "folder",
        id: folder.id,
        name: folder.name,
        path: folder.path,
      };
    }
    return {
      kind: "folder",
      id: issue.roomFolderId,
      name: issue.roomFileName || "Linked folder",
      path: issue.roomFileName || "Linked folder",
    };
  }
  if (!issue && presetFile) {
    const file = files.find((f) => f.id === presetFile.id);
    if (file) {
      return {
        kind: "file",
        id: file.id,
        folderId: file.folderId,
        name: file.name,
        path: file.path,
      };
    }
    return {
      kind: "file",
      id: presetFile.id,
      folderId: presetFile.folderId,
      name: presetFile.name,
      path: presetFile.name,
    };
  }
  const docId = issue?.documentId ?? presetDocumentId;
  if (docId) {
    const seedId = seedRoomFileId(workspace, docId, projectId);
    const file = files.find((f) => f.id === seedId);
    if (file) {
      return {
        kind: "file",
        id: file.id,
        folderId: file.folderId,
        name: file.name,
        path: file.path,
      };
    }
    const reqId = requestFolderId(workspace, docId, projectId);
    const folder = folders.find((f) => f.id === reqId);
    if (folder) {
      return {
        kind: "folder",
        id: folder.id,
        name: folder.name,
        path: folder.path,
      };
    }
  }
  return null;
}
