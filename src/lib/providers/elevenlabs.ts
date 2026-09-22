import { ELEVENLABS_BASE_URL, elevenLabsErrorDetail } from "../catalog/elevenlabs-catalog";
import type { GenerateResult, Provider } from "./types";

/**
 * ElevenLabs text-to-speech. POST /v1/text-to-speech/{voice_id}?output_format=…
 * with `xi-api-key`; the response body is the audio file.
 */

export interface ElevenLabsOptions {
  fetch?: typeof globalThis.fetch;
}

const VOICE_SETTING_KEYS = ["stability", "similarity_boost", "style", "speed", "use_speaker_boost"] as const;

function extFromMime(mime: string, outputFormat: string): string {
  if (mime === "audio/wav" || mime === "audio/x-wav" || outputFormat.startsWith("wav_")) return "wav";
  if (mime === "audio/mpeg" || outputFormat.startsWith("mp3_")) return "mp3";
  if (outputFormat.startsWith("opus_")) return "ogg";
  return "bin";
}

export function createElevenLabsProvider(apiKey: string, options: ElevenLabsOptions = {}): Provider {
  const fetchFn = options.fetch ?? globalThis.fetch;
  return {
    id: "elevenlabs",
    label: "ElevenLabs",
    async generate(req): Promise<GenerateResult> {
      const key = apiKey.trim();
      if (!key) throw new Error("ElevenLabs API key is not set. Add it in Settings.");
      const voiceId = typeof req.inputs.voice_id === "string" ? req.inputs.voice_id : "";
      if (!voiceId) throw new Error("Pick a voice.");
      const text = typeof req.inputs.text === "string" ? req.inputs.text : "";
      const outputFormat = typeof req.inputs.output_format === "string" ? req.inputs.output_format : "wav_24000";
      const modelId = req.model.slug.replace(/^elevenlabs\//, "");

      const voiceSettings: Record<string, unknown> = {};
      for (const k of VOICE_SETTING_KEYS) if (req.inputs[k] !== undefined) voiceSettings[k] = req.inputs[k];
      const body: Record<string, unknown> = { text, model_id: modelId };
      if (typeof req.inputs.language_code === "string" && req.inputs.language_code) body.language_code = req.inputs.language_code;
      if (typeof req.inputs.seed === "number") body.seed = req.inputs.seed;
      if (Object.keys(voiceSettings).length) body.voice_settings = voiceSettings;

      const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/*" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`ElevenLabs speech failed (${res.status}): ${await elevenLabsErrorDetail(res)}`);
      const rawMime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      const ext = extFromMime(rawMime, outputFormat);
      const mimeType = ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : rawMime || "application/octet-stream";
      return { bytes: Buffer.from(await res.arrayBuffer()), mimeType, ext };
    },
  };
}
