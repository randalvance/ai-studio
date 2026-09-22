import { parseCredential } from "../providers/higgsfield";
import { llmsUrl, parseLlmsTxt } from "./llms";
import type { JsonSchema } from "./schema";
import type { Catalog, ModelSpec, OutputType, UiHint } from "./types";

export const MODELS_ENDPOINT = "https://api.higgsfield.ai/models";

/** Shape of one item from GET /models. Only slug/operation_type/output_type are guaranteed. */
interface ApiModel {
  slug: string;
  title?: string;
  variant_title?: string;
  description?: string;
  operation_type?: string | string[];
  output_type?: string;
  input_schema?: JsonSchema;
  ui_schema?: Record<string, UiHint>;
}

export interface CatalogFetchOptions {
  fetch?: typeof globalThis.fetch;
  concurrency?: number;
}

function toOutputType(value: string | undefined): OutputType | null {
  if (value === "image" || value === "video" || value === "audio") return value;
  return null;
}

function variantFromSlug(slug: string): string {
  const last = slug.split("/").pop() ?? slug;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchHiggsfieldCatalog(credential: string, options: CatalogFetchOptions = {}): Promise<Catalog> {
  const cred = parseCredential(credential);
  if (!cred) throw new Error("Higgsfield API key is not set. Add it in Settings as KEY_ID:KEY_SECRET.");
  const fetchFn = options.fetch ?? globalThis.fetch;

  const res = await fetchFn(MODELS_ENDPOINT, {
    headers: { Authorization: `Key ${cred.keyId}:${cred.keySecret}` },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(`Higgsfield model list failed (${res.status}): ${detail}`);
  }
  const body = (await res.json()) as { items?: ApiModel[] };
  const items = body.items ?? [];

  const skipped: string[] = [];
  const specs = await mapLimit(items, options.concurrency ?? 6, async (item): Promise<ModelSpec | null> => {
    const outputType = toOutputType(item.output_type);
    if (!outputType) {
      skipped.push(item.slug);
      return null;
    }
    const operationType = Array.isArray(item.operation_type)
      ? item.operation_type.join(", ")
      : (item.operation_type ?? "");

    if (item.input_schema) {
      return {
        slug: item.slug,
        provider: "higgsfield",
        title: item.title ?? item.slug,
        variantTitle: item.variant_title ?? variantFromSlug(item.slug),
        description: item.description ?? "",
        operationType,
        outputType,
        inputSchema: item.input_schema,
        uiSchema: item.ui_schema,
      };
    }
    try {
      const doc = await fetchFn(llmsUrl(item.slug), { headers: { "User-Agent": "ai-studio" } });
      if (!doc.ok) throw new Error(`llms.txt ${doc.status}`);
      const parsed = parseLlmsTxt(await doc.text());
      return {
        slug: item.slug,
        provider: "higgsfield",
        title: item.title ?? parsed.title ?? item.slug,
        variantTitle: item.variant_title ?? variantFromSlug(item.slug),
        description: item.description ?? parsed.description,
        operationType: operationType || parsed.category,
        outputType,
        inputSchema: parsed.inputSchema,
        uiSchema: item.ui_schema,
      };
    } catch {
      skipped.push(item.slug);
      return null;
    }
  });

  return {
    source: "higgsfield",
    fetchedAt: new Date().toISOString(),
    models: specs.filter((m): m is ModelSpec => m !== null),
    skipped,
  };
}
