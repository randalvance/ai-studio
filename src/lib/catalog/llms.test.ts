import { describe, it, expect } from "vitest";
import { parseLlmsTxt } from "./llms";
import fixture from "./fixture-llms.txt.json";

describe("parseLlmsTxt", () => {
  it("extracts title, description, category and the input JSON schema", () => {
    const parsed = parseLlmsTxt(fixture as string);
    expect(parsed.title).toBe("Seedance 2.5");
    expect(parsed.description).toMatch(/generates videos from text prompts/);
    expect(parsed.category).toBe("text2video");
    expect(parsed.inputSchema.required).toEqual(["prompt"]);
    expect(parsed.inputSchema.properties?.duration).toMatchObject({ type: "integer", minimum: 4, maximum: 30 });
  });

  it("throws when no schema block exists", () => {
    expect(() => parseLlmsTxt("# Nope\n\nno schema here")).toThrow(/schema/i);
  });
});
