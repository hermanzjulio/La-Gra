"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type Category } from "@/lib/db";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import { toast } from "sonner";

const EMOJI_OPTIONS = ["🍺","🥃","🍶","🍷","🍹","🥤","🍽️","💧","📦","☕","🧊","🍸","🥂","🍰","🥘","🍗","🐟","🌶️"];

export function Categories() {
  const { currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const categories = useLiveQuery(() => db.categories.orderBy("sortOrder").toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  if (!categories) return null;

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(c: Category) { setEditing(c); setOpen(true); }

  async function handleDelete(id: number, name: string) {
    const count = products?.filter(p => p.categoryId === id).length ?? 0;
    if (count > 0) {
      toast.error(`Cannot delete — ${count} products use this category. Reassign them first.`);
      return;
    }
    if (!confirm(`Delete category "${name}"?`)) return;
    await db.categories.delete(id);
    if (currentUser) await logAudit(currentUser.id!, "category_delete", `Deleted category: ${name}`, "category", String(id));
    toast.success("Category deleted");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-sm text-muted-foreground">{categories.length} categories</p>
        </div>
        <Button onClick={openNew} className="bg-gold-gradient text-black hover:opacity-90 shadow-gold">
          <Plus className="mr-2 h-4 w-4" /> Add Category
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Order</TableHead>
              <TableHead>Icon</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Color</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => {
              const count = products?.filter(p => p.categoryId === c.id).length ?? 0;
              return (
                <TableRow key={c.id} className="border-border">
                  <TableCell className="text-muted-foreground text-xs">{c.sortOrder}</TableCell>
                  <TableCell><span className="text-2xl">{c.icon}</span></TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full" style={{ background: c.color }} />
                      <span className="text-xs text-muted-foreground">{c.color}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{count}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={c.active} onCheckedChange={async (v) => {
                      await db.categories.update(c.id!, { active: v });
                    }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id!, c.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} onSaved={() => { setOpen(false); toast.success(editing ? "Category updated" : "Category added"); }} />
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, category, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; category: Category | null; onSaved: () => void;
}) {
  const { currentUser } = useStore();
  const [form, setForm] = useState<Partial<Category>>({});

  if (open && form.id !== category?.id && (form.name === undefined || (category && form.id !== category.id))) {
    if (category) setForm(category);
    else if (!form.name) setForm({ name: "", icon: "🍺", color: "#c9a227", sortOrder: 1, active: true });
  }

  async function save() {
    if (!form.name) { toast.error("Name is required"); return; }
    const data = {
      name: form.name!,
      icon: form.icon || "📦",
      color: form.color || "#c9a227",
      sortOrder: Number(form.sortOrder) || 1,
      active: form.active ?? true,
    };
    if (category) {
      await db.categories.update(category.id!, data);
      if (currentUser) await logAudit(currentUser.id!, "category_update", `Updated category: ${data.name}`, "category", String(category.id));
    } else {
      const id = await db.categories.add(data as Category);
      if (currentUser) await logAudit(currentUser.id!, "category_create", `Created category: ${data.name}`, "category", String(id));
    }
    onSaved();
    setForm({});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card-gradient border-border max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Edit Category" : "Add Category"}</DialogTitle>
          <DialogDescription>{category ? "Update category" : "Create a new product category"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cocktails" />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((e) => (
                <button key={e} onClick={() => setForm({ ...form, icon: e })}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition ${form.icon === e ? "border-primary bg-primary/15" : "border-border hover:border-primary/40"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                <input type="color" value={form.color ?? "#c9a227"} onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-10 w-12 rounded-md border border-border bg-background/50" />
                <Input value={form.color ?? ""} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input type="number" value={form.sortOrder ?? 1} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="cat-active" checked={form.active ?? true} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label htmlFor="cat-active">Active</Label>
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
