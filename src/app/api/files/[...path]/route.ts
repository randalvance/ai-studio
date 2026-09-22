import { readFile } from "node:fs/promises";
import { getGallery } from "@/lib/studio";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[...path]">,
) {
  const { path: segments } = await ctx.params;
  if (segments.length !== 2) return new Response("Not found", { status: 404 });
  const [projectId, fileName] = segments;

  const gallery = await getGallery();
  const file = gallery.resolveFile(projectId, fileName);
  if (!file) return new Response("Not found", { status: 404 });

  const assetId = fileName.replace(/\.[^.]+$/, "");
  const asset = await gallery.getAsset(projectId, assetId);
  if (!asset || asset.fileName !== fileName) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
