import { describe, it, expect } from "vitest";
import { createProvider, isLiveProvider } from "./index";
import type { ModelSpec } from "../catalog/types";
import type { Settings } from "../types";

const base: Settings = { galleryPath: "/g", provider: "live", higgsfieldApiKey: "a:b", elevenlabsApiKey: "xi", currentProjectId: "" };
const hf: ModelSpec = { slug: "h/x", title: "", variantTitle: "", description: "", operationType: "", outputType: "image", inputSchema: {}, provider: "higgsfield" };
const el: ModelSpec = { ...hf, slug: "elevenlabs/x", outputType: "audio", provider: "elevenlabs" };

describe("createProvider", () => {
  it("routes by the model's provider when live", () => {
    expect(createProvider(base, hf).id).toBe("higgsfield");
    expect(createProvider(base, el).id).toBe("elevenlabs");
    expect(createProvider({ ...base, provider: "higgsfield" }, el).id).toBe("elevenlabs");
  });
  it("uses mock for everything when the setting is mock", () => {
    expect(createProvider({ ...base, provider: "mock" }, hf).id).toBe("mock");
    expect(createProvider({ ...base, provider: "mock" }, el).id).toBe("mock");
    expect(isLiveProvider(base)).toBe(true);
    expect(isLiveProvider({ ...base, provider: "mock" })).toBe(false);
  });
});
