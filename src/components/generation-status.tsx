"use client";

import { createContext, useContext, useEffect, useOptimistic, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

interface Running {
  pending: boolean;
  label: string;
  startedAt: number | null;
}

interface Status extends Running {
  /** Call from inside a form action; the flag stays on until the action settles. */
  start: (label: string) => void;
}

const IDLE: Running = { pending: false, label: "", startedAt: null };

const GenerationStatus = createContext<Status>({ ...IDLE, start: () => {} });

/**
 * Shares "a generation is running" between the form (left) and the grid (right).
 * Uses useOptimistic because ordinary state set inside a form action is not
 * committed until the action finishes; an optimistic value shows immediately
 * and reverts on its own when the action settles.
 */
export function GenerationStatusProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useOptimistic<Running, Running>(IDLE, (_current, next) => next);
  return (
    <GenerationStatus.Provider
      value={{
        ...running,
        start: (label) => setRunning({ pending: true, label, startedAt: Date.now() }),
      }}
    >
      {children}
    </GenerationStatus.Provider>
  );
}

export function useGenerationStatus(): Status {
  return useContext(GenerationStatus);
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** mm:ss since `startedAt`. Mounted only while a generation runs, so it never needs resetting. */
function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return (
    <span className="font-mono text-xs text-white/60">
      {mm}:{ss}
    </span>
  );
}

/** Submit button that reflects the form's pending state. */
export function GenerateSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${buttonClass} gap-2`} disabled={pending} aria-busy={pending}>
      {pending && <Spinner />}
      {pending ? "Generating…" : label}
    </button>
  );
}

/** Placeholder card shown in the grid while a generation runs. */
export function PendingCard() {
  const { pending, label, startedAt } = useGenerationStatus();
  if (!pending || !startedAt) return null;
  return (
    <div role="status" aria-live="polite" className="flex flex-col overflow-hidden rounded-lg border border-accent/50 bg-panel">
      <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-[#808285]/40">
        <Spinner className="h-8 w-8 text-white" />
        <span className="text-xs text-white/80">Generating…</span>
        <ElapsedTimer key={startedAt} startedAt={startedAt} />
      </div>
      <div className="p-3 text-xs">
        <div className="truncate text-sm font-medium">{label || "Generation"}</div>
        <div className="text-muted">Waiting for the provider. Video can take a few minutes.</div>
      </div>
    </div>
  );
}
