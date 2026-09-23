"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptFor, type UploadKind } from "@/lib/uploads";
import type { Asset } from "@/lib/types";

export interface UploadedAsset {
  asset: Asset;
  url: string;
}

export async function uploadFile(projectId: string, file: File, kind: UploadKind): Promise<UploadedAsset> {
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/upload`, { method: "POST", body });
  const json = (await res.json()) as UploadedAsset & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
  return json;
}

/** Small "Upload" control; calls onUploaded and refreshes server data. */
export function UploadButton({
  projectId,
  kind,
  label = "Upload",
  className,
  onUploaded,
}: {
  projectId: string;
  kind: UploadKind;
  label?: string;
  className?: string;
  onUploaded?: (u: UploadedAsset) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept={acceptFor(kind)}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const uploaded = await uploadFile(projectId, file, kind);
            onUploaded?.(uploaded);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={className}>
        {busy ? "Uploading…" : label}
      </button>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </span>
  );
}
