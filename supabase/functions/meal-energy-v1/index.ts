/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { localDateInZone } from "../_shared/keel/local_date.ts";
import { assessBirthDate } from "../_shared/keel/student_age.ts";
import {
  canShowEnergy,
  countingStanceFrom,
  type EnergyGateReason,
} from "../_shared/keel/energy_gate.ts";
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import { loadPublishedDoctrine } from "../_shared/keel/doctrine_loader.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionInput,
  type CompositionState,
  type CompositionUnit,
} from "../_shared/keel/food_composition.ts";
import {
  type EnergyDish,
  type EnergyPreparation,
  PLAN_ENERGY_BASIS,
  planEnergy,
} from "../_shared/keel/plan_energy.ts";

/**
 * `meal-energy-v1` — FF-059, LE CHIFFRE AFFICHÉ.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
 *
 * ── POURQUOI UNE FONCTION, ET PAS UN CALCUL DANS L'ÉCRAN ──────────────────
 * Trois raisons, et chacune suffirait:
 *
 *   1. LE RÉFÉRENTIEL EST SERVICE-ROLE. `food_composition_refs` est révoquée
 *      pour `anon` et `authenticated`, RLS activée sans politique. Un client ne
 *      peut PAS calculer une énergie, et l'ouvrir pour ça publierait une table
 *      de 900 lignes pour afficher un nombre.
 *   2. LA CHAÎNE DE GARDES DOIT VIVRE OÙ LE CLIENT NE VA PAS. Une garde en
 *      React est une garde qu'un `curl` contourne. Ici, quand une porte est
 *      fermée, la réponse NE CONTIENT AUCUN CHIFFRE — il n'y a rien à révéler
 *      dans un onglet réseau, rien à lire dans un store, rien à oublier de ne
 *      pas rendre. C'est l'angle adversarial prioritaire de la fiche, et c'est
 *      l'architecture qui y répond, pas une intention.
 *   3. R5 — RIEN NE SE STOCKE. Cette fonction ne fait AUCUNE écriture. Le
 *      chiffre naît à la requête et meurt avec la réponse; un plan modifié rend
 *      autre chose au tour suivant, sans cache à invalider.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────
 * Aucune cible (le lot 3 est bloqué sur trois décisions humaines), aucune
 * macro, aucun pourcentage d'adhérence, aucun appel modèle, aucune prose. Elle
 * rend des entiers dans un champ typé qui porte sa base, et le nombre ne
 * traverse jamais une phrase.
 *
 * ── FAIL-CLOSED, PARTOUT ──────────────────────────────────────────────────
 * Toute lecture en panne — profil, plancher, doctrine, référentiel — rend
 * `show: false`. Il n'existe aucun chemin d'erreur qui produise un chiffre.
 */

const FN_NAME = "meal-energy-v1";

/**
 * Les motifs de la RÉPONSE. Les cinq de `energy_gate.ts`, plus deux qui
 * n'appartiennent pas à la chaîne parce qu'ils ne parlent pas de la personne:
 *
 *   `unavailable` ......... une lecture a échoué. Fail-closed. Ce n'est pas un
 *                            refus, c'est une panne, et l'écran ne doit pas
 *                            dire à un élève que son coach a décidé quelque
 *                            chose alors qu'on n'a rien su lire.
 *   `no_plan` ............. aucun plan lisible dans la demande.
 */
type ResponseReason = EnergyGateReason | "unavailable" | "no_plan";

/**
 * POURQUOI UN PLAN ENTIER PEUT N'AVOIR AUCUN CHIFFRE, alors que les portes sont
 * ouvertes.
 *
 * ⚠️ `household_portions_not_numeric` EST UNE ABSTENTION, PAS UNE GARDE, et la
 * distinction compte: elle ne parle pas de l'élève, elle parle de la DONNÉE.
 *
 * La fiche demande, dans un foyer, « un chiffre par portion ». Cette donnée
 * n'existe pas: `member_portions[].portion_note` est une PHRASE (« generous
 * vegetables, full protein share, smaller starch share »), sanitisée par
 * `sanitizePortionNote`, dont `FORBIDDEN_PORTION_TERMS` bannit explicitement
 * « kcal ». Aucune part numérique n'est écrite nulle part.
 *
 * Diviser par le nombre de bouches rendrait l'assiette MOYENNE. Sur un foyer
 * dont les portions divergent, ce chiffre est faux pour tout le monde — et il
 * rendrait la bifurcation par objectif INVISIBLE, c'est-à-dire l'inverse exact
 * de ce que la fiche attend de lui. On s'abstient donc, et on le NOMME.
 *
 * Un foyer d'UNE bouche n'a rien qui diverge: l'assiette moyenne EST l'assiette.
 * C'est l'entrée du produit (« entrée à 1 »), et elle garde son chiffre.
 */
const HOUSEHOLD_ABSTENTION = "household_portions_not_numeric";

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
 * UNE RÉPONSE FERMÉE — et il n'y a rien dedans.
 *
 * Pas de tableau vide de plats, pas de `basis`, pas de `0`. Un client ne peut
 * pas afficher par erreur ce qui n'a pas été envoyé, et un onglet réseau ne
 * peut pas révéler ce qui n'a pas voyagé.
 *
 * `switchOfferable` est le SEUL bit qui accompagne un refus, et il est
 * strictement dérivé du motif: `student_off` veut dire « la seule chose qui
 * ferme est toi ». C'est ce qui permet à l'écran de proposer l'interrupteur
 * sans jamais parler de calories à quelqu'un que le plancher, l'âge ou son
 * coach protègent — leur montrer une bascule « voir mes calories » serait
 * déjà leur parler de calories.
 */
function closed(
  req: Request,
  requestId: string,
  reason: ResponseReason,
): Response {
  return jsonResponse(req, {
    show: false,
    reason,
    switch_offerable: reason === "student_off",
    request_id: requestId,
  });
}

/** Une quantité structurée telle que la ligne de plan la porte (FF-038). */
function readIngredient(raw: unknown): CompositionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  const term = String(i.term ?? "").trim();
  if (!term) return null;
  const amount = Number(i.amount);
  const unit = String(i.unit ?? "");
  const state = String(i.state ?? "");
  return {
    term,
    // `null` PLUTÔT QU'UN DÉFAUT, à chaque champ. Un `state` deviné « raw » sur
    // du riz vaut un facteur 2,6, et toujours dans le sens qui gonfle. Ce
    // lecteur ne répare rien: il transmet l'inconnu, et `plan_energy` en fait
    // une abstention.
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: (COMPOSITION_UNITS as readonly string[]).includes(unit)
      ? (unit as CompositionUnit)
      : null,
    state: (COMPOSITION_STATES as readonly string[]).includes(state)
      ? (state as CompositionState)
      : null,
  };
}

function readIngredients(raw: unknown): CompositionInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CompositionInput[] = [];
  for (const entry of raw) {
    const i = readIngredient(entry);
    if (i) out.push(i);
  }
  return out;
}

function readDishes(raw: unknown): EnergyDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      day: d.day === null || d.day === undefined ? null : String(d.day),
      method: String(d.method ?? ""),
      ingredients: readIngredients(d.ingredients),
      uses: Array.isArray(d.uses)
        ? d.uses.map((rawUse) => {
          const u = (rawUse ?? {}) as Record<string, unknown>;
          return {
            preparationId: String(u.preparation_id ?? ""),
            servings: Number(u.servings) || 1,
          };
        }).filter((u) => u.preparationId !== "")
        : [],
    };
  });
}

function readPreparations(raw: unknown): EnergyPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      servingsMade: Math.max(1, Number(p.servings_made) || 1),
      ingredients: readIngredients(p.ingredients),
    };
  }).filter((p) => p.id !== "");
}

interface PlanRow {
  id: string;
  plan_kind: string | null;
  servings: number | null;
  dishes: unknown;
  preparations: unknown;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // --- identité: le JWT, jamais un user_id du client --------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const planIds = Array.isArray(body.plan_ids)
      // Borne de coût: un écran n'affiche jamais plus que le plan courant et le
      // suivant. Le plafond est là pour qu'un appelant ne puisse pas demander
      // le recalcul de toute l'histoire d'un compte en une requête.
      ? [...new Set(body.plan_ids.map((v) => String(v).trim()).filter(Boolean))].slice(0, 4)
      : [];
    if (planIds.length === 0) return closed(req, requestId, "no_plan");

    // ── LES QUATRE PORTES, DANS L'ORDRE, AVANT TOUTE LECTURE DE PLAT ──────
    //
    // ⚠️ UN SEUL APPEL À `canShowEnergy`, ET C'EST DÉLIBÉRÉ. La version
    // précédente de cette fonction fermait d'abord sur ① et ② pour s'épargner
    // la lecture de doctrine d'un élève déjà protégé — c'est-à-dire qu'elle
    // appelait la garde DEUX FOIS, la première avec des valeurs de remplissage
    // pour les portes qu'elle n'avait pas encore lues. Deux points de décision
    // finissent par diverger, et celui-ci porte la garde la plus sensible du
    // produit. On lit les quatre entrées, on décide une fois. Le coût est une
    // requête de doctrine pour un élève qui n'aura pas de chiffre.
    let gate: ReturnType<typeof canShowEnergy>;
    try {
      const [profileRes, loaded] = await Promise.all([
        admin
          .from("profiles")
          .select("timezone, birth_date, energy_display_enabled")
          .eq("id", userId)
          .maybeSingle(),
        loadPublishedDoctrine(admin, userId),
      ]);
      if (profileRes.error) throw profileRes.error;
      const profile = (profileRes.data ?? null) as Record<string, unknown> | null;
      if (!profile) return closed(req, requestId, "unavailable");

      const timezone = String(profile.timezone ?? "").trim();
      // ⚠️ PAS DE REPLI SUR UTC. `assessBirthDate` a besoin du jour LOCAL de
      // l'élève: à Auckland, l'anniversaire des 18 ans tombe douze heures avant
      // que le serveur ne l'admette. Sans fuseau, on ne sait pas quel jour on
      // est chez lui — donc on ne sait pas s'il est mineur, donc on se tait.
      if (!timezone) return closed(req, requestId, "unavailable");
      const today = localDateInZone(timezone, new Date());

      const floor = await evaluateRestrictionForStudent(admin as never, {
        userId,
        asOfLocalDate: today,
      });

      // ③ ON LIT LE JETON, PAS LE CHOIX DE PRÉRÉGLAGE. `readStarterChoices` ne
      // reconnaît une position qu'aux entrées encore marquées
      // `source: "starter"`, et `claimOnEdit` retire cette marque dès que le
      // coach réécrit un mot. Un coach qui a personnalisé son « on ne compte
      // pas ici » aurait donc perdu la porte ③ en la rendant DAVANTAGE sienne.
      const coachCounting = loaded.reason === "load_failed"
        // La lecture a échoué — y compris, peut-être, celle qui dit s'il y a un
        // coach. On suppose qu'il y en a un: c'est la direction qui se tait.
        ? countingStanceFrom({ hasCoach: true, doctrineReadable: false, forbiddenTokens: [] })
        : countingStanceFrom({
          hasCoach: loaded.reason !== "no_coach",
          doctrineReadable: true,
          // `no_published_doctrine` rend `doctrine: null` et c'est exact: un
          // coach qui n'a rien publié n'a pas de position. `empty_doctrine` et
          // `empty_for_goal` rendent la doctrine ENTIÈRE — un interdit n'a pas
          // de portée par objectif, donc le jeton y reste visible.
          forbiddenTokens: (loaded.doctrine?.forbidden ?? []).map((f) => f.token),
        });

      gate = canShowEnergy({
        restrictionFlag: floor.restriction_flag === true,
        ageVerdict: assessBirthDate(profile.birth_date, today),
        coachCounting,
        // La colonne est `not null default false`; le `=== true` couvre la
        // ligne qu'un backfill futur laisserait nulle, et il se ferme dans le
        // bon sens.
        studentSwitch: profile.energy_display_enabled === true,
      });
    } catch (error) {
      // FAIL-CLOSED. Un plancher TCA ILLISIBLE vaut un plancher LEVÉ — même
      // arbitrage que `MealBodyContext.restrictionFlag` (FF-030 R6): se fermer
      // rend le produit d'hier, s'ouvrir met un chiffre sous les yeux de
      // quelqu'un qu'on n'a pas su évaluer.
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error,
        metadata: { source: "gate" },
      });
      return closed(req, requestId, "unavailable");
    }
    if (!gate.show) return closed(req, requestId, gate.reason);

    // ── LES PLATS, ET ILS SONT SCOPÉS SUR LE DEMANDEUR ────────────────────
    //
    // `.eq("user_id", userId)` en plus de l'identifiant demandé. Le client
    // admin ne passe PAS par RLS: sans ce filtre, un identifiant de plan volé
    // rendrait l'assiette d'un autre. Cicatrice
    // `rls-is-not-a-substitute-for-eq-user-id`, et ici il n'y a même pas de RLS
    // pour rattraper l'oubli.
    const plansRes = await admin
      .from("student_generated_meals")
      .select("id, plan_kind, servings, dishes, preparations")
      .eq("user_id", userId)
      .is("retired_at", null)
      .in("id", planIds);
    if (plansRes.error) throw plansRes.error;
    const rows = (plansRes.data ?? []) as PlanRow[];
    if (rows.length === 0) return closed(req, requestId, "no_plan");

    const index = await loadCompositionIndex(admin);

    const plans = rows.map((row) => {
      const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));
      if (row.plan_kind === "household" && servings > 1) {
        return {
          plan_id: row.id,
          computable: false,
          abstention: HOUSEHOLD_ABSTENTION,
        };
      }
      const energy = planEnergy({
        index,
        dishes: readDishes(row.dishes),
        preparations: readPreparations(row.preparations),
        servings,
      });
      return {
        plan_id: row.id,
        computable: true,
        // R1: clés ASCII snake_case, comme partout en base et sur le fil.
        dishes: energy.dishes.map((d, i) => ({
          index: i,
          kcal: d.kcal,
          basis: d.basis,
          complete: d.complete,
          gaps: d.gaps,
        })),
        days: energy.days.map((d) => ({
          day: d.day,
          kcal: d.kcal,
          basis: d.basis,
          complete: d.complete,
          dishes_counted: d.dishesCounted,
          dishes_total: d.dishesTotal,
        })),
      };
    });

    return jsonResponse(req, {
      show: true,
      reason: gate.reason,
      switch_offerable: true,
      basis: PLAN_ENERGY_BASIS,
      plans,
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    // ⚠️ MÊME UNE PANNE INATTENDUE SE FERME. Un 500 nu laisserait un client
    // indulgent afficher un état intermédiaire; ce corps-ci ne porte aucun
    // chiffre et dit explicitement `show: false`.
    return jsonResponse(req, {
      show: false,
      reason: "unavailable",
      switch_offerable: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
