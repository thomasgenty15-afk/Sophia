// KEEL — CE QUE LE POP-UP « UNE BOUCHE » ÉCRIT, ET OÙ.
//
// Conception: `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §1.
// Migration: `20260818140000_the_collected_fields_get_a_write_port.sql`.
//
// ── POURQUOI UN FICHIER À PART DE `household.ts` ──────────────────────────
// Parce que les six blocs du formulaire écrivent dans CINQ endroits, et que
// deux d'entre eux dépendent de si la bouche a un compte ou non:
//
//   bloc 1  prénom, naissance   →  `keel_household_add_member` (existant)
//   bloc 2  direction           →  `keel_household_set_member_goal` (existant)
//           cible + rythme      →  ICI — deux chemins
//   bloc 3  corps + activité    →  `keel_household_set_member_body` — UNE seule
//                                  porte depuis le lot L0 (`20260818160000`)
//   bloc 4  habitudes           →  `keel_household_set_member_habits` (existant)
//           shaker              →  ICI — ⚠️ UN SEUL chemin, voir plus bas
//   bloc 5  allergies           →  `keel_household_add_allergy` (existant)
//   bloc 6  dégoûts, régime     →  `keel_household_add_restriction`,
//                                  `keel_household_set_member_diet` (existants)
//
// Ranger les deux chemins de chaque champ à côté l'un de l'autre est ce qui
// empêche un écran d'appeler celui du compte pour une bouche qui n'en a pas.
//
// ── ⚠️ LE TROU QUE CE FICHIER A TROUVÉ ───────────────────────────────────
// Le lot socle a livré quatre colonnes en les annonçant comme « les colonnes à
// écrire ». Mesuré avant d'écrire une ligne (`has_table_privilege`): trois
// d'entre elles n'avaient AUCUN écrivain — ni grant à `authenticated`, ni RPC.
//
// ⚠️ LE CRAN D'ACTIVITÉ A ÉTÉ FERMÉ PAR LE LOT L0 PENDANT L'ÉCRITURE DE CE
// FICHIER (`20260818160000` + `household.ts`): `keel_household_set_member_body`
// prend désormais `p_activity_level`, l'ANCIENNE signature a été DROPPÉE, et
// `profiles.activity_level` s'écrit par l'entonnoir. Ce fichier ne porte donc
// AUCUNE porte d'activité — en ouvrir une seconde garantirait qu'un écran
// appelle l'une et un autre l'autre.
//
// Restent le poids visé et le rythme, que personne n'avait pris. Tant que la
// migration ci-dessus n'est pas appliquée, `setMemberTarget` répond
// `{"ok": false}` avec le message de PostgREST, et l'écran le rend comme
// n'importe quel refus — jamais comme un succès.

import type { EatingOccasionSlot } from "./mealGeneration";
import type { HabitSlotWrite } from "./householdHabits";
import { supabase } from "../../lib/supabase";
import { mergePracticalConstraints } from "./practicalConstraints";
// LA SEULE DÉFINITION DE « DIRECTIONNEL », lue ici pour décider l'ORDRE de
// deux écritures (voir la marche 1 bis). Une fonction, pas un import de
// module lourd: `household.ts` n'importe pas ce fichier, pas de cycle.
import { isDirectionalGoal } from "./household";
import {
  type ActivityLevel,
  type AppetiteLevel,
  type DayActivityLevel,
  GOAL_TOKENS,
  type GoalToken,
  type SportFrequency,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  declaredSlugFor,
  MAX_FIXED_INTAKES,
} from "../../../../supabase/functions/_shared/keel/fixed_intakes.ts";

import {
  addWrittenFoodExclusions,
  KnownWriteError,
} from "./retainedItems";

interface RpcResult {
  ok: boolean;
  reason: string;
  [key: string]: unknown;
}

function asResult(data: unknown): RpcResult {
  const row = (data ?? {}) as Record<string, unknown>;
  return { ...row, ok: row.ok === true, reason: String(row.reason ?? "") };
}

// ---------------------------------------------------------------------------
// LA CIBLE ET LE RYTHME
// ---------------------------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════
// OÙ CES DEUX CHAMPS SONT LUS — ET OÙ ILS SONT DÉLIBÉRÉMENT MUETS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ POSÉ ICI, À LA PORTE D'ÉCRITURE, ET C'EST LE POINT. Le 2026-08-19, un
// audit a rangé ces deux colonnes parmi les « champs collectés et jamais lus »
// et a demandé de leur ajouter un lecteur de prompt. La conclusion était FAUSSE
// pour l'un et INTERDITE pour l'autre, et rien, depuis cette porte-ci, ne
// permettait de le voir: il faut lire quatre fichiers ailleurs. La liste vit
// donc à côté de l'écrivain, là où la question se pose.
//
// `target_pace_kg_per_week` — DEUX lecteurs vivants, et AUCUN n'est un prompt:
//   · `generate-household-meal-v1/index.ts` le charge par bouche
//     (`household_members` puis `student_goals`, dans cet ordre de précédence)
//     et le donne au DIMENSIONNEMENT (`household_portions.ts`). Il décide des
//     GRAMMES d'une assiette.
//   · `meal-energy-v1/index.ts` le lit pour le rythme EXÉCUTÉ du conseil du
//     midi (`executedPaceFor`).
//   ⛔ IL N'ENTRE PAS DANS LA CONSIGNE, ET IL NE DOIT PAS. Deux raisons, et
//   chacune suffirait: (1) « 0,5 kg par semaine » EST un taux de déficit —
//   c'est la phrase d'un tracker, le terrain d'énergie que `CONTRACT.md`
//   clôture, et sur un MINEUR ce serait un défaut bloquant (« le corps d'un
//   mineur ne s'énonce jamais »); (2) le curseur agit DÉJÀ, en grammes: le
//   redire au modèle ferait compter deux fois le même cran, et c'est toujours
//   la moitié qu'on relit le moins qui gagne.
//
// `target_weight_kg` — lecteurs vivants, tous côté ÉCRAN:
//   · l'estimation d'arrivée du formulaire (`household.mouth.arrival`,
//     `MouthFormDialog`), qui est très exactement ce que le libellé promet
//     (« With the pace below, this gives a date to arrive on »);
//   · le résumé de `/app/plan` (`plan.summary.aiming_weight`) et la bande de
//     progression (`api/bodyMeasures.ts`);
//   · l'export RGPD.
//   ⛔ EXCLU DE LA CONSIGNE PAR ÉCRIT, ET LA RAISON TIENT TOUJOURS. FF-030 R7,
//   en tête de `_shared/keel/meal_body.ts`: « le nombre visé ne change pas ce
//   qu'on met dans l'assiette, et un modèle qui lit "vise 72, en pèse 98"
//   raisonne en écart, en déficit et en délai ». La DIRECTION passe, elle, et
//   elle passe déjà — par le jeton `goal` et par `focus_axis`.
//
// ⚠️ CES DEUX EXCLUSIONS SONT DES PROPRIÉTÉS À MAINTENIR, pas des trous. Elles
// sont ARMÉES par `mouthProfileReaders.int.test.ts`, qui échoue aussi bien si
// un lecteur de prompt apparaît que si les lecteurs ci-dessus disparaissent.
// Les renverser est une décision produit, pas un correctif de câblage.

/**
 * LE POIDS VISÉ ET LE RYTHME D'UNE BOUCHE SANS COMPTE — LES DEUX ENSEMBLE.
 *
 * `(null, null)` EFFACE, et c'est légitime: quelqu'un qui repasse en
 * `maintenance` doit pouvoir laisser la colonne propre. Un seul des deux est un
 * état que personne ne sait exécuter, et la porte le refuse par
 * `target_incomplete`.
 */
export async function setMemberTarget(
  memberId: string,
  targetWeightKg: number | null,
  paceKgPerWeek: number | null,
) {
  const { data, error } = await supabase.rpc(
    "keel_household_set_member_target",
    {
      p_member: memberId,
      p_target_weight_kg: targetWeightKg,
      p_pace_kg_per_week: paceKgPerWeek,
    },
  );
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LA CIBLE ET LE RYTHME DE QUI A UN COMPTE — `student_goals`, en direct.
 *
 * ⚠️ CETTE LIGNE N'EXISTE PAS TOUJOURS. `createOwnerGoalRow` la pose au premier
 * objectif; tant qu'elle manque, l'update ne touche aucune ligne et rend
 * `no_goal_row` — ce que l'écran doit dire, plutôt que d'enchaîner sur un
 * succès. Même garde que `mergePracticalConstraints`, pour la même raison.
 */
export async function setOwnTarget(
  userId: string,
  targetWeightKg: number | null,
  paceKgPerWeek: number | null,
) {
  const { data, error } = await supabase
    .from("student_goals")
    .update({
      target_weight_kg: targetWeightKg,
      target_pace_kg_per_week: paceKgPerWeek,
    })
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    return { ok: false, reason: "no_goal_row" } as RpcResult;
  }
  return { ok: true, reason: "" } as RpcResult;
}

/**
 * LA PORTE DE LA CIBLE D'UN COMPTE, PRÊTE POUR `persistMouth` — ET SA SEULE
 * TOLÉRANCE.
 *
 * ⚠️ EFFACER CE QUI N'EXISTE PAS EST UN SUCCÈS, ET SANS CETTE LIGNE LE PREMIER
 * ENREGISTREMENT DU MAÎTRE SERAIT UN BOUTON MORT. `persistMouth` EFFACE la
 * cible avant de toucher à la direction (voir le CHECK là-bas); sur un compte
 * dont la ligne `student_goals` n'existe pas encore — le cas nominal du tout
 * premier passage — `setOwnTarget` répond `no_goal_row`, la chaîne s'arrête, et
 * la direction qui aurait CRÉÉ la ligne n'est jamais posée. Le geste échouerait
 * exactement une fois sur la personne pour qui il compte le plus.
 *
 * ⚠️ ET LA TOLÉRANCE S'ARRÊTE À L'EFFACEMENT. Une cible RÉELLE sans ligne où
 * l'écrire reste `no_goal_row`, nommé: c'est une valeur saisie qui n'irait
 * nulle part, c'est-à-dire le silence que ce lot existe pour fermer.
 */
export function ownTargetWriter(
  userId: string,
  write: typeof setOwnTarget = setOwnTarget,
): (
  memberId: string,
  targetWeightKg: number | null,
  paceKgPerWeek: number | null,
) => Promise<RpcResult> {
  return async (_memberId, targetWeightKg, paceKgPerWeek) => {
    const res = await write(userId, targetWeightKg, paceKgPerWeek);
    if (
      !res.ok && res.reason === "no_goal_row" &&
      targetWeightKg === null && paceKgPerWeek === null
    ) {
      return { ok: true, reason: "" };
    }
    return res;
  };
}

/**
 * LA DIRECTION DE QUI A UN COMPTE — `student_goals.goal`, ET SA CRÉATION.
 *
 * ⚠️ DEUX GESTES DANS UNE PORTE, ET C'EST LE PRODUIT QUI L'EXIGE. La ligne
 * `student_goals` du compte maître n'existe pas toujours, et son absence est
 * une FALAISE: `generate-household-meal-v1` refuse de démarrer sans elle
 * (`goal_required`, 409). La fenêtre qui pose la direction est exactement le
 * geste qui doit la supprimer — renvoyer `no_goal_row` à quelqu'un qui vient de
 * choisir « perdre du poids » lui demanderait d'aller créer ailleurs une ligne
 * dont il n'a jamais entendu parler.
 *
 * ⚠️ ON MET À JOUR D'ABORD, ON CRÉE ENSUITE — jamais un `upsert`. PostgREST
 * traduit l'upsert en `ON CONFLICT DO UPDATE SET` de TOUTES les colonnes
 * envoyées: `content_locale` repartirait à sa valeur d'insertion à chaque
 * changement de direction, et la langue déclarée d'un compte se ferait écraser
 * par un geste qui ne parle pas d'elle.
 *
 * ⚠️ `null` EST REFUSÉ, NOMMÉMENT. La colonne est `not null`; l'envoyer
 * remonterait une erreur PostgreSQL brute. Le pop-up retient déjà le bouton
 * tant que la direction n'est pas choisie — ce refus est la ceinture.
 *
 * ⚠️ ET LE JETON EST **RETROUVÉ** DANS `GOAL_TOKENS`, PAS CASTÉ. Un `as
 * GoalToken` ferait passer au créateur de ligne n'importe quelle chaîne, et le
 * CHECK de la base la refuserait en erreur brute — « `as` sur un type étranger
 * désarme le typecheck », mesuré. Ici l'inconnu sort par `bad_goal`, nommé.
 */
export function ownGoalWriter(
  userId: string,
  createRow: (userId: string, goal: GoalToken) => Promise<boolean>,
): (memberId: string, goal: string | null) => Promise<RpcResult> {
  return async (_memberId: string, goal: string | null) => {
    if (goal === null) return { ok: false, reason: "goal_required" };
    const token = GOAL_TOKENS.find((g) => g === goal);
    if (token === undefined) return { ok: false, reason: "bad_goal" };
    const { data, error } = await supabase
      .from("student_goals")
      .update({ goal: token })
      .eq("user_id", userId)
      .select("user_id");
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return { ok: true, reason: "" };
    const created = await createRow(userId, token);
    return created
      ? { ok: true, reason: "" }
      : { ok: false, reason: "no_goal_row" };
  };
}

// ---------------------------------------------------------------------------
// CE QU'ON SAIT DÉJÀ — LA LECTURE SANS LAQUELLE LA FENÊTRE EFFACE
// ---------------------------------------------------------------------------

/**
 * LES QUATRE CHAMPS D'UNE BOUCHE À COMPTE QU'AUCUNE AUTRE LECTURE DE L'ÉCRAN
 * NE REND.
 *
 * `/app/household` lit déjà le prénom, la direction, le corps et les habitudes.
 * Il ne lit NI la date de naissance (le roster ne la rend jamais — voir
 * `setMemberBirthDate`), NI le poids visé, NI le rythme. Sans cette lecture, la
 * fenêtre du maître retomberait sur un brouillon vide, et
 * `persistMouth` EFFACERAIT sa cible en la reposant à `(null, null)`.
 *
 * ⚠️ DEUX TABLES PARCE QUE LES DEUX FAITS N'HABITENT PAS ENSEMBLE, et c'est le
 * même arbitrage que `birthDateDoor`: la date d'une bouche QUI A UN COMPTE se
 * résout sur `profiles.birth_date` d'abord (migration `20260812180000`), pas
 * sur sa fiche de foyer. Lire la fiche ici rendrait la valeur que le moteur
 * n'utilise pas.
 *
 * ⚠️ LA LIGNE `student_goals` PEUT MANQUER, et ce n'est pas une erreur: c'est
 * le compte maître qui n'a pas encore posé sa direction. On rend alors des
 * `null`, que `draftFromKnown` traduit en champs vides — pas en zéros.
 */
export interface KnownOwnMouth {
  birthDate: string | null;
  goal: string | null;
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
}

export async function loadOwnMouth(userId: string): Promise<KnownOwnMouth> {
  const profile = await supabase
    .from("profiles")
    .select("birth_date")
    .eq("id", userId)
    .maybeSingle();
  if (profile.error) throw new Error(profile.error.message);

  const goals = await supabase
    .from("student_goals")
    .select("goal, target_weight_kg, target_pace_kg_per_week")
    .eq("user_id", userId)
    .maybeSingle();
  if (goals.error) throw new Error(goals.error.message);

  const row = (goals.data ?? {}) as Record<string, unknown>;
  const asNumber = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    birthDate: (profile.data?.birth_date as string | null) ?? null,
    goal: (row.goal as string | null) ?? null,
    targetWeightKg: asNumber(row.target_weight_kg),
    paceKgPerWeek: asNumber(row.target_pace_kg_per_week),
  };
}

// ---------------------------------------------------------------------------
// LE SHAKER
// ---------------------------------------------------------------------------

/**
 * ⚠️ LE SHAKER N'A QU'UN SEUL CHEMIN, ET IL PASSE PAR UN COMPTE. À LIRE AVANT
 * DE CROIRE À UN OUBLI.
 *
 * `fixed_intakes` (FF-051) vit dans `student_goals.practical_constraints`,
 * c'est-à-dire sur `user_id`. Une bouche SANS COMPTE n'a donc nulle part où le
 * porter — exactement le piège que la conception nomme pour
 * `food_preferences`, et que `household_habits` a fermé de son côté en
 * déménageant sur `member_id`.
 *
 * Le pop-up n'offre donc le shaker QU'À UNE BOUCHE QUI A UN COMPTE. Montrer le
 * champ aux autres serait montrer un contrôle qui échoue à tous les coups —
 * « pire qu'un contrôle absent, parce qu'il promet », la règle que
 * `setMemberDiet` porte déjà pour l'objectif.
 *
 * ── ✅ LES DEUX BOUTS SONT FERMÉS DEPUIS LE 2026-08-18 (D1b) ──────────────
 * Ce commentaire a dit, deux commits durant: « la lane foyer ne LIT aucun
 * apport fixe, `generate-household-meal-v1` passe `fixedIntakes: []` en dur,
 * trois fois ». C'était vrai, et c'était la moitié la plus grave du trou — un
 * champ qu'on remplit et qui ne va nulle part est pire qu'un champ absent,
 * parce qu'il promet.
 *
 *   l'écrivain  →  ICI (`ownShakerWriter`, appelé par `persistMouth`)
 *   le lecteur  →  `_shared/keel/household_fixed_intakes.ts`, que la fonction
 *                  edge passe à `buildMealPrompt` ET au parseur
 *
 * ⚠️ ET LE JOINT ENTRE LES DEUX N'A QU'UN SEUL GARDIEN: le test « ⛔ LA
 * SOUDURE » de `mouthProfile.int.test.ts`, qui fait traverser un brouillon
 * jusqu'à la ligne de consigne. Chaque moitié prise seule reste verte au-dessus
 * d'une clé de jsonb qui aurait dérivé — mesuré: renommer `serving_grams`
 * ici ne fait rougir que lui.
 */
export interface ShakerToWrite {
  label: string;
  servingGrams: number;
  proteinGPerServing: number;
  energyKcalPerServing: number;
  /** `null` = hors moment nommé (`loose`). */
  slot: string | null;
}

/**
 * Le jsonb d'un apport déclaré, tel que `parseFixedIntakes` le relit.
 *
 * ⚠️ `nutrition: "declared"` EST OBLIGATOIRE, ET SES TROIS NOMBRES AVEC. Le
 * référentiel ne connaît AUCUNE poudre de protéine (mesuré: 911 références,
 * zéro whey), et même en en ajoutant une ce serait une moyenne — de 70 à 90 g
 * pour 100 g selon la marque. Le nombre imprimé sur LE pot de la personne est
 * strictement meilleur.
 *
 * ⚠️ `replaces_meal: false` MÊME AVEC UN MOMENT NOMMÉ (A5). « Un shaker au
 * goûter » nomme un moment et ne remplace rien; le défaut inverse punirait
 * d'un repas en moins quelqu'un qui décrit honnêtement ce qu'il mange déjà.
 * Le pop-up ne pose pas la question — un formulaire d'accueil qui demande
 * « est-ce que ça remplace le repas ? » demande un arbitrage de composition à
 * quelqu'un qui n'a pas encore vu un plan.
 */
export function shakerIntakeJson(
  shaker: ShakerToWrite,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    food_ref: declaredSlugFor(shaker.label),
    label: shaker.label,
    amount: shaker.servingGrams,
    unit: "g",
    days: [],
    nutrition: "declared",
    serving_grams: shaker.servingGrams,
    protein_g_per_serving: shaker.proteinGPerServing,
    energy_kcal_per_serving: shaker.energyKcalPerServing,
  };
  if (shaker.slot) {
    out.slot = shaker.slot;
    out.replaces_meal = false;
  }
  return out;
}

/**
 * AJOUTE LE SHAKER AUX APPORTS FIXES DU COMPTE, SANS ÉCRASER LES AUTRES.
 *
 * ⚠️ IL REMPLACE LA LIGNE DE MÊME `food_ref` PLUTÔT QUE D'EN EMPILER UNE
 * SECONDE. `declaredSlugFor` dérive le slug du libellé: deux « mon shaker »
 * partagent donc une ligne de composition, et c'est ce que la personne veut
 * dire. Empiler ferait compter le même pot deux fois — 380 kcal ajoutées à
 * chaque enregistrement, dans le sens qui fait maigrir un plan.
 *
 * ⚠️ LE PLAFOND EST CELUI DU MOTEUR (`MAX_FIXED_INTAKES`), IMPORTÉ. Une
 * seconde constante ici divergerait, et c'est l'écran qui aurait raison contre
 * le prompt. Au-delà, on refuse en le NOMMANT: le moteur, lui, écarte
 * silencieusement l'excédent, et une déclaration qui disparaît sans trace est
 * exactement ce que R4 refuse.
 */
export async function addShakerToOwnIntakes(args: {
  userId: string;
  current: Record<string, unknown> | null | undefined;
  shaker: ShakerToWrite;
}): Promise<void> {
  const existing = Array.isArray(args.current?.fixed_intakes)
    ? (args.current?.fixed_intakes as unknown[])
    : [];
  const json = shakerIntakeJson(args.shaker);
  const slug = json.food_ref;
  const kept = existing.filter((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return String(e.food_ref ?? "") !== slug;
  });
  if (kept.length + 1 > MAX_FIXED_INTAKES) {
    throw new Error(
      `[keel/api] mouthProfile: ${MAX_FIXED_INTAKES} fixed intakes is the ` +
        `ceiling the prompt carries — remove one before adding another.`,
    );
  }
  await mergePracticalConstraints({
    userId: args.userId,
    current: args.current,
    patch: { fixed_intakes: [...kept, json] },
    source: "mouthProfile.addShakerToOwnIntakes",
  });
}

/**
 * LA PORTE DU SHAKER D'UN COMPTE, PRÊTE POUR `persistMouth`.
 *
 * ⚠️ ELLE RELIT LA COLONNE AU MOMENT D'ÉCRIRE, ET C'EST TOUT L'INTÉRÊT DE
 * L'ENVELOPPE. `addShakerToOwnIntakes` prend `current` — l'état à ne pas
 * écraser — et un écran qui le capturerait AU MONTAGE renverrait, au Save, une
 * photo périmée: le rythme alimentaire, la capacité de cuisine et les goûts
 * vivent dans le MÊME jsonb, et une écriture faite entre-temps par une autre
 * carte disparaîtrait sans un mot. C'est la cicatrice « `current` périmé efface
 * l'écriture d'avant », mesurée deux fois sur `practical_constraints`.
 *
 * ⚠️ PAS DE LIGNE = `no_goal_row`, JAMAIS UN SUCCÈS. Même refus nommé que
 * `setOwnTarget` juste au-dessus, et pour la même raison: `mergePractical
 * Constraints` lèverait de son côté, mais avec un message de développeur.
 */
export function ownShakerWriter(
  userId: string,
): (shaker: ShakerToWrite) => Promise<RpcResult> {
  return async (shaker: ShakerToWrite) => {
    const { data, error } = await supabase
      .from("student_goals")
      .select("practical_constraints")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, reason: "no_goal_row" };
    await addShakerToOwnIntakes({
      userId,
      current: (data.practical_constraints ?? {}) as Record<string, unknown>,
      shaker,
    });
    return { ok: true, reason: "" };
  };
}

// ---------------------------------------------------------------------------
// L'ORCHESTRATION — l'ordre des écritures est une garde
// ---------------------------------------------------------------------------

/**
 * ⚠️ L'ORDRE N'EST PAS INTERCHANGEABLE, ET CHAQUE ÉTAPE DIT POURQUOI ELLE EST
 * LÀ:
 *
 *   1. la bouche EXISTE      — sans `member_id`, rien d'autre n'a de cible;
 *      · elle n'existe PAS   → `addMember` écrit prénom, date ET direction;
 *      · elle existe DÉJÀ    → les trois s'écrivent par leurs propres portes
 *                              (`setName`, `setBirthDate`, `setGoal`), et la
 *                              cible est EFFACÉE avant la direction — voir le
 *                              CHECK cité dans `persistMouth`. C'est TOUJOURS
 *                              le cas du compte maître;
 *   2. le CORPS ET SON CRAN  — un seul geste depuis le lot L0
 *                              (`keel_household_set_member_body`, 5 paramètres);
 *   3. la CIBLE et le RYTHME — ils exigent que `goal` soit déjà `fat_loss` ou
 *                              `muscle_gain` en base, sinon
 *                              `target_needs_direction`;
 *   4. le reste (habitudes, LE SHAKER, allergies, dégoûts, régime) —
 *      indépendants. Le shaker suit les habitudes parce que c'est le même bloc
 *      du formulaire, et il passe par une porte à part parce que ce n'est pas
 *      la même donnée: `user_id` contre `member_id`, une quantité comptée
 *      contre une tendance contournée.
 *
 * ── ⚠️ ET IL S'ARRÊTE À LA PREMIÈRE MARCHE QUI CASSE ─────────────────────
 * Pas de « on continue et on verra »: une bouche à qui on aurait posé un
 * régime sans corps serait une fiche à moitié écrite dont personne ne sait ce
 * qui manque. Le refus rendu est le PREMIER, nommé, et l'écran le traduit par
 * la liste fermée de `copy/planRefusals.ts` comme n'importe quel autre.
 *
 * ⚠️ CE N'EST PAS TRANSACTIONNEL, ET C'EST DIT PLUTÔT QUE MAQUILLÉ. Les portes
 * sont cinq RPC distinctes; un échec en marche 3 laisse les marches 1 et 2
 * écrites. C'est le bon compromis ici — la personne EXISTE avec son corps, et
 * reprendre la fiche complète ce qui manque — mais ça veut dire qu'un écran ne
 * doit jamais annoncer « rien n'a été enregistré ».
 */
export interface MouthWriters {
  addMember: (
    firstName: string,
    birthDate: string | null,
    goal: string | null,
  ) => Promise<RpcResult>;
  /**
   * ── LA MARCHE 1 BIS — METTRE À JOUR UNE BOUCHE QUI EXISTE ────────────────
   *
   * ⚠️ ELLES SONT REQUISES ET NULLABLES, jamais `?`, exactement comme
   * `setShaker` et pour la même raison. Sans elles, `persistMouth` n'écrivait
   * `firstName`, `birthDate` et `goal` QUE par `addMember` — c'est-à-dire
   * nulle part sur une bouche qui existe déjà, ce qu'est TOUJOURS le compte
   * maître. Monter la fenêtre sur sa fiche jetait donc sa direction en
   * silence: le « champ qui promet » que ce chantier a payé cinq fois.
   *
   * `null` veut dire « cet écran n'AJOUTE que, il ne reprend jamais une
   * fiche ». C'est le SEUL état légitime sans porte, et `persistMouth` LÈVE
   * s'il rencontre l'autre — une bouche à mettre à jour sans porte pour le
   * faire est un défaut de câblage, pas une réponse à faire lire à quelqu'un.
   *
   * ⚠️ TROIS PORTES ET PAS UNE, parce que la base en a trois et qu'elles ne
   * mènent pas au même endroit selon la bouche: le prénom passe toujours par
   * `keel_household_set_member_name`, la date part dans `profiles` pour qui a
   * un compte et sur la fiche sinon (`birthDateDoor`), et la direction de qui
   * a un compte vit dans `student_goals` — `keel_household_set_member_goal`
   * lui répond `has_account`. Une porte unique ici forcerait l'appelant à
   * refaire cet arbitrage dans une closure, hors de portée des tests.
   */
  setName: ((memberId: string, firstName: string) => Promise<RpcResult>) | null;
  setBirthDate:
    | ((memberId: string, birthDate: string | null) => Promise<RpcResult>)
    | null;
  setGoal: ((memberId: string, goal: string | null) => Promise<RpcResult>) | null;
  /**
   * ⚠️ CINQ PARAMÈTRES DEPUIS LE LOT L0. Le cran d'activité entre PAR ICI, dans
   * le même geste que le corps: il n'y a plus qu'une porte, et l'ancienne
   * signature à quatre a été DROPPÉE en base — un appelant qui l'oublierait ne
   * toucherait pas une version qui n'écrit rien, il ne compilerait pas.
   */
  /**
   * ⚠️ INJECTÉ, ALORS QU'IL VIT DANS CE FICHIER — et c'est ce qui rend l'ORDRE
   * des marches prouvable. Appelé en direct, `setMemberTarget` traînerait le
   * client Supabase dans le seul test qui compte ici: « la marche 3 ne part
   * jamais avant la marche 2 ». Une orchestration dont on ne peut pas prouver
   * l'ordre est une orchestration dont on découvre l'ordre en production.
   */
  setTarget: (
    memberId: string,
    targetWeightKg: number | null,
    paceKgPerWeek: number | null,
  ) => Promise<RpcResult>;
  setBody: (
    memberId: string,
    heightCm: number,
    weightKg: number,
    gender: "male" | "female" | "other",
    activityLevel: ActivityLevel | null,
    /**
     * ── LES DEUX AXES ET LES TROIS CASES (2026-08-20) ──────────────────────
     *
     * ⚠️ REQUIS, comme le cran juste au-dessus, et pour la même cicatrice: il
     * n'y a qu'UNE porte de corps, et un paramètre facultatif aurait laissé
     * l'écran qui la connaît mal enregistrer un corps complet sans jamais
     * porter ce que ce lot collecte.
     *
     * ⛔ `axesAsked` / `structureAsked` NE SONT PAS DÉCORATIFS: c'est eux que
     * la base lit pour décider d'écrire, et eux qui séparent « pas posé » de
     * « pas répondu » dans le compteur du moteur.
     */
    extras: {
      dayActivity: DayActivityLevel | null;
      sportFrequency: SportFrequency | null;
      axesAsked: boolean;
      takesDessert: boolean | null;
      takesCheese: boolean | null;
      takesBread: boolean | null;
      structureAsked: boolean;
      appetite: AppetiteLevel | null;
      appetiteAsked: boolean;
    },
  ) => Promise<RpcResult>;
  setHabits: (
    memberId: string,
    slots: readonly HabitSlotWrite[],
    note: string | null,
  ) => Promise<RpcResult>;
  /**
   * LE SHAKER — REQUIS ET NULLABLE, jamais `?`.
   *
   * `null` veut dire « il n'y a nulle part où porter un apport fixe pour ce
   * sujet ». Un `?` n'aurait fait remonter AUCUN appelant au compilateur, et le
   * shaker serait resté ce qu'il était: collecté à l'écran, jeté avant la base.
   *
   * ⟳ ELLE PREND `memberId` DEPUIS LE 2026-09-01, comme les six autres portes.
   *
   * ⛔ L'ASYMÉTRIE QU'ELLE PORTAIT EST PÉRIMÉE, et son ancien commentaire
   * disait le contraire du produit: « `fixed_intakes` est clé sur `user_id`,
   * c'est à l'appelant de lier le compte ». C'était vrai jusqu'au 2026-08-19 —
   * depuis, une bouche SANS compte a son propre stock
   * (`household_members.fixed_intakes`, migration `20260819170000`), et son
   * écrivain est `addShakerToMemberIntakes`, qui a besoin du `memberId`. Or
   * celui d'une bouche qu'on AJOUTE n'existe qu'ici, après la marche 1: sans
   * ce paramètre, l'appelant ne pouvait pas le connaître, et le shaker d'une
   * personne ajoutée n'avait aucun chemin vers la base.
   *
   * ⚠️ LE TITULAIRE IGNORE CE PREMIER ARGUMENT, et c'est correct: son stock
   * est clé sur `user_id` (`ownShakerWriter`), pas sur sa ligne membre. Les
   * deux stocks existent, et le LECTEUR du moteur choisit par `userId` —
   * écrire un compte sur sa ligne membre serait écrire dans une colonne que
   * personne ne relit.
   */
  setShaker:
    | ((memberId: string, shaker: ShakerToWrite) => Promise<RpcResult>)
    | null;
  addAllergy: (memberId: string, label: string) => Promise<RpcResult>;
  /**
   * CE QU'ELLE N'AIME PAS — UNE PRÉFÉRENCE, ET PLUS UNE RÈGLE DE MAISON.
   *
   * ⟳ LOT C (2026-09-03) — ELLE S'APPELAIT `addRestriction` ET ELLE ÉCRIVAIT
   * DANS `household_food_restrictions`, la table des INTERDITS domestiques,
   * celle dont `household_restriction_lock.ts` censure le « pourquoi » des
   * plats. Un dégoût déclaré par la personne devenait donc une décision qu'il
   * fallait cacher — et il avait un second lit dans `retained_items`, d'où un
   * doublon par construction. Elle écrit maintenant un `food.exclude`
   * `subject=member:<uuid>` `source=written` (nomenclature §2.2 ①).
   *
   * ⚠️ LA LISTE ENTIÈRE, PAS UN LABEL. L'ancienne porte était `add_*` en base:
   * une écriture par mot coûtait un aller-retour, ce qui était sans importance.
   * La nouvelle est une lecture-modification-écriture avec `expected`: N appels
   * feraient N conflits potentiels sur le magasin, et le deuxième écraserait
   * l'attente du premier. Un geste, une écriture.
   *
   * ⚠️ ELLE AJOUTE, ELLE NE REMPLACE PAS — comme avant. Le retrait se fait sur
   * la carte « Ce que Sophia sait », là où la ligne est lisible et datée.
   */
  addDislikes: (
    memberId: string,
    labels: readonly string[],
  ) => Promise<RpcResult>;
  setDiet: (memberId: string, diet: string | null) => Promise<RpcResult>;
  /**
   * SES MOMENTS. `null` = « comme la maison », et c'est une ÉCRITURE — la seule
   * façon de revenir à ce repli après avoir coché quelque chose.
   *
   * ⚠️ REQUIS, jamais `null` comme écrivain: la question est posée dans la
   * fiche depuis le 2026-08-19, et un appelant qui n'en fournirait pas
   * afficherait six cases qui ne vont nulle part.
   */
  setRhythm: (
    memberId: string,
    rhythm: readonly EatingOccasionSlot[] | null,
  ) => Promise<RpcResult>;
}

export interface MouthToPersist {
  /** `null` = elle n'existe pas encore, et la marche 1 la crée. */
  memberId: string | null;
  firstName: string;
  birthDate: string | null;
  goal: string | null;
  heightCm: number;
  weightKg: number;
  gender: "male" | "female" | "other";
  activityLevel: ActivityLevel | null;
  /** ② Les deux axes. `null` = pas répondu — le cran ci-dessus reprend la main. */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
  /** ① Les trois cases. TRI-ÉTAT: `false` répond, `null` ne répond pas. */
  takesDessert: boolean | null;
  takesCheese: boolean | null;
  takesBread: boolean | null;
  /** ⑤ (2026-08-20), TRANSITOIRE — voir `APPETITE_FACTORS`. */
  appetite: AppetiteLevel | null;
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
  /** Ses moments, ou `null` pour « comme la maison ». Voir `setRhythm`. */
  rhythm: readonly EatingOccasionSlot[] | null;
  /**
   * ⟳ 2026-09-01 — `kind` N'EST PLUS SEULEMENT `own_usual`. Une entrée qui ne
   * porte QUE des extras (« le plat de la maison, plus du pain ») n'a pas de
   * prose, et la porte REFUSE un `own_usual` vide. Voir `HabitSlotWrite`.
   */
  habits: readonly HabitSlotWrite[];
  /** L'apport fixe déclaré, ou `null` quand la quantité n'est pas connue. */
  shaker: ShakerToWrite | null;
  allergies: readonly string[];
  dislikes: readonly string[];
  diet: string | null;
}

export async function persistMouth(
  mouth: MouthToPersist,
  writers: MouthWriters,
): Promise<RpcResult> {
  let memberId = mouth.memberId;
  if (memberId === null) {
    const added = await writers.addMember(
      mouth.firstName,
      mouth.birthDate,
      mouth.goal,
    );
    if (!added.ok) return added;
    memberId = String(added.member_id ?? "");
    // ⚠️ UN `member_id` VIDE EST UN ÉCHEC, PAS UN SUCCÈS SANS SUITE. Toutes les
    // marches suivantes viseraient alors la chaîne vide, que la base lirait
    // `not_a_member` — six refus au lieu d'un, et aucun qui dise la cause.
    if (memberId === "") return { ok: false, reason: "no_member_id" };
  } else {
    // ── MARCHE 1 BIS — LA BOUCHE EXISTE, ON LA MET À JOUR ─────────────────
    //
    // ⚠️ ON LÈVE PLUTÔT QUE DE JETER. Trois champs sont saisis dans le bloc 1
    // et le bloc 2; sans ces portes ils n'iraient nulle part, et l'écran
    // annoncerait un succès. Même patron que le shaker sans porte juste plus
    // bas: c'est un défaut de programme, et le taire est exactement l'état
    // d'avant ce lot.
    if (
      writers.setName === null || writers.setBirthDate === null ||
      writers.setGoal === null
    ) {
      throw new Error(
        "[keel/api] persistMouth: this mouth already exists, but no " +
          "`setName` / `setBirthDate` / `setGoal` door was wired — its first " +
          "name, birth date and direction would be collected and dropped " +
          "(only `addMember` writes them, and it is not called here).",
      );
    }

    // ⚠️ LA CIBLE EST EFFACÉE AVANT QU'ON TOUCHE À LA DIRECTION, ET REPOSÉE
    // APRÈS (marche 3). Ce n'est pas une précaution: le CHECK
    // `household_members_target_needs_direction_check` — et son jumeau
    // `student_goals_target_pace_direction_check` — refusent une cible
    // orpheline. Quelqu'un qui repasse de « perdre du poids » à « maintenir »
    // rendrait donc sa ligne INÉCRIVABLE, et la violation remonterait en
    // erreur PostgreSQL brute au milieu d'un formulaire d'accueil. La porte du
    // 18/08 le dit mot pour mot: « repasser en `maintenance` RETIRE la cible
    // par construction ».
    const cleared = await writers.setTarget(memberId, null, null);
    if (!cleared.ok) return cleared;

    const named = await writers.setName(memberId, mouth.firstName);
    if (!named.ok) return named;

    // ── S4 (2026-08-22) · L'ORDRE DE LA DATE ET DE LA DIRECTION DÉPEND DE CE
    //    QU'ON ÉCRIT — chantier P3, 2026-09-03 ───────────────────────────────
    //
    // La migration `20260822041500` a posé DEUX refus symétriques sur la même
    // ligne, et ils se regardent l'un l'autre:
    //   · `set_member_birth_date(minor)` refuse `goal_not_for_minor` quand la
    //     ligne PORTE `fat_loss` ou `muscle_gain` (le détour temporel);
    //   · `set_member_goal(fat_loss)` refuse `goal_not_for_minor` quand la
    //     ligne EST déjà datée mineure.
    // Un ordre fixe échoue donc toujours d'un côté. L'ordre d'avant (date, puis
    // direction) rendait `goal_not_for_minor` sur le cas nominal de ce lot —
    // une bouche mineure héritée à `fat_loss`, que la fiche plie à
    // `maintenance` (`foldMinorGoal`) et qu'on enregistre avec sa date.
    //
    // La règle: une direction qui NE bouge PAS (`maintenance`, `null`) passe
    // sur n'importe quel âge, donc elle s'écrit D'ABORD et libère la date; une
    // direction qui bouge n'est acceptée que sur un âge adulte ou inconnu, donc
    // la date s'écrit D'ABORD et libère la direction. `isDirectionalGoal` est
    // la même définition que la garde SQL (arbitrage ① de la migration).
    //
    // ⚠️ `const` LOCAUX, PAS `writers.x` DANS LES CLÔTURES: la garde du `throw`
    // ci-dessus a rétréci `writers.setBirthDate` et `writers.setGoal` à
    // non-nul sur CETTE ligne de flux, et un accès de propriété dans une
    // fonction fléchée perdrait ce rétrécissement.
    const setBirthDate = writers.setBirthDate;
    const setGoal = writers.setGoal;
    // Même raison pour `memberId`: un `let` rétréci à `string` sur cette ligne
    // de flux, que les clôtures reliraient en `string | null`.
    const id: string = memberId;
    const writeDate = () => setBirthDate(id, mouth.birthDate);
    const writeGoal = () => setGoal(id, mouth.goal);
    const [first, second] = isDirectionalGoal(mouth.goal)
      ? [writeDate, writeGoal]
      : [writeGoal, writeDate];
    const a = await first();
    if (!a.ok) return a;
    const b = await second();
    if (!b.ok) return b;
  }

  const body = await writers.setBody(
    memberId,
    mouth.heightCm,
    mouth.weightKg,
    mouth.gender,
    mouth.activityLevel,
    // ⚠️ `axesAsked` / `structureAsked` À `true` PARCE QUE LE POP-UP PORTE LES
    // CINQ QUESTIONS. Ce n'est pas « elle a répondu »: c'est « on lui a
    // demandé ». C'est ce drapeau qui autorise la base à écrire un `null` —
    // donc à DÉ-répondre —, et c'est lui qui sépare `not_answered` de
    // `not_asked` dans le compteur. Un `false` ici ferait passer une fiche
    // qu'on vient d'interroger pour une fiche plus vieille que le lot.
    {
      dayActivity: mouth.dayActivity,
      sportFrequency: mouth.sportFrequency,
      axesAsked: true,
      takesDessert: mouth.takesDessert,
      takesCheese: mouth.takesCheese,
      takesBread: mouth.takesBread,
      structureAsked: true,
      appetite: mouth.appetite,
      appetiteAsked: true,
    },
  );
  if (!body.ok) return body;

  const target = await writers.setTarget(
    memberId,
    mouth.targetWeightKg,
    mouth.paceKgPerWeek,
  );
  if (!target.ok) return target;

  // ⚠️ LES HABITUDES S'ÉCRIVENT MÊME VIDES, ET C'EST DÉLIBÉRÉ: la porte prend
  // la liste COMPLÈTE et remplace, donc retirer la dernière habitude d'une
  // fiche qu'on reprend doit pouvoir vider la ligne. Sauter l'appel quand la
  // liste est vide rendrait une suppression impossible.
  const habits = await writers.setHabits(memberId, mouth.habits, null);
  if (!habits.ok) return habits;

  // ── LE SHAKER, JUSTE APRÈS LES HABITUDES ────────────────────────────────
  //
  // C'est le même bloc du formulaire (« ce qu'elle mange déjà »), et sa place
  // ici le dit. Mais ce n'est PAS la même donnée: une habitude est une tendance
  // que la composition contourne (`member_id`, texte libre), un apport fixe est
  // une quantité connue qu'elle COMPTE (`user_id`, trois nombres lus sur le
  // pot). D'où deux portes, et une seule ligne de garde entre les deux.
  //
  // ⚠️ `null` DES DEUX CÔTÉS EST LE CAS NOMINAL — personne n'a déclaré de
  // shaker. Un shaker SANS PORTE, en revanche, est une erreur de câblage: la
  // fenêtre ne montre le bloc que si `shakerPort.kind !== "none"`, donc y
  // arriver veut dire qu'un écran a montré le champ et n'a pas branché la
  // porte. On LÈVE plutôt que de rendre un refus: c'est un défaut de
  // programme, pas une réponse à faire lire à quelqu'un — et surtout ce n'est
  // pas un silence, qui est exactement l'état d'avant ce lot.
  //
  // ⟳ 2026-09-01 — LES DEUX STOCKS SONT DÉSORMAIS ATTEIGNABLES D'ICI. Le
  // commentaire disait « le pop-up ne montre le champ qu'à qui a un compte »:
  // c'est faux depuis que la fiche d'ajout le collecte.
  if (mouth.shaker !== null) {
    if (writers.setShaker === null) {
      throw new Error(
        "[keel/api] persistMouth: a shaker was declared but no `setShaker` " +
          "door was wired — wire `ownShakerWriter` for an account, or " +
          "`addShakerToMemberIntakes` for a mouth without one.",
      );
    }
    const shaken = await writers.setShaker(memberId, mouth.shaker);
    if (!shaken.ok) return shaken;
  }

  // ⚠️ LES ALLERGIES ET LES DÉGOÛTS S'AJOUTENT, ILS NE REMPLACENT PAS, et ce
  // formulaire AJOUTE ce qu'on vient de dire. Le retrait se fait là où la ligne
  // est LISIBLE: sa fiche pour une allergie, la carte « Ce que Sophia sait »
  // pour un dégoût — jamais ici, où l'on ne voit pas ce qu'on efface.
  //
  // ⟳ LOT C — LES DEUX N'ONT PLUS LE MÊME LIT NI LA MÊME NATURE. Une allergie
  // reste une donnée de SÉCURITÉ, dans sa table, avec son consentement; un
  // dégoût est une PRÉFÉRENCE (nomenclature §2.2 ①). Elles se suivent encore
  // ici parce que le formulaire les collecte côte à côte, et c'est tout ce
  // qu'elles ont en commun.
  for (const label of mouth.allergies) {
    const res = await writers.addAllergy(memberId, label);
    if (!res.ok) return res;
  }
  // ⚠️ UN SEUL APPEL, ET LA GARDE DE VACUITÉ EST DANS L'APPELANT. Une liste
  // vide n'est pas « efface ses dégoûts »: cette porte AJOUTE, et l'appeler
  // pour rien coûterait une lecture-écriture du magasin à chaque enregistrement
  // de fiche.
  if (mouth.dislikes.length > 0) {
    const res = await writers.addDislikes(memberId, mouth.dislikes);
    if (!res.ok) return res;
  }

  // LE RÉGIME N'EST TENTÉ QUE S'IL A ÉTÉ RÉPONDU. `null` EFFACE, et effacer ce
  // que personne n'a posé n'apporte rien; surtout, la base refuse
  // `has_account`, et une bouche qui en a un ne doit pas voir passer ce refus
  // pour une case qu'on ne lui a jamais montrée.
  // ── SES MOMENTS ──────────────────────────────────────────────────────────
  // ⛔ JAMAIS UN TABLEAU VIDE: la base refuse `empty_rhythm`, et elle a raison
  // — « elle ne mange jamais » n'est pas une réponse. Le vide, ici, veut dire
  // « comme la maison », c'est-à-dire `null`.
  const rhythm = await writers.setRhythm(
    memberId,
    mouth.rhythm && mouth.rhythm.length > 0 ? mouth.rhythm : null,
  );
  if (!rhythm.ok) return rhythm;

  if (mouth.diet !== null) {
    const diet = await writers.setDiet(memberId, mouth.diet);
    if (!diet.ok) return diet;
  }

  return { ok: true, reason: "", member_id: memberId };
}

// ---------------------------------------------------------------------------
// LA CIBLE ET LE RYTHME D'UNE BOUCHE — LE LECTEUR QUI MANQUAIT
// ---------------------------------------------------------------------------

/**
 * OÙ VA LA BALANCE DE CHAQUE BOUCHE DU FOYER, ET À QUELLE VITESSE.
 *
 * ── ⛔ CE LECTEUR N'EXISTAIT PAS, ET SON ABSENCE RENDAIT UNE DONNÉE
 *    INATTEIGNABLE ─────────────────────────────────────────────────────────
 * Signalé le 2026-08-19: « si je mets "perdre du poids", ça demande pas le
 * poids de target ni le rythme de perte ». Vérifié — et c'est pire qu'une gêne:
 * la carte d'une personne DÉJÀ INSCRITE ne portait aucun des deux champs (ils
 * n'existaient que sur la fiche d'AJOUT). Quelqu'un ajouté sans direction, puis
 * passé à « Perdre du poids » depuis sa carte, ne pouvait donc JAMAIS recevoir
 * de cible depuis cet écran — et rien ne le disait.
 *
 * Poser les champs sans ce lecteur aurait été pire: `setMemberTarget` REMPLACE
 * la paire, donc une carte ouverte sur un brouillon vide aurait EFFACÉ la cible
 * déjà posée au premier enregistrement. La cicatrice
 * `mount-snapshot-forms-need-a-loading-gate`, prise par le bout qui coûte une
 * donnée.
 *
 * ⚠️ `household_members`, PAS `student_goals`. Les deux colonnes portent le
 * même nom des deux côtés et n'habitent pas ensemble: la cible du TITULAIRE
 * vit dans `student_goals` (`loadOwnMouth` juste au-dessus), celle d'une bouche
 * sur SA ligne. Lire la mauvaise table rendrait la valeur de quelqu'un d'autre.
 *
 * ⚠️ RLS EST LA FRONTIÈRE, et `.eq` n'est pas de trop: la lecture est scopée
 * par la politique du foyer, mais un compte à la fois maître et membre d'autre
 * chose lirait sinon deux maisons dans la même Map.
 */
export interface MemberTargetView {
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
}

export async function loadMemberTargets(
  householdId: string,
): Promise<Map<string, MemberTargetView>> {
  const out = new Map<string, MemberTargetView>();
  if (!householdId) return out;
  const res = await supabase
    .from("household_members")
    .select("member_id, target_weight_kg, target_pace_kg_per_week")
    .eq("household_id", householdId);
  if (res.error) throw new Error(res.error.message);
  const asNumber = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  for (const row of (res.data ?? []) as Record<string, unknown>[]) {
    out.set(String(row.member_id), {
      targetWeightKg: asNumber(row.target_weight_kg),
      paceKgPerWeek: asNumber(row.target_pace_kg_per_week),
    });
  }
  return out;
}

/**
 * LE SHAKER D'UNE BOUCHE SANS COMPTE — LA PORTE QUI N'EXISTAIT PAS.
 *
 * ── ⚠️ POURQUOI ELLE A DÛ ÊTRE CRÉÉE ─────────────────────────────────────
 * `addShakerToOwnIntakes` écrit dans `student_goals.practical_constraints`,
 * donc sur `user_id`. Une bouche sans compte — un enfant, un conjoint saisi,
 * le cas NOMINAL du foyer — n'a pas de ligne `student_goals`: le bloc lui était
 * simplement caché, et l'afficher aurait posé SON shaker sur la ligne du
 * MAÎTRE. Demandé quatre fois le 2026-08-19.
 *
 * Le stock est `household_members.fixed_intakes` (migration `20260819170000`),
 * et il porte la MÊME FORME que celui d'un compte parce que `parseFixedIntakes`
 * est le seul lecteur du produit — deux formes auraient forcé deux parseurs.
 *
 * ⚠️ IL REMPLACE LA LIGNE DE MÊME `food_ref`, comme son jumeau: deux « mon
 * shaker » saisis deux fois sont une correction, pas deux boissons.
 */
export async function addShakerToMemberIntakes(args: {
  memberId: string;
  current: readonly unknown[] | null | undefined;
  shaker: ShakerToWrite;
}): Promise<RpcResult> {
  const existing = Array.isArray(args.current) ? args.current : [];
  const json = shakerIntakeJson(args.shaker);
  const slug = json.food_ref;
  const kept = existing.filter((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return String(e.food_ref ?? "") !== slug;
  });
  const { data, error } = await supabase.rpc(
    "keel_household_set_member_fixed_intakes",
    { p_member: args.memberId, p_intakes: [...kept, json] },
  );
  if (error) throw new Error(error.message);
  return asResult(data);
}

/** Ce que la ligne d'une bouche porte déjà. `[]` quand elle n'a rien. */
export async function loadMemberFixedIntakes(
  memberId: string,
): Promise<unknown[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("fixed_intakes")
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data as { fixed_intakes?: unknown } | null)?.fixed_intakes;
  return Array.isArray(raw) ? raw : [];
}

/**
 * LA PORTE DES DÉGOÛTS, ADAPTÉE AU CONTRAT DE CET ÉCRAN.
 *
 * `addWrittenFoodExclusions` LÈVE — c'est le contrat de `retainedItems.ts`, où
 * un magasin illisible et un refus nommé de la RPC doivent remonter tels quels.
 * `persistMouth`, lui, RETOURNE un refus: son appelant enchaîne huit portes et
 * s'arrête à la première qui dit non, avec le motif sous le bouton pressé.
 *
 * ⛔ LE MOTIF NE SE PERD PAS DANS LA TRADUCTION. Un `catch` qui rendrait
 * `{ ok: false, reason: "error" }` transformerait « ta carte a bougé pendant
 * que tu écrivais » en « ça n'a pas marché » — et la personne rechargerait une
 * page qui n'a pas bougé, ou n'en rechargerait aucune. On reporte donc le
 * `reason` de `KnownWriteError` quand il y en a un.
 */
export function writtenDislikeWriter(
  userId: string,
  todayLocalIso: string,
): (memberId: string, labels: readonly string[]) => Promise<RpcResult> {
  return async (memberId, labels) => {
    try {
      await addWrittenFoodExclusions({
        userId,
        memberId,
        foods: labels,
        todayLocalIso,
      });
      return { ok: true, reason: "" };
    } catch (e) {
      const reason = e instanceof KnownWriteError
        ? e.refusal
        : e instanceof Error
        ? e.message
        : "write_failed";
      return { ok: false, reason };
    }
  };
}
