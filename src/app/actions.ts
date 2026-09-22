"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { catalogStore, getGallery, settingsStore } from "@/lib/studio";
import { createProvider, type ReferenceInput } from "@/lib/providers";
import { fetchHiggsfieldCatalog } from "@/lib/catalog/higgsfield-catalog";
import { fetchElevenLabsCatalog } from "@/lib/catalog/elevenlabs-catalog";
import { providersToRefresh, runCatalogRefresh } from "@/lib/catalog/refresh";
import type { ModelProvider } from "@/lib/catalog/types";
import { assetFields, coerceFormValues, validateInputs } from "@/lib/catalog/schema";
import { OUTPUT_TYPES } from "@/lib/catalog/types";
import { ASSET_TAGS, type AssetTag } from "@/lib/types";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function kindOf(formData: FormData): string {
  const k = str(formData, "kind");
  return OUTPUT_TYPES.includes(k as never) ? k : "image";
}

function studioPath(kind: string, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `/${kind}${s ? `?${s}` : ""}`;
}

// ---- projects ---------------------------------------------------------------

export async function createProject(formData: FormData): Promise<void> {
  const kind = kindOf(formData);
  const gallery = await getGallery();
  const project = await gallery.createProject({ name: str(formData, "name"), description: str(formData, "description") });
  await settingsStore.update({ currentProjectId: project.id });
  revalidatePath("/", "layout");
  redirect(studioPath(kind));
}

export async function selectProject(formData: FormData): Promise<void> {
  const kind = kindOf(formData);
  await settingsStore.update({ currentProjectId: str(formData, "projectId") });
  revalidatePath("/", "layout");
  redirect(studioPath(kind));
}

export async function updateProject(formData: FormData): Promise<void> {
  const kind = kindOf(formData);
  const gallery = await getGallery();
  await gallery.updateProject(str(formData, "projectId"), {
    name: str(formData, "name"),
    description: str(formData, "description"),
  });
  revalidatePath("/", "layout");
  redirect(studioPath(kind));
}

export async function deleteProject(formData: FormData): Promise<void> {
  const kind = kindOf(formData);
  const gallery = await getGallery();
  await gallery.deleteProject(str(formData, "projectId"));
  const remaining = await gallery.listProjects();
  await settingsStore.update({ currentProjectId: remaining[0]?.id ?? " " });
  revalidatePath("/", "layout");
  redirect(studioPath(kind));
}

// ---- generation -------------------------------------------------------------

export async function generate(formData: FormData): Promise<void> {
  const kind = kindOf(formData);
  const projectId = str(formData, "projectId");
  const slug = str(formData, "model");
  const fail: (message: string) => never = (message) =>
    redirect(studioPath(kind, { model: slug, error: message }));

  const model = await catalogStore.getModel(slug);
  if (!model) fail("Pick a model first.");
  const gallery = await getGallery();
  const project = await gallery.getProject(projectId);
  if (!project) fail("Pick or create a project first.");

  const inputs = coerceFormValues(model.inputSchema, formData);
  const problems = validateInputs(model.inputSchema, inputs);
  if (problems.length) fail(problems.join(". "));

  // Resolve asset ids referenced in media fields.
  const ids = new Set<string>();
  for (const field of assetFields(model.inputSchema)) {
    const v = inputs[field.name];
    if (Array.isArray(v)) v.forEach((x) => ids.add(String(x)));
    else if (typeof v === "string" && v) ids.add(v);
  }
  const assets: ReferenceInput[] = [];
  for (const id of ids) {
    const asset = await gallery.getAsset(projectId, id);
    const bytes = asset && (await gallery.readAssetFile(projectId, id));
    if (!asset || !bytes) fail(`Reference asset ${id} is missing.`);
    assets.push({ id: asset.id, type: asset.type, name: asset.name, mimeType: asset.mimeType, bytes, remoteUrl: asset.remoteUrl });
  }

  const settings = await settingsStore.get();
  const provider = createProvider(settings, model);
  let result;
  try {
    result = await provider.generate({ model, inputs, assets });
  } catch (err) {
    fail(err instanceof Error ? err.message : "Generation failed");
  }
  for (const [id, remoteUrl] of Object.entries(result.uploadedUrls ?? {})) {
    await gallery.updateAsset(projectId, id, { remoteUrl });
  }
  const promptLike = inputs.prompt ?? inputs.text;
  const prompt = typeof promptLike === "string" ? promptLike : "";
  await gallery.saveAsset({
    projectId,
    type: model.outputType,
    name: prompt.slice(0, 60) || `${model.title} ${model.variantTitle}`,
    prompt,
    provider: provider.id,
    mimeType: result.mimeType,
    ext: result.ext,
    bytes: result.bytes,
    model: model.slug,
    inputs,
    references: ids.size ? [...ids] : undefined,
  });
  revalidatePath("/", "layout");
  redirect(studioPath(kind, { model: slug }));
}

export async function deleteAsset(formData: FormData): Promise<void> {
  const gallery = await getGallery();
  await gallery.deleteAsset(str(formData, "projectId"), str(formData, "assetId"));
  revalidatePath("/", "layout");
}

export async function tagAsset(formData: FormData): Promise<void> {
  const tag = str(formData, "tag");
  const gallery = await getGallery();
  await gallery.updateAsset(str(formData, "projectId"), str(formData, "assetId"), {
    tag: ASSET_TAGS.includes(tag as AssetTag) ? (tag as AssetTag) : undefined,
  });
  revalidatePath("/", "layout");
}

// ---- settings & catalog -----------------------------------------------------

const FETCHERS = {
  higgsfield: (key: string) => fetchHiggsfieldCatalog(key),
  elevenlabs: (key: string) => fetchElevenLabsCatalog(key),
};

async function refreshAndSave(only?: ModelProvider[]) {
  const [settings, current] = await Promise.all([settingsStore.get(), catalogStore.get()]);
  const outcome = await runCatalogRefresh(settings, current, FETCHERS, only);
  if (outcome.refreshed.length) await catalogStore.save(outcome.catalog);
  return outcome;
}

export async function saveSettings(formData: FormData): Promise<void> {
  // A blank key field keeps the stored key so users need not re-enter it on every save.
  const higgsfieldKey = str(formData, "higgsfieldApiKey").trim();
  const elevenlabsKey = str(formData, "elevenlabsApiKey").trim();
  await settingsStore.update({
    galleryPath: str(formData, "galleryPath"),
    provider: str(formData, "provider"),
    higgsfieldApiKey: higgsfieldKey,
    elevenlabsApiKey: elevenlabsKey,
  });

  // A newly entered key should show its models right away, and a provider that
  // failed last time (e.g. key permissions) is retried on every save.
  const changed = providersToRefresh({ higgsfield: Boolean(higgsfieldKey), elevenlabs: Boolean(elevenlabsKey) }, await catalogStore.get());
  if (changed.length) {
    const outcome = await refreshAndSave(changed);
    revalidatePath("/", "layout");
    const errors = Object.values(outcome.errors);
    redirect(`/settings?refreshed=1${errors.length ? `&error=${encodeURIComponent(errors.join(" · "))}` : ""}`);
  }
  revalidatePath("/", "layout");
}

export async function refreshCatalog(formData?: FormData): Promise<void> {
  const only = formData ? str(formData, "provider") : "";
  const returnTo = formData ? str(formData, "returnTo") : "";
  const outcome = await refreshAndSave(only === "higgsfield" || only === "elevenlabs" ? [only] : undefined);
  revalidatePath("/", "layout");
  const errors = Object.values(outcome.errors);
  if (returnTo.startsWith("/")) {
    redirect(`${returnTo}${errors.length ? `?error=${encodeURIComponent(errors.join(" · "))}` : ""}`);
  }
  if (outcome.refreshed.length === 0) {
    redirect(`/settings?error=${encodeURIComponent(errors.join(" · ") || "Add a Higgsfield or ElevenLabs API key first.")}`);
  }
  redirect(`/settings?refreshed=1${errors.length ? `&error=${encodeURIComponent(errors.join(" · "))}` : ""}`);
}
