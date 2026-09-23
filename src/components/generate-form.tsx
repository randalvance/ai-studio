"use client";

import { generate } from "@/app/actions";
import type { ModelSpec } from "@/lib/catalog/types";
import { GenerateSubmit, useGenerationStatus } from "./generation-status";
import { SchemaForm, type PickableAsset } from "./schema-form";
import { sectionLabelClass } from "./ui";

export function GenerateForm({
  kind,
  projectId,
  model,
  assets,
}: {
  kind: string;
  projectId: string;
  model: ModelSpec;
  assets: PickableAsset[];
}) {
  const status = useGenerationStatus();
  return (
    <form
      action={async (formData) => {
        status.start(`${model.title} · ${model.variantTitle}`);
        await generate(formData);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="model" value={model.slug} />
      <span className={sectionLabelClass}>Parameters</span>
      <fieldset disabled={status.pending} className="flex flex-col gap-4 disabled:opacity-60">
        <SchemaForm key={model.slug} model={model} assets={assets} projectId={projectId} />
      </fieldset>
      <GenerateSubmit label="Generate" />
    </form>
  );
}
