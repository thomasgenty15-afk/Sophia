/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { readableErrorMessage } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { budgetDayRatesOf, budgetMarketFor } from "../_shared/keel/budget_floor.ts";
import {
  type BudgetRosterRow,
  loadBudgetMouthKcal,
} from "../_shared/keel/budget_mouth_kcal_io.ts";
import { localDateInZone } from "../_shared/keel/local_date.ts";

/**
 * `budget-rates-v1` — LE COÛT PAR JOUR DE CHAQUE BOUCHE DU FOYER. 2026-09-25.
 *
 * Le curseur de budget (`/app/plan` et l'entonnoir) a pour minimum le
 * plancher du budget. Ce plancher suit le besoin de chaque personne, et ce
 * besoin n'est calculé que côté serveur (`budget_mouth_kcal_io.ts`, le même
 * chargeur que la porte de `generate-household-meal-v1`). Cette fonction le
 * rend à l'écran converti en argent.
 *
 * ── ⛔ CE QU'ELLE NE REND JAMAIS ─────────────────────────────────────────
 * Aucun kcal, aucun facteur. Un coût par jour, dans la monnaie du marché:
 * l'écran le multiplie par les jours de présence, comme il le faisait avec
 * la table de prix.
 *
 * ── POURQUOI `service_role` ────────────────────────────────────────────────
 * `keel_household_bodies_for` n'est accordée qu'à lui (même raison que
 * `eating-structure-v1`): le corps d'une bouche mineure ou sans compte n'est
 * lisible que là.
 *
 * ── LE MAÎTRE SEUL ───────────────────────────────────────────────────────
 * C'est lui qui compose. Un autre membre reçoit une liste vide, pas une erreur.
 *
 * Aucun appel modèle, aucune écriture.
 */

const FN_NAME = "budget-rates-v1";

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

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    // --- identité: le JWT, jamais un user_id du client --------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const admin = adminClient();
    const empty = (market: string | null) =>
      jsonResponse(req, { market, members: [], request_id: requestId }, { status: 200 });

    // Le pays et le fuseau du COMPTE MAÎTRE: le même marché que le prompt, et
    // le même jour local que le générateur.
    const profileRes = await admin
      .from("profiles")
      .select("timezone, country")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const profile = (profileRes.data ?? {}) as Record<string, unknown>;
    const market = budgetMarketFor(String(profile.country ?? ""));
    // Hors de France et des États-Unis, pas de grille de prix: rien à rendre.
    if (market === null) return empty(null);
    const timezone = String(profile.timezone ?? "").trim();
    if (!timezone) return empty(market);

    const seatRes = await admin
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (seatRes.error) throw seatRes.error;
    const seat = seatRes.data as { household_id?: string; role?: string } | null;
    if (!seat?.household_id || seat.role !== "owner") return empty(market);

    const rosterRes = await admin.rpc("keel_household_roster_for", { p_user: user.id });
    if (rosterRes.error) throw rosterRes.error;
    const roster = (rosterRes.data ?? []) as Array<BudgetRosterRow & { diet?: unknown }>;

    const kcal = await loadBudgetMouthKcal(admin, {
      householdId: seat.household_id,
      roster,
      todayLocalDate: localDateInZone(timezone, new Date()),
    });

    // Seules les bouches dont le besoin est connu: une bouche absente de la
    // liste garde, sur l'écran, la journée de référence de son régime — la
    // même que la porte du moteur lui applique.
    const members = roster.flatMap((r) => {
      const dayKcal = kcal.get(r.member_id);
      if (dayKcal === undefined) return [];
      const rates = budgetDayRatesOf({
        market,
        diet: r.diet === null || r.diet === undefined ? null : String(r.diet),
        dayKcal,
      });
      return [{
        member_id: r.member_id,
        floor_per_day: rates.floor,
        plausible_per_day: rates.plausible,
      }];
    });

    return jsonResponse(req, { market, members, request_id: requestId }, { status: 200 });
  } catch (error) {
    console.error(JSON.stringify({
      tag: `${FN_NAME}.error`,
      request_id: requestId,
      // Une PostgrestError n'est pas une `Error`: le lecteur partagé la dit.
      error: readableErrorMessage(error),
    }));
    return jsonResponse(req, {
      error: "internal_error",
      request_id: requestId,
    }, { status: 500 });
  }
});
