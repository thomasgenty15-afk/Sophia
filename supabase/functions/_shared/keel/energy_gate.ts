/**
 * FF-059 — LA CHAÎNE DE GARDES DU CHIFFRE D'ÉNERGIE.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
 * Cadre: `docs/keel/CALORIE_REVERSAL.md` · Mesures: `docs/keel/PHOTO_QUANTIFICATION.md`
 *
 * ── LA PORTE AVANT LA MAISON ───────────────────────────────────────────────
 * Ce module est écrit AVANT le premier chiffre, et il est le seul endroit du
 * dépôt qui décide qu'un élève a le droit d'en voir un. Il ne calcule rien: il
 * répond « oui » ou « non, pour CETTE raison ».
 *
 * ── LES QUATRE PORTES, ET L'ORDRE EST LE CONTRAT ───────────────────────────
 *
 *   ① `restrictionFlag`  — le plancher TCA.       Rouvrable par PERSONNE.
 *   ② mineur             — verdict d'âge.         Rouvrable par personne.
 *   ③ doctrine `counting`— la méthode du coach.   Rouvrable par le coach.
 *   ④ interrupteur élève — son choix.             Rouvrable par l'élève.
 *
 * ⚠️ ── LA PORTE ① N'EST PAS L'EXCEPTION DONT PARLE LA DÉCISION ─────────────
 * La décision du 2026-08-12 dit « les calories s'affichent, sauf si le coach
 * dit qu'on ne compte pas ». Cette exception-là est la porte ③. Le coach règle
 * sa MÉTHODE; il ne règle pas une ceinture de sécurité. Un coach qui compte et
 * un élève sous plancher TCA: **le plancher gagne**, et il n'existe aucun
 * paramètre, aucun réglage, aucun appelant qui puisse en décider autrement.
 *
 * C'est pour ça que `restrictionFlag` est lu EN PREMIER et qu'aucune branche
 * ultérieure ne peut le renverser: la seule façon de rendre `show: true` est de
 * traverser les quatre `if` dans l'ordre, et le premier ne prend aucun autre
 * argument que lui-même.
 *
 * Levinson 2017: 73 % des patients TCA déclarent qu'un tracker de calories a
 * contribué à leur trouble. C'est la raison de l'interdiction d'origine, elle
 * n'est pas périmée, et c'est elle qui rend cette porte non négociable.
 *
 * ── AUCUN PARAMÈTRE OPTIONNEL, ET UN TEST LE TIENT ─────────────────────────
 * Ce dépôt a déjà payé « un paramètre de garde optionnel est une garde
 * désarmée » (`safetyBand: null` jamais passé dans `keel-reengage-v1`). Les
 * quatre champs sont REQUIS: une entrée incomplète LÈVE, elle ne rend jamais
 * `show: true`. Un appelant qui oublie une porte casse à l'exécution ET à la
 * compilation, jamais en silence.
 *
 * ── LE REFUS PORTE TOUJOURS UN MOTIF NOMMÉ ─────────────────────────────────
 * Pas de booléen nu. Un `false` ne dit pas si c'est le plancher, l'âge, le
 * coach ou l'élève — et ces quatre-là ne se disent pas pareil à l'écran, ne se
 * réparent pas pareil, et ne se comptent pas pareil.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { BirthDateVerdict } from "./student_age.ts";
import { weekPlanAgeGate } from "./student_age.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE — fermé, et chaque valeur a une branche nommée
// ---------------------------------------------------------------------------

/**
 * Les motifs. `open` en fait partie: un journal qui ne nomme que les refus ne
 * distingue pas « la garde a laissé passer » de « la garde n'a pas tourné ».
 */
export const ENERGY_GATE_REASONS = Object.freeze(
  [
    "open",
    "restriction_floor",
    "minor",
    "doctrine_no_counting",
    "student_off",
  ] as const,
);
export type EnergyGateReason = (typeof ENERGY_GATE_REASONS)[number];

/**
 * LA POSITION DU COACH SUR L'AXE `counting`, réduite à ce que la porte ③ lit.
 *
 * Deux valeurs et pas trois: `count_briefly` et `NO_RULE_POSITION` ouvrent
 * exactement la même porte aujourd'hui, et un troisième jeton que personne ne
 * lit serait une donnée collectée sans consommateur — la règle mère de
 * `docs/fonctionnalites/conversation/README.md`. Le jour où `count_briefly`
 * décidera de quelque chose (lot 3, question §11 n°2), il gagnera son jeton et
 * son lecteur le même jour.
 */
export const COUNTING_STANCES = Object.freeze(
  ["no_counting", "no_position"] as const,
);
export type CountingStance = (typeof COUNTING_STANCES)[number];

/**
 * LE JETON D'INTERDIT QUE LA PORTE ③ CHERCHE.
 *
 * ⚠️ On lit le JETON de la doctrine publiée, pas le choix de préréglage.
 * `readStarterChoices` ne reconnaît une position qu'aux entrées encore marquées
 * `source: "starter"` — et `claimOnEdit` retire cette marque dès que le coach
 * réécrit un mot de son `instead`. Un coach qui a personnalisé sa formulation
 * de « on ne compte pas ici » aurait donc perdu la porte ③ en la rendant
 * DAVANTAGE sienne. Le jeton, lui, survit à la réécriture — et il couvre aussi
 * le coach qui l'a écrit à la main sans jamais passer par un débat.
 *
 * Même jeton que `doctrine_starter.ts`, position `no_counting`. Les deux
 * doivent rester d'accord: c'est ce que teste `energy_gate_test.ts`.
 */
export const NO_COUNTING_TOKEN = "count_calories";

// ---------------------------------------------------------------------------
// L'ENTRÉE — quatre champs, tous requis
// ---------------------------------------------------------------------------

export interface EnergyGateInput {
  /**
   * ① LE PLANCHER TCA, tel que `evaluateRestrictionForStudent` l'a rendu.
   *
   * Une lecture EN ÉCHEC vaut `true` chez l'appelant (même arbitrage que
   * `MealBodyContext.restrictionFlag`, FF-030 R6): se fermer rend le produit
   * d'hier, s'ouvrir met un chiffre sous les yeux d'un élève qu'on n'a pas su
   * évaluer.
   */
  restrictionFlag: boolean;
  /**
   * ② LE VERDICT D'ÂGE, tel que `assessBirthDate` l'a rendu.
   *
   * Le verdict entier, pas un booléen `isMinor`: la définition de « mineur »
   * vit dans `student_age.ts` et une seconde définition ici divergerait au
   * premier fuseau horaire. La porte se ferme sur `status === "minor"` et rien
   * d'autre — voir `weekPlanAgeGate`, dont c'est exactement la règle.
   */
  ageVerdict: BirthDateVerdict;
  /** ③ La position du coach, telle que `countingStanceFrom` l'a réduite. */
  coachCounting: CountingStance;
  /** ④ `profiles.energy_display_enabled`. `false` = l'élève a éteint. */
  studentSwitch: boolean;
}

export interface EnergyGateResult {
  show: boolean;
  reason: EnergyGateReason;
}

/**
 * Les clés que `canShowEnergy` EXIGE, dans l'ordre des portes.
 *
 * Exportée pour que le test puisse les retirer une par une et vérifier que
 * chacune lève. Une liste que le test recopierait à la main resterait verte le
 * jour où quelqu'un ajoute un champ.
 */
export const ENERGY_GATE_INPUT_KEYS = Object.freeze(
  ["restrictionFlag", "ageVerdict", "coachCounting", "studentSwitch"] as const,
);

// ---------------------------------------------------------------------------
// LA PORTE ③ — réduire la doctrine publiée à une position
// ---------------------------------------------------------------------------

/**
 * La position du coach sur `counting`, depuis ce qu'on a su lire de sa
 * doctrine.
 *
 * ── LES TROIS SITUATIONS, ET ELLES NE SE REPLIENT PAS L'UNE SUR L'AUTRE ────
 *
 *   PAS DE COACH (méthode maison) ....... `no_position` — le chiffre s'affiche.
 *                                          §7 de la fiche, en toutes lettres.
 *   COACH, DOCTRINE LUE, pas de jeton ... `no_position` — le nouveau défaut.
 *   COACH, DOCTRINE ILLISIBLE ........... `no_counting` — FAIL-CLOSED.
 *
 * Le dernier cas est le seul arbitrage de cette fonction. Un coach existe, on
 * ne sait pas ce qu'il pense, et le produit s'apprête à contredire peut-être sa
 * méthode devant son élève. Se taire ne coûte qu'un chiffre absent; parler
 * coûte la promesse qu'on vend au coach — « l'agent parle comme moi ».
 */
export function countingStanceFrom(args: {
  /** L'élève a-t-il un coach ? `false` = méthode maison. */
  hasCoach: boolean;
  /** A-t-on RÉELLEMENT lu sa doctrine publiée ? `false` = panne ou absence. */
  doctrineReadable: boolean;
  /** Les jetons d'interdit de la doctrine publiée. */
  forbiddenTokens: readonly string[];
}): CountingStance {
  if (!args.hasCoach) return "no_position";
  if (!args.doctrineReadable) return "no_counting";
  return args.forbiddenTokens.includes(NO_COUNTING_TOKEN)
    ? "no_counting"
    : "no_position";
}

// ---------------------------------------------------------------------------
// LA CHAÎNE
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`[keel/energy_gate] ${message}`);
}

/**
 * Un chiffre d'énergie peut-il atteindre cet élève ?
 *
 * ── POURQUOI LA VALIDATION EST DANS LA FONCTION ET PAS DANS LE TYPE ────────
 * Le type protège les appelants TypeScript. Il ne protège pas un appelant qui
 * construit son entrée depuis du JSON, une ligne de base ou un `as`. Ce dépôt a
 * la cicatrice « `as` sur un type étranger désarme le typecheck »: un objet mal
 * formé compilerait, et le premier `if` le lirait `undefined`, c'est-à-dire
 * faux, c'est-à-dire « pas de plancher ». La validation à l'exécution est ce
 * qui empêche `undefined` de valoir « tout va bien ».
 */
export function canShowEnergy(input: EnergyGateInput): EnergyGateResult {
  if (input === null || typeof input !== "object") {
    fail("canShowEnergy requires an input object");
  }
  const bag = input as unknown as Record<string, unknown>;
  for (const key of ENERGY_GATE_INPUT_KEYS) {
    if (!Object.hasOwn(bag, key)) {
      fail(`missing required gate input: ${key}`);
    }
    if (bag[key] === undefined) {
      fail(`gate input ${key} is undefined — an absent gate is a disarmed gate`);
    }
  }
  if (typeof input.restrictionFlag !== "boolean") {
    fail("restrictionFlag must be a boolean");
  }
  if (typeof input.studentSwitch !== "boolean") {
    fail("studentSwitch must be a boolean");
  }
  if (
    typeof input.ageVerdict !== "object" || input.ageVerdict === null ||
    typeof (input.ageVerdict as { status?: unknown }).status !== "string"
  ) {
    fail("ageVerdict must be a BirthDateVerdict");
  }
  if (!(COUNTING_STANCES as readonly string[]).includes(input.coachCounting)) {
    fail(`unknown counting stance: ${JSON.stringify(input.coachCounting)}`);
  }

  // ① LE PLANCHER. Aucun argument ne l'accompagne dans ce `if`, et c'est le
  //    point: il n'y a rien à conjuguer avec lui. Un `&&` ici serait la version
  //    cassée de cette fonction.
  if (input.restrictionFlag) return { show: false, reason: "restriction_floor" };

  // ② LE MINEUR. La règle vient de `weekPlanAgeGate`, pas d'une comparaison
  //    d'âge réécrite ici: une seconde définition de « mineur » diverge, et
  //    celle-ci porterait la garde la plus sensible du produit.
  if (weekPlanAgeGate(input.ageVerdict).reason === "minor") {
    return { show: false, reason: "minor" };
  }

  // ③ LA MÉTHODE DU COACH.
  if (input.coachCounting === "no_counting") {
    return { show: false, reason: "doctrine_no_counting" };
  }

  // ④ L'ÉLÈVE.
  if (!input.studentSwitch) return { show: false, reason: "student_off" };

  return { show: true, reason: "open" };
}
