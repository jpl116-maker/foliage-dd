import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ASSET_SEED } from "@/lib/seed-asset";
import { ENTITY_SEED } from "@/lib/seed";
import { fallbackRequestDetail } from "@/lib/request-details";
import { documentsForRequests, ensureRequests, requestStatusFromReview } from "@/lib/requests";
import { saveRequestList } from "@/lib/request-list-db";
import { saveIssues } from "@/lib/issues-db";
import { ensureReitTests } from "@/lib/reit-tests";
import type {
  CategoryId,
  DdDocument,
  DdState,
  FileKind,
  Issue,
  IssueSeverity,
  IssueStatus,
  RequestStatus,
  ReitTestStatus,
  ReviewStatus,
  RequestLinkedFile,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { isWorkspaceId, type WorkspaceId } from "@/lib/workspace";

export type FileFilter = "all" | "unreviewed" | "reviewed";
export type IssueFilter = "active" | "open" | "monitoring" | "resolved" | "all";

export const SEEDS: Record<WorkspaceId, DdState> = {
  entity: ENTITY_SEED,
  asset: ASSET_SEED,
};

function snapshot(
  s: Pick<DdState, "matter" | "categories" | "documents" | "issues" | "requests" | "tests">,
): DdState {
  return {
    matter: s.matter,
    categories: s.categories,
    documents: s.documents,
    issues: s.issues,
    requests: s.requests,
    tests: s.tests,
  };
}

function hydrateWorkspace(state: DdState, workspace: WorkspaceId): DdState {
  return ensureReitTests(ensureRequests(state), workspace);
}

function cloneSeed(ws: WorkspaceId, projectId = DEFAULT_PROJECT_ID): DdState {
  const seed = structuredClone(SEEDS[ws]);
  if (projectId === DEFAULT_PROJECT_ID) return seed;
  return {
    ...seed,
    issues: [],
    tests: (seed.tests ?? []).map((t) => ({ ...t, status: "open" as const })),
    documents: seed.documents.map((d) =>
      d.status === "not_applicable"
        ? d
        : {
            ...d,
            status: "not_received" as const,
            receivedOn: null,
            reviewer: null,
            notes: "",
          },
    ),
    requests: (seed.requests ?? []).map((r) => ({
      ...r,
      status: "open" as const,
      comments: [],
      linkedFiles: [],
    })),
  };
}

function sliceKey(projectId: string, workspace: WorkspaceId) {
  return `${projectId}:${workspace}`;
}

interface Actions {
  projectId: string;
  workspace: WorkspaceId;
  files: Record<string, DdState>;
  search: string;
  fileFilter: FileFilter;
  issueFilter: IssueFilter;
  focusedIssueId: string | null;
  expanded: Record<string, boolean>;
  requestListReady: boolean;
  issuesReady: boolean;
  setProject: (projectId: string, workspace?: WorkspaceId) => void;
  setWorkspace: (workspace: WorkspaceId) => void;
  setSearch: (value: string) => void;
  setFileFilter: (value: FileFilter) => void;
  setIssueFilter: (value: IssueFilter) => void;
  setFocusedIssueId: (id: string | null) => void;
  toggleCategory: (id: string) => void;
  setDocumentStatus: (id: string, status: ReviewStatus) => void;
  setDocumentNotes: (id: string, notes: string) => void;
  addDocument: (input: {
    categoryId: CategoryId;
    name: string;
    kind: FileKind;
    period?: string;
  }) => void;
  addIssue: (input: {
    title: string;
    summary: string;
    severity: IssueSeverity;
    categoryId: CategoryId;
    documentId: string | null;
    codeSection?: string;
    roomFileId?: string | null;
    roomFolderId?: string | null;
    roomFileName?: string | null;
    raisedBy?: string;
  }) => void;
  updateIssue: (
    id: string,
    input: {
      title: string;
      summary: string;
      severity: IssueSeverity;
      categoryId: CategoryId;
      documentId: string | null;
      codeSection?: string;
      roomFileId?: string | null;
      roomFolderId?: string | null;
      roomFileName?: string | null;
    },
  ) => void;
  setIssueStatus: (id: string, status: IssueStatus) => void;
  removeIssue: (id: string) => void;
  setRequestStatus: (id: string, status: RequestStatus) => void;
  addRequestComment: (id: string, input: { body: string; author: string }) => void;
  removeRequestComment: (id: string, commentId: string) => void;
  setRequestLinkedFiles: (id: string, files: RequestLinkedFile[]) => void;
  pruneRoomLinks: (ids: string[]) => void;
  updateRequestItem: (id: string, patch: { name: string; detail: string }) => void;
  addCategory: (input: { id: string; name: string }) => void;
  updateCategory: (id: string, patch: { name: string }) => void;
  addRequestItem: (input: { categoryId: string; name: string; detail: string }) => void;
  removeRequestItem: (id: string) => void;
  removeCategory: (id: string) => void;
  hydrateRequestList: (input: {
    categories: DdState["categories"];
    requests: DdState["requests"];
  }) => void;
  hydrateIssues: (issues: Issue[]) => void;
  markRequestListReady: (persistCurrent: boolean) => void;
  setTestStatus: (id: string, status: ReitTestStatus) => void;
  updateMatter: (patch: {
    name: string;
    client: string;
    target: string;
    dueOn: string;
  }) => void;
  resetDemo: () => void;
}

type DdStore = DdState & Actions;

const defaultExpanded = (ws: WorkspaceId): Record<string, boolean> =>
  ws === "asset" ? { apa: true, firpta: true } : { federal: true, attributes: true };

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let issuePersistTimer: ReturnType<typeof setTimeout> | undefined;

function queuePersist() {
  if (typeof window === "undefined") return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const s = useDdStore.getState();
    if (!s.requestListReady) return;
    void saveRequestList({
      data: {
        workspace: s.workspace,
        projectId: s.projectId,
        categories: s.categories.map((c) => ({
          id: c.id,
          name: c.name,
          blurb: c.blurb,
        })),
        requests: (s.requests ?? []).map((r) => ({
          id: r.id,
          categoryId: r.categoryId,
          documentId: r.documentId ?? null,
          name: r.name,
          detail: r.detail,
          status: r.status,
          comments: r.comments ?? [],
          linkedFiles: r.linkedFiles ?? [],
        })),
      },
    }).catch(() => {
      /* next mutation retries */
    });
  }, 250);
}

function queueIssuePersist() {
  if (typeof window === "undefined") return;
  clearTimeout(issuePersistTimer);
  issuePersistTimer = setTimeout(() => {
    const s = useDdStore.getState();
    if (!s.issuesReady) return;
    void saveIssues({
      data: {
        projectId: s.projectId,
        workspace: s.workspace,
        issues: s.issues.map((issue) => ({
          id: issue.id,
          documentId: issue.documentId ?? null,
          categoryId: issue.categoryId,
          title: issue.title,
          summary: issue.summary,
          severity: issue.severity,
          status: issue.status,
          codeSection: issue.codeSection,
          raisedOn: issue.raisedOn,
          raisedBy: issue.raisedBy,
          roomFileId: issue.roomFileId ?? null,
          roomFolderId: issue.roomFolderId ?? null,
          roomFileName: issue.roomFileName ?? null,
        })),
      },
    }).catch(() => {
      /* next mutation retries */
    });
  }, 250);
}

export const useDdStore = create<DdStore>()(
  persist(
    (set) => ({
      projectId: DEFAULT_PROJECT_ID,
      workspace: "entity",
      files: {
        [sliceKey(DEFAULT_PROJECT_ID, "entity")]: cloneSeed("entity"),
        [sliceKey(DEFAULT_PROJECT_ID, "asset")]: cloneSeed("asset"),
      },
      ...cloneSeed("entity"),
      search: "",
      fileFilter: "all",
      issueFilter: "active",
      focusedIssueId: null,
      expanded: defaultExpanded("entity"),
      requestListReady: false,
      issuesReady: false,
      setProject: (projectId, workspace) =>
        set((s) => {
          const nextWs = workspace ?? s.workspace;
          if (projectId === s.projectId && nextWs === s.workspace) return s;
          const current = snapshot(s);
          const incoming = hydrateWorkspace(
            s.files[sliceKey(projectId, nextWs)] ?? cloneSeed(nextWs, projectId),
            nextWs,
          );
          return {
            projectId,
            workspace: nextWs,
            files: { ...s.files, [sliceKey(s.projectId, s.workspace)]: current },
            ...incoming,
            matter: s.matter,
            search: "",
            fileFilter: "all",
            issueFilter: "active",
            focusedIssueId: null,
            expanded: defaultExpanded(nextWs),
            requestListReady: false,
            issuesReady: false,
          };
        }),
      setWorkspace: (workspace) =>
        set((s) => {
          if (workspace === s.workspace) return s;
          const current = snapshot(s);
          const incoming = hydrateWorkspace(
            s.files[sliceKey(s.projectId, workspace)] ?? cloneSeed(workspace, s.projectId),
            workspace,
          );
          return {
            workspace,
            files: { ...s.files, [sliceKey(s.projectId, s.workspace)]: current },
            ...incoming,
            matter: s.matter,
            search: "",
            fileFilter: "all",
            issueFilter: "active",
            focusedIssueId: null,
            expanded: defaultExpanded(workspace),
            requestListReady: false,
            issuesReady: false,
          };
        }),
      setSearch: (search) => set({ search }),
      setFileFilter: (fileFilter) => set({ fileFilter }),
      setIssueFilter: (issueFilter) =>
        set({
          issueFilter,
          focusedIssueId: null,
        }),
      setFocusedIssueId: (focusedIssueId) => set({ focusedIssueId }),
      toggleCategory: (id) =>
        set((s) => ({
          expanded: { ...s.expanded, [id]: !s.expanded[id] },
        })),
      setDocumentStatus: (id, status) => {
        set((s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, status } : d)),
          requests: (s.requests ?? []).map((r) =>
            r.documentId === id ? { ...r, status: requestStatusFromReview(status) } : r,
          ),
        }));
        queuePersist();
      },
      setDocumentNotes: (id, notes) =>
        set((s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, notes } : d)),
        })),
      setIssueStatus: (id, status) => {
        set((s) => ({
          issues: s.issues.map((i) => (i.id === id ? { ...i, status } : i)),
        }));
        queueIssuePersist();
      },
      removeIssue: (id) => {
        set((s) => ({
          issues: s.issues.filter((i) => i.id !== id),
          focusedIssueId: s.focusedIssueId === id ? null : s.focusedIssueId,
        }));
        queueIssuePersist();
      },
      setRequestStatus: (id, status) => {
        set((s) => ({
          requests: (s.requests ?? []).map((r) => (r.id === id ? { ...r, status } : r)),
        }));
        queuePersist();
      },
      addRequestComment: (id, input) => {
        set((s) => ({
          requests: (s.requests ?? []).map((r) =>
            r.id === id
              ? {
                  ...r,
                  comments: [
                    ...(r.comments ?? []),
                    {
                      id: uid("c"),
                      body: input.body,
                      author: input.author,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : r,
          ),
        }));
        queuePersist();
      },
      removeRequestComment: (id, commentId) => {
        set((s) => ({
          requests: (s.requests ?? []).map((r) =>
            r.id === id
              ? { ...r, comments: (r.comments ?? []).filter((c) => c.id !== commentId) }
              : r,
          ),
        }));
        queuePersist();
      },
      setRequestLinkedFiles: (id, files) => {
        set((s) => ({
          requests: (s.requests ?? []).map((r) =>
            r.id === id ? { ...r, linkedFiles: files } : r,
          ),
        }));
        queuePersist();
      },
      pruneRoomLinks: (ids) => {
        if (ids.length === 0) return;
        const drop = new Set(ids);
        set((s) => ({
          requests: (s.requests ?? []).map((r) => ({
            ...r,
            linkedFiles: r.linkedFiles?.filter((f) => !drop.has(f.id) && !drop.has(f.folderId)),
          })),
        }));
        queuePersist();
      },
      updateRequestItem: (id, patch) => {
        set((s) => {
          const requests = (s.requests ?? []).map((r) =>
            r.id === id ? { ...r, name: patch.name, detail: patch.detail } : r,
          );
          const req = requests.find((r) => r.id === id);
          return {
            requests,
            documents: req?.documentId
              ? s.documents.map((d) =>
                  d.id === req.documentId ? { ...d, name: patch.name, period: undefined } : d,
                )
              : s.documents,
          };
        });
        queuePersist();
      },
      addCategory: (input) => {
        set((s) => ({
          categories: [...s.categories, { id: input.id, name: input.name, blurb: "" }],
          expanded: { ...s.expanded, [input.id]: true },
        }));
        queuePersist();
      },
      updateCategory: (id, patch) => {
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name: patch.name } : c)),
        }));
        queuePersist();
      },
      addRequestItem: (input) => {
        set((s) => {
          const doc: DdDocument = {
            id: uid("d"),
            categoryId: input.categoryId,
            name: input.name,
            kind: "pdf",
            status: "not_received",
            reviewer: null,
            receivedOn: null,
            notes: "",
          };
          return {
            documents: [...s.documents, doc],
            requests: [
              ...(s.requests ?? []),
              {
                id: uid("r"),
                categoryId: input.categoryId,
                documentId: doc.id,
                name: input.name,
                detail: input.detail,
                status: "open" as const,
                comments: [],
                linkedFiles: [],
              },
            ],
            expanded: { ...s.expanded, [input.categoryId]: true },
          };
        });
        queuePersist();
      },
      removeRequestItem: (id) => {
        set((s) => {
          const req = (s.requests ?? []).find((r) => r.id === id);
          return {
            requests: (s.requests ?? []).filter((r) => r.id !== id),
            documents: req?.documentId
              ? s.documents.filter((d) => d.id !== req.documentId)
              : s.documents,
          };
        });
        queuePersist();
      },
      removeCategory: (id) => {
        set((s) => {
          const dropDoc = new Set(
            s.documents.filter((d) => d.categoryId === id).map((d) => d.id),
          );
          for (const req of s.requests ?? []) {
            if (req.categoryId === id && req.documentId) dropDoc.add(req.documentId);
          }
          return {
            categories: s.categories.filter((c) => c.id !== id),
            requests: (s.requests ?? []).filter((r) => r.categoryId !== id),
            documents: s.documents.filter((d) => !dropDoc.has(d.id)),
          };
        });
        queuePersist();
      },
      setTestStatus: (id, status) =>
        set((s) => ({
          tests: (s.tests ?? []).map((t) => (t.id === id ? { ...t, status } : t)),
        })),
      updateMatter: (patch) =>
        set((s) => ({
          matter: {
            ...s.matter,
            name: patch.name,
            client: patch.client,
            target: patch.target,
            dueOn: patch.dueOn,
          },
        })),
      addDocument: (input) => {
        set((s) => {
          const doc: DdDocument = {
            id: uid("d"),
            categoryId: input.categoryId,
            name: input.name,
            kind: input.kind,
            period: input.period,
            status: "received",
            reviewer: null,
            receivedOn: new Date().toISOString().slice(0, 10),
            notes: "",
          };
          const request = {
            id: uid("r"),
            categoryId: input.categoryId,
            documentId: doc.id,
            name: input.period ? `${input.name} (${input.period})` : input.name,
            detail: fallbackRequestDetail(input.name, input.period),
            status: "partial" as const,
            comments: [],
            linkedFiles: [],
          };
          return {
            documents: [...s.documents, doc],
            requests: [...(s.requests ?? []), request],
            expanded: { ...s.expanded, [input.categoryId]: true },
          };
        });
        queuePersist();
      },
      addIssue: (input) => {
        set((s) => ({
          issues: [
            {
              id: uid("i"),
              documentId: input.documentId,
              categoryId: input.categoryId,
              title: input.title,
              summary: input.summary,
              severity: input.severity,
              status: "open" as const,
              codeSection: input.codeSection,
              raisedOn: new Date().toISOString().slice(0, 10),
              raisedBy: input.raisedBy?.trim() || "You",
              roomFileId: input.roomFileId ?? null,
              roomFolderId: input.roomFolderId ?? null,
              roomFileName: input.roomFileName ?? null,
            },
            ...s.issues,
          ],
        }));
        queueIssuePersist();
      },
      updateIssue: (id, input) => {
        set((s) => ({
          issues: s.issues.map((i) =>
            i.id === id
              ? {
                  ...i,
                  title: input.title,
                  summary: input.summary,
                  severity: input.severity,
                  categoryId: input.categoryId,
                  documentId: input.documentId,
                  codeSection: input.codeSection,
                  roomFileId: input.roomFileId ?? null,
                  roomFolderId: input.roomFolderId ?? null,
                  roomFileName: input.roomFileName ?? null,
                }
              : i,
          ),
        }));
        queueIssuePersist();
      },
      hydrateRequestList: (input) =>
        set((s) => ({
          categories: input.categories,
          requests: input.requests,
          documents: documentsForRequests(s.documents, input.requests),
          requestListReady: true,
        })),
      hydrateIssues: (issues) => set({ issues, issuesReady: true }),
      markRequestListReady: (persistCurrent) => {
        set({ requestListReady: true });
        if (persistCurrent) queuePersist();
      },
      resetDemo: () =>
        set((s) => {
          const next = cloneSeed(s.workspace, s.projectId);
          return {
            ...next,
            files: { ...s.files, [sliceKey(s.projectId, s.workspace)]: next },
            search: "",
            fileFilter: "all",
            issueFilter: "active",
            focusedIssueId: null,
            expanded: defaultExpanded(s.workspace),
          };
        }),
    }),
    {
      name: "folia-dd-v2",
      version: 4,
      skipHydration: true,
      partialize: (s) => ({
        projectId: s.projectId,
        workspace: s.workspace,
        files: {
          ...s.files,
          [sliceKey(s.projectId, s.workspace)]: snapshot(s),
        },
      }),
      migrate: (persisted, version) => {
        const raw = persisted as {
          projectId?: string;
          workspace?: string;
          files?: Record<string, DdState>;
        };
        const workspace: WorkspaceId = isWorkspaceId(String(raw.workspace ?? ""))
          ? (raw.workspace as WorkspaceId)
          : "entity";
        if (version >= 4) {
          return persisted as {
            projectId: string;
            workspace: WorkspaceId;
            files: Record<string, DdState>;
          };
        }
        const entity = raw.files?.entity ?? cloneSeed("entity");
        const asset = raw.files?.asset ?? cloneSeed("asset");
        return {
          projectId: DEFAULT_PROJECT_ID,
          workspace,
          files: {
            [sliceKey(DEFAULT_PROJECT_ID, "entity")]: entity,
            [sliceKey(DEFAULT_PROJECT_ID, "asset")]: asset,
          },
        };
      },
      merge: (persisted, current) => {
        const raw = persisted as Partial<DdStore> & {
          files?: Record<string, DdState>;
        };
        const workspace: WorkspaceId = isWorkspaceId(String(raw.workspace ?? ""))
          ? (raw.workspace as WorkspaceId)
          : "entity";
        const projectId = raw.projectId || DEFAULT_PROJECT_ID;
        const files: Record<string, DdState> = { ...(raw.files ?? {}) };
        if (raw.files?.entity && !files[sliceKey(DEFAULT_PROJECT_ID, "entity")]) {
          files[sliceKey(DEFAULT_PROJECT_ID, "entity")] = hydrateWorkspace(
            raw.files.entity,
            "entity",
          );
        }
        if (raw.files?.asset && !files[sliceKey(DEFAULT_PROJECT_ID, "asset")]) {
          files[sliceKey(DEFAULT_PROJECT_ID, "asset")] = hydrateWorkspace(
            raw.files.asset,
            "asset",
          );
        }
        const active = hydrateWorkspace(
          files[sliceKey(projectId, workspace)] ?? cloneSeed(workspace, projectId),
          workspace,
        );
        return {
          ...current,
          projectId,
          workspace,
          files,
          ...active,
        };
      },
    },
  ),
);
