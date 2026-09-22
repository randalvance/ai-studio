import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import bundled from "./bundled.json";
import type { Catalog, ModelSpec, OutputType } from "./types";

const BUNDLED = bundled as unknown as Catalog;

/** Cached model catalog on disk, with the bundled catalog as a fallback. */
export class CatalogStore {
  constructor(readonly file: string) {}

  async get(): Promise<Catalog> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Catalog;
      if (Array.isArray(parsed.models) && parsed.models.length > 0) return parsed;
    } catch {
      /* missing or corrupt: fall through */
    }
    return BUNDLED;
  }

  async save(catalog: Catalog): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(catalog, null, 2));
  }

  modelsFor(catalog: Catalog, outputType: OutputType): ModelSpec[] {
    return catalog.models.filter((m) => m.outputType === outputType);
  }

  async getModel(slug: string): Promise<ModelSpec | null> {
    const catalog = await this.get();
    return catalog.models.find((m) => m.slug === slug) ?? null;
  }
}

export const bundledCatalog = BUNDLED;
