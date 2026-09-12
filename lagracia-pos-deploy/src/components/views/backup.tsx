"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting, logAudit, type Setting } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseBackup, Download, Upload, HardDrive, Cloud, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function Backup() {
  const { currentUser } = useStore();
  const [restoring, setRestoring] = useState(false);
  const [importing, setImporting] = useState(false);

  const lastBackupSetting = useLiveQuery(() => db.settings.get("lastBackup"), []);
  const counts = useLiveQuery(async () => {
    return {
      users: await db.users.count(),
      products: await db.products.count(),
      categories: await db.categories.count(),
      sales: await db.sales.count(),
      expenses: await db.expenses.count(),
      customers: await db.customers.count(),
      audit: await db.auditLogs.count(),
      stockMovements: await db.stockMovements.count(),
    };
  }, []);

  async function exportBackup() {
    if (!currentUser) return;
    try {
      const data: Record<string, any> = { _version: 1, _exportedAt: new Date().toISOString() };
      const tables = ["users", "categories", "products", "customers", "sales", "payments", "expenses", "stockMovements", "auditLogs", "settings", "discounts"];
      for (const t of tables) {
        // @ts-ignore
        data[t] = await db[t].toArray();
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.download = `lagracia-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await setSetting("lastBackup", new Date().toISOString());
      await logAudit(currentUser.id!, "backup_export", "Exported full database backup", "backup", date);
      toast.success("Backup exported");
    } catch (err) {
      console.error(err);
      toast.error("Backup failed");
    }
  }

  async function importBackup(file: File) {
    if (!currentUser) return;
    if (!confirm("Importing will OVERWRITE all current data. Continue?")) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data._version) { toast.error("Invalid backup file"); return; }

      const tables = ["users", "categories", "products", "customers", "sales", "payments", "expenses", "stockMovements", "auditLogs", "settings", "discounts"];
      await db.transaction("rw", db.tables, async () => {
        for (const t of tables) {
          // @ts-ignore
          await db[t].clear();
          if (data[t] && data[t].length > 0) {
            // @ts-ignore
            await db[t].bulkAdd(data[t]);
          }
        }
      });
      await logAudit(currentUser.id!, "backup_import", `Imported backup from ${data._exportedAt ?? "unknown date"}`, "backup", "imported");
      toast.success("Backup restored. Reloading…");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error(err);
      toast.error("Failed to import backup");
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Backup & Restore</h1>
        <p className="text-sm text-muted-foreground">Protect your business data — export regularly</p>
      </div>

      {/* Status */}
      <Card className="bg-card-gradient border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HardDrive className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold">Local Database Status</p>
                <p className="text-xs text-muted-foreground">
                  Last backup: {lastBackupSetting?.value ? formatDateTime(lastBackupSetting.value) : "Never"}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Active
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Counts */}
      {counts && (
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-base">Database Contents</CardTitle>
            <CardDescription>Records stored on this device</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(counts).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-background/30 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
                  <p className="text-xl font-bold">{v}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4 text-primary" /> Export Backup</CardTitle>
            <CardDescription>Download a JSON file containing all data</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Save this file to Google Drive, USB, or send via email. Recommended daily.
            </p>
            <Button onClick={exportBackup} className="w-full bg-gold-gradient text-black hover:opacity-90 shadow-gold">
              <Download className="mr-2 h-4 w-4" /> Download Backup
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /> Restore Backup</CardTitle>
            <CardDescription>Replace current data with a backup file</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Restoring will permanently overwrite all current data on this device.</p>
            </div>
            <label className="block">
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importBackup(f);
                }}
              />
              <span className="flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-border bg-background/50 px-4 text-sm font-medium hover:border-primary/50 hover:bg-background">
                {restoring ? "Restoring…" : "Select Backup File"}
              </span>
            </label>
          </CardContent>
        </Card>
      </div>

      {/* Cloud info */}
      <Card className="bg-card-gradient border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" /> Cloud Sync (Coming Soon)</CardTitle>
          <CardDescription>Future multi-device synchronization</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Version 1.0 stores all data locally on this tablet. Cloud sync to Google Drive / OneDrive is planned for v2 to support multiple tablets sharing one database through a local server.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            For now, export backups regularly and store them off-device for safety.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
