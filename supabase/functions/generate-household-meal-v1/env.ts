// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — LA LECTURE DE L'ENVIRONNEMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `index.ts` (découpage des gros fichiers,
// lot 3a). Aucune logique changée. Seul `index.ts` l'importe; ce module
// n'importe jamais `index.ts`, et il n'a aucun effet au chargement.
//
// Ce qui est ici : `requireEnv` et `adminClient` (le client service_role).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { FN_NAME } from "./constants.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { adminClient, requireEnv };
