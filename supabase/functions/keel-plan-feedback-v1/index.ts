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
// ── LOT B · LE CHAMP LIBRE VA AU CLASSIFIEUR DU LOT A ────────────────────
// ⛔ PAS UN SECOND CLASSIFIEUR. Le texte passe par la MÊME garde d'entrée
// (`readDraftNote`: cible chiffrée, interdit de doctrine, plancher TCA) puis
// par le MÊME prompt qu'une note de brouillon. Un second prompt divergerait du
// premier au premier mot changé, et c'est celui qu'on regarde le moins qui
// finirait par décider.
import { classifyAndPersistDraftNote } from "../_shared/keel/draft_note_classify_io.ts";
import { draftNoteMembersOf } from "../_shared/keel/draft_note_members_io.ts";
import {
  type RecapKept,
  type RecapLanguage,
  settingRecapLine,
} from "../_shared/keel/memory_recap.ts";
import { notifyMemoryWrite } from "../_shared/keel/memory_clarification_io.ts";
import {
  foodTermsOf,
  planVocabularyOf,
} from "../_shared/keel/plan_feedback_chat.ts";
import type { DraftNoteMember } from "../_shared/keel/draft_note_classify.ts";
import { hasDraftNote, readDraftNote } from "../_shared/keel/plan_draft_note.ts";
import { loadPublishedDoctrine } from "../_shared/keel/doctrine_loader.ts";
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import type { ForbiddenTerm } from "../_shared/keel/forbidden_matcher.ts";
import { persistFieldChangesFor } from "../_shared/keel/field_change_io.ts";
import {
  fieldChangesFrom,
  withFieldChanges,
} from "../_shared/keel/field_change.ts";

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

/**
 * ⟳ `foodTermsOf` EST IMPORTÉE, PLUS RECOPIÉE (2026-09-04).
 *
 * Elle vivait ici en double avec `_shared/keel/plan_feedback_chat.ts:281`, à
 * l'octet près. Deux lectures de la même liste finissent toujours par diverger,
 * et celle-ci porte une règle chère: les préparations sont PLIÉES dans les
 * plats (en cuisine par lots, le kilo de cuisses vit dans la préparation, pas
 * dans le plat — cicatrice `preparations-must-be-folded-into-dishes`).
 *
 * ⚠️ ET ELLE A UN TROISIÈME LECTEUR DEPUIS CE LOT: le classifieur, qui s'en
 * sert pour proposer des aliments EXISTANTS quand il demande « laquelle ? ».
 * Trois copies auraient été trois vérités.
 */
/**
 * LES RÉPONSES D'ALIMENT, telles que l'écran les envoie: `{food, subject}`.
 *
 * ⛔ UN SUJET ILLISIBLE N'EST PAS NETTOYÉ ICI. Il part tel quel au module pur,
 * qui le REFUSE et le compte (`badSubject`). Le nettoyer en silence ferait
 * ranger sur toute la table ce qui visait une bouche — le repli que l'axe 3 de
 * la nomenclature interdit — et personne ne le verrait jamais.
 */
function asFoodAnswers(
  value: unknown,
): { food: string; subject: string | null }[] {
  if (!Array.isArray(value)) return [];
  const out: { food: string; subject: string | null }[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const food = entry.trim();
      if (food) out.push({ food, subject: null });
      continue;
    }
    const row = (entry ?? {}) as Record<string, unknown>;
    const food = String(row.food ?? "").trim();
    if (!food) continue;
    const subject = String(row.subject ?? "").trim();
    out.push({ food, subject: subject || null });
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

/**
 * LES BOUCHES DU FOYER, pour que « ma fille » se résolve — lot B.
 *
 * ⛔ LES DEUX RPC DU SERVEUR, JAMAIS LA TABLE. Première version de cette
 * fonction: un `select` direct sur `household_members` avec `age_state` et
 * `gender`. **AUCUNE DES DEUX COLONNES N'EXISTE** — l'état d'âge est DÉRIVÉ
 * (`keel_household_roster_for`, qui ne rend jamais la date de naissance) et le
 * sexe vit sur la fiche de corps (`keel_household_bodies_for`). Mesuré au banc
 * du lot B, cas L: `roster_unreadable`, `members: []`, et la note « Léa doit
 * bien manger le mardi » rangée sur TOUTE LA TABLE au lieu de Léa.
 *
 * ⚠️ C'est aussi ce que fait la lane foyer, et c'est la seule façon de ne pas
 * réinventer la dérivation de l'âge: `keel_household_is_minor` a sa règle, et
 * une seconde lecture de `birth_date` ici divergerait au premier fuseau.
 *
 * ⚠️ `[]` EST UNE RÉPONSE, et c'est la vérité d'un solo: il n'a AUCUNE ligne
 * `household_members` (« le solo ne crée pas de foyer »). Le classifieur dit
 * alors au modèle « il n'y a personne d'autre à cette table », ce qui ferme la
 * porte à un `member_id` inventé.
 *
 * ⚠️ `ageState` ET PAS `ageBand`: `ageBandOf` rend `null` sous 18 ans — donc
 * précisément `null` pour les bouches qu'il s'agit d'identifier. C'est le piège
 * mesuré du lot A, et il coûte tout.
 *
 * ⛔ UNE LECTURE EN PANNE REND `[]`, ET C'EST LE BON CÔTÉ POUR SE TROMPER: le
 * modèle s'abstient d'attribuer au lieu d'attribuer au hasard. Le sexe, lui,
 * peut manquer SANS que le roster manque (personne n'a rempli la fiche de
 * corps): `sex: null` dit « on ne sait pas », et le prompt du lot A fait alors
 * s'abstenir le modèle sur un mot de parenté ambigu.
 */
/**
 * Le prénom d'une bouche, ou `null` = toute la table.
 *
 * ⛔ JAMAIS UN IDENTIFIANT DANS UN MESSAGE. Un sujet `member:<uuid>` dont le
 * prénom n'est pas dans le roster rend `null` — « pour tout le monde » est faux
 * mais lisible, tandis qu'un uuid dans une bulle ne veut rien dire à personne
 * et fuite une clé interne.
 */
function feedbackWhoOf(
  subject: string,
  members: readonly DraftNoteMember[],
): string | null {
  const raw = String(subject ?? "");
  if (!raw.startsWith("member:")) return null;
  const id = raw.slice(7).trim();
  const label = members.find((m) => m.memberId === id)?.label ?? "";
  return label.trim() === "" ? null : label.trim();
}

/**
 * ⟳ 2026-09-08 — LA LECTURE DU RÔLE A REJOINT `draft_note_members_io.ts`,
 * partagée avec `keel-read-note-v1`: une note sur un brouillon et la case
 * libre du bilan donnent au modèle le MÊME rôle, lu une seule fois.
 */
const feedbackMembersOf = (admin: SupabaseClient, userId: string) =>
  draftNoteMembersOf(admin, userId, "keel/plan_feedback_free_text");

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
      // ── LOT B · LES QUATRE RÉPONSES NEUVES ──────────────────────────────
      difficulty: nullableText((body as Record<string, unknown>).difficulty),
      speed: nullableText((body as Record<string, unknown>).speed),
      variety: nullableText((body as Record<string, unknown>).variety),
      neverAgainFoods: asFoodAnswers(
        (body as Record<string, unknown>).never_again_foods,
      ),
      makeAgainFoods: asFoodAnswers(
        (body as Record<string, unknown>).make_again_foods,
      ),
      anythingElse: nullableText((body as Record<string, unknown>).anything_else),
      /**
       * ⚠️ `undefined` ET `[]` NE SONT PAS LA MÊME CHOSE, ET LA RPC LES
       * DISTINGUE. `[]` dit « la question a été posée, aucun aliment coché »;
       * l'absence dit « pas posée ». On ne passe donc la clé à la RPC que si
       * le corps la portait — sinon un client qui n'envoie rien marquerait la
       * question comme répondue.
       */
      neverAgainFoodsAsked:
        (body as Record<string, unknown>).never_again_foods !== undefined,
      makeAgainFoodsAsked:
        (body as Record<string, unknown>).make_again_foods !== undefined,
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
      // ── LOT B ────────────────────────────────────────────────────────────
      p_difficulty: answers.difficulty,
      p_speed: answers.speed,
      p_variety: answers.variety,
      p_never_again_foods: answers.neverAgainFoodsAsked
        ? answers.neverAgainFoods
        : null,
      p_make_again_foods: answers.makeAgainFoodsAsked
        ? answers.makeAgainFoods
        : null,
      p_anything_else: answers.anythingElse,
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
    let write:
      | {
        ok: boolean;
        reason: string;
        durableWritten: number;
        refused: Record<string, number>;
      }
      | null = null;
    // LOT M5 — l'écriture des CHAMPS, comptée séparément de celle des items.
    let fieldWrite: { ok: boolean; reason: string; written: number } | null =
      null;
    try {
      // La ligne du plan: sa langue (le `text` retenu s'affiche) et ses titres
      // (la liste FERMÉE des réponses possibles).
      // ⚠️ `.eq("user_id")` EXPLICITE MÊME EN `service_role`: « RLS ne remplace
      // pas un `.eq(user_id)` » est une cicatrice mesurée, et ici il n'y a même
      // pas de RLS pour se rattraper.
      const plan = await admin
        .from("student_generated_meals")
        // ⚠️ `preparations` (lot B: les aliments du plan y vivent aussi) et
        // `starts_on` (la semaine visée du classifieur du champ libre).
        .select("dishes, preparations, content_locale, starts_on")
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
        cooked: answers.cooked,
        portions: answers.portions,
        portionsSubject: answers.portionsSubject,
        // ⚠️ LES DEUX FORMES PARTENT ENSEMBLE, ET LE MODULE PUR LES DISTINGUE.
        // Les aliments (lot B) et les titres (l'écran d'avant, et les lignes
        // déjà en base) ne se mélangent pas: chacun a sa liste d'appartenance.
        // Concaténer ici ferait chercher un titre parmi les aliments.
        neverAgain: [...answers.neverAgainFoods, ...answers.neverAgain],
        makeAgain: [...answers.makeAgainFoods, ...answers.makeAgain],
        difficulty: answers.difficulty,
        speed: answers.speed,
        variety: answers.variety,
        axisQuestion: answers.axisQuestion,
        axisAnswer: answers.axisAnswer,
        // Une soumission n'est pas un refus: `dismissed_at` a sa propre porte.
        dismissedAt: null,
      }, {
        at: claimed ?? serverDay(),
        locale: String(planRow.content_locale ?? ""),
        planDishTitles: dishTitlesOf(planRow.dishes),
        // LOT B — les aliments du plan, préparations pliées.
        planFoodTerms: foodTermsOf(planRow.dishes, planRow.preparations),
        cookingTimeMin: Number.isFinite(Number(pc?.cooking_time_min))
          ? Number(pc?.cooking_time_min)
          : null,
        // ⟳ D2.5 (2026-09-03, A2) — LA VALEUR COURANTE DU STYLE. Quand elle
        // existe, c'est ELLE que les deux crans de cuisine déplacent, et plus
        // `cooking_time_min` (écrasé à la composition par la dérivation) ni
        // `recipe_difficulty` (aucun lecteur dans les deux générateurs).
        // `null` = question de P2 jamais posée ⇒ les deux champs bougent
        // comme avant, à l'octet près.
        cookingStyle: nullableText(pc?.cooking_style),
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

      // ── LOT M5 · LES CHAMPS, ÉCRITS POUR DE VRAI ─────────────────────────
      //
      // ⛔ AVANT, CETTE MOITIÉ N'ÉCRIVAIT RIEN. `logistics.set` partait dans un
      // magasin à part et les générateurs le posaient EN MÉMOIRE au moment de
      // composer: la personne lisait 45 min dans ses réglages et son plan était
      // fait sur 30, sans qu'un écran le dise et sans qu'elle puisse le défaire.
      //
      // ⚠️ LE TÉMOIN EST CELUI DE `pc`, RELU quelques lignes plus haut dans CE
      // tour. La course est réelle: la personne ouvre ses réglages pendant que
      // le bilan calcule. Sans témoin, on écraserait ce qu'elle vient de
      // choisir — « le bouton ne fait rien », cicatrice nommée du dépôt.
      if (retained.fieldChanges.length > 0) {
        const expected: Record<string, unknown> = {};
        for (const change of retained.fieldChanges) {
          expected[change.field] = (pc ?? {})[change.field] ?? null;
        }
        const fieldOutcome = await persistFieldChangesFor({
          admin,
          userId,
          source: FN_NAME,
          expected,
          changes: retained.fieldChanges,
          // Le journal COMPLET (ancien + neuf, plafonné) est calculé ici, à
          // partir de la même lecture que le témoin: une seconde lecture serait
          // une seconde chance de partir d'un état périmé.
          journal: fieldChangesFrom(
            withFieldChanges(pc, retained.fieldChanges),
          ),
        });
        fieldWrite = {
          ok: fieldOutcome.ok,
          reason: fieldOutcome.reason,
          written: fieldOutcome.written,
        };
      }

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
          refused: { ...outcome.refused },
        };
      }

      // ══════════════════════════════════════════════════════════════════
      // CE QUI VIENT D'ÊTRE ÉCRIT SE DIT — UNE FOIS, ET TOUT DE SUITE
      // ══════════════════════════════════════════════════════════════════
      //
      // §2.8 de NOMENCLATURE-MEMOIRE.md. Les deux écritures ci-dessus étaient
      // les plus silencieuses du produit: une exclusion durable et un curseur
      // de réglage entraient en base sans qu'un seul mot le dise — ni ici, ni
      // le soir. La personne retrouvait la conséquence trois jours plus tard,
      // dans un plan, sans moyen de faire le lien avec le bouton qu'elle avait
      // coché.
      //
      // ⚠️ UNE SEULE BULLE POUR LES DEUX MOITIÉS. Le questionnaire écrit
      // d'abord (ci-dessus), le champ libre ensuite: annoncer chacune ferait
      // DEUX bulles pour un seul geste, et la seconde désarmerait la première.
      // C'est pour ça que cette liste ne part pas d'ici quand il y a un texte
      // libre — elle est confiée au classifieur par `alsoAnnounce`.
      //
      // ⚠️ LE ROSTER EST LU **UNE** FOIS, ICI, ET PAS DEUX. L'annonce a besoin
      // des prénoms (« J'ai noté pour Léa … ») et le classifieur des bouches;
      // deux lectures du même roster dans le même tour pourraient rendre deux
      // listes différentes si quelqu'un ajoute une bouche entre les deux.
      const feedbackMembers = await feedbackMembersOf(admin, userId);
      const feedbackLanguage: RecapLanguage =
        /^fr/i.test(String(planRow.content_locale ?? "")) ? "fr" : "en";
      const announced: RecapKept[] = [];
      // ⚠️ « ÉCRIT » SE LIT SUR LE COMPTEUR DU PORT, et le port ne rend PAS la
      // liste de ce qu'il a gardé. Quand il en a gardé au moins un, on annonce
      // ce qu'on lui a proposé: la dédup a pu en écarter, et dire « j'ai noté »
      // d'une ligne déjà présente reste VRAI (elle est bien en mémoire). Le
      // contraire — taire une ligne réellement écrite — ne l'est pas.
      if (write?.ok && write.durableWritten > 0) {
        for (const item of retained.items) {
          announced.push({
            text: item.text,
            until: null,
            // ⚠️ `portion.adjust` EST UN RÉGLAGE, pas un goût: c'est un cran
            // que la réponse a déplacé, pas une chose qu'on sait de la
            // personne. Les fondre dirait le contraire du modèle (§2.4).
            kind: item.kind === "portion.adjust" ? "setting" : "preference",
            who: feedbackWhoOf(item.subject, feedbackMembers),
            sense: item.kind,
          });
        }
      }
      if (fieldWrite?.ok && fieldWrite.written > 0) {
        for (const change of retained.fieldChanges) {
          const line = settingRecapLine(change, feedbackLanguage);
          // `null` = un champ sans nom lisible sur la carte. On le TAIT plutôt
          // que d'envoyer la personne sur un écran où sa ligne n'est pas.
          if (line === null) {
            console.info(JSON.stringify({
              tag: "keel/plan_feedback_notice",
              event: "field_not_announced",
              user_id: userId,
              field: change.field,
              why: "aucun libellé lisible — la carte ne sait pas l'afficher",
            }));
            continue;
          }
          announced.push({ text: line, until: null, kind: "setting", who: null });
        }
      }

      // ══════════════════════════════════════════════════════════════════
      // LOT B · LE CHAMP LIBRE VA AU CLASSIFIEUR DU LOT A
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ LE MÊME CLASSIFIEUR, JAMAIS UN SECOND. Le texte passe par
      // `readDraftNote` — la garde d'entrée qui porte la cible chiffrée,
      // l'interdit de doctrine et le plancher TCA — puis par le prompt du lot
      // A, qui range vers les trois mêmes portes. Écrire un second prompt ici
      // en ferait deux qui divergeraient au premier mot changé.
      //
      // ⚠️ APRÈS LES DEUX ÉCRITURES CI-DESSUS, ET DANS LEUR TRY: le
      // questionnaire est déjà en base (étage 1), donc personne ne perd sa
      // réponse si le modèle tombe. Le classifieur, lui, ne lève jamais.
      //
      // ⚠️ LA GARDE EXIGE DEUX FAITS QUE CETTE FONCTION N'AVAIT PAS: les
      // interdits du coach et le plancher. Les deux sont chargés ICI, une
      // fois, et SEULEMENT s'il y a un texte à classer — un compte qui laisse
      // le champ vide (le cas le plus fréquent) ne paie aucune lecture de plus.
      if (hasDraftNote(answers.anythingElse)) {
        try {
          // Le plancher: une lecture EN PANNE vaut plancher LEVÉ (fail-closed).
          // Se fermer coûte une note non classée; s'ouvrir ferait entrer dans un
          // prompt le texte de quelqu'un qu'on n'a pas su évaluer.
          let restrictionFlag = true;
          try {
            const floor = await evaluateRestrictionForStudent(admin as never, {
              userId,
              asOfLocalDate: claimed ?? serverDay(),
            });
            restrictionFlag = floor.restriction_flag === true;
          } catch (error) {
            console.warn(JSON.stringify({
              tag: "keel/plan_feedback_free_text",
              event: "floor_unreadable",
              user_id: userId,
              error: error instanceof Error ? error.message : String(error),
              effect: "plancher LEVÉ, la note n'est pas classée",
            }));
          }

          const doctrine = await loadPublishedDoctrine(admin, userId);
          const doctrineForbidden: ForbiddenTerm[] =
            (doctrine.doctrine?.forbidden ?? [])
              .map((f) => ({
                ruleId: String(f.token ?? "").trim(),
                token: String(f.token ?? "").trim(),
                surfaceForms: f.surfaceForms,
              }))
              .filter((t) => t.token.length > 0);

          const note = readDraftNote({
            raw: answers.anythingElse,
            doctrineForbidden,
            restrictionFlag,
          });
          console.log(JSON.stringify({
            tag: "keel/plan_feedback_free_text",
            event: "read",
            user_id: userId,
            meal_id: mealId,
            // ⚠️ LES MOTIFS SE COMPTENT, ILS NE SE DISENT JAMAIS: une phrase de
            // refus par motif dirait qui est sous plancher TCA.
            refusal: note.refusal,
            dropped: note.dropped.length,
            usable: note.usable !== null,
          }));
          if (note.usable !== null) {
            await classifyAndPersistDraftNote({
              admin,
              userId,
              note,
              today: claimed ?? serverDay(),
              // ⚠️ LA SEMAINE VISÉE EST CELLE DU PLAN QU'ON VIENT DE CLORE.
              // C'est la seule que cette fonction connaisse, et depuis le lot A
              // l'ancre ne sert plus qu'à l'AFFICHAGE (« pour la semaine
              // du … »): la vie d'une ligne d'encart se joue sur
              // `validated_at`, pas sur elle.
              targetWeek: String(planRow.starts_on ?? claimed ?? serverDay()),
              // ⚠️ LES BOUCHES DU FOYER, pour que « ma fille » se résolve. `[]`
              // dit « personne d'autre à table » — la vérité d'un solo — et
              // `undefined` dirait « je n'ai pas su lire »: le type l'interdit.
              members: feedbackMembers,
              contentLocale: String(planRow.content_locale ?? ""),
              // ⚠️ LA MÊME LISTE QUE LES DEUX QUESTIONS DE PLAT (L475), et pas
              // un second calcul: c'est elle que le classifieur proposera en
              // boutons si « j'ai pas aimé la viande » ne désigne rien. Deux
              // listes pour la même question feraient proposer un aliment que
              // le bilan n'a jamais montré.
              planFoods: planVocabularyOf(planRow.dishes, planRow.preparations),
              source: "plan_feedback",
              // ⚠️ CE QUE LE QUESTIONNAIRE VIENT D'ÉCRIRE, dit dans la MÊME
              // bulle que ce que le texte libre écrira. Deux bulles pour un
              // geste, et la seconde désarmerait les boutons de la première.
              alsoAnnounce: announced,
              requestId,
            });
            // Le classifieur a porté l'annonce; on ne la redit pas.
            announced.length = 0;
          }
        } catch (error) {
          // ⛔ JAMAIS VERS L'APPELANT. Le questionnaire est écrit; personne ne
          // perd son bilan parce qu'une classification a échoué.
          console.warn(JSON.stringify({
            tag: "keel/plan_feedback_free_text",
            event: "classify_failed",
            user_id: userId,
            meal_id: mealId,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }

      // ── LE REPLI: PAS DE TEXTE LIBRE, DONC PERSONNE POUR PORTER L'ANNONCE ─
      //
      // C'est le cas le PLUS FRÉQUENT — la grande majorité des bilans laisse le
      // champ libre vide — donc c'est ce chemin-ci qui décide si le produit
      // dit ce qu'il écrit, ou pas. (Il l'est aussi quand le classifieur a levé:
      // le `catch` ci-dessus n'a alors pas vidé la liste.)
      if (announced.length > 0) {
        const notice = await notifyMemoryWrite(admin as never, {
          // Les réponses fermées n'écrivent rien en sécurité; le texte libre
          // passe par `classifyAndPersistDraftNote`, qui porte les siennes.
          safety: [],
          userId,
          kept: announced,
          language: feedbackLanguage,
          requestId,
        });
        console.info(JSON.stringify({
          tag: "keel/plan_feedback_notice",
          event: "notified",
          user_id: userId,
          meal_id: mealId,
          lines: announced.length,
          delivered: notice.delivered,
          // ⚠️ LE MOTIF EST LA MOITIÉ QUI COMPTE: un refus de livraison est une
          // ligne `skipped` SILENCIEUSE côté canal. Sans ce nombre ici, une
          // bulle qui ne part jamais ressemble trait pour trait à un produit
          // qui n'a rien eu à dire.
          reason: notice.reason,
        }));
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
        // ⚠️ LOT M5 — LES CHAMPS ONT LEURS PROPRES NOMBRES, dans la MÊME ligne.
        // Deux lignes séparées ne se lisent pas ensemble, et c'est leur ÉCART
        // qui dit la panne: « produit mais pas écrit » est le seul état qu'on
        // veut voir tout de suite.
        fields_produced: retained.fieldChanges.length,
        fields_written: fieldWrite?.written ?? 0,
        fields_reason: fieldWrite?.reason ?? "nothing_to_write",
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
        // ⚠️ CE SONT LES REFUS DE LA CLASSIFICATION, pas ceux de l'écriture.
        refused: retained?.refused ?? null,
        /**
         * ⛔ LES REFUS DE LA PORTE — mesuré le 2026-09-01, la réponse rendait
         * `produced=1 written=0 refused=0`: trois nombres qui ne s'additionnent
         * pas, et rien pour dire pourquoi. Un item produit puis écarté À
         * L'ÉCRITURE (déjà en base, famille interdite, sans citation) se lisait
         * « la porte a échoué », alors qu'elle avait fait son travail.
         *
         * Les deux objets restent SÉPARÉS: fondre « le questionnaire n'a rien
         * retenu » et « la porte a refusé » perdrait la seule distinction qui
         * dit lequel des deux corriger.
         */
        write_refused: write?.refused ?? null,
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
