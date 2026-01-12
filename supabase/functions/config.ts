// Deprecated: use env vars directly and `_shared/cors.ts` for CORS handling.
export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

export const corsHeaders = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
}
