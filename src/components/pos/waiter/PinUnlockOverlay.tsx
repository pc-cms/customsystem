import { useState } from "react";
import { Lock, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unlockPosOperator } from "@/lib/pos-operator";
import { cn } from "@/lib/utils";

export default function PinUnlockOverlay({ casinoId }: { casinoId: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length < 6 ? p + d : p));
  };

  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    try {
      await unlockPosOperator(casinoId, pin);
    } catch (e: any) {
      setError(e?.message ?? "Invalid PIN.");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="h-full flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-xs rounded-md border border-border bg-card p-5 space-y-4">
        <div className="text-center space-y-1">
          <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Enter waiter PIN</h2>
          <p className="text-xs text-muted-foreground">Terminal is locked</p>
        </div>
        <div className="flex justify-center gap-2 h-6">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span
              key={i}
              className={cn("h-3 w-3 rounded-full border border-foreground/40", i < pin.length && "bg-foreground")}
            />
          ))}
        </div>
        <div className="h-5 text-center text-sm text-cms-amount-negative">{error}</div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <Button key={k} variant="outline" className="h-14 text-xl font-mono" onClick={() => press(k)} disabled={busy}>
              {k}
            </Button>
          ))}
          <Button variant="ghost" className="h-14" onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} aria-label="Delete">
            <Delete className="h-5 w-5" />
          </Button>
          <Button variant="outline" className="h-14 text-xl font-mono" onClick={() => press("0")} disabled={busy}>
            0
          </Button>
          <Button className="h-14" onClick={submit} disabled={busy || pin.length < 4}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
