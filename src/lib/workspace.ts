import { DEFAULT_PROJECT_ID } from "@/lib/projects";

export const WORKSPACES = [
  { id: "entity", label: "Entity DD" },
  { id: "asset", label: "Asset DD" },
] as const;

export type WorkspaceId = (typeof WORKSPACES)[number]["id"];

export const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  entity: "Entity DD",
  asset: "Asset DD",
};

export const ROOM_ROOT: Record<WorkspaceId, string> = {
  entity: "root",
  asset: "root-asset",
};

export function isWorkspaceId(value: string): value is WorkspaceId {
  return value === "entity" || value === "asset";
}

export function roomRoot(projectId: string, workspace: WorkspaceId): string {
  const base = ROOM_ROOT[workspace];
  return projectId === DEFAULT_PROJECT_ID ? base : `${projectId}-${base}`;
}

export function roomIdPrefix(projectId: string, workspace: WorkspaceId): string {
  const ws = workspace === "asset" ? "asset-" : "";
  return projectId === DEFAULT_PROJECT_ID ? ws : `${projectId}-${ws}`;
}

export function categoryFolderId(
  workspace: WorkspaceId,
  categoryId: string,
  projectId = DEFAULT_PROJECT_ID,
): string {
  return `${roomIdPrefix(projectId, workspace)}dir-${categoryId}`;
}

export function requestFolderId(
  workspace: WorkspaceId,
  documentId: string,
  projectId = DEFAULT_PROJECT_ID,
): string {
  return `${roomIdPrefix(projectId, workspace)}req-${documentId}`;
}
