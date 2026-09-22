import { describe, it, expect } from "vitest";
import { mockProvider } from "./mock";
import { bundledCatalog } from "../catalog/store";
import type { ModelSpec } from "../catalog/types";

const soul = bundledCatalog.models.find((m) => m.slug === "higgsfield-ai/soul/v2/standard")!;
const seedance = bundledCatalog.models.find((m) => m.slug === "bytedance/seedance-2.5/reference-to-video")!;
const audioModel: ModelSpec = { ...soul, slug: "x/tts", title: "TTS", variantTitle: "Text to Speech", outputType: "audio" };

describe("mock provider", () => {
  it("produces an SVG for images containing the prompt, escaped", async () => {
    const out = await mockProvider.generate({ model: soul, inputs: { prompt: "hello <script>" }, assets: [] });
    expect(out.mimeType).toBe("image/svg+xml");
    const svg = out.bytes.toString("utf8");
    expect(svg).toContain("hello");
    expect(svg).not.toContain("<script>");
  });

  it("produces a WAV for audio models", async () => {
    const out = await mockProvider.generate({ model: audioModel, inputs: { prompt: "hi" }, assets: [] });
    expect(out.mimeType).toBe("audio/wav");
    expect(out.bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("produces an animated SVG for videos listing the references", async () => {
    const out = await mockProvider.generate({
      model: seedance,
      inputs: { prompt: "chase", duration: 6, image_urls: ["a"] },
      assets: [{ id: "a", type: "image", name: "Kai", mimeType: "image/svg+xml", bytes: Buffer.from("") }],
    });
    const svg = out.bytes.toString("utf8");
    expect(svg).toContain("<animate");
    expect(svg).toContain("Kai");
    expect(svg).toContain("6s");
  });
});
