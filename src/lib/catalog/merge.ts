import { providerOf, type Catalog, type ModelProvider } from "./types";

/** Replace the models of each refreshed provider, keeping the rest of the catalog. */
export function mergeCatalogs(current: Catalog, fresh: Partial<Record<ModelProvider, Catalog>>): Catalog {
  const refreshed = new Set(Object.keys(fresh) as ModelProvider[]);
  const kept = current.models.filter((m) => !refreshed.has(providerOf(m)));
  const added = (Object.values(fresh) as Catalog[]).flatMap((c) => c.models);
  const skipped = (Object.values(fresh) as Catalog[]).flatMap((c) => c.skipped ?? []);
  const fetchedAt = (Object.values(fresh) as Catalog[]).map((c) => c.fetchedAt).sort().pop() ?? current.fetchedAt;
  const rank: Record<ModelProvider, number> = { higgsfield: 0, elevenlabs: 1 };
  const models = [...kept, ...added].sort((a, b) => rank[providerOf(a)] - rank[providerOf(b)]);
  return {
    source: "higgsfield",
    fetchedAt,
    models,
    skipped: skipped.length ? skipped : undefined,
  };
}
