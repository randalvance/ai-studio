import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Asset, AssetTag, AssetType, Project } from "./types";

export interface SaveAssetInput {
  projectId: string;
  type: AssetType;
  name: string;
  prompt: string;
  provider: string;
  mimeType: string;
  ext: string;
  bytes: Buffer | Uint8Array;
  references?: string[];
  model?: string;
  inputs?: Record<string, unknown>;
  tag?: AssetTag;
}

/** Older gallery files used character/setting/voice as asset types. */
const LEGACY_TYPES: Record<string, { type: AssetType; tag: AssetTag }> = {
  character: { type: "image", tag: "character" },
  setting: { type: "image", tag: "setting" },
  voice: { type: "audio", tag: "voice" },
};

function normalizeAsset(raw: Asset): Asset {
  const legacy = LEGACY_TYPES[raw.type as string];
  return legacy ? { ...raw, type: legacy.type, tag: raw.tag ?? legacy.tag } : raw;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeSegment(s: string): boolean {
  return SAFE_SEGMENT.test(s) && s !== "." && s !== ".." && !s.includes("/");
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function byNewest<T extends { createdAt: string }>(a: T, b: T): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** Filesystem-backed store. The gallery folder is the source of truth. */
export class GalleryStore {
  constructor(readonly root: string) {}

  private projectsDir(): string {
    return path.join(this.root, "projects");
  }

  private projectDir(projectId: string): string {
    return path.join(this.projectsDir(), projectId);
  }

  private assetsDir(projectId: string): string {
    return path.join(this.projectDir(projectId), "assets");
  }

  // ---- projects ----------------------------------------------------------

  async createProject(input: {
    name: string;
    description: string;
  }): Promise<Project> {
    const name = input.name.trim();
    if (!name) throw new Error("Project name is required");
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name,
      description: input.description.trim(),
      createdAt: now,
      updatedAt: now,
    };
    await mkdir(this.assetsDir(project.id), { recursive: true });
    await writeFile(
      path.join(this.projectDir(project.id), "project.json"),
      JSON.stringify(project, null, 2),
    );
    return project;
  }

  async listProjects(): Promise<Project[]> {
    const ids = await listDir(this.projectsDir());
    const projects = await Promise.all(ids.map((id) => this.getProject(id)));
    return projects.filter((p): p is Project => p !== null).sort(byNewest);
  }

  async getProject(projectId: string): Promise<Project | null> {
    if (!isSafeSegment(projectId)) return null;
    return readJson<Project>(path.join(this.projectDir(projectId), "project.json"));
  }

  async updateProject(projectId: string, patch: { name?: string; description?: string }): Promise<Project | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;
    const name = patch.name?.trim();
    const next: Project = {
      ...project,
      name: name || project.name,
      description: patch.description !== undefined ? patch.description.trim() : project.description,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(path.join(this.projectDir(projectId), "project.json"), JSON.stringify(next, null, 2));
    return next;
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!isSafeSegment(projectId)) return;
    await rm(this.projectDir(projectId), { recursive: true, force: true });
  }

  // ---- assets ------------------------------------------------------------

  async saveAsset(input: SaveAssetInput): Promise<Asset> {
    const project = await this.getProject(input.projectId);
    if (!project) throw new Error("Project not found");
    if (!isSafeSegment(input.ext)) throw new Error("Invalid file extension");

    const id = randomUUID();
    const asset: Asset = {
      id,
      projectId: project.id,
      type: input.type,
      name: input.name.trim() || input.prompt.trim().slice(0, 60) || "Untitled",
      prompt: input.prompt.trim(),
      fileName: `${id}.${input.ext}`,
      mimeType: input.mimeType,
      provider: input.provider,
      createdAt: new Date().toISOString(),
      ...(input.references?.length ? { references: input.references } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.inputs ? { inputs: input.inputs } : {}),
      ...(input.tag ? { tag: input.tag } : {}),
    };
    const dir = this.assetsDir(project.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, asset.fileName), input.bytes);
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify(asset, null, 2));
    await this.touchProject(project);
    return asset;
  }

  async getAsset(projectId: string, assetId: string): Promise<Asset | null> {
    if (!isSafeSegment(projectId) || !isSafeSegment(assetId)) return null;
    const raw = await readJson<Asset>(path.join(this.assetsDir(projectId), `${assetId}.json`));
    return raw ? normalizeAsset(raw) : null;
  }

  async updateAsset(
    projectId: string,
    assetId: string,
    patch: Partial<Pick<Asset, "remoteUrl" | "name" | "tag">>,
  ): Promise<Asset | null> {
    const asset = await this.getAsset(projectId, assetId);
    if (!asset) return null;
    const next: Asset = { ...asset, ...patch };
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      if (patch[key] === undefined) delete next[key];
    }
    await writeFile(
      path.join(this.assetsDir(projectId), `${assetId}.json`),
      JSON.stringify(next, null, 2),
    );
    return next;
  }

  async readAssetFile(projectId: string, assetId: string): Promise<Buffer | null> {
    const asset = await this.getAsset(projectId, assetId);
    if (!asset) return null;
    const file = this.resolveFile(projectId, asset.fileName);
    if (!file) return null;
    try {
      return await readFile(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async listAssets(projectId?: string): Promise<Asset[]> {
    const ids = projectId
      ? isSafeSegment(projectId)
        ? [projectId]
        : []
      : await listDir(this.projectsDir());
    const perProject = await Promise.all(
      ids.map(async (pid) => {
        const files = await listDir(this.assetsDir(pid));
        const metas = await Promise.all(
          files
            .filter((f) => f.endsWith(".json"))
            .map((f) => readJson<Asset>(path.join(this.assetsDir(pid), f))),
        );
        return metas.filter((a): a is Asset => a !== null).map(normalizeAsset);
      }),
    );
    return perProject.flat().sort(byNewest);
  }

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    const asset = await this.getAsset(projectId, assetId);
    if (!asset) return;
    const dir = this.assetsDir(projectId);
    await rm(path.join(dir, asset.fileName), { force: true });
    await rm(path.join(dir, `${assetId}.json`), { force: true });
  }

  /** Absolute path for an asset file, or null if the segments are unsafe. */
  resolveFile(projectId: string, fileName: string): string | null {
    if (!isSafeSegment(projectId) || !isSafeSegment(fileName)) return null;
    if (fileName.endsWith(".json")) return null;
    const dir = this.assetsDir(projectId);
    const full = path.join(dir, fileName);
    return full.startsWith(dir + path.sep) ? full : null;
  }

  private async touchProject(project: Project): Promise<void> {
    const updated = { ...project, updatedAt: new Date().toISOString() };
    await writeFile(
      path.join(this.projectDir(project.id), "project.json"),
      JSON.stringify(updated, null, 2),
    );
  }
}
