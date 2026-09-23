import Link from "next/link";
import { notFound } from "next/navigation";
import { refreshCatalog } from "@/app/actions";
import { GenerateForm } from "@/components/generate-form";
import { GenerationStatusProvider, PendingCard } from "@/components/generation-status";
import { GenerationCard, assetUrl } from "@/components/generation-card";
import { ModelSelect } from "@/components/model-select";
import { ProjectSwitcher } from "@/components/project-switcher";
import type { PickableAsset } from "@/components/schema-form";
import { UploadButton } from "@/components/upload-button";
import { Empty, ghostButtonClass, inputClass, sectionLabelClass } from "@/components/ui";
import { assetFields } from "@/lib/catalog/schema";
import { OUTPUT_TYPES, type ModelSpec, type OutputType } from "@/lib/catalog/types";
import { isLiveProvider } from "@/lib/providers";
import { catalogStore, getGallery, settingsStore } from "@/lib/studio";
import { ASSET_TYPE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLS = [2, 3, 4, 6] as const;

/** Prefer a text-to-* model that needs no media inputs, so the first form is usable immediately. */
function defaultModel(models: ModelSpec[]): ModelSpec | undefined {
  const needsMedia = (m: ModelSpec) =>
    assetFields(m.inputSchema).some((f) => (m.inputSchema.required ?? []).includes(f.name));
  return (
    models.find((m) => m.slug.startsWith("higgsfield-ai/soul/v2") || m.slug.startsWith("bytedance/seedance-2.5/text-to-video")) ??
    models.find((m) => /text2(image|video|audio|speech)/.test(m.operationType) && !needsMedia(m)) ??
    models.find((m) => !needsMedia(m)) ??
    models[0]
  );
}

export default async function StudioPage(props: PageProps<"/[kind]">) {
  const { kind: rawKind } = await props.params;
  if (!OUTPUT_TYPES.includes(rawKind as OutputType)) notFound();
  const kind = rawKind as OutputType;
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const cols = COLS.find((c) => String(c) === sp.cols) ?? 4;
  const error = typeof sp.error === "string" ? sp.error : "";

  const [settings, catalog, gallery] = await Promise.all([settingsStore.get(), catalogStore.get(), getGallery()]);
  const projects = await gallery.listProjects();
  const current = projects.find((p) => p.id === settings.currentProjectId) ?? projects[0] ?? null;
  const models = catalogStore.modelsFor(catalog, kind);
  const selectedSlug =
    typeof sp.model === "string" && models.some((m) => m.slug === sp.model) ? sp.model : defaultModel(models)?.slug ?? "";
  const model = models.find((m) => m.slug === selectedSlug);
  const providerLabel = isLiveProvider(settings)
    ? (model?.provider ?? (kind === "audio" ? "elevenlabs" : "higgsfield")) === "elevenlabs"
      ? "ElevenLabs"
      : "Higgsfield"
    : "Mock (offline placeholders)";

  const allAssets = current ? await gallery.listAssets(current.id) : [];
  const modelBySlug = new Map(catalog.models.map((m) => [m.slug, m]));
  const generations = allAssets
    .filter((a) => a.type === kind)
    .filter((a) => !q || a.prompt.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.model ?? "").toLowerCase().includes(q));
  const pickable: PickableAsset[] = allAssets.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    tag: a.tag,
    url: assetUrl(a),
    mimeType: a.mimeType,
  }));

  return (
    <GenerationStatusProvider>
      <aside className="flex w-[420px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-border p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{ASSET_TYPE_LABELS[kind]} Generator</h1>
          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted">{providerLabel}</span>
        </div>

        <ProjectSwitcher projects={projects} current={current} kind={kind} />

        <div className="flex flex-col gap-2">
          <span className={sectionLabelClass}>Model</span>
          <ModelSelect kind={kind} models={models} selected={selectedSlug} />
          {model?.description && <p className="text-xs text-muted">{model.description}</p>}
          {kind === "audio" && catalog.warnings?.elevenlabs && (
            <p className="rounded-md border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">{catalog.warnings.elevenlabs}</p>
          )}
          {models.length === 0 && kind === "audio" && catalog.errors?.elevenlabs && (
            <div role="alert" className="flex flex-col gap-2 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
              <span>
                Last refresh ({new Date(catalog.fetchedAt).toLocaleTimeString()}): {catalog.errors.elevenlabs}
              </span>
              <form action={refreshCatalog}>
                <input type="hidden" name="provider" value="elevenlabs" />
                <input type="hidden" name="returnTo" value="/audio" />
                <button className={ghostButtonClass}>Retry now</button>
              </form>
            </div>
          )}
          {models.length === 0 && (
            <p className="text-xs text-muted">
              The catalog has no {kind} models.{" "}
              {kind === "audio"
                ? settings.elevenlabsApiKey
                  ? "Fix the key permissions, then refresh the catalog in "
                  : "Add your ElevenLabs key in "
                : catalog.source === "bundled"
                  ? "Add your Higgsfield key and refresh the catalog in "
                  : "Try refreshing the catalog in "}
              <Link href="/settings" className="underline">
                Settings
              </Link>
              .
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {model && current && <GenerateForm kind={kind} projectId={current.id} model={model} assets={pickable} />}
        {model && !current && <p className="text-xs text-muted">Create a project to start generating.</p>}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <span className={sectionLabelClass}>My generations</span>
          <form method="get" action={`/${kind}`} className="flex-1 max-w-md">
            {selectedSlug && <input type="hidden" name="model" value={selectedSlug} />}
            <input type="hidden" name="cols" value={cols} />
            <input name="q" defaultValue={q} placeholder="Search prompts or models…" className={`${inputClass} rounded-full`} />
          </form>
          {current && (
            <UploadButton projectId={current.id} kind={kind} label={`Upload ${kind}`} className={`${ghostButtonClass} rounded-full px-3 py-1.5 text-xs`} />
          )}
          <div className="ml-auto flex items-center gap-1 rounded-full border border-border px-1 py-1">
            {COLS.map((c) => (
              <Link
                key={c}
                href={`/${kind}?${new URLSearchParams({ ...(selectedSlug ? { model: selectedSlug } : {}), ...(q ? { q } : {}), cols: String(c) })}`}
                className={`rounded-full px-2.5 py-1 text-xs ${c === cols ? "bg-panel text-white" : "text-muted hover:text-white"}`}
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
        {!current ? (
          <Empty>Create a project on the left to see its generations here.</Empty>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            <PendingCard />
            {generations.map((a) => (
              <GenerationCard key={a.id} asset={a} model={modelBySlug.get(a.model ?? "")} kind={kind} />
            ))}
            {generations.length === 0 && (
              <div className="col-span-full">
                <Empty>{q ? "Nothing matches your search." : `No ${kind} generations in ${current.name} yet.`}</Empty>
              </div>
            )}
          </div>
        )}
      </main>
    </GenerationStatusProvider>
  );
}
