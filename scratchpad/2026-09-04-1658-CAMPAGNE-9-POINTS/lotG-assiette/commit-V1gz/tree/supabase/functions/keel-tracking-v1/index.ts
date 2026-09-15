/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  loadTrackingReport,
  TrackingRefusalError,
} from "../_shared/keel/tracking_window_io.ts";
import { describeMissedSlot } from "../_shared/keel/tracking_describe_io.ts";

// ══════════════════════════════════════════════════════════════════════════
// `keel-tracking-v1` — LE SUIVI D'UNE PERSONNE, EN UNE PASSE
// ══════════════════════════════════════════════════════════════════════════
//
// A7 (2026-09-03, D7.9). Cette fonction existe pour UNE raison qu'aucun écran
// ne peut couvrir: **les cinq portes de l'énergie ne sont pas lisibles depuis
// un navigateur**. Elles demandent la doctrine publiée du coach et
// `evaluateRestrictionForStudent`, donc le `service_role`.
//
// La page `/app/progress` lisait à la place `weekly_reviews.risk_band`, une
// colonne SANS ÉCRIVAIN depuis le 2026-08-08: une ceinture armée sur un coffre
// vide, qui ne s'est jamais levée pour personne et qui ressemblait à une garde
// qui marche. Elle est partie avec ce lot, et son remplacement est ici — en
// PREMIÈRE instruction de l'assemblage, jamais en filtre après coup
// (`CALORIE_REVERSAL.md` §0).
//
// ⚠️ DEUX ACTIONS, UNE FONCTION. La lecture (par défaut) et « décrire un repas
// loupé » (`action: "describe"`). Elles partagent la porte, l'identité et le
// fuseau; les séparer en deux fonctions aurait fait deux endroits où la porte
// peut être oubliée.
//
// ⚠️ `verify_jwt` RESTE À `true` (aucune section dans `supabase/config.toml`),
// comme `meal-energy-v1`. La gateway vérifie le jeton, et la fonction en relit
// l'identité: rien n'est affaibli, et cette fonction n'a aucune raison d'être
// atteignable sans jeton. `keel-auth-in-function` est pour celles qui doivent
// être atteintes SANS — un webhook, un cron à secret interne.

const FN_NAME = "keel-tracking-v1";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return value;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // ── L'IDENTITÉ VIENT DU JWT, JAMAIS DU CORPS ────────────────────────
    // Un `user_id` passé par le client est une invitation à demander celui d'un
    // autre. Même forme que `meal-energy-v1`.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, {
        error: "Unauthorized",
        request_id: requestId,
      }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // ══ ② « DÉCRIRE » UN CRÉNEAU LOUPÉ ════════════════════════════════════
    if (String(body.action ?? "") === "describe") {
      const result = await describeMissedSlot(admin, {
        userId,
        localDate: String(body.local_date ?? ""),
        slot: String(body.slot ?? ""),
        text: String(body.text ?? ""),
      });
      // ⚠️ UN REFUS NOMMÉ SORT EN 200. C'est la convention du dépôt
      // (`planFeedback.ts`): un refus métier n'est pas une panne de la
      // bibliothèque, et le rendre en 4xx le ferait arriver au client comme
      // « Edge Function returned a non-2xx status code », c'est-à-dire sans son
      // motif.
      return jsonResponse(req, { ...result, request_id: requestId });
    }

    // ══ ① LA LECTURE ══════════════════════════════════════════════════════
    const report = await loadTrackingReport(admin, {
      userId,
      from: String(body.from ?? ""),
      to: String(body.to ?? ""),
    });
    return jsonResponse(req, { ...report, request_id: requestId });
  } catch (error) {
    // Un refus NOMMÉ de la fenêtre sort en 200, comme les refus de `describe`.
    if (error instanceof TrackingRefusalError) {
      return jsonResponse(req, {
        ok: false,
        reason: error.token,
        request_id: requestId,
      });
    }
    // ⛔ ET TOUT LE RESTE EST UNE PANNE, PAS UNE PAGE VIDE. La porte illisible
    // passe par ici (`loadEnergyGate` jette): rendre un rapport « fermé » à la
    // place laisserait l'écran croire qu'il a demandé et reçu une réponse.
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "tracking" },
    });
    return jsonResponse(req, {
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, skipErrorLog: true });
  }
});
