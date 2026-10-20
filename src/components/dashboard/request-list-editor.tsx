import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ensureCategoryFolders, ensureRequestFolders } from "@/lib/data-room";
import { saveRequestList } from "@/lib/request-list-db";
import { useDdStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { useRole } from "@/components/auth/role-provider";
import { useProject } from "@/components/project/project-provider";

type DraftItem = {
  id: string;
  name: string;
  detail: string;
  isNew?: boolean;
};

type DraftCategory = {
  id: string;
  name: string;
  isNew?: boolean;
  items: DraftItem[];
};

function snapshotDraft(
  categories: { id: string; name: string }[],
  requests: { id: string; categoryId: string; name: string; detail: string }[],
): DraftCategory[] {
  return categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    items: requests
      .filter((r) => r.categoryId === cat.id)
      .map((r) => ({ id: r.id, name: r.name, detail: r.detail })),
  }));
}

export function RequestListEditor() {
  const { can } = useRole();
  const project = useProject();
  const categories = useDdStore((s) => s.categories);
  const requests = useDdStore((s) => s.requests) ?? [];
  const workspace = useDdStore((s) => s.workspace);
  const updateRequestItem = useDdStore((s) => s.updateRequestItem);
  const addCategory = useDdStore((s) => s.addCategory);
  const updateCategory = useDdStore((s) => s.updateCategory);
  const addRequestItem = useDdStore((s) => s.addRequestItem);
  const removeRequestItem = useDdStore((s) => s.removeRequestItem);
  const removeCategory = useDdStore((s) => s.removeCategory);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftCategory[]>([]);
  const [addCategoryId, setAddCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addDetail, setAddDetail] = useState("");

  const original = useMemo(
    () => snapshotDraft(categories, requests),
    [categories, requests],
  );

  function openEditor() {
    const next = snapshotDraft(categories, requests);
    setDraft(next);
    setAddCategoryId(next[0]?.id ?? "");
    setNewCategoryName("");
    setAddTitle("");
    setAddDetail("");
    setOpen(true);
  }

  function setCategoryName(catId: string, name: string) {
    setDraft((cur) => cur.map((cat) => (cat.id === catId ? { ...cat, name } : cat)));
  }

  function setItem(
    catId: string,
    itemId: string,
    patch: Partial<Pick<DraftItem, "name" | "detail">>,
  ) {
    setDraft((cur) =>
      cur.map((cat) =>
        cat.id === catId
          ? {
              ...cat,
              items: cat.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item,
              ),
            }
          : cat,
      ),
    );
  }

  function addDraftItem(catId: string) {
    setDraft((cur) =>
      cur.map((cat) =>
        cat.id === catId
          ? {
              ...cat,
              items: [
                ...cat.items,
                { id: uid("r"), name: "", detail: "", isNew: true },
              ],
            }
          : cat,
      ),
    );
  }

  function removeDraftItem(catId: string, itemId: string) {
    setDraft((cur) =>
      cur.map((cat) =>
        cat.id === catId
          ? { ...cat, items: cat.items.filter((item) => item.id !== itemId) }
          : cat,
      ),
    );
  }

  function removeDraftCategory(catId: string) {
    setDraft((cur) => cur.filter((cat) => cat.id !== catId));
    setAddCategoryId((cur) => (cur === catId ? "" : cur));
  }

  function withPendingAdds(): DraftCategory[] | null {
    const title = addTitle.trim();
    const detail = addDetail.trim();
    const catName = newCategoryName.trim();
    if (!title && !detail && !catName) return draft;
    if (catName && !title && !detail) {
      return [...draft, { id: uid("cat"), name: catName, isNew: true, items: [] }];
    }
    if (!title || !detail) {
      toast("Title and explanation are required");
      return null;
    }
    const where = addCategoryId || draft[0]?.id;
    if (!where) {
      toast("Pick a category");
      return null;
    }
    return draft.map((cat) =>
      cat.id === where
        ? {
            ...cat,
            items: [
              ...cat.items,
              { id: uid("r"), name: title, detail, isNew: true },
            ],
          }
        : cat,
    );
  }

  function onAddItem(e: FormEvent) {
    e.preventDefault();
    const next = withPendingAdds();
    if (!next) return;
    setDraft(next);
    setAddTitle("");
    setAddDetail("");
    setNewCategoryName("");
  }

  function onAddCategory(e: FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) {
      toast("Name the new category");
      return;
    }
    setDraft((cur) => [...cur, { id: uid("cat"), name, isNew: true, items: [] }]);
    setNewCategoryName("");
  }

  async function save() {
    const next = withPendingAdds();
    if (!next) return;

    const origCats = new Map(original.map((c) => [c.id, c]));
    const origItems = new Map(original.flatMap((c) => c.items.map((i) => [i.id, i])));
    const keepCats = new Set(next.map((c) => c.id));
    const keepItems = new Set(next.flatMap((c) => c.items.map((i) => i.id)));

    for (const cat of original) {
      if (!keepCats.has(cat.id)) {
        removeCategory(cat.id);
        continue;
      }
      for (const item of cat.items) {
        if (!keepItems.has(item.id)) removeRequestItem(item.id);
      }
    }

    for (const cat of next) {
      const name = cat.name.trim();
      if (!name) {
        toast("Every category needs a name");
        return;
      }
      if (cat.isNew) addCategory({ id: cat.id, name });
      else if (origCats.get(cat.id)?.name !== name) {
        updateCategory(cat.id, { name });
      }
      for (const item of cat.items) {
        const itemName = item.name.trim();
        const itemDetail = item.detail.trim();
        if (item.isNew && !itemName && !itemDetail) continue;
        if (!itemName || !itemDetail) {
          toast("Every line item needs a title and explanation");
          return;
        }
        if (item.isNew) {
          addRequestItem({ categoryId: cat.id, name: itemName, detail: itemDetail });
          continue;
        }
        const prev = origItems.get(item.id);
        if (!prev || prev.name !== itemName || prev.detail !== itemDetail) {
          updateRequestItem(item.id, { name: itemName, detail: itemDetail });
        }
      }
    }

    const cats = next.map((c) => ({ id: c.id, name: c.name.trim() }));
    const state = useDdStore.getState();
    try {
      await saveRequestList({
        data: {
          projectId: project.id,
          workspace,
          categories: state.categories.map((c) => ({
            id: c.id,
            name: c.name,
            blurb: c.blurb,
          })),
          requests: (state.requests ?? []).map((r) => ({
            id: r.id,
            categoryId: r.categoryId,
            documentId: r.documentId ?? null,
            name: r.name,
            detail: r.detail,
            status: r.status,
            comments: r.comments ?? [],
            linkedFiles: r.linkedFiles ?? [],
          })),
        },
      });
      await ensureCategoryFolders({
        data: { projectId: project.id, workspace, categories: cats },
      });
      await ensureRequestFolders({
        data: {
          projectId: project.id,
          workspace,
          items: (useDdStore.getState().requests ?? [])
            .filter((r) => r.documentId)
            .map((r) => ({
              documentId: r.documentId as string,
              categoryId: r.categoryId,
              name: r.name.slice(0, 120),
            })),
        },
      });
    } catch {
      toast("Saved the list, but data-room folders could not be updated");
    }
    toast("Request list updated");
    setOpen(false);
  }

  if (!can("editRequestList")) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 shrink-0"
        onClick={openEditor}
      >
        <Pencil className="size-4" />
        Edit list
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Edit request list</DialogTitle>
          <DialogDescription>
            Edit category titles, line items, or add a heading without an item.
          </DialogDescription>
          <div className="mt-4 grid gap-5">
            {draft.map((cat) => (
              <section key={cat.id} className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`cat-name-${cat.id}`} className="sr-only">
                    Category title
                  </Label>
                  <Input
                    id={`cat-name-${cat.id}`}
                    value={cat.name}
                    onChange={(e) => setCategoryName(cat.id, e.target.value)}
                    placeholder="Category title"
                    className="font-medium"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => addDraftItem(cat.id)}
                  >
                    <Plus className="size-4" />
                    Add item
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted hover:text-danger"
                    aria-label={`Delete category ${cat.name || "untitled"}`}
                    onClick={() => removeDraftCategory(cat.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-md bg-paper p-3 shadow-[var(--shadow-border)]"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid min-w-0 flex-1 gap-2">
                        <Label htmlFor={`req-name-${item.id}`} className="sr-only">
                          Title
                        </Label>
                        <Input
                          id={`req-name-${item.id}`}
                          value={item.name}
                          onChange={(e) =>
                            setItem(cat.id, item.id, { name: e.target.value })
                          }
                          placeholder="Title"
                        />
                        <Label htmlFor={`req-detail-${item.id}`} className="sr-only">
                          Explanation
                        </Label>
                        <Textarea
                          id={`req-detail-${item.id}`}
                          value={item.detail}
                          onChange={(e) =>
                            setItem(cat.id, item.id, { detail: e.target.value })
                          }
                          placeholder="What is requested"
                          className="min-h-20 bg-paper"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted hover:text-danger"
                        aria-label={`Delete ${item.name || "item"}`}
                        onClick={() => removeDraftItem(cat.id, item.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            ))}
            <form className="grid gap-3 border-t border-border pt-4" onSubmit={onAddItem}>
              <h3 className="text-sm font-medium text-ink">Add a line item</h3>
              <div className="grid gap-1.5">
                <Label htmlFor="req-add-where">Add under</Label>
                <select
                  id="req-add-where"
                  className="h-11 w-full rounded-md bg-paper px-3 text-sm text-ink shadow-[var(--shadow-border)]"
                  value={addCategoryId}
                  onChange={(e) => setAddCategoryId(e.target.value)}
                >
                  {draft
                    .filter((cat) => cat.name.trim())
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="req-add-title">Title</Label>
                <Input
                  id="req-add-title"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Document or request title"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="req-add-detail">Explanation</Label>
                <Textarea
                  id="req-add-detail"
                  value={addDetail}
                  onChange={(e) => setAddDetail(e.target.value)}
                  placeholder="What should be produced"
                  className="min-h-20"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" size="sm">
                  <Plus className="size-4" />
                  Add to list
                </Button>
              </div>
            </form>
            <form
              className="grid gap-3 border-t border-border pt-4"
              onSubmit={onAddCategory}
            >
              <h3 className="text-sm font-medium text-ink">Add a category</h3>
              <div className="grid gap-1.5">
                <Label htmlFor="req-add-cat">Category title</Label>
                <Input
                  id="req-add-cat"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. International tax"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" size="sm">
                  <Plus className="size-4" />
                  Add category
                </Button>
              </div>
            </form>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
