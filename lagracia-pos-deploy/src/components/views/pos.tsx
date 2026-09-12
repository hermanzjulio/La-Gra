"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, nextReceiptNo, type Sale, type SaleItem, type StockMovement } from "@/lib/db";
import { useStore } from "@/lib/store";
import { pushSale, pushStockMovement, pushAuditLog } from "@/lib/sync";
import { formatUGX } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  Printer,
  Check,
  User,
  Percent,
  Crown,
} from "lucide-react";

export function Pos() {
  const {
    currentUser,
    cart,
    cartCustomerId,
    cartWaiterId,
    discountValue,
    discountType,
    addToCart,
    updateCartQty,
    removeFromCart,
    clearCart,
    setCartCustomer,
    setCartWaiter,
    setDiscount,
  } = useStore();

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Sale["paymentMethod"]>("cash");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null);

  const categories = useLiveQuery(() => db.categories.orderBy("sortOrder").toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const staff = useLiveQuery(() => db.users.where("active").equals(1 as any).toArray(), []) ?? [];
  const allStaff = useLiveQuery(() => db.users.toArray(), []);

  if (!categories || !products) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading POS…</div>;

  const filtered = products
    .filter((p) => p.active)
    .filter((p) => activeCat === "all" || p.categoryId === activeCat)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmount =
    discountType === "percent"
      ? Math.round((subtotal * discountValue) / 100)
      : Math.min(discountValue, subtotal);
  const total = Math.max(0, subtotal - discountAmount);
  const paid = parseFloat(amountPaid || "0") || 0;
  const change = Math.max(0, paid - total);

  async function handleCheckout() {
    if (!currentUser) return;
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (paymentMethod !== "credit" && paid < total) {
      toast.error("Amount paid is less than total");
      return;
    }
    if (paymentMethod === "credit" && !cartCustomerId) {
      toast.error("Select a customer for credit sales");
      return;
    }
    setProcessing(true);
    try {
      const receiptNo = await nextReceiptNo();
      const now = new Date().toISOString();
      const items: SaleItem[] = cart.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        price: l.price,
        costPrice: l.costPrice,
        qty: l.qty,
        lineTotal: l.price * l.qty,
      }));

      // Stock validation — block oversell for finite-stock items
      for (const it of items) {
        const p = await db.products.get(it.productId);
        if (p && p.reorderLevel > 0 && p.stock < it.qty) {
          toast.error(`Insufficient stock: ${p.name} (only ${p.stock} left)`);
          setProcessing(false);
          return;
        }
      }

      const cost = items.reduce((s, it) => s + it.costPrice * it.qty, 0);
      const waiter = allStaff?.find((u) => u.id === cartWaiterId);
      const customer = customers?.find((c) => c.id === cartCustomerId);

      const sale: Sale = {
        receiptNo,
        customerId: cartCustomerId,
        items,
        subtotal,
        discount: discountAmount,
        discountType,
        discountValue,
        total,
        cost,
        paymentMethod,
        amountPaid: paymentMethod === "credit" ? 0 : paid,
        change: paymentMethod === "credit" ? 0 : change,
        cashierId: currentUser.id!,
        cashierName: currentUser.fullName,
        waiterId: waiter?.id,
        waiterName: waiter?.fullName,
        status: "completed",
        createdAt: now,
      };

      const saleId = await db.sales.add(sale);

      // Decrement stock + record movements
      const movements: StockMovement[] = items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        type: "sale",
        quantityChange: -it.qty,
        reason: `Sale ${receiptNo}`,
        reference: receiptNo,
        userId: currentUser.id,
        userName: currentUser.fullName,
        createdAt: now,
      }));
      await db.stockMovements.bulkAdd(movements);

      // Push movements to server (owner dashboard sees stock changes)
      movements.forEach((m) => pushStockMovement(m));

      // Apply stock changes
      await db.transaction("rw", db.products, async () => {
        for (const it of items) {
          const p = await db.products.get(it.productId);
          if (p && p.reorderLevel > 0) {
            await db.products.update(it.productId, { stock: p.stock - it.qty });
          }
        }
      });

      // Payment record
      await db.payments.add({
        saleId: saleId as number,
        method: paymentMethod,
        amount: paymentMethod === "credit" ? total : paid,
        reference: paymentMethod === "credit" ? `Credit - ${customer?.name ?? ""}` : undefined,
        createdAt: now,
      });

      // Credit balance on customer
      if (paymentMethod === "credit" && cartCustomerId) {
        const c = await db.customers.get(cartCustomerId);
        if (c) await db.customers.update(cartCustomerId, { creditBalance: c.creditBalance + total });
      }

      await logAudit(
        currentUser.id!,
        "sale",
        `Sale ${receiptNo} — ${formatUGX(total)} via ${paymentMethod}`,
        "sale",
        receiptNo,
      );

      // ===== Real-time sync to server (so owner on another phone sees this) =====
      const fullSale: Sale = { ...sale, id: saleId as number };
      // Fire-and-forget — don't block the cashier UI on the network
      pushSale(fullSale).catch((e) => console.error("sync pushSale failed", e));
      pushAuditLog({
        userId: currentUser.id,
        userName: currentUser.fullName,
        action: "sale",
        detail: `Sale ${receiptNo} — ${formatUGX(total)} via ${paymentMethod}`,
        entity: "sale",
        entityId: receiptNo,
        createdAt: now,
      }).catch((e) => console.error("sync pushAuditLog failed", e));

      setLastReceipt({ ...sale, id: saleId as number });
      clearCart();
      setCheckoutOpen(false);
      setPaymentMethod("cash");
      setAmountPaid("");
      toast.success(`Sale ${receiptNo} completed`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to complete sale. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* LEFT: product grid */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Search + tabs */}
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="pl-10 h-11 bg-card border-border"
            />
          </div>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <CatButton active={activeCat === "all"} onClick={() => setActiveCat("all")}>
            All
          </CatButton>
          {categories.map((c) => (
            <CatButton key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id!)}>
              <span>{c.icon}</span>
              <span>{c.name}</span>
            </CatButton>
          ))}
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1 rounded-lg">
          <div className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {filtered.map((p) => {
              const isOut = p.reorderLevel > 0 && p.stock === 0;
              const isLow = p.reorderLevel > 0 && p.stock > 0 && p.stock <= p.reorderLevel;
              const cat = categories.find((c) => c.id === p.categoryId);
              return (
                <button
                  key={p.id}
                  disabled={isOut}
                  onClick={() => addToCart({
                    productId: p.id!,
                    productName: p.name,
                    price: p.price,
                    costPrice: p.costPrice,
                  })}
                  className={cn(
                    "group relative flex flex-col gap-1.5 rounded-xl border bg-card-gradient p-3 text-left transition-all",
                    isOut
                      ? "border-destructive/30 opacity-50"
                      : "border-border hover:border-primary/50 hover:shadow-gold active:scale-95",
                  )}
                  style={cat ? { borderTopColor: cat.color, borderTopWidth: 2 } : undefined}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-2xl">{cat?.icon ?? "📦"}</span>
                    {isOut && <Badge variant="destructive" className="text-[9px] h-4 px-1">OUT</Badge>}
                    {isLow && !isOut && <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-500/20 text-amber-300">LOW</Badge>}
                  </div>
                  <p className="line-clamp-2 text-xs font-medium leading-tight">{p.name}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-sm font-bold text-primary">{formatUGX(p.price)}</span>
                    {p.reorderLevel > 0 && (
                      <span className="text-[10px] text-muted-foreground">{p.stock} left</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No products found
            </div>
          )}
        </ScrollArea>
      </div>

      {/* RIGHT: cart */}
      <div className="flex w-full shrink-0 flex-col rounded-xl border border-border bg-card-gradient lg:w-96">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Current Order</h2>
            {cart.length > 0 && (
              <Badge variant="secondary" className="bg-primary/15 text-primary">{cart.length}</Badge>
            )}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} className="h-8 text-xs text-destructive hover:text-destructive">
              Clear
            </Button>
          )}
        </div>

        {/* Cart lines */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1 p-3">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <ShoppingCart className="mx-auto mb-2 h-10 w-10 opacity-30" />
                Tap products to add to cart
              </div>
            ) : (
              cart.map((line) => (
                <div key={line.productId} className="flex items-center gap-2 rounded-lg border border-border bg-background/30 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{line.productName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatUGX(line.price)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => updateCartQty(line.productId, line.qty - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      className="h-7 w-10 px-0 text-center text-xs"
                      value={line.qty}
                      onChange={(e) => {
                        const q = parseInt(e.target.value, 10);
                        if (!isNaN(q)) updateCartQty(line.productId, q);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => updateCartQty(line.productId, line.qty + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="w-20 text-right">
                    <p className="text-xs font-semibold">{formatUGX(line.price * line.qty)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFromCart(line.productId)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Totals */}
        <div className="border-t border-border p-4 space-y-3">
          {cart.length > 0 && (
            <>
              {/* Customer & Waiter */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={cartWaiterId ?? ""}
                  onChange={(e) => setCartWaiter(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="h-9 rounded-md border border-border bg-background/50 px-2 text-xs"
                >
                  <option value="">Waiter: Self</option>
                  {allStaff?.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </select>
                <select
                  value={cartCustomerId ?? ""}
                  onChange={(e) => setCartCustomer(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="h-9 rounded-md border border-border bg-background/50 px-2 text-xs"
                >
                  <option value="">Customer: Walk-in</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Discount */}
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <select
                  value={discountType}
                  onChange={(e) => setDiscount(e.target.value as "amount" | "percent", discountValue)}
                  className="h-8 rounded-md border border-border bg-background/50 px-2 text-xs"
                >
                  <option value="amount">UGX</option>
                  <option value="percent">%</option>
                </select>
                <Input
                  type="number"
                  value={discountValue || ""}
                  onChange={(e) => setDiscount(discountType, parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="h-8"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatUGX(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount</span>
                <span>-{formatUGX(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatUGX(total)}</span>
            </div>
          </div>

          <Button
            disabled={cart.length === 0}
            onClick={() => {
              setAmountPaid(String(total));
              setCheckoutOpen(true);
            }}
            className="h-12 w-full bg-gold-gradient text-black font-semibold hover:opacity-90 shadow-gold"
          >
            <CreditCard className="mr-2 h-5 w-5" /> Checkout · {formatUGX(total)}
          </Button>
        </div>
      </div>

      {/* Checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="bg-card-gradient border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>Select payment method and confirm</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Total */}
            <div className="rounded-lg border border-border bg-background/30 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Due</p>
              <p className="text-3xl font-bold text-primary">{formatUGX(total)}</p>
            </div>

            {/* Payment methods */}
            <div className="grid grid-cols-2 gap-2">
              <PaymentBtn active={paymentMethod === "cash"} onClick={() => setPaymentMethod("cash")} icon={Banknote} label="Cash" />
              <PaymentBtn active={paymentMethod === "mobile_money"} onClick={() => setPaymentMethod("mobile_money")} icon={Smartphone} label="Mobile Money" />
              <PaymentBtn active={paymentMethod === "card"} onClick={() => setPaymentMethod("card")} icon={CreditCard} label="Card" />
              <PaymentBtn active={paymentMethod === "credit"} onClick={() => setPaymentMethod("credit")} icon={Wallet} label="Credit" />
            </div>

            {/* Amount paid */}
            {paymentMethod !== "credit" && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount Paid</Label>
                <Input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="h-12 text-lg font-semibold"
                  placeholder="0"
                />
                <div className="flex gap-2">
                  {[total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000].map((v, i) => (
                    <Button
                      key={i}
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setAmountPaid(String(v))}
                    >
                      {formatUGX(v)}
                    </Button>
                  ))}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Change</span>
                  <span className="font-semibold text-emerald-400">{formatUGX(change)}</span>
                </div>
              </div>
            )}
            {paymentMethod === "credit" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                <p>This sale will be added to <strong>{customers?.find((c) => c.id === cartCustomerId)?.name ?? "no customer"}</strong>';s credit balance.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)} disabled={processing}>Cancel</Button>
            <Button
              onClick={handleCheckout}
              disabled={processing}
              className="bg-gold-gradient text-black hover:opacity-90"
            >
              {processing ? "Processing…" : "Confirm Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!lastReceipt} onOpenChange={(o) => !o && setLastReceipt(null)}>
        <DialogContent className="bg-card-gradient border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-400" /> Sale Complete
            </DialogTitle>
          </DialogHeader>
          {lastReceipt && <Receipt sale={lastReceipt} />}
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setLastReceipt(null)}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button className="flex-1 bg-gold-gradient text-black hover:opacity-90" onClick={() => setLastReceipt(null)}>
              New Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all",
        active
          ? "bg-gold-gradient text-black shadow-gold"
          : "border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

function PaymentBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1 rounded-lg border transition-all",
        active
          ? "border-primary bg-primary/15 text-primary shadow-gold"
          : "border-border bg-background/30 text-muted-foreground hover:border-primary/40",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function Receipt({ sale }: { sale: Sale }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 font-mono text-xs">
      <div className="text-center">
        <p className="text-base font-bold text-gold-gradient">LA GRACIA LOUNGE</p>
        <p className="text-muted-foreground">Kampala, Uganda</p>
        <p className="text-muted-foreground">Tel: +256 700 000 000</p>
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <div className="space-y-0.5">
        <div className="flex justify-between"><span>Receipt:</span><span>{sale.receiptNo}</span></div>
        <div className="flex justify-between"><span>Date:</span><span>{new Date(sale.createdAt).toLocaleString("en-GB")}</span></div>
        <div className="flex justify-between"><span>Cashier:</span><span>{sale.cashierName}</span></div>
        {sale.waiterName && <div className="flex justify-between"><span>Waiter:</span><span>{sale.waiterName}</span></div>}
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <div className="space-y-0.5">
        {sale.items.map((it, i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="truncate">{it.qty}× {it.productName}</span>
            <span>{formatUGX(it.lineTotal)}</span>
          </div>
        ))}
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <div className="space-y-0.5">
        <div className="flex justify-between"><span>Subtotal:</span><span>{formatUGX(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="flex justify-between text-emerald-400"><span>Discount:</span><span>-{formatUGX(sale.discount)}</span></div>}
        <div className="flex justify-between font-bold text-sm"><span>TOTAL:</span><span>{formatUGX(sale.total)}</span></div>
        <div className="flex justify-between"><span>Paid ({sale.paymentMethod}):</span><span>{formatUGX(sale.amountPaid)}</span></div>
        {sale.change > 0 && <div className="flex justify-between"><span>Change:</span><span>{formatUGX(sale.change)}</span></div>}
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <p className="text-center text-muted-foreground">Thank you for choosing La Gracia Lounge!</p>
      <p className="text-center text-muted-foreground">Asante sana · Karibu tena</p>
    </div>
  );
}
