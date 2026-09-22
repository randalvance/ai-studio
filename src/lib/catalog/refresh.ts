import { mergeCatalogs } from "./merge";
import type { Catalog, ModelProvider } from "./types";
import type { Settings } from "../types";

export type CatalogFetchers = Record<ModelProvider, (key: string) => Promise<Catalog>>;

export interface RefreshOutcome {
  catalog: Catalog;
  /** Providers whose models were replaced. */
  refreshed: ModelProvider[];
  errors: Partial<Record<ModelProvider, string>>;
}

const PROVIDERS: ModelProvider[] = ["higgsfield", "elevenlabs"];

function keyFor(settings: Settings, provider: ModelProvider): string {
  return (provider === "elevenlabs" ? settings.elevenlabsApiKey : settings.higgsfieldApiKey).trim();
}

/**
 * Fetch each provider that has a key (or only `only`), merge into the current
 * catalog, and record per-provider errors and warnings. Never throws for a
 * single provider's failure.
 */
export async function runCatalogRefresh(
  settings: Settings,
  current: Catalog,
  fetchers: CatalogFetchers,
  only?: ModelProvider[],
): Promise<RefreshOutcome> {
  const fresh: Partial<Record<ModelProvider, Catalog>> = {};
  const errors: Partial<Record<ModelProvider, string>> = {};
  const warnings: Partial<Record<ModelProvider, string>> = { ...current.warnings };

  await Promise.all(
    PROVIDERS.filter((p) => !only || only.includes(p)).map(async (provider) => {
      const key = keyFor(settings, provider);
      if (!key) return;
      try {
        const result = await fetchers[provider](key);
        fresh[provider] = result;
        if (result.warning) warnings[provider] = result.warning;
        else delete warnings[provider];
      } catch (err) {
        errors[provider] = err instanceof Error ? err.message : "refresh failed";
      }
    }),
  );

  const refreshed = Object.keys(fresh) as ModelProvider[];
  if (refreshed.length === 0) {
    return { catalog: current, refreshed, errors };
  }
  const base = current.source === "bundled" ? { ...current, models: [] } : current;
  const merged = mergeCatalogs(base, fresh);
  const keptErrors = { ...current.errors };
  for (const p of refreshed) delete keptErrors[p];
  const allErrors = { ...keptErrors, ...errors };
  return {
    catalog: {
      ...merged,
      ...(Object.keys(allErrors).length ? { errors: allErrors } : {}),
      ...(Object.keys(warnings).length ? { warnings } : {}),
    },
    refreshed,
    errors,
  };
}

/** Which providers a settings save should refresh: changed keys plus anything that failed last time. */
export function providersToRefresh(changed: Record<ModelProvider, boolean>, catalog: Catalog): ModelProvider[] {
  return PROVIDERS.filter((p) => changed[p] || Boolean(catalog.errors?.[p]));
}
