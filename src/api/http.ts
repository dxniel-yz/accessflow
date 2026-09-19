import { WorkflowError } from "../services/workflow-error.ts";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({
      error: { code: error.code, message: error.message },
    }, { status: error.status });
  }
  if (error instanceof WorkflowError) {
    return Response.json({
      error: { code: "WORKFLOW_CONFLICT", message: error.message },
    }, { status: 409 });
  }
  return Response.json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  }, { status: 500 });
}

export function badRequest(message: string): never {
  throw new HttpError(400, "BAD_REQUEST", message);
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    badRequest("Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

export function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    badRequest(`${field} must be a nonblank string`);
  }
  return value;
}

export function optionalString(
  value: unknown,
  field: string,
): string | undefined {
  return value === undefined ? undefined : string(value, field);
}

export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  field: string,
): T {
  if (!choices.includes(value as T)) badRequest(`Invalid ${field}`);
  return value as T;
}

export function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) badRequest(`${field} must be an array`);
  return value;
}

export function strings(value: unknown, field: string): string[] {
  return array(value, field).map((entry) => string(entry, field));
}

export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    badRequest("Malformed JSON");
  }
  return object(value);
}
