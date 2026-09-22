import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SettingsStore } from "./settings";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "settings-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("SettingsStore", () => {
  it("returns defaults when no file exists", async () => {
    const s = new SettingsStore(path.join(dir, "settings.json"), {
      galleryPath: "/gallery",
      provider: "mock",
      higgsfieldApiKey: "",
      elevenlabsApiKey: "",
      currentProjectId: "",
    });
    expect(await s.get()).toEqual({ galleryPath: "/gallery", provider: "mock", higgsfieldApiKey: "", elevenlabsApiKey: "", currentProjectId: "" });
  });

  it("persists a partial update and merges with defaults", async () => {
    const file = path.join(dir, "nested", "settings.json");
    const s = new SettingsStore(file, { galleryPath: "/gallery", provider: "mock", higgsfieldApiKey: "", elevenlabsApiKey: "", currentProjectId: "" });
    await s.update({ galleryPath: "/elsewhere" });
    const again = new SettingsStore(file, { galleryPath: "/gallery", provider: "mock", higgsfieldApiKey: "", elevenlabsApiKey: "", currentProjectId: "" });
    expect(await again.get()).toEqual({ galleryPath: "/elsewhere", provider: "mock", higgsfieldApiKey: "", elevenlabsApiKey: "", currentProjectId: "" });
  });

  it("ignores unknown keys and blank values", async () => {
    const s = new SettingsStore(path.join(dir, "settings.json"), {
      galleryPath: "/gallery",
      provider: "mock",
      higgsfieldApiKey: "",
      elevenlabsApiKey: "",
      currentProjectId: "",
    });
    await s.update({ galleryPath: "  ", provider: "" } as never);
    expect(await s.get()).toEqual({ galleryPath: "/gallery", provider: "mock", higgsfieldApiKey: "", elevenlabsApiKey: "", currentProjectId: "" });
  });
});
