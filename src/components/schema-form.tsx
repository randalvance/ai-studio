"use client";

import { useState } from "react";
import { assetFields, defaultValues, FORM_PREFIX, type JsonSchema } from "@/lib/catalog/schema";
import type { ModelSpec } from "@/lib/catalog/types";
import type { Asset } from "@/lib/types";
import { inputClass } from "./ui";

export interface PickableAsset {
  id: string;
  name: string;
  type: Asset["type"];
  tag?: Asset["tag"];
  url: string;
  mimeType: string;
}

function labelFor(key: string, prop: JsonSchema): string {
  return prop.title ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RangeField({ name, prop, initial }: { name: string; prop: JsonSchema; initial: number | undefined }) {
  const [value, setValue] = useState<number>(initial ?? prop.minimum ?? 0);
  const step = prop.type === "integer" ? 1 : 0.1;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        name={name}
        min={prop.minimum}
        max={prop.maximum}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="flex-1 accent-blue-500"
      />
      <span className="w-12 text-right text-xs tabular-nums text-muted">{value}</span>
    </div>
  );
}

function EnumSelect({ name, prop, initial }: { name: string; prop: JsonSchema; initial: string }) {
  const [value, setValue] = useState(initial);
  const preview = prop.enumPreviews?.[value];
  return (
    <div className="flex flex-col gap-2">
      <select name={name} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
        {(prop.enum ?? []).map((v) => (
          <option key={String(v)} value={String(v)}>
            {prop.enumLabels?.[String(v)] ?? String(v)}
          </option>
        ))}
      </select>
      {preview && <audio key={preview} controls preload="none" src={preview} className="h-8 w-full" />}
    </div>
  );
}

function AssetPicker({
  name,
  multiple,
  accepts,
  maxItems,
  assets,
}: {
  name: string;
  multiple: boolean;
  accepts: "image" | "video" | "audio" | "any";
  maxItems: number | undefined;
  assets: PickableAsset[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = accepts === "any" ? assets : assets.filter((a) => a.type === accepts);
  if (candidates.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted">
        No {accepts === "any" ? "" : accepts + " "}assets in this project yet. Generate one first, then pick it here.
      </p>
    );
  }
  const toggle = (id: string) => {
    setSelected((prev) => {
      if (!multiple) return prev.includes(id) ? [] : [id];
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (maxItems && prev.length >= maxItems) return prev;
      return [...prev, id];
    });
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {candidates.map((a) => {
        const on = selected.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => toggle(a.id)}
            title={a.name}
            className={`relative overflow-hidden rounded-md border text-left ${on ? "border-accent ring-1 ring-accent" : "border-border hover:border-muted"}`}
          >
            {a.type === "audio" ? (
              <div className="flex h-16 items-center justify-center bg-panel text-muted">♪</div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt={a.name} className="h-16 w-full object-cover" />
            )}
            <span className="block truncate px-1.5 py-1 text-[11px]">{a.name}</span>
            {a.tag && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] uppercase">{a.tag}</span>}
            {on && <input type="hidden" name={name} value={a.id} />}
          </button>
        );
      })}
    </div>
  );
}

export function SchemaForm({ model, assets }: { model: ModelSpec; assets: PickableAsset[] }) {
  const schema = model.inputSchema;
  const defaults = defaultValues(schema);
  const media = new Map(assetFields(schema).map((f) => [f.name, f]));
  const entries = Object.entries(schema.properties ?? {});
  const isAdvanced = (key: string) => {
    const hint = model.uiSchema?.[key]?.["ui:options"]?.advanced;
    if (hint !== undefined) return hint;
    if (model.uiSchema) return false;
    // No console hints for this model: tuck the usual knobs away.
    const prop = schema.properties?.[key];
    return key === "seed" || key === "bitrate_mode" || key === "output_format" || prop?.format === "uuid";
  };
  const basic = entries.filter(([k]) => !isAdvanced(k));
  const advanced = entries.filter(([k]) => isAdvanced(k));
  const required = new Set(schema.required ?? []);

  const renderField = (key: string, prop: JsonSchema) => {
    const name = FORM_PREFIX + key;
    const label = labelFor(key, prop);
    const placeholder = model.uiSchema?.[key]?.["ui:placeholder"] ?? prop.description;
    const widget = model.uiSchema?.[key]?.["ui:widget"];
    let control;
    const mediaField = media.get(key);
    if (mediaField) {
      control = <AssetPicker name={name} multiple={mediaField.multiple} accepts={mediaField.accepts} maxItems={mediaField.maxItems} assets={assets} />;
    } else if (prop.enum) {
      control = <EnumSelect name={name} prop={prop} initial={String(defaults[key] ?? prop.enum[0])} />;
    } else if (prop.type === "boolean") {
      control = (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} defaultChecked={defaults[key] === true} className="accent-blue-500" />
          <span className="text-muted">Enabled</span>
        </label>
      );
    } else if (prop.type === "integer" || prop.type === "number") {
      const bounded = prop.minimum !== undefined && prop.maximum !== undefined;
      control =
        bounded && (widget === "range" || prop.maximum! - prop.minimum! <= 100) ? (
          <RangeField name={name} prop={prop} initial={defaults[key] as number | undefined} />
        ) : (
          <input type="number" name={name} min={prop.minimum} max={prop.maximum} defaultValue={defaults[key] as number | undefined} className={inputClass} />
        );
    } else if (key === "prompt" || key === "text" || (prop.type === "string" && (prop.minLength !== undefined || key.includes("prompt")))) {
      control = <textarea name={name} rows={5} required={required.has(key)} placeholder={placeholder} defaultValue={defaults[key] as string | undefined} className={inputClass} />;
    } else {
      control = <input name={name} placeholder={placeholder} defaultValue={defaults[key] as string | undefined} required={required.has(key)} className={inputClass} />;
    }
    return (
      <label key={key} className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          {label}
          {required.has(key) && <span className="ml-1 text-red-400">*</span>}
        </span>
        {control}
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {basic.map(([k, p]) => renderField(k, p))}
      {advanced.length > 0 && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm text-muted">Advanced settings</summary>
          <div className="mt-3 flex flex-col gap-4">{advanced.map(([k, p]) => renderField(k, p))}</div>
        </details>
      )}
    </div>
  );
}
