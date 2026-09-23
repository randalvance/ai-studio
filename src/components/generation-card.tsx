import { deleteAsset, tagAsset } from "@/app/actions";
import type { ModelSpec } from "@/lib/catalog/types";
import { ASSET_TAGS, ASSET_TAG_LABELS, type Asset } from "@/lib/types";
import { AutoSubmitSelect } from "./auto-submit-select";
import { dangerButtonClass } from "./ui";

export function assetUrl(asset: Asset): string {
  return `/api/files/${asset.projectId}/${asset.fileName}`;
}

export function GenerationCard({ asset, model, kind }: { asset: Asset; model: ModelSpec | undefined; kind: string }) {
  const url = assetUrl(asset);
  const isAudio = asset.mimeType.startsWith("audio/");
  const isVideo = asset.mimeType.startsWith("video/");
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <div className="relative aspect-square bg-[#808285]">
        {isVideo ? (
          <video controls src={url} className="h-full w-full object-contain" />
        ) : isAudio ? (
          <div className="flex h-full items-center justify-center px-3">
            <audio controls src={url} className="w-full" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.name} className="h-full w-full object-cover" />
        )}
        {asset.tag && (
          <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {ASSET_TAG_LABELS[asset.tag]}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3 text-xs">
        <div className="truncate text-sm font-medium" title={asset.name}>
          {asset.name}
        </div>
        <div className="truncate text-muted" title={asset.model}>
          {asset.provider === "upload" ? "Uploaded file" : model ? `${model.title} · ${model.variantTitle}` : (asset.model ?? asset.provider)}
        </div>
        {asset.prompt && (
          <p className="line-clamp-2 text-muted" title={asset.prompt}>
            {asset.prompt}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <form action={tagAsset} className="min-w-[7rem] flex-1">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="projectId" value={asset.projectId} />
            <input type="hidden" name="assetId" value={asset.id} />
            <AutoSubmitSelect name="tag" defaultValue={asset.tag ?? ""} className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]">
              <option value="">No tag</option>
              {ASSET_TAGS.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TAG_LABELS[t]}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
          <a href={url} download className="text-muted hover:text-foreground" title="Download">
            ↓
          </a>
          <form action={deleteAsset}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="projectId" value={asset.projectId} />
            <input type="hidden" name="assetId" value={asset.id} />
            <button className={dangerButtonClass}>Delete</button>
          </form>
        </div>
      </div>
    </div>
  );
}
