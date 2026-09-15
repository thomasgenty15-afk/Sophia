/**
 * LE POIDS DE RÉFÉRENCE PROTÉIQUE — lot `L1`, 2026-08-22.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE FAIT, EN UNE PHRASE
 * ══════════════════════════════════════════════════════════════════════════
 * Une personne corpulente cesse de recevoir une cible protéique calculée sur
 * son poids TOTAL. Le calcul retient un **poids de référence** — le plus petit
 * du poids réel et d'un plafond dérivé de la taille — et c'est lui, jamais le
 * poids réel, que `meal_envelope.ts` multiplie par les g/kg.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE POURQUOI, ET IL EST ARITHMÉTIQUE
 * ══════════════════════════════════════════════════════════════════════════
 * `2,0 g/kg` descend de Helms 2014, qui parle en **masse maigre**. Appliquée
 * au poids total, la même règle donne environ 2,35 g par kg de masse maigre à
 * quelqu'un de mince et **3,33 à quelqu'un de corpulent** — trois fois la
 * quantité utile pour le second, sur un plateau où chaque gramme de protéine
 * prend la place d'autre chose. Plafonner le poids de référence referme
 * l'essentiel de l'écart, et ça tient en une multiplication.
 *
 * ⚠️ ET LE PLAFOND NE PORTE QUE SUR LA PART MOBILE — cicatrice
 * `scaling-factor-applies-only-to-the-mobile-part`. Ce qu'il change:
 * `proteinFloorG`, et rien d'autre. L'énergie, le plafond de densité, la
 * maintenance estimée, la bande d'objectif ne le voient pas. Un plafond qui
 * descendrait aussi l'énergie serait un régime, pas une cible protéique.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ IL NE MORD QU'À UN SEUL BOUT, ET C'EST LA MOITIÉ QUI COÛTE À TENIR
 * ══════════════════════════════════════════════════════════════════════════
 * Cicatrice `per-kilo-constants-break-on-tall-lean-bodies`: le dépôt a déjà
 * payé un plafond de masse **indexé à l'envers**, qui retenait exactement le
 * corps qu'il ne devait pas retenir. La propriété tenue ici est donc
 * BILATÉRALE, et la seconde moitié est celle qu'une mutation doit faire
 * rougir:
 *
 *     poids de référence ≤ poids réel                (il ne gonfle jamais)
 *     poids de référence = poids réel  dès que  poids réel ≤ plafond
 *
 * La seconde ligne dit qu'un corps **grand et mince** — 186 cm, 70 kg, dont le
 * plafond vaut 103,8 kg — ne bouge pas **d'un gramme**. C'est le cas qui PASSE
 * (cicatrice `guards-need-a-passing-case`), et sans lui la garde serait
 * indiscernable d'un plafond qui écrase tout le monde.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUI N'EST NOMMÉ NULLE PART, ET C'EST UNE RÈGLE PRODUIT
 * ══════════════════════════════════════════════════════════════════════════
 * Le brief servi au modèle interdit en toutes lettres l'indice, la catégorie
 * et la cible (`household_portions.ts`, `meal_body.ts`), et le validateur de
 * lexique (`nutrition_lexicon.ts`) refuse le terme lui-même — il figure dans
 * `FORBIDDEN_METRIC_TERMS`. **Ce module ne rend donc AUCUNE catégorie de
 * corps, aucun rapport, aucun seuil comparable à un barème.** Il rend un poids
 * en kilogrammes et un motif technique. Rien de ce qu'il calcule ne part vers un écran, vers la
 * base, ni vers un journal: `meal_envelope.ts` en consomme un nombre et le
 * multiplie. C'est la même famille que la garde TCA — dire à quelqu'un dans
 * quelle case il tombe fait du mal en croyant bien faire.
 *
 * ⚠️ Conséquence directe sur la forme: `capped` est un booléen INTERNE, pas
 * une étiquette. Personne n'a le droit de le rendre lisible par la personne
 * qu'il décrit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LES TROIS EXEMPTIONS, ET AUCUNE N'EST UN OUBLI
 * ══════════════════════════════════════════════════════════════════════════
 * ① SANS TAILLE — pas de plafond calculable. On ne devine pas une taille pour
 *   retirer de la protéine à quelqu'un: la direction d'erreur du module est de
 *   **ne rien retirer**.
 *
 * ② 60 ANS ET PLUS — le plafond est SUSPENDU. Moore 2015 (PROT-AGE) pose son
 *   seuil sur le poids du corps chez la personne âgée, la sarcopénie pousse
 *   dans l'autre sens, et la revue nutritionniste nomme cette population comme
 *   le trou n° 11 de la littérature, avec un plancher qui devrait **monter**.
 *   Un lot dont l'objet est « cesser de calculer sur le poids total » n'a
 *   aucun mandat pour faire DESCENDRE, dans le même geste, la cible d'une
 *   population protégée. Mesuré: un corps 160 cm / 90 kg de 60 ans et plus
 *   perdrait 21 g/j. Registre §⑨.
 *
 * ③ MINEUR — `childEnvelopeFromBody` n'appelle pas ce module du tout. Le
 *   plafond est un raisonnement de corps adulte; un corps en croissance n'a ni
 *   les mêmes proportions ni la même règle, et 1,0 g/kg (WHO/FAO/UNU 2007) est
 *   un besoin, pas une cible à réduire. L'exemption est tenue par l'ABSENCE
 *   d'appel, pas par un `if` qu'on pourrait oublier de rejouer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ `suspended` EST REQUIS, ET C'EST LA PLACE QU'ATTEND `O6`
 * ══════════════════════════════════════════════════════════════════════════
 * Le lot `O6` (GLP-1) demande de suspendre ce plafond pour quelqu'un sous
 * traitement — la même case qui désactive le rythme et exempte
 * d'`observed_below_floor`. La place existe donc dès aujourd'hui, et elle est
 * **obligatoire**: cicatrice `optional-gate-params-are-disarmed-gates`, un
 * paramètre de garde optionnel est une garde désarmée, jamais passée. Tant que
 * `O6` n'est pas livré, tout appelant écrit `suspended: false` — et le jour où
 * la case existe, la casse de compilation recense les appelants.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import type { AgeBand } from "./student_age.ts";

/**
 * LE PLAFOND DU POIDS DE RÉFÉRENCE, en kilogrammes par mètre carré de taille.
 *
 * ⚠️ CONSTANTE OPÉRATIONNELLE, ET C'EST AVOUÉ. Elle est calibrée pour ne
 * retenir qu'un corps nettement lourd pour sa taille et pour ne toucher
 * personne d'autre; la présenter comme un seuil issu de la littérature serait
 * défendre un chiffre indéfendable. Ce qu'elle a de solide est sa DIRECTION:
 * au-delà, chaque kilo supplémentaire porte de moins en moins de masse maigre,
 * donc de moins en moins de besoin protéique.
 *
 * ⛔ Elle ne se rend à personne et ne se compare à aucun barème.
 */
export const PROTEIN_REFERENCE_CEILING_KG_PER_M2 = 30;

/** Le motif, TECHNIQUE. Jamais une catégorie de corps, jamais rendu à qui que ce soit. */
export type ReferenceWeightReason =
  /** le poids réel dépasse le plafond: c'est le plafond qui est retenu */
  | "ceiling_applied"
  /** le poids réel est sous le plafond: rien ne bouge */
  | "under_ceiling"
  /** pas de taille exploitable: aucun plafond calculable */
  | "no_height"
  /** 60 ans et plus */
  | "age_exempt"
  /** suspendu par un appelant (`O6`) */
  | "suspended";

export type ReferenceWeightOutcome = {
  /** ce que l'enveloppe multiplie par les g/kg */
  readonly referenceWeightKg: number;
  /** ⛔ interne. Ne jamais rendre lisible par la personne qu'il décrit. */
  readonly capped: boolean;
  readonly reason: ReferenceWeightReason;
};

export type ReferenceWeightInput = {
  readonly weightKg: number;
  readonly heightCm: number | null;
  /** ⚠️ REQUIS. `null` = bande inconnue, et une bande inconnue n'exempte pas. */
  readonly ageBand: AgeBand | null;
  /**
   * ⚠️ REQUIS, jamais optionnel. La place de `O6` (GLP-1). Un appelant qui
   * n'a pas de raison de suspendre écrit `false`, explicitement.
   */
  readonly suspended: boolean;
};

/**
 * LE POIDS DE RÉFÉRENCE. Rend TOUJOURS un poids ≤ `weightKg`, jamais au-dessus.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function proteinReferenceWeightKg(
  args: ReferenceWeightInput,
): ReferenceWeightOutcome {
  const { weightKg, heightCm, ageBand, suspended } = args;

  if (suspended) {
    return { referenceWeightKg: weightKg, capped: false, reason: "suspended" };
  }
  if (ageBand === "60_plus") {
    return { referenceWeightKg: weightKg, capped: false, reason: "age_exempt" };
  }
  if (heightCm === null || !Number.isFinite(heightCm) || heightCm <= 0) {
    return { referenceWeightKg: weightKg, capped: false, reason: "no_height" };
  }

  const metres = heightCm / 100;
  const ceilingKg = PROTEIN_REFERENCE_CEILING_KG_PER_M2 * metres * metres;
  if (!(weightKg > ceilingKg)) {
    return {
      referenceWeightKg: weightKg,
      capped: false,
      reason: "under_ceiling",
    };
  }
  return { referenceWeightKg: ceilingKg, capped: true, reason: "ceiling_applied" };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE COMPTEUR — ⛔ DEUX POPULATIONS, TOUJOURS LES DEUX
// ═══════════════════════════════════════════════════════════════════════════
//
// Cicatrice `L26-0`, mesurée ce matin: un seuil lu sur UN seul compteur est
// satisfait par la pire régression possible. Ici, « combien de corps retenus »
// seul serait maximisé par un plafond qui écrase tout le monde. Le compteur
// rend donc les deux moitiés, et `untouched` est celle qui coûte.

export type ReferenceWeightCensus = {
  /** le dénominateur, nommé */
  readonly bodies: number;
  /** ceux que le plafond retient */
  readonly capped: number;
  /** ⛔ ceux qui ne bougent PAS d'un gramme — la moitié qui coûte */
  readonly untouched: number;
  /** ce que le plafond retire, en grammes de protéine par jour, sur tout le corpus */
  readonly gramsRemoved: number;
};

/**
 * RECENSE un corpus de corps, chacun avec ses g/kg déjà résolus par l'appelant
 * (le module ne connaît ni les objectifs ni les planchers — il ne connaît que
 * le poids de référence).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function censusReferenceWeight(
  bodies: readonly (ReferenceWeightInput & { readonly gPerKg: number })[],
): ReferenceWeightCensus {
  let capped = 0;
  let gramsRemoved = 0;
  for (const body of bodies) {
    const outcome = proteinReferenceWeightKg(body);
    if (!outcome.capped) continue;
    capped++;
    gramsRemoved += Math.round(body.weightKg * body.gPerKg) -
      Math.round(outcome.referenceWeightKg * body.gPerKg);
  }
  return {
    bodies: bodies.length,
    capped,
    untouched: bodies.length - capped,
    gramsRemoved,
  };
}
