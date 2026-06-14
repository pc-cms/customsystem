/**
 * EditExpenseDialog — universal Manager/Finance Manager edit of any expense.
 *
 * Opens from any surface that displays an expense row. Reads the latest values
 * straight from the row prop, lets the manager change Category (fin_category),
 * Amount + Currency, Description and Target (Casino/Player), and persists via
 * `useEditExpense`. The DB trigger recomputes `amount_tzs` from the new
 * amount/currency, so Monthly Report stays in sync automatically.
 *
 * Footer: Cancel · OK (single primary).
 */
import { useEffect, useState } from "react";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCombobox } from "./CategoryCombobox";
import { PlayerNameAutocomplete } from "@/components/PlayerNameAutocomplete";
import { useEditExpense } from "@/hooks/use-edit-expense";

type Currency = "TZS" | "USD" | "EUR" | "GBP" | "KES";
const CURRENCIES: Currency[] = ["TZS", "USD", "EUR", "GBP", "KES"];

export interface EditableExpense {
  id: string;
  fin_category_id?: string | null;
  amount: number;
  currency?: string | null;
  description?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  source?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense: EditableExpense | null;
}

export const EditExpenseDialog = ({ open, onOpenChange, expense }: Props) => {
  const edit = useEditExpense();
  const [finCatId, setFinCatId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<Currency>("TZS");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState<"casino" | "player">("casino");
  const [playerName, setPlayerName] = useState("");

  useEffect(() => {
    if (!expense) return;
    setFinCatId(expense.fin_category_id || "");
    setAmount(String(expense.amount ?? ""));
    setCurrency(((expense.currency as Currency) || "TZS"));
    setDescription(expense.description || "");
    const hasPlayer = !!(expense.player_id || (expense.player_name && expense.player_name.trim()));
    setTarget(hasPlayer ? "player" : "casino");
    setPlayerName(expense.player_name || "");
  }, [expense?.id, open]);

  if (!expense) return null;

  const isOffice = (expense.source || "").toLowerCase() === "office";

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    await edit.mutateAsync({
      id: expense.id,
      fin_category_id: finCatId || null,
      amount: amt,
      currency,
      description: description.trim(),
      player_id: target === "player" ? expense.player_id ?? null : null,
      player_name: target === "player" ? playerName.trim() : "",
      before: {
        fin_category_id: expense.fin_category_id ?? null,
        amount: expense.amount,
        currency: expense.currency ?? "TZS",
        description: expense.description ?? "",
        player_name: expense.player_name ?? "",
      },
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit expense"
      description="Manager / Finance Manager only. Audited."
      size="form"
    >
      <FormGrid>
        <FormField label="Category" span={12}>
          <CategoryCombobox value={finCatId} onChange={setFinCatId} />
        </FormField>

        {!isOffice && (
          <>
            <FormField label="Target">
              <Select value={target} onValueChange={(v) => setTarget(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casino">Casino</SelectItem>
                  <SelectItem value="player">Player</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Player">
              <PlayerNameAutocomplete
                value={playerName}
                onChange={setPlayerName}
                disabled={target !== "player"}
                placeholder={target === "player" ? "Player name" : "—"}
              />
            </FormField>
          </>
        )}

        <FormField label="Amount">
          <NumberInput value={amount} onChange={setAmount} placeholder="0" />
        </FormField>
        <FormField label="Currency">
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Description" span={12}>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the expense"
          />
        </FormField>
      </FormGrid>

      <ResponsiveDialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={edit.isPending || !finCatId || !Number(amount)}
        >
          OK
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};

export default EditExpenseDialog;
