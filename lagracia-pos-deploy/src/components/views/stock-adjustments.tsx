"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type StockMovement } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SlidersHorizontal, Save } from "lucide-react";
import { toast } from "sonner";

export function StockAdjustments() {
  const { currentUser } = useStore();
  const [productId, setProductId] = useState<string>("");
  const [adjustType, setAdjustType] = useState<"add" | "remove">("remove");
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState("");

  const products = useLiveQuery(() => db.products.toArray(), []);
  const movements = useLiveQuery(() =>
    db.stockMovements.where("type").equals("adjustment").reverse().sortBy("createdAt"), []);

  if (!products) return null;

  async function save() {
    if (!currentUser) return;
    if (!productId) { toast.error("Select a product"); return; }
    if (qty <= 0) { toast.error("Quantity must be greater than 0"); return; }
    if (adjustType === "remove" && !reason) { toast.error("Reason required for stock removal"); return; }

    const p = products?.find((x) => x.id === parseInt(productId));
    if (!p) return;

    if (adjustType === "remove" && qty > p.stock) {
      toast.error(`Cannot remove more than current stock (${p.stock})`);
      return;
    }

    const change = adjustType === "add" ? qty : -qty;
    try {
      const now = new Date().toISOString();
      await db.transaction("rw", db.products, db.stockMovements, db.auditLogs, async () => {
        await db.products.update(p.id!, { stock: p.stock + change });
        await db.stockMovements.add({
          productId: p.id!,
          productName: p.name,
          type: "adjustment",
          quantityChange: change,
          reason: reason || (adjustType === "add" ? "Stock count adjustment (+)" : "Stock count adjustment (-)"),
          userId: currentUser.id,
          userName: currentUser.fullName,
          createdAt: now,
        });
        await logAudit(currentUser.id!, "stock_adjust",
          `Adjusted ${p.name}: ${change > 0 ? "+" : ""}${change} (${reason || "no reason"})`,
          "stock", String(p.id));
      });
      toast.success("Stock adjusted");
      setProductId("");
      setQty(0);
      setReason("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save adjustment");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Stock Adjustments</h1>
        <p className="text-sm text-muted-foreground">Correct stock levels for wastage, breakages, theft, or counts</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Form */}
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} (current: {p.stock})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Adjustment Type</Label>
                <Select value={adjustType} onValueChange={(v: any) => setAdjustType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add (+)</SelectItem>
                    <SelectItem value="remove">Remove (−)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input type="number" value={qty || ""} onChange={(e) => setQty(parseInt(e.target.value) || 0)} placeholder="0" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason {adjustType === "remove" && "*"}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Breakage, theft, stock count, expiry" />
            </div>

            <Button onClick={save} className="w-full bg-gold-gradient text-black hover:opacity-90 shadow-gold">
              <Save className="mr-2 h-4 w-4" /> Save Adjustment
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4 text-primary" /> Adjustment History</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {movements && movements.length > 0 ? (
                movements.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border bg-background/30 p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.productName}</span>
                      <Badge variant={m.quantityChange > 0 ? "secondary" : "destructive"}>
                        {m.quantityChange > 0 ? "+" : ""}{m.quantityChange}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{m.reason}</p>
                    <p className="text-muted-foreground">{m.userName} · {formatDateTime(m.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground text-xs">No adjustments yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
