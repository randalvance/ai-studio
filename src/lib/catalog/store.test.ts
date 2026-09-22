import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CatalogStore } from "./store";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "catalog-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("CatalogStore", () => {
  it("serves the bundled catalog when nothing is cached", async () => {
    const store = new CatalogStore(path.join(dir, "catalog.json"));
    const catalog = await store.get();
    expect(catalog.source).toBe("bundled");
    expect(catalog.models.length).toBeGreaterThanOrEqual(5);
    expect(store.modelsFor(catalog, "video").every((m) => m.outputType === "video")).toBe(true);
    expect(store.modelsFor(catalog, "audio")).toEqual([]);
    expect(await store.getModel("higgsfield-ai/soul/v2/standard")).toMatchObject({ outputType: "image" });
    expect(await store.getModel("nope")).toBeNull();
  });

  it("uses a cached catalog file and can save a new one", async () => {
    const file = path.join(dir, "catalog.json");
    const store = new CatalogStore(file);
    await store.save({
      source: "higgsfield",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      models: [
        {
          slug: "x/y",
          title: "X",
          variantTitle: "Y",
          description: "",
          operationType: "text2image",
          outputType: "image",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });
    const again = new CatalogStore(file);
    expect((await again.get()).source).toBe("higgsfield");
    expect((await again.get()).models[0].slug).toBe("x/y");
  });

  it("falls back to bundled when the cache is corrupt", async () => {
    const file = path.join(dir, "catalog.json");
    await writeFile(file, "{not json");
    expect((await new CatalogStore(file).get()).source).toBe("bundled");
  });
});
