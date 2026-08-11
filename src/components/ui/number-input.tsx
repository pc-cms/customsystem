import { forwardRef, useEffect, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Global rule: every number in the app — displayed OR typed — uses a SPACE as
 * the thousands separator ("1 000 000").
 *
 * `NumberInput` is the single input primitive that enforces it. It renders a
 * text input (so the separators survive), formats while typing and reports the
 * parsed numeric value back through `onValueChange`.
 */

/** "1 000 000,50" / "1,000,000.50" / "1000000.5" → 1000000.5 */
export const parseSpacedNumber = (raw: string): number | null => {
  const cleaned = String(raw)
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const groupInt = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * Formats the raw typing buffer, preserving a trailing separator and the
 * digits the user is currently typing after it.
 */
export const formatSpacedInput = (raw: string, decimals: number, allowNegative: boolean): string => {
  let s = String(raw).replace(/[\s\u00a0\u202f]/g, "");
  const neg = allowNegative && s.trim().startsWith("-");
  s = s.replace(/-/g, "");
  if (decimals > 0) s = s.replace(/,/g, ".");
  else s = s.replace(/[.,]/g, "");
  s = s.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  let intPart = firstDot === -1 ? s : s.slice(0, firstDot);
  let fracPart = firstDot === -1 ? null : s.slice(firstDot + 1).replace(/\./g, "");
  if (fracPart != null && decimals > 0) fracPart = fracPart.slice(0, decimals);
  intPart = intPart.replace(/^0+(?=\d)/, "");
  const out = groupInt(intPart) + (fracPart != null ? `.${fracPart}` : "");
  if (!out) return neg ? "-" : "";
  return (neg ? "-" : "") + out;
};

/** Number → display string with space separators (fixed decimals when asked). */
export const formatSpacedValue = (
  value: number | null | undefined,
  decimals: number,
  keepZero: boolean,
): string => {
  if (value == null || Number.isNaN(value)) return "";
  if (!value && !keepZero) return "";
  const neg = value < 0;
  const abs = Math.abs(value);
  if (decimals > 0) {
    const fixed = abs.toFixed(decimals);
    const [i, f] = fixed.split(".");
    return `${neg ? "-" : ""}${groupInt(i)}.${f}`;
  }
  return `${neg ? "-" : ""}${groupInt(String(Math.round(abs)))}`;
};

export type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "step" | "min" | "max"
> & {
  value: number | string | null | undefined;
  /** Preferred callback — receives the parsed number (null when empty). */
  onValueChange?: (value: number | null) => void;
  /** Legacy callback kept for existing call sites — receives a number (0 when empty). */
  onChange?: (value: number) => void;
  /** Fractional digits allowed (0 = integers only). */
  decimals?: number;
  allowNegative?: boolean;
  /** Show "0" instead of an empty field when the value is 0. */
  keepZero?: boolean;
  /** Arrow up/down increment. */
  step?: number;
  min?: number;
  max?: number;
  /** Numeric placeholder — formatted with spaces automatically. */
  placeholderValue?: number | null;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value: valueProp,
      onValueChange,
      onChange,
      decimals = 0,
      allowNegative = true,
      keepZero = false,
      step = 1,
      min,
      max,
      placeholderValue,
      placeholder,
      className,
      onBlur,
      onFocus,
      onKeyDown,
      ...rest
    },
    ref,
  ) => {
    const value =
      valueProp === "" || valueProp == null
        ? null
        : typeof valueProp === "number"
          ? valueProp
          : parseSpacedNumber(String(valueProp));

    const notify = (v: number | null) => {
      onValueChange?.(v);
      onChange?.(v ?? 0);
    };

    const [focused, setFocused] = useState(false);
    const [raw, setRaw] = useState(() => formatSpacedValue(value, decimals, keepZero));

    useEffect(() => {
      if (!focused) setRaw(formatSpacedValue(value, decimals, keepZero));
    }, [value, decimals, keepZero, focused]);

    const clamp = (n: number) => {
      let v = n;
      if (min != null && v < min) v = min;
      if (max != null && v > max) v = max;
      return v;
    };

    const emit = (text: string) => {
      const parsed = parseSpacedNumber(text);
      if (parsed == null) { notify(null); return; }
      notify(clamp(parsed));
    };

    const hint =
      placeholder ??
      (placeholderValue != null ? formatSpacedValue(placeholderValue, decimals, true) : "0");

    return (
      <input
        ref={ref}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        value={raw}
        placeholder={hint}
        className={cn("tabular-nums", className)}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onChange={(e) => {
          const next = formatSpacedInput(e.target.value, decimals, allowNegative);
          setRaw(next);
          emit(next);
        }}
        onBlur={(e) => {
          setFocused(false);
          const parsed = parseSpacedNumber(raw);
          const final = parsed == null ? null : clamp(parsed);
          setRaw(formatSpacedValue(final, decimals, keepZero));
          if (final !== (value ?? null)) notify(final);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = parseSpacedNumber(raw) ?? 0;
            const next = clamp(base + (e.key === "ArrowUp" ? step : -step));
            setRaw(formatSpacedValue(next, decimals, true));
            notify(next);
          }
          onKeyDown?.(e);
        }}
        {...rest}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
