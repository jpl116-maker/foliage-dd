import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { RaiseIssueDialog } from "@/components/dashboard/raise-issue-dialog";
import { formatDay, severityTone } from "@/lib/status";
import { useDdStore } from "@/lib/store";
import {
  KIND_LABEL,
  REVIEW_STATUSES,
  SEVERITY_LABEL,
  STATUS_LABEL,
  type DdDocument,
  type ReviewStatus,
} from "@/lib/types";

export function DocumentDialog({
  document,
  open,
  onOpenChange,
}: {
  document: DdDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setDocumentStatus = useDdStore((s) => s.setDocumentStatus);
  const setDocumentNotes = useDdStore((s) => s.setDocumentNotes);
  const issues = useDdStore((s) => s.issues);
  const categories = useDdStore((s) => s.categories);
  const [raiseOpen, setRaiseOpen] = useState(false);

  if (!document) return null;

  const cat = categories.find((c) => c.id === document.categoryId);
  const related = issues.filter((i) => i.documentId === document.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>
            {document.name}
            {document.period ? (
              <span className="text-muted"> · {document.period}</span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {cat?.name} · {KIND_LABEL[document.kind]}
            {document.receivedOn
              ? ` · in room ${formatDay(document.receivedOn)}`
              : " · not yet received"}
          </DialogDescription>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="doc-status">Review status</Label>
              <Select
                value={document.status}
                onValueChange={(value) => {
                  setDocumentStatus(document.id, value as ReviewStatus);
                  toast(`Marked ${STATUS_LABEL[value as ReviewStatus].toLowerCase()}`);
                }}
              >
                <SelectTrigger id="doc-status" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {STATUS_LABEL[st]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="doc-notes">Workpaper notes</Label>
              <Textarea
                id="doc-notes"
                key={document.id}
                defaultValue={document.notes}
                placeholder="Findings, follow-ups, who last looked at this…"
                onBlur={(e) => {
                  if (e.target.value !== document.notes) {
                    setDocumentNotes(document.id, e.target.value);
                    toast("Notes saved");
                  }
                }}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>Issues on this file</Label>
                <StatusBadge status={document.status} />
              </div>
              {related.length === 0 ? (
                <p className="text-sm text-muted">None raised yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {related.map((issue) => (
                    <li
                      key={issue.id}
                      className="rounded-md bg-paper px-3 py-2 shadow-[var(--shadow-border)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">
                          {issue.title}
                        </span>
                        <Badge tone={severityTone(issue.severity)}>
                          {SEVERITY_LABEL[issue.severity]}
                        </Badge>
                      </div>
                      {issue.codeSection ? (
                        <p className="mt-0.5 font-mono text-xs text-muted">
                          {issue.codeSection}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button
              variant="outline"
              onClick={() => setRaiseOpen(true)}
              className="justify-center"
            >
              Raise issue from this file
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <RaiseIssueDialog
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        presetDocumentId={document.id}
        presetCategoryId={document.categoryId}
      />
    </>
  );
}
