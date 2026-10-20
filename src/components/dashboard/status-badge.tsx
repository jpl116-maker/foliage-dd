import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status";
import { STATUS_LABEL, type ReviewStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={statusTone(status)}>{STATUS_LABEL[status]}</Badge>;
}
