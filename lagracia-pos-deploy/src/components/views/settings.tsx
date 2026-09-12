"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting, getSetting, logAudit } from "@/lib/db";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, Settings as SettingsIcon, Building2, Receipt } from "lucide-react";

export function Settings() {
  const { currentUser } = useStore();
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const keys = ["businessName", "currency", "taxRate", "receiptFooter", "lowStockThreshold", "businessPhone", "businessAddress"];
      const data: Record<string, string> = {};
      for (const k of keys) data[k] = await getSetting(k, "");
      setForm(data);
      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!currentUser) return;
    for (const [k, v] of Object.entries(form)) {
      await setSetting(k, v);
    }
    await logAudit(currentUser.id!, "settings_update", "Updated business settings", "settings", "all");
    toast.success("Settings saved");
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading settings…</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your business and system preferences</p>
      </div>

      <Card className="bg-card-gradient border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Business Information</CardTitle>
          <CardDescription>Appears on receipts and dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Business Name</Label>
              <Input value={form.businessName ?? ""} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={form.businessPhone ?? ""} onChange={(e) => setForm({ ...form, businessPhone: e.target.value })} placeholder="+256 700 000 000" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Address</Label>
            <Input value={form.businessAddress ?? ""} onChange={(e) => setForm({ ...form, businessAddress: e.target.value })} placeholder="Kampala, Uganda" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card-gradient border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Financial & Receipt</CardTitle>
          <CardDescription>Currency, tax and receipt footer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Currency</Label>
              <Input value={form.currency ?? ""} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="UGX" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tax Rate (%)</Label>
              <Input type="number" value={form.taxRate ?? "0"} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Low Stock Threshold</Label>
              <Input type="number" value={form.lowStockThreshold ?? "24"} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Receipt Footer</Label>
            <Textarea value={form.receiptFooter ?? ""} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card-gradient border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><SettingsIcon className="h-4 w-4 text-primary" /> System</CardTitle>
          <CardDescription>Local installation info</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <InfoRow label="Database" value="IndexedDB (offline)" />
            <InfoRow label="Version" value="1.0.0" />
            <InfoRow label="Mode" value="Offline-first PWA" />
            <InfoRow label="Install" value="Add to Home Screen (Android)" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} className="bg-gold-gradient text-black hover:opacity-90 shadow-gold">
          <Save className="mr-2 h-4 w-4" /> Save Settings
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
