/**
 * SettingCard — renders a single casino setting as a card with the right
 * input control for its type. Handles save state, "modified vs default",
 * and irreversible-change confirmation.
 */
import { useEffect, useState } from "react";
import { useCasinoSetting } from "@/hooks/use-casino-setting";
import type { SettingSpec } from "@/lib/casino-settings-spec";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput, parseSpacedNumber } from "@/components/ui/number-input";
import { formatNumberSpaces } from "@/lib/currency";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { X, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function SettingCard({ spec }: { spec: SettingSpec }) {
  const { value: stored, setValue, isLoading, isDefault } = useCasinoSetting(spec.key);
  const [draft, setDraft] = useState<unknown>(stored);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);

  const doSave = async () => {
    setSaving(true);
    try {
      await setValue(draft);
      toast.success(`${spec.label} saved`);
    } finally {
      setSaving(false);
    }
  };

  const onSaveClick = () => {
    if (spec.irreversible) setConfirm(true);
    else doSave();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{spec.label}</h4>
            {isDefault && <Badge variant="outline" className="text-xs">default</Badge>}
            {spec.irreversible && (
              <Badge variant="outline" className="text-xs text-warning border-warning/40">
                irreversible
              </Badge>
            )}
          </div>
          {spec.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{spec.description}</p>
          )}
        </div>
      </div>

      <div>{renderControl(spec, draft, setDraft, isLoading)}</div>

      {dirty && (
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setDraft(stored)}>
            Reset
          </Button>
          <Button size="sm" onClick={onSaveClick} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Irreversible change
            </AlertDialogTitle>
            <AlertDialogDescription>
              Changing "{spec.label}" cannot be undone by simply switching back — historical
              records already reference the previous value. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSave}>Confirm & save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function renderControl(
  spec: SettingSpec,
  value: unknown,
  onChange: (v: unknown) => void,
  disabled: boolean,
) {
  switch (spec.type) {
    case "number":
      return (
        <div className="flex items-center gap-2">
          <NumberInput
            value={(value as number) ?? 0}
            onValueChange={(v) => onChange(v ?? 0)}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            disabled={disabled}
            className="w-40"
          />
          {spec.suffix && <span className="text-xs text-muted-foreground">{spec.suffix}</span>}
        </div>
      );
    case "text":
      return (
        <Input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "toggle":
      return (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={onChange}
          disabled={disabled}
        />
      );
    case "select":
      return (
        <Select value={String(value ?? "")} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(spec.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "currency-list":
    case "provider-list":
      return <StringListEditor value={(value as string[]) ?? []} onChange={onChange} disabled={disabled} />;
    case "denomination-list":
      return <NumberListEditor value={(value as number[]) ?? []} onChange={onChange} disabled={disabled} />;
    case "json":
      return (
        <textarea
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)); } catch { /* wait for valid JSON */ }
          }}
          disabled={disabled}
          rows={4}
          className="w-full font-mono text-xs p-2 rounded border border-input bg-background"
        />
      );
  }
}

function StringListEditor({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const [entry, setEntry] = useState("");
  const add = () => {
    const v = entry.trim().toUpperCase();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setEntry("");
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <Badge key={v + i} variant="secondary" className="gap-1 font-mono">
            {v}
            <button onClick={() => remove(i)} disabled={disabled} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add…"
          className="w-40"
          disabled={disabled}
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={disabled}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function NumberListEditor({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled: boolean }) {
  const [entry, setEntry] = useState("");
  const add = () => {
    const n = parseSpacedNumber(entry) ?? NaN;
    if (!Number.isFinite(n) || n <= 0 || value.includes(n)) return;
    onChange([...value, n].sort((a, b) => b - a));
    setEntry("");
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <Badge key={v + "" + i} variant="secondary" className="gap-1 font-mono">
            {formatNumberSpaces(v)}
            <button onClick={() => remove(i)} disabled={disabled} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <NumberInput
          value={entry}
          onValueChange={(v) => setEntry(v == null ? "" : String(v))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add value"
          className="w-40"
          disabled={disabled}
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={disabled}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
