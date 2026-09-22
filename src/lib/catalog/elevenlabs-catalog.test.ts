import { describe, it, expect, vi } from "vitest";
import { fetchElevenLabsCatalog } from "./elevenlabs-catalog";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchElevenLabsCatalog", () => {
  it("builds one audio model per TTS-capable model with voices as an enum", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      expect(new Headers(init?.headers).get("xi-api-key")).toBe("xi-test");
      if (url === "https://api.elevenlabs.io/v1/models") {
        return json([
          { model_id: "eleven_multilingual_v2", name: "Eleven Multilingual v2", description: "Best quality", can_do_text_to_speech: true },
          { model_id: "eleven_flash_v2_5", name: "Eleven Flash v2.5", description: "Fast", can_do_text_to_speech: true },
          { model_id: "eleven_english_sts_v2", name: "STS", can_do_text_to_speech: false, can_do_voice_conversion: true },
        ]);
      }
      if (url.startsWith("https://api.elevenlabs.io/v2/voices")) {
        const u = new URL(url);
        expect(u.searchParams.get("page_size")).toBe("100");
        if (!u.searchParams.get("next_page_token")) {
          return json({
            voices: [
              { voice_id: "v1", name: "Rachel", category: "premade", preview_url: "https://cdn/v1.mp3", labels: { accent: "american" } },
              { voice_id: "v2", name: "My clone", category: "cloned", preview_url: "https://cdn/v2.mp3", labels: {} },
            ],
            has_more: true,
            next_page_token: "tok",
          });
        }
        return json({ voices: [{ voice_id: "v3", name: "Adam", category: "premade" }], has_more: false, next_page_token: null });
      }
      return new Response("not found", { status: 404 });
    });

    const catalog = await fetchElevenLabsCatalog("xi-test", { fetch: fetch as unknown as typeof globalThis.fetch });
    expect(catalog.models.map((m) => m.slug)).toEqual(["elevenlabs/eleven_multilingual_v2", "elevenlabs/eleven_flash_v2_5"]);
    const m = catalog.models[0];
    expect(m).toMatchObject({ provider: "elevenlabs", outputType: "audio", title: "ElevenLabs", variantTitle: "Eleven Multilingual v2", operationType: "text2speech" });
    expect(m.inputSchema.required).toEqual(["text", "voice_id"]);
    const voice = m.inputSchema.properties!.voice_id;
    expect(voice.enum).toEqual(["v1", "v2", "v3"]);
    expect(voice.enumLabels).toEqual({ v1: "Rachel (premade)", v2: "My clone (cloned)", v3: "Adam (premade)" });
    expect(voice.enumPreviews).toEqual({ v1: "https://cdn/v1.mp3", v2: "https://cdn/v2.mp3" });
    expect(voice.default).toBe("v1");
    expect(m.inputSchema.properties!.output_format.default).toBe("wav_24000");
    expect(m.inputSchema.properties!.stability).toMatchObject({ type: "number", minimum: 0, maximum: 1, default: 0.5 });
    expect(m.uiSchema?.stability?.["ui:options"]?.advanced).toBe(true);
    expect(m.uiSchema?.text?.["ui:options"]?.advanced).toBe(false);
    expect(calls.filter((c) => c.url.includes("/v2/voices"))).toHaveLength(2);
  });

  it("reports auth failures with the API detail", async () => {
    const fetch = vi.fn(async () => json({ detail: { status: "invalid_api_key", message: "bad key" } }, 401));
    await expect(fetchElevenLabsCatalog("xi", { fetch: fetch as unknown as typeof globalThis.fetch })).rejects.toThrow(/401.*bad key/);
  });

  it("rejects a missing key before calling the network", async () => {
    const fetch = vi.fn();
    await expect(fetchElevenLabsCatalog("  ", { fetch })).rejects.toThrow(/api key/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fetchElevenLabsCatalog: restricted keys", () => {
  const voicesPage = { voices: [{ voice_id: "v1", name: "Rachel", category: "premade" }], has_more: false, next_page_token: null };

  it("falls back to the documented TTS models when the key lacks models_read", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v1/models")) {
        return json({ detail: { status: "missing_permissions", message: "The API key you used is missing the permission models_read to execute this operation." } }, 401);
      }
      if (url.includes("/v2/voices")) return json(voicesPage);
      return new Response("nope", { status: 404 });
    });
    const catalog = await fetchElevenLabsCatalog("xi", { fetch: fetch as unknown as typeof globalThis.fetch });
    expect(catalog.models.map((m) => m.slug)).toEqual([
      "elevenlabs/eleven_v3",
      "elevenlabs/eleven_multilingual_v2",
      "elevenlabs/eleven_flash_v2_5",
    ]);
    expect(catalog.models[0].inputSchema.properties!.voice_id.enum).toEqual(["v1"]);
    expect(catalog.warning).toMatch(/models_read/);
  });

  it("explains the voices_read permission when the voice list is forbidden", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v1/models")) return json([{ model_id: "eleven_v3", name: "Eleven v3", can_do_text_to_speech: true }]);
      return json({ detail: { status: "missing_permissions", message: "missing the permission voices_read" } }, 401);
    });
    await expect(fetchElevenLabsCatalog("xi", { fetch: fetch as unknown as typeof globalThis.fetch })).rejects.toThrow(/voices_read.*Voices.*read/i);
  });
});
