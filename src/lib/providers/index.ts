import { providerOf, type ModelSpec } from "../catalog/types";
import type { Settings } from "../types";
import { createElevenLabsProvider } from "./elevenlabs";
import { createHiggsfieldProvider } from "./higgsfield";
import { mockProvider } from "./mock";
import type { Provider } from "./types";

export type { GenerateRequest, GenerateResult, Provider, ReferenceInput } from "./types";

/** Settings choices. "live" routes each model to its own API; "mock" fakes everything offline. */
export const PROVIDER_CHOICES: { id: string; label: string }[] = [
  { id: "live", label: "Live APIs (Higgsfield, ElevenLabs)" },
  { id: "mock", label: "Mock (offline placeholders)" },
];

export function isLiveProvider(settings: Settings): boolean {
  return settings.provider !== "mock";
}

/** Build the provider that runs `model` under the current settings. */
export function createProvider(settings: Settings, model: ModelSpec): Provider {
  if (!isLiveProvider(settings)) return mockProvider;
  switch (providerOf(model)) {
    case "elevenlabs":
      return createElevenLabsProvider(settings.elevenlabsApiKey);
    default:
      return createHiggsfieldProvider(settings.higgsfieldApiKey);
  }
}
