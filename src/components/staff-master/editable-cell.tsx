/**
 * Excel-style click-to-edit cell. Enter / blur saves, Esc cancels.
 * Tab moves to next editable cell (handled by parent through focus management).
 */
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { formatSpacedInput } from "@/components/ui/number-input";

type Base = {
  className?: string;
  align?: "left" | "right" | "center";
  readOnly?: boolean;
  placeholder?: string;
};

export type EditableCellProps =
  | (Base & { type: "text"; value: string | null; onSave: (v: string | null) => void | Promise<void> })
  | (Base & { type: "number"; value: number | null; onSave: (v: number) => void | Promise<void> })
  | (Base & { type: "date"; value: string | null; onSave: (v: string | null) => void | Promise<void> })
  | (Base & { type: "yesno"; value: boolean; onSave: (v: boolean) => void | Promise<void> })
  | (Base & {
      type: "select";
      value: string | null;
      options: readonly string[];
      onSave: (v: string | null) => void | Promise<void>;
    });

const dot = <span className="text-muted-foreground">·</span>;

export function EditableCell(props: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(props.value);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { setDraft(props.value); }, [props.value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current && typeof (inputRef.current as any).select === "function") {
        (inputRef.current as HTMLInputElement).select?.();
      }
    }
  }, [editing]);

  const align = props.align ?? "left";
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  // YESNO toggles directly without an editor
  if (props.type === "yesno") {
    return (
      <button
        type="button"
        disabled={props.readOnly}
        onClick={() => !props.readOnly && props.onSave(!props.value)}
        className={`w-full ${alignCls} ${props.className ?? ""} ${props.readOnly ? "cursor-default" : "cursor-pointer hover:bg-accent/40"} px-1`}
      >
        {props.value ? <span className="text-emerald-600">Yes</span> : dot}
      </button>
    );
  }

  const commit = async () => {
    setEditing(false);
    if (props.type === "number") {
      const n = typeof draft === "string" ? Number(String(draft).replace(/\s/g, "")) : Number(draft);
      const safe = Number.isFinite(n) ? n : 0;
      if (safe !== (props.value ?? 0)) await (props.onSave as any)(safe);
    } else {
      const next = (draft ?? "") === "" ? null : draft;
      if (next !== (props.value ?? null)) await (props.onSave as any)(next);
    }
  };

  const cancel = () => { setDraft(props.value); setEditing(false); };

  if (props.readOnly) {
    return <div className={`${alignCls} ${props.className ?? ""} px-1`}>{renderDisplay(props)}</div>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
        className={`w-full ${alignCls} ${props.className ?? ""} cursor-pointer hover:bg-accent/40 px-1 truncate`}
      >
        {renderDisplay(props)}
      </button>
    );
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  if (props.type === "select") {
    return (
      <select
        ref={inputRef as any}
        value={draft ?? ""}
        onChange={(e) => setDraft(e.target.value || null)}
        onBlur={commit}
        onKeyDown={onKey}
        className={`w-full bg-background border border-primary/40 px-1 py-0 text-xs ${alignCls}`}
      >
        <option value="">—</option>
        {props.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  const isNumber = props.type === "number";
  return (
    <input
      ref={inputRef as any}
      type={props.type === "date" ? "date" : "text"}
      inputMode={isNumber ? "numeric" : undefined}
      {...(isNumber ? { "data-num-input": "" } : {})}
      value={draft ?? ""}
      onChange={(e) =>
        setDraft(isNumber ? formatSpacedInput(e.target.value, 0, true) : e.target.value)
      }
      onBlur={commit}
      onKeyDown={onKey}
      placeholder={props.placeholder}
      className={`w-full bg-background border border-primary/40 px-1 py-0 text-xs ${alignCls}`}
    />
  );
}

function renderDisplay(props: EditableCellProps): React.ReactNode {
  if (props.type === "yesno") return props.value ? <span className="text-emerald-600">Yes</span> : dot;
  if (props.value === null || props.value === undefined || props.value === "") return dot;
  if (props.type === "number") return new Intl.NumberFormat("en-US").format(Number(props.value)).replace(/,/g, " ");
  if (props.type === "date") {
    const d = new Date(props.value as string);
    if (isNaN(d.getTime())) return String(props.value);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }
  return String(props.value);
}
