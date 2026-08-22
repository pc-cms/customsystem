/**
 * V2 read-only guard.
 *
 * Presentation-only safety net: intercepts mutation-looking interactions in
 * capture phase before they reach the underlying page.
 *
 * Read-only must NOT mean "the UI is frozen": search fields, date inputs,
 * filters, selects, tabs, sorting headers, view/layout toggles and every other
 * local-state control stay fully usable. Only writes are blocked.
 */
import * as React from "react";
import { toast } from "sonner";

/** Labels that clearly indicate a business-data mutation. */
const DANGER =
  /\b(save|delete|remove|approve|reject|transfer|record|confirm|submit|post|apply|pay|payout|settle|void|finalize|finalise|lock|unlock|archive|reset|issue|import|merge|assign|close\s*(day|month|shift|table|tables)\b|open\s*(day|shift)\b|(create|add|new|edit|update)\b)/i;

/** Navigation / filtering / view labels that are always allowed. */
const SAFE =
  /\b(filter|filters|search|export|download|refresh|reload|back|next|prev|previous|today|yesterday|tomorrow|month|day|week|year|period|sort|compact|full|expand|collapse|view|layout|theme|font|fullscreen|zoom|tab|all|clear|close|cancel|print|preview)\b/i;

const isInteractive = (el: Element | null): HTMLElement | null => {
  if (!el) return null;
  return (el as HTMLElement).closest?.(
    'button, [role="button"], [role="menuitem"], [role="switch"], a[href], input[type="submit"]',
  ) as HTMLElement | null;
};

const blocks = (el: HTMLElement): boolean => {
  if (el.getAttribute("data-v2-allow") === "true") return false;
  if (el.closest("[data-v2-allow='true']")) return false;

  // Anything that is a tab / sorting header / menu of a select is view state.
  if (el.closest('[role="tablist"], [role="tab"], thead, [role="combobox"], [role="listbox"], [role="radiogroup"]')) {
    return false;
  }

  const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
  if (!label) return false; // icon-only control with no label: assume view control
  if (SAFE.test(label) && !DANGER.test(label)) return false;
  return DANGER.test(label);
};

/** Numeric / business-data inputs that could autosave on change or blur. */
const isBusinessInput = (t: HTMLElement | null): boolean => {
  if (!t) return false;
  if (t.getAttribute?.("data-v2-allow") === "true") return false;
  if (t.closest?.("[data-v2-allow='true']")) return false;
  const tag = t.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && !t.isContentEditable) return false;
  const input = t as HTMLInputElement;
  const type = (input.getAttribute("type") || "text").toLowerCase();
  const mode = (input.getAttribute("inputmode") || "").toLowerCase();
  if (type === "number") return true;
  if (mode === "numeric" || mode === "decimal") return true;
  return false;
};

export function V2ReadOnlyGuard({ children }: { children: React.ReactNode }) {
  const warn = React.useCallback(() => {
    toast.warning("UI V2 Preview is read-only", {
      description: "Switch to Current mode to perform this action.",
      id: "v2-readonly",
    });
  }, []);

  const onClickCapture = (e: React.MouseEvent) => {
    const el = isInteractive(e.target as Element);
    if (el && blocks(el)) {
      e.preventDefault();
      e.stopPropagation();
      warn();
    }
  };

  const onSubmitCapture = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    warn();
  };

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (!isBusinessInput(t)) return; // text/date/search/filter inputs stay usable
    const nav = [
      "Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Home", "End", "PageUp", "PageDown", "Shift", "Control", "Alt", "Meta", "Enter",
    ];
    if (nav.includes(e.key)) return;
    if ((e.ctrlKey || e.metaKey) && ["c", "a", "f"].includes(e.key.toLowerCase())) return;
    e.preventDefault();
    e.stopPropagation();
    warn();
  };

  const onPasteCapture = (e: React.ClipboardEvent) => {
    if (!isBusinessInput(e.target as HTMLElement)) return;
    e.preventDefault();
    e.stopPropagation();
    warn();
  };

  return (
    <div
      className="ui-v2-readonly contents"
      onClickCapture={onClickCapture}
      onSubmitCapture={onSubmitCapture}
      onKeyDownCapture={onKeyDownCapture}
      onPasteCapture={onPasteCapture}
    >
      {children}
    </div>
  );
}
