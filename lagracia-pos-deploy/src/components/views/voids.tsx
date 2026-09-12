"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type Sale } from "@/lib/db";
import { useStore, can } from "@/lib/store";
import { formatUGX, formatDateTime } from "@/lib/format";
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
import { Undo2, Search, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function Voids() {
  const { currentUser } = useStore();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("completed");
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [approverPin, setApproverPin] = useState("");

  const sales = useLiveQuery(() => db.sales.reverse().sortBy("createdAt"), []);
  const users = useLiveQuery(() => db.users.toArray(), []);

  if (!sales || !users) return null;

  const filtered = sales
    .filter((s) => filter === "all" ? true : s.status === filter)
    .filter((s) => !search || s.receiptNo.toLowerCase().includes(search.toLowerCase()) || s.cashierName.toLowerCase().includes(search.toLowerCase()));

  async function confirmVoid() {
    if (!currentUser || !voiding) return;
    if (!voidReason.trim()) { toast.error("Reason required"); return; }
    if (!approverPin.trim()) { toast.error("Approver PIN required"); return; }

    // Find approver by PIN
    const approver = users.find((u) => u.pin === approverPin && u.active && (u.role === "owner" || u.role === "manager"));
    if (!approver) {
      toast.error("Invalid PIN or insufficient permission");
      return;
    }
    if (approver.id === currentUser.id) {
      toast.error("Approver must be a different person from the requester");
      return;
    }

    try {
      const now = new Date().toISOString();
      await db.transaction("rw", db.sales, db.products, db.stockMovements, db.customers, db.auditLogs, async () => {
        // Mark sale as voided
        await db.sales.update(voiding.id!, {
          status: "voided",
          voidReason,
          voidApprovedBy: approver.id,
          voidApprovedByName: approver.fullName,
          voidedAt: now,
        });

        // Restore stock for finite-stock items
        for (const it of voiding.items) {
          const p = await db.products.get(it.productId);
          if (p && p.reorderLevel > 0) {
            await db.products.update(it.productId, { stock: p.stock + it.qty });
            await db.stockMovements.add({
              productId: it.productId,
              productName: it.productName,
              type: "void",
              quantityChange: it.qty,
              reason: `Void of ${voiding.receiptNo}: ${voidReason}`,
              reference: voiding.receiptNo,
              userId: approver.id,
              userName: approver.fullName,
              createdAt: now,
            });
          }
        }

        // Reverse credit balance if was credit sale
        if (voiding.paymentMethod === "credit" && voiding.customerId) {
          const c = await db.customers.get(voiding.customerId);
          if (c) await db.customers.update(voiding.customerId, { creditBalance: Math.max(0, c.creditBalance - voiding.total) });
        }

        await logAudit(approver.id!, "void",
          `Voided ${voiding.receiptNo} (${formatUGX(voiding.total)}) — Reason: ${voidReason}. Requested by ${currentUser.fullName}`,
          "sale", voiding.receiptNo);
      });

      toast.success(`Sale ${voiding.receiptNo} voided`);
      setVoiding(null);
      setVoidReason("");
      setApproverPin("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to void sale");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Voids & Refunds</h1>
        <p className="text-sm text-muted-foreground">Sales are never deleted — they are voided with a reason and approver</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt # or cashier…" className="pl-10" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Receipt</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Cashier</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 50).map((s) => (
              <TableRow key={s.id} className="border-border">
                <TableCell className="font-medium text-sm">{s.receiptNo}</TableCell>
                <TableCell className="text-xs">{formatDateTime(s.createdAt)}</TableCell>
                <TableCell className="text-sm">{s.cashierName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.items.length} items</TableCell>
                <TableCell className="text-right font-semibold">{formatUGX(s.total)}</TableCell>
                <TableCell className="text-center">
                  {s.status === "voided" ? (
                    <Badge variant="destructive">VOIDED</Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">COMPLETED</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setVoiding(s)}>
                    {s.status === "completed" ? (can(currentUser, "pos.void") ? "Void" : "View") : "View"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Void dialog */}
      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="bg-card-gradient border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-destructive" /> Void Sale {voiding?.receiptNo}</DialogTitle>
            <DialogDescription>This will reverse stock movement and refund any credit. The action is permanent and logged.</DialogDescription>
          </DialogHeader>

          {voiding && (
            <div className="space-y-4">
              {/* Sale details */}
              <div className="rounded-lg border border-border bg-background/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total:</span><span className="font-bold">{formatUGX(voiding.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment:</span><span>{voiding.paymentMethod}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cashier:</span><span>{voiding.cashierName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Date:</span><span>{formatDateTime(voiding.createdAt)}</span></div>
                {voiding.status === "voided" && (
                  <>
                    <div className="border-t border-border my-2"></div>
                    <div className="flex justify-between text-destructive"><span>Void reason:</span><span>{voiding.voidReason}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Approved by:</span><span>{voiding.voidApprovedByName}</span></div>
                  </>
                )}
              </div>

              {voiding.status === "completed" && can(currentUser, "pos.void") && (
                <>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>This action requires manager/owner approval. Enter your PIN to authorize.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason for Void *</Label>
                    <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Wrong item, customer cancellation, error" />
                  </div>

                  <div className="space-y-2">
                    <Label>Approver PIN (Manager/Owner) *</Label>
                    <Input type="password" value={approverPin} onChange={(e) => setApproverPin(e.target.value)} placeholder="4-digit PIN" maxLength={8} />
                    <p className="text-[10px] text-muted-foreground">Demo PINs: Owner=1111, Manager=2222</p>
                  </div>
                </>
              )}

              {voiding.status === "completed" && !can(currentUser, "pos.void") && (
                <div className="rounded-lg border border-border bg-background/30 p-3 text-sm text-muted-foreground">
                  You don't have permission to void sales. Ask a manager to log in and process this void.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(null)}>Close</Button>
            {voiding?.status === "completed" && can(currentUser, "pos.void") && (
              <Button onClick={confirmVoid} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirm Void
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
