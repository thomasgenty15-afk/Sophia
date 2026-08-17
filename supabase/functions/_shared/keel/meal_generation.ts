/**
 * REPAS GÉNÉRÉS — composer un repas (ou quelques-uns) pour UN élève, à partir
 * de sa méthode, de son contexte du moment et de ce qu'il a dans ses placards.
 *
 * ── CE QUI DISTINGUE CE FICHIER DE `week_plan_generation.ts` ─────────────
 * Le plan de la semaine produit des LIGNES DE MÉTHODE (« construis ton
 * déjeuner autour d'une ancre protéique »). Chacune DOIT nommer la conviction
 * qu'elle applique, et la base le refuse sinon: une ligne de méthode sans
 * origine est une méthode inventée.
 *
 * Ce fichier-ci produit des PLATS. Un plat est une application libre. La
 * doctrine du coach est toujours injectée et ses contre-indications sont
 * verrouillées, mais elle ne dicte pas la recette — arbitrage produit du
 * 2026-08-04. `honours_belief_keys` est donc renseigné quand le modèle sait le
 * dire, et il est INFORMATIF: aucun CHECK ne l'exige, et le lecteur de ce
 * fichier ne doit pas croire qu'il le garantit.
 *
 * ── CE QUI EST GARANTI ICI, DÉTERMINISTE, TESTÉ ──────────────────────────
 *   1. Aucun plat ne porte de cible chiffrée d'énergie ou de macro. Les
 *      QUANTITÉS de courses, elles, passent: « 400 g de poulet » est une
 *      portion à acheter, « 30 g de protéines » est une cible que personne n'a
 *      mesurée. Cette distinction est la règle du produit, pas une tolérance.
 *   2. « Tu as déjà ça » est VÉRIFIÉ contre le garde-manger que l'élève a
 *      tapé, jamais lu sur le drapeau du modèle. Ce dépôt a une classe
 *      d'incidents « accusé fantôme » (le bot dit « c'est noté » sans ligne en
 *      base); dire « tu as tout » à quelqu'un qui n'a pas les œufs est la même
 *      faute, servie au moment des courses.
 *   3. Le rayon d'une ligne de courses vient d'un vocabulaire FERMÉ. Un rayon
 *      inventé est une ligne qu'aucun rendu ne sait placer.
 *   4. Le repas rendu passe la ceinture de sortie complète: interdits du
 *      coach, ALIMENTS DÉCONSEILLÉS, contraintes médicales de l'élève. En
 *      entier — un repas amputé en silence de son ingrédient dangereux reste
 *      un repas qu'on a servi à quelqu'un qui ne devait pas le voir.
 *
 * ── CE QUI N'EST PAS GARANTI, ET IL FAUT LE DIRE ─────────────────────────
 *   Que la recette soit bonne, faisable dans le temps annoncé, ou qu'elle
 *   plaise. Aucun code ne juge une recette. C'est pour ça que l'élève voit ce
 *   qu'il a sous la main et ce qu'il doit acheter: il tranche, pas nous.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  applyKeelOutputLocks,
  type OutputLockResult,
} from "../../sophia-brain/skills/_shared/keel_output_locks.ts";
import type { CoachDoctrine } from "./doctrine.ts";
import {
  safetyConstraintsPromptBlock,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
import { appendContentLanguageBlock } from "./locale.ts";
import { normalizeForMatch } from "./forbidden_matcher.ts";
// FF-061 — la ceinture de ton, jusqu'ici appliquée au seul message du soir et à
// la relance. Le `why` d'un plat vient du même modèle et s'affiche à l'élève.
import { findGuiltTripping } from "./reengagement.ts";
import { mealBodyBlocks, type MealBodyContext } from "./meal_body.ts";
import { type WeeklyAxis, WEEKLY_AXIS_LABELS_EN } from "./weekly_flow.ts";
import {
  detectProteinAnchor,
  isMainMealSlot,
  PROTEIN_ANCHOR_PROMPT_LINE,
} from "./protein_anchor.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionIndex,
  type CompositionState,
  type CompositionUnit,
  gramsRawOf,
  resolveIngredient,
} from "./food_composition.ts";
import { fixedIntakePromptLines, slotIsTaken } from "./fixed_intakes.ts";
import type { FixedIntake } from "./fixed_intakes.ts";
import {
  dayHasProperty,
  dayPropertyPromptLines,
  daysWithProperty,
} from "./day_properties.ts";
import type { DayPropertyEntry } from "./day_properties.ts";
// L4/D6 — LA FORME DE CUISINE. Importée, jamais recopiée: la liste des barreaux
// et les LIGNES DE CONSIGNE qui les servent vivent au même endroit
// (`COOKING_SHAPE_LINES`), et c'est là que se lit « combien de plats ce barreau
// réclame ». Aucun cycle: `household_portions.ts` n'importe pas ce fichier.
import {
  asksForASecondDish,
  type CookingShape,
  mergeDishBonus,
} from "./household_portions.ts";

// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------

export const MEAL_MODES = ["from_pantry", "to_shop"] as const;
export type MealMode = (typeof MEAL_MODES)[number];

/**
 * Le périmètre d'une génération.
 *
 * ── POURQUOI `single_meal` N'EXISTE PLUS ────────────────────────────────
 * « Donne-moi une idée pour ce soir » est une QUESTION DE CONVERSATION, pas
 * une génération. L'élève l'écrit dans le chat, l'agent répond dans la méthode
 * de son coach, et c'est réglé en un tour. Le faire passer par un générateur,
 * une ligne en base et un PDF était une cérémonie disproportionnée.
 *
 * Ce que cette surface apporte commence à PLUSIEURS repas: c'est là qu'il y a
 * une liste de courses à agréger, des jours à répartir et un document à
 * emporter au magasin. (Arbitrage du 2026-08-04, migration
 * `20260804110000_meal_scope_drop_single_meal`.)
 */
export const MEAL_SCOPES = ["day", "several_days"] as const;
export type MealScope = (typeof MEAL_SCOPES)[number];

/**
 * LES MOMENTS OÙ ON MANGE — et pourquoi il y en a six et plus quatre.
 *
 * ── LE DÉFAUT QUE ÇA CORRIGE ────────────────────────────────────────────
 * Le vocabulaire était `breakfast | lunch | dinner | snack`. Un seul jeton
 * `snack` pour deux faims qui n'ont rien à voir: celle de 10h et celle de 17h.
 * Un élève qui s'effondre à 17h ne pouvait pas le dire, et le moteur ne pouvait
 * pas placer un vrai moment là — au mieux « un snack », quelque part.
 *
 * Ce n'est pas une invention: le dépôt porte DÉJÀ ce vocabulaire, dans
 * `slot_vocabulary`, pour les plans publiés (`on_waking`, `snack_am`,
 * `pre_workout`, `snack_pm`, `before_bed`...). Le moteur de repas en tenait un
 * second, plus pauvre, en parallèle. On aligne sur celui qui existe, en ne
 * gardant que ce qui décrit un MOMENT DE FAIM: `pre_workout`/`post_workout`
 * sont des constructions d'entraînement, pas des repas de la journée.
 *
 * ── `snack` RESTE ACCEPTÉ, ET N'EST PLUS PROPOSÉ ────────────────────────
 * Des lignes `student_generated_meals` en portent déjà. Le retirer de la liste
 * ferait que le parseur DROP ces plats à la relecture — un plan composé hier
 * deviendrait un plan troué. Il est donc accepté en lecture, absent de ce que
 * l'écran offre, et le modèle ne le voit plus dans le schéma de sortie.
 */
export const EATING_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type EatingOccasion = (typeof EATING_OCCASIONS)[number];

/** Le vocabulaire ACCEPTÉ sur un plat: les six moments, plus le legacy. */
export const MEAL_SLOTS = [...EATING_OCCASIONS, "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * LA TAILLE D'UN MOMENT — liste fermée, et facultative.
 *
 * ── CE QUI ÉTAIT LÀ AVANT, ET POURQUOI ÇA A SAUTÉ ─────────────────────────
 * Ce champ portait une HEURE (« 17:00 »). Vérifié le 2026-08-07: elle n'était
 * lue qu'à UN endroit, `rhythmLines`, qui en faisait une annotation de prose
 * (`- afternoon snack (17:00)`). Elle ne gouvernait ni le plafond de plats, ni
 * le choix des créneaux, ni la composition. Une question posée à chaque élève,
 * un champ dans le jsonb, une contrainte de format à valider — pour une
 * parenthèse.
 *
 * La taille, elle, décide de quelque chose: « petit-déjeuner léger, gros
 * dîner » et « trois repas égaux » ne se composent pas pareil, à rythme et
 * objectif identiques. C'est la même case, au même endroit, qui rapporte.
 *
 * ── CE N'EST PAS UNE QUANTITÉ, ET LA DISTINCTION COMPTE ───────────────────
 * `small`/`medium`/`large` est RELATIF et sans unité: c'est une préférence de
 * composition déclarée par l'élève, de la même famille que `cooking_time_min`
 * ou `budget_band`. Les règles de CONTRACT.md sur les quantités portent sur
 * les chiffres d'ÉNERGIE tirés de ce qui a été mangé (analyse de repas,
 * photos) — un autre couloir, et rien ici n'y touche.
 */
export const MEAL_SIZES = ["small", "medium", "large"] as const;
export type MealSize = (typeof MEAL_SIZES)[number];

/**
 * UN MOMENT DE LA JOURNÉE DE CET ÉLÈVE, avec sa taille si elle a été donnée.
 *
 * La taille est FACULTATIVE et le reste: « je grignote l'après-midi » est une
 * information utile sans savoir si c'est gros ou petit. Exiger la taille ferait
 * inventer une précision que l'élève n'a pas — et une précision inventée, le
 * moteur la traite comme une contrainte.
 */
/**
 * LES BORNES D'UN BUDGET, ET LEUR AUTORITÉ EST ICI.
 *
 * ── POURQUOI UN PLAFOND ───────────────────────────────────────────────────
 * Il ne juge le train de vie de personne. Il attrape le zéro de trop — « 5000 »
 * tapé pour « 500 » — avant qu'il ne parte au modèle comme une consigne, où il
 * ne produit pas une erreur mais un plan au homard. Une borne haute qu'on peut
 * atteindre légitimement serait un refus injuste; celle-ci ne l'est pas.
 *
 * ── ET POURQUOI ELLE EST RECOPIÉE CÔTÉ NAVIGATEUR ────────────────────────
 * Le navigateur et Deno ne partagent aucun module dans ce dépôt.
 * `frontend/src/keel/api/onboarding.ts` porte donc la même borne, avec un
 * commentaire qui désigne CE fichier comme autorité. La copie qui compte est
 * celle-ci: c'est elle qui décide de ce qui entre dans le prompt, et un client
 * plus permissif ne peut rien faire passer.
 */
export const BUDGET_MAX = 5000;

/**
 * LE MONTANT UTILISABLE, ou `null` — jamais une valeur de repli.
 *
 * ⚠️ `Number(null)` VAUT 0 ET EST FINI. Un test `!= null` sur la valeur brute
 * laisserait donc « budget: 0 » descendre dans le prompt comme une consigne, et
 * le dépôt a déjà payé exactement ce piège sur une taille pré-remplie à 0.
 */
export function usableBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > BUDGET_MAX) return null;
  return n;
}

export interface EatingOccasionSlot {
  slot: EatingOccasion;
  /** « large », ou `null` quand l'élève n'a rien dit. */
  size: MealSize | null;
}

/**
 * UN MOMENT OÙ L'ÉLÈVE NE MANGE PAS ICI — cantine, restaurant, absent.
 *
 * ── CE QUE ÇA VEUT DIRE, ET CE QUE ÇA NE VEUT PAS DIRE ────────────────────
 * « Je ne mange pas ici » : aucun plat composé, rien dans la liste de courses,
 * aucune portion. Ce n'est PAS « je mange mais je gère moi-même » — un moment
 * écarté sort complètement de la composition.
 *
 * ── PAR JOUR DE SEMAINE, ET C'EST SANS AMBIGUÏTÉ ──────────────────────────
 * Une fenêtre de plan fait AU PLUS sept jours (`MAX_WINDOW_DAYS`, et la base
 * l'impose: `duration_days between 1 and 7`). Chaque jour de semaine y apparaît
 * donc au plus une fois, et « ce mardi » et « les mardis » désignent la même
 * case. C'est ce qui rend cette clé lisible à la fois comme un choix ponctuel
 * dans la grille et comme une habitude d'une génération à l'autre.
 *
 * `slots` VIDE VAUT LA JOURNÉE ENTIÈRE. C'est la forme que FF-002 avait posée
 * pour l'absence récurrente, et la grille du constructeur écrit dans la même
 * clé: deux mécanismes pour « je ne mange pas ici » divergeraient, et c'est
 * celui qu'on regarde le moins qui garderait l'ancien état.
 */
export interface AwayDay {
  /** `mon`…`sun`. */
  day: string;
  /** Les moments écartés. Vide = toute la journée. */
  slots: EatingOccasion[];
}

/**
 * Les absences lues depuis `practical_constraints.away_days`.
 *
 * MÊME POSTURE QUE `parseEatingRhythm`: ce qui n'est pas reconnu est écarté,
 * jamais deviné. Un jeton de jour inconnu fait tomber SON entrée et garde les
 * autres — une absence illisible ne doit pas faire disparaître les absences
 * lisibles, sinon un plan compose un repas que l'élève a dit ne pas prendre.
 */
export function parseAwayDays(raw: unknown): AwayDay[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<string, Set<EatingOccasion>>();
  const wholeDay = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const day = String(e.day ?? "").trim().toLowerCase();
    if (!DAY_TOKENS.includes(day)) continue;
    // ── « AUCUN CRÉNEAU DEMANDÉ » ET « AUCUN CRÉNEAU LISIBLE » NE SONT PAS
    //    LA MÊME CHOSE ────────────────────────────────────────────────────
    // Sans clé `slots`, ou avec une liste vide, l'élève dit « toute la
    // journée ». Avec une liste dont RIEN n'est reconnu, il a nommé des
    // moments et on ne sait pas lesquels — traiter ça comme une journée
    // entière transformerait une faute de frappe en absence complète, et
    // supprimerait des repas que personne n'a demandé de supprimer.
    const askedSlots = Array.isArray(e.slots) && e.slots.length > 0;
    const slots = askedSlots
      ? (e.slots as unknown[])
        .map((s) => String(s ?? "").trim().toLowerCase())
        .filter((s): s is EatingOccasion =>
          (EATING_OCCASIONS as readonly string[]).includes(s)
        )
      : [];
    if (askedSlots && slots.length === 0) continue;
    if (!askedSlots) {
      wholeDay.add(day);
      byDay.delete(day);
      continue;
    }
    if (wholeDay.has(day)) continue;
    const set = byDay.get(day) ?? new Set<EatingOccasion>();
    slots.forEach((s) => set.add(s));
    byDay.set(day, set);
  }
  const out: AwayDay[] = [];
  for (const day of DAY_TOKENS) {
    if (wholeDay.has(day)) out.push({ day, slots: [] });
    else if (byDay.has(day)) {
      out.push({
        day,
        slots: EATING_OCCASIONS.filter((s) => byDay.get(day)!.has(s)),
      });
    }
  }
  return out;
}

/** Ce moment-là, ce jour-là, est-il écarté ? */
export function isAway(
  away: readonly AwayDay[],
  day: string | null,
  slot: string | null,
): boolean {
  if (!day) return false;
  const row = away.find((a) => a.day === day);
  if (!row) return false;
  // Journée entière: le créneau ne compte pas, et un plat SANS créneau nommé
  // tombe aussi — c'est bien un repas de ce jour-là.
  if (row.slots.length === 0) return true;
  if (!slot) return false;
  return (row.slots as readonly string[]).includes(slot);
}

/**
 * Le rythme par défaut, quand l'élève n'a rien déclaré.
 *
 * C'est EXACTEMENT ce que le moteur imposait à tout le monde avant d'avoir la
 * question. Le garder comme repli est ce qui rend ce chantier additif: un élève
 * qui ne remplit rien reçoit la même semaine qu'hier.
 */
export const DEFAULT_EATING_RHYTHM: readonly EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

/**
 * Le rythme lu depuis `student_goals.practical_constraints.eating_rhythm`.
 *
 * DÉFENSIF DANS UNE SEULE DIRECTION: ce qui n'est pas reconnu est laissé de
 * côté, jamais deviné. Un jeton inconnu deviendrait un moment que le rendu ne
 * sait pas nommer, et une taille mal formée deviendrait une contrainte fausse.
 * Un rythme entièrement illisible rend `[]`, et l'appelant retombe sur le
 * défaut — jamais sur une journée vide.
 *
 * DEUX FORMES D'ENTRÉE, ET C'EST DÉLIBÉRÉ. `{"slot":"lunch","size":"large"}`
 * est ce qu'écrit la carte; `"lunch"` tout court est ce qu'écrivent les jsonb
 * posés à la main (fixtures, seeds). La migration qui a créé cette clé a
 * renoncé au CHECK de forme en écrivant que « le lecteur sait déjà réparer » —
 * il ne réparait pas, il JETAIT, et le coût était invisible parce que le repli
 * ressemble à une réponse: la fixture d'un élève déclaré SANS petit-déjeuner
 * (`["lunch","dinner"]`) rendait `[]`, retombait sur le défaut, et servait un
 * petit-déjeuner. Toute la flotte QA validait le défaut en croyant tester trois
 * rythmes distincts. La chaîne nue vaut donc le moment SANS taille — c'est la
 * seule lecture possible, il n'y a rien à deviner.
 *
 * L'ANCIENNE CLÉ `at` EST IGNORÉE, PAS MIGRÉE. Les lignes écrites avant le
 * 2026-08-07 portent une heure; elle ne servait qu'à une parenthèse de prose
 * (voir `MEAL_SIZES`). La lire pour en déduire une taille serait deviner —
 * « 20:00 » ne dit pas si le dîner est gros. Le moment est gardé, l'heure
 * tombe, et l'élève reverra une carte où il peut dire la taille s'il veut.
 *
 * L'ORDRE EST CELUI DE LA JOURNÉE, pas celui du tableau reçu. On lit sa journée
 * du réveil au coucher; laisser l'ordre de saisie décider ferait lire un dîner
 * avant un petit-déjeuner.
 */
export function parseEatingRhythm(raw: unknown): EatingOccasionSlot[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, MealSize | null>();
  for (const entry of raw) {
    // La chaîne nue: un moment pris, sans taille. Traitée AVANT le rejet des
    // non-objets, qui la mangeait en silence.
    if (typeof entry === "string") {
      const slot = entry.trim().toLowerCase();
      if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
      // Conditionnel: une chaîne nue ne porte pas de taille, et ne doit pas
      // effacer celle qu'une entrée objet du même tableau aurait déjà posée
      // pour ce moment.
      if (!bySlot.has(slot as EatingOccasion)) {
        bySlot.set(slot as EatingOccasion, null);
      }
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    const size = String(e.size ?? "").trim().toLowerCase();
    // La liste est FERMÉE. Une taille qu'on ne sait pas lire n'annule pas le
    // moment: « je grignote l'après-midi » reste vrai sans elle.
    const valid = (MEAL_SIZES as readonly string[]).includes(size)
      ? (size as MealSize)
      : null;
    bySlot.set(slot as EatingOccasion, valid);
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    size: bySlot.get(s) ?? null,
  }));
}

/**
 * Les rayons. LISTE FERMÉE (R6): chaque valeur est rendue par une branche
 * nommée côté app et côté PDF. Un rayon inventé par le modèle est une ligne
 * que le rendu ne sait pas placer — donc une ligne que l'élève ne verra pas,
 * en silence, au supermarché.
 */
export const SHOPPING_AISLES = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "pantry",
  "frozen",
  "other",
] as const;
export type ShoppingAisle = (typeof SHOPPING_AISLES)[number];

export interface PantryItem {
  term: string;
  quantity?: string | null;
}

export interface DishIngredient {
  term: string;
  /**
   * LA QUANTITÉ EN PROSE, destinée à l'humain. Inchangée par FF-038: c'est
   * elle que l'élève lit sur sa liste de courses, et `ENERGY_UNIT_RE` reste
   * armé dessus. Les trois champs structurés en dessous la DOUBLENT, ils ne la
   * remplacent pas.
   */
  quantity: string | null;
  /**
   * VRAI seulement si le terme a été retrouvé dans le garde-manger de l'élève.
   * Calculé ici, jamais recopié du modèle (voir garantie 2 de l'en-tête).
   */
  in_pantry: boolean;
  /**
   * FF-038 — LA MÊME QUANTITÉ, STRUCTURÉE.
   *
   * `null` quand le modèle ne l'a pas rendue ou l'a rendue illisible, et
   * COMPTÉ dans les issues. Jamais défaut-é: un `state` deviné « raw » sur du
   * riz fausse le calcul d'un facteur 2,6, et toujours dans le sens qui
   * gonfle.
   */
  amount: number | null;
  unit: CompositionUnit | null;
  state: CompositionState | null;
  /**
   * LES GRAMMES CRUS, RECALCULÉS PAR CE PARSEUR.
   *
   * Jamais lu d'un champ du modèle, même s'il en rendait un. Précédent
   * `in_pantry`, garantie 2 de l'en-tête: l'arithmétique du modèle n'est pas
   * une preuve. Un modèle qui rend « grams: 400 » sur « 2 filets » a écrit un
   * nombre, pas une mesure.
   *
   * `null` quand l'ingrédient n'est pas résolu par le référentiel, quand la
   * quantité n'est pas convertible, ou quand le référentiel n'a pas pu être
   * chargé. Les trois cas sont comptés séparément.
   */
  gramsRaw: number | null;
}

/**
 * LOT 2 — LA NATURE DU GESTE DU JOUR J, EN QUATRE JETONS ET PAS UN DE PLUS.
 *
 * ⛔ LISTE FERMÉE, DÉCLARÉE PAR LE MODÈLE, JAMAIS DEVINÉE. Le seul marqueur qui
 * existait avant ce lot était la prose de `method` (« reheat a portion, add the
 * salad ») et un matcher là-dessus se tromperait au premier plan français, au
 * premier « do not reheat », au premier « assemble the reheated chicken ». Même
 * patron que `for_member_id` et `preparation_id`: inventé par le modèle, vérifié
 * contre cette liste, JETÉ et COMPTÉ quand il n'y est pas.
 *
 * Les quatre jetons disent quatre gestes qu'un cuisinier distingue vraiment:
 *   · `none`        — rien à faire, l'assiette est prête (un fruit, un yaourt).
 *   · `reheat_only` — sortir la boîte et réchauffer, et RIEN d'autre.
 *   · `assemble`    — monter l'assiette avec du déjà-cuisiné, sans cuisson.
 *   · `cook_fresh`  — une vraie cuisson du jour (des œufs brouillés, des pâtes).
 */
export const SAME_DAY_KINDS = [
  "none",
  "reheat_only",
  "assemble",
  "cook_fresh",
] as const;

export type SameDayKind = typeof SAME_DAY_KINDS[number];

/**
 * CE QU'IL Y A À FAIRE LE JOUR MÊME POUR AVOIR CE PLAT DANS L'ASSIETTE.
 *
 * ⚠️ `minutes` EST UN TEMPS DE PLAT, ET C'EST TOUT CE QU'IL EST. Il ne se
 * confond avec aucun des deux temps qui existaient déjà, et la distinction est
 * la raison d'être du champ:
 *
 *   · `preparations[].activeMinutes` / `.totalMinutes` = le temps d'une CUISSON
 *     en lot, dans une session de cuisine, un autre jour.
 *   · `cooking_sessions[].totalMinutes` = le temps de la SESSION au mur.
 *   · `sameDay.minutes` = le temps du GESTE DU JOUR J, devant cette assiette-là.
 *
 * Le fait mesuré qui justifie le champ: AUCUN temps n'existait au niveau du
 * plat. Un assemblage frais — la moitié des petits-déjeuners d'un plan — n'avait
 * de durée nulle part, et un plat de lot n'annonçait que la durée de sa cuisson,
 * c'est-à-dire cinquante minutes pour « réchauffe une portion ».
 *
 * `null` quand le modèle n'a pas rendu de nombre lisible. PAS de zéro par
 * défaut: « 0 min » se lit « c'est instantané », ce qui est une affirmation, et
 * le geste reste dit par `kind`. Le cas est compté (`minutes_missing`).
 */
export interface DishSameDay {
  kind: SameDayKind;
  minutes: number | null;
}

/**
 * LE PLAFOND DU GESTE DU JOUR, en minutes.
 *
 * Une borne de vraisemblance, pas une règle de produit: au-delà, ce n'est plus
 * le geste du soir mais une session de cuisine mal rangée, et l'écran
 * annoncerait « à assembler — 240 min ». On écrête plutôt que de jeter — le
 * jeton, lui, reste juste.
 */
export const SAME_DAY_MAX_MINUTES = 120;

export interface GeneratedDish {
  title: string;
  slot: MealSlot | null;
  /** Jour nommé quand le scope en couvre plusieurs. Jetons `mon`..`sun`. */
  day: string | null;
  ingredients: DishIngredient[];
  /** Comment le faire, en prose. Jamais une liste d'étapes numérotées imposée. */
  method: string;
  /** Pourquoi CE plat pour CET élève, une phrase. */
  why: string;
  /** Informatif — voir l'en-tête. Jamais exigé, jamais vérifié par un CHECK. */
  honours_belief_keys: string[];
  /**
   * Ce que ce plat PRÉLÈVE sur des préparations déjà faites.
   *
   * Vide = le plat se fait de zéro (un assemblage sans cuisson, une omelette).
   * Non vide = la cuisson a eu lieu ailleurs, et `ingredients` ne porte plus
   * que ce qu'on AJOUTE au moment de manger — la salade, le pain, la sauce.
   */
  uses: Array<{ preparationId: string; servings: number }>;
  /**
   * LOT C — LA BOUCHE À QUI CE PLAT EST DÉDIÉ. `null` = le plat de la table.
   *
   * ⛔ `null` EST LE CAS NOMINAL, et il ne veut PAS dire « on ne sait pas ». La
   * quasi-totalité des plats d'un plan sont le plat commun; seul le plat DÉDIÉ,
   * réclamé par la consigne aux barreaux ② et ③, porte un identifiant.
   *
   * ⚠️ IL EST POSÉ À LA CRÉATION, jamais dérivé après coup. Le modèle le déclare
   * (`for_member_id`), le parseur le valide contre la liste fermée des bouches
   * qui reçoivent un plat (`MergedEater.dishBearerIds`), et un id inconnu est
   * JETÉ et compté. Aucune lecture de titre n'intervient nulle part — « jamais
   * de matcher maison ».
   *
   * ⚠️ TOUJOURS `null` SUR LA LANE INDIVIDUELLE: elle passe `merge: null`, donc
   * la liste fermée est vide, donc rien n'est attribuable. Une personne seule
   * n'a de toute façon pas de « plat dédié » — tous ses plats sont les siens.
   */
  memberId: string | null;
  /**
   * LOT 2 — CE QU'ON FAIT LE JOUR MÊME, DIT PLUTÔT QUE DEVINÉ.
   *
   * `null` = le modèle ne l'a pas déclaré, ou l'a déclaré illisible. Ce n'est PAS
   * « rien à faire »: `none` dit ça, et il le dit exprès. La différence entre
   * « il n'y a rien à préparer » et « personne ne l'a écrit » est exactement ce
   * que le compteur `same_day` existe pour mesurer — sans elle, un modèle qui
   * ignore la consigne rendrait un lot désarmé indiscernable d'un lot qui
   * marche.
   *
   * ⚠️ Un `same_day` refusé NE REJETTE JAMAIS LE PLAT. Posture `for_member_id`:
   * le commentaire du jour est une lecture EN PLUS; un plat sans lui reste un
   * plat qui se cuisine et se mange.
   */
  sameDay: DishSameDay | null;
}

export interface ShoppingItem {
  term: string;
  quantity: string | null;
  aisle: ShoppingAisle;
}

/**
 * UNE PRÉPARATION — ce qu'on cuisine, par opposition à ce qu'on mange.
 *
 * ── POURQUOI LE LOT NE POUVAIT PAS RESTER UN ATTRIBUT DU PLAT ─────────────
 * `DishBatch` disait « ce plat-ci se cuisine une fois pour trois jours ». C'est
 * vrai et c'est insuffisant: ça oblige les trois jours à manger LE MÊME plat.
 * Résultat mesuré, un bowl poulet-riz-brocoli identique lundi, mardi, mercredi
 * et jeudi — techniquement du batch cooking, humainement une punition.
 *
 * Or ce qu'on cuisine une fois, ce n'est pas un plat: c'est une PRÉPARATION.
 * 1,2 kg de cuisses rôties devient un bowl le lundi, un wrap le mardi, une base
 * de curry le jeudi. Une seule cuisson, trois repas qui ne se ressemblent pas —
 * c'est exactement ce que les gens cherchent quand ils veulent « réduire le
 * temps de cuisine », et ce n'est pas « manger la même assiette trois fois ».
 *
 * La préparation devient donc un objet à part, que plusieurs plats CONSOMMENT.
 */
export interface MealPreparation {
  /** Référence locale au plan, citée par les plats et les sessions. */
  id: string;
  title: string;
  /**
   * Combien de portions sortent de cette cuisson.
   *
   * `> 1` PARTOUT, SAUF SOUS FUSION AUX BARREAUX ② ET ③, où `1` est le cas
   * NOMINAL: la consigne y demande un plat pour une seule bouche (voir la garde
   * dans `parseGeneratedMeal`). Un écran qui déduit « c'est un lot » de
   * l'existence d'une préparation doit donc lire ce nombre, pas le supposer.
   */
  servingsMade: number;
  /** Les ingrédients de la PRÉPARATION, pour la totalité du lot. */
  ingredients: DishIngredient[];
  /** Comment on la fait. La recette vit ici, plus dans chaque plat. */
  method: string;
  /**
   * LE TEMPS, EN DEUX NOMBRES QUI NE DISENT PAS LA MÊME CHOSE.
   *
   * `activeMinutes` = les mains dessus. `totalMinutes` = du début à la fin,
   * attente comprise. Un rôti fait 10 actives et 50 totales, et cet écart EST la
   * raison pour laquelle le batch marche: le temps de four est libre pour autre
   * chose. N'en garder qu'un rendrait l'un des deux plans impossible à juger —
   * « 50 minutes » ferait renoncer quelqu'un qui a dix minutes devant lui.
   *
   * `null` quand le modèle n'a rien rendu d'exploitable: pas de zéro par
   * défaut, qui se lirait « c'est instantané ».
   */
  activeMinutes: number | null;
  totalMinutes: number | null;
  /** Jour de cuisson, quand une session le fixe. */
  cookOn: string | null;
}

/**
 * UNE SESSION DE CUISINE — le moment où l'on cuisine, et son déroulé.
 *
 * Le plan disait QUOI manger et jamais QUAND cuisiner: « make the whole batch
 * once » apparaissait sur quatre jours sans qu'aucun ne soit le jour de la
 * casserole.
 *
 * Le DÉROULÉ est le champ qui compte, et c'est le seul qu'un plat ne peut pas
 * porter: l'ordre des gestes se joue ENTRE les préparations — le riz pendant
 * que le four tourne. C'est ce qu'on lit le dimanche soir, et c'est ce qui rend
 * une semaine exécutable pour quelqu'un qui travaille.
 */
export interface CookingSession {
  /** Jeton `mon`..`sun`. */
  day: string;
  /** Les préparations faites pendant cette session, par `id`. */
  preparationIds: string[];
  /** L'ordre réel des gestes, en prose. */
  runThrough: string;
  /**
   * LA DURÉE DE LA SESSION, au mur — PAS la somme de ses préparations.
   *
   * Les cuissons se chevauchent: le riz pendant que le four tourne. Additionner
   * transformerait un dimanche confortable de quatre-vingt-dix minutes en une
   * corvée de quatre heures que personne ne commence. C'est le modèle qui la
   * donne, et on ne la recalcule pas — la recalculer serait exactement faire
   * cette somme.
   */
  totalMinutes: number | null;
}

export interface GeneratedMeal {
  dishes: GeneratedDish[];
  /** Ce qui se cuisine, par opposition à ce qui se mange. */
  preparations: MealPreparation[];
  /** Quand on cuisine, et dans quel ordre. */
  cooking_sessions: CookingSession[];
  shopping_list: ShoppingItem[];
  /** Motifs numériques qui ont mordu. Non vide = le prompt a dérivé. */
  rejected_numeric: string[];
  /** Rayons hors liste close. */
  rejected_aisles: string[];
  /**
   * FF-037 — LES TITRES DES REPAS PRINCIPAUX SANS ANCRE PROTÉIQUE.
   *
   * Un CONSTAT, pas une décision: les plats concernés sont dans `dishes`, et
   * ils y restent (pass-with-issue, FF-037 R5). C'est l'appelant qui décide
   * d'une relance — ce module est pur et ne peut rappeler aucun modèle. Même
   * partage que `findDoctrineViolations` (constate) et sa lane (relance).
   *
   * Vide quand le verrou de sortie a mordu: relancer pour une ancre alors que
   * la semaine entière est vidée pour un allergène serait une relance qui
   * répare la mauvaise chose.
   */
  protein_anchor_missing: string[];
  /**
   * C2 ④ — LES CASES DE LA FENÊTRE QUE PERSONNE NE REMPLIT.
   *
   * Un CONSTAT, comme `protein_anchor_missing`: le plan est écrit tel quel, et
   * rien ici ne rebouche la case — choisir quoi y mettre est une décision de
   * produit que personne n'a prise. Ce que ça change, c'est que « ce plat a été
   * rejeté » et « il n'y a plus aucun petit-déjeuner cette semaine » cessent de
   * laisser la même trace.
   *
   * Vide quand le verrou de sortie a mordu, pour la même raison que les plats.
   */
  empty_slots: MealSlotCase[];
  /**
   * LOT 2 — LE COMPTEUR DU COMMENTAIRE DU JOUR J.
   *
   * ⛔ SANS LUI, UN LOT DÉSARMÉ RESSEMBLE TRAIT POUR TRAIT À UN LOT QUI MARCHE.
   * `same_day` est DÉCLARÉ PAR LE MODÈLE: on ne peut pas savoir d'avance à
   * quelle fréquence il le remplit, seulement le mesurer. Un modèle qui
   * l'ignorerait rendrait `sameDay: null` partout, l'écran n'afficherait aucun
   * bandeau, et le produit serait exactement celui d'avant — sans qu'aucun test
   * ne puisse le dire. Même arbitrage, mot pour mot, que `dish_owners`.
   *
   *   · `dishes`          — les plats GARDÉS du plan. Le dénominateur.
   *   · `declared`        — ceux qui portent un `sameDay` valide.
   *   · `invalid`         — ceux qui portaient un `same_day` que le parseur a
   *                         refusé (jeton hors liste, ou objet illisible).
   *   · `minutes_missing` — ceux dont le jeton est bon et le nombre non lisible.
   *
   * `declared + invalid` ne fait PAS forcément `dishes`: un plat sans clé
   * `same_day` du tout n'est ni l'un ni l'autre, et c'est cet écart-là qu'on
   * veut voir au premier run réel.
   *
   * ⚠️ LES QUATRE NOMBRES SONT COMPTÉS SUR LA MÊME POPULATION — les plats
   * finalement gardés. Un plat évincé par le plafond ne laisse de trace dans
   * AUCUN des quatre; il en laisse une, nommée, dans `issues`. Un compteur dont
   * le numérateur et le dénominateur ne comptent pas les mêmes lignes est un
   * compteur qui ment, et ce dépôt l'a déjà payé (`withheld`/`over_cap`).
   */
  same_day_counts: {
    dishes: number;
    declared: number;
    invalid: number;
    minutes_missing: number;
  };
  /**
   * LOT 3C — LE COMPTEUR DE L'ATTRIBUTION, ET IL MANQUAIT SA MOITIÉ.
   *
   * ⛔ LE DÉFAUT QUE CES NOMBRES FERMENT A COÛTÉ UN DIAGNOSTIC ENTIER, ET IL A
   * UNE DATE. `generated_from.household.dish_owners` ne portait que `{asked,
   * attributed}`. Le 2026-08-17, `attributed: 0` a été lu « le modèle n'écrit
   * jamais la clé » — et l'archive `llm_raw_response_events` disait autre chose:
   * sur douze générations de foyer, deux portaient bien `for_member_id`, dont
   * une sur une bouche à qui la consigne ne promettait aucun plat, refusée par
   * le parseur juste en dessous. « Jamais déclaré » et « déclaré puis refusé »
   * rendaient le MÊME zéro, et ils appellent des corrections opposées: resserrer
   * la consigne d'un côté, corriger la liste fermée de l'autre.
   *
   *   · `dishes`     — les plats GARDÉS. Le dénominateur.
   *   · `declared`   — ceux où le modèle a ÉCRIT un `for_member_id` non vide,
   *                    avant toute validation.
   *   · `attributed` — ceux dont l'id a passé les deux portes.
   *   · `refused`    — ceux dont l'id a été rejeté (consigne muette, ou bouche
   *                    hors de la liste fermée).
   *
   * ⚠️ LES QUATRE SE COMPTENT INDÉPENDAMMENT, et `refused` n'est PAS dérivé de
   * `declared - attributed`. C'est la cicatrice `withheld`/`over_cap` des voix:
   * deux nombres du même objet, l'un dérivé de l'autre, se sont trouvés gonflé
   * et dégonflé en sens inverses sans que rien n'échoue. Ici l'égalité
   * `declared === attributed + refused` est une PROPRIÉTÉ qu'un test vérifie,
   * pas une définition qui la rend invérifiable.
   *
   * ⚠️ MÊME POPULATION QUE `same_day_counts` — les plats finalement gardés. Un
   * plat évincé par le plafond ne compte dans aucun des quatre; il laisse une
   * `issue` nommée.
   */
  dish_owner_counts: {
    dishes: number;
    declared: number;
    attributed: number;
    refused: number;
  };
  issues: string[];
  lock: OutputLockResult;
}

/**
 * ── POURQUOI CETTE VERSION BOUGE (FF-030, volet élève) ────────────────────
 * Elle est écrite sur chaque ligne `student_generated_meals.generated_from`, et
 * c'est le seul moyen de dire d'un plan s'il a été composé AVANT ou APRÈS que
 * le modèle connaisse les contraintes dures et le corps de l'élève. Sans
 * bascule, les deux populations se mélangent dans la même colonne et la mesure
 * du §10 de la fiche (« la part de `empty_meal` médicaux a-t-elle baissé ? »)
 * devient impossible à faire après coup.
 *
 * ── POURQUOI ELLE BOUGE ENCORE (FF-037) ──────────────────────────────────
 * La consigne gagne une section: chaque repas principal est bâti autour d'un
 * aliment protéique. Le §10 de la fiche compare la part de plats principaux
 * porteurs d'une ancre AVANT et APRÈS — et cette comparaison n'est faisable que
 * si la colonne sait séparer les deux populations. Bumper est donc la moitié
 * mesurable du lot, pas une formalité.
 *
 * ── ET ENCORE (FF-038, étage B) ──────────────────────────────────────────
 * Le contrat de sortie gagne `amount` / `unit` / `state` sur chaque
 * ingrédient. Le §10 de FF-038 demande de surveiller `rejected_numeric` après
 * ce bump — un contrat qui gagne trois champs NUMÉRIQUES est exactement le
 * genre de changement qui pousse un modèle à écrire des chiffres ailleurs — et
 * la part d'ingrédients qui arrivent sans quantité structurée. Ni l'une ni
 * l'autre n'est lisible si les deux populations se mélangent dans la colonne.
 */
// ── UN SEUL BUMP POUR FF-051 ET FF-052 ────────────────────────────────────
// Les apports fixes et les propriétés de jour touchent tous deux la consigne.
// Deux bumps successifs invalideraient deux fois le cache et rendraient
// illisible toute comparaison avant/après entre les deux lots — c'est pour ça
// que les propriétés de jour ont été faites EN DERNIER.
//
// ── v8 (2026-08-11) — `health` A UNE DIRECTION À LUI ──────────────────────
// Le brief de portions du foyer appartient à cette lignée (`household_portions
// .ts` écrit en anglais POUR ce prompt). `SERVING_DIRECTION.health` rendait la
// chaîne de `maintenance`: la consigne servie change, donc la version bouge —
// sans quoi le cache continuerait de rendre l'ancienne assiette.
//
// ⚠️ CETTE VERSION NE COUVRE QUE LE TRONC PARTAGÉ. Depuis le 2026-08-12, la
// lane FOYER a son propre numéro — `HOUSEHOLD_PROMPT_VERSION`, dans
// `household_meal_generation.ts` — et la clé écrite en base est
// `meal.en.v8…+household.v2_presence`. Ce qui ne touche QUE le foyer (la liste
// d'ids, l'envie, les règles de maison, la présence) se bumpe LÀ-BAS. Ce qui
// touche les deux lanes (brief de portions, propriétés de jour, apports fixes)
// se bumpe ICI. L2 a dû poser cet axe parce que greffer la présence avait
// changé le prompt du foyer SANS que rien ne bouge: deux plans stampés pareil
// portaient des consignes différentes, et rien n'échouait.
//
// ── v9 (2026-08-12) — LE CONTRAT DE COMPOSITION CESSE D'ÊTRE « UN SEUL PLAT »
//
// C'est le bump que v8 annonçait comme dû, et il est arrivé par L4 (le moteur
// de fusion, D6). Jusqu'ici `buildPortionBrief` disait à TOUTE composition de
// foyer, sans condition: « Cook ONE set of preparations for everyone. Do NOT
// propose separate dishes. » L'échelle de fusion a besoin de deux barreaux de
// plus — deux plats dans UNE session, puis deux sessions — donc cette ligne
// devient une VARIABLE (`CookingShape`), et c'est un changement de contrat, pas
// de formulation.
//
// ⚠️ POURQUOI ICI ET PAS SUR L'AXE FOYER. `buildPortionBrief` vit dans
// `household_portions.ts`, que ce fichier-ci définit comme du TRONC (« brief de
// portions, propriétés de jour, apports fixes »). La lane INDIVIDUELLE ne
// l'appelle pas et son prompt ne bouge pas d'un octet — mais elle est stampée
// par cette constante, et c'est le prix nommé d'avance: mieux vaut une
// population individuelle qui change de numéro sans changer de consigne qu'un
// foyer où deux consignes portent le même numéro. C'est exactement ce que L2 a
// mesuré et ce que le second axe existe pour éviter.
//
// UNE COMPOSITION ORDINAIRE REND LA MÊME CONSIGNE, À L'OCTET PRÈS: `one_dish`
// rend la ligne d'avant, mot pour mot, et un test le tient.
//
// ── CE QUI N'A PAS BUMPÉ ICI, ET POURQUOI (2026-08-12, aval de L4) ────────
// Le budget de plats d'une FUSION compte désormais la bouche reprise
// (`dishBudgetFor`), et le parseur accepte la préparation d'UNE portion que les
// barreaux ② et ③ demandent. Le code changé vit dans ce fichier — donc dans le
// tronc — et pourtant la version du tronc NE BOUGE PAS. La règle n'est pas « où
// vit le code », c'est « quelle population voit une consigne différente »:
//
//   · `merge: null` (lane individuelle, ET composition de foyer ordinaire) rend
//     EXACTEMENT le plafond d'avant, la même phrase, le même budget de
//     sessions. Deux tests le tiennent, dont un qui compare le nombre annoncé
//     au nombre appliqué.
//   · seule une FUSION voit la ligne « at most N dishes » changer de nombre, et
//     une fusion n'existe que sur la lane foyer.
//
// Le bump est donc allé sur `HOUSEHOLD_PROMPT_VERSION` (v3 → v4), qui a
// exactement la portée du changement. Bumper ici aurait re-stampé toute la
// population individuelle pour un changement qu'elle ne voit jamais — c'est
// précisément ce que le second axe existe pour éviter, et le prix que v9 a payé
// une fois est un prix qu'on ne repaie pas sans raison.
//
// ── C8 ③ · L'ORDRE DE SACRIFICE A CHANGÉ LA LANE INDIVIDUELLE, ET LA
//           VERSION NE BOUGE TOUJOURS PAS — CE N'EST PAS LE MÊME CAS QUE v4
//
// ⚠️ LE FAIT, MESURÉ LE 2026-08-12 sur le MÊME flot brut, `merge: null`,
// plafond 9:
//   · avant C7 ②, le parseur jetait `dishes[10,12,14,16]` et rendait
//     `empty_slots: sat/dinner, sun/breakfast, sun/lunch, sun/dinner`;
//   · depuis C7 ②, il les GARDE et évince quatre seconds plats de cases déjà
//     servies.
// Hors fusion, `dedicatedCells` est vide — donc aucun rang 1 — mais le rang 0
// (« premier plat d'une case ») existe toujours, et c'est lui qui fait qu'un
// second plat cède la place à un premier. Le changement est FAVORABLE: il
// remplit des cases au lieu de les laisser vides.
//
// ⚠️ ET POURTANT AUCUNE VERSION NE BOUGE, parce que ce cas n'est PAS celui de
// v4. En v4, un NOMBRE ÉCRIT DANS LA CONSIGNE changeait (« at most N dishes »)
// pour une population donnée: le modèle lisait autre chose, donc le cache
// devait tomber. Ici la consigne est byte-identique POUR TOUT LE MONDE — la
// lane individuelle, la composition de foyer ordinaire, la fusion — et c'est le
// CONTRAT DE SORTIE du parseur qui change. Une version de prompt qui bougerait
// sur un prompt identique invaliderait le cache d'une population entière sans
// qu'un seul octet servi ait changé, et le numéro cesserait de vouloir dire ce
// qu'il dit.
//
// ⚠️ LA CONTREPARTIE EST NOMMÉE, ET ELLE EST PAYÉE AILLEURS: deux plans
// stampés `v9` peuvent avoir été écrêtés par deux ordres différents. Le
// précédent invoqué est celui de L3, mot pour mot — « une seconde raison qu'une
// ligne n'apparaisse pas, relisible sur `generated_from`, pas sur la version »:
// chaque éviction est NOMMÉE dans les `issues` archivées (« surplus dish "…"
// (jour/moment) was dropped instead »), donc un plan dit lui-même quel ordre
// l'a écrêté. C'est la lecture par plan, pas par colonne — et c'est ce que ce
// chantier choisit à chaque fois que le prompt n'a pas bougé.
//
// ── v10 (2026-08-17) — LE COMMENTAIRE DU JOUR J (LOT 2 / P2) ──────────────
//
// C'est le tronc, et c'est bien le bon axe: la consigne `WHAT TODAY ACTUALLY
// TAKES` et le champ `same_day` du schéma de sortie sont servis à TOUTES les
// populations — lane individuelle, foyer ordinaire, fusion, secondaire. Il n'y a
// pas ici de « population neuve » étroite comme sur l'axe foyer: tout le monde
// voit une consigne différente, donc le cache de tout le monde doit tomber.
//
// ⚠️ `HOUSEHOLD_PROMPT_VERSION` NE BOUGE PAS, et le test le tient par égalité de
// chaîne: l'enveloppe foyer (`buildHouseholdPromptBlocks`, `buildPortionBrief`)
// ne gagne pas un octet dans ce lot — le champ demandé l'est par le schéma du
// tronc, et il est lu par le parseur partagé.
//
// ⚠️ CE BUMP PAIE AUSSI UN DÉFAUT MESURÉ QUI VOYAGEAIT DANS LE MÊME BLOC: la clé
// `"uses"` était déclarée DEUX FOIS dans `== OUTPUT JSON SCHEMA ==` (une fois
// avant `honours_belief_keys`, une fois après). Un objet JSON à clé répétée est
// légal et la seconde écrase la première — le modèle lisait donc un exemple
// contradictoire sur le champ qui porte toute la jointure des lots. Corrigé ici
// plutôt que dans un lot à part: le bloc change de toute façon, et un second
// bump pour une accolade serait un cache invalidé pour rien.
export const MEAL_PROMPT_VERSION = "meal.en.v10_same_day";

const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Combien de plats, selon le périmètre demandé.
 *
 * R6: chaque valeur de `scope` est lue par une branche NOMMÉE. Le plafond est
 * volontairement bas — une semaine de vingt plats est une semaine qu'on
 * abandonne le mercredi, et la même logique vaut pour une liste de courses
 * qu'on ne finit pas de lire.
 */
/**
 * Combien de vraies sessions de cuisine on s'autorise sur la période.
 *
 * Dérivé du plafond de plats plutôt que posé à côté: les deux bougeraient
 * séparément sinon, et on se retrouverait à demander vingt-et-un plats en cinq
 * sessions ou l'inverse. Un tiers, arrondi — assez pour un plat frais par jour
 * ou deux, pas assez pour tout cuisiner à la volée.
 */
/**
 * Combien de jours un lot cuisiné tient au réfrigérateur, au maximum.
 *
 * Trois, et le même chiffre pour tout. Le prompt est plus fin (riz et produits
 * de la mer: le jour même ou le lendemain); ce seuil-ci est le filet
 * déterministe, et il reste grossier exprès — le raffiner par famille
 * d'aliment demanderait de CLASSER chaque préparation, donc de déduire, sur le
 * seul sujet de ce moteur où une erreur rend malade.
 */
export const MAX_FRIDGE_DAYS = 3;

export function batchSessionBudget(cap: number): number {
  return Math.max(2, Math.round(cap / 3));
}

/**
 * « breakfast, lunch and dinner » — la liste des moments, en anglais lisible.
 *
 * En prose et pas en JSON: cette phrase est une CONSIGNE au modèle (« chaque
 * jour a besoin de ceci »), et une consigne se lit. Le JSON est réservé à ce
 * qu'il doit RENDRE.
 */
export function occasionList(rhythm: readonly EatingOccasionSlot[]): string {
  const names = rhythm.map((o) => OCCASION_PROSE[o.slot]);
  if (names.length === 0) return "breakfast, lunch and dinner";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Les moments, un par ligne, avec leur taille quand elle a été donnée.
 *
 * LA TAILLE EST REPRISE TELLE QUELLE et jamais complétée: « large » quand il
 * l'a dit, rien quand il ne l'a pas dit. Écrire « medium » par défaut sur les
 * moments muets poserait une contrainte que personne n'a exprimée, et le modèle
 * la respecterait — c'est bien le problème. Un moment sans taille est un moment
 * que le modèle compose comme il l'entend.
 *
 * « for them » et pas « large » tout court: sans le possessif, le modèle lit
 * une consigne de portion absolue. C'est la journée de CET élève qu'on décrit,
 * et gros pour lui n'est pas gros dans l'absolu.
 */
function rhythmLines(rhythm: readonly EatingOccasionSlot[]): string {
  return rhythm
    .map((o) =>
      o.size
        ? `- ${OCCASION_PROSE[o.slot]} (${o.size} for them)`
        : `- ${OCCASION_PROSE[o.slot]}`
    )
    .join("\n");
}

/**
 * Le jour, en mots. Même raison que `OCCASION_PROSE`: le modèle lit de
 * l'anglais, et « tue » dans une phrase se lit aussi bien comme un verbe.
 */
const DAY_PROSE: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * EXPORTÉ depuis D14 (2026-08-12), et pour une raison de fond: le bloc de
 * présence du foyer (`household_presence.ts`) nomme les mêmes jours et les
 * mêmes moments dans le même prompt. Une seconde table de prose y dirait
 * « Saturday » ici et « Sat » là, dans deux blocs que le modèle lit à la
 * suite — c'est-à-dire deux jours pour lui.
 */
export function dayProse(day: string): string {
  return DAY_PROSE[day] ?? day;
}

/** Le jeton, en mots. Le modèle lit de l'anglais, pas des slugs. */
export const OCCASION_PROSE: Record<EatingOccasion, string> = {
  breakfast: "breakfast",
  snack_am: "a mid-morning bite",
  lunch: "lunch",
  snack_pm: "an afternoon bite",
  dinner: "dinner",
  before_bed: "something before bed",
};

/**
 * Le plafond de repas COUVERTS.
 *
 * ── IL SUIT LE RYTHME DE L'ÉLÈVE, ET C'EST LE POINT ─────────────────────
 * Le plafond de la semaine valait 21 = 7 jours × 3 repas. Le « × 3 » était
 * l'hypothèse silencieuse que tout le monde mange trois fois: quelqu'un qui
 * mange deux fois recevait un budget d'un tiers trop grand, et quelqu'un qui
 * mange cinq fois voyait ses deux dernières occasions tomber hors plafond —
 * c'est-à-dire disparaître, sans que rien ne le dise.
 *
 * Le plafond est donc la même arithmétique, avec le vrai nombre. Sans rythme
 * déclaré, la fonction rend EXACTEMENT ce qu'elle rendait avant ce chantier —
 * c'est ce qui le rend additif: un élève qui ne remplit rien reçoit la semaine
 * d'hier, au plat près.
 */
export function dishCapFor(
  scope: MealScope,
  rhythm: readonly EatingOccasionSlot[] = [],
  /**
   * COMBIEN DE JOURS ON REMPLIT VRAIMENT — sept par défaut, et rarement sept.
   *
   * La semaine s'arrête DIMANCHE (`daysUntilSunday`): un plan fait le jeudi en
   * couvre quatre. Le plafond doit suivre, sinon il ouvre un budget pour des
   * jours qui n'existent pas — et le modèle, à qui on annonce « au plus 28
   * plats », déborde poliment sur la semaine suivante pour le remplir. C'est
   * exactement le défaut rapporté: un plan du jeudi qui proposait à manger
   * jusqu'au mercredi d'après.
   */
  daysToFill = 7,
): number {
  // ── UNE SEULE SOURCE POUR « COMBIEN DE FOIS ON MANGE » ───────────────────
  // Le repli sans rythme était une paire de nombres écrits à la main (4 et 21)
  // à côté d'un `DEFAULT_EATING_RHYTHM` qui en compte 3. Les deux copies ont
  // divergé exactement comme ce fichier prédit qu'elles divergent: le 2026-08-05
  // le repli `day` est passé de 3 à 4 pendant que le rythme par défaut restait à
  // trois moments, et `buildMealPrompt` s'est mis à DEMANDER trois plats tout en
  // en ACCEPTANT quatre.
  //
  // Il n'y a donc plus de repli chiffré: l'absence de rythme déclaré EST le
  // rythme par défaut, et l'arithmétique est la même pour les deux. Le « × 7 »
  // reste ce qu'il était (21 = 3 × 7, au plat près), donc le chantier du rythme
  // demeure additif pour un élève qui n'a rien rempli.
  //
  // LE « × 7 » BORNE LES REPAS COUVERTS, PAS LES SESSIONS DE CUISINE. Le
  // plafond de la semaine est passé de 8 à 21 parce qu'à 8 une semaine demandée
  // rendait une semaine TROUÉE — lundi dîner, mardi petit-déjeuner et dîner,
  // puis plus rien. « Une semaine de vingt plats est une semaine qu'on abandonne
  // le mercredi » était vrai tant qu'un plat coûtait une session; le BATCH casse
  // cette équivalence, et c'est le prompt qui borne les sessions
  // (`batchSessionBudget`).
  const occasions = rhythm.length > 0 ? rhythm : DEFAULT_EATING_RHYTHM;
  // `switch` et pas un ternaire: c'est lui qui rend le R6 vrai par construction
  // — un scope ajouté sans plafond ne compile pas (« not all code paths return
  // a value »), là où un ternaire lui donnerait silencieusement celui de la
  // semaine.
  const days = Math.max(1, daysToFill);
  switch (scope) {
    case "day":
      return occasions.length;
    case "several_days":
      return occasions.length * days;
  }
}

/**
 * L4/D6 — UNE BOUCHE REPRISE PAR LA FUSION, TELLE QUE LE BUDGET LA VOIT.
 *
 * `null` sur la lane INDIVIDUELLE et sur toute composition de foyer ordinaire;
 * renseigné uniquement par `operation: "merge"`.
 */
export interface MergedEater {
  /** Le barreau décidé par `mergeLadder` (D6). Jamais deviné ici. */
  shape: CookingShape;
  /**
   * COMBIEN DE PLATS PROPRES LA CONSIGNE DE FUSION MET SOUS LES YEUX DU MODÈLE.
   *
   * C'est la liste de `buildMergeBlock`, APRÈS le filtre de fenêtre et APRÈS
   * `MERGE_MATERIAL_CAP` — `mergeMaterialShown()` la rend, et c'est la seule
   * façon correcte de la compter: un budget ouvert sur des plats que le modèle
   * ne voit pas est un budget qu'il remplit avec autre chose.
   */
  ownDishesShown: number;
  /**
   * C6 — COMBIEN DE PLATS DÉDIÉS LA CONSIGNE DE FUSION RÉCLAME.
   *
   * ⚠️ REQUIS, `T`, jamais `T?`. C'est la HUITIÈME fois que ce fichier écrit
   * cette phrase. Depuis C6, `buildMergeBlock` ne demande plus « ADD ONE dish »
   * mais un plat À CHAQUE REPAS de la personne reprise (mesuré: un seul plat
   * pour neuf créneaux, la casserole commune 8 fois sur 9). Le budget qui
   * comptait la seule MATIÈRE laisserait la consigne réclamer neuf plats dans
   * un plafond ouvert pour six — et le parseur jette les DERNIERS, c'est-à-dire
   * le dîner du dimanche du foyer.
   *
   * `0` aux barreaux ① (aucun plat dédié n'est demandé), et le bonus est nul de
   * toute façon.
   */
  dedicatedDishesAsked: number;
  /**
   * C7 ② — LES CASES OÙ LA PERSONNE REPRISE MANGE ICI, jour et moment.
   *
   * ⚠️ REQUIS, `T`, jamais `T?`. C'est la NEUVIÈME fois que ce fichier écrit
   * cette phrase, et ici l'oubli a un coût nommé: `[]` fait retomber TOUT
   * second plat d'une case dans le surplus, donc le plat DÉDIÉ redevient la
   * première chose que le plafond sacrifie — c'est-à-dire exactement le défaut
   * mesuré le 2026-08-12 (la relance a rendu 20 plats, 18 ont été gardés, et
   * les deux tombés étaient le déjeuner ET le dîner du dimanche de la personne
   * reprise).
   *
   * ⚠️ CE SONT SES CASES À ELLE, PAS CELLES DU PLAN: la MÊME liste que le
   * dénominateur du constat de forme (`memberMealCells`, C3 ⑥), et le même
   * nombre que `dedicatedDishesAsked`. Deux listes calculées séparément
   * finiraient par se contredire, et c'est le budget qui perdrait.
   *
   * `[]` aux barreaux ①: aucun plat dédié n'est demandé, donc aucun second
   * plat n'est protégé — et c'est juste, la consigne y dit « Do NOT propose
   * separate dishes ».
   */
  dedicatedCells: readonly { day: string; slot: string }[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C — QUI REÇOIT CES PLATS DÉDIÉS. Les ids EXACTS, ceux du prompt.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE TROU QUE CE CHAMP FERME, MESURÉ LE 2026-08-14. Les clés d'un plat en
   * base sont `title, why, uses, method, slot, day, ingredients, servings_made,
   * preparation_id, id, honours_belief_keys` — AUCUNE attribution. Le seul
   * marqueur qu'un plat dédié est celui de Zoé était le texte libre « for Zoe »
   * dans le TITRE, écrit par le modèle. La vue par personne montrait donc le
   * plat dédié de Zoé dans la semaine de Kid.
   *
   * ⛔ ET ON NE DEVINE PAS DEPUIS LE TITRE. « Jamais de matcher maison » est une
   * cicatrice mesurée de ce dépôt (12 faux positifs sur 12), et ici un matcher
   * attribuerait de travers dès « Chicken for Zoe and Marc », et rien du tout
   * dès que le plan sort en français.
   *
   * ⚠️ ET LE CALCUL NE PEUT PAS TRANCHER NON PLUS. Sur une case dédiée il y a
   * DEUX plats — celui de la table et le sien. Lequel est lequel n'est pas
   * décidable de l'extérieur: c'est le MODÈLE qui vient de composer les deux.
   * D'où un champ qu'il déclare (`for_member_id`), validé contre cette liste
   * fermée — le patron exact de `preparation_id` (inventé par le modèle,
   * vérifié contre `preparations[].id`) et de `member_portions[].member_id`,
   * qui utilise DÉJÀ ces mêmes ids et qui fonctionne en production.
   *
   * ⚠️ REQUIS, `T`, jamais `T?`. C'est la DIXIÈME fois que ce fichier écrit
   * cette phrase. Un `?` ici serait parfaitement silencieux: la liste vide
   * refuse toute attribution, donc le lot serait construit, branché et désarmé
   * — « une ceinture armée sur un coffre vide ».
   *
   * `[]` au barreau ①: aucun plat dédié n'est demandé, donc aucun plat n'est
   * attribuable, et le parseur refuse toute attribution qui arriverait quand
   * même.
   */
  dishBearerIds: readonly string[];
}

/**
 * LE BUDGET DE PLATS SERVI AU MODÈLE — et le SEUL nombre que les deux bouts
 * lisent.
 *
 * ⚠️ IL EXISTE PARCE QUE LE PROMPT ET LE PARSEUR DOIVENT BOUGER ENSEMBLE. C'est
 * le défaut d'origine de ce fichier, écrit deux fois dans `dishCapFor`: annoncer
 * un budget et en appliquer un autre est pire que n'en avoir aucun. Les deux
 * appels passent donc par cette fonction, avec les mêmes entrées.
 *
 * ── POURQUOI `dishCapFor` N'A PAS CHANGÉ DE SIGNATURE ─────────────────────
 * Parce que la lane INDIVIDUELLE ne doit pas bouger d'un plat, et que la
 * meilleure preuve qu'elle n'a pas bougé est que la fonction qui la borne est
 * restée identique, avec ses tests inchangés. Le supplément de fusion est une
 * couche AU-DESSUS, nulle par défaut.
 */
export function dishBudgetFor(args: {
  scope: MealScope;
  rhythm: readonly EatingOccasionSlot[];
  daysToFill: number;
  /**
   * ⚠️ REQUIS, `T | null`, jamais `T?`. C'est la SEPTIÈME fois que ce fichier
   * écrit cette phrase, et il l'a payée les six précédentes. Ici l'oubli est le
   * défaut mesuré du 2026-08-12: le budget resterait celui d'une table sans
   * bouche de plus, le modèle déborderait d'un plat, et le parseur jetterait
   * LE DERNIER de la liste — c'est-à-dire le dîner du dimanche du foyer, pas le
   * plat en trop.
   */
  merge: MergedEater | null;
}): number {
  const base = dishCapFor(args.scope, args.rhythm, args.daysToFill);
  if (args.merge === null) return base;
  return base + mergeDishBonus({
    cooking: args.merge.shape,
    ownDishesShown: args.merge.ownDishesShown,
    // C6 — LE BUDGET SUIT CE QUE LA CONSIGNE RÉCLAME, pas seulement ce qu'elle
    // montre. Voir `mergeDishBonus`.
    dedicatedDishesAsked: args.merge.dedicatedDishesAsked,
    baseCap: base,
  });
}

// ---------------------------------------------------------------------------
// Le garde-manger — la correspondance, déterministe
// ---------------------------------------------------------------------------

/**
 * Le normaliseur du GARDE-MANGER: celui des verrous, plus le dépliage des
 * ligatures.
 *
 * `normalizeForMatch` décompose en NFD et retire les diacritiques, ce qui règle
 * « oignôns » mais PAS « œufs »: `œ` (U+0153) est une ligature, pas une lettre
 * accentuée, et NFD ne la décompose pas. « œufs » et « oeufs » restaient donc
 * deux mots différents.
 *
 * Pourquoi la correction est ICI et pas dans `forbidden_matcher.ts`: ce
 * matcher-ci est un CONFORT (« as-tu déjà ça ? »), pas une ceinture. Élargir la
 * normalisation partagée changerait aussi ce que le verrou MÉDICAL reconnaît,
 * et on ne touche pas à un verrou médical pour faire plaisir à une liste de
 * courses. La couche est donc additive et locale, et le verrou continue de voir
 * exactement ce qu'il voyait.
 */
export function normalizePantryTerm(term: string): string {
  return normalizeForMatch(String(term ?? "").trim())
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

/**
 * L'ingrédient est-il dans le garde-manger de l'élève ?
 *
 * Correspondance TOLÉRANTE, et dans un seul sens: on accepte que « tomates »
 * couvre « tomates cerises », jamais l'inverse. Un élève qui a écrit
 * « tomates » a probablement de quoi faire; un élève qui n'a que des tomates
 * cerises n'a pas de quoi faire une sauce, et lui dire le contraire lui coûte
 * un aller-retour au magasin.
 */
export function isInPantry(
  ingredientTerm: string,
  pantry: readonly PantryItem[],
): boolean {
  const needle = normalizePantryTerm(ingredientTerm);
  if (!needle) return false;
  for (const item of pantry) {
    const have = normalizePantryTerm(String(item?.term ?? ""));
    if (!have) continue;
    if (needle === have) return true;
    // « j'ai des tomates » couvre « tomates cerises ».
    if (needle.includes(have) && have.length >= 3) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Le prompt
// ---------------------------------------------------------------------------

export const MEAL_SYSTEM_PROMPT =
  `You cook for ONE student, inside the method their coach teaches.

Output a single JSON object, nothing else. No prose outside the JSON, no markdown fences.

== THE METHOD COMES FIRST, THE RECIPE IS YOURS ==

Your coach's method is given below. It is not a suggestion: their forbidden practices and the foods they do not put on a plate are hard limits, and you never contradict them.

Inside those limits you are free. Write real food a real person wants to eat. You are not restricted to a catalogue.

== A PORTION IS ONE PERSON'S PLATE ==

You are told how many people are at the table. Every quantity you write is for
THAT many people, for the number of servings the dish actually makes — and for
nothing more.

Measured failure, and it is the one that makes a plan unusable: "2 salmon
fillets, 500 g potatoes" written for ONE person eating ONE dinner. That is three
dinners on a plate. If a quantity only makes sense because the dish is cooked in
a batch, then say so in \`batch\` — do not silently inflate a single plate.

Sanity, before you write a quantity: one adult portion is roughly a palm of
protein, a fist of starch, and vegetables on top. Scale from there. You never
tell the student those figures; you use them so the numbers you DO write are
believable.

${PROTEIN_ANCHOR_PROMPT_LINE}

== THE STRETCH STARTS TODAY ==

You are told what day it is for this student, and the exact days to fill. Use
THOSE days, in that order, and no others.

A plan handed to somebody on Wednesday that starts on Monday is half expired on
delivery — measured, and the first thing a student notices. There is no such
thing as planning a day that has already gone.

== COVER THE WHOLE STRETCH, WITH FEW COOKING SESSIONS ==

When you are asked for several days, cover EVERY day of the stretch and every
meal that matters in it. A plan with Monday dinner and Wednesday dinner and
nothing in between is not a plan — the student did not ask for a partial week,
and holes are read as "the system gave up".

Covering everything does not mean cooking everything. That is what the
preparations below are for.

== WHAT YOU COOK IS NOT WHAT YOU EAT ==

This is the important one, and it is what makes a week both quick and bearable.

Separate PREPARATIONS from DISHES.

  A preparation is what comes out of one cooking session: 1.2 kg of roast
  chicken thighs, a pot of chilli, a tray of roast vegetables, a batch of rice.
  It carries its own ingredients — for the WHOLE batch — and its own method.

  A dish is a meal on a day. It NAMES the preparations it draws on through
  \`uses\`, and its own \`ingredients\` list only what you add at the moment of
  eating: the salad, the bread, the yogurt, the lemon.

Why it matters: one cooking of chicken becomes a rice bowl on Monday, a wrap on
Tuesday and a curry base on Thursday. THREE DIFFERENT MEALS, ONE COOKING. Making
the same student eat the identical plate four days running is technically batch
cooking and humanly a punishment — do not do it.

Rules that follow:
  - anything that needs a pan, a pot or an oven is a PREPARATION making at
    least two servings. Never a dish cooked from scratch twice in a week.
  - assemblies that need no cooking — oats and yogurt, a sandwich, fruit and
    nuts — are plain dishes with no \`uses\`, made fresh, quantities for one
    plate.
  - a dish that draws on a preparation does NOT repeat its recipe. Its method is
    what you do at that meal: "reheat a portion, add the salad and the lemon".
  - vary what you build from the same preparation. Same protein, different meal.

== NAME THE COOKING SESSIONS, AND WRITE THE RUN-THROUGH ==

Give \`cooking_sessions\`: the days on which the student actually cooks, which
preparations get made in each, and the ORDER of the gestures — "oven on for the
tray, rice on while it roasts, chilli simmering next to it, box four portions".

Aim for two or three sessions in a week, not seven. Every preparation belongs to
exactly one session: a preparation nobody cooks is a plan the student cannot
follow.

== NOTHING SITS IN THE FRIDGE FOR A WEEK ==

A cooked batch is eaten within THREE DAYS of the day it was cooked. Cooked on
Thursday means eaten by Sunday, and that is the end of it. Beyond that it is not
a meal plan, it is a plan to throw food away or to get somebody ill.

Cooked rice and cooked seafood are tighter still: same day or the day after.
Rice left sitting is the classic way to make somebody sick, and no amount of
convenience is worth it.

If a batch would have to stretch further, you have three honest ways out: cook a
smaller batch, cook it twice, or say plainly in the method that the surplus goes
in the FREEZER on the cooking day. Never stretch it in silence.

== THE COOKING TIME THEY GAVE YOU IS A CEILING ==

When a session time is stated, the session fits inside it. It is not a target to
approach and overshoot: it is what they actually have that evening, and a
session that does not fit is a session they skip — after which the whole week
falls apart, not just that session.

If everything will not fit, cook LESS in that session and put the rest on
another cooking day. Fewer preparations that happen beat more preparations that
do not.

== NOTHING IS EATEN BEFORE IT IS COOKED ==

A preparation must be cooked ON OR BEFORE the first day that eats from it. If
the only cooking day you have is Sunday, then Thursday, Friday and Saturday
cannot live off a Sunday batch — those days cook for themselves, or they eat
something that needs no batch at all.

This is not a preference. A plan that feeds Thursday from a Sunday session is a
plan that cannot be executed, and the student finds out at lunchtime.

== HOW LONG THINGS TAKE ==

Every preparation carries two numbers, and they are not the same one.
"active_minutes" is time with your hands on it — chopping, stirring, turning.
"total_minutes" is from starting to finished, waiting included. A roast is 10
active and 50 total; that gap is the whole reason batch cooking works, because
the oven time is free for another preparation.

A session's "total_minutes" is the wall clock of the session, NOT the sum of its
preparations: things overlap, and pretending otherwise turns a comfortable
ninety-minute Sunday into a scary four-hour one nobody starts.

Round to the nearest five. These are estimates a cook recognises, not
measurements — but they are the numbers somebody uses to decide whether tonight
is possible, so a wrong one costs a skipped meal.

== WHAT TODAY ACTUALLY TAKES, ON EVERY DISH ==

Every dish carries "same_day": what the student does ON THE DAY THEY EAT IT to
get that plate in front of them, and how long that gesture takes.

  "kind" is one of four, and nothing else exists:
    "none"        - nothing to prepare. Fruit, a yogurt, a plate already made.
    "reheat_only" - take the portion out and heat it, and NOTHING else.
    "assemble"    - build the plate from what is already cooked, no cooking.
    "cook_fresh"  - a real cooking gesture that day: scramble the eggs, boil
                    the pasta, sear the fish.

  "minutes" is how long THAT gesture takes, that day. A whole number.

"minutes" IS NOT THE TIME OF THE COOKING SESSION, and confusing the two is the
failure this field exists to stop. A portion of Sunday's roast, reheated on
Wednesday, is 8 minutes - not the 50 the roast took. Announcing 50 tells
somebody with ten minutes that dinner is out of reach, and they skip it.

Say it on EVERY dish, including the ones where the answer is nothing. "none" and
"cook_fresh" are answers; a missing line is a plate somebody stands in front of
without knowing what to do. If the dish reheats, the word reheat is what they
need to read, so write "reheat_only" and say it again plainly in "method".

== NEVER PUT A NUMBER ON NUTRITION ==

No calories. No macro grams. No percentages of anything nutritional. Not as a target, not as a range, not "roughly". Nobody has measured this student.

Shopping quantities are DIFFERENT and expected: "400 g chicken thighs", "2 onions", "a bunch of parsley". A quantity says how much to buy or use; a target claims a measurement of the person. Put quantities on ingredients, never on the student.

== SAY THE SAME QUANTITY TWICE: ONCE FOR THE COOK, ONCE IN FIGURES ==

Every ingredient carries "quantity" — the phrase a person reads, exactly as you
write it today — AND three plain fields that repeat it:

  "amount": the number.
  "unit":   one of "g", "ml", "unit", "tbsp", "tsp". Nothing else exists. If
            what you meant is a handful, a cup, a bunch or a pinch, leave
            "amount" and "unit" null and keep the phrase in "quantity".
  "state":  "raw" or "cooked" — the weight you just wrote, before or after
            cooking.

"state" is REQUIRED for anything that takes on or loses water in the pan: rice,
pasta, couscous, lentils, dried beans, meat, poultry, fish. A hundred grams of
rice is not the same food before and after it is boiled, and leaving it out
makes the line unusable. It does not matter for oil, nuts, cheese, yogurt or
fruit — say it anyway when you know it.

Never guess. An ingredient whose weight you do not actually know keeps its
phrase and leaves the three fields null. A made-up number is worse than a
missing one.

FATS, NUTS AND SWEETENERS ARE THE ONE EXCEPTION, and they are not a guess.
Oil, butter, ghee, cream, nut butter, tahini, nuts, seeds, honey, syrup and
chocolate ALWAYS carry "amount" and "unit". "A drizzle of olive oil" is a
tablespoon; write 1 and "tbsp". These ingredients are small on the page and
enormous in the pan -- a spoon of oil weighs what a whole plate of vegetables
weighs, and a line left blank there makes the entire dish unreadable. Salt,
pepper and herbs may stay a pinch; oil may not.

== THE STUDENT'S SITUATION IS NOT DECORATION ==

They tell you what their week actually looks like — a wedding on Tuesday, a holiday, a weekend away, a late shift. Cook around it. A meal that assumes an evening they do not have is a meal they will not make.

== THE TWO MODES ==

mode = from_pantry
  Cook with what they ALREADY have. Reach outside their list only for genuine
  staples (salt, pepper, oil, water) or when the dish is impossible otherwise.
  Anything you use that they did not list will be shown to them as something to
  buy, so keep that list short and say why it is needed.

mode = to_shop
  Compose freely, then give the shopping list the dish actually needs.

== OUTPUT JSON SCHEMA ==

{
  "dishes": [
    {
      "title": "...",
      "slot": "breakfast"|"snack_am"|"lunch"|"snack_pm"|"dinner"|"before_bed"|null,
      "day": "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"|null,
      "ingredients": [{ "term": "...", "quantity": "..."|null,
                        "amount": <number>|null,
                        "unit": "g"|"ml"|"unit"|"tbsp"|"tsp"|null,
                        "state": "raw"|"cooked"|null }],
      "method": "how to make it, plainly, in a short paragraph",
      "why": "one sentence: why THIS dish for THIS student this week",
      "uses": [{ "preparation_id": "prep_chicken", "servings": 1 }],
      "same_day": { "kind": "none"|"reheat_only"|"assemble"|"cook_fresh",
                    "minutes": <whole minutes for the day-of gesture> },
      "honours_belief_keys": ["<exact keys from the convictions list, when one applies>"]
    }
  ],
  "preparations": [
    { "id": "prep_chicken", "title": "Roast chicken thighs",
      "servings_made": 4,
      "ingredients": [{ "term": "...", "quantity": "<for the WHOLE batch>",
                        "amount": <number>|null,
                        "unit": "g"|"ml"|"unit"|"tbsp"|"tsp"|null,
                        "state": "raw"|"cooked"|null }],
      "method": "how to cook the batch",
      "active_minutes": <minutes of HANDS-ON work>,
      "total_minutes": <minutes from starting to finished, waiting included>,
      "cook_on": "sun"|null }
  ],
  "cooking_sessions": [
    { "day": "sun", "preparation_ids": ["prep_chicken", "prep_rice"],
      "total_minutes": <minutes the whole session takes, start to finish>,
      "run_through": "the order of the gestures, plainly" }
  ],
  "shopping_list": [
    { "term": "...", "quantity": "..."|null,
      "aisle": "produce"|"protein"|"dairy"|"grains"|"pantry"|"frozen"|"other" }
  ]
}

Day tokens are exactly: mon tue wed thu fri sat sun. Never translated.`;

// ---------------------------------------------------------------------------
// LES CHAMPS DU JSON DE REPAS, RANGÉS EN DEUX TAS
//
// EXPORTÉS, et c'est le point: `generate-meal-v1` colle son bloc satiété APRÈS
// le message, donc il doit remettre le bloc de langue en queue — avec les MÊMES
// deux listes. Recopiées là-bas, elles divergeraient au premier champ ajouté,
// et la divergence serait muette: le modèle traduirait un jeton, ou laisserait
// une phrase en anglais, sans qu'aucun test ne regarde les deux listes à la fois.
// ---------------------------------------------------------------------------

/** La prose que l'élève lit — dans son plan, et sur son PDF de courses. */
export const MEAL_TRANSLATABLE_FIELDS: readonly string[] = [
  "dishes[].title",
  "dishes[].method",
  "dishes[].why",
  "dishes[].ingredients[].term",
  "dishes[].ingredients[].quantity",
  "preparations[].title",
  "preparations[].method",
  "preparations[].ingredients[].term",
  "preparations[].ingredients[].quantity",
  "cooking_sessions[].run_through",
  "shopping_list[].term",
  "shopping_list[].quantity",
];

/**
 * Les JETONS (R1): comparés en code, ou écrits en base sous une contrainte.
 *
 * ⚠️ `preparation_id` EST LE PIÈGE DE CETTE LISTE. Il est INVENTÉ par le modèle
 * et référencé par `dishes[].uses[]`. En français il écrirait `prep_poulet` —
 * cohérent avec lui-même, donc rien ne casserait à la lecture — mais
 * `token-lint` a une règle exactement là-dessus, et un identifiant traduit ne
 * se rapproche plus de rien.
 */
export const MEAL_TOKEN_FIELDS: readonly string[] = [
  "slot",
  "day",
  "cook_on",
  "aisle",
  "servings",
  "servings_made",
  "state",
  "amount",
  "unit",
  "honours_belief_keys[]",
  "preparations[].id (ASCII snake_case, English words only)",
  "dishes[].uses[].preparation_id (must match preparations[].id exactly)",
  // LOT 2 — LE GESTE DU JOUR J EST UN JETON, PAS UNE PHRASE. Il est comparé en
  // code contre `SAME_DAY_KINDS` et rendu par l'écran sous un libellé traduit;
  // un modèle qui écrirait « réchauffage » ou « nur aufwärmen » ferait tomber la
  // validation, donc le bandeau du jour, dans toutes les langues sauf l'anglais.
  // C'est le piège de `preparation_id`, mot pour mot, sur un autre champ.
  "dishes[].same_day.kind (one of: none, reheat_only, assemble, cook_fresh)",
];

/**
 * LES JOURS DE CUISINE QUE LE MOTEUR AJOUTE, ET QUE L'ÉLÈVE N'A PAS COCHÉS.
 *
 * ── LA CONTRAINTE DOIT RESTER SATISFAISABLE ───────────────────────────────
 * MESURÉ le 2026-08-12: jours déclarés `sun, wed`, fenêtre jeudi→dimanche.
 * L'intersection ne laisse que DIMANCHE — le dernier jour. Le modèle a donc
 * fait manger jeudi, vendredi et samedi sur un lot cuisiné le dimanche: quatre
 * repas antérieurs à leur propre cuisson, et un plan inexécutable.
 *
 * Un jour de cuisine qui arrive APRÈS les repas qu'il doit nourrir n'est pas
 * une contrainte, c'est une impasse. On ajoute donc le premier jour CUISINABLE
 * de la fenêtre. Le pire cas est une session posée un jour non déclaré, qu'on
 * déplacera; l'autre pire cas est une semaine qu'on ne peut pas cuisiner.
 *
 * ── EXPORTÉE PARCE QUE DEUX LECTEURS DOIVENT DIRE LE MÊME JOUR ────────────
 * La consigne demande au modèle de DIRE que ce jour est un ajout. Le run réel
 * montre qu'il ne l'a pas dit — d'où `plan_rationale`, qui le dit de façon
 * déterministe. Si l'explication recalculait l'ajout de son côté, elle finirait
 * par nommer un autre jour que celui de la consigne, et ce serait l'explication
 * qui aurait tort. Une seule définition, deux lecteurs.
 *
 * ⚠️ `firstDayCookable` est REQUIS et sans défaut: passé la coupure courses, le
 * jour ajouté est le SUIVANT (voir `plan_hours.ts`). `true` est une
 * affirmation, pas un repli.
 *
 * Rend `[]` — jamais `null` — quand il n'y a rien à ajouter, ce qui est le cas
 * nominal.
 */
export function addedCookDays(input: {
  /** Les jours COCHÉS par l'élève. `[]` = il n'en a coché aucun. */
  declared: readonly string[];
  /** Les jours de la fenêtre, dans l'ordre. `[]` = fenêtre inconnue. */
  window: readonly string[];
  /** Le premier jour de la fenêtre est-il encore cuisinable ? REQUIS. */
  firstDayCookable: boolean;
}): string[] {
  if (typeof input?.firstDayCookable !== "boolean") {
    throw new Error(
      "[keel/meal_generation] addedCookDays: firstDayCookable est REQUIS et booléen — " +
        "un appelant qui n'a pas lu l'horloge passe `true`, il ne l'hérite pas",
    );
  }
  const window = input.window ?? [];
  const declared = input.declared ?? [];
  if (declared.length === 0 || window.length === 0) return [];
  const usable = declared.filter((d) => window.includes(d));
  if (usable.length === 0) return [];
  // Le premier jour de la fenêtre, ou le suivant s'il est déjà trop tard pour
  // lui. Quand il n'y a pas de jour suivant, il n'y a rien à ajouter — et la
  // consigne ordinaire est alors vraie.
  const first = input.firstDayCookable ? window[0] : window[1];
  if (first === undefined || usable.includes(first)) return [];
  const earliest = Math.min(...usable.map((d) => window.indexOf(d)));
  return earliest > window.indexOf(first) ? [first] : [];
}

export function buildMealPrompt(args: {
  /**
   * FF-030 — LES CONTRAINTES DURES DE L'ÉLÈVE. `null` quand la lecture a
   * échoué; `[]` quand il n'en a aucune. Rendues EN TÊTE du message.
   *
   * ── CE QUE SON ABSENCE COÛTAIT, mesuré le 2026-08-08 ─────────────────────
   * `generate-meal-v1` chargeait bien `student_safety_constraints`, et ne les
   * passait qu'à `parseGeneratedMeal` — c'est-à-dire au VERROU DE SORTIE. Le
   * modèle composait donc à l'aveugle, et le verrou est BINAIRE: `clean` est
   * calculé sur la concaténation de TOUS les plats, donc un seul plat qui
   * touche l'allergène vide la semaine entière et rend `empty_meal` en 422.
   * L'élève allergique payait sa sécurité en semaines vides, sans explication.
   *
   * Les deux autres lanes injectaient déjà ce bloc (`week_plan_generation.ts`,
   * `sophia-brain/router/run.ts`), par la MÊME fonction. On copie le placement
   * plutôt que d'en inventer un: une seconde façon de rendre des contraintes
   * médicales divergerait de la première.
   *
   * REQUIS, `T | null`, jamais `T?` — voir `eatingRhythm` plus bas pour la
   * phrase que ce fichier a déjà payée trois fois. Ici la preuve d'un oubli
   * serait une assiette.
   */
  safetyConstraints: readonly StudentSafetyConstraint[] | null;
  /**
   * FF-030 — CE QU'ON SAIT DE LEUR CORPS, ou `null` quand on ne sait rien (et
   * sur la lane FOYER, qui compose pour plusieurs personnes: il n'y a pas UN
   * corps, et en choisir un dimensionnerait l'assiette de tout le monde sur
   * lui).
   *
   * C'est ce qui dimensionne une portion. Le prompt système DEMANDE de
   * dimensionner (« one adult portion is roughly a palm of protein ») et rien
   * ne lui disait de qui: `height_cm` avait un écran, une colonne, une
   * contrainte de bornes et zéro lecteur.
   *
   * REQUIS, `T | null`, jamais `T?`, et le type porte sa propre garde: le
   * plancher TCA est un champ OBLIGATOIRE de `MealBodyContext` (FF-030 R5).
   */
  body: MealBodyContext | null;
  /**
   * FF-030 — L'AXE QUE L'ÉLÈVE VEUT VOIR MONTER, ou `null`.
   *
   * Sans lui, `performance` et `health` n'ont aucun indicateur de direction:
   * le jeton `goal` dit « santé » et s'arrête là, pendant que `fat_loss` dit
   * au moins « ça descend ». La colonne est collectée depuis le 2026-08-05 et
   * n'était même pas dans le `select` de cette lane.
   *
   * REQUIS, même raison que les deux ci-dessus.
   */
  focusAxis: WeeklyAxis | null;
  doctrineBlock: string;
  /**
   * LE MAPPING ALIMENTAIRE DU COACH — `protocolBlockFor()`, vide s'il n'a rien
   * coché.
   *
   * Il est SÉPARÉ du bloc de doctrine, et ce n'est pas une commodité de
   * plomberie: la doctrine dit ce que le coach PENSE, le mapping dit avec quoi
   * il CONSTRUIT. Les fondre ferait deviner au modèle lequel est une conviction
   * qu'il peut citer à l'élève et lequel est une contrainte de composition.
   *
   * Obligatoire et pas optionnel — un appelant qui l'oublie compose des plats
   * en ignorant les trente pastilles que le coach a cochées, sans que rien
   * n'échoue. C'était exactement l'état du produit avant ce câblage.
   */
  protocolBlock: string;
  /** Les clés offertes, pour que `honours_belief_keys` soit vérifiable. */
  beliefKeys: readonly string[];
  goal: string;
  situation: string | null;
  /** Le contexte du MOMENT, en prose libre. C'est la demande produit. */
  context: string | null;
  /**
   * CE DONT ILS ONT ENVIE POUR CETTE COMPOSITION — « mezze d'été, plein de
   * carottes ». Daté, tapé au moment de générer.
   *
   * À ne pas confondre avec `foodPreferences`, qui est ce qu'ils ont dit de leur
   * bouffe EN CONVERSATION et qui vaut pour toutes leurs semaines. L'un est une
   * envie, l'autre un goût.
   */
  preferences?: string | null;
  mode: MealMode;
  scope: MealScope;
  slot: MealSlot | null;
  servings: number;
  pantry: readonly PantryItem[];
  /** Le jeton du jour de l'élève, dans SON fuseau. Jamais celui du serveur. */
  todayToken?: string | null;
  /**
   * LA DATE DU JOUR, dans le fuseau de l'élève — et pas seulement le jour de la
   * semaine.
   *
   * « mercredi » ne dit pas si on est en février ou en août. Sans la date, rien
   * dans ce prompt ne permettait au modèle de savoir ce qui pousse en ce moment,
   * et il proposait des blanquettes en plein été.
   */
  today?: string | null;
  /**
   * LE PAYS OÙ L'ÉLÈVE FAIT SES COURSES (ISO-3166 alpha-2), ou `null`.
   *
   * Une saison n'existe pas dans l'absolu: août est l'été en France et l'hiver
   * en Argentine, et sous l'équateur la question ne se pose pas dans ces termes.
   * On transmet donc le PAYS et la DATE — des faits — plutôt que « c'est
   * l'été », qui serait notre déduction et qu'on aurait tort d'imposer.
   */
  country?: string | null;
  /**
   * CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE — `practical_constraints`.
   *
   * Quatre entrées qui décidaient de tout et que le moteur devinait: les jours
   * où il peut cuisiner, le temps par session, le niveau de recette, le budget.
   * Un plan parfait et inapplicable est la première cause d'abandon.
   */
  cookDays?: readonly string[];
  cookingTimeMin?: number | null;
  recipeDifficulty?: string | null;
  variety?: string | null;
  /**
   * L'ARGENT DE CE PLAN-LÀ, EN CHIFFRE — dans la monnaie du pays de l'élève,
   * que `country` ci-dessus porte déjà.
   *
   * ── CE QUE C'ÉTAIT: `budgetBand`, « tight / normal / comfortable » ────────
   * Le mot partait au modèle tel quel, et il ne dit rien: « serré » pour une
   * personne seule et « serré » pour une table de cinq ne désignent ni la même
   * somme ni le même arbitrage. Or c'est l'arbitrage qui est demandé — quand
   * il n'y a pas d'argent, on ne « fait pas attention », on renonce à la
   * viande. Un montant se compare à un panier; un adjectif ne se compare à
   * rien.
   *
   * ⚠️ PROPRIÉTÉ REQUISE, VALEUR NULLABLE, ET LA DISTINCTION EST LA GARDE.
   * `budgetBand` était `?:` — un appelant pouvait l'oublier, et la ligne de
   * prompt disparaissait sans que rien n'échoue. C'est la cicatrice
   * `safetyBand` du dépôt, à l'identique. Ici l'absence doit être ÉCRITE:
   * `null` est une réponse (« cette composition n'a pas de budget »), une
   * propriété manquante ne compile pas.
   */
  budgetAmount: number | null;
  /**
   * CE QUE L'ÉLÈVE A DIT SUR SA BOUFFE, promu depuis la conversation.
   *
   * ── POURQUOI C'EST UN ARGUMENT NOMMÉ ICI, ET PAS UN JSONB ─────────────
   * `generate-week-plan-v1` sérialise `practical_constraints` en entier, donc
   * il verrait cette clé sans rien changer. Ce générateur-ci lit des clés
   * NOMMÉES (`eating_rhythm`, capacité de cuisine): une clé de plus y est
   * invisible tant que personne ne la passe. C'est exactement le défaut que
   * `coach_food_rules` a produit — un écran, des gardes, trente tests, et
   * aucun lecteur au runtime.
   *
   * Vide = l'élève n'a rien confirmé, et le prompt est celui d'avant.
   */
  foodPreferences?: readonly string[];
  /**
   * CE QUE L'ÉLÈVE A TAPÉ LUI-MÊME — des consignes, pas des préférences.
   *
   * Même source que `foodPreferences` (`food_preferences`), mais l'autre
   * seau de `foodPreferencesByOrigin`: ces lignes-là portent
   * `origin.source === "written"`.
   *
   * ── OPTIONNEL, ET LA GARDE EST AILLEURS — C'EST UNE DÉCISION ──────────
   * Le commentaire de `foodPreferences` raconte pourquoi une clé NOMMÉE de
   * plus est invisible tant que personne ne la passe, et cite
   * `coach_food_rules` comme le mort de cette famille: un écran, des gardes,
   * trente tests, aucun lecteur au runtime. `coachNoteBlock` en tire un champ
   * REQUIS, pour que la casse de compilation recense les appelants.
   *
   * Ici la même leçon donne l'inverse, et il faut voir pourquoi. Un champ
   * requis prouve qu'un appelant a ÉCRIT `writtenInstructions: <quelque
   * chose>` — y compris `[]`, qui est très exactement l'état débranché qu'on
   * craint. Il recense les signatures, pas les branchements.
   *
   * Ce qui tient vraiment cette lane est dans `household_voices_test.ts`: un
   * test qui LIT la source de `generate-meal-v1` et exige d'y trouver
   * `writtenInstructions: readFoodPreferences(`. Celui-là rougit sur un `[]`
   * de complaisance, ce que le typage ne saurait pas faire. Il est donc
   * strictement plus fort, et le champ n'a pas besoin d'être requis pour être
   * gardé.
   *
   * Le `?? []` du corps suit: les fixtures tournent en `--no-check`, et un
   * champ absent y donnerait un `TypeError` sur `.length` — un rouge qui ne
   * dit pas ce qu'il veut.
   */
  writtenInstructions?: readonly string[];
  /**
   * LA NOTE DU COACH SUR CET ÉLÈVE — mode 1:1 assumé, `null` quand il n'y en a
   * pas (le cas ordinaire). Produit par `coachNotePromptBlock`.
   *
   * REQUIS, `T | null`, jamais `T?` — contrairement à `foodPreferences` juste
   * au-dessus, et exprès. Le commentaire de `foodPreferences` explique
   * pourquoi une clé NOMMÉE de plus est invisible ici tant que personne ne la
   * passe, et cite `coach_food_rules` comme le mort de cette famille. Un champ
   * optionnel signerait le même défaut une deuxième fois, dans le fichier qui
   * le documente.
   */
  coachNoteBlock: string | null;
  /** Les jours à remplir, à partir d'aujourd'hui. Vide = le modèle décide. */
  daysToFill?: readonly string[];
  /**
   * Les moments d'une journée NORMALE pour cet élève. Vide = il ne l'a pas dit,
   * et on retombe sur les trois repas que le moteur imposait jusqu'ici.
   */
  eatingRhythm?: readonly EatingOccasionSlot[];
  /**
   * Les moments où l'élève NE MANGE PAS ICI. Vide = il mange tout ce que son
   * rythme nomme, tous les jours de la fenêtre.
   */
  awayDays?: readonly AwayDay[];
  /**
   * FF-051 — CE QUE L'ÉLÈVE MANGE DÉJÀ, hors de ce qu'on compose.
   *
   * REQUIS, avec `[]` pour « aucun », jamais `T?`. C'est la CINQUIÈME fois que
   * ce fichier écrit cette phrase, et il l'a payée les quatre précédentes
   * (`eatingRhythm`, `awayDays`, `cookingTimeMin`, `composition`): un paramètre
   * optionnel est un paramètre qu'un appelant oublie. Ici l'oubli coûte un
   * petit-déjeuner de trop tous les matins, à quelqu'un qui avait pris la peine
   * de le dire — et rien n'échouerait.
   */
  fixedIntakes: readonly FixedIntake[];
  /**
   * FF-052 — CE QUE CERTAINS JOURS SONT, en positif.
   *
   * REQUIS, `[]` pour « rien de déclaré ». Sixième fois que ce fichier écrit
   * cette phrase; l'oubli coûterait ici un dîner neuf composé un jour de
   * restes, c'est-à-dire la moitié d'un batch jetée.
   */
  dayProperties: readonly DayPropertyEntry[];
  /**
   * L4/D6 — LA BOUCHE REPRISE PAR LA FUSION, ou `null`.
   *
   * ⚠️ REQUIS, `T | null`, jamais `T?`, et la raison est MESURÉE. La fusion
   * ajoute des plats PAR CONSTRUCTION: sans ce champ, le même prompt annonce
   * « au plus 15 plats » et « donne-lui un SECOND plat ». Un champ facultatif
   * n'aurait fait remonter AUCUN appelant au compilateur — et le jour où une
   * troisième lane apparaît, elle hériterait du budget d'une table qui n'a pas
   * la bouche qu'on lui a ajoutée. Chaque appelant DIT ce qu'il veut.
   */
  merge: MergedEater | null;
  /**
   * LE PREMIER JOUR DE LA FENÊTRE EST-IL ENCORE CUISINABLE ?
   *
   * ── LE TROU QU'IL FERME ──────────────────────────────────────────────────
   * La branche `tooLate`, plus bas, ajoute d'office une session de cuisine sur
   * le PREMIER jour de la fenêtre quand tous les jours déclarés tombent après
   * lui. C'est juste — sauf à 21 h: on demande alors à quelqu'un de faire ses
   * courses dans un magasin fermé puis de cuisiner un lot, ce soir. La branche
   * vise alors le jour SUIVANT.
   *
   * ⚠️ REQUIS ET SANS DÉFAUT, `boolean`. `true` est une AFFIRMATION (« ce
   * premier jour est encore cuisinable »), pas un repli: un appelant qui
   * n'aurait pas su lire l'horloge doit le dire en passant `true` — le
   * comportement d'hier — et pas l'hériter d'un `?`. Septième fois que ce
   * fichier écrit cette phrase.
   *
   * Le calcul appartient à `plan_hours.ts::firstWindowDayIsCookable`, avec la
   * coupure nommée; il n'est PAS recopié ici. Une seconde définition de « 18 h »
   * dériverait de la première le jour où quelqu'un la change.
   */
  firstDayCookable: boolean;
  /**
   * LA LANGUE DANS LAQUELLE CES PLATS SONT ÉCRITS. REQUIS, jamais `T?`.
   *
   * Vient de `resolveArtifactLocale({studentProfile, tenantDefault})`, donc de
   * `profiles.locale` — la langue CHOISIE, celle que l'agent parle. Pas de
   * `student_goals.content_locale`, qui est la langue dans laquelle l'élève a
   * écrit sa situation (R3, troisième axe) et que tous ses écrivains sèment
   * `'en-GB'`.
   */
  contentLocale: string;
}): { systemPrompt: string; userMessage: string; contentLocale: string } {
  const rhythm = args.eatingRhythm && args.eatingRhythm.length > 0
    ? args.eatingRhythm
    : DEFAULT_EATING_RHYTHM;
  // `rhythm` RÉSOLU, jamais `args.eatingRhythm` brut: le plafond doit être celui
  // des moments que le prompt NOMME trois lignes plus haut. Passer le brut a
  // déjà produit la divergence exacte que `dishCapFor` documente — la consigne
  // demandait trois plats, le plafond en autorisait quatre.
  //
  // DEUX NOMBRES, ET ILS NE MESURENT PAS LA MÊME CHOSE.
  //   · `cap`     — les PLATS. Il compte la bouche reprise par la fusion, qui
  //                 en demande de son côté (`dishBudgetFor`).
  //   · `baseCap` — les SESSIONS, plus bas. Il ne la compte PAS, et c'est le
  //                 sujet: le barreau ② promet mot pour mot « one session at
  //                 the stove, two dishes out of it ». Dériver le budget de
  //                 sessions du plafond GONFLÉ contredirait la consigne servie,
  //                 dans le même message. Le barreau ③, lui, réclame bien une
  //                 session à part — elle se prend dans un budget qui est un
  //                 PLAFOND et non une cible (mesuré: 5 autorisées, 2 à 3
  //                 utilisées). Si un run montre que ③ manque de place, c'est
  //                 ici, en une ligne, que ça se répare.
  const baseCap = dishCapFor(args.scope, rhythm, args.daysToFill?.length || 7);
  const cap = dishBudgetFor({
    scope: args.scope,
    rhythm,
    daysToFill: args.daysToFill?.length || 7,
    merge: args.merge,
  });
  // Les absences, en prose, une ligne par jour. Calculées ici pour être
  // insérées plus bas dans la même liste que le reste des contraintes.
  const awayLines = (args.awayDays ?? []).map((a) =>
    a.slots.length === 0
      ? `- ${dayProse(a.day)}: the whole day`
      : `- ${dayProse(a.day)}: ${a.slots.map((s) => OCCASION_PROSE[s]).join(", ")}`
  );
  const pantryLines = args.pantry
    .map((p) => (p.quantity ? `- ${p.term} (${p.quantity})` : `- ${p.term}`))
    .join("\n");

  // ── LES CONTRAINTES DURES, EN TÊTE ────────────────────────────────────────
  // Même placement que `buildWeekPlanPrompt`, et pour la raison qui y est
  // écrite: si le budget de prompt tronque quoi que ce soit, ce n'est pas la
  // ligne qui dit « pas d'arachide » qui doit sauter.
  const safetyBlock = safetyConstraintsPromptBlock(args.safetyConstraints);

  // Le corps, en deux blocs qui atterrissent à deux rangs différents. Le
  // plancher TCA est appliqué DANS `mealBodyBlocks`, pas ici (FF-030 R5).
  const bodyBlocks = mealBodyBlocks(args.body);

  // ── LES CONTRAINTES DE CUISINE, calculées ici pour être posées sous
  //    `-- WHAT THEY CAN COOK --` ────────────────────────────────────────────
  // LES JOURS DE CUISINE, INTERSECTÉS AVEC LA FENÊTRE. Mesuré: un élève qui
  // déclare cuisiner « dimanche et mercredi », plan généré un JEUDI, recevait
  // une session le MERCREDI — un jour déjà passé. Ses jours de cuisine sont
  // une propriété de sa semaine type; la fenêtre est ce qu'il en reste, et
  // c'est l'intersection qui est exécutable.
  //
  // L'INTERSECTION VIDE RETOMBE SUR LA FENÊTRE, jamais sur rien: quelqu'un
  // qui ne cuisine que le lundi, un vendredi, doit quand même manger. Mieux
  // vaut une session posée un jour non déclaré — qu'il déplacera — qu'un plan
  // sans aucun jour de cuisine.
  //
  // ⚠️ LE COMMENTAIRE HISTORIQUE DE CE BLOC A DÉMÉNAGÉ dans `addedCookDays`,
  // avec le calcul qu'il décrit.
  const cookDayLines = ((): string[] => {
    const window = args.daysToFill ?? [];
    const declared = args.cookDays ?? [];
    if (declared.length === 0) return [];
    const usable = window.length > 0
      ? declared.filter((d) => window.includes(d))
      : declared;

    // ── LA CONTRAINTE DOIT RESTER SATISFAISABLE ─────────────────────────
    // MESURÉ: jours déclarés `sun, wed`, fenêtre jeudi→dimanche.
    // L'intersection ne laisse que DIMANCHE — le dernier jour. Le modèle a
    // donc fait manger jeudi, vendredi et samedi sur un lot cuisiné le
    // dimanche: quatre repas antérieurs à leur propre cuisson. Quatre
    // `issues` sur un vrai plan, et un plan inexécutable.
    //
    // Un jour de cuisine qui arrive APRÈS les repas qu'il doit nourrir n'est
    // pas une contrainte, c'est une impasse. On ajoute donc le PREMIER jour
    // de la fenêtre — et on DIT que c'est un ajout, pour que le modèle
    // n'aille pas croire que l'élève l'a déclaré. Le pire cas est une session
    // posée un jour non déclaré, qu'il déplacera; l'autre pire cas est une
    // semaine qu'il ne peut pas cuisiner.
    //
    // ⚠️ LE CALCUL VIT DANS `addedCookDays`, ET C'EST LA MOITIÉ QUI COMPTE.
    // La phrase ci-dessous demande au modèle de DIRE que le jour est un ajout;
    // le run réel du 2026-08-12 montre qu'il ne l'a pas dit. `plan_rationale`
    // le dit désormais de façon déterministe — et il doit nommer EXACTEMENT le
    // jour que cette consigne a demandé. Deux calculs du même ajout
    // divergeraient, et c'est l'explication qui aurait tort.
    const added = addedCookDays({
      declared,
      window,
      firstDayCookable: args.firstDayCookable,
    });
    const first = added[0];
    const tooLate = added.length > 0;

    if (usable.length === 0) {
      return [
        `they usually cook on ${declared.join(", ")}, but none of those days ` +
        "are left in this stretch. Put the cooking sessions on the days you " +
        "do have, as early as possible.",
      ];
    }
    if (tooLate) {
      return [
        `they usually cook on ${usable.join(", ")} -- all of which fall after ` +
        `${first}, so nothing cooked then can feed the days before it. Cook ` +
        `on ${first} as well, and say so: it is a day they did not ask for. ` +
        "Everything before their usual day is cooked fresh, not from a batch.",
      ];
    }
    return [
      `they can only cook on: ${usable.join(", ")}. Put every cooking ` +
      "session on those days, and no others.",
    ];
  })();

  const canCookLines = [
    ...cookDayLines,
    ...(args.cookingTimeMin
      ? [
        `time per cooking session: about ${args.cookingTimeMin} minutes. A ` +
        "session that does not fit is a session they skip.",
      ]
      : []),
    ...(args.recipeDifficulty
      ? [`recipe level they want: ${args.recipeDifficulty}`]
      : []),
    ...(args.variety ? [`repetition they accept: ${args.variety}`] : []),
    // LE BUDGET EST UN PLAFOND CHIFFRÉ, PAS UNE AMBIANCE.
    //
    // La monnaie n'est pas nommée: `country` est deux lignes plus haut dans ce
    // même prompt, et une table pays → devise tenue de notre côté serait une
    // liste fermée qui refuserait un pays légitime le jour où quelqu'un s'y
    // inscrit (voir `frontend/src/keel/api/countries.ts`).
    //
    // La consigne dit QUOI SACRIFIER, dans l'ordre. « Reste dans le budget »
    // seul laisse le modèle rogner sur les portions — c'est-à-dire sur la
    // seule chose que le reste de ce prompt calcule.
    ...(args.budgetAmount !== null
      ? [
        `budget for this plan: ${args.budgetAmount}, in the local currency of ` +
        "their country. It covers the WHOLE shopping list for this stretch, " +
        "for every serving asked for above — it is a ceiling, not a target.",
        "when that budget is tight for the number of servings and days, cut " +
        "in THIS order: expensive proteins first (swap to eggs, legumes, " +
        "tinned fish, cheaper cuts), then out-of-season and imported produce, " +
        "then variety (repeat a batch). NEVER cut the portions themselves: " +
        "the servings are computed from bodies and directions, and a plan " +
        "that shrinks them silently is a plan that starves someone to fit a " +
        "number.",
      ]
      : []),
  ];

  const userMessage = [
    // ── LES CONTRAINTES DURES AVANT TOUT LE RESTE ───────────────────────────
    // Avant la doctrine, avant l'élève, avant la demande. Elles gagnent sur
    // tout, y compris sur la méthode du coach: un coach dont la doctrine
    // recommande les fruits à coque n'a pas écrit ça pour un anaphylactique.
    ...(safetyBlock ? [safetyBlock, ""] : []),
    args.doctrineBlock.trim(),
    // Le mapping suit IMMÉDIATEMENT la doctrine, et avant tout ce qui est
    // propre à l'élève: c'est la partie commune à toute la cohorte du coach,
    // donc la partie cacheable, et le budget de prompt tronque par la queue.
    ...(args.protocolBlock.trim() ? ["", args.protocolBlock.trim()] : []),
    "",
    "== THE CONVICTION KEYS YOU MAY NAME ==",
    JSON.stringify(args.beliefKeys),
    "",
    // LA NOTE DU COACH, entre la méthode et l'élève — même placement que dans
    // `buildWeekPlanPrompt`: après tout ce qui est collectif et cacheable,
    // avant tout ce que l'élève a dit de lui-même. Absente, aucune ligne.
    ...(args.coachNoteBlock ? [args.coachNoteBlock, ""] : []),
    // ── CE QUI EST DURABLE, ET CE QUI EST DATÉ, NE SE LISENT PLUS AU MÊME
    //    RANG ─────────────────────────────────────────────────────────────
    // Tout ce qui suit tenait dans une seule liste plate sous cet en-tête: la
    // cantine du midi, le mariage de mardi, la balance de dimanche et le
    // budget serré, à égalité. Une contrainte d'une semaine s'y lisait comme
    // une propriété permanente.
    //
    // Le dépôt avait déjà tranché ce problème une fois, en séparant
    // `situation` (stable) de `context` (daté). Les sous-sections généralisent
    // cet arbitrage: ce qu'ils SONT, ce qu'ils VISENT, où ils EN SONT, comment
    // leur journée TOURNE — puis, en dernier, ce qui n'est vrai que cette fois.
    //
    // UNE SOUS-SECTION SANS CONTENU N'EXISTE PAS. Un en-tête vide est du bruit
    // qui coûte du cache, et « height: not stated » est pire que le silence:
    // ça occupe le rang d'une contrainte et ça invite le modèle à commenter
    // une absence.
    "== THIS STUDENT ==",
    ...(bodyBlocks.whoTheyAre.length > 0
      ? ["", "-- WHO THEY ARE --", ...bodyBlocks.whoTheyAre]
      : []),
    "",
    "-- WHAT THEY ARE AFTER --",
    `goal: ${args.goal}`,
    // L'AXE, ET CE QU'IL AUTORISE À FAIRE. Repris de `buildWeekPlanPrompt`, y
    // compris son garde-fou: un axe que le coach n'a jamais traité ne donne
    // PAS le droit d'inventer un conseil dessus. Le produit du coach est sa
    // méthode; un axe est une direction dans laquelle la chercher, pas une
    // permission d'en écrire une.
    ...(args.focusAxis
      ? [
        `the one thing they want to see improve: ${
          WEEKLY_AXIS_LABELS_EN[args.focusAxis] ?? args.focusAxis
        }. Let it rank your choices among the dishes the method allows. If the ` +
        `coach has taught nothing that bears on it, say nothing about it rather ` +
        `than teaching something he never taught.`,
      ]
      : []),
    args.situation
      ? `their situation, in their words: ${args.situation}`
      : "their situation: not stated.",
    ...(bodyBlocks.whereTheyAreNow.length > 0
      ? ["", "-- WHERE THEY ARE NOW --", ...bodyBlocks.whereTheyAreNow]
      : []),
    "",
    // ── LA FORME DE LEUR JOURNÉE ────────────────────────────────────────
    // Sa propre sous-section, et pas une ligne perdue dans « what to cook »:
    // c'est la contrainte qui décide COMBIEN de plats existent et QUAND. Une
    // faim de 17h qu'on ne nomme pas est une faim qu'on comble ailleurs, et le
    // plan le plus juste du monde s'écroule dessus.
    "-- HOW THEIR DAY RUNS --",
    rhythmLines(rhythm),
    args.eatingRhythm && args.eatingRhythm.length > 0
      ? "Those are the moments they actually eat. Do not add a meal they did " +
        "not name, and do not drop one they did: an extra meal is a meal they " +
        "skip, a missing one is the hour they raid the cupboard."
      : "They have not told us their rhythm, so this is the default assumption " +
        "— treat it as ordinary, not as something they chose.",
    // ── CE QU'ILS NE MANGENT PAS ICI ──────────────────────────────────────
    // Nommé moment par moment, et en NÉGATIF explicite: « skip » plutôt qu'une
    // liste de ce qu'il reste. Le modèle qui reçoit une liste positive la
    // complète — c'est le comportement même d'un modèle de composition, et
    // c'est pour ça que le parseur revérifie derrière (voir `isAway`).
    ...(awayLines.length > 0
      ? [
        "",
        "-- WHEN THEY ARE NOT HERE --",
        "they are NOT eating here at these moments — compose nothing, buy " +
        "nothing, and count no portion for them:",
        ...awayLines,
      ]
      : []),
    // ── CE QU'ILS MANGENT DÉJÀ ────────────────────────────────────────────
    // Le PENDANT POSITIF de la section au-dessus, et posé juste après elle
    // pour qu'elles se lisent ensemble: « pas ici » et « déjà ça » sont les
    // deux façons dont une case de la grille peut être prise avant que le
    // modèle n'y touche.
    ...fixedIntakePromptLines(args.fixedIntakes),
    // ── CE QUE CERTAINS JOURS SONT ────────────────────────────────────────
    // Troisième façon dont une case de la grille peut être décidée avant que
    // le modèle n'y touche — et la seule des trois qui soit POSITIVE.
    ...dayPropertyPromptLines(args.dayProperties),
    // LES CONTRAINTES DE CUISINE. Elles décrivent une CAPACITÉ durable (les
    // jours où il peut cuisiner, le temps qu'il a, ce qu'il sait faire, ce
    // qu'il peut dépenser), donc elles vivent avec l'élève et non avec la
    // demande. Un plan parfait et inapplicable est la première cause
    // d'abandon.
    ...(canCookLines.length > 0
      ? ["", "-- WHAT THEY CAN COOK --", ...canCookLines]
      : []),
    // CE QU'IL A DIT LUI-MÊME, et il l'a confirmé sur un écran. Ce ne sont ni
    // des interdits du coach (ceux-là sont dans la doctrine, avec leur double
    // verrou) ni des contraintes médicales (celles-là sont maintenant en tête
    // du message): ce sont des goûts et des contextes de vie, et ils décident
    // si une semaine est vivable.
    // ── DEUX PROVENANCES, ET LE RANG EST LA MOITIÉ DU MESSAGE ─────────────
    // Ce que quelqu'un PREND LA PEINE D'ÉCRIRE sur son alimentation ne pèse
    // pas comme une remarque glanée en conversation qu'on lui a fait
    // confirmer d'un bouton. Servies en un seul sac, les deux sont
    // indépartageables — le modèle n'a aucun moyen, même en principe, de
    // savoir laquelle il a le droit d'arbitrer.
    //
    // Et le dire ne suffit pas: la consigne du prompt REGRESSE en réel (le
    // verrou des règles de maison existe pour ça). D'où la demande explicite
    // de NOMMER ce qu'il n'a pas pu honorer — que `written_instruction_check.ts`
    // vérifie ensuite sur la sortie, déterministiquement. C'est le double
    // verrou de la doctrine, pointé sur une autre liste.
    ...((args.writtenInstructions ?? []).length > 0 ||
        (args.foodPreferences?.length ?? 0) > 0
      ? [
        "",
        "-- WHAT THEY HAVE TOLD ME --",
        ...((args.writtenInstructions ?? []).length > 0
          ? [
            "what they WROTE THEMSELVES about their eating. treat these as " +
            "instructions, not as suggestions:",
            ...(args.writtenInstructions ?? []).map((p) => `- ${p}`),
            "if you cannot honour one of those, say so in the \"why\" of the " +
            "dish it affects, name the thing you could not do, and say what " +
            "you did instead. do not drop it in silence.",
          ]
          : []),
        ...((args.foodPreferences?.length ?? 0) > 0
          ? [
            ...((args.writtenInstructions ?? []).length > 0
              ? ["", "what came up in conversation and they confirmed. treat " +
                "these as preferences:"]
              : ["what they have told you about their eating, in their own words:"]),
            ...(args.foodPreferences ?? []).map((p) => `- ${p}`),
          ]
          : []),
      ]
      : []),
    // ── CE QUI N'EST VRAI QUE CETTE FOIS ──────────────────────────────────
    // En DERNIER de la section, et c'est le point de la séparation: le
    // contexte est daté (« mariage mardi »), l'envie a été tapée il y a dix
    // secondes, le garde-manger est l'état d'un placard ce soir. Les fondre
    // avec ce qui précède ferait traiter un mariage comme une habitude de vie
    // — et « mezze d'été cette semaine » reviendrait en février.
    "",
    "-- THIS TIME --",
    args.context
      ? `what is going on for them RIGHT NOW: ${args.context}`
      : "nothing special going on this week.",
    ...(args.preferences
      ? [`what they feel like eating THIS TIME: ${args.preferences}`]
      : []),
    `people at the table: ${args.servings}`,
    // LE GARDE-MANGER EST UNE SOUS-SECTION, PAS UNE SECTION. Il portait un
    // en-tête `==` posé au milieu de sous-titres `--`: pour un modèle qui lit
    // une hiérarchie, ça ferme `== THIS STUDENT ==` au mauvais endroit et
    // rattache la suite à autre chose. Le niveau suit maintenant le rang.
    args.mode === "from_pantry"
      ? [
        "",
        "-- WHAT THEY ALREADY HAVE --",
        pantryLines || "- (they listed nothing)",
      ].join("\n")
      : "\n-- THEY HAVE NOT SHOPPED YET: give the full list --",
    "",
    // ── LA SAISON, ET CE QUI POUSSE LÀ OÙ ILS SONT ──────────────────────
    //
    // ON DONNE LES FAITS, PAS NOTRE DÉDUCTION. La tentation était d'écrire
    // « c'est l'été » — ce qui aurait demandé une table d'hémisphères, se serait
    // trompé sous l'équateur, et aurait imposé notre lecture à un modèle qui
    // connaît déjà les calendriers agricoles. On transmet la DATE et le PAYS;
    // ce qui pousse en Bretagne le 5 août, il le sait mieux que nous.
    //
    // ET C'EST UNE PRÉFÉRENCE, PAS UNE CONTRAINTE — c'est dit deux fois, parce
    // que ce prompt porte de vraies interdictions (allergènes, doctrine) et
    // qu'une consigne de saison lue avec le même poids ferait REFUSER des plats.
    // Personne ne doit s'entendre dire « pas de tomates, ce n'est pas la
    // saison »: la saison choisit vers quoi on tend, jamais ce qu'on écarte.
    "== WHAT IS IN SEASON WHERE THEY ARE ==",
    args.today ? `today's date: ${args.today}` : "today's date: not known.",
    args.country
      ? `they shop in: ${args.country} (ISO-3166 country code)`
      : "where they shop: not known — reason about season only if their " +
        "situation says where they are.",
    "PREFER fruit and vegetables in season there at that date, and produce " +
    "that grows in that country over what has to be flown in. Let the season " +
    "set the WEIGHT of a dish too: a long-braised winter stew in midsummer is " +
    "food nobody wants to cook or eat when it is hot.",
    "This is a PREFERENCE and never a rule. Never drop a dish the method calls " +
    "for to honour it, never refuse an ingredient the student asked for " +
    "because it is out of season, and never tell them a food is unavailable — " +
    "you are not looking at their shops. It ranks your choices; it does not " +
    "veto anything.",
    "",
    // ── LA DEMANDE, EN DERNIER ────────────────────────────────────────────
    // Ce bloc ne décrit plus l'élève: il décrit ce qu'on demande MAINTENANT.
    // Tout ce qui appartenait à la personne (son rythme, sa capacité de
    // cuisine, ses parts, ses placards) est remonté sous `== THIS STUDENT ==`.
    //
    // Et il reste EN DERNIER exprès: ce dépôt a mesuré qu'un modèle lit la
    // consigne la plus proche de la fin comme la plus contraignante (la raison
    // est écrite dans `household_meal_generation.ts`, et le bloc satiété a été
    // déplacé pour ça après un run rouge). La chose la plus contraignante
    // ici, c'est la commande.
    "== WHAT TO COOK ==",
    `mode: ${args.mode}`,
    `how much: ${args.scope} (at most ${cap} dish${cap > 1 ? "es" : ""})`,
    // LES DEUX CONSIGNES QUI NE TIENNENT PAS DANS LE PROMPT SYSTÈME.
    //
    // Elles y étaient, et elles se perdaient: mesuré deux fois de suite, une
    // semaine demandée rendait 17 à 20 plats cuisinés SÉPARÉMENT (zéro lot) et
    // laissait des déjeuners vides. Un prompt système long dilue une règle; une
    // consigne posée juste à côté de la DEMANDE est lue.
    //
    // Elles sont chiffrées exprès. « Peu de sessions » se négocie, « au plus
    // cinq » ne se négocie pas — et le dépôt a déjà payé le fait qu'une règle
    // qualitative dans un prompt est une règle que le modèle applique quand ça
    // l'arrange.
    ...(args.scope === "several_days"
      ? [
        // LE RYTHME DE CET ÉLÈVE, PAS CELUI DE TOUT LE MONDE.
        //
        // Cette ligne disait « every day needs breakfast, lunch and dinner ».
        // Codée en dur, pour tous. Quelqu'un qui mange deux fois recevait un
        // repas de trop; quelqu'un qui s'effondre à 17h n'avait aucun endroit
        // où le dire, et sa journée s'arrêtait au déjeuner puis reprenait au
        // dîner. La règle est la même — pas de trou — mais sur SA journée.
        `every day of the stretch needs ${occasionList(rhythm)}. A day missing ` +
        "one of those is a hole, and the student did not ask for a partial week.",
        // `baseCap`, PAS `cap` — voir les deux nombres en tête de fonction.
        `cooking sessions: at most ${batchSessionBudget(baseCap)} for the whole ` +
        "stretch. Most lunches and dinners must therefore come from BATCHES — " +
        "one cooking session, several servings, several days, declared in " +
        "`batch`. Seventeen separately-cooked dishes is not a plan anybody cooks.",
      ]
      : []),
    args.slot ? `meal: ${args.slot}` : "meal: whichever fits",
    // LE JOUR OÙ L'ON EST, et il n'y était pas. Le modèle repartait de lundi
    // par habitude: un plan généré le mercredi rendait trois jours déjà passés.
    ...(args.todayToken ? [`today is: ${args.todayToken}`] : []),
    ...(args.daysToFill && args.daysToFill.length > 0
      ? [
        `days to fill, in this order: ${args.daysToFill.join(", ")}`,
        "Do not use any other day token. Do not start earlier than today.",
      ]
      : []),
  ].join("\n");

  return {
    systemPrompt: MEAL_SYSTEM_PROMPT,
    // Le bloc de langue en DERNIER, sur le `userMessage` (récence), jamais sur
    // le `systemPrompt` (cacheable, partagé par tous les élèves).
    //
    // ⚠️ `generate-meal-v1` colle un `hungerSuffix` APRÈS ce message avant
    // d'appeler le modèle. `appendContentLanguageBlock` étant idempotent, la
    // remise du bloc après ce suffixe est faite là-bas — ici on garantit qu'il
    // existe, là-bas qu'il est bien le dernier.
    userMessage: appendContentLanguageBlock(
      userMessage,
      args.contentLocale,
      MEAL_TRANSLATABLE_FIELDS,
      MEAL_TOKEN_FIELDS,
    ),
    // Le motif `maxNutrition` appliqué à la langue: la valeur qui a servi
    // RESSORT, et c'est elle que l'appelant écrit en base. Une seule
    // expression, donc aucune divergence possible.
    contentLocale: args.contentLocale,
  };
}

// ---------------------------------------------------------------------------
// Le parseur — c'est lui qui tient les quatre garanties
// ---------------------------------------------------------------------------

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Une durée en minutes, ou `null`.
 *
 * ── PAS DE ZÉRO PAR DÉFAUT ────────────────────────────────────────────────
 * Une durée manquante rend `null`, jamais `0`: « 0 min » se lit « c'est
 * instantané », ce qui est une promesse, alors que `null` se lit « on ne sait
 * pas » et l'écran sait taire ce qu'il ne sait pas.
 *
 * ── PLAFONNÉE À QUATRE HEURES ─────────────────────────────────────────────
 * Au-delà, c'est une hallucination d'unité (des secondes prises pour des
 * minutes, une marinade de 24 h comptée comme du temps de cuisine) et l'afficher
 * ferait renoncer quelqu'un devant une session qui prend en fait une heure.
 */
function readMinutes(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(240, Math.round(n));
}

/**
 * Une quantité de courses ne porte JAMAIS d'unité d'énergie.
 *
 * Volontairement plus étroit que `findNumericTarget`: le champ `quantity` est
 * par définition une quantité, donc y interdire les grammes le rendrait
 * inutilisable. Ce qu'on interdit, c'est la seule chose qu'une quantité
 * d'achat ne peut pas être — des kcal.
 */
const ENERGY_UNIT_RE = /\d[\d.,]*\s*(kcal|kj|cal(?:orie)?s?)\b/i;

/**
 * FF-038 — LA QUANTITÉ STRUCTURÉE D'UN INGRÉDIENT, LUE PUIS RECALCULÉE.
 *
 * ── LECTURE TOLÉRANTE, JAMAIS RÉPARATRICE ────────────────────────────────
 * Un champ absent, hors liste fermée ou illisible vaut `null` et se compte.
 * Il ne se complète pas: un `state` deviné « raw » sur du riz fausse d'un
 * facteur 2,6, et toujours dans le sens qui gonfle. Le silence d'un modèle
 * n'est pas une valeur.
 *
 * ── LES GRAMMES SONT RECALCULÉS, PAS LUS ─────────────────────────────────
 * Même si le modèle rendait un champ `grams`, il ne serait pas lu. Précédent
 * `in_pantry` (garantie 2 de l'en-tête): l'arithmétique du modèle n'est pas
 * une preuve.
 *
 * `composition === null` (référentiel indisponible) ⇒ les trois champs sont
 * quand même lus et gardés, seuls les grammes manquent. La donnée structurée
 * survit à une panne de la table qui l'exploite.
 */
function readStructuredQuantity(
  ing: Record<string, unknown>,
  composition: CompositionIndex | null,
  term: string,
): Pick<DishIngredient, "amount" | "unit" | "state" | "gramsRaw"> {
  const rawAmount = Number(ing.amount);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;
  const unitRaw = cleanText(ing.unit).toLowerCase();
  const unit = (COMPOSITION_UNITS as readonly string[]).includes(unitRaw)
    ? (unitRaw as CompositionUnit)
    : null;
  const stateRaw = cleanText(ing.state).toLowerCase();
  const state = (COMPOSITION_STATES as readonly string[]).includes(stateRaw)
    ? (stateRaw as CompositionState)
    : null;

  let gramsRaw: number | null = null;
  if (composition) {
    const ref = resolveIngredient(composition, term);
    if (ref) {
      gramsRaw = gramsRawOf({
        amount,
        unit,
        state,
        yieldClass: ref.yieldClass,
        unitGrams: ref.unitGrams,
      });
    }
  }
  return { amount, unit, state, gramsRaw };
}

/** Une case de la grille des repas: un jour, un moment. */
export interface MealSlotCase {
  day: string;
  slot: EatingOccasion;
}

/**
 * LES CASES DE LA FENÊTRE QUE PERSONNE NE REMPLIT — le trou, nommé.
 *
 * ── LE DÉFAUT QU'ELLE REND LISIBLE, MESURÉ DEUX FOIS LE 2026-08-12 ─────────
 *
 * Un plat dont un ingrédient porte une cible chiffrée est rejeté ENTIER (le
 * verrou numérique, `findNumericTarget`). Sur une fusion, la matière du plan
 * personnel citait « whey protein 90 g » et **les cinq petits-déjeuners du
 * foyer sont tombés d'un coup**: le foyer s'est retrouvé sans aucun
 * petit-déjeuner, avec UNE ligne d'`issues` par plat rejeté pour tout signal —
 * c'est-à-dire une trace qui dit ce qui a été JETÉ et jamais ce qui MANQUE.
 *
 * ⚠️ ON CONSTATE, ON NE REBOUCHE PAS. Recomposer la case demanderait de choisir
 * quoi mettre à la place, et c'est un choix de PRODUIT que personne n'a pris.
 * Même posture que `observeMergeShape` et que le constat d'ancre protéique: le
 * plan est écrit, le trou est nommé. Le verrou numérique, lui, est JUSTE et
 * antérieur — on ne l'affaiblit pas d'un caractère.
 *
 * ── CE QUI N'EST PAS UN TROU, ET C'EST LA MOITIÉ QUI COMPTE ────────────────
 * Une garde qui déclarerait un trou partout serait indiscernable d'une garde
 * qui marche. Ne comptent donc PAS:
 *   · un moment où la personne (ou la tablée) est ABSENTE — la consigne
 *     l'interdit et le parseur le jette déjà, c'est un vide VOULU;
 *   · un moment déjà pris par un apport FIXE — même raison (FF-051);
 *   · un plat sans jour: il vaut pour la fenêtre entière (`windowSplit`), donc
 *     il couvre son moment tous les jours;
 *   · un plat sans moment: il couvre la JOURNÉE. On ne sait pas lequel de ses
 *     repas il est, et deviner fabriquerait un trou qui n'existe pas.
 *
 * PURE, et paramétrée par les MÊMES entrées que la consigne (`occasionList`,
 * `isAway`, `slotIsTaken`): un second avis sur « ce que cette journée devait
 * contenir » aurait divergé du prompt au premier ajustement.
 */
export function emptySlotsIn(args: {
  /** Les jetons de la fenêtre, dans son ordre. Vide ⇒ aucune case connue. */
  days: readonly string[];
  /** Le rythme déclaré. Vide ⇒ le défaut, exactement comme `occasionList`. */
  rhythm: readonly EatingOccasionSlot[];
  dishes: readonly { day?: string | null; slot?: string | null }[];
  awayDays: readonly AwayDay[];
  fixedIntakes: readonly FixedIntake[];
}): MealSlotCase[] {
  const occasions = (args.rhythm.length > 0 ? args.rhythm : DEFAULT_EATING_RHYTHM)
    .map((o) => o.slot);
  const out: MealSlotCase[] = [];
  for (const day of args.days) {
    for (const slot of occasions) {
      if (isAway(args.awayDays, day, slot)) continue;
      if (slotIsTaken(args.fixedIntakes, day, slot)) continue;
      const covered = args.dishes.some((d) => {
        const dDay = d.day ?? null;
        const dSlot = d.slot ?? null;
        if (dDay !== null && dDay !== day) return false;
        return dSlot === null || dSlot === slot;
      });
      if (!covered) out.push({ day, slot });
    }
  }
  return out;
}

/** Les cases vides, en une ligne lisible: `wed/breakfast, thu/breakfast`. */
export function emptySlotsLine(cases: readonly MealSlotCase[]): string {
  return cases.map((c) => `${c.day}/${c.slot}`).join(", ");
}

export function parseGeneratedMeal(
  raw: unknown,
  args: {
    doctrine: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
    safetyConstraints: readonly StudentSafetyConstraint[] | null;
    mode: MealMode;
    scope: MealScope;
    pantry: readonly PantryItem[];
    /** Les clés de la doctrine publiée, pour filtrer `honours_belief_keys`. */
    beliefKeys: readonly string[];
    /**
     * LES MOMENTS D'UNE JOURNÉE NORMALE POUR CET ÉLÈVE — les mêmes que ceux
     * passés à `buildMealPrompt`. Vide = il ne les a pas déclarés.
     *
     * REQUIS, `T` avec une valeur explicite pour « on ne sait pas » (`[]`),
     * jamais `T?`. Ce paramètre n'existait pas, et son absence était le défaut:
     * le plafond du PROMPT suivait le rythme (5 occasions ⇒ 5 plats) pendant que
     * le plafond du PARSEUR l'ignorait et retombait sur trois. Un élève à cinq
     * repas voyait donc ses deux dernières occasions tomber APRÈS génération —
     * c'est-à-dire disparaître, sans que rien ne le dise, ce que le commentaire
     * de `dishCapFor` promettait précisément d'empêcher.
     *
     * Optionnel, il serait ré-oublié par le prochain appelant, en silence, et la
     * seule preuve serait une journée trouée. Même raisonnement que
     * `safetyConstraints` dans `buildWeekPlanPrompt`.
     */
    eatingRhythm: readonly EatingOccasionSlot[];
    /**
     * LES JOURS RÉELLEMENT DEMANDÉS. REQUIS pour la même raison que
     * `eatingRhythm` juste au-dessus: le plafond du parseur doit être celui du
     * prompt, et un paramètre optionnel est un paramètre qu'un appelant oublie
     * — après quoi le prompt demande quatre jours et le parseur en accepte
     * sept, ce qui est exactement le débordement qu'on répare.
     */
    daysToFill: readonly string[];
    /**
     * LES MOMENTS ÉCARTÉS — les mêmes que ceux passés à `buildMealPrompt`.
     *
     * REQUIS, avec `[]` pour « aucun », jamais `T?`. C'est la troisième fois
     * que ce fichier écrit la même phrase, et elle a été payée trois fois: un
     * paramètre optionnel est un paramètre qu'un appelant oublie, après quoi la
     * consigne interdit un moment que le parseur accepte — et le plat interdit
     * arrive dans l'assiette avec l'air d'avoir été voulu.
     */
    awayDays: readonly AwayDay[];
    /**
     * LE TEMPS PAR SESSION DÉCLARÉ PAR L'ÉLÈVE, ou `null` s'il ne l'a pas dit.
     *
     * REQUIS, `T | null`, jamais `T?`: c'est un PLAFOND, et un plafond qu'un
     * appelant peut oublier de passer est un plafond désarmé — le prompt
     * l'annonce, personne ne le vérifie, et on ne le découvre qu'en mesurant un
     * plan à la main. Mesuré le 2026-08-06: 30 minutes déclarées, 55 produites.
     */
    cookingTimeMin: number | null;
    /**
     * FF-038 — LE RÉFÉRENTIEL DE COMPOSITION, ou `null` quand il n'a pas pu
     * être chargé.
     *
     * REQUIS, `T | null`, jamais `T?`. C'est la QUATRIÈME fois que ce fichier
     * écrit cette phrase, et il l'a payée les trois précédentes
     * (`eatingRhythm`, `awayDays`, `cookingTimeMin`): un paramètre optionnel
     * est un paramètre qu'un appelant oublie, et la seule preuve serait une
     * colonne de grammes vide que personne ne regarde. Ici la casse de
     * compilation est LE mécanisme qui recense les deux lanes.
     *
     * `null` est un fail-open ASSUMÉ: les trois champs structurés sont quand
     * même lus et gardés, seuls les grammes manquent. L'instrumentation ne
     * doit jamais coûter un dîner à un élève.
     */
    composition: CompositionIndex | null;
    /**
     * FF-051 — LES MÊMES APPORTS QUE CEUX PASSÉS À `buildMealPrompt`.
     *
     * REQUIS, `[]` pour « aucun ». Les deux bouts, comme pour `awayDays`: une
     * consigne « ne compose pas de petit-déjeuner » sans vérification derrière
     * est une consigne qu'un modèle de composition respectera la plupart du
     * temps — et « la plupart du temps » veut dire que l'élève doit vérifier.
     */
    fixedIntakes: readonly FixedIntake[];
    /**
     * FF-052 — LES MÊMES propriétés que celles passées à `buildMealPrompt`.
     *
     * REQUIS, `[]` pour « rien ». Les deux bouts: la consigne dit « ne compose
     * rien de neuf ce jour-là », le parseur retire le plat neuf s'il arrive
     * quand même.
     */
    dayProperties: readonly DayPropertyEntry[];
    /**
     * L4/D6 — LA MÊME BOUCHE REPRISE que celle passée à `buildMealPrompt`.
     *
     * REQUIS, `T | null`, jamais `T?`. Les DEUX BOUTS, et c'est ce champ qui
     * les tient ensemble: il gouverne le budget de plats (annoncé par la
     * consigne, appliqué ici) ET la garde de préparation juste en dessous. Le
     * jour où les deux appels ne portent pas la même valeur, la consigne
     * demande un second plat que le parseur jette — c'est exactement le défaut
     * mesuré le 2026-08-12, dans les deux sens à la fois.
     */
    merge: MergedEater | null;
  },
): GeneratedMeal {
  const issues: string[] = [];
  const rejectedNumeric: string[] = [];
  const rejectedAisles: string[] = [];
  let unstructuredIngredients = 0;
  /** Les aliments DENSES laissés sans grammes — la part qui coûte le verdict. */
  const unweighedDenseTerms: string[] = [];
  let ingredientCount = 0;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    parsed = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[keel/meal] model output is not a JSON object");
  }

  const root = parsed as Record<string, unknown>;
  const allowedKeys = new Set(args.beliefKeys.map((k) => String(k).trim()).filter(Boolean));
  // LE MÊME PLAFOND QUE LE PROMPT, dérivé du MÊME rythme ET de la MÊME bouche
  // reprise. Deux copies d'un même nombre dont une seule reçoit la modification
  // est le défaut que ce fichier documente deux fois; ici les deux copies lisent
  // la même fonction avec la même entrée, donc elles ne peuvent plus diverger.
  const cap = dishBudgetFor({
    scope: args.scope,
    rhythm: args.eatingRhythm,
    daysToFill: args.daysToFill.length || 7,
    merge: args.merge,
  });

  // ── LA GARDE DE PRÉPARATION DÉPEND DE QUI MANGE ─────────────────────────
  // Résolu UNE fois, hors de la boucle: la question ne se pose pas préparation
  // par préparation, elle se pose une fois pour le plan.
  const secondDishAsked = args.merge !== null && asksForASecondDish(args.merge.shape);
  // LOT C — LA LISTE FERMÉE DES BOUCHES ATTRIBUABLES. Résolue UNE fois, hors de
  // la boucle, pour la même raison que la ligne au-dessus: la question ne se
  // pose pas plat par plat, elle se pose une fois pour le plan.
  const dishBearers = new Set(
    (args.merge?.dishBearerIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );

  // ── LES PLATS ───────────────────────────────────────────────────────────
  // ── LES PRÉPARATIONS ────────────────────────────────────────────────────
  // Parsées AVANT les plats, parce que les plats les référencent: un `uses`
  // qui pointe une préparation inexistante doit être jeté, pas affiché comme
  // « prélève sur quelque chose » que l'élève ne trouvera nulle part.
  const preparations: MealPreparation[] = [];
  for (const [i, entry] of (Array.isArray(root.preparations) ? root.preparations : []).entries()) {
    const prep = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const id = cleanText(prep.id);
    const title = cleanText(prep.title);
    if (!id || !title) {
      issues.push(`preparations[${i}]: missing id or title, dropped`);
      continue;
    }
    const made = Number(prep.servings_made);
    if (!Number.isFinite(made) || (secondDishAsked ? made < 1 : made <= 1)) {
      // ── UNE PORTION: ÇA DÉPEND DE COMBIEN DE BOUCHES ON SERT ────────────
      //
      // SANS FUSION, LA GARDE RESTE ENTIÈRE, et elle est juste: une préparation
      // d'UNE portion n'en est pas une, c'est un plat. La garder ferait afficher
      // une session de cuisine pour une assiette. Rien ne bouge sur la lane
      // individuelle ni sur une composition de foyer ordinaire.
      //
      // ⚠️ AUX BARREAUX ② ET ③, C'EST LE CAS NOMINAL, ET LA GARDE LE JETAIT.
      // Les deux consignes demandent au modèle une préparation POUR UNE SEULE
      // BOUCHE (« give them a SECOND dish », « their dishes »). Mesuré en run
      // réel le 2026-08-12: le modèle a rendu `prep_zoe_tuna_pasta` avec
      // `servings_made: 1`, obéissant parfaitement — la préparation a été jetée,
      // puis le plat qui la citait est devenu `unknown preparation, dropped`. EN
      // BASE, le plat de la personne fusionnée existait comme un TITRE NU,
      // rattaché à aucune préparation et à aucune session de cuisson: la
      // promesse « cuisiné dans la MÊME session » n'était nulle part dans le
      // plan écrit.
      //
      // LE PLANCHER RESTE UNE PORTION. `0`, une valeur négative ou un
      // `servings_made` illisible tombent dans les deux cas: une préparation qui
      // ne nourrit personne n'est pas un plat dédié, c'est une erreur de sortie.
      issues.push(
        secondDishAsked
          ? `preparations[${i}]: servings_made must be >= 1, dropped`
          : `preparations[${i}]: servings_made must be > 1, dropped`,
      );
      continue;
    }
    const method = cleanText(prep.method);
    const numeric = findNumericTarget(`${title} ${method}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(`preparations[${i}]: numeric target (${numeric}) -- dropped`);
      continue;
    }
    const prepIngredients: DishIngredient[] = [];
    let prepNumeric: string | null = null;
    for (const rawIng of (Array.isArray(prep.ingredients) ? prep.ingredients : [])) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<string, unknown>;
      const term = cleanText(ing.term);
      if (!term) continue;
      const quantity = cleanText(ing.quantity) || null;
      if (quantity && ENERGY_UNIT_RE.test(quantity)) { prepNumeric = "energy_unit_in_quantity"; break; }
      const termNumeric = findNumericTarget(`${quantity ?? ""} ${term}`);
      if (termNumeric) { prepNumeric = termNumeric; break; }
      prepIngredients.push({
        term,
        quantity,
        in_pantry: isInPantry(term, args.pantry),
        ...readStructuredQuantity(ing, args.composition, term),
      });
    }
    if (prepNumeric) {
      if (!rejectedNumeric.includes(prepNumeric)) rejectedNumeric.push(prepNumeric);
      issues.push(`preparations[${i}]: numeric target in an ingredient -- dropped`);
      continue;
    }
    const cookOnRaw = cleanText(prep.cook_on).toLowerCase();
    preparations.push({
      id,
      title,
      servingsMade: Math.min(21, Math.round(made)),
      ingredients: prepIngredients,
      method,
      activeMinutes: readMinutes(prep.active_minutes),
      totalMinutes: readMinutes(prep.total_minutes),
      cookOn: DAY_TOKENS.includes(cookOnRaw) ? cookOnRaw : null,
    });
  }
  const preparationIds = new Set(preparations.map((p) => p.id));

  const dishes: GeneratedDish[] = [];
  // ── C7 ② · CE QU'IL FAUT SAVOIR D'UN PLAT GARDÉ POUR LE SACRIFIER JUSTE ──
  //
  // Trois tableaux PARALLÈLES à `dishes`, et pas trois champs sur le plat: la
  // sortie publique (`GeneratedDish`) est écrite en base et lue par les écrans,
  // et y greffer la comptabilité interne du plafond ferait fuiter un rang de
  // sacrifice dans le plan de quelqu'un. Ils bougent ENSEMBLE, toujours: un
  // `splice` qui en oublie un décale les rangs sur tout le reste de la liste.
  /** La case `jour/moment` du plat gardé, `null` quand il n'en a pas. */
  const keptCells: (string | null)[] = [];
  /** Son rang de sacrifice — voir `dishRank`. */
  const keptRanks: number[] = [];
  /** Son index dans la sortie BRUTE: la réconciliation des courses le lit. */
  const keptRawIndex: number[] = [];
  /**
   * LOT 2 — CE QUE SON `same_day` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ QUATRIÈME TABLEAU PARALLÈLE, et pour la raison exacte des trois autres:
   * il faut que le compteur `same_day` compte sur LA MÊME POPULATION que
   * `dishes` — les plats finalement gardés. Un compteur incrémenté au fil de la
   * boucle continuerait de porter le refus d'un plat que le plafond a évincé
   * trois plats plus loin: `declared` (calculé sur la sortie) et `invalid`
   * (accumulé) compteraient alors deux populations différentes. Ce dépôt a payé
   * exactement ça sur `withheld`/`over_cap`, gonflé et dégonflé en sens
   * inverses.
   */
  const keptSameDayFaults: Array<{ invalid: boolean; minutesMissing: boolean }> = [];
  /**
   * LOT 3C — CE QUE SON `for_member_id` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ CINQUIÈME TABLEAU PARALLÈLE, et il suit les mêmes `splice` que les quatre
   * autres, pour la même raison: « déclaré » et « attribué » doivent décrire les
   * MÊMES lignes que `dishes`, sinon le compteur ment sur la seule question
   * qu'on lui pose.
   */
  const keptOwnerFacts: Array<{ declared: boolean; refused: boolean }> = [];

  // ── LES CASES QUE LA CONSIGNE DE FUSION RÉCLAME POUR ELLE ───────────────
  // Vide hors fusion et au barreau ①, et c'est ce qui rend cette couche
  // silencieuse partout ailleurs: sans case réclamée, aucun second plat n'est
  // protégé, et le plafond se comporte comme avant ce lot.
  const dedicatedCells = new Set(
    (args.merge === null ? [] : args.merge.dedicatedCells).map((c) =>
      `${c.day}/${c.slot}`
    ),
  );

  /**
   * LE RANG DE SACRIFICE — plus il est grand, plus le plat est jetable.
   *
   * ⚠️ C'EST LA DÉCISION DE PRODUIT QUE L4 AVAIT LAISSÉE OUVERTE (« réparer
   * vraiment demanderait de choisir quel plat sacrifier »). Le critère
   * n'invente rien: un plat AU-DELÀ de ce que la consigne réclame est le
   * surplus; un plat qui remplit une case attendue ne l'est pas.
   *
   *   `0` — le premier plat d'une case: l'assiette de la table. Jamais
   *         sacrifié tant qu'un surplus existe.
   *   `1` — le second plat d'une case OÙ LA PERSONNE REPRISE MANGE: le plat
   *         dédié que la consigne demande, un par repas à elle.
   *   `2` — tout le reste: un troisième plat dans une case, un second plat
   *         dans une case où personne d'autre ne mange, un plat sans moment.
   *
   * La grille du foyer n'est PAS relue ici, et c'est voulu: les moments
   * écartés, les créneaux déjà pris, les jours de restes et les plats sans jour
   * sont tombés PLUS HAUT, chacun avec son motif. Ce qui arrive jusqu'ici a
   * déjà une case légitime.
   */
  const dishRank = (cell: string | null): number => {
    if (cell === null) return 2;
    let taken = 0;
    for (const kept of keptCells) if (kept === cell) taken++;
    if (taken === 0) return 0;
    if (taken === 1 && dedicatedCells.has(cell)) return 1;
    return 2;
  };

  /**
   * Le plat gardé le PLUS jetable, à condition qu'il le soit plus que celui qui
   * arrive. `-1` quand aucun ne l'est — et alors c'est l'arrivant qui tombe,
   * avec le motif d'avant ce lot, mot pour mot.
   *
   * À rang égal, le PLUS TARD écrit: le départage d'avant ce lot (« les
   * derniers tombent ») est conservé À L'INTÉRIEUR d'un rang, il ne s'applique
   * simplement plus ENTRE deux rangs.
   */
  const sacrificeFor = (rank: number): number => {
    let victim = -1;
    for (let p = 0; p < keptRanks.length; p++) {
      if (keptRanks[p] <= rank) continue;
      if (victim === -1 || keptRanks[p] >= keptRanks[victim]) victim = p;
    }
    return victim;
  };

  const rawDishes = Array.isArray(root.dishes) ? root.dishes : [];
  for (const [i, entry] of rawDishes.entries()) {
    const d = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const title = cleanText(d.title);
    if (!title) {
      issues.push(`dishes[${i}]: empty title, dropped`);
      continue;
    }

    // ── LE JOUR ET LE CRÉNEAU, RÉSOLUS AVANT LE PLAFOND ──────────────────
    // L'ordre compte: un plat posé sur un moment ÉCARTÉ ne doit pas consommer
    // une place du plafond. Le laisser passer la garde du plafond avant de le
    // rejeter ferait tomber, en fin de liste, des plats parfaitement valides —
    // et l'élève verrait un jour vide sans savoir pourquoi.
    const slotRaw = cleanText(d.slot).toLowerCase();
    const slot = (MEAL_SLOTS as readonly string[]).includes(slotRaw)
      ? (slotRaw as MealSlot)
      : null;
    if (slotRaw && !slot) issues.push(`dishes[${i}]: unknown slot ${JSON.stringify(slotRaw)}, dropped`);

    const dayRaw = cleanText(d.day).toLowerCase();
    const day = DAY_TOKENS.includes(dayRaw) ? dayRaw : null;
    if (dayRaw && !day) {
      issues.push(`dishes[${i}]: unknown day token ${JSON.stringify(dayRaw)}, dropped`);
    }

    // ── UN PLAT SANS JOUR N'A PAS DE CASE, ET ÇA SE DIT ──────────────────
    //
    // ⚠️ L'ASYMÉTRIE QUE CE BLOC FERME. Un jeton de jour INCONNU était nommé
    // (juste au-dessus); un jour ABSENT ne l'était pas. Les deux produisent
    // pourtant la même chose — un plat que la grille ne sait poser nulle part.
    //
    // MESURÉ LE 2026-08-12, sur une fusion: un plan portait **16 entrées
    // `dishes` pour 3 jours**, dont **7 sans `day` ni `slot`** — « Roast
    // chicken thighs », « Quinoa », « Cooked rice »… c'est-à-dire LES MÊMES
    // SEPT TITRES que `preparations`. Le modèle avait rendu ses préparations
    // une seconde fois sous forme de plats, le budget relevé par la fusion
    // (`dishBudgetFor`) avait laissé la place, et `issues` ne disait RIEN.
    // Compté sur les autres plans du même run: **0 entrée sans jour sur 14-15**.
    // Le cas n'apparaît qu'avec le budget de fusion.
    //
    // ⚠️ POURQUOI JETER, ET PAS SEULEMENT COMPTER. Sur une fenêtre de plusieurs
    // jours, ce plat n'est ni affichable dans la grille, ni cochable, ni
    // rapprochable d'une photo: il occupe une place du plafond — donc il coûte
    // un VRAI repas de la fin de fenêtre, exactement comme le dîner du dimanche
    // que le débordement a fait tomber le 2026-08-12 — et il gonfle la liste de
    // courses de ce que la préparation achète déjà.
    //
    // ⚠️ SUR UNE FENÊTRE D'UN SEUL JOUR, ON GARDE. Il n'y a alors qu'un jour:
    // le plat est situé sans ambiguïté, et `windowSplit` le range déjà dans la
    // fenêtre. Jeter là serait retirer un repas à quelqu'un pour une clé
    // absente d'un plan qui n'en a pas besoin.
    if (!day && args.scope === "several_days") {
      issues.push(
        `dishes[${i}]: no day token on a multi-day window -- dropped ` +
          `(${JSON.stringify(title)})`,
      );
      continue;
    }

    // ── LE MOMENT ÉCARTÉ MORD ICI, PAS SEULEMENT DANS LA CONSIGNE ────────
    // Une contrainte qui n'existe que dans le prompt n'est pas une garantie:
    // un modèle de composition COMPLÈTE ce qu'on lui donne, c'est son métier.
    // Même posture que le plafond de plats et que le refus des chiffres.
    if (isAway(args.awayDays, day, slot)) {
      issues.push(
        `dishes[${i}]: ${day}/${slot ?? "any"} is a moment they are away -- dropped`,
      );
      continue;
    }

    // ── FF-051 · LE CRÉNEAU DÉJÀ PRIS ───────────────────────────────────
    // Même posture que l'absence juste au-dessus, et même raison: la consigne
    // le dit, le parseur le tient. Seuls les apports REMPLAÇANTS occupent
    // (A5) — un café au lait au petit-déjeuner nomme un moment sans le
    // prendre.
    if (slotIsTaken(args.fixedIntakes, day, slot)) {
      issues.push(
        `dishes[${i}]: ${day ?? "any"}/${slot} is already taken by a fixed intake -- dropped`,
      );
      continue;
    }

    // ── FF-052 · UN JOUR DE RESTES NE COMPOSE RIEN DE NEUF ──────────────
    // Un plat qui PUISE dans une préparation reste — c'est exactement ce
    // qu'on mange un jour de restes. Un plat qui part de zéro tombe: l'élève
    // a déclaré qu'il finirait ce qui existe, et le lui composer par-dessus
    // fait jeter la moitié de son lot.
    //
    // Le `uses` est lu PLUS BAS, mais il est déjà lisible ici sur la sortie
    // brute: le vérifier après coûterait un plat construit puis jeté, et
    // surtout un `honours_belief_keys` déjà compté.
    const usesSomething = Array.isArray(d.uses) && d.uses.length > 0;
    if (!usesSomething && dayHasProperty(args.dayProperties, day, "leftovers")) {
      issues.push(
        `dishes[${i}]: ${day} is a leftovers day -- a dish with no \`uses\` was dropped`,
      );
      continue;
    }

    // ── QUAND ÇA DÉBORDE, C'EST LE SURPLUS QUI TOMBE (C7 ②) ─────────────
    //
    // ⚠️ LA DÉCISION QUE L4 AVAIT LAISSÉE OUVERTE EST PRISE ICI. Le parseur
    // gardait les `cap` PREMIERS plats et jetait la queue; or un modèle écrit sa
    // semaine dans l'ordre, donc le plat perdu n'était jamais « celui en trop »,
    // c'était LE DERNIER REPAS DE LA FENÊTRE. Mesuré deux fois: le dîner du
    // dimanche du foyer (L4), puis le déjeuner ET le dîner du dimanche de la
    // personne reprise, tombés d'une réponse de relance à 20 plats écrêtée à 18
    // (C7 ①).
    //
    // ⚠️ LE PLAFOND N'A PAS BOUGÉ, ET C'EST DÉLIBÉRÉ. Sur le décor mesuré il
    // vaut EXACTEMENT ce que la consigne réclame — 9 plats de foyer + 9 plats
    // dédiés = 18 — et une bonne réponse en fait 18. Lui donner de la marge
    // inviterait le modèle à « déborder poliment pour la remplir », ce que
    // `dishCapFor` documente et que ce dépôt a déjà mesuré une fois. C'est
    // l'ORDRE du sacrifice qui était faux, pas le nombre.
    //
    // ⚠️ L'ÉVICTION EST DIFFÉRÉE JUSQU'AU `push`, ET IL LE FAUT. Ce plat peut
    // encore tomber plus bas (une cible chiffrée, un ingrédient en calories):
    // sacrifier ici ferait perdre un plat gardé au profit d'un plat qui ne
    // survivra pas, c'est-à-dire un repas de moins pour rien.
    const cell = slot ? `${day ?? "any"}/${slot}` : null;
    const rank = dishRank(cell);
    let sacrifice = -1;
    if (dishes.length >= cap) {
      sacrifice = sacrificeFor(rank);
      if (sacrifice === -1) {
        issues.push(`dishes[${i}]: over the ${cap}-dish cap for ${args.scope}, dropped`);
        continue;
      }
    }

    const method = cleanText(d.method);
    const why = cleanText(d.why);

    // ── GARANTIE 1 : PAS DE CIBLE CHIFFRÉE ──────────────────────────────
    // Sur la PROSE uniquement. Les quantités d'ingrédients sont traitées plus
    // bas, avec la règle qui leur convient — les mélanger ici interdirait
    // « 400 g de poulet » et rendrait le générateur incapable d'écrire une
    // recette.
    const numeric = findNumericTarget(`${title} ${method} ${why}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(
        `dishes[${i}]: numeric target (${numeric}) -- rejected, nobody has measured this student`,
      );
      continue;
    }

    // ── FF-061 · LA CULPABILISATION, GARDÉE ICI AUSSI ────────────────────
    //
    // `findGuiltTripping` existait et n'était appliqué qu'au message du soir et
    // à la relance. Le `why` d'un plat est produit par le MÊME modèle, il est
    // affiché à l'élève (`DishCard.tsx`), et il n'était gardé de ce côté par
    // personne — le seul champ de prose libre du plan sans ceinture de ton.
    //
    // ── ON EFFACE LA PHRASE, ON NE JETTE PAS LE PLAT ─────────────────────
    // Le plat est bon; c'est sa justification qui dérape. Le rejeter ferait
    // perdre un dîner pour une tournure, et un générateur qui retire des repas
    // pour un mot est un générateur qu'on désarme. Même geste que
    // `household_restriction_lock.ts`, qui efface le `why` d'un plat plutôt que
    // le plat.
    //
    // MESURÉ AVANT DE BRANCHER (2026-08-12): 1116 `why` déjà en base,
    // **0 déclenchement**. La garde ne coûte rien aujourd'hui — elle attend le
    // jour où le modèle dérive.
    let safeWhy = why;
    if (why) {
      const guilt = findGuiltTripping(why);
      if (guilt.length > 0) {
        safeWhy = "";
        issues.push(
          `dishes[${i}]: guilt_tripping in why (${
            guilt.map((g) => g.matchedText).join(" | ")
          }) -- sentence dropped, dish kept`,
        );
      }
    }

    // ── LES INGRÉDIENTS, ET LA GARANTIE 2 ───────────────────────────────
    const ingredients: DishIngredient[] = [];
    let numericInIngredients: string | null = null;
    for (const [j, rawIng] of (Array.isArray(d.ingredients) ? d.ingredients : []).entries()) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<string, unknown>;
      const term = cleanText(ing.term);
      if (!term) {
        issues.push(`dishes[${i}].ingredients[${j}]: empty term, dropped`);
        continue;
      }
      const quantity = cleanText(ing.quantity) || null;
      // Une unité d'énergie dans une quantité est la seule porte qui restait.
      if (quantity && ENERGY_UNIT_RE.test(quantity)) {
        numericInIngredients = "energy_unit_in_quantity";
        break;
      }
      // Un macro chiffré peut aussi se cacher dans le TERME (« 30 g protein »).
      const termNumeric = findNumericTarget(`${quantity ?? ""} ${term}`);
      if (termNumeric) {
        numericInIngredients = termNumeric;
        break;
      }
      ingredientCount++;
      const structured = readStructuredQuantity(ing, args.composition, term);
      // ── CE QUI N'A PAS PU ÊTRE PESÉ EST COMPTÉ ────────────────────────
      // Sans ce compteur, un contrat de quantités structurées que le modèle
      // ignore ressemble exactement à un contrat qu'il honore: des grammes
      // absents, et rien pour dire lequel des deux. C'est la mesure du §10 de
      // FF-038, et c'est elle qui dira s'il faut durcir la consigne.
      if (structured.amount === null || structured.unit === null) {
        unstructuredIngredients++;
        // ── LES DENSES SONT COMPTÉS À PART, ET C'EST TOUT L'ÉCART ──────
        // Une pincée de sel sans grammes ne déplace rien. Un filet d'huile
        // sans grammes retire 120 kcal d'une assiette, en silence, et fait
        // s'abstenir le verdict entier (`unweighedEnergyDense`). Les compter
        // ensemble donnerait un chiffre où « 26 condiments » et « 1 huile »
        // se ressemblent, alors que le second coûte le plan et le premier
        // rien.
        if (args.composition) {
          const ref = resolveIngredient(args.composition, term);
          if (ref?.energyDense) unweighedDenseTerms.push(term);
        }
      }
      ingredients.push({
        term,
        quantity,
        // JAMAIS `ing.in_pantry`. Le drapeau du modèle n'est pas une preuve:
        // c'est la même faute que l'accusé « c'est noté » sans ligne en base,
        // et elle se paye ici en disant « tu as tout » à quelqu'un qui n'a pas
        // les œufs, un dimanche soir, magasins fermés.
        in_pantry: isInPantry(term, args.pantry),
        ...structured,
      });
    }
    if (numericInIngredients) {
      // ── C7 ⑤ · LE REPAS LE PLUS FRAGILE D'UNE FUSION EST LE PETIT-DÉJEUNER
      //
      // ⚠️ LE VERROU EST JUSTE ET IL NE BOUGE PAS. Ce qui est écrit ici est un
      // CONSTAT, mesuré, pour que quelqu'un le lise avant de chercher ailleurs:
      // sur quatre fusions réelles, le repas qui tombe est presque toujours le
      // petit-déjeuner, et par DEUX causes distinctes.
      //
      //   · CETTE garde — `whey protein 90 g` (L4/O6), puis `protein pancake
      //     mix` (runs 3 et 4): un aliment dont le NOM porte un macro se lit
      //     comme une cible chiffrée, et le plat entier est rejeté. Le
      //     petit-déjeuner est le seul repas dont le rayon vend des produits
      //     nommés d'après un macro; c'est ce qui le rend fragile, pas la garde.
      //   · la relance d'ancre protéique (run 1), qui ne regarde QUE les repas
      //     principaux et pouvait rendre un plan amputé de ses petits-déjeuners
      //     dédiés — refermé par C7 ①.
      //
      // Rien de tout ça n'est un défaut à réparer ici: la case vide est
      // comptée (C2 ④, `empty_slots`) et nommée au modèle. Ce qui manque est
      // une DÉCISION sur la recomposition d'une case vide, et personne ne l'a
      // prise. Le fait, lui, est maintenant écrit là où on tombera dessus.
      if (!rejectedNumeric.includes(numericInIngredients)) {
        rejectedNumeric.push(numericInIngredients);
      }
      issues.push(
        `dishes[${i}]: numeric target (${numericInIngredients}) in an ingredient -- ` +
          `dish rejected (${day ?? "any"}/${slot ?? "any"})`,
      );
      continue;
    }

    // `honours_belief_keys` est INFORMATIF, donc une clé inventée est jetée et
    // comptée — jamais une raison de rejeter le plat. Le laisser passer
    // afficherait en revanche à l'élève une conviction que son coach n'a pas.
    const honours: string[] = [];
    for (const k of (Array.isArray(d.honours_belief_keys) ? d.honours_belief_keys : [])) {
      const key = cleanText(k);
      if (!key) continue;
      if (!allowedKeys.has(key)) {
        issues.push(`dishes[${i}]: honours_belief_keys ${JSON.stringify(key)} is not in the doctrine, dropped`);
        continue;
      }
      if (!honours.includes(key)) honours.push(key);
    }

    // CE QUE LE PLAT PRÉLÈVE. Une référence inconnue est JETÉE et comptée: la
    // garder afficherait « prélève sur la préparation X » quand X n'existe
    // nulle part, et l'élève chercherait une casserole qu'on ne lui a jamais
    // demandé de faire.
    const uses: Array<{ preparationId: string; servings: number }> = [];
    for (const rawUse of (Array.isArray(d.uses) ? d.uses : [])) {
      const u = (rawUse && typeof rawUse === "object" ? rawUse : {}) as Record<string, unknown>;
      const prepId = cleanText(u.preparation_id);
      if (!prepId) continue;
      if (!preparationIds.has(prepId)) {
        issues.push(
          `dishes[${i}].uses: unknown preparation ${JSON.stringify(prepId)}, dropped`,
        );
        continue;
      }
      const servings = Number(u.servings);
      uses.push({
        preparationId: prepId,
        servings: Number.isFinite(servings) && servings > 0
          ? Math.min(12, Math.round(servings))
          : 1,
      });
    }

    // ── C7 ② · LE SURPLUS TOMBE MAINTENANT, ET PAS AVANT ────────────────
    // Le plat a franchi TOUTES les gardes: il est écrit dans le plan. C'est le
    // seul moment où retirer un plat déjà gardé est justifié.
    if (sacrifice >= 0) {
      issues.push(
        `dishes[${i}]: over the ${cap}-dish cap for ${args.scope} -- kept, and the ` +
          `surplus dish ${JSON.stringify(dishes[sacrifice].title)} ` +
          `(${keptCells[sacrifice] ?? "no slot"}) was dropped instead`,
      );
      dishes.splice(sacrifice, 1);
      keptCells.splice(sacrifice, 1);
      keptRanks.splice(sacrifice, 1);
      keptRawIndex.splice(sacrifice, 1);
      keptSameDayFaults.splice(sacrifice, 1);
      keptOwnerFacts.splice(sacrifice, 1);
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT C — À QUI CE PLAT EST DÉDIÉ, POSÉ À LA CRÉATION
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ DEUX PORTES, ET LES DEUX COMPTENT.
    //
    //   ① LA CONSIGNE DOIT AVOIR RÉCLAMÉ UN PLAT DÉDIÉ (`secondDishAsked`). Au
    //      barreau ① le prompt dit « Do NOT propose separate dishes »: un
    //      `for_member_id` qui arriverait quand même attribuerait le plat de la
    //      TABLE à une personne, et la vue par personne le retirerait alors à
    //      tous les autres. C'est un faux plus cher que l'absence.
    //   ② L'ID DOIT ÊTRE DANS LA LISTE FERMÉE (`dishBearerIds`) — les bouches à
    //      qui la consigne promet vraiment un plat. Le patron est celui de
    //      `preparation_id` juste au-dessus: inventé par le modèle, vérifié
    //      contre une liste, JETÉ et compté quand il n'y est pas.
    //
    // ⛔ AUCUNE LECTURE DE TITRE. Le seul marqueur qui existait avant ce lot
    // était « for Zoe » écrit dans le titre par le modèle, et un matcher
    // là-dessus attribuerait de travers dès « Chicken for Zoe and Marc » — et
    // rien du tout dès que le plan sort en français.
    //
    // ⚠️ UN `for_member_id` REFUSÉ NE REJETTE JAMAIS LE PLAT. L'attribution est
    // une lecture EN PLUS; un plat sans elle reste un plat qui se cuisine et se
    // mange. Même posture que `honours_belief_keys`: informatif, donc jeté et
    // compté, jamais une raison de retirer un dîner à quelqu'un.
    //
    // ⚠️ LOT 3C — LES DEUX FAITS SE COMPTENT SÉPARÉMENT, ET C'EST LE POINT.
    // « Le modèle n'a rien écrit » et « le modèle a écrit un id qu'on a refusé »
    // rendaient tous deux `attributed: 0`, et ils appellent des corrections
    // opposées. Voir `dish_owner_counts`.
    let memberId: string | null = null;
    let ownerDeclared = false;
    let ownerRefused = false;
    const declaredFor = cleanText(d.for_member_id);
    if (declaredFor) {
      ownerDeclared = true;
      if (!secondDishAsked) {
        ownerRefused = true;
        issues.push(
          `dishes[${i}]: for_member_id on a shared dish (no dedicated dish was ` +
            `asked), dropped`,
        );
      } else if (!dishBearers.has(declaredFor)) {
        ownerRefused = true;
        issues.push(
          `dishes[${i}]: for_member_id ${JSON.stringify(declaredFor)} is not a ` +
            `mouth that gets its own dish, dropped`,
        );
      } else {
        memberId = declaredFor;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT 2 — CE QU'ON FAIT LE JOUR MÊME, DÉCLARÉ ET VALIDÉ FERMÉ
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE PATRON EST CELUI DE `for_member_id` JUSTE AU-DESSUS, ET IL N'EST PAS
    // NÉGOCIABLE ICI: le jeton est INVENTÉ par le modèle, vérifié contre
    // `SAME_DAY_KINDS`, JETÉ et COMPTÉ quand il n'y est pas. Aucune lecture de
    // `method` n'intervient — le seul marqueur qui existait avant ce lot était la
    // prose (« reheat a portion »), et un matcher là-dessus se tromperait sur
    // « do not reheat », sur « assemble the reheated chicken », et sur la
    // totalité des plans rendus en français. « Jamais de matcher maison »,
    // douzième fois.
    //
    // ⚠️ UN `same_day` REFUSÉ NE REJETTE JAMAIS LE PLAT. Posture
    // `for_member_id` / `honours_belief_keys`: le commentaire du jour est une
    // lecture EN PLUS, et retirer un dîner à quelqu'un parce qu'un modèle a
    // écrit « warm_up » au lieu de « reheat_only » serait payer un champ
    // informatif au prix d'un repas.
    let sameDay: DishSameDay | null = null;
    let sameDayInvalid = false;
    let sameDayMinutesMissing = false;
    const rawSameDay = d.same_day;
    if (rawSameDay !== null && rawSameDay !== undefined) {
      const sd = (typeof rawSameDay === "object" ? rawSameDay : {}) as Record<
        string,
        unknown
      >;
      const kindRaw = cleanText(sd.kind).toLowerCase();
      if (!(SAME_DAY_KINDS as readonly string[]).includes(kindRaw)) {
        sameDayInvalid = true;
        issues.push(
          `dishes[${i}]: same_day.kind ${JSON.stringify(kindRaw)} is not one of ` +
            `${SAME_DAY_KINDS.join("/")}, dropped`,
        );
      } else {
        // LES MINUTES SONT LUES À PART, ET LEUR ABSENCE NE COÛTE PAS LE JETON.
        // Le geste (« à réchauffer ») est ce qui manquait au produit; la durée
        // est ce qui le rend décidable. Perdre le premier parce que le second
        // est illisible échangerait la moitié qui compte contre la moitié qui
        // aide. `null`, JAMAIS zéro: « 0 min » se lit « c'est instantané ».
        const minutesRaw = Number(sd.minutes);
        let minutes: number | null = null;
        if (Number.isFinite(minutesRaw) && minutesRaw >= 0) {
          minutes = Math.min(SAME_DAY_MAX_MINUTES, Math.round(minutesRaw));
          if (minutes !== Math.round(minutesRaw)) {
            issues.push(
              `dishes[${i}]: same_day.minutes ${Math.round(minutesRaw)} is over the ` +
                `${SAME_DAY_MAX_MINUTES}-minute ceiling for a day-of gesture -- capped`,
            );
          }
        } else {
          sameDayMinutesMissing = true;
          issues.push(
            `dishes[${i}]: same_day.kind is ${kindRaw} but its minutes are not a ` +
              `usable number -- the gesture is kept, the duration is not invented`,
          );
        }
        sameDay = { kind: kindRaw as SameDayKind, minutes };

        // ── LA COHÉRENCE DOUCE: COMPTÉE, NOMMÉE, JAMAIS REJETÉE ───────────
        // Trois contradictions que la donnée porte déjà et que personne ne
        // lisait: un plat qui dit « juste réchauffer » sans rien à réchauffer,
        // un plat qui dit « rien à préparer » en puisant dans un lot, et un
        // plat qui dit « rien à préparer » en annonçant une durée. Aucune ne
        // rend le plan inexécutable — on ne peut pas savoir laquelle des deux
        // moitiés a tort — donc c'est un CONSTAT, du même rang que
        // `protein_anchor_missing`.
        if (sameDay.kind === "reheat_only" && uses.length === 0) {
          issues.push(
            `dishes[${i}]: same_day says reheat_only but the dish uses no ` +
              `preparation -- nothing to reheat`,
          );
        }
        if (sameDay.kind === "none" && uses.length > 0) {
          issues.push(
            `dishes[${i}]: same_day says none but the dish draws on ` +
              `${uses.length} preparation(s) -- at least the box comes out`,
          );
        }
        // ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-17, ET C'EST POURQUOI CE TROISIÈME
        // CONSTAT EXISTE. Sur un plan foyer de 24 plats, DEUX portaient
        // `{kind: "none", minutes: 5}` — « Apple and peanut butter »,
        // « Hummus and carrot sticks ». L'écran compose alors le libellé du
        // jeton avec la durée et rend « Rien à préparer — 5 min », qui se
        // contredit dans la même ligne. Le modèle lit `none` comme « rien à
        // CUIRE » là où le prompt dit « rien à FAIRE »; le geste réel de ces
        // deux plats est `assemble`.
        //
        // Compté, jamais rejeté, pour la raison des deux constats du dessus: on
        // ne sait pas laquelle des deux moitiés a tort — la durée peut être
        // juste et le jeton faux. C'est le prompt qu'il faudra resserrer, et ce
        // constat est ce qui rendra le resserrage mesurable.
        if (sameDay.kind === "none" && sameDay.minutes !== null && sameDay.minutes > 0) {
          issues.push(
            `dishes[${i}]: same_day says none but announces ` +
              `${sameDay.minutes} minute(s) -- nothing to prepare cannot take time`,
          );
        }
      }
    }

    dishes.push({
      title,
      slot,
      day,
      ingredients,
      method,
      // FF-061: la phrase EFFACÉE quand elle culpabilise, jamais la brute.
      why: safeWhy,
      honours_belief_keys: honours,
      uses,
      memberId,
      sameDay,
    });
    keptSameDayFaults.push({
      invalid: sameDayInvalid,
      minutesMissing: sameDayMinutesMissing,
    });
    keptOwnerFacts.push({ declared: ownerDeclared, refused: ownerRefused });
    keptCells.push(cell);
    keptRanks.push(rank);
    keptRawIndex.push(i);
  }

  // ── LA LISTE DE COURSES ─────────────────────────────────────────────────
  const shopping: ShoppingItem[] = [];
  const seenShopping = new Set<string>();
  for (const [i, rawItem] of (Array.isArray(root.shopping_list) ? root.shopping_list : []).entries()) {
    const s = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Record<string, unknown>;
    const term = cleanText(s.term);
    if (!term) {
      issues.push(`shopping_list[${i}]: empty term, dropped`);
      continue;
    }
    const quantity = cleanText(s.quantity) || null;
    if (quantity && ENERGY_UNIT_RE.test(quantity)) {
      if (!rejectedNumeric.includes("energy_unit_in_quantity")) {
        rejectedNumeric.push("energy_unit_in_quantity");
      }
      issues.push(`shopping_list[${i}]: a shopping quantity is never in calories -- dropped`);
      continue;
    }

    // ── GARANTIE 3 : RAYON DANS LE VOCABULAIRE FERMÉ ───────────────────
    const aisleRaw = cleanText(s.aisle).toLowerCase();
    let aisle: ShoppingAisle;
    if ((SHOPPING_AISLES as readonly string[]).includes(aisleRaw)) {
      aisle = aisleRaw as ShoppingAisle;
    } else {
      // Dégradé vers `other` plutôt que rejeté: perdre un ingrédient parce que
      // le modèle a écrit « vegetables » au lieu de « produce » enverrait
      // l'élève au supermarché avec une liste incomplète. Le rayon est du
      // confort de rangement, pas une garantie de sécurité — la dégradation
      // est donc le bon arbitrage, et elle est COMPTÉE.
      if (aisleRaw && !rejectedAisles.includes(aisleRaw)) rejectedAisles.push(aisleRaw);
      if (aisleRaw) issues.push(`shopping_list[${i}]: unknown aisle ${JSON.stringify(aisleRaw)}, filed under other`);
      aisle = "other";
    }

    // Dédup sur le terme normalisé: deux plats qui utilisent des oignons ne
    // doivent pas produire deux lignes « oignons ».
    const dedup = normalizePantryTerm(term);
    if (seenShopping.has(dedup)) {
      issues.push(`shopping_list[${i}]: duplicate ${JSON.stringify(term)}, kept the first`);
      continue;
    }
    seenShopping.add(dedup);
    shopping.push({ term, quantity, aisle });
  }

  // ── C7 ③ · ON N'ACHÈTE PAS POUR UN PLAT QUI N'EST PAS AU PLAN ──────────
  //
  // ⚠️ MESURÉ LE 2026-08-12 SUR TROIS FUSIONS RÉELLES. Le plafond et le rejet
  // de cible chiffrée jettent des plats; la liste de courses, parsée plus bas,
  // n'en savait rien. Run 1: CINQ lignes orphelines (`kidney beans`, `pork
  // mince`, `bok choy`, `sesame oil`, `soy sauce`) — exactement les ingrédients
  // des deux plats tombés. Run 3: TROIS. Le foyer paie et jette.
  //
  // ── LE RATTACHEMENT, ET POURQUOI IL EST EXACT ET PAS TOLÉRANT ──────────
  // ⚠️ JAMAIS DE MATCHER MAISON SUR DU TEXTE ALIMENTAIRE. « laitue » contient
  // « lait », et `isInPantry` — qui accepte justement l'inclusion — dirait donc
  // qu'une ligne « lait » couvre une « laitue ». Ici, une correspondance fausse
  // RETIRE une ligne de courses: quelqu'un part au magasin sans ce qu'il lui
  // faut. Le seul rattachement utilisé est donc l'ÉGALITÉ normalisée
  // (`normalizePantryTerm`), c'est-à-dire exactement la jointure que ce fichier
  // fait déjà deux fois — le dédoublonnage de la liste juste au-dessus, et la
  // reprise du rayon en mode `from_pantry` juste en dessous.
  //
  // ── TROIS SORTS, ET LE DOUTE NE RETIRE RIEN ───────────────────────────
  //   · la ligne est réclamée par un plat GARDÉ (ou une préparation gardée)
  //     ⇒ elle reste, même si un plat tombé la citait aussi. « Ne retire que si
  //     plus AUCUN plat gardé ne la réclame »: un oignon sert cinq plats.
  //   · la ligne est réclamée par un plat TOMBÉ et par personne d'autre
  //     ⇒ elle part, et son terme est NOMMÉ dans les `issues`.
  //   · la ligne ne se rattache à RIEN de connu ⇒ ELLE RESTE, et elle est
  //     COMPTÉE. C'est le « je n'ai pas su rattacher » du lot: le modèle écrit
  //     « chicken breasts » dans la liste et « chicken breast » dans le plat,
  //     et deviner là-dessus coûterait un dîner.
  //
  // ── C8 ② · LE DOUTE SE COMPTE MÊME QUAND AUCUN PLAT N'EST TOMBÉ ────────
  //
  // ⚠️ MESURÉ SUR LES FUSIONS RÉELLES, DEUX FOIS. Sur les réponses brutes du
  // 2026-08-12, deux runs sur quatre portaient une ligne réclamée par AUCUN
  // plat gardé (`spring greens`, `protein pancakes`). Sur les 18 fusions
  // ARCHIVÉES en base: HUIT en portent au moins une, et TROIS d'entre elles
  // n'ont fait tomber aucun plat (`be17ae53…`, `dc5c8dd3…`, `c4f36c5f…`).
  //
  // Ces trois-là étaient MUETTES: toute la réconciliation vivait sous « un plat
  // est tombé », donc le doute n'était compté que par accident, quand un plat
  // tombait par ailleurs. Le foyer achetait pour rien, EN SILENCE.
  //
  // ⚠️ CE QUI CHANGE EST LE COMPTE, JAMAIS L'ACTION. Une ligne qu'on ne sait
  // pas rattacher RESTE — c'est l'arbitrage de C7 ③ et il ne bouge pas d'un
  // octet: une correspondance fausse retire une ligne dont un plat a besoin.
  // Le RETRAIT continue de n'exister que pour une ligne réclamée par un plat
  // TOMBÉ, donc `droppedDishTerms` vide ⇒ aucune ligne ne part, jamais.
  //
  // LE CAS QUI PASSE DEVIENT PLUS ÉTROIT, ET C'EST LE BON: un plan dont chaque
  // ligne est réclamée par un plat gardé ne porte AUCUNE `issue` de courses et
  // ne perd rien. C'était « aucun plat tombé »; c'est désormais « tout est
  // rattaché ».
  const keptDishIndexes = new Set(keptRawIndex);
  const droppedDishTerms = new Set<string>();
  for (const [i, entry] of rawDishes.entries()) {
    if (keptDishIndexes.has(i)) continue;
    const dropped = (entry && typeof entry === "object" ? entry : {}) as Record<
      string,
      unknown
    >;
    for (const rawIng of (Array.isArray(dropped.ingredients) ? dropped.ingredients : [])) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<
        string,
        unknown
      >;
      const normalized = normalizePantryTerm(cleanText(ing.term));
      if (normalized) droppedDishTerms.add(normalized);
    }
  }
  let reconciledShopping = shopping;
  if (shopping.length > 0) {
    // ⚠️ LES PRÉPARATIONS GARDÉES COMPTENT COMME DES RÉCLAMANTES. Un plat de
    // lot ne répète pas la recette de sa préparation (le prompt système le
    // demande): ne regarder que `dish.ingredients` ferait retirer les courses
    // de toutes les cuissons par lot.
    const claimed = new Set<string>();
    for (const dish of dishes) {
      for (const ing of dish.ingredients) claimed.add(normalizePantryTerm(ing.term));
    }
    for (const prep of preparations) {
      for (const ing of prep.ingredients) claimed.add(normalizePantryTerm(ing.term));
    }
    const orphans: string[] = [];
    let unattached = 0;
    reconciledShopping = shopping.filter((line) => {
      const normalized = normalizePantryTerm(line.term);
      if (claimed.has(normalized)) return true;
      if (droppedDishTerms.has(normalized)) {
        orphans.push(line.term);
        return false;
      }
      unattached++;
      return true;
    });
    if (orphans.length > 0) {
      issues.push(
        `shopping_list: ${orphans.length} line(s) bought for a dish that is not in ` +
          `the plan -- removed (${orphans.join(", ")})`,
      );
    }
    if (unattached > 0) {
      issues.push(
        `shopping_list_unattributed: ${unattached}/${shopping.length} lines match ` +
          `no kept and no dropped ingredient -- kept, not guessed`,
      );
    }
  }

  // ── EN MODE `from_pantry`, LA LISTE EST CE QUI MANQUE ───────────────────
  // Recalculée à partir des ingrédients réellement retenus, pas reprise du
  // modèle: c'est la seule façon que « il ne te manque rien » soit vrai.
  let finalShopping = reconciledShopping;
  if (args.mode === "from_pantry") {
    const missing: ShoppingItem[] = [];
    const seenMissing = new Set<string>();
    for (const dish of dishes) {
      for (const ing of dish.ingredients) {
        if (ing.in_pantry) continue;
        const dedup = normalizePantryTerm(ing.term);
        if (seenMissing.has(dedup)) continue;
        seenMissing.add(dedup);
        // On garde le rayon que le modèle avait donné pour ce terme s'il en a
        // donné un; sinon `other`. LA LISTE RÉCONCILIÉE (C7 ③), pas la brute:
        // une ligne retirée parce qu'elle n'appartenait qu'à un plat tombé n'a
        // pas à revenir par la porte du rayon.
        const known = reconciledShopping.find((s) =>
          normalizePantryTerm(s.term) === dedup
        );
        missing.push({
          term: ing.term,
          quantity: ing.quantity ?? known?.quantity ?? null,
          aisle: known?.aisle ?? "other",
        });
      }
    }
    finalShopping = missing;
  }

  // ── GARANTIE 4 : LA CEINTURE DE SORTIE, SUR TOUT LE TEXTE VISIBLE ───────
  // Titres, méthode, justification, ingrédients ET liste de courses. Oublier
  // la liste laisserait passer l'allergène par la porte de derrière — c'est
  // exactement le défaut mesuré sur le plan hebdo, où la citation du coach
  // échappait au filtre numérique parce que personne ne l'avait listée comme
  // du texte visible.
  const rendered = [
    ...dishes.map((d) =>
      `${d.title}. ${d.method} ${d.why} ${d.ingredients.map((i) => i.term).join(", ")}`
    ),
    ...finalShopping.map((s) => s.term),
  ].join("\n");

  const lock = applyKeelOutputLocks({
    text: rendered,
    isKeelStudent: true,
    safetyConstraints: args.safetyConstraints,
    doctrine: args.doctrine,
  });
  const clean = lock.reason === "clean" || lock.reason.startsWith("disarmed");

  // ── FF-037 : L'ANCRE PROTÉIQUE DES REPAS PRINCIPAUX ─────────────────────
  // Une règle qui n'existe que dans le prompt n'est pas une garantie. Ce
  // fichier l'écrit déjà trois fois — pour le plafond de plats, les moments
  // écartés et le temps de session — et l'a payée les trois fois. La consigne
  // demande une ancre; ceci VÉRIFIE qu'elle est là.
  //
  // PASS-WITH-ISSUE. Le plat est conservé. Seul le verrou binaire de sécurité
  // vide un repas; un constat de composition n'a jamais ce pouvoir, et un
  // `empty_meal` sur un motif pareil serait un refus dont l'élève ne peut rien
  // faire (FF-037 R5).
  //
  // LES INGRÉDIENTS DE LA PRÉPARATION COMPTENT. Le prompt système demande
  // explicitement qu'un plat qui puise dans un lot NE RÉPÈTE PAS sa recette:
  // ne regarder que `dish.ingredients` ferait donc signaler tous les plats de
  // batch, c'est-à-dire précisément l'architecture qu'on a demandée.
  const proteinAnchorMissing: string[] = [];
  for (const [i, dish] of dishes.entries()) {
    if (!isMainMealSlot(dish.slot)) continue;
    const fromPreparations = dish.uses.flatMap((u) =>
      preparations.find((p) => p.id === u.preparationId)?.ingredients ?? []
    );
    if (detectProteinAnchor([...dish.ingredients, ...fromPreparations])) continue;
    proteinAnchorMissing.push(dish.title);
    issues.push(
      `dishes[${i}]: protein_source_missing -- ${dish.slot} carries no protein food`,
    );
  }

  // ── FF-038 : CE QUE LE CONTRAT DE QUANTITÉS A RENDU ─────────────────────
  // UNE SEULE issue agrégée, et pas une par ingrédient: le contrat est
  // nouveau, un modèle qui l'ignore en entier produirait quarante lignes
  // identiques qui noieraient les constats utiles (un allergène, un lot gardé
  // six jours). Le CHIFFRE est ce qu'on veut lire, pas la liste.
  if (ingredientCount > 0 && unstructuredIngredients > 0) {
    issues.push(
      `structured_quantity_missing: ${unstructuredIngredients}/${ingredientCount} ingredients`,
    );
  }
  // ── LA PART DENSE, NOMMÉE ───────────────────────────────────────────────
  // Ici on NOMME, contrairement au compteur ci-dessus: la liste est courte par
  // construction (une huile, un beurre), et c'est le terme exact qu'il faut
  // pour savoir si la consigne du prompt a porté. Mesuré le 2026-08-12 sur 80
  // générations: 82 lignes d'huile d'olive sans quantité, chacune éteignant le
  // verdict de son plan.
  if (unweighedDenseTerms.length > 0) {
    issues.push(
      `energy_dense_unweighed: ${[...new Set(unweighedDenseTerms)].join(", ")}`,
    );
  }
  if (args.composition === null) {
    // NOMMÉ, sinon un référentiel indisponible en boucle ressemblerait à un
    // modèle qui n'écrit pas ses quantités — deux causes opposées, une seule
    // apparence.
    issues.push("composition_index_unavailable: grams not computed");
  }

  // ── LES SESSIONS DE CUISINE ─────────────────────────────────────────────
  // Une session qui ne fait AUCUNE préparation connue est jetée: elle
  // annoncerait un dimanche de cuisine sans rien à cuisiner.
  const cookingSessions: CookingSession[] = [];
  for (
    const [i, entry] of (Array.isArray(root.cooking_sessions) ? root.cooking_sessions : [])
      .entries()
  ) {
    const raw = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const dayRaw = cleanText(raw.day).toLowerCase();
    if (!DAY_TOKENS.includes(dayRaw)) {
      issues.push(`cooking_sessions[${i}]: unknown day, dropped`);
      continue;
    }
    const ids = (Array.isArray(raw.preparation_ids) ? raw.preparation_ids : [])
      .map((v) => cleanText(v))
      .filter((v) => preparationIds.has(v));
    if (ids.length === 0) {
      issues.push(`cooking_sessions[${i}]: no known preparation, dropped`);
      continue;
    }
    const runThrough = cleanText(raw.run_through);
    const numeric = findNumericTarget(runThrough);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(`cooking_sessions[${i}]: numeric target (${numeric}) -- dropped`);
      continue;
    }
    cookingSessions.push({
      day: dayRaw,
      preparationIds: ids,
      runThrough,
      totalMinutes: readMinutes((raw as Record<string, unknown>).total_minutes),
    });
  }

  // LE JOUR DE CUISSON VIENT DE LA SESSION, pas de la préparation. Le modèle
  // remplit `cook_on` de façon inégale; la session, elle, EST le moment. Quand
  // les deux se contredisent, la session gagne — c'est elle que l'élève lit.
  for (const session of cookingSessions) {
    for (const id of session.preparationIds) {
      const prep = preparations.find((p) => p.id === id);
      if (prep) prep.cookOn = session.day;
    }
  }

  // ── UNE SESSION QUI DÉBORDE LE TEMPS DÉCLARÉ ────────────────────────────
  // Le temps par session est une CONTRAINTE, pas une indication: c'est ce que
  // l'élève a ce soir-là. Le prompt le dit; ceci le vérifie, parce que mesuré
  // le 2026-08-06 il annonçait « about 30 minutes » et recevait une session de
  // 55. La marge de dix minutes n'est pas de la complaisance: une estimation de
  // cuisine à cinq minutes près n'existe pas, et signaler 62 contre 60 ferait
  // du bruit que personne ne lirait — ce qui finit par cacher les vrais 95.
  if (args.cookingTimeMin) {
    for (const session of cookingSessions) {
      if (session.totalMinutes === null) continue;
      if (session.totalMinutes > args.cookingTimeMin + 10) {
        issues.push(
          `cooking session on ${session.day} runs ${session.totalMinutes} min, ` +
          `but they said they have about ${args.cookingTimeMin}`,
        );
      }
    }
  }

  // ── UN LOT GARDÉ TROP LONGTEMPS ─────────────────────────────────────────
  // MESURÉ sur un vrai plan: des légumes rôtis cuisinés le jeudi et mangés le
  // mercredi suivant — J+6. Des boulettes à J+5, du couscous à J+5. Rien dans
  // ce moteur ne parlait de conservation, à aucun endroit: ni règle, ni garde,
  // ni même le mot.
  //
  // TROIS JOURS, et le même seuil pour tout: c'est le plancher raisonnable pour
  // du cuisiné au réfrigérateur. Le prompt distingue le riz et les produits de
  // la mer, plus stricts encore; le contrôle ici reste volontairement UNIQUE et
  // grossier, parce qu'un seuil par famille d'aliment demanderait de classer
  // chaque préparation — une déduction, sur un sujet où se tromper rend malade.
  //
  // ON SIGNALE, ON NE RÉÉCRIT PAS: raccourcir la portée retirerait un repas à
  // l'élève, et déplacer la cuisson inventerait un jour qu'il n'a pas déclaré.
  const window = args.daysToFill.length > 0 ? args.daysToFill : DAY_TOKENS;
  const posOf = (day: string) => {
    const at = window.indexOf(day);
    return at >= 0 ? at : DAY_TOKENS.indexOf(day);
  };
  for (const prep of preparations) {
    if (!prep.cookOn) continue;
    const cookAt = posOf(prep.cookOn);
    if (cookAt < 0) continue;
    for (const dish of dishes) {
      if (!dish.day) continue;
      if (!dish.uses.some((u) => u.preparationId === prep.id)) continue;
      const eatAt = posOf(dish.day);
      if (eatAt < 0) continue;
      if (eatAt - cookAt > MAX_FRIDGE_DAYS) {
        issues.push(
          `"${prep.title}" is cooked on ${prep.cookOn} and still eaten on ` +
          `${dish.day} -- ${eatAt - cookAt} days in the fridge`,
        );
      }
    }
  }

  // ── FF-052 · UN JOUR DE BATCH SANS SESSION ───────────────────────────────
  // ON COMPTE, ON N'INVENTE PAS. C'est l'asymétrie délibérée avec `leftovers`
  // (qui, lui, RETIRE): on peut supprimer un plat qui n'aurait pas dû exister,
  // on ne peut pas inventer une session que le modèle n'a pas écrite —
  // fabriquer une préparation produirait une recette que personne n'a rédigée,
  // avec des quantités que personne n'a posées.
  //
  // Un `issues` compté est ce que ce dépôt fait des non-conformités du modèle,
  // et c'est ce qui dira, en production, si la consigne mord. Si elle ne mord
  // pas, c'est le PROMPT qu'il faut corriger, pas le parseur.
  //
  // Restreint à la FENÊTRE: réclamer une session un jour qu'on n'a pas demandé
  // de remplir produirait une issue sur chaque plan, pour toujours.
  for (const day of daysWithProperty(args.dayProperties, "batch_cook")) {
    if (args.daysToFill.length > 0 && !args.daysToFill.includes(day)) continue;
    if (preparations.some((p) => p.cookOn === day)) continue;
    issues.push(
      `${day} is a batch-cooking day -- no preparation was cooked there`,
    );
  }

  // ── UN LOT MANGÉ AVANT D'ÊTRE CUISINÉ ────────────────────────────────────
  // MESURÉ: fenêtre jeudi→dimanche, seul jour de cuisine déclaré encore
  // disponible le dimanche, et le modèle a fait puiser le déjeuner de JEUDI
  // dans un lot cuisiné le DIMANCHE. La consigne le dit maintenant; ceci le
  // VÉRIFIE, parce qu'une consigne de prompt n'est pas une garantie et que ce
  // dépôt a déjà payé plusieurs fois la différence.
  //
  // On SIGNALE, on ne réécrit pas: déplacer la session inventerait un jour de
  // cuisine que l'élève n'a pas déclaré, et retirer le plat lui prendrait un
  // repas. L'anomalie est nommée dans `issues`, qui est ce qu'on lit quand un
  // plan sort de travers.
  const orderOf = (day: string) => DAY_TOKENS.indexOf(day);
  for (const dish of dishes) {
    if (!dish.day) continue;
    for (const use of dish.uses) {
      const prep = preparations.find((p) => p.id === use.preparationId);
      if (!prep?.cookOn || !dish.day) continue;
      // Les deux jours sont lus dans l'ordre de la FENÊTRE, pas du calendrier:
      // un plan jeudi→dimanche a jeudi en premier, et « lundi » y serait la
      // semaine suivante.
      const cookAt = window.indexOf(prep.cookOn);
      const eatAt = window.indexOf(dish.day);
      const known = cookAt >= 0 && eatAt >= 0;
      const after = known
        ? cookAt > eatAt
        : orderOf(prep.cookOn) > orderOf(dish.day);
      if (after) {
        issues.push(
          `"${dish.title}" (${dish.day}) eats from "${prep.title}", cooked on ` +
          `${prep.cookOn} -- after the meal`,
        );
      }
    }
  }

  // ── C2 ④ · LES CASES QUE PERSONNE NE REMPLIT ────────────────────────────
  //
  // MESURÉ DEUX FOIS LE 2026-08-12: les cinq petits-déjeuners du foyer sont
  // tombés d'un coup parce qu'un plat citait « whey protein 90 g », et la seule
  // trace était la ligne du plat REJETÉ. « Ce plat est tombé » et « il n'y a
  // plus de petit-déjeuner de la semaine » ne sont pas la même information, et
  // c'est la seconde qu'on lit quand on ouvre son plan.
  //
  // ⚠️ CONSTAT, JAMAIS RÉPARATION. On ne recompose pas la case: choisir quoi y
  // mettre est une décision de produit que personne n'a prise, et l'inventer ici
  // écrirait une recette que personne n'a rédigée. Même posture, mot pour mot,
  // que « un jour de batch sans session » vingt lignes plus haut.
  //
  // GARDÉ SUR `clean`, comme les plats: quand le verrou de sortie a vidé le
  // plan entier, annoncer vingt et une cases vides serait un bruit qui
  // masquerait le seul fait utile (l'allergène).
  //
  // UNE SEULE `issue` AGRÉGÉE, et la liste STRUCTURÉE à côté: vingt et une
  // lignes noieraient les constats utiles, et un `issues.length` qui explose
  // change ce qu'un lecteur voit en premier.
  const emptySlots = clean
    ? emptySlotsIn({
      days: args.daysToFill,
      rhythm: args.eatingRhythm,
      dishes,
      awayDays: args.awayDays,
      fixedIntakes: args.fixedIntakes,
    })
    : [];
  if (emptySlots.length > 0) {
    issues.push(`empty_slots: ${emptySlotsLine(emptySlots)}`);
  }

  // ── LOT 2 · LE COMPTEUR DU GESTE DU JOUR J ──────────────────────────────
  //
  // Calculé ICI, une seule fois, sur les tableaux FINAUX — donc sur exactement
  // la population que le plan porte. `declared` se lit sur la sortie,
  // `invalid`/`minutes_missing` sur le tableau parallèle qui a suivi les mêmes
  // `splice`: les quatre nombres décrivent les mêmes lignes.
  //
  // GARDÉ SUR `clean`, comme les plats eux-mêmes: quand le verrou de sortie a
  // vidé le plan, annoncer « 6 plats, 5 déclarés » sur un plan qui n'a plus
  // aucun plat serait un chiffre faux sur une ligne réelle.
  const sameDayCounts = clean
    ? {
      dishes: dishes.length,
      declared: dishes.filter((d) => d.sameDay !== null).length,
      invalid: keptSameDayFaults.filter((f) => f.invalid).length,
      minutes_missing: keptSameDayFaults.filter((f) => f.minutesMissing).length,
    }
    : { dishes: 0, declared: 0, invalid: 0, minutes_missing: 0 };

  // LOT 3C — MÊME DISCIPLINE, MÊME POPULATION, MÊME GARDE `clean`. `attributed`
  // se lit sur la sortie (`memberId`), `declared`/`refused` sur le tableau
  // parallèle qui a suivi les mêmes `splice`.
  const dishOwnerCounts = clean
    ? {
      dishes: dishes.length,
      declared: keptOwnerFacts.filter((f) => f.declared).length,
      attributed: dishes.filter((d) => d.memberId !== null).length,
      refused: keptOwnerFacts.filter((f) => f.refused).length,
    }
    : { dishes: 0, declared: 0, attributed: 0, refused: 0 };

  return {
    dishes: clean ? dishes : [],
    preparations: clean ? preparations : [],
    cooking_sessions: clean ? cookingSessions : [],
    shopping_list: clean ? finalShopping : [],
    rejected_numeric: rejectedNumeric,
    rejected_aisles: rejectedAisles,
    empty_slots: emptySlots,
    same_day_counts: sameDayCounts,
    dish_owner_counts: dishOwnerCounts,
    // Gardé sur `clean` comme les plats eux-mêmes: relancer pour une ancre
    // quand la semaine entière vient d'être vidée par un allergène ferait
    // réparer la mauvaise chose, et à la deuxième sortie sale on aurait dépensé
    // deux générations pour rien.
    protein_anchor_missing: clean ? proteinAnchorMissing : [],
    issues,
    lock,
  };
}

/**
 * Un ingrédient, en base. R1: clés ASCII, snake_case.
 *
 * ── LES QUATRE CHAMPS DE FF-038 SONT PERSISTÉS ────────────────────────────
 * Écrire les grammes recalculés plutôt que de les refaire à chaque lecture est
 * ce qui rend un plan RELISIBLE: le verdict de FF-039 et tout rejeu ultérieur
 * lisent la même valeur que celle qui a été calculée le jour de la
 * composition, avec le référentiel de ce jour-là. Recalculer à la lecture
 * ferait bouger l'histoire d'un plan à chaque curation d'alias.
 *
 * Aucun de ces champs n'est AFFICHÉ. Ce sont des grammes d'ALIMENT, du même
 * côté de la frontière que « 400 g de cuisses de poulet » — mais l'écran
 * continue de lire `quantity`, la prose.
 */
function ingredientPayload(i: DishIngredient): Record<string, unknown> {
  return {
    term: i.term,
    quantity: i.quantity,
    in_pantry: i.in_pantry,
    amount: i.amount,
    unit: i.unit,
    state: i.state,
    grams_raw: i.gramsRaw,
  };
}

/** Le payload `dishes` écrit en base. R1: clés ASCII. */
export function mealDishesPayload(meal: GeneratedMeal): Array<Record<string, unknown>> {
  return meal.dishes.map((d) => ({
    title: d.title,
    slot: d.slot,
    day: d.day,
    ingredients: d.ingredients.map(ingredientPayload),
    method: d.method,
    why: d.why,
    honours_belief_keys: d.honours_belief_keys,
    uses: d.uses.map((u) => ({
      preparation_id: u.preparationId,
      servings: u.servings,
    })),
    // LOT C — L'ATTRIBUTION, ÉCRITE MÊME À `null`.
    //
    // ⚠️ ÉCRITE TOUJOURS, exprès: une clé absente ne se distingue pas d'un lot
    // débranché, et ce dépôt paie en boucle la garde construite puis
    // silencieusement débranchée. `null` DIT « le plat de la table », ce qui est
    // le cas nominal et une affirmation — pas une ignorance.
    //
    // ⚠️ AUCUNE MIGRATION: `dishes` est une colonne `jsonb`, et les plans écrits
    // avant ce lot n'ont simplement pas la clé. Les lecteurs traitent son
    // absence comme `null`, c'est-à-dire comme le plat de la table — ce que ces
    // plans-là étaient déjà pour tout le monde.
    member_id: d.memberId,
    // ── LOT 2 · LE GESTE DU JOUR J, ÉCRIT MÊME À `null` ──────────────────
    //
    // ⚠️ MÊME POSTURE QUE `member_id` JUSTE AU-DESSUS, ET POUR LA MÊME RAISON:
    // une clé absente ne se distingue pas d'un lot débranché. `null` DIT « le
    // modèle n'a rien déclaré pour ce plat », ce qui est une information — et
    // c'est celle que le compteur `same_day` rend comptable en SQL.
    //
    // ⚠️ AUCUNE MIGRATION: `dishes` est une colonne `jsonb`, et les plans écrits
    // avant ce lot n'ont simplement pas la clé. Le lecteur du front traite son
    // absence comme `null`, c'est-à-dire « aucun bandeau » — ce que ces plans-là
    // étaient déjà.
    same_day: d.sameDay === null ? null : {
      kind: d.sameDay.kind,
      minutes: d.sameDay.minutes,
    },
  }));
}

export function mealPreparationsPayload(
  meal: GeneratedMeal,
): Array<Record<string, unknown>> {
  return meal.preparations.map((p) => ({
    id: p.id,
    title: p.title,
    servings_made: p.servingsMade,
    ingredients: p.ingredients.map(ingredientPayload),
    method: p.method,
    active_minutes: p.activeMinutes,
    total_minutes: p.totalMinutes,
    cook_on: p.cookOn,
  }));
}

export function mealSessionsPayload(
  meal: GeneratedMeal,
): Array<Record<string, unknown>> {
  return meal.cooking_sessions.map((session) => ({
    day: session.day,
    preparation_ids: session.preparationIds,
    run_through: session.runThrough,
    total_minutes: session.totalMinutes,
  }));
}

export function mealShoppingPayload(meal: GeneratedMeal): Array<Record<string, unknown>> {
  return meal.shopping_list.map((s) => ({
    term: s.term,
    quantity: s.quantity,
    aisle: s.aisle,
  }));
}
