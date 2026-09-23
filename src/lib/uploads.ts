import type { AssetType } from "./types";

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Supported upload types: what the studio can display and what providers accept as references. */
const MIME: Record<string, { type: AssetType; ext: string; mimeType: string }> = {
  "image/jpeg": { type: "image", ext: "jpg", mimeType: "image/jpeg" },
  "image/jpg": { type: "image", ext: "jpg", mimeType: "image/jpeg" },
  "image/png": { type: "image", ext: "png", mimeType: "image/png" },
  "image/webp": { type: "image", ext: "webp", mimeType: "image/webp" },
  "image/gif": { type: "image", ext: "gif", mimeType: "image/gif" },
  "audio/wav": { type: "audio", ext: "wav", mimeType: "audio/wav" },
  "audio/x-wav": { type: "audio", ext: "wav", mimeType: "audio/wav" },
  "audio/wave": { type: "audio", ext: "wav", mimeType: "audio/wav" },
  "audio/mpeg": { type: "audio", ext: "mp3", mimeType: "audio/mpeg" },
  "audio/mp3": { type: "audio", ext: "mp3", mimeType: "audio/mpeg" },
  "video/mp4": { type: "video", ext: "mp4", mimeType: "video/mp4" },
  "video/quicktime": { type: "video", ext: "mov", mimeType: "video/quicktime" },
  "video/webm": { type: "video", ext: "webm", mimeType: "video/webm" },
};

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export type UploadKind = AssetType | "any";

export interface UploadInfo {
  type: AssetType;
  mimeType: string;
  ext: string;
}

/** Decide how an uploaded file is stored. Throws a user-facing message when unsupported. */
export function classifyUpload(file: { name: string; type: string; size: number }, expected: UploadKind = "any"): UploadInfo {
  if (file.size <= 0) throw new Error("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`The file is too large (limit ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  const key = MIME[mime] ? mime : BY_EXT[ext];
  const info = key ? MIME[key] : undefined;
  if (!info) {
    if (mime === "image/svg+xml" || ext === "svg") throw new Error("SVG files are not supported; use png, jpeg, webp or gif.");
    throw new Error(`"${file.name}" is not supported. Use png, jpeg, webp, gif, wav, mp3, mp4, mov or webm.`);
  }
  if (expected !== "any" && info.type !== expected) {
    const article = (w: string) => (/^[aeiou]/.test(w) ? "an" : "a");
    throw new Error(`This field needs ${article(expected)} ${expected} file, but "${file.name}" is ${article(info.type)} ${info.type}.`);
  }
  return { type: info.type, mimeType: info.mimeType, ext: info.ext };
}

/** `accept` attribute for a file input limited to a kind. */
export function acceptFor(kind: UploadKind): string {
  const mimes = Object.entries(MIME)
    .filter(([, v]) => kind === "any" || v.type === kind)
    .map(([k]) => k);
  return [...new Set(mimes)].join(",");
}
