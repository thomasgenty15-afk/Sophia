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

import { supabase } from "../../lib/supabase";
import { mergePracticalConstraints } from "./practicalConstraints";
import type { ActivityLevel } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  declaredSlugFor,
  MAX_FIXED_INTAKES,
} from "../../../../supabase/functions/_shared/keel/fixed_intakes.ts";

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
  ) => Promise<RpcResult>;
  setHabits: (
    memberId: string,
    slots: readonly { slot: string; kind: "own_usual"; usual: string }[],
    note: string | null,
  ) => Promise<RpcResult>;
  /**
   * LE SHAKER — REQUIS ET NULLABLE, jamais `?`.
   *
   * `null` veut dire « cette bouche n'a pas de compte », c'est-à-dire « il n'y
   * a nulle part où porter un apport fixe ». C'est le SEUL état légitime sans
   * porte, et le pop-up le tient déjà de son côté (`subject.hasAccount` cache
   * le champ). Un `?` n'aurait fait remonter AUCUN appelant au compilateur, et
   * le shaker serait resté ce qu'il était: collecté à l'écran, jeté avant la
   * base. C'est le mode d'échec que ce lot solde — inutile de le rouvrir par
   * la porte de la signature.
   *
   * ⚠️ ELLE PREND LE SHAKER SEUL, PAS DE `memberId`: `fixed_intakes` est clé
   * sur `user_id`. C'est à l'appelant de lier le compte (`ownShakerWriter`), et
   * cette asymétrie avec les six autres portes est exactement la frontière
   * qu'elle doit rendre visible.
   */
  setShaker: ((shaker: ShakerToWrite) => Promise<RpcResult>) | null;
  addAllergy: (memberId: string, label: string) => Promise<RpcResult>;
  addRestriction: (memberId: string, label: string) => Promise<RpcResult>;
  setDiet: (memberId: string, diet: string | null) => Promise<RpcResult>;
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
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
  habits: readonly { slot: string; kind: "own_usual"; usual: string }[];
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

    const dated = await writers.setBirthDate(memberId, mouth.birthDate);
    if (!dated.ok) return dated;

    const aimed = await writers.setGoal(memberId, mouth.goal);
    if (!aimed.ok) return aimed;
  }

  const body = await writers.setBody(
    memberId,
    mouth.heightCm,
    mouth.weightKg,
    mouth.gender,
    mouth.activityLevel,
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
  // ⚠️ `null` DES DEUX CÔTÉS EST LE CAS NOMINAL — une bouche sans compte, sans
  // shaker. Un shaker SANS PORTE, en revanche, est une erreur de câblage: le
  // pop-up ne montre le champ qu'à qui a un compte, donc y arriver veut dire
  // qu'un écran a monté la fenêtre avec `hasAccount: true` et n'a pas branché
  // la porte. On LÈVE plutôt que de rendre un refus: c'est un défaut de
  // programme, pas une réponse à faire lire à quelqu'un — et surtout ce n'est
  // pas un silence, qui est exactement l'état d'avant ce lot.
  if (mouth.shaker !== null) {
    if (writers.setShaker === null) {
      throw new Error(
        "[keel/api] persistMouth: a shaker was declared but no `setShaker` " +
          "door was wired — `fixed_intakes` is keyed on `user_id`, so this " +
          "mouth needs an account (see `ownShakerWriter`).",
      );
    }
    const shaken = await writers.setShaker(mouth.shaker);
    if (!shaken.ok) return shaken;
  }

  // ⚠️ LES ALLERGIES ET LES DÉGOÛTS S'AJOUTENT, ILS NE REMPLACENT PAS. Les deux
  // portes sont `add_*` / `remove_*`, et il n'existe pas de « poser la liste ».
  // Le retrait se fait sur la fiche de la personne, pas ici — ce formulaire
  // AJOUTE ce qu'on vient de dire.
  for (const label of mouth.allergies) {
    const res = await writers.addAllergy(memberId, label);
    if (!res.ok) return res;
  }
  for (const label of mouth.dislikes) {
    const res = await writers.addRestriction(memberId, label);
    if (!res.ok) return res;
  }

  // LE RÉGIME N'EST TENTÉ QUE S'IL A ÉTÉ RÉPONDU. `null` EFFACE, et effacer ce
  // que personne n'a posé n'apporte rien; surtout, la base refuse
  // `has_account`, et une bouche qui en a un ne doit pas voir passer ce refus
  // pour une case qu'on ne lui a jamais montrée.
  if (mouth.diet !== null) {
    const diet = await writers.setDiet(memberId, mouth.diet);
    if (!diet.ok) return diet;
  }

  return { ok: true, reason: "", member_id: memberId };
}
