/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { keelGenerationModel } from "../_shared/keel/generation_model.ts";
import { keepWorking } from "../_shared/keel/edge_runtime.ts";
import {
  buildFoodTermsExtractPrompt,
  FOOD_TERMS_EXTRACT_SYSTEM_PROMPT,
  FOOD_TERMS_KINDS,
  FOOD_TERMS_TEXT_MAX,
  type FoodTermsKind,
  foodTermsFrom,
  parseFoodTermsAnswer,
} from "../_shared/keel/food_terms_extract.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
import { repairPlanComposition } from "../_shared/keel/composition_fill_io.ts";

/**
 * `food-terms-extract-v1` — DU TEXTE LIBRE AUX BULLES, ET LES INCONNUS AU SAS.
 *
 * Chantier « allergies et dégoûts en texte libre », 2026-09-20. Le prompt et
 * la relecture sont dans `_shared/keel/food_terms_extract.ts` (module PUR); ce
 * fichier fait exactement trois choses, dans cet ordre: il vérifie le JWT, il
 * appelle le modèle UNE fois, il répond — puis il confie au runtime le dépôt
 * des termes inconnus, APRÈS la réponse.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LE MODÈLE EST `keelGenerationModel()`, EFFORT BAS, TIMEOUT COURT NOMMÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * Décision de l'utilisateur, mot pour mot: « GPT 5.6 luna en mode faible
 * réflexion ». Le même identifiant que la composition, donc — mais `reasoning`
 * à `low`, un prompt de dix lignes, une sortie d'une ligne, et un plafond HTTP
 * de douze secondes. Le « hyper rapide » vient de là, pas d'un autre modèle.
 * `forceInitialModel: true` empêche la chaîne de replis de partir vers un
 * modèle qu'on n'a pas choisi; `maxRetries: 1` empêche trente appels.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ UNE PANNE DÉGRADE VERS LE TEXTE DE LA PERSONNE, JAMAIS VERS RIEN
 * ═══════════════════════════════════════════════════════════════════════════
 * Une bulle est ce qui sera ENREGISTRÉ — pour une allergie, dans l'union de
 * sécurité. Si le modèle ne répond pas, `foodTermsFrom` découpe le texte sur
 * ses séparateurs et ce sont ces morceaux qui deviennent les bulles. La
 * réponse DIT lequel des deux chemins a servi (`via`), et l'échec est compté
 * dans les logs sous son motif.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉPÔT AU SAS — LA PROCÉDURE QUI EXISTE DÉJÀ, APPELÉE TELLE QUELLE
 * ═══════════════════════════════════════════════════════════════════════════
 * `repairPlanComposition` est le geste complet du générateur pour un terme
 * inconnu: résolution contre l'index, appel de secours pour ce qui ne résout
 * pas, écriture dans `food_composition_pending` avec ses formes fr/en, et
 * promotion après trois rencontres par le cron. On lui passe les bulles comme
 * worklist et RIEN comme `energyInputs`: il n'y a pas d'énergie à mesurer ici,
 * seulement des noms à faire connaître.
 *
 * ⚠️ APRÈS LA RÉPONSE, ET LA RÉPONSE NE L'ATTEND PAS. Deux appels modèle en
 * série feraient attendre la bulle derrière l'estimation d'un aliment que
 * personne ne cuisinera peut-être jamais. `keepWorking` confie le travail au
 * runtime; s'il n'est pas pris (`false`), c'est journalisé — un dépôt manqué
 * ne coûte qu'un terme non curé, jamais la bulle.
 *
 * ── POURQUOI `service_role` POUR LE SAS ───────────────────────────────────
 * `record_food_composition_sightings` et les tables du référentiel sont
 * `revoke all … from anon, authenticated`. Le JWT sert à savoir QUI demande;
 * le dépôt n'a besoin de personne (les tables du sas ne portent aucune
 * colonne de personne, et une contrainte le vérifie).
 */

const FN_NAME = "food-terms-extract-v1";
/** Le plafond HTTP de l'appel d'extraction. Court, et NOMMÉ. */
export const FOOD_TERMS_EXTRACT_TIMEOUT_MS = 12_000;

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

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: `keel.${FN_NAME}`, event, ...fields }));
}

/**
 * LES INCONNUS AU SAS — en arrière-plan, sans jamais lever.
 *
 * `[]` en `energyInputs`: aucune part à mesurer. Le compteur d'inconnus rendu
 * par `repairPlanComposition` est journalisé; c'est le seul signal que ce
 * chemin laisse, et il suffit pour savoir si les bulles atteignent le sas.
 */
async function depositUnknownTerms(args: {
  admin: SupabaseClient;
  terms: readonly string[];
  requestId: string;
  userId: string;
}): Promise<void> {
  if (args.terms.length === 0) return;
  try {
    const baseIndex = await loadCompositionIndex(args.admin);
    const repair = await repairPlanComposition({
      db: args.admin,
      baseIndex,
      inputs: args.terms.map((term) => ({ term })),
      energyInputs: [],
      meta: { source: FN_NAME, requestId: args.requestId, userId: args.userId },
    });
    log("sas_deposit", {
      request_id: args.requestId,
      terms: args.terms.length,
      unknowns: repair.unknowns,
      counts: repair.counts,
    });
  } catch (error) {
    log("sas_deposit_failed", {
      request_id: args.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const text = String(body.text ?? "").trim().slice(0, FOOD_TERMS_TEXT_MAX);
    const kind = String(body.kind ?? "");
    const locale = String(body.locale ?? "").trim().slice(0, 8);
    if (!text) {
      return jsonResponse(req, { error: "empty_text", request_id: requestId }, { status: 400 });
    }
    if (!(FOOD_TERMS_KINDS as readonly string[]).includes(kind)) {
      return jsonResponse(req, { error: "bad_kind", request_id: requestId }, { status: 400 });
    }

    // ── L'APPEL. UN ÉCHEC EST NOMMÉ ET COMPTÉ, JAMAIS AVALÉ ─────────────
    // ⛔ APPELÉ HORS DE TOUTE BRANCHE, comme dans `draft_note_classify_io`.
    const model = keelGenerationModel();
    let answer: ReturnType<typeof parseFoodTermsAnswer> | null = null;
    try {
      const raw = await generateWithGemini(
        FOOD_TERMS_EXTRACT_SYSTEM_PROMPT,
        buildFoodTermsExtractPrompt({ text, kind: kind as FoodTermsKind, locale }),
        0,
        true,
        [],
        "auto",
        {
          requestId,
          userId: user.id,
          source: FN_NAME,
          model,
          forceInitialModel: true,
          reasoningEffort: "low",
          httpTimeoutMs: FOOD_TERMS_EXTRACT_TIMEOUT_MS,
          maxRetries: 1,
        },
      );
      answer = parseFoodTermsAnswer(raw);
      if (!answer.parsed) log("unreadable_answer", { request_id: requestId, model });
    } catch (error) {
      log("model_unavailable", {
        request_id: requestId,
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const { via, terms } = foodTermsFrom(text, answer);
    log("extracted", { request_id: requestId, model, via, kind, terms: terms.length });

    // ── LE DÉPÔT, APRÈS LA RÉPONSE ───────────────────────────────────────
    const taken = keepWorking(
      depositUnknownTerms({ admin: adminClient(), terms, requestId, userId: user.id }),
    );
    if (!taken) log("background_not_taken", { request_id: requestId });

    return jsonResponse(req, { terms, via, model, request_id: requestId });
  } catch (error) {
    console.error(`[${FN_NAME}]`, error);
    return jsonResponse(req, {
      error: "internal",
      request_id: requestId,
    }, { status: 500 });
  }
});
