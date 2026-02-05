/**
 * Edge function caller for break-down-action.
 * This utility calls the break-down-action edge function to generate micro-steps.
 */

import { functionsBaseUrl } from "./utils.ts"

export async function callBreakDownActionEdge(payload: unknown): Promise<any> {
  const url = `${functionsBaseUrl()}/functions/v1/break-down-action`
  const internalSecret =
    (globalThis as any)?.Deno?.env?.get?.("INTERNAL_FUNCTION_SECRET")?.trim() ||
    (globalThis as any)?.Deno?.env?.get?.("SECRET_KEY")?.trim() ||
    ""
  const serviceRoleKey =
    (globalThis as any)?.Deno?.env?.get?.("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    (globalThis as any)?.Deno?.env?.get?.("SERVICE_ROLE_KEY")?.trim() ||
    ""
  const anonKey =
    (globalThis as any)?.Deno?.env?.get?.("SUPABASE_ANON_KEY")?.trim() ||
    (globalThis as any)?.Deno?.env?.get?.("ANON_KEY")?.trim() ||
    ""
  if (!internalSecret) {
    throw new Error("Missing INTERNAL_FUNCTION_SECRET")
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
      // Supabase edge-runtime requires an auth header even for internal calls in local/dev.
      ...(serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`break-down-action failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}
