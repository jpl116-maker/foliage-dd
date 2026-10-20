import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDdStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function IssueDeleteButton({
  id,
  title,
  tone = "light",
  className,
}: {
  id: string;
  title: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const removeIssue = useDdStore((s) => s.removeIssue);
  const [open, setOpen] = useState(false);

  function confirm() {
    removeIssue(id);
    setOpen(false);
    toast("Issue deleted");
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={tone === "dark" ? "ghost" : "outline"}
        className={cn(
          "h-11 text-xs",
          tone === "dark"
            ? "text-paper/80 hover:bg-paper/10 hover:text-paper"
            : "text-danger hover:bg-danger/10",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Delete this issue?</DialogTitle>
          <DialogDescription>
            {title} will be removed from the list. This cannot be undone.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirm}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
