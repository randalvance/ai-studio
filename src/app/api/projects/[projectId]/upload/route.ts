import { revalidatePath } from "next/cache";
import { getGallery } from "@/lib/studio";
import { classifyUpload, type UploadKind } from "@/lib/uploads";
import { ASSET_TAGS, type AssetTag } from "@/lib/types";

/** Multipart upload of a media file into a project's gallery. Fields: file, kind?, tag? */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[projectId]/upload">) {
  const { projectId } = await ctx.params;
  const gallery = await getGallery();
  const project = await gallery.getProject(projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file provided" }, { status: 400 });
  const kindRaw = form.get("kind");
  const kind: UploadKind = kindRaw === "image" || kindRaw === "video" || kindRaw === "audio" ? kindRaw : "any";
  const tagRaw = form.get("tag");
  const tag = typeof tagRaw === "string" && ASSET_TAGS.includes(tagRaw as AssetTag) ? (tagRaw as AssetTag) : undefined;

  let info;
  try {
    info = classifyUpload({ name: file.name, type: file.type, size: file.size }, kind);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unsupported file" }, { status: 415 });
  }

  const asset = await gallery.saveAsset({
    projectId,
    type: info.type,
    name: file.name.replace(/\.[^.]+$/, "") || "Upload",
    prompt: "",
    provider: "upload",
    mimeType: info.mimeType,
    ext: info.ext,
    bytes: Buffer.from(await file.arrayBuffer()),
    tag,
  });
  revalidatePath("/", "layout");
  return Response.json({ asset, url: `/api/files/${asset.projectId}/${asset.fileName}` }, { status: 201 });
}
