import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDdStore } from "@/lib/store";
import { KIND_LABEL, type CategoryId, type FileKind } from "@/lib/types";

const KINDS = Object.keys(KIND_LABEL) as FileKind[];

export function AddDocumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const categories = useDdStore((s) => s.categories);
  const addDocument = useDdStore((s) => s.addDocument);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<CategoryId>(categories[0]?.id ?? "");
  const [kind, setKind] = useState<FileKind>("pdf");
  const [period, setPeriod] = useState("");

  useEffect(() => {
    if (!categories.some((c) => c.id === categoryId)) {
      setCategoryId(categories[0]?.id ?? "");
    }
  }, [categories, categoryId]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("File name is required");
      return;
    }
    addDocument({
      categoryId,
      name: name.trim(),
      kind,
      period: period.trim() || undefined,
    });
    toast("File added to the room");
    setName("");
    setPeriod("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add a client file</DialogTitle>
        <DialogDescription>
          Record a document that came in after the first data-room drop.
        </DialogDescription>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="file-name">Name</Label>
            <Input
              id="file-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Form 1120-REIT 2022"
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => setCategoryId(v as CategoryId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FileKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="file-period">Period (optional)</Label>
            <Input
              id="file-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2025"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Add file</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
