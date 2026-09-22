import { describe, it, expect } from "vitest";
import { mergeCatalogs } from "./merge";
import type { Catalog, ModelSpec } from "./types";

const model = (slug: string, provider: ModelSpec["provider"]): ModelSpec => ({
  slug, title: slug, variantTitle: "", description: "", operationType: "", outputType: "image", inputSchema: { type: "object" }, provider,
});

describe("mergeCatalogs", () => {
  it("replaces models per provider and keeps the others", () => {
    const current: Catalog = {
      source: "higgsfield",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      models: [model("h/a", "higgsfield"), model("elevenlabs/x", "elevenlabs")],
    };
    const fresh: Catalog = { source: "higgsfield", fetchedAt: "2026-02-01T00:00:00.000Z", models: [model("h/b", "higgsfield")], skipped: ["h/c"] };
    const merged = mergeCatalogs(current, { higgsfield: fresh });
    expect(merged.models.map((m) => m.slug)).toEqual(["h/b", "elevenlabs/x"]);
    expect(merged.source).toBe("higgsfield");
    expect(merged.fetchedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(merged.skipped).toEqual(["h/c"]);
  });

  it("treats bundled models without a provider as higgsfield", () => {
    const bundled: Catalog = { source: "bundled", fetchedAt: "x", models: [{ ...model("h/a", "higgsfield"), provider: undefined }] };
    const merged = mergeCatalogs(bundled, { elevenlabs: { source: "higgsfield", fetchedAt: "y", models: [model("elevenlabs/x", "elevenlabs")] } });
    expect(merged.models.map((m) => m.slug)).toEqual(["h/a", "elevenlabs/x"]);
    const again = mergeCatalogs(merged, { higgsfield: { source: "higgsfield", fetchedAt: "z", models: [] } });
    expect(again.models.map((m) => m.slug)).toEqual(["elevenlabs/x"]);
  });
});
