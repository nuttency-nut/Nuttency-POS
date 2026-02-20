import { useEffect, useMemo, useRef, useState } from "react";
import Sortable from "sortablejs";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useReorderCategories,
  Category,
} from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, FolderOpen, ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryManagerProps {
  onSelectCategory?: (categoryId: string | null) => void;
  selectedCategoryId?: string | null;
}

const ROOT_PARENT_KEY = "__root__";

const parentToKey = (parentId: string | null) => parentId ?? ROOT_PARENT_KEY;
const keyToParent = (key: string) => (key === ROOT_PARENT_KEY ? null : key);

const getSortedSiblings = (allCategories: Category[], parentId: string | null) =>
  allCategories
    .filter((category) => category.parent_id === parentId)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name, "vi");
    });

export default function CategoryManager({ onSelectCategory, selectedCategoryId }: CategoryManagerProps) {
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const reorderCategories = useReorderCategories();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);

  const categoriesRef = useRef<Category[]>(categories);
  const listRefs = useRef(new Map<string, HTMLDivElement>());
  const sortableRefs = useRef(new Map<string, Sortable>());

  categoriesRef.current = categories;

  const getSiblings = (parent: string | null) => getSortedSiblings(categories, parent);
  const getChildren = (catParentId: string) => getSiblings(catParentId);

  const setListRef = (parent: string | null, el: HTMLDivElement | null) => {
    const key = parentToKey(parent);

    if (el) {
      listRefs.current.set(key, el);
      return;
    }

    listRefs.current.delete(key);
    const sortable = sortableRefs.current.get(key);
    if (sortable) {
      sortable.destroy();
      sortableRefs.current.delete(key);
    }
  };

  useEffect(() => {
    const sortableMap = sortableRefs.current;

    listRefs.current.forEach((container, key) => {
      if (sortableMap.has(key)) return;

      const parentForList = keyToParent(key);

      const sortable = Sortable.create(container, {
        animation: 180,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        handle: ".category-drag-handle",
        draggable: ".category-sortable-item",
        filter: ".category-actions",
        preventOnFilter: false,
        ghostClass: "category-sortable-ghost",
        chosenClass: "category-sortable-chosen",
        dragClass: "category-sortable-drag",
        fallbackOnBody: true,
        forceFallback: false,
        invertSwap: true,
        delayOnTouchOnly: true,
        delay: 100,
        touchStartThreshold: 4,
        fallbackTolerance: 4,
        swapThreshold: 0.65,
        onStart: (evt) => {
          const categoryId = (evt.item as HTMLElement).dataset.categoryId ?? null;
          setDraggingCategoryId(categoryId);
          evt.item.classList.add("category-sorting-item");
        },
        onClone: (evt) => {
          evt.clone.querySelectorAll("[data-parent-id]").forEach((nestedList) => {
            nestedList.remove();
          });
        },
        onEnd: async (evt) => {
          evt.item.classList.remove("category-sorting-item");
          setDraggingCategoryId(null);

          const movedId = (evt.item as HTMLElement).dataset.categoryId;
          if (!movedId || evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) {
            return;
          }

          const orderedIds = Array.from(container.children)
            .map((child) => (child as HTMLElement).dataset.categoryId)
            .filter((id): id is string => Boolean(id));

          const currentSiblings = getSortedSiblings(categoriesRef.current, parentForList);
          const currentIds = currentSiblings.map((category) => category.id);

          if (
            orderedIds.length !== currentIds.length ||
            orderedIds.every((id, index) => id === currentIds[index])
          ) {
            return;
          }

          try {
            await reorderCategories.mutateAsync({
              parentId: parentForList,
              orderedIds,
            });
          } catch {
            // Ignore here; query invalidation in hooks will sync UI back.
          }
        },
      });

      sortableMap.set(key, sortable);
    });

    sortableMap.forEach((sortable, key) => {
      if (listRefs.current.has(key)) return;
      sortable.destroy();
      sortableMap.delete(key);
    });
  }, [categories, reorderCategories]);

  useEffect(() => {
    return () => {
      sortableRefs.current.forEach((sortable) => sortable.destroy());
      sortableRefs.current.clear();
    };
  }, []);

  const openCreate = () => {
    setEditingCategory(null);
    setName("");
    setParentId(null);
    setDialogOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setParentId(category.parent_id);
    setDialogOpen(true);
  };

  const openDelete = (category: Category) => {
    setDeletingCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    if (editingCategory) {
      await updateCategory.mutateAsync({ id: editingCategory.id, name: name.trim(), parent_id: parentId });
    } else {
      await createCategory.mutateAsync({ name: name.trim(), parent_id: parentId });
    }

    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;

    await deleteCategory.mutateAsync(deletingCategory.id);
    setDeleteDialogOpen(false);

    if (selectedCategoryId === deletingCategory.id) {
      onSelectCategory?.(null);
    }
  };

  const allParentOptions = useMemo(
    () => categories.filter((category) => category.id !== editingCategory?.id),
    [categories, editingCategory?.id]
  );

  const renderCategory = (category: Category, level = 0) => {
    const children = getChildren(category.id);
    const isSelected = selectedCategoryId === category.id;
    const isDragging = draggingCategoryId === category.id;

    return (
      <div key={category.id} className={cn("category-sortable-item", level > 0 && "ml-6")} data-category-id={category.id}>
        <div
          className={cn(
            "category-row flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer",
            isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted active:bg-muted/80",
            isDragging && "ring-1 ring-primary/30"
          )}
          onClick={() => onSelectCategory?.(category.id)}
        >
          <button
            type="button"
            className="category-drag-handle h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-muted/70"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Kéo sắp xếp ${category.name}`}
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {children.length > 0 ? (
            <ChevronRight className={cn("w-4 h-4 transition-transform text-muted-foreground", isSelected && "rotate-90")} />
          ) : (
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
          )}

          <span className={cn("flex-1 text-sm", isSelected ? "font-semibold" : "font-medium")}>{category.name}</span>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="category-actions h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(category);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="category-actions h-7 w-7 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                openDelete(category);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {children.length > 0 && renderCategoryList(category.id, level + 1)}
      </div>
    );
  };

  const renderCategoryList = (parent: string | null, level = 0) => {
    const siblingCategories = getSiblings(parent);

    return (
      <div ref={(el) => setListRef(parent, el)} className="space-y-1" data-parent-id={parent ?? ""}>
        {siblingCategories.map((category) => renderCategory(category, level))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Danh mục</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openCreate}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer",
          !selectedCategoryId ? "bg-primary/10 text-primary" : "hover:bg-muted"
        )}
        onClick={() => onSelectCategory?.(null)}
      >
        <FolderOpen className="w-4 h-4" />
        <span className={cn("text-sm", !selectedCategoryId ? "font-semibold" : "font-medium")}>Tất cả</span>
      </div>

      {isLoading ? (
        <div className="space-y-2 px-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        renderCategoryList(null)
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Sửa danh mục" : "Thêm danh mục"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tên danh mục</label>
              <Input placeholder="VD: Đồ uống, Thức ăn..." value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Danh mục cha</label>
              <Select value={parentId || "none"} onValueChange={(value) => setParentId(value === "none" ? null : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Không có" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có (gốc)</SelectItem>
                  {allParentOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || createCategory.isPending || updateCategory.isPending}>
              {editingCategory ? "Lưu" : "Thêm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-sm mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa danh mục?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa danh mục "{deletingCategory?.name}"? Các sản phẩm trong danh mục này sẽ không bị xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
