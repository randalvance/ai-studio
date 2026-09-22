/** The JSON Schema subset Higgsfield model inputs use. */
export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: (string | number)[];
  /** Display names for enum values (our extension, e.g. voice names). */
  enumLabels?: Record<string, string>;
  /** Preview media URLs per enum value (our extension, e.g. voice samples). */
  enumPreviews?: Record<string, string>;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean;
}

export type Inputs = Record<string, unknown>;

export const FORM_PREFIX = "f.";

export function defaultValues(schema: JsonSchema): Inputs {
  const out: Inputs = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.default !== undefined && prop.default !== null) out[key] = prop.default;
  }
  return out;
}

export interface AssetField {
  name: string;
  multiple: boolean;
  /** Media kind inferred from the field name; "any" when unclear. */
  accepts: "image" | "video" | "audio" | "any";
  maxItems: number | undefined;
}

function isUri(prop: JsonSchema): boolean {
  return prop.type === "string" && prop.format === "uri";
}

function acceptsFor(name: string): AssetField["accepts"] {
  if (/image|img|frame|photo/.test(name)) return "image";
  if (/audio|voice|speech|sound/.test(name)) return "audio";
  if (/video|clip/.test(name)) return "video";
  return "any";
}

/** Fields whose values are media URLs; the UI fills them with gallery assets. */
export function assetFields(schema: JsonSchema): AssetField[] {
  const out: AssetField[] = [];
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (isUri(prop)) out.push({ name, multiple: false, accepts: acceptsFor(name), maxItems: undefined });
    else if (prop.type === "array" && prop.items && isUri(prop.items)) {
      out.push({ name, multiple: true, accepts: acceptsFor(name), maxItems: prop.maxItems });
    }
  }
  return out;
}

function coerceScalar(prop: JsonSchema, raw: string): unknown {
  switch (prop.type) {
    case "integer": {
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) ? n : undefined;
    }
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      return raw === "on" || raw === "true" || raw === "1";
    default:
      return raw;
  }
}

/** Read `f.<key>` form fields into typed inputs according to the schema. */
export function coerceFormValues(schema: JsonSchema, formData: FormData): Inputs {
  const out: Inputs = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const formKey = FORM_PREFIX + key;
    if (prop.type === "array") {
      const values = formData.getAll(formKey).filter((v): v is string => typeof v === "string" && v !== "");
      if (values.length) out[key] = prop.items ? values.map((v) => coerceScalar(prop.items!, v)) : values;
      continue;
    }
    const raw = formData.get(formKey);
    if (prop.type === "boolean") {
      out[key] = typeof raw === "string" ? coerceScalar(prop, raw) : false;
      continue;
    }
    if (typeof raw !== "string" || raw === "") continue;
    const value = coerceScalar(prop, raw);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Minimal validation: required, enum, numeric range, string length, array length. */
export function validateInputs(schema: JsonSchema, inputs: Inputs): string[] {
  const errors: string[] = [];
  for (const key of schema.required ?? []) {
    const v = inputs[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      errors.push(`${key} is required`);
    }
  }
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const v = inputs[key];
    if (v === undefined || v === null) continue;
    if (prop.enum && !prop.enum.includes(v as string | number)) {
      errors.push(`${key} must be one of ${prop.enum.join(", ")}`);
    }
    if (typeof v === "number") {
      if (prop.minimum !== undefined && v < prop.minimum) errors.push(`${key} must be at least ${prop.minimum}`);
      if (prop.maximum !== undefined && v > prop.maximum) errors.push(`${key} must be at most ${prop.maximum}`);
    }
    if (typeof v === "string") {
      if (prop.minLength !== undefined && v.length < prop.minLength) errors.push(`${key} is too short`);
      if (prop.maxLength !== undefined && v.length > prop.maxLength) errors.push(`${key} is too long`);
    }
    if (Array.isArray(v)) {
      if (prop.minItems !== undefined && v.length < prop.minItems) errors.push(`${key} needs at least ${prop.minItems} item(s)`);
      if (prop.maxItems !== undefined && v.length > prop.maxItems) errors.push(`${key} allows at most ${prop.maxItems} item(s)`);
    }
  }
  return errors;
}
