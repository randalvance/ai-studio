import { describe, it, expect } from "vitest";
import { classifyUpload, MAX_UPLOAD_BYTES, acceptFor } from "./uploads";

describe("classifyUpload", () => {
  it("maps supported mime types to asset type and extension", () => {
    expect(classifyUpload({ name: "a.jpg", type: "image/jpeg", size: 10 })).toEqual({ type: "image", mimeType: "image/jpeg", ext: "jpg" });
    expect(classifyUpload({ name: "a.PNG", type: "image/png", size: 10 })).toEqual({ type: "image", mimeType: "image/png", ext: "png" });
    expect(classifyUpload({ name: "vo.wav", type: "audio/wav", size: 10 })).toEqual({ type: "audio", mimeType: "audio/wav", ext: "wav" });
    expect(classifyUpload({ name: "vo.wav", type: "audio/x-wav", size: 10 })).toEqual({ type: "audio", mimeType: "audio/wav", ext: "wav" });
    expect(classifyUpload({ name: "song.mp3", type: "audio/mpeg", size: 10 })).toEqual({ type: "audio", mimeType: "audio/mpeg", ext: "mp3" });
    expect(classifyUpload({ name: "clip.mp4", type: "video/mp4", size: 10 })).toEqual({ type: "video", mimeType: "video/mp4", ext: "mp4" });
    expect(classifyUpload({ name: "clip.mov", type: "video/quicktime", size: 10 })).toEqual({ type: "video", mimeType: "video/quicktime", ext: "mov" });
  });

  it("falls back to the file extension when the browser sends no mime type", () => {
    expect(classifyUpload({ name: "photo.webp", type: "", size: 10 })).toEqual({ type: "image", mimeType: "image/webp", ext: "webp" });
    expect(classifyUpload({ name: "take1.WAV", type: "application/octet-stream", size: 10 })).toEqual({ type: "audio", mimeType: "audio/wav", ext: "wav" });
  });

  it("rejects unsupported types, empty files and oversized files", () => {
    expect(() => classifyUpload({ name: "x.svg", type: "image/svg+xml", size: 10 })).toThrow(/svg/i);
    expect(() => classifyUpload({ name: "x.txt", type: "text/plain", size: 10 })).toThrow(/not supported/i);
    expect(() => classifyUpload({ name: "x.png", type: "image/png", size: 0 })).toThrow(/empty/i);
    expect(() => classifyUpload({ name: "x.png", type: "image/png", size: MAX_UPLOAD_BYTES + 1 })).toThrow(/too large/i);
  });

  it("restricts uploads to the expected kind when one is required", () => {
    expect(() => classifyUpload({ name: "x.png", type: "image/png", size: 1 }, "audio")).toThrow(/audio/i);
    expect(classifyUpload({ name: "x.png", type: "image/png", size: 1 }, "image").type).toBe("image");
    expect(classifyUpload({ name: "x.png", type: "image/png", size: 1 }, "any").type).toBe("image");
  });

  it("exposes accept strings for file inputs", () => {
    expect(acceptFor("image")).toContain("image/png");
    expect(acceptFor("audio")).toContain("audio/wav");
    expect(acceptFor("video")).toContain("video/mp4");
    expect(acceptFor("any").split(",").length).toBeGreaterThan(5);
  });
});
