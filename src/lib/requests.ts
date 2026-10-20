import { requestDetailFor } from "@/lib/request-details";
import type { DdDocument, RequestItem, RequestStatus, ReviewStatus } from "@/lib/types";

export function requestStatusFromReview(status: ReviewStatus): RequestStatus {
  if (status === "not_received") return "open";
  if (status === "reviewed" || status === "exception") return "closed";
  if (status === "not_applicable") return "closed";
  return "partial";
}

export function requestsFromDocuments(documents: DdDocument[]): RequestItem[] {
  return documents
    .filter((d) => d.status !== "not_applicable")
    .map((d) => ({
      id: `r-${d.id}`,
      categoryId: d.categoryId,
      documentId: d.id,
      name: d.period ? `${d.name} (${d.period})` : d.name,
      detail: requestDetailFor(d),
      status: requestStatusFromReview(d.status),
      comments: [],
    }));
}

export function ensureRequests<T extends { documents: DdDocument[]; requests?: RequestItem[] }>(
  state: T,
): T & { requests: RequestItem[] } {
  const documents = state.documents ?? [];
  if (Array.isArray(state.requests)) {
    return {
      ...state,
      requests: state.requests.map((r) => {
        const comments = r.comments ?? [];
        if (r.detail) return { ...r, comments };
        const doc = documents.find((d) => d.id === r.documentId);
        return {
          ...r,
          comments,
          detail: doc
            ? requestDetailFor(doc)
            : `Complete copy of ${r.name}, including all schedules, exhibits, and amendments.`,
        };
      }),
    };
  }
  return { ...state, requests: requestsFromDocuments(documents) };
}

export function documentsForRequests(
  documents: DdDocument[],
  requests: RequestItem[],
): DdDocument[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const next: DdDocument[] = [];
  const seen = new Set<string>();
  for (const item of requests) {
    if (!item.documentId || seen.has(item.documentId)) continue;
    seen.add(item.documentId);
    const existing = byId.get(item.documentId);
    if (existing) {
      next.push({
        ...existing,
        categoryId: item.categoryId,
        name: existing.name || item.name,
      });
    } else {
      next.push({
        id: item.documentId,
        categoryId: item.categoryId,
        name: item.name,
        kind: "pdf",
        status: "not_received",
        reviewer: null,
        receivedOn: null,
        notes: "",
      });
    }
  }
  return next;
}
