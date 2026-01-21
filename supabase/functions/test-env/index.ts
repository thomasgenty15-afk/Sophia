import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Minimal health/env visibility endpoint for local debugging.
// Do NOT expose this in production without access controls.

serve((_req) => {
  const openaiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  const geminiKey = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  const openaiBaseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com").trim();

  return new Response(
    JSON.stringify(
      {
        ok: true,
        openai_key_loaded: Boolean(openaiKey),
        openai_key_prefix: openaiKey ? openaiKey.slice(0, 7) : null,
        openai_base_url: openaiBaseUrl,
        gemini_key_loaded: Boolean(geminiKey),
        gemini_key_prefix: geminiKey ? geminiKey.slice(0, 6) : null,
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
});


