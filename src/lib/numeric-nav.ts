/**
 * Global arrow-key navigation for plain <input type="number"> fields that do
 * not use the NumberInput primitive (Staff Master, POS settings, Break List…).
 * Up/Down move between numeric cells; Left/Right only jump at the caret edges.
 */
import { numericNavDirection, focusNeighborNumericInput } from "@/components/ui/number-input";

export const installNumericArrowNav = () => {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const el = e.target as HTMLElement | null;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.disabled || el.readOnly) return;
    const isNumeric = el.type === "number" || el.hasAttribute("data-num-input");
    if (!isNumeric) return;
    // <input type="number"> exposes no caret position, so only Up/Down navigate.
    const isNative = el.type === "number";
    const caret = isNative ? null : el.selectionStart;
    const caretEnd = isNative ? null : el.selectionEnd;
    const dir = numericNavDirection(e.key, caret, caretEnd, el.value.length);
    if (!dir) return;
    if (focusNeighborNumericInput(el, dir)) e.preventDefault();
  });
};
