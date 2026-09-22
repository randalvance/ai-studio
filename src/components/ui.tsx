import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-border bg-panel px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent";

export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50";

export const ghostButtonClass =
  "inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-panel";

export const dangerButtonClass =
  "inline-flex items-center rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950";

export const sectionLabelClass = "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-panel p-4 ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">{children}</p>
  );
}
