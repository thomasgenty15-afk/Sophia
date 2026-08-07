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
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
import { normalizeForMatch } from "./forbidden_matcher.ts";

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
 * UN MOMENT DE LA JOURNÉE DE CET ÉLÈVE, avec son heure si elle a été donnée.
 *
 * L'heure est FACULTATIVE et le reste: « je grignote l'après-midi » est une
 * information utile même sans « à 17h ». Exiger l'heure ferait inventer une
 * précision que l'élève n'a pas — et une heure inventée, le moteur la traite
 * comme une contrainte.
 */
export interface EatingOccasionSlot {
  slot: EatingOccasion;
  /** « 17:00 », ou `null`. */
  at: string | null;
}

/**
 * Le rythme par défaut, quand l'élève n'a rien déclaré.
 *
 * C'est EXACTEMENT ce que le moteur imposait à tout le monde avant d'avoir la
 * question. Le garder comme repli est ce qui rend ce chantier additif: un élève
 * qui ne remplit rien reçoit la même semaine qu'hier.
 */
export const DEFAULT_EATING_RHYTHM: readonly EatingOccasionSlot[] = [
  { slot: "breakfast", at: null },
  { slot: "lunch", at: null },
  { slot: "dinner", at: null },
];

/**
 * Le rythme lu depuis `student_goals.practical_constraints.eating_rhythm`.
 *
 * DÉFENSIF DANS UNE SEULE DIRECTION: ce qui n'est pas reconnu est laissé de
 * côté, jamais deviné. Un jeton inconnu deviendrait un moment que le rendu ne
 * sait pas nommer, et une heure mal formée deviendrait une contrainte fausse.
 * Un rythme entièrement illisible rend `[]`, et l'appelant retombe sur le
 * défaut — jamais sur une journée vide.
 *
 * DEUX FORMES D'ENTRÉE, ET C'EST DÉLIBÉRÉ. `{"slot":"lunch","at":null}` est ce
 * qu'écrit la carte; `"lunch"` tout court est ce qu'écrivent les jsonb posés à
 * la main (fixtures, seeds). La migration qui a créé cette clé a renoncé au
 * CHECK de forme en écrivant que « le lecteur sait déjà réparer » — il ne
 * réparait pas, il JETAIT, et le coût était invisible parce que le repli
 * ressemble à une réponse: la fixture d'un élève déclaré SANS petit-déjeuner
 * (`["lunch","dinner"]`) rendait `[]`, retombait sur le défaut, et servait un
 * petit-déjeuner. Toute la flotte QA validait le défaut en croyant tester trois
 * rythmes distincts. La chaîne nue vaut donc le moment SANS heure — c'est la
 * seule lecture possible, il n'y a rien à deviner.
 *
 * L'ORDRE EST CELUI DE LA JOURNÉE, pas celui du tableau reçu. On lit sa journée
 * du réveil au coucher; laisser l'ordre de saisie décider ferait lire un dîner
 * avant un petit-déjeuner.
 */
export function parseEatingRhythm(raw: unknown): EatingOccasionSlot[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, string | null>();
  for (const entry of raw) {
    // La chaîne nue: un moment pris, sans heure. Traitée AVANT le rejet des
    // non-objets, qui la mangeait en silence.
    if (typeof entry === "string") {
      const slot = entry.trim().toLowerCase();
      if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
      // `set` et pas `set` conditionnel: une chaîne nue ne porte pas d'heure,
      // et ne doit pas effacer celle qu'une entrée objet du même tableau
      // aurait déjà posée pour ce moment.
      if (!bySlot.has(slot as EatingOccasion)) {
        bySlot.set(slot as EatingOccasion, null);
      }
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    const at = String(e.at ?? "").trim();
    // `HH:MM` ou rien. Une heure qu'on ne sait pas lire n'annule pas le moment:
    // « je mange l'après-midi » reste vrai sans l'heure.
    const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(at) ? at : null;
    bySlot.set(slot as EatingOccasion, valid);
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    at: bySlot.get(s) ?? null,
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
  quantity: string | null;
  /**
   * VRAI seulement si le terme a été retrouvé dans le garde-manger de l'élève.
   * Calculé ici, jamais recopié du modèle (voir garantie 2 de l'en-tête).
   */
  in_pantry: boolean;
}

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
  /** Combien de portions sortent de cette cuisson. Toujours > 1. */
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
  issues: string[];
  lock: OutputLockResult;
}

export const MEAL_PROMPT_VERSION = "meal.en.v3_preparations";

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
 * Les moments, un par ligne, avec l'heure quand elle a été donnée.
 *
 * L'heure est REPRISE TELLE QUELLE et jamais complétée: « 17:00 » quand il l'a
 * dit, rien quand il ne l'a pas dit. Inventer « vers 16h » pour faire joli
 * poserait une contrainte que personne n'a exprimée, et le modèle la
 * respecterait — c'est bien le problème.
 */
function rhythmLines(rhythm: readonly EatingOccasionSlot[]): string {
  return rhythm
    .map((o) => (o.at ? `- ${OCCASION_PROSE[o.slot]} (${o.at})` : `- ${OCCASION_PROSE[o.slot]}`))
    .join("\n");
}

/** Le jeton, en mots. Le modèle lit de l'anglais, pas des slugs. */
const OCCASION_PROSE: Record<EatingOccasion, string> = {
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

== NEVER PUT A NUMBER ON NUTRITION ==

No calories. No macro grams. No percentages of anything nutritional. Not as a target, not as a range, not "roughly". Nobody has measured this student.

Shopping quantities are DIFFERENT and expected: "400 g chicken thighs", "2 onions", "a bunch of parsley". A quantity says how much to buy or use; a target claims a measurement of the person. Put quantities on ingredients, never on the student.

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
      "ingredients": [{ "term": "...", "quantity": "..."|null }],
      "method": "how to make it, plainly, in a short paragraph",
      "why": "one sentence: why THIS dish for THIS student this week",
      "uses": [{ "preparation_id": "prep_chicken", "servings": 1 }],
      "honours_belief_keys": ["<exact keys from the convictions list, when one applies>"],
      "uses": [{ "preparation_id": "prep_chicken", "servings": 1 }]
    }
  ],
  "preparations": [
    { "id": "prep_chicken", "title": "Roast chicken thighs",
      "servings_made": 4,
      "ingredients": [{ "term": "...", "quantity": "<for the WHOLE batch>" }],
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

export function buildMealPrompt(args: {
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
  budgetBand?: string | null;
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
}): { systemPrompt: string; userMessage: string } {
  const rhythm = args.eatingRhythm && args.eatingRhythm.length > 0
    ? args.eatingRhythm
    : DEFAULT_EATING_RHYTHM;
  // `rhythm` RÉSOLU, jamais `args.eatingRhythm` brut: le plafond doit être celui
  // des moments que le prompt NOMME trois lignes plus haut. Passer le brut a
  // déjà produit la divergence exacte que `dishCapFor` documente — la consigne
  // demandait trois plats, le plafond en autorisait quatre.
  const cap = dishCapFor(args.scope, rhythm, args.daysToFill?.length || 7);
  const pantryLines = args.pantry
    .map((p) => (p.quantity ? `- ${p.term} (${p.quantity})` : `- ${p.term}`))
    .join("\n");

  const userMessage = [
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
    "== THIS STUDENT ==",
    `goal: ${args.goal}`,
    args.situation
      ? `their situation, in their words: ${args.situation}`
      : "their situation: not stated.",
    // Le contexte est présenté SÉPARÉMENT de la situation, et après elle. La
    // situation est stable (« je mange à la cantine »), le contexte est daté
    // (« mariage mardi »). Les fondre en un seul bloc ferait traiter un mariage
    // comme une habitude de vie.
    args.context
      ? `what is going on for them RIGHT NOW: ${args.context}`
      : "nothing special going on this week.",
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
    // ── LA FORME DE LEUR JOURNÉE ────────────────────────────────────────
    // Son propre en-tête, et pas une ligne perdue dans « what to cook »: c'est
    // la contrainte qui décide COMBIEN de plats existent et QUAND. Une faim de
    // 17h qu'on ne nomme pas est une faim qu'on comble ailleurs, et le plan le
    // plus juste du monde s'écroule dessus.
    "== THE SHAPE OF A NORMAL DAY FOR THEM ==",
    rhythmLines(rhythm),
    args.eatingRhythm && args.eatingRhythm.length > 0
      ? "Those are the moments they actually eat. Do not add a meal they did " +
        "not name, and do not drop one they did: an extra meal is a meal they " +
        "skip, a missing one is the hour they raid the cupboard."
      : "They have not told us their rhythm, so this is the default assumption " +
        "— treat it as ordinary, not as something they chose.",
    "",
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
        `cooking sessions: at most ${batchSessionBudget(cap)} for the whole ` +
        "stretch. Most lunches and dinners must therefore come from BATCHES — " +
        "one cooking session, several servings, several days, declared in " +
        "`batch`. Seventeen separately-cooked dishes is not a plan anybody cooks.",
      ]
      : []),
    args.slot ? `meal: ${args.slot}` : "meal: whichever fits",
    // LE JOUR OÙ L'ON EST, et il n'y était pas. Le modèle repartait de lundi
    // par habitude: un plan généré le mercredi rendait trois jours déjà passés.
    ...(args.todayToken ? [`today is: ${args.todayToken}`] : []),
    // LES CONTRAINTES DE CUISINE, juste à côté de la demande. Une session
    // proposée un dimanche à quelqu'un qui travaille le dimanche est un plan
    // qu'on ne suit pas, et le modèle n'avait aucun moyen de le savoir.
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
    ...((() => {
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
      const first = window[0];
      const tooLate = usable.length > 0 && first !== undefined &&
        !usable.includes(first) &&
        Math.min(...usable.map((d) => window.indexOf(d))) > 0;

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
    })()),
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
    ...(args.budgetBand
      ? [
        `budget: ${args.budgetBand}. On a tight budget, favour cheap staples ` +
        "and skip expensive proteins and out-of-season produce.",
      ]
      : []),
    // CE QU'IL A DIT LUI-MÊME, et il l'a confirmé sur un écran. Ce ne sont ni
    // des interdits du coach (ceux-là sont dans la doctrine, avec leur double
    // verrou) ni des contraintes médicales (celles-là ont leur propre table et
    // n'arrivent jamais ici): ce sont des goûts et des contextes de vie, et ils
    // décident si une semaine est vivable.
    ...(args.foodPreferences && args.foodPreferences.length > 0
      ? [
        "what they have told you about their eating, in their own words:",
        ...args.foodPreferences.map((p) => `- ${p}`),
      ]
      : []),
    // CE DONT ILS ONT ENVIE *MAINTENANT* — séparé de la ligne au-dessus, et
    // après elle, exactement comme `context` est séparé de `situation`.
    //
    // La liste au-dessus est DURABLE: elle vient de la conversation, elle a été
    // confirmée sur un écran, elle vaut pour toutes leurs semaines. Celle-ci est
    // DATÉE: elle a été tapée dans le formulaire il y a dix secondes et ne vaut
    // que pour cette composition. Les fondre ferait traiter « mezze d'été cette
    // semaine » comme un goût permanent — et ça reviendrait en février.
    ...(args.preferences
      ? [`what they feel like eating THIS TIME: ${args.preferences}`]
      : []),
    ...(args.daysToFill && args.daysToFill.length > 0
      ? [
        `days to fill, in this order: ${args.daysToFill.join(", ")}`,
        "Do not use any other day token. Do not start earlier than today.",
      ]
      : []),
    `people at the table: ${args.servings}`,
    "",
    args.mode === "from_pantry"
      ? [
        "== WHAT THEY ALREADY HAVE ==",
        pantryLines || "- (they listed nothing)",
      ].join("\n")
      : "== THEY HAVE NOT SHOPPED YET — give the full list ==",
  ].join("\n");

  return { systemPrompt: MEAL_SYSTEM_PROMPT, userMessage };
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
     * LE TEMPS PAR SESSION DÉCLARÉ PAR L'ÉLÈVE, ou `null` s'il ne l'a pas dit.
     *
     * REQUIS, `T | null`, jamais `T?`: c'est un PLAFOND, et un plafond qu'un
     * appelant peut oublier de passer est un plafond désarmé — le prompt
     * l'annonce, personne ne le vérifie, et on ne le découvre qu'en mesurant un
     * plan à la main. Mesuré le 2026-08-06: 30 minutes déclarées, 55 produites.
     */
    cookingTimeMin: number | null;
  },
): GeneratedMeal {
  const issues: string[] = [];
  const rejectedNumeric: string[] = [];
  const rejectedAisles: string[] = [];

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
  // LE MÊME PLAFOND QUE LE PROMPT, dérivé du MÊME rythme. Deux copies d'un même
  // nombre dont une seule reçoit la modification est le défaut que ce fichier
  // documente deux fois; ici les deux copies lisent la même fonction avec la
  // même entrée, donc elles ne peuvent plus diverger.
  const cap = dishCapFor(args.scope, args.eatingRhythm, args.daysToFill.length || 7);

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
    if (!Number.isFinite(made) || made <= 1) {
      // Une préparation d'UNE portion n'en est pas une: c'est un plat. La
      // garder ferait afficher une session de cuisine pour une assiette.
      issues.push(`preparations[${i}]: servings_made must be > 1, dropped`);
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
      prepIngredients.push({ term, quantity, in_pantry: isInPantry(term, args.pantry) });
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
  const rawDishes = Array.isArray(root.dishes) ? root.dishes : [];
  for (const [i, entry] of rawDishes.entries()) {
    const d = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const title = cleanText(d.title);
    if (!title) {
      issues.push(`dishes[${i}]: empty title, dropped`);
      continue;
    }
    if (dishes.length >= cap) {
      issues.push(`dishes[${i}]: over the ${cap}-dish cap for ${args.scope}, dropped`);
      continue;
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

    const slotRaw = cleanText(d.slot).toLowerCase();
    const slot = (MEAL_SLOTS as readonly string[]).includes(slotRaw)
      ? (slotRaw as MealSlot)
      : null;
    if (slotRaw && !slot) issues.push(`dishes[${i}]: unknown slot ${JSON.stringify(slotRaw)}, dropped`);

    const dayRaw = cleanText(d.day).toLowerCase();
    const day = DAY_TOKENS.includes(dayRaw) ? dayRaw : null;
    if (dayRaw && !day) issues.push(`dishes[${i}]: unknown day token ${JSON.stringify(dayRaw)}, dropped`);

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
      ingredients.push({
        term,
        quantity,
        // JAMAIS `ing.in_pantry`. Le drapeau du modèle n'est pas une preuve:
        // c'est la même faute que l'accusé « c'est noté » sans ligne en base,
        // et elle se paye ici en disant « tu as tout » à quelqu'un qui n'a pas
        // les œufs, un dimanche soir, magasins fermés.
        in_pantry: isInPantry(term, args.pantry),
      });
    }
    if (numericInIngredients) {
      if (!rejectedNumeric.includes(numericInIngredients)) {
        rejectedNumeric.push(numericInIngredients);
      }
      issues.push(
        `dishes[${i}]: numeric target (${numericInIngredients}) in an ingredient -- dish rejected`,
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

    dishes.push({
      title,
      slot,
      day,
      ingredients,
      method,
      why,
      honours_belief_keys: honours,
      uses,
    });
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

  // ── EN MODE `from_pantry`, LA LISTE EST CE QUI MANQUE ───────────────────
  // Recalculée à partir des ingrédients réellement retenus, pas reprise du
  // modèle: c'est la seule façon que « il ne te manque rien » soit vrai.
  let finalShopping = shopping;
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
        // donné un; sinon `other`.
        const known = shopping.find((s) => normalizePantryTerm(s.term) === dedup);
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

  return {
    dishes: clean ? dishes : [],
    preparations: clean ? preparations : [],
    cooking_sessions: clean ? cookingSessions : [],
    shopping_list: clean ? finalShopping : [],
    rejected_numeric: rejectedNumeric,
    rejected_aisles: rejectedAisles,
    issues,
    lock,
  };
}

/** Le payload `dishes` écrit en base. R1: clés ASCII. */
export function mealDishesPayload(meal: GeneratedMeal): Array<Record<string, unknown>> {
  return meal.dishes.map((d) => ({
    title: d.title,
    slot: d.slot,
    day: d.day,
    ingredients: d.ingredients.map((i) => ({
      term: i.term,
      quantity: i.quantity,
      in_pantry: i.in_pantry,
    })),
    method: d.method,
    why: d.why,
    honours_belief_keys: d.honours_belief_keys,
    uses: d.uses.map((u) => ({
      preparation_id: u.preparationId,
      servings: u.servings,
    })),
  }));
}

export function mealPreparationsPayload(
  meal: GeneratedMeal,
): Array<Record<string, unknown>> {
  return meal.preparations.map((p) => ({
    id: p.id,
    title: p.title,
    servings_made: p.servingsMade,
    ingredients: p.ingredients.map((i) => ({
      term: i.term,
      quantity: i.quantity,
      in_pantry: i.in_pantry,
    })),
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
