/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { parseRetainedDay } from "../_shared/keel/retained_item.ts";
import {
  type PlanFeedbackRetained,
  QUESTIONNAIRE_PRODUCER,
  retainedItemsFromPlanFeedback,
} from "../_shared/keel/plan_feedback_retained.ts";
import { persistRetainedItemsFor } from "../_shared/keel/retained_items_io.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `keel-plan-feedback-v1` — LE QUESTIONNAIRE DE FIN DE PLAN, ET SON LECTEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 * Lot 2A du chantier « mémoire structurée ».
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ────────────────────────────────────
 * `meal_plan_feedback` avait une table, un écran, une RPC — et **zéro lecteur
 * backend**. Le mot n'apparaissait dans `supabase/functions/` que dans un
 * commentaire. Sept réponses collectées chaque fin de plan, rangées, et jamais
 * servies: c'est le point du dimanche, rejoué, avec le même mécanisme.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OÙ TOURNE L'EXTRACTION — TRANCHÉ ICI, ET L'OPTION ÉCARTÉE EST ÉCRITE
 * ═══════════════════════════════════════════════════════════════════════════
 * **À LA SOUMISSION**, dans cette fonction, qui ENVELOPPE la RPC: elle écrit la
 * réponse avec le jeton de la personne (donc `auth.uid()` vit, et la propriété
 * du plan est vérifiée en base comme avant), puis traduit ce qui vient d'être
 * écrit en `RetainedItem` et le porte au magasin en `service_role`.
 *
 * Trois raisons, dans cet ordre:
 *   1. **La réponse et sa lecture sont le même geste.** Un seul appel, un seul
 *      moment où l'échec est visible, et rien à « rattraper » plus tard.
 *   2. **Aucun second état à inventer.** L'alternative demande de savoir ce qui
 *      a déjà été extrait — donc une colonne `extracted_at`, c'est-à-dire « un
 *      second état à invalider, dont l'écrivain finit par disparaître »
 *      (`accident.ts`). Ce dépôt a mesuré ce mode d'échec.
 *   3. **`unique (meal_id)` borne déjà le rejeu.** Une fenêtre = une réponse =
 *      une extraction. Il n'y a pas de boucle à fermer.
 *
 * **OPTION ÉCARTÉE: extraire à la génération suivante.** Elle a l'air plus
 * paresseuse (« on lit quand on en a besoin »), et elle coûte trois choses:
 * le second état ci-dessus; une extraction qui n'arrive JAMAIS pour qui répond
 * puis ne régénère pas (le retour reste rangé, exactement comme aujourd'hui);
 * et trois câblages au lieu d'un, dans les trois `generate-*`, dont deux
 * n'auraient aucune raison de porter la logique du bilan.
 *
 * ⚠️ ET L'EXTRACTION NE PEUT PAS FAIRE ÉCHOUER LA RÉPONSE. La réponse de la
 * personne est déjà en base quand l'extraction commence; la perdre parce qu'un
 * magasin n'a pas voulu d'un item serait échanger un fait déclaré contre une
 * dérivation. L'échec est donc RENDU et COMPTÉ, jamais levé.
 *
 * ── ⛔ CE QU'ELLE N'EST PAS ───────────────────────────────────────────────
 * · Pas un second écrivain de `meal_plan_feedback`: la porte reste
 *   `keel_plan_feedback_submit`, `security definer`, appelée AVEC LE JETON DE
 *   LA PERSONNE. Deux écrivains pour une intention est « le défaut n°1 de ce
 *   dépôt », écrit par la table elle-même.
 * · Pas la porte du REFUS: `keel_plan_feedback_dismiss` reste appelée en direct
 *   par l'écran. Un refus ne produit aucun item — il n'y a rien à extraire, et
 *   lui faire traverser une fonction edge ajouterait un point de panne au seul
 *   geste qui doit toujours réussir (fermer).
 * · Pas un producteur `written`: `producer: "questionnaire"`, le jeton de la
 *   matrice. `written` contournerait la matrice entière par un seul mot, et la
 *   ligne s'afficherait « tu l'as écrit », ce qui serait faux.
 */

const FN_NAME = "keel-plan-feedback-v1";

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

/** Des titres de plats, dédoublonnés, dans l'ordre du plan. */
function dishTitlesOf(dishes: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of (Array.isArray(dishes) ? dishes : [])) {
    const title = String(((entry ?? {}) as Record<string, unknown>).title ?? "").trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

function asTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").trim()).filter((v) => v !== "");
}

function nullableText(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw === "" ? null : raw;
}

/** Le jour du serveur, en UTC — le REPLI, et il est journalisé. */
function serverDay(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();
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
    const mealId = String((body as Record<string, unknown>).meal_id ?? "").trim();
    if (!mealId) {
      return jsonResponse(req, {
        ok: false,
        reason: "bad_meal",
        request_id: requestId,
      });
    }

    const answers = {
      cooked: nullableText((body as Record<string, unknown>).cooked),
      portions: nullableText((body as Record<string, unknown>).portions),
      portionsSubject: nullableText((body as Record<string, unknown>).portions_subject),
      neverAgain: asTitles((body as Record<string, unknown>).never_again),
      makeAgain: asTitles((body as Record<string, unknown>).make_again),
      axisQuestion: nullableText((body as Record<string, unknown>).axis_question),
      axisAnswer: nullableText((body as Record<string, unknown>).axis_answer),
    };

    // ── ÉTAGE 1 · LA RÉPONSE — LA MÊME PORTE QU'AVANT CE LOT ───────────────
    // ⚠️ AVEC LE JETON DE LA PERSONNE, et pas en `service_role`: la RPC vérifie
    // la propriété du plan par `auth.uid()`, et `auth.uid()` est NULL sous
    // `service_role` (cicatrice nommée de ce dépôt: la garde serait morte, et
    // l'échec MUET).
    const submitted = await userClient.rpc("keel_plan_feedback_submit", {
      p_meal_id: mealId,
      p_cooked: answers.cooked,
      p_portions: answers.portions,
      p_never_again: answers.neverAgain,
      p_make_again: answers.makeAgain,
      p_axis_question: answers.axisQuestion,
      p_axis_answer: answers.axisAnswer,
      p_portions_subject: answers.portionsSubject,
    });
    if (submitted.error) {
      // ⚠️ 200 ET PAS 500. `supabase.functions.invoke` NE REND PAS le corps
      // d'une réponse non-2xx: l'écran ne verrait qu'un `FunctionsHttpError`
      // sans motif, et « déjà répondu » deviendrait indiscernable d'une panne.
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        userId,
        error: submitted.error,
        metadata: { step: "submit" },
      });
      return jsonResponse(req, { ok: false, reason: "rpc_failed", request_id: requestId });
    }
    const result = (submitted.data ?? {}) as { ok?: boolean; reason?: string };
    if (result.ok !== true) {
      // `already_answered` n'est PAS une panne: « une seule fois par fenêtre »
      // est une contrainte de BASE, et deux surfaces proposent ce questionnaire.
      return jsonResponse(req, {
        ok: false,
        reason: String(result.reason ?? "not_written"),
        request_id: requestId,
      });
    }

    // ── ÉTAGE 2 · L'EXTRACTION — ET ELLE NE PEUT PAS COÛTER LA RÉPONSE ─────
    let retained: PlanFeedbackRetained | null = null;
    let write: { ok: boolean; reason: string; durableWritten: number } | null = null;
    try {
      // La ligne du plan: sa langue (le `text` retenu s'affiche) et ses titres
      // (la liste FERMÉE des réponses possibles).
      // ⚠️ `.eq("user_id")` EXPLICITE MÊME EN `service_role`: « RLS ne remplace
      // pas un `.eq(user_id)` » est une cicatrice mesurée, et ici il n'y a même
      // pas de RLS pour se rattraper.
      const plan = await admin
        .from("student_generated_meals")
        .select("dishes, content_locale")
        .eq("id", mealId)
        .eq("user_id", userId)
        .maybeSingle();
      if (plan.error) throw new Error(plan.error.message);
      const planRow = (plan.data ?? {}) as Record<string, unknown>;

      const goals = await admin
        .from("student_goals")
        .select("practical_constraints")
        .eq("user_id", userId)
        .maybeSingle();
      if (goals.error) throw new Error(goals.error.message);
      const pc = ((goals.data ?? {}) as Record<string, unknown>)
        .practical_constraints as Record<string, unknown> | null;

      // ⚠️ LE JOUR VIENT DE LA PERSONNE, PAS DU SERVEUR. `at` s'affiche (« je
      // l'ai retenu de mardi ») et l'horloge du serveur est en UTC: un mardi
      // soir à Paris y ressort mercredi. Le repli sur le jour UTC existe pour
      // qu'un client muet ne fasse pas disparaître TOUTE l'extraction — et il
      // est journalisé, parce qu'un repli silencieux est un repli qu'on ne
      // corrige jamais.
      const claimed = parseRetainedDay((body as Record<string, unknown>).today);
      if (!claimed) {
        console.warn(JSON.stringify({
          tag: "keel/plan_feedback_retained",
          event: "day_fell_back_to_utc",
          user_id: userId,
          meal_id: mealId,
        }));
      }

      retained = retainedItemsFromPlanFeedback({
        ...answers,
        // Une soumission n'est pas un refus: `dismissed_at` a sa propre porte.
        dismissedAt: null,
      }, {
        at: claimed ?? serverDay(),
        locale: String(planRow.content_locale ?? ""),
        planDishTitles: dishTitlesOf(planRow.dishes),
        cookingTimeMin: Number.isFinite(Number(pc?.cooking_time_min))
          ? Number(pc?.cooking_time_min)
          : null,
        recipeDifficulty: nullableText(pc?.recipe_difficulty),
        // ⚠️ LA VALEUR COURANTE DE LA 4ᵉ QUESTION — et depuis la décision du
        // 2026-08-19, la débrancher ne rend plus zéro item: elle rend
        // `varied` À TOUT LE MONDE. Sans base, une plainte de variété déclare
        // le haut de l'échelle (motif dans `plan_feedback_retained.ts`); la
        // règle « un seul cran au-dessus de ce qu'on sait d'elle » n'existe
        // QUE si cette ligne apporte ce qu'on sait. Passer `null` ici
        // remplacerait un pas par un saut, sur la clé que les deux
        // générateurs servent au modèle.
        // `wiringGapsIn` (plan_feedback_retained_test.ts) tient cette ligne.
        varietyLevel: nullableText(pc?.variety),
      });

      if (retained.items.length > 0) {
        const outcome = await persistRetainedItemsFor({
          admin,
          userId,
          // ⛔ LE JETON DE LA MATRICE, jamais `written`, et jamais le nom de
          // cette fonction: `source` est la trace libre, `producer` arme la
          // garde. Les confondre ferait dépendre une règle de sécurité du nom
          // d'un répertoire.
          producer: QUESTIONNAIRE_PRODUCER,
          source: FN_NAME,
          durable: retained.items,
        });
        write = {
          ok: outcome.ok,
          reason: outcome.reason,
          durableWritten: outcome.durableWritten,
        };
      }

      // UNE LIGNE, ET ELLE PORTE LES DEUX NOMBRES QUI SE LISENT ENSEMBLE: ce
      // qui est entré, et ce qui a été refusé. Sans elle, un lot DÉSARMÉ
      // ressemble trait pour trait à un lot qui marche.
      console.info(JSON.stringify({
        tag: "keel/plan_feedback_retained",
        event: "extracted",
        user_id: userId,
        meal_id: mealId,
        produced: retained.items.length,
        written: write?.durableWritten ?? 0,
        write_reason: write?.reason ?? "nothing_to_write",
        refused: retained.refused,
      }));
    } catch (error) {
      // ⛔ LA RÉPONSE EST DÉJÀ ÉCRITE. On ne la perd pas parce que la
      // dérivation a échoué — mais l'échec est DICIBLE, pas avalé.
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        userId,
        error,
        metadata: { step: "retained", meal_id: mealId },
      });
    }

    return jsonResponse(req, {
      ok: true,
      retained: {
        produced: retained?.items.length ?? 0,
        written: write?.durableWritten ?? 0,
        reason: write?.reason ?? (retained ? "nothing_to_write" : "extraction_failed"),
        refused: retained?.refused ?? null,
      },
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
      reason: "unexpected",
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
