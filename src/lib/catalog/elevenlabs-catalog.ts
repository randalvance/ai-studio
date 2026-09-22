import type { JsonSchema } from "./schema";
import type { Catalog, ModelSpec, UiHint } from "./types";

/**
 * ElevenLabs text-to-speech as catalog models. Docs: https://elevenlabs.io/docs/api-reference
 * One ModelSpec per TTS-capable model; the account's voices become the `voice_id` enum.
 */

export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

export interface ElevenLabsFetchOptions {
  fetch?: typeof globalThis.fetch;
}

interface ApiModel {
  model_id: string;
  name?: string;
  description?: string;
  can_do_text_to_speech?: boolean;
}

interface ApiVoice {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
}

interface VoicesPage {
  voices: ApiVoice[];
  has_more?: boolean;
  next_page_token?: string | null;
}

/** ElevenLabs output formats we expose. wav is what Seedance audio references need. */
export const OUTPUT_FORMATS = [
  "wav_24000",
  "wav_44100",
  "wav_22050",
  "wav_16000",
  "mp3_44100_128",
  "mp3_44100_192",
  "mp3_22050_32",
];

/**
 * Text-to-speech models per https://elevenlabs.io/docs/overview/capabilities/text-to-speech,
 * used when the API key is not allowed to list models (missing `models_read`).
 */
export const DEFAULT_TTS_MODELS: ApiModel[] = [
  { model_id: "eleven_v3", name: "Eleven v3", description: "Most expressive model, 70+ languages.", can_do_text_to_speech: true },
  { model_id: "eleven_multilingual_v2", name: "Eleven Multilingual v2", description: "Lifelike, consistent quality; best for long-form content.", can_do_text_to_speech: true },
  { model_id: "eleven_flash_v2_5", name: "Eleven Flash v2.5", description: "Fast and affordable, ~75 ms latency.", can_do_text_to_speech: true },
];

const PERMISSION_HINT: Record<string, string> = {
  models_read: 'enable "Models: read"',
  voices_read: 'enable "Voices: read"',
  text_to_speech: 'enable "Text to Speech"',
};

/** Turn ElevenLabs' "missing the permission X" message into actionable advice. */
export function permissionAdvice(detail: string): string | null {
  const m = /permission\s+([a-z_]+)/i.exec(detail);
  if (!m) return null;
  const hint = PERMISSION_HINT[m[1]] ?? `enable "${m[1]}"`;
  return `Your ElevenLabs API key lacks the ${m[1]} permission. Edit the key at elevenlabs.io → API keys and ${hint}, or create a key with full access.`;
}

export async function elevenLabsErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const d = body.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && "message" in d && typeof (d as { message: unknown }).message === "string") {
      return (d as { message: string }).message;
    }
    if (d) return JSON.stringify(d);
  } catch {
    /* non-JSON */
  }
  return res.statusText || "request failed";
}

export function buildTtsSchema(voices: ApiVoice[]): { inputSchema: JsonSchema; uiSchema: Record<string, UiHint> } {
  const enumLabels: Record<string, string> = {};
  const enumPreviews: Record<string, string> = {};
  for (const v of voices) {
    enumLabels[v.voice_id] = v.category ? `${v.name} (${v.category})` : v.name;
    if (v.preview_url) enumPreviews[v.voice_id] = v.preview_url;
  }
  const inputSchema: JsonSchema = {
    type: "object",
    required: ["text", "voice_id"],
    properties: {
      text: { type: "string", minLength: 1, title: "Text", description: "What the voice should say" },
      voice_id: {
        type: "string",
        title: "Voice",
        enum: voices.map((v) => v.voice_id),
        enumLabels,
        enumPreviews,
        ...(voices[0] ? { default: voices[0].voice_id } : {}),
      },
      output_format: {
        type: "string",
        title: "Output format",
        enum: OUTPUT_FORMATS,
        default: "wav_24000",
        description: "Use a wav format if the clip will be a video reference",
      },
      stability: { type: "number", title: "Stability", minimum: 0, maximum: 1, default: 0.5 },
      similarity_boost: { type: "number", title: "Similarity", minimum: 0, maximum: 1, default: 0.75 },
      style: { type: "number", title: "Style exaggeration", minimum: 0, maximum: 1, default: 0 },
      speed: { type: "number", title: "Speed", minimum: 0.7, maximum: 1.2, default: 1 },
      use_speaker_boost: { type: "boolean", title: "Speaker boost", default: true },
      language_code: { type: "string", title: "Language code", description: "ISO 639-1, e.g. en (optional)" },
      seed: { type: "integer", title: "Seed", minimum: 0, maximum: 4294967295 },
    },
    additionalProperties: false,
  };
  const adv = (advanced: boolean): UiHint => ({ "ui:options": { advanced } });
  const uiSchema: Record<string, UiHint> = {
    text: { ...adv(false), "ui:placeholder": "Type the line to speak…" },
    voice_id: adv(false),
    output_format: adv(false),
    stability: { ...adv(true), "ui:widget": "range" },
    similarity_boost: { ...adv(true), "ui:widget": "range" },
    style: { ...adv(true), "ui:widget": "range" },
    speed: { ...adv(true), "ui:widget": "range" },
    use_speaker_boost: adv(true),
    language_code: adv(true),
    seed: adv(true),
  };
  return { inputSchema, uiSchema };
}

export async function fetchElevenLabsCatalog(apiKey: string, options: ElevenLabsFetchOptions = {}): Promise<Catalog> {
  const key = apiKey.trim();
  if (!key) throw new Error("ElevenLabs API key is not set. Add it in Settings.");
  const fetchFn = options.fetch ?? globalThis.fetch;
  const headers = { "xi-api-key": key };

  let apiModels: ApiModel[];
  let warning: string | undefined;
  const modelsRes = await fetchFn(`${ELEVENLABS_BASE_URL}/v1/models`, { headers });
  if (modelsRes.ok) {
    apiModels = (await modelsRes.json()) as ApiModel[];
  } else {
    const detail = await elevenLabsErrorDetail(modelsRes);
    const advice = permissionAdvice(detail);
    if (!advice) throw new Error(`ElevenLabs model list failed (${modelsRes.status}): ${detail}`);
    // Restricted key: fall back to the documented TTS models so speech still works.
    apiModels = DEFAULT_TTS_MODELS;
    warning = `${advice} Using the documented text-to-speech models for now (models_read was refused).`;
  }

  const voices: ApiVoice[] = [];
  let token: string | null | undefined;
  do {
    const url = new URL(`${ELEVENLABS_BASE_URL}/v2/voices`);
    url.searchParams.set("page_size", "100");
    if (token) url.searchParams.set("next_page_token", token);
    const res = await fetchFn(url.toString(), { headers });
    if (!res.ok) {
      const detail = await elevenLabsErrorDetail(res);
      const advice = permissionAdvice(detail);
      throw new Error(`ElevenLabs voice list failed (${res.status}): ${detail}${advice ? ` ${advice}` : ""}`);
    }
    const page = (await res.json()) as VoicesPage;
    voices.push(...(page.voices ?? []));
    token = page.has_more ? page.next_page_token : null;
  } while (token);

  const { inputSchema, uiSchema } = buildTtsSchema(voices);
  const models: ModelSpec[] = apiModels
    .filter((m) => m.can_do_text_to_speech)
    .map((m) => ({
      slug: `elevenlabs/${m.model_id}`,
      provider: "elevenlabs",
      title: "ElevenLabs",
      variantTitle: m.name ?? m.model_id,
      description: m.description ?? "",
      operationType: "text2speech",
      outputType: "audio",
      inputSchema,
      uiSchema,
    }));

  return { source: "higgsfield", fetchedAt: new Date().toISOString(), models, ...(warning ? { warning } : {}) };
}
