import { describe, it, expect, vi } from "vitest";
import { createHiggsfieldProvider, parseCredential } from "./higgsfield";
import { bundledCatalog } from "../catalog/store";
import type { ModelSpec } from "../catalog/types";

type Call = { url: string; init: RequestInit | undefined };
const model = (slug: string): ModelSpec => bundledCatalog.models.find((m) => m.slug === slug)!;
const SOUL = model("higgsfield-ai/soul/v2/standard");
const SEEDANCE_REF = model("bytedance/seedance-2.5/reference-to-video");
const opts = { pollIntervalMs: 0, maxPollMs: 5000 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(statuses: unknown[], output: { url: string; mime: string; bytes: number[] }) {
  const calls: Call[] = [];
  let uploads = 0;
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://api.higgsfield.ai/files/generate-upload-url") {
      uploads += 1;
      return jsonResponse({
        upload_url: `https://storage.example/put/${uploads}`,
        upload_headers: { "x-test": "1" },
        public_url: `https://cdn.example/public/${uploads}`,
      });
    }
    if (url.startsWith("https://storage.example/put/")) return new Response(null, { status: 200 });
    if (url.startsWith("https://api.higgsfield.ai/") && init?.method === "POST") {
      return jsonResponse({
        status: "queued",
        request_id: "req-1",
        status_url: "https://api.higgsfield.ai/requests/req-1/status",
      });
    }
    if (url.endsWith("/requests/req-1/status")) return jsonResponse(statuses.shift());
    if (url === output.url) {
      return new Response(new Uint8Array(output.bytes), { headers: { "Content-Type": output.mime } });
    }
    return new Response("not found", { status: 404 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const IMG = { url: "https://cdn.example/out.jpg", mime: "image/jpeg", bytes: [0xff, 0xd8] };
const VID = { url: "https://cdn.example/out.mp4", mime: "video/mp4", bytes: [9, 9] };

describe("parseCredential", () => {
  it("splits KEY_ID:KEY_SECRET", () => {
    expect(parseCredential("abc:def")).toEqual({ keyId: "abc", keySecret: "def" });
  });
  it("rejects malformed values", () => {
    expect(parseCredential("")).toBeNull();
    expect(parseCredential("nocolon")).toBeNull();
    expect(parseCredential(":secret")).toBeNull();
  });
});

describe("higgsfield provider", () => {
  it("posts inputs to the model slug, polls, and downloads the image", async () => {
    const { fetch, calls } = fakeFetch(
      [{ status: "queued" }, { status: "in_progress" }, { status: "completed", images: [{ url: IMG.url }] }],
      IMG,
    );
    const out = await createHiggsfieldProvider("id:secret", { ...opts, fetch }).generate({
      model: SOUL,
      inputs: { prompt: "a hero", aspect_ratio: "3:4", resolution: "1080p" },
      assets: [],
    });
    expect(out).toMatchObject({ mimeType: "image/jpeg", ext: "jpg", uploadedUrls: {} });
    expect([...out.bytes]).toEqual([0xff, 0xd8]);

    const submit = calls[0];
    expect(submit.url).toBe("https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard");
    expect(new Headers(submit.init?.headers).get("authorization")).toBe("Key id:secret");
    expect(JSON.parse(String(submit.init?.body))).toEqual({ prompt: "a hero", aspect_ratio: "3:4", resolution: "1080p" });
    const polls = calls.filter((c) => c.url.endsWith("/status"));
    expect(polls).toHaveLength(3);
    expect(new Headers(polls[0].init?.headers).get("authorization")).toBe("Key id:secret");
  });

  it("uploads referenced assets for uri fields and sends their public URLs", async () => {
    const { fetch, calls } = fakeFetch([{ status: "completed", video: { url: VID.url } }], VID);
    const out = await createHiggsfieldProvider("id:secret", { ...opts, fetch }).generate({
      model: SEEDANCE_REF,
      inputs: { prompt: "run", duration: 8, image_urls: ["img-1"], audio_urls: ["aud-1"] },
      assets: [
        { id: "img-1", type: "image", name: "Kai", mimeType: "image/jpeg", bytes: Buffer.from([1]) },
        { id: "aud-1", type: "audio", name: "VO", mimeType: "audio/wav", bytes: Buffer.from([2]) },
      ],
    });
    expect(out.mimeType).toBe("video/mp4");
    const urls = out.uploadedUrls!;
    expect(Object.keys(urls).sort()).toEqual(["aud-1", "img-1"]);
    expect(new Set(Object.values(urls))).toEqual(new Set(["https://cdn.example/public/1", "https://cdn.example/public/2"]));

    const gen = calls.filter((c) => c.url.endsWith("/files/generate-upload-url"));
    expect(gen).toHaveLength(2);
    expect(new Set(gen.map((c) => JSON.parse(String(c.init?.body)).content_type))).toEqual(new Set(["image/jpeg", "audio/wav"]));
    const put = calls.find((c) => c.url === "https://storage.example/put/1")!;
    expect(put.init?.method).toBe("PUT");
    expect(new Headers(put.init?.headers).get("authorization")).toBeNull();

    const submit = calls.find((c) => c.url.endsWith("/reference-to-video"))!;
    expect(JSON.parse(String(submit.init?.body))).toEqual({
      prompt: "run",
      duration: 8,
      image_urls: [urls["img-1"]],
      audio_urls: [urls["aud-1"]],
    });
  });

  it("reuses cached public URLs instead of re-uploading", async () => {
    const { fetch, calls } = fakeFetch([{ status: "completed", video: { url: VID.url } }], VID);
    await createHiggsfieldProvider("id:secret", { ...opts, fetch }).generate({
      model: SEEDANCE_REF,
      inputs: { prompt: "x", image_urls: ["img-1"] },
      assets: [{ id: "img-1", type: "image", name: "Kai", mimeType: "image/jpeg", bytes: Buffer.from([1]), remoteUrl: "https://cdn.example/cached.jpg" }],
    });
    expect(calls.some((c) => c.url.endsWith("/files/generate-upload-url"))).toBe(false);
    const submit = calls.find((c) => c.url.endsWith("/reference-to-video"))!;
    expect(JSON.parse(String(submit.init?.body)).image_urls).toEqual(["https://cdn.example/cached.jpg"]);
  });

  it("rejects reference formats the upload API does not accept", async () => {
    const { fetch } = fakeFetch([], VID);
    await expect(
      createHiggsfieldProvider("id:secret", { ...opts, fetch }).generate({
        model: SEEDANCE_REF,
        inputs: { prompt: "x", image_urls: ["img-1"] },
        assets: [{ id: "img-1", type: "image", name: "Kai", mimeType: "image/svg+xml", bytes: Buffer.from([1]) }],
      }),
    ).rejects.toThrow(/svg/i);
  });

  it("throws a readable error on failed / nsfw statuses", async () => {
    const failed = fakeFetch([{ status: "failed", error: "boom" }], IMG);
    await expect(
      createHiggsfieldProvider("id:secret", { ...opts, fetch: failed.fetch }).generate({ model: SOUL, inputs: { prompt: "x" }, assets: [] }),
    ).rejects.toThrow(/failed.*boom/i);
    const nsfw = fakeFetch([{ status: "nsfw" }], IMG);
    await expect(
      createHiggsfieldProvider("id:secret", { ...opts, fetch: nsfw.fetch }).generate({ model: SOUL, inputs: { prompt: "x" }, assets: [] }),
    ).rejects.toThrow(/nsfw/i);
  });

  it("surfaces HTTP errors from submit with the status code and detail", async () => {
    const fetch = vi.fn(async () => jsonResponse({ detail: "Invalid credentials" }, 401));
    await expect(
      createHiggsfieldProvider("id:secret", { ...opts, fetch: fetch as unknown as typeof globalThis.fetch }).generate({ model: SOUL, inputs: { prompt: "x" }, assets: [] }),
    ).rejects.toThrow(/401.*Invalid credentials/);
  });

  it("gives up after maxPollMs", async () => {
    const { fetch } = fakeFetch(Array.from({ length: 50 }, () => ({ status: "queued" })), IMG);
    await expect(
      createHiggsfieldProvider("id:secret", { pollIntervalMs: 1, maxPollMs: 5, fetch }).generate({ model: SOUL, inputs: { prompt: "x" }, assets: [] }),
    ).rejects.toThrow(/timed out/i);
  });

  it("fails fast without a credential", async () => {
    const { fetch } = fakeFetch([], IMG);
    await expect(
      createHiggsfieldProvider("", { ...opts, fetch }).generate({ model: SOUL, inputs: { prompt: "x" }, assets: [] }),
    ).rejects.toThrow(/api key/i);
  });
});
