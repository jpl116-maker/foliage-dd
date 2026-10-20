export const REVIEW_STATUSES = [
  "not_received",
  "received",
  "in_review",
  "reviewed",
  "exception",
  "not_applicable",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ISSUE_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = ["open", "monitoring", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export type FileKind = "pdf" | "xlsx" | "docx" | "msg" | "zip";

export type CategoryId = string;

export interface Matter {
  id: string;
  code: string;
  name: string;
  client: string;
  target: string;
  ticker: string;
  dealType: string;
  openedOn: string;
  dueOn: string;
}

export interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
}

export interface DdDocument {
  id: string;
  categoryId: CategoryId;
  name: string;
  kind: FileKind;
  period?: string;
  status: ReviewStatus;
  reviewer: string | null;
  receivedOn: string | null;
  notes: string;
}

export interface Issue {
  id: string;
  documentId: string | null;
  categoryId: CategoryId;
  title: string;
  summary: string;
  severity: IssueSeverity;
  status: IssueStatus;
  codeSection?: string;
  raisedOn: string;
  raisedBy: string;
  roomFileId?: string | null;
  roomFolderId?: string | null;
  roomFileName?: string | null;
}

export const REQUEST_STATUSES = ["open", "partial", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface RequestComment {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface RequestLinkedFile {
  id: string;
  folderId: string;
  name: string;
  kind?: "file" | "folder";
}

export interface RequestItem {
  id: string;
  categoryId: CategoryId;
  documentId: string | null;
  name: string;
  detail: string;
  status: RequestStatus;
  comments?: RequestComment[];
  linkedFiles?: RequestLinkedFile[];
}

export const REIT_TEST_STATUSES = ["pass", "fail", "open"] as const;
export type ReitTestStatus = (typeof REIT_TEST_STATUSES)[number];

export interface ReitTest {
  id: string;
  name: string;
  detail: string;
  codeSection?: string;
  status: ReitTestStatus;
}

export interface DdState {
  matter: Matter;
  categories: Category[];
  documents: DdDocument[];
  issues: Issue[];
  requests: RequestItem[];
  tests: ReitTest[];
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Open",
  partial: "Partial",
  closed: "Closed",
};

export const REIT_TEST_STATUS_LABEL: Record<ReitTestStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  open: "Open",
};

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  not_received: "Not received",
  received: "Received",
  in_review: "In review",
  reviewed: "Reviewed",
  exception: "Exception",
  not_applicable: "N/A",
};

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

export const KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  xlsx: "XLSX",
  docx: "DOCX",
  msg: "MSG",
  zip: "ZIP",
};
