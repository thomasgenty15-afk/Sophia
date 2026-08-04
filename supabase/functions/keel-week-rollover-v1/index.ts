/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { activateDueWeekItemsForUser } from "../_shared/v2-week-activation.ts";

/**
 * Rollover hebdomadaire des items de plan (KEEL W2.B).
 *
 * Avant KEEL, `activateDueWeekItemsForUser` n'avait qu'UN seul appelant:
 * `weekly_planning_lifecycle.ts::autoApplyWeeklyPlanning`, exécuté au moment
 * de l'auto-validation du planning hebdo (07:00 locale). La machine de
 * validation hebdo est supprimée — sans ce cron, plus rien ne ferait passer
 * les items `pending` de la semaine N+1 en `active`, et le déblocage des
 * semaines casserait EN SILENCE (aucune erreur, juste des items qui ne
 * s'activent jamais).
 *
 * Le job tourne le lundi 00:10 UTC. C'est volontairement un balayage FLEET,
 * pas un passage par fuseau: `activateDueWeekItems` est idempotent (update
 * gardé par `.eq("status", "pending")`) et son critère est la semaine
 * calendaire locale de l'ancre du plan, donc un utilisateur dont la semaine
 * n'a pas encore basculé est simplement ignoré et rattrapé au tick suivant.
 * `activateDueWeekItems` sert d'ailleurs aussi de filet de rattrapage pour les
 * items restés verrouillés sur des semaines passées.
 *
 * Idempotence / re-jeu: rejouer le job le même jour ne réactive rien (les
 * items déjà `active` ne sont plus `pending`).
 */

// Pagination keyset sur user_plans_v2 pour ne jamais charger la flotte entière
// en mémoire. Chaque page est traitée puis oubliée.
const PLAN_PAGE_SIZE = 500;
// Budget mural: une invocation edge est bornée. On s'arrête proprement et on
// rend le curseur pour que l'appelant puisse relancer (`after_user_id`).
const DEFAULT_BUDGET_MS = 50_000;

type ActivePlanRow = { user_id: string };

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Une page d'utilisateurs distincts ayant au moins un plan actif, triée par
 * user_id pour que le curseur soit stable.
 */
async function loadNextUserIds(args: {
  admin: SupabaseClient;
  afterUserId: string;
}): Promise<string[]> {
  let query = args.admin
    .from("user_plans_v2")
    .select("user_id")
    .eq("status", "active")
    .order("user_id", { ascending: true })
    .limit(PLAN_PAGE_SIZE);
  if (args.afterUserId) query = query.gt("user_id", args.afterUserId);

  const { data, error } = await query;
  if (error) throw error;

  const seen = new Set<string>();
  for (const row of (data ?? []) as ActivePlanRow[]) {
    const userId = cleanText(row.user_id);
    if (userId) seen.add(userId);
  }
  return [...seen].sort();
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const budgetMsRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetMsRaw) && budgetMsRaw > 0
      ? Math.min(budgetMsRaw, 120_000)
      : DEFAULT_BUDGET_MS;
    const nowIso = cleanText(body.now);
    const nowCandidate = nowIso ? new Date(nowIso) : new Date();
    const now = Number.isFinite(nowCandidate.getTime())
      ? nowCandidate
      : new Date();

    const admin = adminClient();
    const startedAt = Date.now();

    let cursor = cleanText(body.after_user_id);
    let usersScanned = 0;
    let usersActivated = 0;
    let itemsActivated = 0;
    let exhausted = false;
    const warnings: string[] = [];

    while (true) {
      // La page est bornée par PLAN_PAGE_SIZE lignes de plans; comme un user
      // peut avoir plusieurs plans actifs, elle peut rendre moins d'IDs.
      const userIds = await loadNextUserIds({ admin, afterUserId: cursor });
      if (userIds.length === 0) {
        exhausted = true;
        break;
      }

      for (const userId of userIds) {
        const result = await activateDueWeekItemsForUser({
          supabase: admin,
          userId,
          now,
        });
        usersScanned++;
        cursor = userId;
        if (result.activated_ids.length > 0) {
          usersActivated++;
          itemsActivated += result.activated_ids.length;
        }
        // activateDueWeekItemsForUser ne lève jamais: les erreurs par user
        // remontent en warnings. On les agrège (plafonnés) pour garder une
        // trace sans faire exploser la réponse.
        if (result.warnings.length > 0 && warnings.length < 50) {
          warnings.push(...result.warnings.slice(0, 5).map((warning) =>
            `${userId}: ${warning}`
          ));
        }
        if (Date.now() - startedAt > budgetMs) break;
      }

      if (Date.now() - startedAt > budgetMs) break;
    }

    return jsonResponse(req, {
      ok: true,
      users_scanned: usersScanned,
      users_activated: usersActivated,
      items_activated: itemsActivated,
      exhausted,
      // Non vide quand le budget a coupé le balayage: rejouer avec
      // { "after_user_id": <cursor> } reprend là où on s'est arrêté.
      next_after_user_id: exhausted ? null : cursor || null,
      warnings: warnings.slice(0, 50),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "keel-week-rollover-v1",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
