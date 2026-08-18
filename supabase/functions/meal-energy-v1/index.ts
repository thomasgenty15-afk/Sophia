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
  canShowTarget,
  countingStanceFrom,
  type EnergyGateReason,
} from "../_shared/keel/energy_gate.ts";
import { maintenanceRange } from "../_shared/keel/energy_target.ts";
import { ACTIVITY_LEVELS, type ActivityLevel } from "../_shared/keel/tokens.ts";
import { latest, loadStudentBody } from "../_shared/keel/student_body_io.ts";
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
  type MemberAddon,
  PLAN_ENERGY_BASIS,
  planEnergy,
} from "../_shared/keel/plan_energy.ts";
// L8 ③ — LES SIX MOMENTS, POUR TRADUIRE « toute la journée » EN NOMBRE DE
// REPAS. Importés, jamais recopiés: un septième moment ajouté là-bas et un `6`
// figé ici feraient dire au sujet du chiffre une chose fausse, en silence.
import { EATING_OCCASIONS } from "../_shared/keel/meal_generation.ts";

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
 * ── CE QU'ELLE COUVRAIT, ET CE QU'ELLE COUVRE DEPUIS ────────────────────────
 * `member_portions[].portion_note` ne porte qu'une PHRASE, et
 * `FORBIDDEN_PORTION_TERMS` y bannit « kcal ». Elle ne pourra JAMAIS porter la
 * part. La divergence numérique du foyer vit ailleurs: dans les `member_deltas`
 * de FF-043 — un aliment et des grammes, par bouche, qui comblent l'écart entre
 * le tronc (dimensionné sur le MIN de toutes les bouches) et le besoin de
 * chacun.
 *
 * Ces deltas ne vivaient que dans la RÉPONSE HTTP de la composition. Ils sont
 * désormais gelés dans `generated_from.household.member_deltas`, et cette
 * fonction lit CEUX DU LECTEUR pour rendre son assiette à lui.
 *
 * L'abstention ne couvre donc plus que ce qu'on ne SAIT pas:
 *   · un plan composé AVANT que la trace existe;
 *   · un lecteur dont on n'a pas su résoudre le `member_id`.
 *
 * Dans les deux cas, le tronc seul serait un PLANCHER — vrai, et faux vers le
 * bas, sur exactement la question qui a motivé ce chantier (« est-ce que je
 * mange assez »). C'est la seule direction d'erreur que ce produit refuse.
 *
 * Un foyer d'UNE bouche n'a jamais rien qui diverge: le tronc EST l'assiette.
 * C'est l'entrée du produit (« entrée à 1 »), et elle garde son chiffre sans
 * dépendre d'aucune trace.
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
  household_id: string | null;
  generated_from: unknown;
}

/**
 * LES ADD-ONS DU LECTEUR, tels que le plan les a GELÉS à la composition.
 *
 * `null` = **on ne sait pas**, et c'est distinct de `[]` = **rien à ajouter**.
 * La distinction porte tout le comportement du foyer :
 *
 *   `[]`   — le tronc EST l'assiette de cette bouche (elle a le plus petit
 *            besoin de la table, ou le foyer n'a aucune enveloppe calculable).
 *            Le chiffre est exact, on l'affiche.
 *   `null` — la trace `member_deltas` n'est pas là (plan composé avant qu'elle
 *            existe), ou le lecteur n'a pas de `member_id`. Le tronc seul
 *            serait un plancher faux vers le bas. On s'abstient.
 *
 * ⚠️ UN PLAN PERSONNEL N'A PAS D'ADD-ON, et ce n'est pas une ignorance: il n'y
 * a pas de tronc partagé, donc rien à combler. Il rend `[]`.
 */
function readViewerAddons(
  row: PlanRow,
  viewerMemberId: string | null,
): MemberAddon[] | null {
  if (row.plan_kind !== "household") return [];
  if (!viewerMemberId) return null;
  const gf = (row.generated_from ?? {}) as Record<string, unknown>;
  const household = (gf.household ?? {}) as Record<string, unknown>;
  // ⚠️ `in` ET PAS UN `?? []`. Un repli sur le tableau vide ferait passer un
  // plan d'AVANT la trace pour un plan sans add-ons — c'est-à-dire qu'il
  // afficherait le tronc seul comme s'il était l'assiette entière, sur la
  // population où l'écart est le plus grand.
  if (!("member_deltas" in household)) return null;
  const raw = household.member_deltas;
  if (!Array.isArray(raw)) return null;
  const out: MemberAddon[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const d = entry as Record<string, unknown>;
    if (String(d.member_id ?? "").trim() !== viewerMemberId) continue;
    const foodRef = String(d.food_ref ?? "").trim();
    const grams = Number(d.grams);
    if (!foodRef || !Number.isFinite(grams) || grams <= 0) continue;
    out.push({ foodRef, grams });
  }
  return out;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L8 ③ — LES REPAS QUE **CE LECTEUR** PREND DEHORS, PAR JOUR.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI CE NOMBRE EXISTE. Si un repas sur trois est pris dehors, « ta
 * journée : 1 400 · ta fourchette : 1 900–2 200 » est FAUX, et faux dans le sens
 * qui décourage: la personne lit un déficit alors qu'elle a peut-être mangé un
 * burger. Le total ne change pas de valeur, il change de SUJET — il parle de ce
 * que le plan a produit, et il le dit.
 *
 * ── LA SOURCE, ET C'EST LA MÊME QUE `member_deltas` ───────────────────────
 * `generated_from.household.presence.members[].eating_out`, filtré sur la bouche
 * DU LECTEUR. C'est l'arbitrage déjà fait entre la déclaration de la personne et
 * la marque du maître (`presenceStateFor`); relire `away_days` ici ferait un
 * second avis sur qui est dehors.
 *
 * ⚠️ CEUX DU LECTEUR, ET D'EUX SEULS — même règle que les add-ons. Le jeudi midi
 * de sa mère ne change rien à ce que SON assiette a reçu, et le compter ferait
 * lire à table la semaine de quelqu'un d'autre.
 *
 * ⚠️ `slots: []` VEUT DIRE « TOUTE LA JOURNÉE » (FF-002 §5), et on le compte
 * comme les six moments. Le compter `0` dirait « rien ne manque » sur la journée
 * où TOUT manque — l'erreur exactement inverse, et silencieuse.
 *
 * ⚠️ UN PLAN D'AVANT CETTE TRACE REND UNE TABLE VIDE, donc `subject: "the_day"`,
 * c'est-à-dire EXACTEMENT le comportement d'hier. C'est une dégradation
 * gracieuse assumée: la trace de présence existe depuis le pivot foyer, mais la
 * clé `eating_out` n'y est que depuis le 2026-08-18.
 */
function readViewerMealsOut(
  row: PlanRow,
  viewerMemberId: string | null,
): Map<string | null, number> {
  const out = new Map<string | null, number>();
  if (row.plan_kind !== "household" || !viewerMemberId) return out;
  const gf = (row.generated_from ?? {}) as Record<string, unknown>;
  const household = (gf.household ?? {}) as Record<string, unknown>;
  const presence = (household.presence ?? {}) as Record<string, unknown>;
  const members = presence.members;
  if (!Array.isArray(members)) return out;
  for (const entry of members) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as Record<string, unknown>;
    if (String(m.member_id ?? "").trim() !== viewerMemberId) continue;
    const cells = m.eating_out;
    if (!Array.isArray(cells)) continue;
    for (const cell of cells) {
      if (!cell || typeof cell !== "object") continue;
      const c = cell as Record<string, unknown>;
      const day = String(c.day ?? "").trim();
      if (!day) continue;
      const slots = Array.isArray(c.slots) ? c.slots.length : 0;
      out.set(day, (out.get(day) ?? 0) + (slots > 0 ? slots : EATING_OCCASIONS.length));
    }
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
    let targetGate: ReturnType<typeof canShowTarget> | null = null;
    // Le jour LOCAL de l'élève, résolu une fois avec son fuseau et réutilisé
    // par la cible plus bas. Jamais l'UTC du serveur: à Auckland, la garde
    // mineur se tromperait de jour pendant douze heures.
    let today = "";
    try {
      const [profileRes, loaded] = await Promise.all([
        admin
          .from("profiles")
          .select("timezone, birth_date, energy_display_enabled, energy_target_enabled")
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
      today = localDateInZone(timezone, new Date());

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
      // ⑤ LA CIBLE. Elle prend le RÉSULTAT de la chaîne A/B, pas ses entrées:
      // il n'existe donc aucun chemin vers une cible qui ne traverse pas
      // d'abord les quatre portes.
      targetGate = canShowTarget({
        energy: gate,
        targetSwitch: profile.energy_target_enabled === true,
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
      .select("id, plan_kind, servings, dishes, preparations, household_id, generated_from")
      .eq("user_id", userId)
      .is("retired_at", null)
      .in("id", planIds);
    if (plansRes.error) throw plansRes.error;
    const rows = (plansRes.data ?? []) as PlanRow[];
    if (rows.length === 0) return closed(req, requestId, "no_plan");

    // ── QUELLE BOUCHE EST LE LECTEUR, DANS SON FOYER ──────────────────────
    //
    // Une seule lecture, et seulement s'il y a un plan de foyer à calculer. Un
    // `member_id` est nécessaire pour retrouver SES add-ons: le lecteur d'un
    // plan de foyer est le compte MAÎTRE, et ses deltas sont une ligne parmi
    // N dans la trace.
    let viewerMemberId: string | null = null;
    if (rows.some((r) => r.plan_kind === "household")) {
      const meRes = await admin
        .from("household_members")
        .select("member_id")
        .eq("user_id", userId)
        .maybeSingle();
      // Une lecture EN PANNE laisse `null` — donc l'abstention nommée, jamais
      // une part attribuée au hasard.
      if (!meRes.error) {
        viewerMemberId =
          String((meRes.data as Record<string, unknown> | null)?.member_id ?? "").trim() ||
          null;
      }
    }

    const index = await loadCompositionIndex(admin);

    const plans = rows.map((row) => {
      const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));

      // ── LES ADD-ONS DU LECTEUR, ET DE LUI SEUL ──────────────────────────
      const addons = readViewerAddons(row, viewerMemberId);
      if (row.plan_kind === "household" && servings > 1 && addons === null) {
        // La trace des deltas manque: plan composé AVANT que FF-059 la fige, ou
        // bouche introuvable. Le tronc seul serait un PLANCHER — vrai, et faux
        // vers le bas, sur exactement la question (« est-ce que je mange
        // assez ») qui a motivé ce chantier. On s'abstient, et on le nomme.
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
        addons: addons ?? [],
        // L8 ③ — REQUIS, jamais optionnel. Une table vide est une valeur PLEINE
        // (« cette personne mange tous ses repas ici »), pas une ignorance.
        mealsOutByDay: readViewerMealsOut(row, viewerMemberId),
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
          // L8 ③ — DE QUOI CE NOMBRE PARLE. `the_day` = la journée entière;
          // `what_the_plan_made` = ce que le plan a composé, et l'écran doit le
          // DIRE (« sur les 2 repas que j'ai composés »). Les deux champs
          // partent ensemble: un sujet sans son compte ne se rend pas.
          meals_out: d.mealsOut,
          subject: d.subject,
          // ⚠️ CE SONT LES ADD-ONS DU LECTEUR. Ceux des autres bouches ont
          // servi à composer la casserole et ne sortent d'ici sous aucune
          // forme, pas même agrégée.
          addon_kcal: d.addonKcal,
        })),
      };
    });

    // ── ⑤ LA CIBLE (niveau C) ─────────────────────────────────────────────
    //
    // ⚠️ LE POIDS N'EST LU QUE SI LA PORTE ⑤ EST OUVERTE. Ce n'est pas une
    // économie de requête: c'est la garde. Un élève qui n'a pas demandé de
    // cible ne voit pas son poids voyager pour en produire une, et le corps de
    // la réponse ne porte alors littéralement aucun champ dérivé de lui.
    let target: Record<string, unknown> | null = null;
    if (targetGate?.show === true) {
      try {
        const body = await loadStudentBody(admin as never, userId, today);
        const last = latest(body.weights);
        // ⚠️ CE PARAMÈTRE MANQUAIT, ET LE FICHIER NE COMPILAIT PLUS. Le lot L0
        // du 2026-08-18 a rendu `activityLevel` REQUIS dans `maintenanceRange`
        // (c'est le point: le compilateur recense les lecteurs) et a livré les
        // deux ÉCRIVAINS — `profiles.activity_level` et la porte de la fiche —
        // sans reprendre ce lecteur-ci. `deno check` de cette fonction était
        // donc rouge à HEAD, et `agent-gate` ne le voit pas: il ne vérifie que
        // trois points d'entrée de `sophia-brain`.
        //
        // ⛔ ON LIT LA COLONNE PLUTÔT QUE DE PASSER `null`. `null` aurait
        // recompilé en servant 28-33 à quelqu'un qui a répondu — c'est-à-dire un
        // écrivain sans lecteur, la moitié débranchée que ce dépôt paie en
        // boucle. La lecture est fail-soft: en panne ou hors vocabulaire, on
        // retombe sur `null`, qui est EXACTEMENT le comportement d'avant L0.
        const activityRes = await admin
          .from("profiles")
          .select("activity_level")
          .eq("id", userId)
          .maybeSingle();
        const rawActivity = String(
          (activityRes.data as Record<string, unknown> | null)?.activity_level ?? "",
        ).trim();
        const range = maintenanceRange({
          weightKg: last?.value ?? null,
          weightWeekStart: last?.weekStart ?? null,
          activityLevel: (ACTIVITY_LEVELS as readonly string[]).includes(rawActivity)
            ? (rawActivity as ActivityLevel)
            : null,
        });
        target = {
          // ⚠️ UNE FOURCHETTE, JAMAIS UN POINT — c'est la forme qui décide si
          // ce chiffre devient un objectif. Et AUCUN RESTE: la fonction ne
          // soustrait rien du total du jour, et l'écran non plus. « Il te reste
          // 680 kcal » est la phrase d'un tracker, et elle n'existe sur aucun
          // chemin de ce produit.
          low: range.range?.low ?? null,
          high: range.range?.high ?? null,
          basis: range.basis,
          gap: range.gap,
          // La date de la pesée, pour que l'élève sache sur QUAND la fourchette
          // est posée. Aucune fraîcheur n'est calculée: ce serait un verdict de
          // plus sur son corps.
          weight_week_start: range.weightWeekStart,
        };
      } catch (error) {
        // FAIL-CLOSED, comme partout ici: pas de cible plutôt qu'une cible sur
        // un poids qu'on n'a pas su lire.
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error,
          metadata: { source: "target" },
        });
        target = null;
      }
    }

    return jsonResponse(req, {
      show: true,
      reason: gate.reason,
      switch_offerable: true,
      basis: PLAN_ENERGY_BASIS,
      plans,
      // `target_offerable`: la bascule de la cible ne se propose QUE si son
      // seul refus est `target_off`. Proposer « montre-moi ma cible » à
      // quelqu'un que le plancher protège serait encore lui parler de cible.
      target_offerable: targetGate?.reason === "target_off" || targetGate?.show === true,
      target,
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
