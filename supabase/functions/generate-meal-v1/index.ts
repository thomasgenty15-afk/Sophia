/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { doctrineBlockFor, loadPublishedDoctrine } from "../_shared/keel/doctrine_loader.ts";
import { loadStudentSafetyConstraints } from "../_shared/keel/safety_constraints.ts";
import {
  buildMealPrompt,
  MEAL_MODES,
  MEAL_PROMPT_VERSION,
  MEAL_SCOPES,
  MEAL_SLOTS,
  type MealMode,
  type MealScope,
  type MealSlot,
  mealDishesPayload,
  mealShoppingPayload,
  type PantryItem,
  parseGeneratedMeal,
} from "../_shared/keel/meal_generation.ts";

/**
 * `generate-meal-v1` — l'élève se fait composer un repas.
 *
 *     LE COACH DONNE UNE MÉTHODE · L'ÉLÈVE DÉCIDE · PERSONNE NE NOTE
 *
 * Appelée avec le JWT de l'ÉLÈVE. Aucun `user_id` n'est accepté du client: on
 * lit celui du jeton, comme `generate-week-plan-v1`.
 *
 * ── CE QUI LA DISTINGUE DU PLAN DE LA SEMAINE ────────────────────────────
 * Le plan hebdo produit des LIGNES DE MÉTHODE, tracées à une conviction, une
 * par semaine, adoptées ou non. Ce chemin-ci produit des PLATS, à la demande,
 * autant de fois que l'élève veut. Il n'y a donc ni `status`, ni adoption, ni
 * unicité par semaine: un repas est un service rendu, pas un engagement.
 *
 * ── CE QU'ELLE N'ÉCRIT JAMAIS ────────────────────────────────────────────
 * `meal_ideas`. Cette table est la bibliothèque du COACH et son CHECK
 * `author_kind` n'accepte pas de modèle, délibérément. Un repas généré vit
 * dans `student_generated_meals`, et les deux ne se mélangent pas.
 */

const FN_NAME = "generate-meal-v1";

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

/**
 * Le garde-manger tel que l'élève l'a tapé.
 *
 * Plafonné à 60 entrées et 120 caractères par terme: ce champ part dans un
 * prompt, donc il est une surface d'injection de coût autant que de contenu.
 * Le plafond est SILENCIEUX pour l'élève mais COMPTÉ dans `issues` — un
 * tronquage muet est la façon dont on découvre trois mois plus tard que la
 * moitié des placards n'était jamais lue.
 */
function readPantry(raw: unknown, issues: string[]): PantryItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: PantryItem[] = [];
  for (const entry of list) {
    if (out.length >= 60) {
      issues.push(`pantry: more than 60 items, the rest was ignored`);
      break;
    }
    const item = (entry && typeof entry === "object" ? entry : { term: entry }) as
      Record<string, unknown>;
    const term = String(item.term ?? "").trim().slice(0, 120);
    if (!term) continue;
    const quantity = String(item.quantity ?? "").trim().slice(0, 60) || null;
    out.push({ term, quantity });
  }
  return out;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // --- identité: le JWT de l'élève, jamais un user_id du client ----------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const issues: string[] = [];

    // --- ce qui est demandé, dans des vocabulaires FERMÉS ------------------
    // Une valeur hors liste est REFUSÉE et pas dégradée en défaut: un élève qui
    // demande `from_pantry` et reçoit silencieusement `to_shop` se retrouve
    // avec une liste de courses pour des ingrédients qu'il a déjà.
    const mode = String(body.mode ?? "").trim() as MealMode;
    if (!(MEAL_MODES as readonly string[]).includes(mode)) {
      return jsonResponse(req, {
        error: "mode_required",
        detail: `mode must be one of ${MEAL_MODES.join(", ")}`,
        request_id: requestId,
      }, { status: 400 });
    }
    const scopeRaw = String(body.scope ?? "day").trim();
    if (!(MEAL_SCOPES as readonly string[]).includes(scopeRaw)) {
      return jsonResponse(req, {
        error: "unknown_scope",
        detail: `scope must be one of ${MEAL_SCOPES.join(", ")}`,
        request_id: requestId,
      }, { status: 400 });
    }
    const scope = scopeRaw as MealScope;

    const slotRaw = String(body.meal_slot ?? "").trim();
    const slot = (MEAL_SLOTS as readonly string[]).includes(slotRaw)
      ? (slotRaw as MealSlot)
      : null;
    if (slotRaw && !slot) issues.push(`meal_slot ${JSON.stringify(slotRaw)} is unknown, ignored`);

    const servings = Math.min(12, Math.max(1, Number(body.servings) || 1));
    const context = String(body.context ?? "").trim().slice(0, 2000) || null;
    const pantry = readPantry(body.pantry, issues);

    if (mode === "from_pantry" && pantry.length === 0) {
      // Refus explicite plutôt que génération à vide: « cuisine avec ce que tu
      // as » sans rien savoir de ce qu'il a produirait une recette inventée
      // présentée comme faite pour ses placards.
      return jsonResponse(req, {
        error: "pantry_required",
        detail: "Tell us what you have before we cook from it.",
        request_id: requestId,
      }, { status: 409 });
    }

    // --- l'objectif et la situation ---------------------------------------
    const goalRes = await admin
      .from("student_goals")
      .select("goal, situation, content_locale")
      .eq("user_id", userId)
      .maybeSingle();
    if (goalRes.error) throw goalRes.error;
    if (!goalRes.data) {
      return jsonResponse(req, {
        error: "goal_required",
        detail: "Set a goal and situation before we cook for you.",
        request_id: requestId,
      }, { status: 409 });
    }
    const goalRow = goalRes.data as Record<string, unknown>;

    // --- LA MÉTHODE DU COACH ----------------------------------------------
    const doctrine = await loadPublishedDoctrine(admin, userId);
    if (!doctrine.coachId) {
      return jsonResponse(req, { error: "no_coach", request_id: requestId }, { status: 409 });
    }
    // Contrairement au plan hebdo, une doctrine vide n'est PAS bloquante ici:
    // un plat est une application libre, et `doctrineBlockFor` injecte le bloc
    // de prudence quand il n'y a pas de méthode. On refuse de composer une
    // LIGNE DE MÉTHODE sans conviction; on sait très bien faire à dîner sans.
    const beliefKeys = (doctrine.doctrine?.beliefs ?? [])
      .map((b) => String(b.key ?? "").trim())
      .filter(Boolean);

    // --- contraintes dures de l'élève : le verrou qui ne dépend de personne
    let constraints = null;
    try {
      constraints = await loadStudentSafetyConstraints(admin as never, userId);
    } catch (error) {
      console.warn(`[${FN_NAME}] safety constraints unavailable`, error);
    }

    const { systemPrompt, userMessage } = buildMealPrompt({
      doctrineBlock: doctrineBlockFor(doctrine),
      beliefKeys,
      goal: String(goalRow.goal ?? "health"),
      situation: goalRow.situation ? String(goalRow.situation) : null,
      context,
      mode,
      scope,
      slot,
      servings,
      pantry,
    });

    const result = await generateWithGemini(
      systemPrompt, userMessage, 0.6, true, [], "auto",
      { source: FN_NAME, requestId, userId },
    );
    if (typeof result !== "string") {
      return jsonResponse(req, { error: "model_returned_tool_call", request_id: requestId }, { status: 502 });
    }

    let meal;
    try {
      meal = parseGeneratedMeal(result, {
        doctrine: doctrine.doctrine,
        safetyConstraints: constraints,
        mode,
        scope,
        pantry,
        beliefKeys,
      });
    } catch (error) {
      return jsonResponse(req, {
        error: "meal_unparseable",
        detail: error instanceof Error ? error.message : String(error),
        request_id: requestId,
      }, { status: 502 });
    }

    if (meal.dishes.length === 0) {
      // Rien n'est écrit. Même arbitrage que le plan vide: un brouillon sans
      // plat donnerait à l'élève l'impression d'un repas.
      return jsonResponse(req, {
        error: "empty_meal",
        lock: meal.lock.reason,
        rejected_numeric: meal.rejected_numeric,
        rejected_aisles: meal.rejected_aisles,
        issues: [...issues, ...meal.issues],
        request_id: requestId,
      }, { status: 422 });
    }

    const { data: written, error: writeErr } = await admin
      .from("student_generated_meals")
      .insert({
        user_id: userId,
        scope,
        mode,
        meal_slot: slot,
        servings,
        context,
        pantry,
        dishes: mealDishesPayload(meal),
        shopping_list: mealShoppingPayload(meal),
        generated_from: {
          coach_id: doctrine.coachId,
          doctrine_version: doctrine.doctrine?.version ?? null,
          doctrine_reason: doctrine.reason,
          belief_keys: beliefKeys,
          goal: String(goalRow.goal ?? "health"),
          prompt_version: MEAL_PROMPT_VERSION,
        },
        content_locale: String(goalRow.content_locale ?? "en"),
      })
      .select("id, created_at")
      .single();
    if (writeErr) throw writeErr;

    return jsonResponse(req, {
      ok: true,
      meal: written,
      dishes: meal.dishes,
      shopping_list: meal.shopping_list,
      rejected_numeric: meal.rejected_numeric,
      rejected_aisles: meal.rejected_aisles,
      issues: [...issues, ...meal.issues],
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
