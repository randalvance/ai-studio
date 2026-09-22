import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Settings } from "./types";

const KEYS: (keyof Settings)[] = ["galleryPath", "provider", "higgsfieldApiKey", "elevenlabsApiKey", "currentProjectId"];

export class SettingsStore {
  constructor(
    readonly file: string,
    readonly defaults: Settings,
  ) {}

  async get(): Promise<Settings> {
    let stored: Partial<Settings> = {};
    try {
      stored = JSON.parse(await readFile(this.file, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return { ...this.defaults, ...this.sanitize(stored) };
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const current = await this.get();
    const next = { ...current, ...this.sanitize(patch) };
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(next, null, 2));
    return next;
  }

  private sanitize(input: Partial<Settings>): Partial<Settings> {
    const out: Partial<Settings> = {};
    for (const key of KEYS) {
      const value = input[key];
      if (typeof value === "string" && value.trim()) {
        (out as Record<string, string>)[key] = value.trim();
      }
    }
    return out;
  }
}
