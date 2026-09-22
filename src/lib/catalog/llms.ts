import type { JsonSchema } from "./schema";

export interface ParsedLlms {
  title: string;
  description: string;
  category: string;
  inputSchema: JsonSchema;
}

/** Parse a public per-model document from https://dash.higgsfield.ai/models/<slug>/llms.txt */
export function parseLlmsTxt(text: string): ParsedLlms {
  const title = /^# (.+)$/m.exec(text)?.[1].trim() ?? "";
  const description = /^> (.+)$/m.exec(text)?.[1].trim() ?? "";
  const category = /\*\*Category\*\*:\s*([^\n]+)/.exec(text)?.[1].trim() ?? "";
  const block = /### Input JSON Schema\s*```json\s*([\s\S]*?)\s*```/.exec(text);
  if (!block) throw new Error("No input JSON schema block found");
  return { title, description, category, inputSchema: JSON.parse(block[1]) as JsonSchema };
}

export function llmsUrl(slug: string): string {
  return `https://dash.higgsfield.ai/models/${slug}/llms.txt`;
}
