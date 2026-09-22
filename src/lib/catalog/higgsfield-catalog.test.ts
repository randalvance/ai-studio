import { describe, it, expect, vi } from "vitest";
import { fetchHiggsfieldCatalog } from "./higgsfield-catalog";
import fixture from "./fixture-llms.txt.json";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchHiggsfieldCatalog", () => {
  it("lists models with the key, uses embedded schemas, and falls back to llms.txt", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://api.higgsfield.ai/models") {
        expect(new Headers(init?.headers).get("authorization")).toBe("Key id:secret");
        return json({
          total: 3,
          items: [
            {
              slug: "higgsfield-ai/soul/v2/standard",
              title: "Soul 2",
              variant_title: "Text to Image",
              description: "Soul desc",
              operation_type: ["text2image"],
              output_type: "image",
              input_schema: { type: "object", required: ["prompt"], properties: { prompt: { type: "string" } } },
              ui_schema: { prompt: { "ui:placeholder": "Write" } },
            },
            {
              slug: "bytedance/seedance-2.5/text-to-video",
              operation_type: ["text2video"],
              output_type: "video",
            },
            { slug: "soul-id", operation_type: ["character"], output_type: "image" },
          ],
        });
      }
      if (url === "https://dash.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/llms.txt") {
        return new Response(fixture as string, { headers: { "Content-Type": "text/plain" } });
      }
      if (url === "https://dash.higgsfield.ai/models/soul-id/llms.txt") {
        return new Response("nope", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    });

    const catalog = await fetchHiggsfieldCatalog("id:secret", { fetch: fetch as unknown as typeof globalThis.fetch });
    expect(catalog.source).toBe("higgsfield");
    expect(catalog.models.map((m) => m.slug)).toEqual([
      "higgsfield-ai/soul/v2/standard",
      "bytedance/seedance-2.5/text-to-video",
    ]);
    const soul = catalog.models[0];
    expect(soul).toMatchObject({ title: "Soul 2", variantTitle: "Text to Image", outputType: "image" });
    expect(soul.uiSchema).toEqual({ prompt: { "ui:placeholder": "Write" } });
    const seedance = catalog.models[1];
    expect(seedance.title).toBe("Seedance 2.5");
    expect(seedance.inputSchema.properties?.duration).toMatchObject({ maximum: 30 });
    expect(calls.filter((c) => c.includes("soul/v2/standard/llms.txt"))).toHaveLength(0);
    expect(catalog.skipped).toEqual(["soul-id"]);
  });

  it("throws with the API detail on auth failure", async () => {
    const fetch = vi.fn(async () => json({ detail: "Invalid credentials" }, 401));
    await expect(
      fetchHiggsfieldCatalog("id:secret", { fetch: fetch as unknown as typeof globalThis.fetch }),
    ).rejects.toThrow(/401.*Invalid credentials/);
  });

  it("rejects a missing credential before calling the network", async () => {
    const fetch = vi.fn();
    await expect(fetchHiggsfieldCatalog("", { fetch })).rejects.toThrow(/api key/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
