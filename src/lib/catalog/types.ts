import type { JsonSchema } from "./schema";

export type OutputType = "image" | "video" | "audio";
export const OUTPUT_TYPES: OutputType[] = ["image", "video", "audio"];

export type ModelProvider = "higgsfield" | "elevenlabs";

export interface ModelSpec {
  /** Endpoint id, e.g. "bytedance/seedance-2.5/text-to-video" or "elevenlabs/eleven_multilingual_v2". */
  slug: string;
  /** Which API runs this model. Missing (bundled data) means higgsfield. */
  provider?: ModelProvider;
  title: string;
  /** Workflow name, e.g. "Text to Video". */
  variantTitle: string;
  description: string;
  operationType: string;
  outputType: OutputType;
  inputSchema: JsonSchema;
  /** Console hints such as {"duration": {"ui:widget": "range", "ui:options": {"advanced": false}}}. */
  uiSchema?: Record<string, UiHint>;
}

export interface UiHint {
  "ui:widget"?: string;
  "ui:placeholder"?: string;
  "ui:options"?: { advanced?: boolean };
}

export interface Catalog {
  source: "bundled" | "higgsfield";
  fetchedAt: string;
  models: ModelSpec[];
  /** Slugs the fetch could not describe (no schema available). */
  skipped?: string[];
  /** Per-provider problems from the last refresh. */
  errors?: Partial<Record<ModelProvider, string>>;
  /** Non-fatal notes from a single provider fetch (e.g. a fallback was used). */
  warning?: string;
  /** Per-provider non-fatal notes from the last refresh. */
  warnings?: Partial<Record<ModelProvider, string>>;
}

export function providerOf(model: ModelSpec): ModelProvider {
  return model.provider ?? "higgsfield";
}
