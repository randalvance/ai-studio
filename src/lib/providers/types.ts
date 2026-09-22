import type { ModelSpec } from "../catalog/types";
import type { Inputs } from "../catalog/schema";
import type { AssetType } from "../types";

export interface ReferenceInput {
  id: string;
  type: AssetType;
  name: string;
  mimeType: string;
  bytes: Buffer;
  /** Public URL from a previous upload, if any. */
  remoteUrl?: string;
}

export interface GenerateRequest {
  model: ModelSpec;
  /** Validated inputs. Media (uri) fields hold gallery asset ids. */
  inputs: Inputs;
  /** Assets referenced by id in `inputs`. */
  assets: ReferenceInput[];
}

export interface GenerateResult {
  bytes: Buffer;
  mimeType: string;
  ext: string;
  /** Reference asset id -> public URL, for callers to cache on the asset. */
  uploadedUrls?: Record<string, string>;
}

export interface Provider {
  id: string;
  label: string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
