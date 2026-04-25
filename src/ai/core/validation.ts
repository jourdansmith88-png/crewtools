import { AIValidationError } from "./errors.ts";
import type { AIValueSchema } from "./types.ts";

export function createSchema<T>(
  name: string,
  parse: (value: unknown) => T,
  jsonSchema?: Record<string, unknown>
): AIValueSchema<T> {
  return { name, parse, jsonSchema };
}

export function validateWithSchema<T>(
  schema: AIValueSchema<T>,
  value: unknown,
  subject = schema.name
): T {
  try {
    return schema.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown validation error";
    throw new AIValidationError(`Invalid ${subject}: ${message}`);
  }
}

export function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AIValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AIValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function expectStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new AIValidationError(`${label} must be an array`);
  }
  return value.map((item, index) => expectString(item, `${label}[${index}]`));
}

export function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const cleaned = value
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .map((item) => String(item).trim());
  return cleaned.length > 0 ? cleaned : undefined;
}
