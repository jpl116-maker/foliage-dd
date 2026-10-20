import type { Issue } from "@/lib/types";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { requestFolderId, roomIdPrefix, type WorkspaceId } from "@/lib/workspace";

export function seedRoomFileId(
  workspace: WorkspaceId,
  documentId: string,
  projectId = DEFAULT_PROJECT_ID,
) {
  return `${roomIdPrefix(projectId, workspace)}file-${documentId}`;
}

export function documentIdFromRoomFile(
  fileId: string,
  workspace: WorkspaceId,
  projectId = DEFAULT_PROJECT_ID,
) {
  const prefix = `${roomIdPrefix(projectId, workspace)}file-`;
  if (fileId.startsWith(prefix)) return fileId.slice(prefix.length);
  return null;
}

export function issueFileRef(
  issue: Issue,
  workspace: WorkspaceId,
  fallbackName?: string,
  projectId = DEFAULT_PROJECT_ID,
) {
  if (issue.roomFolderId) {
    return {
      folderId: issue.roomFolderId,
      fileId: issue.roomFileId || undefined,
      name:
        issue.roomFileName ||
        fallbackName ||
        (issue.roomFileId ? "Data-room file" : "Data-room folder"),
    };
  }
  if (issue.documentId) {
    return {
      folderId: requestFolderId(workspace, issue.documentId, projectId),
      fileId: seedRoomFileId(workspace, issue.documentId, projectId),
      name: fallbackName || "Related file",
    };
  }
  return null;
}