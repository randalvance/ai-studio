import type { OutputType } from "../catalog/types";
import type { GenerateRequest, GenerateResult, Provider } from "./types";

const PALETTE: Record<OutputType, [string, string]> = {
  image: ["#1e3a8a", "#60a5fa"],
  video: ["#0f172a", "#38bdf8"],
  audio: ["#3b0764", "#c084fc"],
};

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function promptOf(req: GenerateRequest): string {
  const p = req.inputs.prompt ?? req.inputs.text;
  return typeof p === "string" ? p : "";
}

function svgPlaceholder(req: GenerateRequest, animated: boolean): Buffer {
  const [from, to] = PALETTE[req.model.outputType];
  const text = escapeXml(promptOf(req).slice(0, 80) || req.model.title);
  const refs = req.assets.map((a) => escapeXml(a.name)).join(", ");
  const seconds = typeof req.inputs.duration === "number" ? req.inputs.duration : 5;
  const w = animated ? 1280 : 768;
  const h = animated ? 720 : 768;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${animated ? `<circle cx="0" cy="${h / 2}" r="60" fill="white" opacity="0.6"><animate attributeName="cx" from="-60" to="${w + 60}" dur="${seconds}s" repeatCount="indefinite"/></circle>` : ""}
  <text x="32" y="70" font-family="sans-serif" font-size="26" fill="white" opacity="0.8">${escapeXml(req.model.title)} · ${escapeXml(req.model.variantTitle)} · mock${animated ? ` · ${seconds}s` : ""}</text>
  <foreignObject x="32" y="110" width="${w - 64}" height="${h - 200}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font-family:sans-serif;font-size:38px;line-height:1.3;word-wrap:break-word">${text}</div>
  </foreignObject>
  ${refs ? `<text x="32" y="${h - 40}" font-family="sans-serif" font-size="22" fill="white" opacity="0.8">references: ${refs}</text>` : ""}
</svg>`;
  return Buffer.from(svg, "utf8");
}

/** One second of a sine tone whose pitch is derived from the prompt. */
function wavPlaceholder(req: GenerateRequest): Buffer {
  const sampleRate = 16000;
  const samples = sampleRate;
  let hash = 0;
  for (const ch of promptOf(req)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const freq = 220 + (hash % 440);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 800, (samples - i) / 800);
    const v = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.4 * fade;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export const mockProvider: Provider = {
  id: "mock",
  label: "Mock (offline placeholders)",
  async generate(req): Promise<GenerateResult> {
    switch (req.model.outputType) {
      case "audio":
        return { bytes: wavPlaceholder(req), mimeType: "audio/wav", ext: "wav" };
      case "video":
        return { bytes: svgPlaceholder(req, true), mimeType: "image/svg+xml", ext: "svg" };
      default:
        return { bytes: svgPlaceholder(req, false), mimeType: "image/svg+xml", ext: "svg" };
    }
  },
};
