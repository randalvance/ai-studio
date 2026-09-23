import { assetFields } from "../catalog/schema";
import type { GenerateResult, Provider, ReferenceInput } from "./types";

/**
 * Higgsfield cloud API provider. Docs: https://docs.higgsfield.ai/docs
 *
 * Every model shares one lifecycle: POST https://api.higgsfield.ai/<slug> with
 * a body matching the model's input schema -> { status_url } -> poll until a
 * terminal status -> download the output. Auth is `Authorization: Key ID:SECRET`.
 * Media inputs must be public URLs, so gallery assets are uploaded first via
 * the presigned upload flow; the public URL is returned for caching.
 */

export const HIGGSFIELD_BASE_URL = "https://api.higgsfield.ai";
export const UPLOAD_URL_ENDPOINT = `${HIGGSFIELD_BASE_URL}/files/generate-upload-url`;

/** Content types the upload endpoint accepts (docs: file uploads). */
const UPLOADABLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/wav",
  "audio/x-wav",
  "video/mp4",
]);

export interface HiggsfieldOptions {
  fetch?: typeof globalThis.fetch;
  /** Initial poll interval; grows 1.5x per poll up to 10s (per the docs). */
  pollIntervalMs?: number;
  maxPollMs?: number;
}

export interface Credential {
  keyId: string;
  keySecret: string;
}

/** Credentials are stored as `KEY_ID:KEY_SECRET`, the same shape as HF_CREDENTIALS. */
export function parseCredential(value: string): Credential | null {
  const idx = value.indexOf(":");
  if (idx <= 0) return null;
  const keyId = value.slice(0, idx).trim();
  const keySecret = value.slice(idx + 1).trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);

interface SubmitResponse {
  status: string;
  request_id: string;
  status_url: string;
}

interface StatusResponse {
  status: string;
  request_id?: string;
  error?: string;
  images?: { url: string }[];
  video?: { url: string };
  audio?: { url: string };
  audios?: { url: string }[];
}

interface UploadUrlResponse {
  upload_url: string;
  upload_headers?: Record<string, string>;
  public_url: string;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail) return JSON.stringify(body.detail);
  } catch {
    /* non-JSON body */
  }
  return res.statusText || "request failed";
}

function extFromMime(mime: string, url: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  if (map[mime]) return map[mime];
  const m = /\.([a-z0-9]{2,4})(?:$|\?)/i.exec(new URL(url).pathname);
  return m ? m[1].toLowerCase() : "bin";
}

export function outputUrl(status: StatusResponse): string | undefined {
  return status.images?.[0]?.url ?? status.video?.url ?? status.audio?.url ?? status.audios?.[0]?.url;
}

export function createHiggsfieldProvider(credential: string, options: HiggsfieldOptions = {}): Provider {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const startInterval = options.pollIntervalMs ?? 2000;
  // Video models regularly need more than 5 minutes; the docs leave the ceiling to the client.
  const maxPollMs = options.maxPollMs ?? 15 * 60 * 1000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function submit(url: string, body: unknown, headers: Record<string, string>): Promise<SubmitResponse> {
    const res = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Higgsfield submit failed (${res.status}): ${await errorDetail(res)}`);
    const submitted = (await res.json()) as SubmitResponse;
    if (!submitted.status_url) throw new Error("Higgsfield response had no status_url");
    return submitted;
  }

  async function waitForResult(submitted: SubmitResponse, authorization: string): Promise<StatusResponse> {
    const deadline = Date.now() + maxPollMs;
    let interval = startInterval;
    for (;;) {
      const res = await fetchFn(submitted.status_url, { headers: { Authorization: authorization } });
      if (!res.ok) throw new Error(`Higgsfield status check failed (${res.status}): ${await errorDetail(res)}`);
      const status = (await res.json()) as StatusResponse;
      if (TERMINAL.has(status.status)) {
        if (status.status !== "completed") {
          throw new Error(`Higgsfield generation ${status.status}${status.error ? `: ${status.error}` : ""}`);
        }
        return status;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Higgsfield request ${submitted.request_id} timed out after ${Math.round(maxPollMs / 1000)}s`);
      }
      await sleep(interval + Math.random() * Math.min(500, interval));
      interval = Math.min(interval * 1.5, 10_000);
    }
  }

  async function download(url: string): Promise<GenerateResult> {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Downloading Higgsfield output failed (${res.status})`);
    const mimeType = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    return { bytes: Buffer.from(await res.arrayBuffer()), mimeType, ext: extFromMime(mimeType, url) };
  }

  /** Presigned upload: ask for an upload URL, PUT the bytes, return the public URL. */
  async function upload(ref: ReferenceInput, headers: Record<string, string>): Promise<string> {
    if (!UPLOADABLE.has(ref.mimeType)) {
      throw new Error(
        `"${ref.name}" is ${ref.mimeType}; Higgsfield uploads accept jpeg, png, webp, gif, wav or mp4${
          ref.mimeType === "image/svg+xml" ? " (mock placeholders cannot be used as references)" : ""
        }.`,
      );
    }
    const res = await fetchFn(UPLOAD_URL_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ content_type: ref.mimeType }),
    });
    if (!res.ok) throw new Error(`Higgsfield upload URL request failed (${res.status}): ${await errorDetail(res)}`);
    const info = (await res.json()) as UploadUrlResponse;
    // Never send API credentials to the storage URL (docs: file uploads).
    const put = await fetchFn(info.upload_url, {
      method: "PUT",
      headers: { "Content-Type": ref.mimeType, ...(info.upload_headers ?? {}) },
      body: new Uint8Array(ref.bytes),
    });
    if (!put.ok) throw new Error(`Uploading "${ref.name}" to Higgsfield storage failed (${put.status})`);
    return info.public_url;
  }

  return {
    id: "higgsfield",
    label: "Higgsfield",
    async generate(req): Promise<GenerateResult> {
      const cred = parseCredential(credential);
      if (!cred) throw new Error("Higgsfield API key is not set. Add it in Settings as KEY_ID:KEY_SECRET.");
      const headers = {
        Authorization: `Key ${cred.keyId}:${cred.keySecret}`,
        "Content-Type": "application/json",
      };

      // Replace asset ids in media fields with public URLs, uploading on demand.
      const byId = new Map(req.assets.map((a) => [a.id, a]));
      const uploadedUrls: Record<string, string> = {};
      const urlFor = async (id: string): Promise<string> => {
        const ref = byId.get(id);
        if (!ref) throw new Error(`Reference asset ${id} not found in this project`);
        if (ref.remoteUrl) return ref.remoteUrl;
        if (uploadedUrls[id]) return uploadedUrls[id];
        const url = await upload(ref, headers);
        uploadedUrls[id] = url;
        return url;
      };
      const body: Record<string, unknown> = { ...req.inputs };
      for (const field of assetFields(req.model.inputSchema)) {
        const value = body[field.name];
        if (value === undefined || value === null) continue;
        if (field.multiple) {
          const ids = Array.isArray(value) ? value.map(String) : [String(value)];
          const urls: string[] = [];
          for (const id of ids) urls.push(await urlFor(id));
          body[field.name] = urls;
        } else {
          body[field.name] = await urlFor(String(value));
        }
      }

      const submitted = await submit(`${HIGGSFIELD_BASE_URL}/${req.model.slug}`, body, headers);
      const status = await waitForResult(submitted, headers.Authorization);
      const url = outputUrl(status);
      if (!url) throw new Error("Higgsfield completed without an output file");
      return { ...(await download(url)), uploadedUrls };
    },
  };
}
