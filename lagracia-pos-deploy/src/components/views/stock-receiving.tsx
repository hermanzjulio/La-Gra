"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type StockMovement } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatUGX, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Truck, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface ReceiveLine {
  productId: number;
  qty: number;
  costPrice: number;
}

export function StockReceiving() {
  const { currentUser } = useStore();
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const products = useLiveQuery(() => db.products.toArray(), []);
  const movements = useLiveQuery(() =>
    db.stockMovements.where("type").equals("receiving").reverse().sortBy("createdAt"), []);

  if (!products) return null;

  function addLine(productId: string) {
    if (!productId) return;
    const id = parseInt(productId);
    if (lines.find((l) => l.productId === id)) {
      toast.error("Product already added");
      return;
    }
    const p = products?.find((x) => x.id === id);
    setLines([...lines, { productId: id, qty: 0, costPrice: p?.costPrice ?? 0 }]);
    setSelectedProduct("");
  }

  function updateLine(idx: number, patch: Partial<ReceiveLine>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setLines(lines.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!currentUser) return;
    if (!supplier) { toast.error("Supplier name required"); return; }
    if (lines.length === 0) { toast.error("Add at least one product"); return; }
    if (lines.some((l) => l.qty <= 0)) { toast.error("All quantities must be greater than 0"); return; }

    try {
      const now = new Date().toISOString();
      await db.transaction("rw", db.products, db.stockMovements, db.auditLogs, async () => {
        for (const line of lines) {
          const p = await db.products.get(line.productId);
          if (!p) continue;
          await db.products.update(line.productId, {
            stock: p.stock + line.qty,
            costPrice: line.costPrice > 0 ? line.costPrice : p.costPrice,
          });
          await db.stockMovements.add({
            productId: line.productId,
            productName: p.name,
            type: "receiving",
            quantityChange: line.qty,
            reason: `Stock received from ${supplier}`,
            reference: invoiceNo || undefined,
            supplier,
            invoiceNo: invoiceNo || undefined,
            costPrice: line.costPrice,
            userId: currentUser.id,
            userName: currentUser.fullName,
            createdAt: now,
          });
        }
        await logAudit(currentUser.id!, "stock_receive",
          `Received ${lines.length} product(s) from ${supplier} · Invoice: ${invoiceNo || "—"}`,
          "stock", invoiceNo || date);
      });

      toast.success(`Stock received — ${lines.length} items added`);
      setLines([]);
      setSupplier("");
      setInvoiceNo("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save stock receiving");
    }
  }

  const totalCost = lines.reduce((s, l) => s + l.qty * l.costPrice, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Stock Receiving</h1>
        <p className="text-sm text-muted-foreground">Record new stock arrivals from suppliers</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <Card className="bg-card-gradient border-border lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs">Supplier *</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Uganda Breweries" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Invoice #</Label>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-001" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            {/* Add product line */}
            <div className="flex gap-2">
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select product to add…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} (current: {p.stock})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addLine(selectedProduct)} disabled={!selectedProduct}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>

            {/* Lines */}
            {lines.length > 0 && (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-32">Cost Price</TableHead>
                      <TableHead className="text-right w-32">Line Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, idx) => {
                      const p = products.find((x) => x.id === l.productId);
                      return (
                        <TableRow key={idx} className="border-border">
                          <TableCell className="font-medium text-sm">{p?.name}</TableCell>
                          <TableCell>
                            <Input type="number" value={l.qty} onChange={(e) => updateLine(idx, { qty: parseInt(e.target.value) || 0 })} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" value={l.costPrice} onChange={(e) => updateLine(idx, { costPrice: parseFloat(e.target.value) || 0 })} className="h-8" />
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatUGX(l.qty * l.costPrice)}</TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeLine(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t border-border bg-background/30 p-3">
                  <span className="text-sm text-muted-foreground">Total invoice cost</span>
                  <span className="text-lg font-bold text-primary">{formatUGX(totalCost)}</span>
                </div>
              </div>
            )}

            <Button onClick={save} disabled={lines.length === 0 || !supplier} className="w-full bg-gold-gradient text-black hover:opacity-90 shadow-gold">
              <Save className="mr-2 h-4 w-4" /> Save Stock Receipt
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" /> Recent Receipts</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {movements && movements.length > 0 ? (
                movements.slice(0, 20).map((m) => (
                  <div key={m.id} className="rounded-lg border border-border bg-background/30 p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.productName}</span>
                      <Badge>+{m.quantityChange}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {m.supplier} · {m.invoiceNo || "no invoice"}
                    </p>
                    <p className="text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground text-xs">No receipts yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
