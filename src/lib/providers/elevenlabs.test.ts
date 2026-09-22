import { describe, it, expect, vi } from "vitest";
import { createElevenLabsProvider } from "./elevenlabs";
import type { ModelSpec } from "../catalog/types";

const model: ModelSpec = {
  slug: "elevenlabs/eleven_multilingual_v2",
  title: "ElevenLabs",
  variantTitle: "Eleven Multilingual v2",
  description: "",
  operationType: "text2speech",
  outputType: "audio",
  provider: "elevenlabs",
  inputSchema: { type: "object", properties: {} },
};

describe("elevenlabs provider", () => {
  it("posts text to the voice endpoint with settings and returns the audio", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "Content-Type": "audio/wav" } });
    });
    const out = await createElevenLabsProvider("xi-test", { fetch: fetch as unknown as typeof globalThis.fetch }).generate({
      model,
      inputs: { text: "Hello there", voice_id: "v1", output_format: "wav_24000", stability: 0.3, similarity_boost: 0.8, style: 0.1, speed: 1.1, use_speaker_boost: false, language_code: "en", seed: 7 },
      assets: [],
    });
    expect(out).toMatchObject({ mimeType: "audio/wav", ext: "wav" });
    expect([...out.bytes]).toEqual([82, 73, 70, 70]);
    const call = calls[0];
    expect(call.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/v1?output_format=wav_24000");
    expect(call.init?.method).toBe("POST");
    const headers = new Headers(call.init?.headers);
    expect(headers.get("xi-api-key")).toBe("xi-test");
    expect(JSON.parse(String(call.init?.body))).toEqual({
      text: "Hello there",
      model_id: "eleven_multilingual_v2",
      language_code: "en",
      seed: 7,
      voice_settings: { stability: 0.3, similarity_boost: 0.8, style: 0.1, speed: 1.1, use_speaker_boost: false },
    });
  });

  it("maps mp3 output to audio/mpeg and omits empty settings", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(new Uint8Array([1]), { headers: { "Content-Type": "audio/mpeg" } });
    });
    const out = await createElevenLabsProvider("xi-test", { fetch: fetch as unknown as typeof globalThis.fetch }).generate({
      model,
      inputs: { text: "Hi", voice_id: "v2", output_format: "mp3_44100_128" },
      assets: [],
    });
    expect(out).toMatchObject({ mimeType: "audio/mpeg", ext: "mp3" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: "Hi", model_id: "eleven_multilingual_v2" });
  });

  it("surfaces API errors with status and detail", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ detail: { status: "quota_exceeded", message: "No credits" } }), { status: 402, headers: { "Content-Type": "application/json" } }));
    await expect(
      createElevenLabsProvider("xi-test", { fetch: fetch as unknown as typeof globalThis.fetch }).generate({ model, inputs: { text: "Hi", voice_id: "v1" }, assets: [] }),
    ).rejects.toThrow(/402.*No credits/);
  });

  it("fails fast without a key or voice", async () => {
    const fetch = vi.fn();
    await expect(createElevenLabsProvider("", { fetch }).generate({ model, inputs: { text: "Hi", voice_id: "v1" }, assets: [] })).rejects.toThrow(/api key/i);
    await expect(createElevenLabsProvider("xi", { fetch }).generate({ model, inputs: { text: "Hi" }, assets: [] })).rejects.toThrow(/voice/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
