import { describe, it, expect, vi } from "vitest";
import { runCatalogRefresh } from "./refresh";
import type { Catalog, ModelSpec } from "./types";
import type { Settings } from "../types";

const model = (slug: string, provider: ModelSpec["provider"], outputType: ModelSpec["outputType"] = "image"): ModelSpec => ({
  slug, title: slug, variantTitle: "", description: "", operationType: "", outputType, inputSchema: { type: "object" }, provider,
});
const settings: Settings = { galleryPath: "/g", provider: "live", higgsfieldApiKey: "a:b", elevenlabsApiKey: "xi", currentProjectId: "" };
const bundled: Catalog = { source: "bundled", fetchedAt: "x", models: [{ ...model("h/bundled", "higgsfield"), provider: undefined }] };

describe("runCatalogRefresh", () => {
  it("refreshes every provider with a key, merges, and records per-provider errors", async () => {
    const higgsfield = vi.fn(async (): Promise<Catalog> => ({ source: "higgsfield", fetchedAt: "2026-01-02T00:00:00.000Z", models: [model("h/a", "higgsfield")] }));
    const elevenlabs = vi.fn(async (): Promise<Catalog> => {
      throw new Error("ElevenLabs model list failed (401): missing models_read");
    });
    const { catalog, errors, refreshed } = await runCatalogRefresh(settings, bundled, { higgsfield, elevenlabs });
    expect(refreshed).toEqual(["higgsfield"]);
    expect(catalog.models.map((m) => m.slug)).toEqual(["h/a"]);
    expect(errors).toEqual({ elevenlabs: "ElevenLabs model list failed (401): missing models_read" });
    expect(catalog.errors).toEqual(errors);
    expect(higgsfield).toHaveBeenCalledWith("a:b");
    expect(elevenlabs).toHaveBeenCalledWith("xi");
  });

  it("skips providers without a key and keeps warnings", async () => {
    const elevenlabs = vi.fn(async (): Promise<Catalog> => ({ source: "higgsfield", fetchedAt: "y", models: [model("elevenlabs/x", "elevenlabs", "audio")], warning: "used fallback" }));
    const higgsfield = vi.fn();
    const current: Catalog = { source: "higgsfield", fetchedAt: "x", models: [model("h/a", "higgsfield")] };
    const { catalog, errors, refreshed } = await runCatalogRefresh({ ...settings, higgsfieldApiKey: "" }, current, { higgsfield, elevenlabs });
    expect(refreshed).toEqual(["elevenlabs"]);
    expect(higgsfield).not.toHaveBeenCalled();
    expect(catalog.models.map((m) => m.slug)).toEqual(["h/a", "elevenlabs/x"]);
    expect(errors).toEqual({});
    expect(catalog.warnings).toEqual({ elevenlabs: "used fallback" });
  });

  it("returns nothing refreshed when no keys are set", async () => {
    const { refreshed, catalog } = await runCatalogRefresh({ ...settings, higgsfieldApiKey: "", elevenlabsApiKey: "" }, bundled, { higgsfield: vi.fn(), elevenlabs: vi.fn() });
    expect(refreshed).toEqual([]);
    expect(catalog).toBe(bundled);
  });

  it("only refreshes the requested providers", async () => {
    const higgsfield = vi.fn(async (): Promise<Catalog> => ({ source: "higgsfield", fetchedAt: "z", models: [] }));
    const elevenlabs = vi.fn(async (): Promise<Catalog> => ({ source: "higgsfield", fetchedAt: "z", models: [model("elevenlabs/x", "elevenlabs", "audio")] }));
    const { refreshed } = await runCatalogRefresh(settings, bundled, { higgsfield, elevenlabs }, ["elevenlabs"]);
    expect(refreshed).toEqual(["elevenlabs"]);
    expect(higgsfield).not.toHaveBeenCalled();
  });
});

describe("providersToRefresh", () => {
  it("includes providers whose key changed and providers that last failed", async () => {
    const { providersToRefresh } = await import("./refresh");
    const catalog: Catalog = { source: "higgsfield", fetchedAt: "x", models: [], errors: { elevenlabs: "401 voices_read" } };
    expect(providersToRefresh({ higgsfield: false, elevenlabs: false }, catalog)).toEqual(["elevenlabs"]);
    expect(providersToRefresh({ higgsfield: true, elevenlabs: false }, catalog)).toEqual(["higgsfield", "elevenlabs"]);
    expect(providersToRefresh({ higgsfield: false, elevenlabs: false }, { ...catalog, errors: undefined })).toEqual([]);
  });
});
