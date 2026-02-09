import { z, type ZodError, type ZodSchema } from "npm:zod@3.22.4";
import { getCorsHeaders } from "./cors.ts";

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function jsonResponse(
  req: Request,
  body: unknown,
  opts?: { status?: number; includeCors?: boolean; headers?: Record<string, string> },
): Response {
  const status = opts?.status ?? 200;
  const includeCors = opts?.includeCors ?? true;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(includeCors ? getCorsHeaders(req) : {}),
    ...(opts?.headers ?? {}),
  };
  return new Response(JSON.stringify(body), { status, headers });
}

export function badRequest(
  req: Request,
  requestId: string,
  message: string,
  details?: unknown,
): Response {
  return jsonResponse(
    req,
    { error: message, request_id: requestId, ...(details ? { details } : {}) },
    { status: 400 },
  );
}

export function serverError(req: Request, requestId: string, message = "Internal Server Error"): Response {
  return jsonResponse(req, { error: message, request_id: requestId }, { status: 500 });
}

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodSchema<T>,
  requestId: string,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: badRequest(req, requestId, "Invalid JSON body") };
  }

  const res = schema.safeParse(raw);
  if (!res.success) {
    return { ok: false, response: badRequest(req, requestId, "Invalid request body", zodIssues(res.error)) };
  }
  return { ok: true, data: res.data };
}

function zodIssues(err: ZodError) {
  // Keep it safe: return only paths + messages (no user content).
  return err.issues.map((i) => ({ path: i.path, message: i.message }));
}

export { z };


