import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GalleryStore } from "./gallery";

let root: string;
let store: GalleryStore;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "gallery-"));
  store = new GalleryStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("projects", () => {
  it("creates and lists projects, newest first", async () => {
    const a = await store.createProject({ name: "Alpha", description: "first" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.createProject({ name: "Beta", description: "" });

    const list = await store.listProjects();
    expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(a.name).toBe("Alpha");
    expect(a.description).toBe("first");
    const raw = JSON.parse(
      await readFile(path.join(root, "projects", a.id, "project.json"), "utf8"),
    );
    expect(raw.id).toBe(a.id);
  });

  it("rejects a blank name", async () => {
    await expect(
      store.createProject({ name: "   ", description: "" }),
    ).rejects.toThrow(/name/i);
  });

  it("updates name and description", async () => {
    const p = await store.createProject({ name: "Old", description: "" });
    const next = await store.updateProject(p.id, { name: "  ", description: "new desc" });
    expect(next).toMatchObject({ name: "Old", description: "new desc" });
    expect((await store.getProject(p.id))?.description).toBe("new desc");
    expect(await store.updateProject("nope", { name: "x" })).toBeNull();
  });

  it("returns null for a missing project", async () => {
    expect(await store.getProject("nope")).toBeNull();
  });

  it("deletes a project and its assets", async () => {
    const p = await store.createProject({ name: "Gone", description: "" });
    await store.saveAsset({
      projectId: p.id,
      type: "image",
      name: "pic",
      prompt: "a cat",
      provider: "mock",
      mimeType: "image/svg+xml",
      ext: "svg",
      bytes: Buffer.from("<svg/>"),
    });
    await store.deleteProject(p.id);
    expect(await store.getProject(p.id)).toBeNull();
    await expect(stat(path.join(root, "projects", p.id))).rejects.toThrow();
  });

  it("returns an empty list when the gallery folder does not exist yet", async () => {
    const fresh = new GalleryStore(path.join(root, "missing"));
    expect(await fresh.listProjects()).toEqual([]);
    expect(await fresh.listAssets()).toEqual([]);
  });
});

describe("assets", () => {
  it("saves bytes and metadata, then lists them", async () => {
    const p = await store.createProject({ name: "P", description: "" });
    const asset = await store.saveAsset({
      projectId: p.id,
      type: "audio",
      name: "hello",
      prompt: "say hi",
      provider: "mock",
      mimeType: "audio/wav",
      ext: "wav",
      bytes: Buffer.from([1, 2, 3]),
    });

    expect(asset.fileName).toBe(`${asset.id}.wav`);
    const file = await readFile(
      path.join(root, "projects", p.id, "assets", asset.fileName),
    );
    expect([...file]).toEqual([1, 2, 3]);

    const all = await store.listAssets();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: asset.id, type: "audio", name: "hello" });

    const byProject = await store.listAssets(p.id);
    expect(byProject).toHaveLength(1);
    expect(await store.listAssets("other")).toEqual([]);
  });

  it("refuses to save into a missing project", async () => {
    await expect(
      store.saveAsset({
        projectId: "missing",
        type: "image",
        name: "x",
        prompt: "",
        provider: "mock",
        mimeType: "image/svg+xml",
        ext: "svg",
        bytes: Buffer.from(""),
      }),
    ).rejects.toThrow(/project/i);
  });

  it("deletes an asset and its file", async () => {
    const p = await store.createProject({ name: "P", description: "" });
    const asset = await store.saveAsset({
      projectId: p.id,
      type: "image",
      name: "hero",
      prompt: "",
      provider: "mock",
      mimeType: "image/svg+xml",
      ext: "svg",
      bytes: Buffer.from("<svg/>"),
    });
    await store.deleteAsset(p.id, asset.id);
    expect(await store.getAsset(p.id, asset.id)).toBeNull();
    expect(await store.listAssets(p.id)).toEqual([]);
  });

  it("resolves a safe absolute path for an asset file and rejects traversal", async () => {
    const p = await store.createProject({ name: "P", description: "" });
    const asset = await store.saveAsset({
      projectId: p.id,
      type: "image",
      name: "x",
      prompt: "",
      provider: "mock",
      mimeType: "image/svg+xml",
      ext: "svg",
      bytes: Buffer.from("<svg/>"),
    });
    const ok = store.resolveFile(p.id, asset.fileName);
    expect(ok).toBe(path.join(root, "projects", p.id, "assets", asset.fileName));
    expect(store.resolveFile("..", "etc/passwd")).toBeNull();
    expect(store.resolveFile(p.id, "../project.json")).toBeNull();
  });
});

describe("asset extras", () => {
  it("stores references and updates remoteUrl", async () => {
    const p = await store.createProject({ name: "P", description: "" });
    const ref = await store.saveAsset({
      projectId: p.id,
      type: "image",
      name: "ref",
      prompt: "",
      provider: "mock",
      mimeType: "image/svg+xml",
      ext: "svg",
      bytes: Buffer.from("<svg/>"),
    });
    const vid = await store.saveAsset({
      projectId: p.id,
      type: "video",
      name: "clip",
      prompt: "",
      provider: "mock",
      mimeType: "video/mp4",
      ext: "mp4",
      bytes: Buffer.from([1]),
      references: [ref.id],
    });
    expect(vid.references).toEqual([ref.id]);

    const updated = await store.updateAsset(p.id, ref.id, { remoteUrl: "https://cdn/x.jpg" });
    expect(updated?.remoteUrl).toBe("https://cdn/x.jpg");
    expect((await store.getAsset(p.id, ref.id))?.remoteUrl).toBe("https://cdn/x.jpg");
    expect(await store.updateAsset(p.id, "missing", { remoteUrl: "x" })).toBeNull();
  });

  it("reads an asset's bytes", async () => {
    const p = await store.createProject({ name: "P", description: "" });
    const a = await store.saveAsset({
      projectId: p.id,
      type: "audio",
      name: "a",
      prompt: "",
      provider: "mock",
      mimeType: "audio/wav",
      ext: "wav",
      bytes: Buffer.from([7, 8]),
    });
    expect([...(await store.readAssetFile(p.id, a.id))!]).toEqual([7, 8]);
    expect(await store.readAssetFile(p.id, "missing")).toBeNull();
  });
});

describe("legacy assets", () => {
  it("maps old character/setting/voice types to image/audio with a tag", async () => {
    const p = await store.createProject({ name: "P", description: "" });
    const dir = path.join(root, "projects", p.id, "assets");
    const legacy = (id: string, type: string) => ({
      id, projectId: p.id, type, name: id, prompt: "", fileName: `${id}.svg`, mimeType: "image/svg+xml",
      provider: "mock", createdAt: "2026-01-01T00:00:00.000Z",
    });
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(path.join(dir, "c.json"), JSON.stringify(legacy("c", "character")));
    await wf(path.join(dir, "s.json"), JSON.stringify(legacy("s", "setting")));
    await wf(path.join(dir, "v.json"), JSON.stringify({ ...legacy("v", "voice"), mimeType: "audio/wav" }));
    const all = await store.listAssets(p.id);
    const byId = Object.fromEntries(all.map((a) => [a.id, a]));
    expect(byId.c).toMatchObject({ type: "image", tag: "character" });
    expect(byId.s).toMatchObject({ type: "image", tag: "setting" });
    expect(byId.v).toMatchObject({ type: "audio", tag: "voice" });
  });

  it("stores model, inputs and tag on save and update", async () => {
    const p = await store.createProject({ name: "P", description: "" });
    const a = await store.saveAsset({
      projectId: p.id, type: "image", name: "x", prompt: "p", provider: "mock", mimeType: "image/svg+xml", ext: "svg",
      bytes: Buffer.from(""), model: "higgsfield-ai/soul/v2/standard", inputs: { prompt: "p", seed: 3 },
    });
    expect(a.model).toBe("higgsfield-ai/soul/v2/standard");
    expect(a.inputs).toEqual({ prompt: "p", seed: 3 });
    const t = await store.updateAsset(p.id, a.id, { tag: "character" });
    expect(t?.tag).toBe("character");
    const cleared = await store.updateAsset(p.id, a.id, { tag: undefined });
    expect(cleared?.tag).toBeUndefined();
  });
});
