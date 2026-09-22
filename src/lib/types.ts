import type { OutputType } from "./catalog/types";

/** Asset types are the model output types. */
export const ASSET_TYPES = ["image", "video", "audio"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export type { OutputType };

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
};

/** Optional role an asset plays in a project, used when picking references. */
export const ASSET_TAGS = ["character", "setting", "voice"] as const;
export type AssetTag = (typeof ASSET_TAGS)[number];
export const ASSET_TAG_LABELS: Record<AssetTag, string> = {
  character: "Character",
  setting: "Setting",
  voice: "Voice",
};

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  name: string;
  prompt: string;
  /** File name inside the project's assets folder, e.g. "abc123.png" */
  fileName: string;
  mimeType: string;
  provider: string;
  createdAt: string;
  /** Catalog model slug that produced it, e.g. "bytedance/seedance-2.5/text-to-video". */
  model?: string;
  /** Inputs sent to the model (asset ids for media fields). */
  inputs?: Record<string, unknown>;
  tag?: AssetTag;
  /** Asset ids used as references. */
  references?: string[];
  /** Public URL after uploading to a provider's storage, cached to avoid re-uploads. */
  remoteUrl?: string;
}

export interface Settings {
  galleryPath: string;
  provider: string;
  /** Higgsfield credential as `KEY_ID:KEY_SECRET`. Empty when not configured. */
  higgsfieldApiKey: string;
  /** ElevenLabs API key (xi-api-key). Empty when not configured. */
  elevenlabsApiKey: string;
  /** Project shown in the studio. Empty until one is picked. */
  currentProjectId: string;
}
