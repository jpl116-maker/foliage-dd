import type { IssueSeverity, IssueStatus, ReviewStatus } from "@/lib/types";

export function statusTone(
  status: ReviewStatus,
): "muted" | "info" | "warn" | "ok" | "danger" {
  switch (status) {
    case "not_received":
    case "not_applicable":
      return "muted";
    case "received":
      return "info";
    case "in_review":
      return "warn";
    case "reviewed":
      return "ok";
    case "exception":
      return "danger";
  }
}

export function severityTone(
  severity: IssueSeverity,
): "danger" | "warn" | "info" | "muted" {
  switch (severity) {
    case "critical":
      return "danger";
    case "high":
      return "warn";
    case "medium":
      return "info";
    case "low":
      return "muted";
  }
}

export function issueStatusTone(
  status: IssueStatus,
): "danger" | "warn" | "ok" {
  switch (status) {
    case "open":
      return "danger";
    case "monitoring":
      return "warn";
    case "resolved":
      return "ok";
  }
}

export function daysUntil(iso: string, from = new Date()): number {
  const due = new Date(`${iso}T12:00:00`);
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

export function formatDay(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatStamp(iso: string) {
  const d = iso.includes("T") ? new Date(iso) : new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
