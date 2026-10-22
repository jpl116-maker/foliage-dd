import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileSpreadsheet, FileText, Folder, FolderUp, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RequestListEditor } from "@/components/dashboard/request-list-editor";
import { CloneRequestListButton } from "@/components/dashboard/clone-request-list";
import { useRole } from "@/components/auth/role-provider";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  ensureCategoryFolders,
  ensureFolderPath,
  ensureRequestFolders,
  listFolderOptions,
  listRoomFiles,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  type RoomFileOption,
  type RoomFolderOption,
} from "@/lib/data-room";
import { uploadRoomFile } from "@/lib/room-upload";
import { requestDetailFor } from "@/lib/request-details";
import { formatStamp } from "@/lib/status";
import { useDdStore } from "@/lib/store";
import {
  REQUEST_STATUS_LABEL,
  type RequestItem,
  type RequestLinkedFile,
  type RequestStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { requestFolderId, type WorkspaceId } from "@/lib/workspace";
import { useProject } from "@/components/project/project-provider";

const FILTERS: { id: "all" | RequestStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "partial", label: "Partial" },
  { id: "closed", label: "Closed" },
];

const STATUS_BTN: Record<
  RequestStatus,
  { idle: string; active: string }
> = {
  open: {
    idle: "bg-danger/10 text-danger hover:bg-danger/15",
    active: "bg-danger text-paper",
  },
  partial: {
    idle: "bg-caution/15 text-caution hover:bg-caution/20",
    active: "bg-caution text-paper",
  },
  closed: {
    idle: "bg-ok/10 text-ok hover:bg-ok/15",
    active: "bg-ok text-paper",
  },
};

type XlsxCell = { v?: string; t?: string; s?: Record<string, unknown> };
type XlsxSheet = Record<string, unknown> & {
  "!cols"?: { wch: number }[];
  "!rows"?: ({ hpt: number } | null)[];
  "!ref"?: string;
  "!autofilter"?: { ref: string };
};

type XlsxBook = {
  utils: {
    aoa_to_sheet: (rows: string[][]) => XlsxSheet;
    book_new: () => object;
    book_append_sheet: (book: object, sheet: object, name: string) => void;
    encode_cell: (cell: { r: number; c: number }) => string;
    encode_range: (range: { s: { r: number; c: number }; e: { r: number; c: number } }) => string;
  };
  writeFile: (book: object, filename: string) => void;
};

const THIN = { style: "thin", color: { rgb: "D9D9D9" } };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 },
  fill: { patternType: "solid", fgColor: { rgb: "1F4E79" } },
  alignment: { vertical: "center", horizontal: "left", wrapText: true },
  border: BORDER,
};

const BODY_STYLE = {
  font: { name: "Calibri", sz: 11, color: { rgb: "1A1D24" } },
  fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
  alignment: { vertical: "top", wrapText: true },
  border: BORDER,
};

const STATUS_STYLE: Record<string, Record<string, unknown>> = {
  Open: {
    font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "9C1B1B" } },
    fill: { patternType: "solid", fgColor: { rgb: "F4CCCC" } },
    alignment: { vertical: "center", horizontal: "center" },
    border: BORDER,
  },
  Partial: {
    font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "7A5800" } },
    fill: { patternType: "solid", fgColor: { rgb: "FFF2CC" } },
    alignment: { vertical: "center", horizontal: "center" },
    border: BORDER,
  },
  Closed: {
    font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "1E5C38" } },
    fill: { patternType: "solid", fgColor: { rgb: "D9EAD3" } },
    alignment: { vertical: "center", horizontal: "center" },
    border: BORDER,
  },
};

const STATUS_COLUMN = 3;

async function loadXlsx(): Promise<XlsxBook> {
  const mod = (await import("xlsx-js-style")) as { default?: XlsxBook } & Partial<XlsxBook>;
  const candidate: Partial<XlsxBook> | undefined = mod.writeFile ? mod : mod.default;
  if (!candidate?.utils?.encode_cell || !candidate.writeFile) {
    throw new Error("Excel export is unavailable");
  }
  return candidate as XlsxBook;
}

function styleRequestSheet(xlsx: XlsxBook, rows: string[][]): XlsxSheet {
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  const lastRow = Math.max(rows.length - 1, 0);
  const lastCol = 5;
  for (let r = 0; r <= lastRow; r++) {
    for (let c = 0; c <= lastCol; c++) {
      const ref = xlsx.utils.encode_cell({ r, c });
      const cell = sheet[ref] as XlsxCell | undefined;
      if (!cell) continue;
      if (r === 0) cell.s = HEADER_STYLE;
      else if (c === STATUS_COLUMN) cell.s = STATUS_STYLE[String(cell.v)] ?? BODY_STYLE;
      else cell.s = BODY_STYLE;
    }
  }
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 42 },
    { wch: 64 },
    { wch: 14 },
    { wch: 36 },
    { wch: 48 },
  ];
  sheet["!rows"] = rows.map((row, index) => {
    const lines = row.reduce(
      (max, value) => Math.max(max, String(value).split("\n").length),
      1,
    );
    return { hpt: index === 0 ? 22 : Math.min(90, Math.max(18, lines * 15)) };
  });
  sheet["!autofilter"] = {
    ref: xlsx.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: lastRow, c: lastCol },
    }),
  };
  return sheet;
}

function requestExportRows(
  categories: { id: string; name: string }[],
  requests: RequestItem[],
): string[][] {
  const header = ["Category", "Item", "Detail", "Status", "Linked files", "Comments"];
  const body: string[][] = [];
  const seen = new Set<string>();
  const line = (category: string, item: RequestItem) => {
    seen.add(item.id);
    const files = (item.linkedFiles ?? []).map((file) => file.name).join("\n");
    const comments = (item.comments ?? [])
      .map((comment) => `${comment.author} (${formatStamp(comment.createdAt)}): ${comment.body}`)
      .join("\n");
    body.push([
      category,
      item.name,
      item.detail,
      REQUEST_STATUS_LABEL[item.status],
      files,
      comments,
    ]);
  };
  for (const category of categories) {
    for (const item of requests) {
      if (item.categoryId === category.id) line(category.name, item);
    }
  }
  for (const item of requests) {
    if (!seen.has(item.id)) line("Uncategorized", item);
  }
  return [header, ...body];
}

export function RequestListPanel() {
  const { can } = useRole();
  const categories = useDdStore((s) => s.categories);
  const documents = useDdStore((s) => s.documents);
  const requests = useDdStore((s) => s.requests) ?? [];
  const workspace = useDdStore((s) => s.workspace);
  const project = useProject();
  const setRequestStatus = useDdStore((s) => s.setRequestStatus);
  const setRequestLinkedFiles = useDdStore((s) => s.setRequestLinkedFiles);
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [roomFiles, setRoomFiles] = useState<RoomFileOption[]>([]);
  const [roomFolders, setRoomFolders] = useState<RoomFolderOption[]>([]);
  const [roomTick, setRoomTick] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setFilter("all");
    setCommentingId(null);
    setLinkingId(null);
  }, [workspace]);

  useEffect(() => {
    const cats = categories.map((c) => ({
      id: c.id,
      name: c.name.slice(0, 120) || "Category",
    }));
    const items = requests
      .filter((r) => r.documentId)
      .map((r) => ({
        documentId: r.documentId as string,
        categoryId: r.categoryId,
        name: r.name.slice(0, 120),
      }));
    if (cats.length === 0 && items.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        if (cats.length > 0) {
          await ensureCategoryFolders({
            data: { projectId: project.id, workspace, categories: cats },
          });
        }
        if (items.length > 0) {
          await ensureRequestFolders({
            data: { projectId: project.id, workspace, items },
          });
        }
        if (!cancelled) setRoomTick((n) => n + 1);
      } catch {
        if (!cancelled) toast("Could not prepare data-room folders");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, project.id, requests, categories]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listRoomFiles({ data: { projectId: project.id, workspace } }),
      listFolderOptions({ data: { projectId: project.id, workspace } }),
    ])
      .then(([files, folders]) => {
        if (cancelled) return;
        setRoomFiles(files);
        setRoomFolders(folders);
      })
      .catch(() => {
        if (cancelled) return;
        setRoomFiles([]);
        setRoomFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, project.id, roomTick]);

  const visible = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [filter, requests],
  );

  const groups = useMemo(() => {
    return categories
      .map((cat) => ({
        cat,
        items: visible.filter((r) => r.categoryId === cat.id),
      }))
      .filter((g) => (filter === "all" ? true : g.items.length > 0));
  }, [categories, visible]);

  const open = requests.filter((r) => r.status === "open").length;
  const partial = requests.filter((r) => r.status === "partial").length;
  const closed = requests.filter((r) => r.status === "closed").length;

  async function exportExcel() {
    setExporting(true);
    try {
      const xlsx = await loadXlsx();
      const sheet = styleRequestSheet(xlsx, requestExportRows(categories, requests));
      const book = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(book, sheet, "Request list");
      const workspaceLabel = workspace === "asset" ? "asset" : "entity";
      xlsx.writeFile(book, `${project.slug}-${workspaceLabel}-request-list.xlsx`);
      toast("Request list downloaded");
    } catch {
      toast("Could not export the request list");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Request list
        </p>
        <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">
          {requests.length} {requests.length === 1 ? "file" : "files"} requested
        </h1>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {open} open
            <span className="text-faint"> · </span>
            {partial} partial
            <span className="text-faint"> · </span>
            {closed} closed
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 shrink-0"
              disabled={exporting || requests.length === 0}
              onClick={() => void exportExcel()}
            >
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
            <CloneRequestListButton />
            <RequestListEditor />
          </div>
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

      {groups.length === 0 ? (
        <p className="rounded-xl bg-surface px-5 py-12 text-center text-sm text-muted shadow-[var(--shadow-border)]">
          No requests match that filter.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ cat, items }) => (
            <section
              key={cat.id}
              className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
            >
              <header className="border-b border-border px-4 py-3 sm:px-5">
                <h2 className="text-lg font-medium tracking-tight text-ink">
                  {cat.name}
                </h2>
              </header>
              {items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted sm:px-5">
                  No items in this category yet.
                </p>
              ) : (
              <ul>
                {items.map((item) => {
                  const doc = documents.find((d) => d.id === item.documentId);
                  const detail =
                    item.detail ||
                    (doc
                      ? requestDetailFor(doc)
                      : `Complete copy of ${item.name}, including all schedules, exhibits, and amendments.`);
                  const folderId = item.documentId
                    ? requestFolderId(workspace, item.documentId, project.id)
                    : null;
                  const folderFiles = folderId
                    ? roomFiles.filter((f) => f.folderId === folderId)
                    : [];
                  const files = linkedFilesFor(item, folderFiles);
                  return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{item.name}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        {detail}
                      </p>
                      <RequestComments
                        item={item}
                        composing={commentingId === item.id}
                        onClose={() => setCommentingId(null)}
                      />
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 w-full sm:w-auto"
                        onClick={() =>
                          setCommentingId((id) => (id === item.id ? null : item.id))
                        }
                      >
                        Comment
                      </Button>
                      {item.documentId ? (
                        <RequestUploadButton
                          workspace={workspace}
                          item={item}
                          onUploaded={(added) => {
                            const next = mergeLinked(files, added);
                            setRequestLinkedFiles(item.id, next);
                            if (item.status === "open") {
                              setRequestStatus(item.id, "partial");
                            }
                            setRoomTick((n) => n + 1);
                          }}
                        >
                          {linkingId === item.id ? (
                            <RequestRoomSearch
                              files={roomFiles}
                              folders={roomFolders}
                              linkedIds={new Set(files.map((f) => f.id))}
                              hideFolderId={folderId}
                              onPick={(hit) => {
                                const next = mergeLinked(files, [toLinked(hit)]);
                                setRequestLinkedFiles(item.id, next);
                                if (item.status === "open") {
                                  setRequestStatus(item.id, "partial");
                                }
                                setLinkingId(null);
                                toast(hit.kind === "folder" ? "Folder linked" : "File linked");
                              }}
                              onClose={() => setLinkingId(null)}
                            />
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto w-full whitespace-normal px-3 py-2 text-center leading-snug"
                              onClick={() => setLinkingId(item.id)}
                            >
                              Link a file or folder already in the data room
                            </Button>
                          )}
                        </RequestUploadButton>
                      ) : null}
                      <div className="w-full sm:w-64">
                      {can("setRequestStatus") ? (
                      <div
                        className="grid h-11 w-full grid-cols-3 rounded-md bg-paper-2 p-0.5"
                        role="group"
                        aria-label={`Status for ${item.name}`}
                      >
                      {(["open", "partial", "closed"] as const).map((status) => {
                        const active = item.status === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setRequestStatus(item.id, status)}
                            className={cn(
                              "h-full min-h-10 rounded-sm px-1 text-xs font-medium tracking-wide uppercase transition-colors duration-150",
                              active
                                ? STATUS_BTN[status].active
                                : STATUS_BTN[status].idle,
                            )}
                            aria-pressed={active}
                          >
                            {REQUEST_STATUS_LABEL[status]}
                          </button>
                        );
                      })}
                      </div>
                      ) : (
                        <p
                          className={cn(
                            "grid h-11 w-full place-items-center rounded-md px-2 text-xs font-medium tracking-wide uppercase",
                            STATUS_BTN[item.status].active,
                          )}
                        >
                          {REQUEST_STATUS_LABEL[item.status]}
                        </p>
                      )}
                      {files.length > 0
                        ? files.map((file) => (
                            <RequestFileRow
                              key={file.id}
                              file={file}
                              lastFile={files.length === 1}
                              onRemoved={() => {
                                const next = files
                                  .filter((f) => f.id !== file.id)
                                  .map(toLinked);
                                setRequestLinkedFiles(item.id, next);
                                if (next.length === 0) {
                                  setRequestStatus(item.id, "open");
                                }
                              }}
                            />
                          ))
                        : null}
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestFileRow({
  file,
  lastFile,
  onRemoved,
}: {
  file: RequestLinkedFile;
  lastFile: boolean;
  onRemoved: () => void;
}) {
  const isFolder = file.kind === "folder";
  const { can } = useRole();
  const { slug } = useProject();
  return (
    <div className="mt-1.5 flex items-start gap-1">
      <Link
        to="/p/$slug/data-room/$folderId"
        params={{ slug, folderId: isFolder ? file.id : file.folderId }}
        search={isFolder ? {} : { file: file.id }}
        className="flex min-w-0 flex-1 items-start gap-1.5 text-sm break-words text-forest hover:underline"
      >
        {isFolder ? (
          <Folder className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        ) : null}
        <span className="min-w-0 break-words">{file.name}</span>
      </Link>
      {can("unlinkRequestFiles") ? (
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-paper-2 hover:text-danger"
          aria-label={`Unlink ${file.name}`}
          onClick={() => {
            onRemoved();
            toast(
              lastFile
                ? `${isFolder ? "Folder" : "File"} unlinked · request reopened`
                : `${isFolder ? "Folder" : "File"} unlinked`,
            );
          }}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function RequestRoomSearch({
  files,
  folders,
  linkedIds,
  hideFolderId,
  onPick,
  onClose,
}: {
  files: RoomFileOption[];
  folders: RoomFolderOption[];
  linkedIds: Set<string>;
  hideFolderId: string | null;
  onPick: (hit: RequestLinkedFile) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const folderHits = useMemo(() => {
    if (!q) return [];
    return folders
      .filter((f) => !linkedIds.has(f.id) && f.id !== hideFolderId)
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [folders, linkedIds, hideFolderId, q]);
  const fileHits = useMemo(() => {
    if (!q) return [];
    return files
      .filter((f) => !linkedIds.has(f.id))
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [files, linkedIds, q]);

  return (
    <div className="mt-1.5 grid gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder="Search files and folders"
          className="h-11 min-w-0 bg-paper pl-9"
          autoFocus
        />
      </div>
      {q ? (
        folderHits.length === 0 && fileHits.length === 0 ? (
          <p className="text-xs text-muted">No matching files or folders.</p>
        ) : (
          <div className="max-h-56 overflow-auto rounded-md bg-paper shadow-[var(--shadow-border)]">
            {folderHits.length > 0 ? (
              <div>
                <p className="px-2.5 pt-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                  Folders
                </p>
                <ul>
                  {folderHits.map((folder) => (
                    <li key={`dir-${folder.id}`}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-paper-2"
                        onClick={() =>
                          onPick({
                            id: folder.id,
                            folderId: folder.id,
                            name: folder.name,
                            kind: "folder",
                          })
                        }
                      >
                        <Folder
                          className="mt-0.5 size-4 shrink-0 text-forest"
                          strokeWidth={1.75}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm break-words text-ink">
                            {folder.name}
                          </span>
                          <span className="block text-xs break-words text-faint">
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
                <p className="px-2.5 pt-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                  Files
                </p>
                <ul>
                  {fileHits.map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-paper-2"
                        onClick={() => onPick(toLinked(file))}
                      >
                        <FileText
                          className="mt-0.5 size-4 shrink-0 text-muted"
                          strokeWidth={1.75}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm break-words text-ink">
                            {file.name}
                          </span>
                          <span className="block text-xs break-words text-faint">
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
      ) : (
        <button
          type="button"
          className="text-left text-xs text-muted hover:text-ink"
          onClick={onClose}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function linkedFilesFor(
  item: RequestItem,
  folderFiles: RoomFileOption[],
): RequestLinkedFile[] {
  if (item.linkedFiles) return item.linkedFiles;
  return folderFiles.map(toLinked);
}

function toLinked(file: {
  id: string;
  folderId: string;
  name: string;
  kind?: "file" | "folder";
}): RequestLinkedFile {
  return {
    id: file.id,
    folderId: file.folderId,
    name: file.name,
    kind: file.kind ?? "file",
  };
}

function mergeLinked(current: RequestLinkedFile[], added: RequestLinkedFile[]) {
  const seen = new Set(current.map((f) => f.id));
  const next = [...current];
  for (const file of added) {
    if (seen.has(file.id)) continue;
    seen.add(file.id);
    next.push(file);
  }
  return next;
}

function parentPath(path: string, name: string) {
  const suffix = ` / ${name}`;
  if (path.endsWith(suffix)) return path.slice(0, -suffix.length);
  return path;
}

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

function RequestUploadButton({
  workspace,
  item,
  onUploaded,
  children,
}: {
  workspace: WorkspaceId;
  item: RequestItem;
  onUploaded: (added: RequestLinkedFile[]) => void;
  children?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const project = useProject();

  async function onPickFiles(list: FileList | null) {
    if (!list?.length || !item.documentId) return;
    setBusy(true);
    try {
      const added: RequestLinkedFile[] = [];
      for (const file of Array.from(list)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast(`${file.name} is over ${MAX_UPLOAD_LABEL}`);
          continue;
        }
        const saved = await uploadRoomFile({
          file,
          request: {
            projectId: project.id,
            workspace,
            documentId: item.documentId,
            categoryId: item.categoryId,
            folderName: item.name.slice(0, 120),
          },
        });
        added.push({
          id: saved.id,
          folderId: saved.folderId,
          name: file.name,
          kind: "file",
        });
      }
      if (added.length > 0) {
        toast(
          added.length === 1
            ? "Uploaded to the data room"
            : `${added.length} files uploaded to the data room`,
        );
        onUploaded(added);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onPickFolder(list: FileList | null) {
    if (!list?.length || !item.documentId) return;
    setBusy(true);
    const cache = new Map<string, string>();
    const added: RequestLinkedFile[] = [];
    const seenFolders = new Set<string>();
    let skipped = 0;
    try {
      await ensureRequestFolders({
        data: {
          projectId: project.id,
          workspace,
          items: [
            {
              documentId: item.documentId,
              categoryId: item.categoryId,
              name: item.name.slice(0, 120),
            },
          ],
        },
      });
      const parentId = requestFolderId(workspace, item.documentId, project.id);
      const files = Array.from(list).filter((file) => !skipUploadName(file.name));
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast(`${file.name} is over ${MAX_UPLOAD_LABEL}`);
          skipped += 1;
          continue;
        }
        const segments = directorySegments(file);
        let folderId = parentId;
        if (segments.length > 0) {
          const topKey = segments[0].toLowerCase();
          let topId = cache.get(topKey);
          if (!topId) {
            const created = await ensureFolderPath({
              data: { parentId, segments: [segments[0]] },
            });
            topId = created.id;
            cache.set(topKey, topId);
          }
          if (!seenFolders.has(topId)) {
            seenFolders.add(topId);
            added.push({
              id: topId,
              folderId: topId,
              name: segments[0],
              kind: "folder",
            });
          }
          if (segments.length > 1) {
            const key = segments.join("/").toLowerCase();
            const cached = cache.get(key);
            if (cached) {
              folderId = cached;
            } else {
              const created = await ensureFolderPath({
                data: { parentId, segments },
              });
              folderId = created.id;
              cache.set(key, folderId);
            }
          } else {
            folderId = topId;
          }
        }
        const saved = await uploadRoomFile({
          file,
          folderId,
        });
        if (segments.length === 0) {
          added.push({
            id: saved.id,
            folderId,
            name: file.name,
            kind: "file",
          });
        }
      }
      if (added.length > 0) {
        toast(
          added.some((a) => a.kind === "folder")
            ? "Folder uploaded to the data room"
            : added.length === 1
              ? "Uploaded to the data room"
              : `${added.length} files uploaded to the data room`,
        );
        onUploaded(added);
      } else if (skipped > 0) {
        toast(`Nothing under ${MAX_UPLOAD_LABEL} to upload from that folder`);
      } else {
        toast("That folder had no files to upload");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Folder upload failed");
    } finally {
      setBusy(false);
      if (folderInput.current) folderInput.current.value = "";
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto">
      <div className="flex w-full flex-col gap-2 sm:flex-row">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 w-full sm:w-auto"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="size-4" />
        {busy ? "Uploading…" : "Upload files"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 w-full sm:w-auto"
        disabled={busy}
        onClick={() => folderInput.current?.click()}
      >
        <FolderUp className="size-4" />
        Upload folder
      </Button>
      </div>
      {children}
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        aria-label={`Upload files for ${item.name}`}
        onChange={(e) => void onPickFiles(e.target.files)}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        aria-label={`Upload folder for ${item.name}`}
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => void onPickFolder(e.target.files)}
      />
    </div>
  );
}

function RequestComments({
  item,
  composing,
  onClose,
}: {
  item: RequestItem;
  composing: boolean;
  onClose: () => void;
}) {
  const addRequestComment = useDdStore((s) => s.addRequestComment);
  const removeRequestComment = useDdStore((s) => s.removeRequestComment);
  const { can } = useRole();
  const user = useCurrentUser();
  const [body, setBody] = useState("");
  const comments = item.comments ?? [];
  const author = user?.displayName || user?.primaryEmail || "You";

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) {
      toast("Write a comment first");
      return;
    }
    addRequestComment(item.id, { body: text, author });
    setBody("");
    onClose();
  }

  if (comments.length === 0 && !composing) return null;

  return (
    <div className="mt-3 grid gap-2">
      {comments.length > 0 ? (
        <ul className="grid gap-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex items-start gap-2 rounded-md bg-paper px-3 py-2 shadow-[var(--shadow-border)]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-ink">{comment.body}</p>
                <p className="mt-1 text-xs text-faint">
                  {comment.author}
                  <span className="text-faint/80"> · </span>
                  {formatStamp(comment.createdAt)}
                </p>
              </div>
              {can("deleteComments") ? (
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-paper-2 hover:text-danger"
                  aria-label={`Delete comment by ${comment.author}`}
                  onClick={() => {
                    removeRequestComment(item.id, comment.id);
                    toast("Comment deleted");
                  }}
                >
                  <Trash2 className="size-4" strokeWidth={1.75} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {composing ? (
        <form className="grid gap-2" onSubmit={submit}>
          <Label htmlFor={`comment-${item.id}`} className="sr-only">
            Comment on {item.name}
          </Label>
          <Textarea
            id={`comment-${item.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment"
            className="min-h-16 bg-paper"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Comment
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
