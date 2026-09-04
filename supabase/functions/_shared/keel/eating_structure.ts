/**
 * COMBIEN DE MOMENTS UNE JOURNÉE DOIT PORTER — dérivé du corps, jamais du goût.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-060-les-plages-suivent-le-besoin.md`
 * Module PUR: no I/O, no clock, no randomness.
 *
 * ── ⛔ LE DÉFAUT QU'IL FERME, ET IL EST PHYSIQUE, PAS LOGICIEL ─────────────
 * Mesuré le 2026-09-04 sur un run réel (foyer extrême, empreinte du code
 * inchangée avant/après), pour un homme de 84 kg en `muscle_gain` à
 * 0,75 kg/semaine:
 *
 *     cible                    4 649 kcal/jour
 *     composé par le modèle      617 kcal/jour
 *     facteur nécessaire          ×7,53
 *     plafond de l'ancre          ×3        →  `clamped` 3 jours sur 3
 *
 * L'ancre était SATURÉE. Et la réparation n'est ni de monter son plafond, ni de
 * composer plus dense: `MEAL_MAX_GRAMS_PER_KG` borne un repas à 8 g par kilo de
 * corps, soit 672 g pour ce corps-là — le plus gros repas servi ce jour-là
 * faisait 672 g **au gramme près**. Trois assiettes ne portent pas 4 649 kcal;
 * il faudrait 3,4 kg de nourriture par jour. On ne met pas une journée de grand
 * besoin dans trois assiettes: **on ouvre un moment de plus.**
 *
 * ── LE SEUIL, ET IL EST PLUS BAS QU'ON NE CROIT ───────────────────────────
 *     3 repas × 8 g/kg × 1,35 kcal/g  =  32,4 kcal/kg/jour
 *
 * Au-delà, trois assiettes ne suffisent plus. Calculé par `mouthTargetKcal`
 * elle-même (homme de 35 ans, `no_position`):
 *
 *     75 kg sédentaire                     2 422  →  3 moments
 *     75 kg debout, sport 3-4              3 056  →  4
 *     110 kg maintien, debout, sans sport  3 395  →  3
 *     110 kg maintien, debout, sport 3-4   3 765  →  4
 *     84 kg `muscle_gain` 0,75 kg/sem      4 226  →  5
 *
 * ⚠️ CE N'EST PAS UNE AFFAIRE D'OBJECTIF, ET LA LIGNE DES 110 KG LE DIT: un
 * corps qui se MAINTIENT bascule de 3 à 4 par le seul fait de faire du sport.
 * Le verrou suit le BESOIN. Le shaker, lui, ne suit que la prise de poids —
 * c'est `shakeDecisionFor`, et les deux décisions sont séparées exprès.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
 * Il ne lit aucune base, ne décide d'aucun gramme, et **ne rend jamais un
 * kcal**. Il rend une STRUCTURE — des jetons de moment — parce que c'est ce
 * qu'un écran a le droit de montrer sans traverser les quatre portes de
 * `energy_gate.ts`. La cible qui l'alimente vient de `mouthTargetKcal`, qui
 * porte déjà le plancher TCA, le mineur sans corps et la doctrine du coach:
 * `targetKcal: null` ferme donc tout ici, sans une ligne de garde de plus.
 */

import { MEAL_MAX_GRAMS_PER_KG } from "./mouth_anchor.ts";

/**
 * CE QUE PÈSE UN PLAT CUISINÉ, EN KCAL PAR GRAMME.
 *
 * ⚠️ MESURÉE, PAS CHOISIE. Sur les trois journées du run du 2026-09-04, les
 * assiettes réellement servies pesaient 1,13 · 1,56 · 1,35 kcal/g. La valeur
 * retenue est celle du milieu, et elle tombe dans la fourchette que le pavé de
 * `MEAL_MAX_GRAMS_PER_KG` cite déjà pour en DÉRIVER le 8 (« un plat mixte
 * cuisiné pèse 1,3–1,6 kcal/g »). Les deux constantes disent donc la même
 * chose sur le même monde, et c'est voulu: si l'une bouge, l'autre doit être
 * relue.
 *
 * ⛔ CE N'EST PAS `DENSITY_CEILING_DEFAULT` (1,8, `meal_envelope.ts`). Celui-là
 * est un PLAFOND de verdict — « au-dessus, le plan est trop dense ». Prendre un
 * plafond pour une moyenne ferait croire qu'une assiette ordinaire porte un
 * tiers d'énergie de plus qu'elle n'en porte, et le compte de moments serait
 * systématiquement trop bas, dans le sens qui sous-nourrit.
 */
export const MEAL_KCAL_PER_G_COMPOSED = 1.35;

/** Ce qu'un seul repas peut porter pour ce corps, en kcal. */
export function mealMaxKcalFor(weightKg: number): number {
  return MEAL_MAX_GRAMS_PER_KG * weightKg * MEAL_KCAL_PER_G_COMPOSED;
}

/** Le plus de moments qu'une journée peut porter — les six déclarables. */
export const MAX_DAY_SLOTS = 6;

/**
 * DANS QUEL ORDRE ON OUVRE — et pourquoi celui-là.
 *
 * Les trois repas d'abord: ils portent 1,00 des 1,30 de `SLOT_DAY_WEIGHT`, donc
 * chacun déplace beaucoup plus qu'une collation. Puis le goûter, qui est le
 * geste ordinaire de quelqu'un qui doit manger plus — avant la collation du
 * matin, et bien avant l'avant-coucher.
 *
 * ⚠️ ON N'OUVRE JAMAIS `snack` (le jeton legacy). Il pèse comme une collation
 * mais aucun écran ne le propose: l'ouvrir poserait sur la fiche un moment que
 * la personne ne pourrait ni décocher ni comprendre.
 */
export const SLOT_OPENING_ORDER: readonly string[] = Object.freeze([
  "breakfast",
  "lunch",
  "dinner",
  "snack_pm",
  "snack_am",
  "before_bed",
]);

/** L'ordre de la journée — celui dans lequel les moments se rendent. */
export const SLOT_DAY_ORDER: readonly string[] = Object.freeze([
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
]);

/**
 * POURQUOI LA DÉRIVATION A RENDU CE QU'ELLE A RENDU — vocabulaire FERMÉ.
 *
 * `capped` est le motif qui coûte le plus cher à omettre: il dit « le compte
 * n'est PAS atteint, et je le sais ». Sans lui, une journée bloquée de partout
 * rendrait exactement la même chose qu'une journée qui n'avait besoin de rien.
 */
export const STRUCTURE_REASONS = [
  "derived",
  "capped",
  "no_target",
  "no_body",
] as const;
export type StructureReason = (typeof STRUCTURE_REASONS)[number];

/** Ce que le plan fait du shaker de cette bouche. Vocabulaire FERMÉ. */
export const SHAKE_STATES = [
  "compose",
  "declared",
  "not_applicable",
] as const;
export type ShakeState = (typeof SHAKE_STATES)[number];

export interface EatingStructure {
  /** Combien de moments cette journée doit porter, ou `null` si indérivable. */
  requiredCount: number | null;
  /** Les moments retenus — déclarés ∪ ouverts, dans l'ordre de la journée. */
  slots: string[];
  /** Ce que la dérivation a AJOUTÉ. C'est exactement ce qui se verrouille. */
  opened: string[];
  reason: StructureReason;
}

function inDayOrder(slots: Iterable<string>): string[] {
  const held = new Set(slots);
  const ordered = SLOT_DAY_ORDER.filter((s) => held.has(s));
  // Un jeton hors vocabulaire (`snack` legacy) garde sa place plutôt que de
  // disparaître: ce module ne fait pas le ménage d'une colonne.
  for (const s of held) if (!SLOT_DAY_ORDER.includes(s)) ordered.push(s);
  return ordered;
}

/**
 * COMBIEN DE MOMENTS, ET LESQUELS OUVRIR.
 *
 * ⚠️ `blockedSlots` EST CE QUE LA PERSONNE A NOMMÉ ABSENT, et il gagne toujours.
 * Quelqu'un qui a écrit « je ne mange pas le matin » ne doit pas retrouver le
 * petit-déjeuner coché et verrouillé sur sa fiche: on ouvre le moment SUIVANT
 * de l'ordre. Le précédent est mesuré (`skills/weight_divergence`): le produit
 * a déjà proposé une collation l'après-midi à quelqu'un dont le problème était
 * le matin, et ça s'appelle « se tromper deux fois et perdre sa confiance ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function eatingStructureFor(args: {
  /** De `mouthTargetKcal`. `null` ⇒ on ne dérive rien, et on le dit. */
  targetKcal: number | null;
  weightKg: number | null;
  declaredSlots: readonly string[];
  /** Les moments nommés absents. Jamais rouverts. */
  blockedSlots: readonly string[];
}): EatingStructure {
  const declared = inDayOrder(args.declaredSlots);

  if (args.targetKcal === null || !(args.targetKcal > 0)) {
    return {
      requiredCount: null,
      slots: declared,
      opened: [],
      reason: "no_target",
    };
  }
  if (args.weightKg === null || !(args.weightKg > 0)) {
    return {
      requiredCount: null,
      slots: declared,
      opened: [],
      reason: "no_body",
    };
  }

  const perMeal = mealMaxKcalFor(args.weightKg);
  const required = Math.min(
    MAX_DAY_SLOTS,
    Math.max(1, Math.ceil(args.targetKcal / perMeal)),
  );

  if (declared.length >= required) {
    return {
      requiredCount: required,
      slots: declared,
      opened: [],
      reason: "derived",
    };
  }

  const blocked = new Set(args.blockedSlots);
  const held = new Set(declared);
  const opened: string[] = [];
  for (const slot of SLOT_OPENING_ORDER) {
    if (held.size + opened.length >= required) break;
    if (held.has(slot) || blocked.has(slot)) continue;
    opened.push(slot);
  }

  return {
    requiredCount: required,
    slots: inDayOrder([...held, ...opened]),
    opened,
    // Tout ce qui restait était bloqué: le compte n'est pas atteint, et se
    // taire ici rendrait une journée sous-servie indiscernable d'une journée
    // qui n'avait besoin de rien.
    reason: held.size + opened.length >= required ? "derived" : "capped",
  };
}

/**
 * LE PLAN COMPOSE-T-IL UN SHAKER POUR CETTE BOUCHE ?
 *
 * ⚠️ SÉPARÉE DE LA DÉRIVATION, ET POUR UNE RAISON D'ORDRE, PAS DE GOÛT. Au
 * foyer, « a-t-elle déjà un shaker » (`fixed_intakes`) ne se charge qu'APRÈS
 * l'union des moments, qui dépend elle-même de la dérivation. Les deux
 * décisions ne peuvent donc pas tenir dans un seul appel, et les fondre en un
 * forcerait l'appelant à mentir sur l'une pour obtenir l'autre.
 *
 * ── LES TROIS CONDITIONS, ET AUCUNE N'EST DÉCORATIVE ──────────────────────
 * · `direction === "up"` — seul `muscle_gain` l'est (`scaleDirectionOf`). Un
 *   corps de 110 kg qui se maintient reçoit le VERROU mais jamais le shaker:
 *   c'est la distinction que le propriétaire a posée le 2026-09-04.
 * · `requiredCount > 3` — sous quatre moments, les assiettes suffisent.
 * · `!hasFixedIntake` — **elle a déjà le sien.** En composer un par-dessus
 *   servirait deux fois la même chose à quelqu'un qui a pris la peine de le
 *   déclarer, et lui apprendrait que déclarer ne sert à rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function shakeDecisionFor(args: {
  direction: "up" | "down" | null;
  requiredCount: number | null;
  hasFixedIntake: boolean;
}): ShakeState {
  if (args.direction !== "up") return "not_applicable";
  if (args.requiredCount === null || args.requiredCount <= 3) {
    return "not_applicable";
  }
  return args.hasFixedIntake ? "declared" : "compose";
}

/**
 * LE SHAKER QUE LE PLAN COMPOSE — sa phrase, et les deux choses qu'elle évite.
 *
 * ⛔ CE N'EST PAS UNE CONSIGNE DE PROMPT NEUVE, ET C'EST LE POINT. Le texte
 * rendu ici devient une habitude `own_usual` sur la bouche, et traverse la
 * chaîne du PLAT DÉDIÉ qui existe déjà: `ownMealSlots` → `dishBearingMembers`
 * → le bloc du brief → `dishBearerIds` du parseur → une boîte à son nom.
 * Écrire un nouveau bloc de prompt aurait demandé une population, une version,
 * et des bancs à l'octet — pour dire ce qu'une habitude dit déjà.
 *
 * ── LES DEUX CEINTURES, ET POURQUOI ELLES SONT DANS LA PHRASE ─────────────
 * · **Le régime de LA BOUCHE**, pas celui de la table. Un plat dédié « may use
 *   what the shared base leaves out » (`household_diet.ts`): c'est sa ligne à
 *   elle qui décide. Un shaker au lait de vache chez une bouche végane, c'est
 *   l'enfant végane et le ragoût.
 * · **Les allergènes de LA TABLE.** Le parseur vérifie le plat dédié contre
 *   l'union de sécurité du foyer: proposer une purée d'oléagineux là où
 *   quelqu'un réagit aux fruits à coque ferait retirer la boîte par la
 *   ceinture, et la bouche se retrouverait sans son moment. On écrit donc
 *   d'emblée ce qui passe.
 *
 * ⚠️ AUCUN NOMBRE, ET AUCUN MOT DE CORPS. Ni « dense », ni « prise de masse »,
 * ni un gramme: `FORBIDDEN_PORTION_TERMS` mord sur la prose servie, et la
 * contrainte du propriétaire est que **le prompt dit QUOI, le calcul d'après
 * dit COMBIEN**. La quantité de ce shaker est ancrée comme celle de tout plat.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function shakeHabitTextFor(args: {
  /** Les groupes que le régime de CETTE bouche exclut (`excludedGroupsFor`). */
  excludedGroups: readonly string[];
  /** Les allergènes de la TABLE, en jetons du catalogue (`tree_nut`, `soy`…). */
  tableAllergens: readonly string[];
}): string {
  const excluded = new Set(args.excludedGroups);
  const allergens = new Set(args.tableAllergens);

  const noDairy = excluded.has("dairy_yogurt") || excluded.has("dairy_cheese") ||
    allergens.has("dairy");
  const noSoy = allergens.has("soy");
  const noNuts = allergens.has("tree_nut") || allergens.has("peanut");
  const noSesame = allergens.has("sesame");
  const noGluten = allergens.has("gluten") || allergens.has("wheat");

  const base = noDairy
    ? (noSoy ? "oat milk" : "soy milk or a soy yogurt")
    : "milk or skyr";
  const grain = noGluten ? "cooked rice flakes" : "oats";
  // ⚠️ SI TOUT EST EXCLU, ON N'INVENTE PAS. La banane seule reste un shaker
  // buvable; c'est au calcul d'après de le dimensionner, pas à cette phrase de
  // trouver une matière grasse à tout prix.
  const fat = noNuts
    ? (noSesame ? null : "a seed butter")
    : "a nut or seed butter";

  const parts = [base, grain, "a banana", fat].filter((p): p is string =>
    p !== null
  );
  return `a drinkable shake, one tall glass, no plate: ${parts.join(", ")}`;
}

/**
 * LE DÉBUT DE LA PHRASE DU SHAKER — pour la RECONNAÎTRE plus tard.
 *
 * ⚠️ EXPORTÉ, ET PAS RECOPIÉ CHEZ L'APPELANT. Le générateur doit savoir, après
 * la garde de texte du coach, si c'est NOTRE phrase qui vient d'être retirée:
 * le porteur de plat est décidé avant cette garde, donc une phrase retirée
 * laisse le prompt réclamer un plat dédié dont il ne dit plus rien. Deux
 * littéraux identiques à deux endroits divergeraient au premier mot changé.
 */
export const SHAKE_TEXT_PREFIX = "a drinkable shake";
