import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

let _admin: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (_admin) return _admin;
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for prompt overrides");
  }
  _admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export async function fetchPromptOverride(promptKey: string): Promise<string> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("prompt_overrides")
      .select("enabled,addendum")
      .eq("prompt_key", promptKey)
      .maybeSingle();

    if (error) {
      console.warn(`[prompt_overrides] fetch failed for ${promptKey}`, error);
      return "";
    }
    if (!data || !data.enabled) return "";
    const add = (data.addendum ?? "").toString().trim();
    return add.length > 0 ? add : "";
  } catch (e) {
    console.warn(`[prompt_overrides] fetch exception for ${promptKey}`, e);
    return "";
  }
}

export function appendPromptOverride(basePrompt: string, override: string): string {
  const add = (override ?? "").toString().trim();
  if (!add) return basePrompt;
  return `${basePrompt}\n\n=== PROMPT OVERRIDE (ADMIN, APPENDED) ===\n${add}\n`;
}


