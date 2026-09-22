import path from "node:path";
import { GalleryStore } from "./gallery";
import { SettingsStore } from "./settings";
import { CatalogStore } from "./catalog/store";

/** App-level singletons wired to the real config locations. */
export const settingsStore = new SettingsStore(
  path.resolve(process.cwd(), "data", "settings.json"),
  {
    galleryPath: process.env.GALLERY_PATH || path.resolve(process.cwd(), "gallery"),
    provider: "live",
    higgsfieldApiKey: process.env.HIGGSFIELD_API_KEY ?? "",
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
    currentProjectId: "",
  },
);

export const catalogStore = new CatalogStore(path.resolve(process.cwd(), "data", "catalog.json"));

export async function getGallery(): Promise<GalleryStore> {
  const { galleryPath } = await settingsStore.get();
  return new GalleryStore(path.resolve(galleryPath));
}
