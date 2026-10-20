import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Download,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  House,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
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
  createFolder,
  ensureFolderPath,
  getFile,
  listFolder,
  listFolderOptions,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  moveFile,
  moveFolder,
  removeFile,
  removeFolder,
  searchFiles,
  setFileReviewed,
  type RoomFolderOption,
  type RoomListing,
  type RoomSearchHit,
} from "@/lib/data-room";
import { useDdStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { roomRoot } from "@/lib/workspace";
import { useRole } from "@/components/auth/role-provider";
import { RaiseIssueDialog } from "@/components/dashboard/raise-issue-dialog";
import { SpreadsheetPreview } from "@/components/data-room/spreadsheet-preview";
import {
  isSpreadsheetFile,
  parseSpreadsheet,
  type ExcelSheetPreview,
} from "@/lib/excel-preview";
import { fetchRoomFileBlob, fetchFolderZip, saveBlob, uploadRoomFile } from "@/lib/room-upload";
import { useProject } from "@/components/project/project-provider";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function documentIdFromPreviewFolder(folderId: string) {
  const asset = folderId.match(/(?:^|-)asset-req-(.+)$/);
  if (asset) return asset[1];
  const req = folderId.match(/(?:^|-)req-(.+)$/);
  if (req) return req[1];
  return null;
}

function FileGlyph({ mime, name }: { mime: string; name: string }) {
  const lower = `${mime} ${name}`.toLowerCase();
  if (lower.includes("sheet") || name.endsWith(".xlsx") || name.endsWith(".csv")) {
    return <FileSpreadsheet className="size-4 text-ok" strokeWidth={1.75} />;
  }
  if (lower.includes("pdf") || name.endsWith(".pdf")) {
    return <FileText className="size-4 text-danger" strokeWidth={1.75} />;
  }
  return <FileIcon className="size-4 text-muted" strokeWidth={1.75} />;
}

type MoveItem =
  | {
      kind: "file";
      id: string;
      name: string;
      currentFolderId: string;
    }
  | {
      kind: "folder";
      id: string;
      name: string;
      currentFolderId: string;
    };

type DeleteItem = { kind: "file" | "folder"; id: string; name: string };

function skipUploadName(name: string) {
  const base = name.split(/[/\\]/).pop() ?? name;
  if (base.startsWith(".")) return true;
  const lower = base.toLowerCase();
  return lower === "thumbs.db" || lower === "desktop.ini";
}

function directorySegments(file: File): string[] {
  const rel =
    "webkitRelativePath" in file ? String(file.webkitRelativePath || "") : "";
  const parts = (rel || file.name).split(/[/\\]/).filter(Boolean);
  if (parts.length <= 1) return [];
  parts.pop();
  return parts.map((part) => part.slice(0, 120)).filter(Boolean).slice(0, 12);
}

export function DataRoomBrowser({
  listing,
  focusFileId,
}: {
  listing: RoomListing;
  focusFileId?: string;
}) {
  const router = useRouter();
  const workspace = useDdStore((s) => s.workspace);
  const project = useProject();
  const { can } = useRole();
  const canReview = can("markReviewed");
  const canMove = can("moveFiles");
  const canDelete = can("deleteRoom");
  const canRaise = can("raiseIssues");
  const documents = useDdStore((s) => s.documents);
  const setDocumentStatus = useDdStore((s) => s.setDocumentStatus);
  const pruneRoomLinks = useDdStore((s) => s.pruneRoomLinks);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RoomSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState(listing);

  useEffect(() => {
    setView(listing);
  }, [listing]);
  const [preview, setPreview] = useState<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    folderId: string;
    reviewed: boolean;
    text?: string;
    sheets?: ExcelSheetPreview[];
  } | null>(null);
  const [moveItem, setMoveItem] = useState<MoveItem | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveOptions, setMoveOptions] = useState<RoomFolderOption[] | null>(null);
  const [deleteItem, setDeleteItem] = useState<DeleteItem | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [previewWide, setPreviewWide] = useState(false);

  const q = query.trim();
  const searchingRoom = q.length > 0;

  useEffect(() => {
    if (!q) {
      setHits(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      void searchFiles({ data: { query: q, projectId: project.id, workspace } })
        .then((rows) => {
          if (!cancelled) setHits(rows);
        })
        .catch((err) => {
          if (!cancelled) {
            toast(err instanceof Error ? err.message : "Search failed");
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, workspace, project.id]);

  async function refresh() {
    const next = await listFolder({ data: { folderId: view.folder.id } });
    setView(next);
    await router.invalidate();
    if (q) {
      const rows = await searchFiles({ data: { query: q, projectId: project.id, workspace } });
      setHits(rows);
    }
  }

  function patchReviewed(id: string, reviewed: boolean) {
    setView((cur) => ({
      ...cur,
      files: cur.files.map((f) => (f.id === id ? { ...f, reviewed } : f)),
    }));
    setHits((rows) =>
      rows ? rows.map((f) => (f.id === id ? { ...f, reviewed } : f)) : rows,
    );
    setPreview((cur) => (cur && cur.id === id ? { ...cur, reviewed } : cur));
  }

  async function toggleReviewed(id: string, currently: boolean) {
    const next = !currently;
    patchReviewed(id, next);
    setBusy(true);
    try {
      const result = await setFileReviewed({ data: { id, reviewed: next } });
      if (result.documentId) {
        setDocumentStatus(
          result.documentId,
          result.documentReviewed ? "reviewed" : "received",
        );
      }
      toast(next ? "Marked reviewed" : "Review cleared");
    } catch (err) {
      patchReviewed(id, currently);
      toast(err instanceof Error ? err.message : "Could not update review");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast(`${file.name} is over ${MAX_UPLOAD_LABEL}`);
          continue;
        }
        await uploadRoomFile({
          file,
          folderId: view.folder.id,
        });
      }
      toast("Uploaded to the data room");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onUploadFolder(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const cache = new Map<string, string>();
    let uploaded = 0;
    let skipped = 0;
    try {
      const files = Array.from(list).filter((file) => !skipUploadName(file.name));
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast(`${file.name} is over ${MAX_UPLOAD_LABEL}`);
          skipped += 1;
          continue;
        }
        const segments = directorySegments(file);
        let folderId = view.folder.id;
        if (segments.length > 0) {
          const key = segments.join("/").toLowerCase();
          const cached = cache.get(key);
          if (cached) {
            folderId = cached;
          } else {
            const created = await ensureFolderPath({
              data: { parentId: view.folder.id, segments },
            });
            folderId = created.id;
            cache.set(key, folderId);
          }
        }
        await uploadRoomFile({
          file,
          folderId,
        });
        uploaded += 1;
      }
      if (uploaded > 0) {
        toast(
          uploaded === 1
            ? "Folder uploaded to the data room"
            : `${uploaded} files uploaded from the folder`,
        );
      } else if (skipped > 0) {
        toast(`Nothing under ${MAX_UPLOAD_LABEL} to upload from that folder`);
      } else {
        toast("That folder had no files to upload");
      }
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Folder upload failed");
    } finally {
      setBusy(false);
      if (folderInput.current) folderInput.current.value = "";
    }
  }

  async function onCreateFolder(e: FormEvent) {
    e.preventDefault();
    if (!folderName.trim()) return;
    setBusy(true);
    try {
      await createFolder({
        data: { parentId: view.folder.id, name: folderName.trim() },
      });
      setFolderName("");
      setFolderOpen(false);
      toast("Folder created");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setBusy(false);
    }
  }

  async function openFile(id: string, folderId = view.folder.id) {
    setBusy(true);
    try {
      const file = await getFile({ data: { id } });
      const blob = await fetchRoomFileBlob(file.id);
      const url = URL.createObjectURL(blob);
      const isText =
        file.mimeType.startsWith("text/") || file.mimeType.includes("json");
      let sheets: ExcelSheetPreview[] | undefined;
      if (isSpreadsheetFile(file.name, file.mimeType)) {
        try {
          sheets = await parseSpreadsheet(await blob.arrayBuffer(), file.name);
        } catch {
          sheets = undefined;
        }
      }
      setPreview({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        url,
        folderId,
        reviewed: file.reviewed,
        text: isText && !sheets ? await blob.text() : undefined,
        sheets,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open file");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!focusFileId) return;
    void openFile(focusFileId);
  }, [focusFileId]);

  useEffect(() => {
    if (!moveItem) {
      setMoveOptions(null);
      setMoveTarget("");
      return;
    }
    let cancelled = false;
    setMoveOptions(null);
    setMoveTarget("");
    void listFolderOptions({ data: { projectId: project.id, workspace } })
      .then((rows) => {
        if (!cancelled) setMoveOptions(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          toast(err instanceof Error ? err.message : "Could not load folders");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [moveItem, workspace, project.id]);

  async function onRemove(id: string) {
    setDeleteItem({ kind: "file", id, name: preview?.name ?? "this file" });
  }

  async function confirmDelete() {
    if (!deleteItem) return;
    setBusy(true);
    try {
      if (deleteItem.kind === "folder") {
        const result = await removeFolder({ data: { id: deleteItem.id } });
        pruneRoomLinks([...result.fileIds, ...result.folderIds]);
        toast("Folder deleted");
      } else {
        const result = await removeFile({ data: { id: deleteItem.id } });
        pruneRoomLinks(result.fileIds);
        if (preview?.id === deleteItem.id) {
          if (preview.url) URL.revokeObjectURL(preview.url);
          setPreview(null);
        }
        toast("File deleted");
      }
      setDeleteItem(null);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  const destinations = (moveOptions ?? []).filter((folder) => {
    if (!moveItem) return false;
    if (moveItem.kind === "file") return true;
    if (folder.id === moveItem.id) return false;
    const byParent = new Map((moveOptions ?? []).map((f) => [f.id, f.parentId]));
    let cur: string | null = folder.id;
    const seen = new Set<string>();
    while (cur) {
      if (cur === moveItem.id) return false;
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = byParent.get(cur) ?? null;
    }
    return true;
  });

  async function onMove() {
    if (!moveItem || !moveTarget) return;
    setBusy(true);
    try {
      if (moveItem.kind === "file") {
        await moveFile({ data: { id: moveItem.id, folderId: moveTarget } });
      } else {
        await moveFolder({ data: { id: moveItem.id, parentId: moveTarget } });
      }
      setMoveItem(null);
      toast("Moved");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not move");
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadFolder(id: string, name: string) {
    setBusy(true);
    try {
      toast(`Preparing ${name}…`);
      const zip = await fetchFolderZip(id);
      saveBlob(zip.blob, zip.filename);
      toast(`Downloaded ${zip.filename}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not download folder");
    } finally {
      setBusy(false);
    }
  }

  const empty = view.folders.length === 0 && view.files.length === 0;
  const searchHits = hits ?? [];

  if (listing.folder.projectId !== project.id) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-muted">
        This folder is not in this project.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
        {view.crumbs.map((crumb, i) => {
          const last = i === view.crumbs.length - 1;
          const rootId = roomRoot(project.id, workspace);
          return (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-faint" /> : null}
              {last ? (
                <span className="truncate font-medium text-ink">{crumb.name}</span>
              ) : crumb.id === rootId ? (
                <Link
                  to="/p/$slug/data-room"
                  params={{ slug: project.slug }}
                  className="truncate hover:text-ink"
                >
                  {crumb.name}
                </Link>
              ) : (
                <Link
                  to="/p/$slug/data-room/$folderId"
                  params={{ slug: project.slug, folderId: crumb.id }}
                  className="truncate hover:text-ink"
                >
                  {crumb.name}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Data room
          </p>
          <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">
            {view.folder.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Files sit in the hosted database. Upload the client originals into the
            matching folder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onDownloadFolder(view.folder.id, view.folder.name)}
            disabled={busy}
          >
            <Download className="size-4" />
            Download folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFolderOpen(true)}
            disabled={busy}
          >
            <FolderPlus className="size-4" />
            New folder
          </Button>
          <Button
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            <Upload className="size-4" />
            Upload files
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => folderInput.current?.click()}
            disabled={busy}
          >
            <FolderUp className="size-4" />
            Upload folder
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void onUpload(e.target.files)}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            className="hidden"
            aria-label="Upload folder"
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(e) => void onUploadFolder(e.target.files)}
          />
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by filename"
          className="min-w-0 pl-10"
          aria-label="Search files by filename"
        />
      </div>

      <section className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        {searchingRoom ? (
          searching && hits === null ? (
            <p className="px-5 py-12 text-center text-sm text-muted">Searching…</p>
          ) : searchHits.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted">
              No files match that name.
            </p>
          ) : (
            <ul>
              {searchHits.map((file) => (
                <li
                  key={file.id}
                  className="flex items-stretch border-b border-border last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => void openFile(file.id, file.folderId)}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left sm:px-5"
                    disabled={busy}
                  >
                    <FileGlyph mime={file.mimeType} name={file.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{file.name}</span>
                      <span className="block truncate text-xs text-faint">
                        {file.folderName}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </button>
                  <ReviewButton
                    name={file.name}
                    reviewed={file.reviewed}
                    disabled={busy}
                    onClick={() => void toggleReviewed(file.id, file.reviewed)}
                  />
                  <MoveButton
                    label={`Move ${file.name}`}
                    disabled={busy}
                    onClick={() =>
                      setMoveItem({
                        kind: "file",
                        id: file.id,
                        name: file.name,
                        currentFolderId: file.folderId,
                      })
                    }
                  />
                  <DeleteRowButton
                    label={`Delete ${file.name}`}
                    disabled={busy}
                    onClick={() =>
                      setDeleteItem({ kind: "file", id: file.id, name: file.name })
                    }
                  />
                </li>
              ))}
            </ul>
          )
        ) : empty ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            This folder is empty. Upload a file or add a folder.
          </p>
        ) : (
          <ul>
            {view.folders.map((folder) => (
              <li
                key={folder.id}
                className="flex items-stretch border-b border-border last:border-b-0"
              >
                <Link
                  to="/p/$slug/data-room/$folderId"
                  params={{ slug: project.slug, folderId: folder.id }}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <Folder className="size-4 shrink-0 text-forest" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {folder.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {folder.fileCount} {folder.fileCount === 1 ? "file" : "files"}
                  </span>
                </Link>
                <DownloadRowButton
                  label={`Download ${folder.name}`}
                  disabled={busy}
                  onClick={() => void onDownloadFolder(folder.id, folder.name)}
                />
                <MoveButton
                  label={`Move ${folder.name}`}
                  disabled={busy}
                  onClick={() =>
                    setMoveItem({
                      kind: "folder",
                      id: folder.id,
                      name: folder.name,
                      currentFolderId: view.folder.id,
                    })
                  }
                />
                <DeleteRowButton
                  label={`Delete ${folder.name}`}
                  disabled={busy}
                  onClick={() =>
                    setDeleteItem({
                      kind: "folder",
                      id: folder.id,
                      name: folder.name,
                    })
                  }
                />
              </li>
            ))}
            {view.files.map((file) => (
              <li
                key={file.id}
                className="flex items-stretch border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => void openFile(file.id)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left sm:px-5"
                  disabled={busy}
                >
                  <FileGlyph mime={file.mimeType} name={file.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{file.name}</span>
                    <span className="block text-xs text-faint">{file.createdOn}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {formatBytes(file.sizeBytes)}
                  </span>
                </button>
                <ReviewButton
                  name={file.name}
                  reviewed={file.reviewed}
                  disabled={busy}
                  onClick={() => void toggleReviewed(file.id, file.reviewed)}
                />
                <MoveButton
                  label={`Move ${file.name}`}
                  disabled={busy}
                  onClick={() =>
                    setMoveItem({
                      kind: "file",
                      id: file.id,
                      name: file.name,
                      currentFolderId: view.folder.id,
                    })
                  }
                />
                <DeleteRowButton
                  label={`Delete ${file.name}`}
                  disabled={busy}
                  onClick={() =>
                    setDeleteItem({ kind: "file", id: file.id, name: file.name })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Create a folder in {view.folder.name}.
          </DialogDescription>
          <form className="mt-5 grid gap-4" onSubmit={onCreateFolder}>
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. Counsel opinions"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setFolderOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(moveItem)}
        onOpenChange={(open) => {
          if (!open) setMoveItem(null);
        }}
      >
        <DialogContent>
          {moveItem ? (
            <>
              <DialogTitle>Move {moveItem.kind}</DialogTitle>
              <DialogDescription>
                Choose a folder for {moveItem.name}.
              </DialogDescription>
              <div className="mt-5 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="move-destination">Destination</Label>
                  {moveOptions === null ? (
                    <p className="text-sm text-muted">Loading folders…</p>
                  ) : destinations.length === 0 ? (
                    <p className="text-sm text-muted">No other folders in this data room.</p>
                  ) : (
                    <select
                      id="move-destination"
                      aria-label="Destination folder"
                      className="h-11 w-full min-w-0 rounded-md bg-surface px-3 text-sm text-ink shadow-[var(--shadow-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value)}
                    >
                      <option value="">Select a folder</option>
                      {destinations.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.path}
                          {folder.id === moveItem.currentFolderId ? " (current)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setMoveItem(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void onMove()}
                    disabled={
                      busy ||
                      !moveTarget ||
                      moveTarget === moveItem.currentFolderId
                    }
                  >
                    Move
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) {
            if (preview?.url) URL.revokeObjectURL(preview.url);
            setPreview(null);
            setRaiseOpen(false);
            setPreviewWide(false);
          }
        }}
      >
        <DialogContent
          className={
            previewWide
              ? "top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none"
              : preview?.sheets
                ? "flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-5xl flex-col overflow-hidden"
                : undefined
          }
        >
          {preview ? (
            <>
              <DialogTitle>{preview.name}</DialogTitle>
              <DialogDescription>
                {preview.mimeType} · {formatBytes(preview.sizeBytes)}
              </DialogDescription>
              <div
                className={
                  previewWide
                    ? "mt-4 min-h-0 flex-1 overflow-hidden rounded-md bg-paper shadow-[var(--shadow-border)]"
                    : "mt-4 overflow-hidden rounded-md bg-paper shadow-[var(--shadow-border)]"
                }
              >
                {preview.sheets ? (
                  <SpreadsheetPreview sheets={preview.sheets} tall={previewWide} />
                ) : preview.mimeType.startsWith("image/") ? (
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className={
                      previewWide
                        ? "h-full w-full object-contain"
                        : "max-h-72 w-full object-contain"
                    }
                  />
                ) : preview.mimeType === "application/pdf" ? (
                  <iframe
                    title={preview.name}
                    src={preview.url}
                    className={
                      previewWide ? "h-full w-full bg-paper" : "h-72 w-full bg-paper"
                    }
                  />
                ) : preview.text ? (
                  <pre
                    className={
                      previewWide
                        ? "h-full overflow-auto p-3 text-xs text-ink"
                        : "max-h-72 overflow-auto p-3 text-xs text-ink"
                    }
                  >
                    {preview.text}
                  </pre>
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-muted">
                    Preview is not available for this type. Download the file to open it.
                  </p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPreviewWide((v) => !v)}
                  >
                    {previewWide ? (
                      <Minimize2 className="size-4" />
                    ) : (
                      <Maximize2 className="size-4" />
                    )}
                    {previewWide ? "Exit full screen" : "Full screen"}
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/p/$slug" params={{ slug: project.slug }}>
                      <House className="size-4" />
                      Back to home
                    </Link>
                  </Button>
                  {canRaise ? (
                    <Button
                      type="button"
                      onClick={() => setRaiseOpen(true)}
                    >
                      <Plus className="size-4" />
                      Raise an issue
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {canReview ? (
                  <Button
                    variant={preview.reviewed ? "secondary" : "outline"}
                    onClick={() => void toggleReviewed(preview.id, preview.reviewed)}
                    disabled={busy}
                  >
                    <Check className="size-4" />
                    {preview.reviewed ? "Reviewed" : "Mark reviewed"}
                  </Button>
                  ) : null}
                  {canDelete ? (
                  <Button
                    variant="ghost"
                    className="text-danger hover:bg-danger/10"
                    onClick={() => void onRemove(preview.id)}
                    disabled={busy}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                  ) : null}
                  {canMove ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setMoveItem({
                        kind: "file",
                        id: preview.id,
                        name: preview.name,
                        currentFolderId: preview.folderId,
                      })
                    }
                    disabled={busy}
                  >
                    <FolderInput className="size-4" />
                    Move
                  </Button>
                  ) : null}
                  <Button asChild>
                    <a href={preview.url} download={preview.name}>
                      <Download className="size-4" />
                      Download
                    </a>
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {preview && canRaise ? (
        <RaiseIssueDialog
          open={raiseOpen}
          onOpenChange={setRaiseOpen}
          presetFile={{
            id: preview.id,
            folderId: preview.folderId,
            name: preview.name,
          }}
          presetDocumentId={documentIdFromPreviewFolder(preview.folderId)}
          presetCategoryId={
            documents.find(
              (d) => d.id === documentIdFromPreviewFolder(preview.folderId),
            )?.categoryId
          }
        />
      ) : null}

      <Dialog
        open={Boolean(deleteItem)}
        onOpenChange={(open) => {
          if (!open) setDeleteItem(null);
        }}
      >
        <DialogContent>
          {deleteItem ? (
            <>
              <DialogTitle>
                Delete this {deleteItem.kind}?
              </DialogTitle>
              <DialogDescription>
                {deleteItem.kind === "folder"
                  ? `${deleteItem.name} and everything inside it will be removed from the data room. This cannot be undone.`
                  : `${deleteItem.name} will be removed from the data room. This cannot be undone.`}
              </DialogDescription>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void confirmDelete()}
                >
                  Delete
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewButton({
  name,
  reviewed,
  disabled,
  onClick,
}: {
  name: string;
  reviewed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { can } = useRole();
  if (!can("markReviewed")) return null;
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-12 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors duration-150 disabled:opacity-40",
        reviewed ? "text-ok" : "text-muted hover:text-ink",
      )}
      aria-pressed={reviewed}
      aria-label={reviewed ? `Unmark ${name} as reviewed` : `Mark ${name} as reviewed`}
      title={reviewed ? "Reviewed — click to clear" : "Mark reviewed"}
      disabled={disabled}
      onClick={onClick}
    >
      <Check className="size-4" strokeWidth={1.75} />
      <span className="hidden sm:inline">{reviewed ? "Reviewed" : "Review"}</span>
    </button>
  );
}

function DownloadRowButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-12 w-11 shrink-0 items-center justify-center text-muted transition-colors duration-150 hover:text-ink disabled:opacity-40"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Download className="size-4" strokeWidth={1.75} />
    </button>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { can } = useRole();
  if (!can("moveFiles")) return null;
  return (
    <button
      type="button"
      className="flex min-h-12 w-11 shrink-0 items-center justify-center text-muted transition-colors duration-150 hover:text-ink disabled:opacity-40"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <FolderInput className="size-4" strokeWidth={1.75} />
    </button>
  );
}

function DeleteRowButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { can } = useRole();
  if (!can("deleteRoom")) return null;
  return (
    <button
      type="button"
      className="flex min-h-12 w-11 shrink-0 items-center justify-center text-muted transition-colors duration-150 hover:text-danger disabled:opacity-40"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 className="size-4" strokeWidth={1.75} />
    </button>
  );
}
