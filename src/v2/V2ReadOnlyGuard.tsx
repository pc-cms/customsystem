/**
 * V2 read-only guard.
 *
 * Presentation-only safety net: intercepts mutation-looking interactions in
 * capture phase before they reach the underlying page. No hook, mutation or
 * query code is touched — the existing pages render exactly as they do today.
 */
import * as React from "react";
import { toast } from "sonner";

const DANGER = /\b(save|delete|remove|approve|reject|close\s*(day|month|shift|table|tables)?|open\s*(day|shift)|transfer|send|record|confirm|submit|post|apply|create|add|new|edit|update|import|pay|payout|settle|accept|cancel|void|reprint|print|finalize|finalise|lock|unlock|archive|reset|generate|issue)\b/i;

const SAFE = /\b(filter|search|export|download|refresh|reload|close$|back|next|prev|previous|today|month|day|week|cancel filter)\b/i;

const isInteractive = (el: Element | null): HTMLElement | null => {
  if (!el) return null;
  return (el as HTMLElement).closest?.(
    'button, [role="button"], [role="menuitem"], [role="switch"], a[href], input[type="submit"], input[type="checkbox"], input[type="radio"]',
  ) as HTMLElement | null;
};

const blocks = (el: HTMLElement): boolean => {
  if (el.getAttribute("data-v2-allow") === "true") return false;
  const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
  if (!label) {
    // Icon-only control with no label: block only inside forms/rows (unknown intent is risky)
    return !!el.closest("form");
  }
  if (SAFE.test(label) && !DANGER.test(label)) return false;
  return DANGER.test(label);
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
    const tag = t?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) {
      // Allow navigation / selection keys, block anything that edits a value.
      const nav = [
        "Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "Home", "End", "PageUp", "PageDown", "Shift", "Control", "Alt", "Meta",
      ];
      if (nav.includes(e.key)) return;
      if ((e.ctrlKey || e.metaKey) && ["c", "a", "f"].includes(e.key.toLowerCase())) return;
      e.preventDefault();
      e.stopPropagation();
      warn();
    }
  };

  const onPasteCapture = (e: React.ClipboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      e.preventDefault();
      e.stopPropagation();
      warn();
    }
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
