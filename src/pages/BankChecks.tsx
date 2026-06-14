import { useMemo, useRef, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { Loader2, Upload, Plus, CreditCard } from "lucide-react";
import { downloadXlsx } from "@/lib/excel-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import { ExportButton } from "@/components/ui/export-button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import {
  useBankChecks, useImportBankChecks, useCreateBankCheck, useDeleteBankCheck,
  compressForOcr, uploadCheckPhoto, type BankCheckInput,
} from "@/hooks/use-bank-checks";
import { formatCurrency } from "@/lib/currency";
import { stripCommission } from "@/lib/bank-check-shift";
import { BankChecksTable } from "@/components/bank-checks/BankChecksTable";
import { ShiftSummaryTable } from "@/components/bank-checks/ShiftSummaryTable";
import { toast } from "sonner";

const todayMinus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export default function BankChecks() {
  const { activeCasinoId } = useCasino();
  const [preset, setPreset] = useSessionState<DatePreset>("preset", "month");
  const [from, setFrom] = useState(todayMinus(29));
  const [to, setTo] = useState(todayMinus(0));
  // Extend "to" by 1 day so that early-morning checks (00:00–06:00) of next calendar day,
  // which belong to the selected last shift, are still included.
  const toExtended = useMemo(() => {
    const d = new Date(to);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [to]);

  const { data: checks = [], isLoading } = useBankChecks(from, toExtended);
  const importMut = useImportBankChecks();
  const createMut = useCreateBankCheck();
  const deleteMut = useDeleteBankCheck();

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const totalsByCurrency = useMemo(() => {
    const map: Record<string, { check: number; real: number }> = {};
    for (const c of checks) {
      const cur = c.currency || "TZS";
      const amt = Number(c.amount) || 0;
      if (!map[cur]) map[cur] = { check: 0, real: 0 };
      map[cur].check += amt;
      map[cur].real += stripCommission(amt);
    }
    return map;
  }, [checks]);

  const handleFile = async (file: File) => {
    if (!activeCasinoId) {
      toast.error("No casino selected");
      return;
    }
    setImporting(true);
    try {
      let photoPath: string | null = null;
      try {
        photoPath = await uploadCheckPhoto(file, activeCasinoId);
      } catch (e) {
        console.warn("Photo upload failed, continuing without photo:", e);
      }

      const { base64, mime } = await compressForOcr(file);

      const { data, error } = await supabase.functions.invoke("bank-check-ocr", {
        body: { image_base64: base64, mime_type: mime },
      });
      if (error) throw error;
      const ocrChecks = (data?.checks || []) as Array<{
        date: string; time: string; receipt_no: string; approval_code: string;
        amount: number; currency: string; bank: string; merchant: string; card_masked: string;
      }>;
      if (ocrChecks.length === 0) {
        toast.error("No checks recognized on the photo");
        return;
      }

      const records: BankCheckInput[] = ocrChecks
        .filter((c) => Number(c.amount) > 0 || c.approval_code || c.receipt_no)
        .map((c) => ({
          check_date: c.date || todayMinus(0),
          check_time: c.time || null,
          receipt_no: c.receipt_no || "",
          approval_code: c.approval_code || "",
          amount: Number(c.amount) || 0,
          currency: (c.currency || "TZS").toUpperCase() === "USD" ? "USD" : "TZS",
          bank: c.bank || "",
          merchant: c.merchant || "",
          card_masked: c.card_masked || "",
          photo_url: photoPath,
          note: "",
        }));

      await importMut.mutateAsync(records);
    } catch (e) {
      console.error("Bank check import error:", e);
      const msg =
        typeof e === "object" && e !== null && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openPhoto = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("bank-checks")
      .createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Failed to open photo");
      return;
    }
    setPhotoPreview(data.signedUrl);
  };

  const currencyKeys = Object.keys(totalsByCurrency);

  const exportExcel = () => {
    const header = [
      "Date", "Time", "Bank", "Merchant", "Receipt №", "Approval",
      "Card", "Currency", "Amount", "Real (−3%)", "Note",
    ];
    const rows: (string | number | null)[][] = [header];
    for (const c of checks) {
      rows.push([
        c.check_date, c.check_time || "", c.bank || "", c.merchant || "",
        c.receipt_no || "", c.approval_code || "", c.card_masked || "",
        c.currency || "", Number(c.amount) || 0,
        stripCommission(Number(c.amount) || 0), c.note || "",
      ]);
    }
    rows.push([]);
    rows.push(["Totals by currency"]);
    rows.push(["Currency", "With commission", "Real (−3%)", "Count"]);
    const cnt: Record<string, number> = {};
    for (const c of checks) cnt[c.currency || "TZS"] = (cnt[c.currency || "TZS"] || 0) + 1;
    for (const cur of Object.keys(totalsByCurrency)) {
      rows.push([cur, totalsByCurrency[cur].check, totalsByCurrency[cur].real, cnt[cur] || 0]);
    }
    downloadXlsx(`bank-checks_${from}_${to}.xlsx`, [{ name: "Bank Checks", rows }]);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CreditCard}
        title="Bank Checks"
        subtitle="Confirm bank transactions from POS terminal receipts"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={importing} size="sm" className="gap-2">
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {importing ? "Recognizing..." : "Import photo"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add manually
        </Button>
        <ExportButton onExport={exportExcel} disabled={checks.length === 0} />
      </PageHeader>

      <FilterBar
        presets={
          <DateRangePresets
            preset={preset}
            from={from}
            to={to}
            onChange={(next) => {
              setPreset(next.preset);
              setFrom(next.from);
              setTo(next.to);
            }}
          />
        }
      />

      {/* Period totals card */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Period totals</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {from} → {to} · <span className="font-mono font-semibold text-foreground">{checks.length}</span> checks
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            {currencyKeys.length === 0 ? (
              <div className="text-sm text-muted-foreground">No data</div>
            ) : (
              currencyKeys.map((cur) => (
                <div key={cur} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{cur}</div>
                  <div className="flex gap-4">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">With commission</div>
                      <div className="font-mono font-semibold">
                        {formatCurrency(totalsByCurrency[cur].check, cur)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Real (−3%)</div>
                      <div className="font-mono font-semibold text-success">
                        {formatCurrency(totalsByCurrency[cur].real, cur)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All checks</TabsTrigger>
          <TabsTrigger value="shifts">By shift</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-3">
          <BankChecksTable
            checks={checks}
            isLoading={isLoading}
            onOpenPhoto={openPhoto}
            onDelete={(id) => deleteMut.mutate(id)}
            emptyMessage="No checks for this period. Upload a photo or add manually."
          />
        </TabsContent>
        <TabsContent value="shifts" className="mt-3">
          <ShiftSummaryTable
            checks={checks}
            isLoading={isLoading}
            onOpenPhoto={openPhoto}
          />
        </TabsContent>
      </Tabs>

      <ManualAddDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={(input) => {
          createMut.mutate(input, { onSuccess: () => setShowAdd(false) });
        }}
        saving={createMut.isPending}
      />

      <Dialog open={!!photoPreview} onOpenChange={(o) => !o && setPhotoPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Check photo</DialogTitle>
          </DialogHeader>
          {photoPreview && (
            <img src={photoPreview} alt="check" className="w-full rounded max-h-[70vh] object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManualAddDialog({
  open, onClose, onSave, saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (i: BankCheckInput) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<BankCheckInput>({
    check_date: todayMinus(0),
    check_time: null,
    receipt_no: "",
    approval_code: "",
    amount: 0,
    currency: "TZS",
    bank: "NBC",
    merchant: "",
    card_masked: "",
    photo_url: null,
    note: "",
  });

  const upd = <K extends keyof BankCheckInput>(k: K, v: BankCheckInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add check manually</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.check_date} onChange={(e) => upd("check_date", e.target.value)} />
          </div>
          <div>
            <Label>Time</Label>
            <Input
              type="time"
              value={form.check_time || ""}
              onChange={(e) => upd("check_time", e.target.value || null)}
            />
          </div>
          <div>
            <Label>Bank</Label>
            <Input value={form.bank} onChange={(e) => upd("bank", e.target.value)} />
          </div>
          <div>
            <Label>Receipt №</Label>
            <Input value={form.receipt_no} onChange={(e) => upd("receipt_no", e.target.value)} />
          </div>
          <div>
            <Label>Approval Code</Label>
            <Input value={form.approval_code} onChange={(e) => upd("approval_code", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Card (masked)</Label>
            <Input value={form.card_masked} onChange={(e) => upd("card_masked", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Amount (with 3% commission)</Label>
            <Input
              type="number"
              value={form.amount || ""}
              onChange={(e) => upd("amount", Number(e.target.value) || 0)}
            />
            {form.amount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Real (−3%): <span className="font-mono">{formatCurrency(stripCommission(form.amount), form.currency)}</span>
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving || form.amount <= 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
