"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatUGX } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Boxes, AlertTriangle, XCircle, CheckCircle2, TrendingUp } from "lucide-react";

export function Inventory() {
  const { setView } = useStore();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const products = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  if (!products || !categories) return null;

  const filtered = products
    .filter((p) => filter === "all" ? true :
      filter === "low" ? p.reorderLevel > 0 && p.stock > 0 && p.stock <= p.reorderLevel :
      filter === "out" ? p.reorderLevel > 0 && p.stock === 0 :
      filter === "ok" ? p.reorderLevel === 0 || p.stock > p.reorderLevel : true)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const totalStockValue = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const totalRetailValue = products.reduce((s, p) => s + p.stock * p.price, 0);
  const lowCount = products.filter(p => p.reorderLevel > 0 && p.stock > 0 && p.stock <= p.reorderLevel).length;
  const outCount = products.filter(p => p.reorderLevel > 0 && p.stock === 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Stock Levels</h1>
        <p className="text-sm text-muted-foreground">Real-time inventory across all products</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Boxes className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stock Value (Cost)</p>
                <p className="text-lg font-bold">{formatUGX(totalStockValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400"><TrendingUp className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Retail Value</p>
                <p className="text-lg font-bold">{formatUGX(totalRetailValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400"><AlertTriangle className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Low Stock</p>
                <p className="text-lg font-bold">{lowCount} products</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400"><XCircle className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Out of Stock</p>
                <p className="text-lg font-bold">{outCount} products</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-10" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="out">Out</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setView("stock-receiving")}>Receive Stock</Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">On Hand</TableHead>
              <TableHead className="text-right">Reorder At</TableHead>
              <TableHead className="text-right">Stock Value</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const cat = categories.find((c) => c.id === p.categoryId);
              const isOut = p.reorderLevel > 0 && p.stock === 0;
              const isLow = p.reorderLevel > 0 && p.stock > 0 && p.stock <= p.reorderLevel;
              const isOk = p.reorderLevel === 0 || p.stock > p.reorderLevel;
              return (
                <TableRow key={p.id} className="border-border">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat?.icon ?? "📦"}</span>
                      <span>{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{cat?.name}</span></TableCell>
                  <TableCell className="text-right font-semibold">
                    {p.reorderLevel === 0 ? <span className="text-muted-foreground">∞ (untracked)</span> : `${p.stock} ${p.unit}`}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">{p.reorderLevel || "—"}</TableCell>
                  <TableCell className="text-right">{p.reorderLevel > 0 ? formatUGX(p.stock * p.costPrice) : "—"}</TableCell>
                  <TableCell className="text-center">
                    {isOut ? <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />OUT</Badge> :
                     isLow ? <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-300"><AlertTriangle className="h-3 w-3" />LOW</Badge> :
                     <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400"><CheckCircle2 className="h-3 w-3" />OK</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No products found</div>
        )}
      </div>
    </div>
  );
}
