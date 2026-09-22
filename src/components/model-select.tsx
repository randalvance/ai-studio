"use client";

import { useRouter } from "next/navigation";
import type { ModelSpec } from "@/lib/catalog/types";
import { inputClass } from "./ui";

export function ModelSelect({ kind, models, selected }: { kind: string; models: ModelSpec[]; selected: string }) {
  const router = useRouter();
  const groups = new Map<string, ModelSpec[]>();
  for (const m of models) {
    const list = groups.get(m.title) ?? [];
    list.push(m);
    groups.set(m.title, list);
  }
  return (
    <select
      value={selected}
      onChange={(e) => router.push(`/${kind}?model=${encodeURIComponent(e.target.value)}`)}
      className={inputClass}
      disabled={models.length === 0}
    >
      {models.length === 0 && <option value="">No models available</option>}
      {[...groups.entries()].map(([title, list]) => (
        <optgroup key={title} label={title}>
          {list.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.title} · {m.variantTitle}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
