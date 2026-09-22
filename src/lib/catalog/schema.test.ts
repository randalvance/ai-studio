import { describe, it, expect } from "vitest";
import { defaultValues, coerceFormValues, validateInputs, assetFields, type JsonSchema } from "./schema";

const schema: JsonSchema = {
  type: "object",
  required: ["prompt"],
  properties: {
    prompt: { type: "string", minLength: 1 },
    duration: { type: "integer", default: 5, minimum: 4, maximum: 15 },
    resolution: { type: "string", enum: ["480p", "720p"], default: "720p" },
    batch_size: { type: "integer", enum: [1, 4], default: 1 },
    generate_audio: { type: "boolean", default: true },
    seed: { type: "integer", default: null, minimum: 1, maximum: 1000000 },
    image_url: { type: "string", format: "uri" },
    audio_urls: { type: "array", items: { type: "string", format: "uri" }, minItems: 1, maxItems: 3 },
  },
};

describe("defaultValues", () => {
  it("returns declared defaults and skips nulls", () => {
    expect(defaultValues(schema)).toEqual({
      duration: 5,
      resolution: "720p",
      batch_size: 1,
      generate_audio: true,
    });
  });
});

describe("assetFields", () => {
  it("finds uri fields with their cardinality and media hint", () => {
    expect(assetFields(schema)).toEqual([
      { name: "image_url", multiple: false, accepts: "image", maxItems: undefined },
      { name: "audio_urls", multiple: true, accepts: "audio", maxItems: 3 },
    ]);
  });
});

describe("coerceFormValues", () => {
  it("converts form strings to schema types and drops blanks", () => {
    const fd = new FormData();
    fd.set("f.prompt", "a cat");
    fd.set("f.duration", "8");
    fd.set("f.resolution", "480p");
    fd.set("f.batch_size", "4");
    fd.set("f.generate_audio", "on");
    fd.set("f.seed", "");
    fd.set("f.image_url", "asset-1");
    fd.append("f.audio_urls", "asset-2");
    fd.append("f.audio_urls", "asset-3");
    expect(coerceFormValues(schema, fd)).toEqual({
      prompt: "a cat",
      duration: 8,
      resolution: "480p",
      batch_size: 4,
      generate_audio: true,
      image_url: "asset-1",
      audio_urls: ["asset-2", "asset-3"],
    });
  });

  it("treats a missing boolean as false and ignores unknown keys", () => {
    const fd = new FormData();
    fd.set("f.prompt", "x");
    fd.set("f.bogus", "y");
    expect(coerceFormValues(schema, fd)).toEqual({ prompt: "x", generate_audio: false });
  });
});

describe("validateInputs", () => {
  it("passes valid input", () => {
    expect(validateInputs(schema, { prompt: "x", duration: 5, resolution: "720p" })).toEqual([]);
  });
  it("reports required, enum, range and length problems", () => {
    const errors = validateInputs(schema, {
      duration: 99,
      resolution: "8k",
      audio_urls: [],
      seed: 0,
    });
    expect(errors.join("\n")).toMatch(/prompt.*required/i);
    expect(errors.join("\n")).toMatch(/duration.*15/);
    expect(errors.join("\n")).toMatch(/resolution/);
    expect(errors.join("\n")).toMatch(/audio_urls.*at least 1/i);
    expect(errors.join("\n")).toMatch(/seed.*1/);
  });
});
