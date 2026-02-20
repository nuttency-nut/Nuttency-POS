import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  const [dragReadyCategoryId, setDragReadyCategoryId] = useState<string | null>(null);

  const getSiblings = (parent: string | null) =>
    categories
      .filter((c) => c.parent_id === parent)
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name, "vi");
      });

  const rootCategories = getSiblings(null);
  const getChildren = (catParentId: string) => getSiblings(catParentId);

  const openCreate = () => {
    setEditingCategory(null);
    setName("");
    setParentId(null);
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setParentId(cat.parent_id);
    setDialogOpen(true);
  };

  const openDelete = (cat: Category) => {
    setDeletingCategory(cat);
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

  const handleDrop = async (targetCategory: Category) => {
    if (!draggingCategoryId || draggingCategoryId === targetCategory.id) return;

    const dragged = categories.find((c) => c.id === draggingCategoryId);
    if (!dragged) return;
    if (dragged.parent_id !== targetCategory.parent_id) return;

    const siblings = getSiblings(targetCategory.parent_id);
    const fromIndex = siblings.findIndex((c) => c.id === dragged.id);
    const toIndex = siblings.findIndex((c) => c.id === targetCategory.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...siblings];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    await reorderCategories.mutateAsync({
      parentId: targetCategory.parent_id,
      orderedIds: next.map((c) => c.id),
    });

    setDraggingCategoryId(null);
    setDragReadyCategoryId(null);
  };

  const renderCategory = (cat: Category, level: number = 0) => {
    const children = getChildren(cat.id);
    const isSelected = selectedCategoryId === cat.id;
    const isDragging = draggingCategoryId === cat.id;
    const isDragReady = dragReadyCategoryId === cat.id;

    return (
      <div key={cat.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer",
            isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted active:bg-muted/80",
            isDragging && "opacity-70 scale-[0.99] shadow-sm",
            level > 0 && "ml-6"
          )}
          draggable={isDragReady}
          onClick={() => onSelectCategory?.(cat.id)}
          onDragStart={(e) => {
            if (!isDragReady) {
              e.preventDefault();
              return;
            }

            setDraggingCategoryId(cat.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", cat.id);
          }}
          onDragEnd={() => {
            setDraggingCategoryId(null);
            setDragReadyCategoryId(null);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => void handleDrop(cat)}
        >
          <button
            className={cn(
              "h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/70",
              isDragReady ? "cursor-grabbing" : "cursor-grab"
            )}
            draggable={false}
            onDragStart={(e) => {
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragReadyCategoryId(cat.id);
            }}
            onPointerUp={() => {
              if (draggingCategoryId !== cat.id) {
                setDragReadyCategoryId(null);
              }
            }}
            onPointerCancel={() => {
              if (draggingCategoryId !== cat.id) {
                setDragReadyCategoryId(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Drag reorder ${cat.name}`}
          >
            <GripVertical className="w-4 h-4" />
          </button>
          {children.length > 0 ? (
            <ChevronRight className={cn("w-4 h-4 transition-transform text-muted-foreground", isSelected && "rotate-90")} />
          ) : (
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
          )}
          <span className={cn("flex-1 text-sm", isSelected ? "font-semibold" : "font-medium")}>{cat.name}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                openEdit(cat);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                openDelete(cat);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {children.map((child) => renderCategory(child, level + 1))}
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
        rootCategories.map((cat) => renderCategory(cat))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Sửa danh mục" : "Thêm danh mục"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tên danh mục</label>
              <Input
                placeholder="VD: Đồ uống, Thức ăn..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Danh mục cha</label>
              <Select value={parentId || "none"} onValueChange={(v) => setParentId(v === "none" ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Không có" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có (gốc)</SelectItem>
                  {categories
                    .filter((c) => c.id !== editingCategory?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
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
