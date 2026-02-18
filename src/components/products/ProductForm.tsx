import { useState, useEffect, useRef } from "react";
import { Product, ProductFormValues, ClassificationGroupForm, ClassificationOptionForm } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useClassificationGroupNames } from "@/hooks/useClassifications";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Camera, X, GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";

interface ProductFormProps {
  product?: Product | null;
  onSave: (values: ProductFormValues) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

const emptyOption: ClassificationOptionForm = { name: "", extra_price: 0 };
const emptyGroup: ClassificationGroupForm = { name: "", allow_multiple: false, options: [{ ...emptyOption }] };

export default function ProductForm({ product, onSave, onCancel, isSaving }: ProductFormProps) {
  const { data: categories = [] } = useCategories();
  const { data: existingGroupNames = [] } = useClassificationGroupNames();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [costPrice, setCostPrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [unit, setUnit] = useState("cÃ¡i");
  const [isActive, setIsActive] = useState(true);
  const [minStock, setMinStock] = useState(0);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroupForm[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategoryId(product.category_id);
      setBarcode(product.barcode || "");
      setCostPrice(product.cost_price);
      setSellingPrice(product.selling_price);
      setUnit(product.unit);
      setIsActive(product.is_active);
      setMinStock(product.min_stock);
      setDescription(product.description || "");
      setImageUrl(product.image_url);
      // Load classification groups
      if (product.product_classification_groups && product.product_classification_groups.length > 0) {
        setClassificationGroups(
          product.product_classification_groups
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((g) => ({
              name: g.name,
              allow_multiple: g.allow_multiple,
              options: (g.product_classification_options || [])
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((o) => ({ name: o.name, extra_price: o.extra_price || 0 })),
            }))
        );
      }
    }
  }, [product]);

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lÃ²ng chá»n file áº£nh");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("áº¢nh khÃ´ng Ä‘Æ°á»£c vÆ°á»£t quÃ¡ 5MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      setImageUrl(urlData.publicUrl);
      toast.success("ÄÃ£ táº£i áº£nh lÃªn");
    } catch (err: any) {
      toast.error("Lá»—i táº£i áº£nh: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImageUrl(null);
  };

  // Classification group management
  const addGroup = () => {
    setClassificationGroups([...classificationGroups, { ...emptyGroup, options: [{ ...emptyOption }] }]);
  };

  const removeGroup = (index: number) => {
    setClassificationGroups(classificationGroups.filter((_, i) => i !== index));
  };

  const updateGroupName = (index: number, value: string) => {
    setClassificationGroups(
      classificationGroups.map((g, i) => (i === index ? { ...g, name: value } : g))
    );
  };

  const updateGroupMultiple = (index: number, checked: boolean) => {
    setClassificationGroups(
      classificationGroups.map((g, i) => (i === index ? { ...g, allow_multiple: checked } : g))
    );
  };

  const addOption = (groupIndex: number) => {
    setClassificationGroups(
      classificationGroups.map((g, i) =>
        i === groupIndex ? { ...g, options: [...g.options, { ...emptyOption }] } : g
      )
    );
  };

  const removeOption = (groupIndex: number, optionIndex: number) => {
    setClassificationGroups(
      classificationGroups.map((g, i) =>
        i === groupIndex
          ? { ...g, options: g.options.filter((_, j) => j !== optionIndex) }
          : g
      )
    );
  };

  const updateOption = (groupIndex: number, optionIndex: number, value: string) => {
    setClassificationGroups(
      classificationGroups.map((g, i) =>
        i === groupIndex
          ? { ...g, options: g.options.map((o, j) => (j === optionIndex ? { ...o, name: value } : o)) }
          : g
      )
    );
  };

  const updateOptionPrice = (groupIndex: number, optionIndex: number, price: number) => {
    setClassificationGroups(
      classificationGroups.map((g, i) =>
        i === groupIndex
          ? { ...g, options: g.options.map((o, j) => (j === optionIndex ? { ...o, extra_price: price } : o)) }
          : g
      )
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSave({
      name: name.trim(),
      category_id: categoryId,
      barcode,
      cost_price: costPrice,
      selling_price: sellingPrice,
      unit,
      is_active: isActive,
      min_stock: minStock,
      description,
      image_url: imageUrl,
      classification_groups: classificationGroups,
      variants: [],
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong safe-top">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <button onClick={onCancel} className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">
            {product ? "Sá»­a sáº£n pháº©m" : "ThÃªm sáº£n pháº©m"}
          </h1>
          <Button
            size="sm"
            className="rounded-xl h-9"
            onClick={handleSubmit}
            disabled={!name.trim() || isSaving}
          >
            {isSaving ? "Äang lÆ°u..." : "LÆ°u"}
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 pb-24 max-w-lg mx-auto space-y-6">
          {/* Image Upload - 1:1 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              HÃ¬nh áº£nh sáº£n pháº©m
            </h3>
            <div className="flex justify-center">
              <div
                className="relative w-40 h-40 rounded-2xl border-2 border-dashed border-border bg-muted/30 overflow-hidden cursor-pointer group"
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                {imageUrl ? (
                  <>
                    <img
                      src={imageUrl}
                      alt="áº¢nh sáº£n pháº©m"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors flex items-center justify-center">
                      <Camera className="w-6 h-6 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage();
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    {uploading ? (
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Camera className="w-8 h-8" />
                        <span className="text-xs">Táº£i áº£nh lÃªn</span>
                        <span className="text-[10px] text-muted-foreground/60">Tá»‰ lá»‡ 1:1</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </section>

          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              ThÃ´ng tin cÆ¡ báº£n
            </h3>

            <div>
              <label className="text-sm font-medium mb-1.5 block">TÃªn sáº£n pháº©m *</label>
              <Input
                placeholder="VD: CÃ  phÃª sá»¯a Ä‘Ã¡"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Danh má»¥c</label>
              <Select
                value={categoryId || "none"}
                onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chá»n danh má»¥c" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ChÆ°a phÃ¢n loáº¡i</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">MÃ£ barcode</label>
              <Input
                placeholder="QuÃ©t hoáº·c nháº­p mÃ£"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">ÄÆ¡n vá»‹ tÃ­nh</label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cÃ¡i">CÃ¡i</SelectItem>
                  <SelectItem value="ly">Ly</SelectItem>
                  <SelectItem value="pháº§n">Pháº§n</SelectItem>
                  <SelectItem value="kg">Kg</SelectItem>
                  <SelectItem value="há»™p">Há»™p</SelectItem>
                  <SelectItem value="chai">Chai</SelectItem>
                  <SelectItem value="gÃ³i">GÃ³i</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">MÃ´ táº£</label>
              <Textarea
                placeholder="MÃ´ táº£ sáº£n pháº©m..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </section>

          {/* Pricing */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              GiÃ¡
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">GiÃ¡ vá»‘n</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={costPrice || ""}
                  onChange={(e) => setCostPrice(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">GiÃ¡ bÃ¡n</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={sellingPrice || ""}
                  onChange={(e) => setSellingPrice(Number(e.target.value))}
                />
              </div>
            </div>
          </section>

          {/* Stock */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tá»“n kho
            </h3>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tá»“n kho tá»‘i thiá»ƒu</label>
              <Input
                type="number"
                placeholder="0"
                value={minStock || ""}
                onChange={(e) => setMinStock(Number(e.target.value))}
              />
            </div>
          </section>

          {/* Classification Groups */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                PhÃ¢n loáº¡i hÃ ng
              </h3>
            </div>

            {classificationGroups.map((group, gIndex) => (
              <div
                key={gIndex}
                className="rounded-xl bg-card border border-border/50 overflow-hidden"
              >
                {/* Group header */}
                <div className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[60px]">
                      PhÃ¢n loáº¡i {gIndex + 1}
                    </label>
                    <div className="relative flex-1">
                      <Input
                        placeholder="VD: MÃ u sáº¯c, Size..."
                        value={group.name}
                        onChange={(e) => updateGroupName(gIndex, e.target.value)}
                        list={`group-names-${gIndex}`}
                        className="pr-12"
                        maxLength={14}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50">
                        {group.name.length}/14
                      </span>
                      <datalist id={`group-names-${gIndex}`}>
                        {existingGroupNames.map((n) => (
                          <option key={n} value={n} />
                        ))}
                      </datalist>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => removeGroup(gIndex)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Allow multiple checkbox */}
                  <div className="flex items-center gap-2 pl-[68px]">
                    <Checkbox
                      id={`multi-${gIndex}`}
                      checked={group.allow_multiple}
                      onCheckedChange={(checked) =>
                        updateGroupMultiple(gIndex, checked === true)
                      }
                    />
                    <label
                      htmlFor={`multi-${gIndex}`}
                      className="text-xs text-muted-foreground cursor-pointer select-none"
                    >
                      Chá»n nhiá»u (cho phÃ©p chá»n nhiá»u hÆ¡n 1 khi bÃ¡n hÃ ng)
                    </label>
                  </div>

                  {/* Options */}
                  <div className="space-y-2 pl-[68px]">
                    <label className="text-xs font-medium text-muted-foreground">TÃ¹y chá»n</label>
                    <div className="space-y-2">
                      {group.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <Input
                              placeholder="TÃªn"
                              value={option.name}
                              onChange={(e) =>
                                updateOption(gIndex, oIndex, e.target.value)
                              }
                              className="h-8 text-sm pr-10"
                              maxLength={20}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/50">
                              {option.name.length}/20
                            </span>
                          </div>
                          <div className="relative w-24">
                            <Input
                              type="number"
                              placeholder="+0Ä‘"
                              value={option.extra_price || ""}
                              onChange={(e) =>
                                updateOptionPrice(gIndex, oIndex, Number(e.target.value))
                              }
                              className="h-8 text-sm pl-3 pr-6"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/50">Ä‘</span>
                          </div>
                          {group.options.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => removeOption(gIndex, oIndex)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg gap-1 text-xs"
                        onClick={() => addOption(gIndex)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5 h-9 w-full border-dashed text-primary"
              onClick={addGroup}
            >
              <Plus className="w-4 h-4" />
              ThÃªm nhÃ³m phÃ¢n loáº¡i {classificationGroups.length + 1}
            </Button>
          </section>

          {/* Status */}
          <section className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/50">
            <div>
              <h4 className="text-sm font-medium">Äang kinh doanh</h4>
              <p className="text-xs text-muted-foreground">
                Táº¯t náº¿u ngá»«ng bÃ¡n sáº£n pháº©m nÃ y
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

