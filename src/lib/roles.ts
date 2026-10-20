export const FOLIA_ROLES = ["admin", "reviewer", "client"] as const;
export type FoliaRole = (typeof FOLIA_ROLES)[number];

export const ROLE_LABEL: Record<FoliaRole, string> = {
  admin: "Admin",
  reviewer: "Reviewer",
  client: "Client",
};

export type RoleAction =
  | "manageUsers"
  | "editMatter"
  | "editRequestList"
  | "deleteRoom"
  | "moveFiles"
  | "markReviewed"
  | "raiseIssues"
  | "viewIssues"
  | "viewTests"
  | "viewReviewStatus"
  | "setRequestStatus"
  | "deleteComments"
  | "unlinkRequestFiles"
  | "switchWorkspace"
  | "assignFiles";

const FIRM: FoliaRole[] = ["admin", "reviewer"];

const ALLOW: Record<RoleAction, FoliaRole[]> = {
  manageUsers: ["admin"],
  editMatter: ["admin"],
  editRequestList: ["admin"],
  deleteRoom: FIRM,
  moveFiles: FIRM,
  markReviewed: FIRM,
  raiseIssues: FIRM,
  viewIssues: ["admin", "reviewer", "client"],
  viewTests: FIRM,
  viewReviewStatus: ["admin", "reviewer", "client"],
  setRequestStatus: FIRM,
  deleteComments: ["admin"],
  unlinkRequestFiles: FIRM,
  switchWorkspace: ["admin"],
  assignFiles: ["admin"],
};

export function isFoliaRole(value: string): value is FoliaRole {
  return value === "admin" || value === "reviewer" || value === "client";
}

export function can(role: FoliaRole, action: RoleAction): boolean {
  return ALLOW[action].includes(role);
}
