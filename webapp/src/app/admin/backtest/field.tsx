import type { ReactNode } from "react";

/** The label-plus-hint wrapper for the backtest option form. The label (small bold) on top, the input in the middle, the hint (light grey) below.
 *  Split into its own module so the browser-strategy tab and the factor tab share one form design. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
    </label>
  );
}
