"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type Product } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatUGX } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function Products() {
  const { currentUser } = useStore();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const products = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  if (!products || !categories) return null;

  const filtered = products
    .filter((p) => filterCat === "all" || String(p.categoryId) === filterCat)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(search.toLowerCase()));

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setOpen(true);
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await db.products.delete(id);
    if (currentUser) await logAudit(currentUser.id!, "product_delete", `Deleted product: ${name}`, "product", String(id));
    toast.success("Product deleted");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{products.length} products · {products.filter(p => p.active).length} active</p>
        </div>
        <Button onClick={openNew} className="bg-gold-gradient text-black hover:opacity-90 shadow-gold">
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or SKU…" className="pl-10" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const cat = categories.find((c) => c.id === p.categoryId);
              const margin = p.price > 0 ? ((p.price - p.costPrice) / p.price) * 100 : 0;
              const isLow = p.reorderLevel > 0 && p.stock <= p.reorderLevel;
              const isOut = p.reorderLevel > 0 && p.stock === 0;
              return (
                <TableRow key={p.id} className="border-border">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat?.icon ?? "📦"}</span>
                      <span>{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{cat?.name}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{formatUGX(p.price)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatUGX(p.costPrice)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={margin >= 40 ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>
                      {Math.round(margin)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.reorderLevel === 0 ? (
                      <span className="text-muted-foreground text-xs">∞</span>
                    ) : (
                      <Badge variant={isOut ? "destructive" : isLow ? "secondary" : "outline"} className={isLow && !isOut ? "bg-amber-500/20 text-amber-300" : ""}>
                        {p.stock} {p.unit}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={p.active} onCheckedChange={async (v) => {
                      await db.products.update(p.id!, { active: v });
                    }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id!, p.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8 opacity-30" /> No products found
          </div>
        )}
      </div>

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        categories={categories}
        onSaved={() => {
          setOpen(false);
          toast.success(editing ? "Product updated" : "Product added");
        }}
      />
    </div>
  );
}

function ProductDialog({
  open, onOpenChange, product, categories, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: Product | null;
  categories: any[];
  onSaved: () => void;
}) {
  const { currentUser } = useStore();
  const [form, setForm] = useState<Partial<Product>>({});

  // Reset form when dialog opens
  useState(() => {
    if (product) setForm(product);
    else setForm({
      name: "", sku: "", price: 0, costPrice: 0, stock: 0, reorderLevel: 0,
      unit: "bottle", active: true, categoryId: categories[0]?.id,
    });
  });

  // Sync form on open/product change
  if (open && form.id !== product?.id && (form.name === undefined || (product && form.id !== product.id))) {
    if (product) setForm(product);
    else if (!form.name) setForm({
      name: "", sku: "", price: 0, costPrice: 0, stock: 0, reorderLevel: 0,
      unit: "bottle", active: true, categoryId: categories[0]?.id,
    });
  }

  async function save() {
    if (!form.name || form.price == null) {
      toast.error("Name and price are required");
      return;
    }
    const data = {
      name: form.name!,
      sku: form.sku || undefined,
      categoryId: form.categoryId ?? categories[0]?.id,
      price: Number(form.price) || 0,
      costPrice: Number(form.costPrice) || 0,
      stock: Number(form.stock) || 0,
      reorderLevel: Number(form.reorderLevel) || 0,
      unit: form.unit || "bottle",
      active: form.active ?? true,
      createdAt: form.createdAt ?? new Date().toISOString(),
    };
    if (product) {
      await db.products.update(product.id!, data);
      if (currentUser) await logAudit(currentUser.id!, "product_update", `Updated product: ${data.name}`, "product", String(product.id));
    } else {
      const id = await db.products.add(data as Product);
      if (currentUser) await logAudit(currentUser.id!, "product_create", `Created product: ${data.name}`, "product", String(id));
    }
    onSaved();
    setForm({});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card-gradient border-border max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>{product ? "Update product details" : "Create a new product"}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nile Special 500ml" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={String(form.categoryId ?? "")} onValueChange={(v) => setForm({ ...form, categoryId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="BEER-NILE-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Selling Price (UGX) *</Label>
              <Input type="number" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Cost Price (UGX)</Label>
              <Input type="number" value={form.costPrice ?? 0} onChange={(e) => setForm({ ...form, costPrice: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Stock</Label>
              <Input type="number" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} disabled={!!product} />
              {product && <p className="text-[10px] text-muted-foreground">Use stock receiving to add</p>}
            </div>
            <div className="space-y-2">
              <Label>Reorder At</Label>
              <Input type="number" value={form.reorderLevel ?? 0} onChange={(e) => setForm({ ...form, reorderLevel: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input value={form.unit ?? "bottle"} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="bottle" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="active" checked={form.active ?? true} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label htmlFor="active">Active (available for sale)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} className="bg-gold-gradient text-black hover:opacity-90">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
