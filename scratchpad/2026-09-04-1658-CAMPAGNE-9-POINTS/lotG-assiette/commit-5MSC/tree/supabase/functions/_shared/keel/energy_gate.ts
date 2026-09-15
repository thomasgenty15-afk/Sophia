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
 *   ② mineur OU ÂGE INCONNU — verdict d'âge.      ② par personne; ②bis en
 *                                                 renseignant sa date.
 *   ③ doctrine `counting`— la méthode du coach.   Rouvrable par le coach.
 *   ④ interrupteur élève — son choix.             Rouvrable par l'élève.
 *
 * ⟳ **④ EST UN TRI-ÉTAT DEPUIS LE LOT 4 (2026-09-01), ET C'EST LA SEULE PORTE
 * QUI S'OUVRE TOUTE SEULE.** `null` ne veut pas dire « éteint »: il veut dire
 * « personne n'a choisi », et c'est alors la DIRECTION de la balance qui décide
 * (`energySwitchFrom`). Un `false` reste un choix explicite et gagne pour
 * toujours. ⛔ Cette dérivation n'entre QUE par `studentSwitch`, en quatrième
 * position: elle ne desserre ni ①, ni ②, ni ③.
 *
 * ⟳ **② A DEUX MOITIÉS DEPUIS `S3` (2026-08-22), et la seconde est celle qui
 * couvre 91 % de la base.** `minor` est un fait su; `age_unknown` est un fait
 * qu'on n'a pas. Les deux ferment le CHIFFRE et ne ferment RIEN d'autre — le
 * plan sort, la conversation continue. Voir `energySafetyGates`.
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
/**
 * ⚠️ IMPORT DE TYPE SEUL, ET C'EST CE QUI GARDE CE MODULE SANS CYCLE.
 * `weight_pace.ts` n'importe pas `energy_gate.ts` aujourd'hui, mais
 * `mouth_anchor.ts` importe les deux — un import de VALEUR ici mettrait la garde
 * la plus sensible du produit à une arête de graphe près d'un cycle. Un `import
 * type` est effacé à la compilation: il n'y a rien à cycler.
 */
import type { ScaleDirection } from "./weight_pace.ts";

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
    /**
     * ⟳ S3 (2026-08-22) — L'ÂGE QU'ON NE SAIT PAS, ET IL EST DISTINCT DE
     * `minor`. Les deux ferment la même porte et ne se réparent pas pareil:
     * `minor` est un FAIT (le coach est prévenu, `escalateMinorStudent`),
     * `age_unknown` est un TROU (la date se demande, et 1 193 profils sur
     * 1 313 l'ont). Les confondre dirait à 91 % de la base qu'on les a pris
     * pour des enfants.
     *
     * ⚠️ Même jeton que la lane foyer (`BoxSizingReason`, `AnchorReason`,
     * `BodyShareReason`) — pas un synonyme neuf.
     */
    "age_unknown",
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
   * premier fuseau horaire. ⟳ **La porte se ferme sur `status === "minor"` ET
   * sur tout statut qui n'est pas `adult`** — voir `weekPlanAgeGate`, dont
   * `numberAllowed` est exactement cette règle. Le verdict entier est ce qui
   * permet de NOMMER laquelle des deux moitiés a mordu.
   */
  ageVerdict: BirthDateVerdict;
  /** ③ La position du coach, telle que `countingStanceFrom` l'a réduite. */
  coachCounting: CountingStance;
  /**
   * ④ L'ÉTAT EFFECTIF DE L'INTERRUPTEUR, tel que `energySwitchFrom` l'a rendu.
   *
   * ⚠️ CE N'EST PLUS `profiles.energy_display_enabled` LU EN DIRECT. Depuis le
   * lot 4 la colonne est un TRI-ÉTAT, et `null` y veut dire « personne n'a
   * choisi » — pas « éteint ». Un appelant qui écrirait `col === true` ici
   * refermerait le chiffre à tous ceux que leur direction devait ouvrir, en
   * silence et sans qu'aucun type ne bronche. La réduction passe par
   * `energySwitchFrom`, et par elle seule.
   */
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
// LES PORTES ④ ET ⑤ — CE QU'UNE DIRECTION DÉJÀ DÉCLARÉE VAUT COMME RÉPONSE
//
// ⟳ LOT 4 (2026-09-01). Décision humaine, en toutes lettres: « dès qu'une
// personne dit qu'elle veut gagner ou perdre du poids, elle doit être en
// capacité de voir ces chiffres. Comme ça c'est pas compliqué et ça se fait
// automatiquement. »
// ---------------------------------------------------------------------------

/**
 * D'OÙ VIENT L'ÉTAT D'UN INTERRUPTEUR. Nommé, jamais un booléen nu.
 *
 * Un `on: true` ne dit pas si la personne l'a demandé ou si sa direction l'a
 * ouvert, et ces deux-là ne se comptent pas pareil: §10 de la fiche veut
 * mesurer la DEMANDE, et une dérivation qui se mélangerait aux clics rendrait
 * cette métrique illisible le jour où elle décidera de quelque chose.
 */
export const ENERGY_SWITCH_SOURCES = Object.freeze(
  [
    /** La personne a appuyé sur « Afficher ». */
    "explicit_on",
    /**
     * Elle a appuyé sur « Masquer ». ⚠️ CE MOTIF GAGNE CONTRE LA DIRECTION, ET
     * POUR TOUJOURS — R7: « un chiffre qu'on ne peut pas faire taire est un
     * tracker ». Une extinction que le prochain changement d'objectif
     * rallumerait ne serait pas une extinction.
     */
    "explicit_off",
    /** Personne n'a choisi, et la balance de cette personne a une direction. */
    "direction",
    /** Personne n'a choisi, et il n'y a aucune direction à lire. */
    "no_direction",
  ] as const,
);
export type EnergySwitchSource = (typeof ENERGY_SWITCH_SOURCES)[number];

/**
 * Les clés que `energySwitchFrom` EXIGE. Exportée pour que le test puisse les
 * retirer une par une — une liste recopiée à la main resterait verte le jour où
 * quelqu'un ajoute un champ.
 */
export const ENERGY_SWITCH_INPUT_KEYS = Object.freeze(
  ["stored", "direction"] as const,
);

/**
 * L'ÉTAT EFFECTIF D'UN INTERRUPTEUR TRI-ÉTAT — LA SEULE ÉCRITURE DE LA RÈGLE.
 *
 * ── POURQUOI CETTE FONCTION EXISTE PLUTÔT QU'UN `??` CHEZ L'APPELANT ──────
 * Parce que la migration `20260812230000` avait raison sur un point qu'on ne
 * renverse pas: « un `null` obligerait à écrire le défaut à DEUX endroits ».
 * La réponse n'est pas de renoncer au tri-état, c'est de n'avoir qu'UN endroit.
 * Deux appelants qui écriraient `stored ?? (goal === "fat_loss")` chacun de leur
 * côté divergeraient au premier jeton d'objectif ajouté — et celui qu'on relit
 * le moins garderait l'ancienne liste.
 *
 * ── ⛔ ELLE NE PREND PAS UN OBJECTIF, ELLE PREND UNE DIRECTION ────────────
 * `GOAL_TOKENS` vit dans `tokens.ts` et sa réduction en direction vit dans
 * `scaleDirectionOf` (`weight_pace.ts`), où `maintenance` rend `null`. Recopier
 * ici la liste des objectifs qui « comptent » ferait une TROISIÈME table de la
 * même règle, et c'est celle-ci qui porterait la garde. L'appelant réduit, cette
 * fonction décide.
 *
 * ── ⛔ ET ELLE N'OUVRE AUCUNE AUTRE PORTE ─────────────────────────────────
 * Son résultat entre dans `canShowEnergy` comme `studentSwitch`, c'est-à-dire
 * en QUATRIÈME position. Le plancher TCA, l'âge et la doctrine du coach sont
 * évalués avant et gagnent contre elle. Une direction n'est pas une dérogation.
 *
 * ── LES DEUX ENTRÉES SONT REQUISES, ET UNE ENTRÉE INCOMPLÈTE LÈVE ─────────
 * Même règle que tout ce module: « un paramètre de garde optionnel est une
 * garde désarmée ». Un `direction?` aurait fait de `no_direction` la réponse
 * SILENCIEUSE de tout appelant qui aurait oublié de brancher l'objectif — et un
 * lot désarmé ressemble trait pour trait à un lot qui marche.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function energySwitchFrom(args: {
  /**
   * La colonne (`profiles.energy_display_enabled` ou `energy_target_enabled`),
   * telle que la base la rend. `null` = personne n'a jamais choisi.
   */
  stored: boolean | null;
  /**
   * La direction de la balance de cette personne, telle que `scaleDirectionOf`
   * l'a réduite. `null` = `maintenance`, ou aucun objectif lisible.
   */
  direction: ScaleDirection | null;
}): { on: boolean; source: EnergySwitchSource } {
  if (args === null || typeof args !== "object") {
    fail("energySwitchFrom requires an input object");
  }
  const bag = args as unknown as Record<string, unknown>;
  for (const key of ENERGY_SWITCH_INPUT_KEYS) {
    if (!Object.hasOwn(bag, key)) {
      fail(`missing required switch input: ${key}`);
    }
    if (bag[key] === undefined) {
      fail(`switch input ${key} is undefined — an absent gate is a disarmed gate`);
    }
  }
  if (args.stored !== null && typeof args.stored !== "boolean") {
    fail("stored must be a boolean or null");
  }
  if (
    args.direction !== null && args.direction !== "up" && args.direction !== "down"
  ) {
    fail(`unknown scale direction: ${JSON.stringify(args.direction)}`);
  }

  // LE CHOIX EXPLICITE, DANS LES DEUX SENS, AVANT TOUTE DÉRIVATION.
  if (args.stored === true) return { on: true, source: "explicit_on" };
  if (args.stored === false) return { on: false, source: "explicit_off" };

  // PERSONNE N'A CHOISI. On ne pose la question à personne — on lit une réponse
  // DÉJÀ donnée. L'entonnoir exige la direction de tout adulte (`personMisses`,
  // `frontend/src/keel/api/onboarding.ts`): quelqu'un qui a écrit « je veux
  // perdre du gras » a déjà dit qu'il compte.
  return args.direction === null
    ? { on: false, source: "no_direction" }
    : { on: true, source: "direction" };
}

// ---------------------------------------------------------------------------
// LA CHAÎNE
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`[keel/energy_gate] ${message}`);
}

/**
 * ①②③ SEULES — LES TROIS PORTES QUI NE SONT PAS DES INTERRUPTEURS.
 *
 * ── POURQUOI CETTE COUPURE EXISTE, ET OÙ ELLE PASSE ────────────────────────
 * Les quatre portes ne sont pas de la même espèce. ① le plancher, ② l'âge et
 * ③ la méthode du coach disent « ce chiffre ne doit pas être PRODUIT pour
 * cette personne ». ④ (et ⑤) disent « cette personne ne veut pas le VOIR ».
 *
 * Un jour, un moteur voudra se servir d'une énergie pour dimensionner une part
 * sans jamais l'afficher (FF-059 lot 3 / le chantier des boîtes). Il lui faut
 * les trois premières — et il ne doit surtout PAS lire les deux dernières:
 * masquer un chiffre ne doit pas changer le dîner. Sans cette fonction, cet
 * appelant réécrirait ①②③ chez lui, et « deux points de décision finissent par
 * diverger » — celui-ci porte la garde la plus sensible du produit.
 *
 * ⚠️ ELLE N'EST PAS UNE VERSION ALLÉGÉE DE `canShowEnergy`. C'est l'inverse:
 * `canShowEnergy` EST cette fonction, plus ④. Il n'existe donc qu'une seule
 * écriture de la chaîne de sécurité dans le dépôt.
 */
export interface EnergySafetyInput {
  /** ① Le plancher TCA. Voir `EnergyGateInput.restrictionFlag`. */
  restrictionFlag: boolean;
  /** ② Le verdict d'âge. Voir `EnergyGateInput.ageVerdict`. */
  ageVerdict: BirthDateVerdict;
  /** ③ La position du coach. Voir `EnergyGateInput.coachCounting`. */
  coachCounting: CountingStance;
}

export interface EnergySafetyResult {
  open: boolean;
  reason: EnergyGateReason;
}

/**
 * Les clés que `energySafetyGates` EXIGE. Mêmes règles que
 * `ENERGY_GATE_INPUT_KEYS`: une entrée incomplète LÈVE.
 */
export const ENERGY_SAFETY_INPUT_KEYS = Object.freeze(
  ["restrictionFlag", "ageVerdict", "coachCounting"] as const,
);

/**
 * Les motifs que `energySafetyGates` peut rendre. `student_off` n'en est PAS:
 * cette chaîne-ci ne lit aucun interrupteur, et un motif qu'elle ne peut pas
 * produire n'a pas à figurer dans son vocabulaire.
 */
export const ENERGY_SAFETY_REASONS = Object.freeze(
  [
    "open",
    "restriction_floor",
    "minor",
    // ⟳ S3 — la porte ②bis. Elle appartient bien à la chaîne de SÉCURITÉ et pas
    // aux interrupteurs: elle décide qu'un chiffre ne doit pas être PRODUIT.
    "age_unknown",
    "doctrine_no_counting",
  ] as const,
);

export function energySafetyGates(input: EnergySafetyInput): EnergySafetyResult {
  if (input === null || typeof input !== "object") {
    fail("energySafetyGates requires an input object");
  }
  const bag = input as unknown as Record<string, unknown>;
  for (const key of ENERGY_SAFETY_INPUT_KEYS) {
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
  if (input.restrictionFlag) return { open: false, reason: "restriction_floor" };

  // ② LE MINEUR. La règle vient de `weekPlanAgeGate`, pas d'une comparaison
  //    d'âge réécrite ici: une seconde définition de « mineur » diverge, et
  //    celle-ci porterait la garde la plus sensible du produit.
  const age = weekPlanAgeGate(input.ageVerdict);
  if (age.reason === "minor") {
    return { open: false, reason: "minor" };
  }

  // ②bis L'ÂGE QU'ON NE SAIT PAS — ⟳ AJOUTÉ PAR `S3` LE 2026-08-22.
  //
  //    ⛔ CE N'EST PAS « FERMER SUR ABSENT ». La porte ② se ferme sur l'âge
  //    inconnu POUR LE CHIFFRE, et pour lui seul: `weekPlanAgeGate().allowed`
  //    reste `true`, donc le plan sort, la conversation continue, et rien ne
  //    refuse le dîner de personne. C'est le sens exact de la coupure ①②③ / ④
  //    décrite plus haut: cette chaîne dit « ce chiffre ne doit pas être
  //    PRODUIT », jamais « cette personne ne doit rien recevoir ».
  //
  //    CE QUE ÇA RÉPARE, MESURÉ: `absent` rendait `{open:true, reason:"open"}`
  //    sur **1 193 profils de 1 313** (90,9 %, 2026-08-22), dont **17 mineurs
  //    avérés** — et tous ceux que l'absence cache. Le déficit d'un objectif
  //    de perte se posait donc sur un corps dont on ignore s'il grandit.
  //
  //    ⚠️ CE N'EST PAS UNE RÈGLE NEUVE — C'EST CELLE DE LA LANE FOYER, ENFIN
  //    PARTAGÉE. `household_portions.ts` fait déjà exactement ça, trois fois
  //    (`if (ageState === "unknown") return noSizing("age_unknown")`), et
  //    `mouth_anchor.ts` une quatrième. Ces quatre `if` survivent délibérément:
  //    ils lisent `MemberAgeState`, pas un verdict, et deux ceintures ne
  //    divergent pas — elles se doublent. Ce qui change est que la lane SOLO
  //    cesse d'être l'exception.
  //
  //    ⛔ NE PAS « SIMPLIFIER » EN LISANT `age.allowed` ICI. `allowed` répond à
  //    « peut-on servir », et le lire ici rouvrirait le chiffre à 91 % de la
  //    base au premier refactor.
  if (!age.numberAllowed) {
    return { open: false, reason: "age_unknown" };
  }

  // ③ LA MÉTHODE DU COACH.
  if (input.coachCounting === "no_counting") {
    return { open: false, reason: "doctrine_no_counting" };
  }

  return { open: true, reason: "open" };
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
 *
 * La validation des quatre clés reste ICI, entière, même si `energySafetyGates`
 * revalide les trois siennes: ce n'est pas une décision, c'est une ceinture, et
 * deux ceintures ne divergent pas — elles se doublent.
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
  if (typeof input.studentSwitch !== "boolean") {
    fail("studentSwitch must be a boolean");
  }

  // ①②③ — UNE SEULE ÉCRITURE, ET ELLE EST AILLEURS. Recopier les trois `if`
  //       ici ferait exactement les deux points de décision que le commentaire
  //       de `meal-energy-v1` interdit.
  const safety = energySafetyGates(input);
  if (!safety.open) return { show: false, reason: safety.reason };

  // ④ L'ÉLÈVE.
  if (!input.studentSwitch) return { show: false, reason: "student_off" };

  return { show: true, reason: "open" };
}

// ---------------------------------------------------------------------------
// FF-059 LOT 3 — LA CINQUIÈME PORTE, et elle ne garde QUE le niveau C
// ---------------------------------------------------------------------------

/**
 * Les motifs propres à la cible. `target_off` est le seul qui lui appartienne:
 * les quatre autres sont ceux de la chaîne A/B, repris tels quels.
 */
export const TARGET_GATE_REASONS = Object.freeze(
  [...ENERGY_GATE_REASONS, "target_off"] as const,
);
export type TargetGateReason = (typeof TARGET_GATE_REASONS)[number];

/**
 * L'élève peut-il voir une CIBLE (niveau C) ?
 *
 * ── LA CHAÎNE A/B EST UN PRÉREQUIS, PAS UNE VOISINE ────────────────────────
 * Cette fonction prend le RÉSULTAT de `canShowEnergy` et ne le recalcule pas.
 * C'est ce qui garantit structurellement — pas par discipline — que le plancher
 * TCA, l'âge et la doctrine du coach ferment LES TROIS NIVEAUX. Il n'existe
 * aucun chemin vers une cible qui ne passe pas d'abord par les quatre portes,
 * parce qu'il n'y a pas d'autre argument par lequel entrer.
 *
 * Et l'ordre a une conséquence qu'on veut: le motif rendu est celui de la
 * PREMIÈRE porte fermée. Un élève sous plancher dont la cible est éteinte lit
 * `restriction_floor`, jamais `target_off`.
 *
 * ── POURQUOI UN SECOND INTERRUPTEUR, ET PAS CELUI DE A/B ───────────────────
 * Parce que ce ne sont pas les mêmes objets. Accepter de voir ce que pèse son
 * dîner n'est pas accepter qu'on estime ce que son corps devrait manger — la
 * première est une information sur la nourriture, la seconde est un tracker.
 * Un interrupteur unique ferait de la seconde le prix de la première.
 *
 * ── `count_briefly` DU COACH: LA QUESTION §11 n°2, TRANCHÉE ────────────────
 * Elle n'a PAS de branche ici, et c'est la décision. La position dit « compte
 * deux semaines, c'est une leçon, pas un mode de vie » — un TEMPS, pas un
 * booléen. Honorer ce temps demande un état neuf (quand le compteur a commencé)
 * et une extinction que l'écran doit expliquer; l'inventer ici, sans que
 * personne n'ait tranché le jour 15, produirait soit un tracker permanent sous
 * un coach qui l'a explicitement borné, soit une extinction silencieuse qui se
 * lit comme une panne.
 *
 * En attendant, `count_briefly` ouvre la porte ③ comme l'absence de position:
 * un coach qui autorise à compter n'obtient pas MOINS qu'un coach qui n'a rien
 * dit. Ce qui protège l'élève est l'opt-in ci-dessous, pas une asymétrie entre
 * deux positions de coach qui serait incompréhensible à table.
 */
export function canShowTarget(args: {
  /** Le résultat de `canShowEnergy`. REQUIS: c'est la seule porte d'entrée. */
  energy: EnergyGateResult;
  /** `profiles.energy_target_enabled`. `false` = l'élève n'a pas demandé. */
  targetSwitch: boolean;
}): { show: boolean; reason: TargetGateReason } {
  if (args === null || typeof args !== "object") {
    fail("canShowTarget requires an input object");
  }
  const bag = args as unknown as Record<string, unknown>;
  for (const key of ["energy", "targetSwitch"]) {
    if (!Object.hasOwn(bag, key) || bag[key] === undefined) {
      fail(`missing required target gate input: ${key}`);
    }
  }
  if (typeof args.targetSwitch !== "boolean") {
    fail("targetSwitch must be a boolean");
  }
  if (
    typeof args.energy !== "object" || args.energy === null ||
    typeof args.energy.show !== "boolean" ||
    !(ENERGY_GATE_REASONS as readonly string[]).includes(args.energy.reason)
  ) {
    fail("energy must be the result of canShowEnergy");
  }

  // LA CHAÎNE A/B D'ABORD, ET SON MOTIF SURVIT TEL QUEL.
  if (!args.energy.show) return { show: false, reason: args.energy.reason };
  if (!args.targetSwitch) return { show: false, reason: "target_off" };
  return { show: true, reason: "open" };
}

// ---------------------------------------------------------------------------
// L4 — LA GARDE TCA ARMÉE JUSQU'AU MOTEUR ET JUSQU'À LA TABLE
//
// Chantier: `docs/keel/CALORIE_REVERSAL.md` §0, l'étape déclarée BLOQUANTE.
// Rapport: `scratchpad/2026-08-18-*-L4A-garde-tca.md` (les trois réponses).
//
// ── LA DÉCISION ① DE L'UTILISATEUR, 2026-08-18, ET CE QU'ELLE IMPOSE ────────
//
//     « LA GARDE NE PRODUIT JAMAIS LE CHIFFRE. Elle ne le supprime pas après
//       coup. Rien à filtrer, donc rien qui puisse fuir par un chemin
//       d'affichage oublié. Un filtre exhaustif est une promesse que le
//       prochain rendu trahit sans le savoir. »
//
// Conséquence de CONCEPTION, et c'est elle qui décide de la forme des deux
// fonctions ci-dessous: **l'état se lit AVANT le calcul, jamais entre le calcul
// et l'écran.** Aucune de ces deux fonctions ne prend un nombre en entrée, et
// aucune n'en rend un: elles répondent « tu peux calculer » ou « non, pour
// CETTE raison », et elles répondent avant qu'un kcal existe.
//
// ⚠️ CE QUE ÇA INTERDIT À TOUT LOT FUTUR (le contrat, en une phrase): un kcal
// peut vivre dans la pile d'appel d'un module pur; il ne peut PAS traverser une
// réponse HTTP, une ligne de base, une consigne de modèle, un log nominatif ou
// un écran sans que la porte correspondante ait dit oui AVANT qu'il soit
// calculé.
// ---------------------------------------------------------------------------

/**
 * LE MOTEUR PEUT-IL DIMENSIONNER UNE PART À PARTIR D'UNE ÉNERGIE ?
 *
 * C'est la porte du chantier de la cible (« la cible contraint les GRAMMAGES »).
 * Elle existe parce que `household_portions.ts` ne connaît AUJOURD'HUI ni le
 * plancher TCA, ni l'âge, ni la doctrine du coach — mesuré: les mots
 * `restriction` et `floor` n'y apparaissent pas une seule fois. Tant que les
 * parts se dimensionnaient sur des enveloppes de maintenance, ça n'avait pas
 * d'importance. Le jour où une CIBLE les dimensionne, l'absence de cette porte
 * serait un régime chiffré servi à quelqu'un que le plancher protège.
 *
 * ── POURQUOI ELLE NE LIT NI ④ NI ⑤, ET C'EST UN ARBITRAGE ─────────────────
 * « Masquer les calories » est une préférence de LECTURE. Si elle changeait le
 * dîner, l'élève paierait son confort en nourriture, et il découvrirait —
 * peut-être — que sa part a changé le jour où il a caché un nombre. Les
 * interrupteurs éteignent un affichage; ils ne pilotent pas une casserole.
 *
 * ⚠️ NE PAS « RÉPARER » EN AJOUTANT `studentSwitch` ICI. C'est écrit avant la
 * première ligne d'appelant, exprès: la prochaine session qui verra une porte
 * ④ « manquante » aura ce paragraphe sous les yeux.
 *
 * ── ET POURQUOI ELLE PREND UN RÉSULTAT, PAS TROIS BOOLÉENS ────────────────
 * Même mécanique que `canShowTarget`: le seul argument par lequel on entre est
 * la SORTIE de `energySafetyGates`. Un appelant ne peut donc pas dimensionner
 * sans avoir fait tourner ①②③ — il n'y a pas d'autre porte, et il ne peut pas
 * en fabriquer une avec un littéral (la validation d'exécution refuse une forme
 * qui n'est pas un `EnergySafetyResult`).
 */
export function canSizeFromTarget(args: {
  /** La sortie de `energySafetyGates`. REQUIS: c'est la seule porte d'entrée. */
  safety: EnergySafetyResult;
}): { size: boolean; reason: EnergyGateReason } {
  if (args === null || typeof args !== "object") {
    fail("canSizeFromTarget requires an input object");
  }
  const bag = args as unknown as Record<string, unknown>;
  if (!Object.hasOwn(bag, "safety") || bag.safety === undefined) {
    fail("missing required sizing gate input: safety");
  }
  if (
    typeof args.safety !== "object" || args.safety === null ||
    typeof args.safety.open !== "boolean" ||
    !(ENERGY_SAFETY_REASONS as readonly string[]).includes(args.safety.reason)
  ) {
    fail("safety must be the result of energySafetyGates");
  }
  // LE MOTIF DE LA PREMIÈRE PORTE FERMÉE SURVIT TEL QUEL. Un foyer dont le
  // compte maître est sous plancher lit `restriction_floor`, jamais autre chose.
  if (!args.safety.open) return { size: false, reason: args.safety.reason };
  return { size: true, reason: "open" };
}

/**
 * Les motifs de l'ÉMISSION par bouche. Les six de la chaîne A/B/C, plus un.
 */
export const MOUTH_ENERGY_REASONS = Object.freeze(
  [...TARGET_GATE_REASONS, "other_mouth"] as const,
);
export type MouthEnergyReason = (typeof MOUTH_ENERGY_REASONS)[number];

/**
 * UN CHIFFRE ATTRIBUÉ À UNE BOUCHE PEUT-IL SORTIR ?
 *
 * ── LA QUESTION §11 n°4 DE LA FICHE FF-059, TRANCHÉE ──────────────────────
 * « Le foyer: les chiffres des autres bouches sont-ils visibles du maître ? »
 * NON. Un chiffre d'énergie ne sort que pour la bouche QUI LE DEMANDE.
 *
 * Trois raisons, et la première suffirait:
 *
 *   1. LES CINQ ÉTATS QUI PORTENT LA DÉCISION SONT CLÉS SUR `auth.users` —
 *      mesuré: le plancher (`evaluateRestrictionForStudent(userId)`),
 *      `profiles.birth_date`, la doctrine du coach, et les deux interrupteurs.
 *      AUCUN n'est clé sur `member_id`. Un foyer de quatre bouches n'a donc
 *      qu'UNE ceinture, et elle appartient au compte maître. Rendre le chiffre
 *      d'une autre bouche, c'est le rendre sous la ceinture de quelqu'un
 *      d'autre — l'âge d'un autre, le plancher d'un autre, le consentement
 *      d'un autre.
 *   2. UNE BOUCHE SANS COMPTE NE PEUT RIEN ÉTEINDRE. « Un chiffre qu'on ne
 *      peut pas faire taire est un tracker », et un enfant de douze ans n'a
 *      pas d'interrupteur — il n'a pas de ligne où en poser un.
 *   3. « CE QUI TOUCHE LE CORPS EST À SOI » (règle du foyer). Le corps de
 *      chaque bouche est déjà dans une table sans aucun grant à
 *      `authenticated`, précisément pour que le poids d'un co-membre ne soit
 *      pas lisible. Un kcal par bouche à l'écran rouvrirait par la façade la
 *      porte que `household_member_bodies` ferme par derrière.
 *
 * ⚠️ CE N'EST PAS UN INTERDIT DE CALCUL. Le moteur du foyer dimensionne déjà
 * chaque part sur le corps de chaque bouche, et c'est la doctrine écrite du
 * domaine: « collecter et calculer, jamais ÉNONCER ». Cette porte-ci garde
 * l'énoncé, `canSizeFromTarget` garde le calcul. Les confondre fermerait le
 * dîner d'une famille pour protéger un affichage que personne ne demandait.
 */
export function canEmitMouthEnergy(args: {
  /**
   * Le résultat de la chaîne POUR LE LECTEUR — `canShowEnergy` (niveaux A/B) ou
   * `canShowTarget` (niveau C). REQUIS: c'est la seule porte d'entrée.
   */
  reader: { show: boolean; reason: TargetGateReason };
  /** La bouche dont on parle EST-ELLE le lecteur ? REQUIS. */
  mouthIsReader: boolean;
}): { emit: boolean; reason: MouthEnergyReason } {
  if (args === null || typeof args !== "object") {
    fail("canEmitMouthEnergy requires an input object");
  }
  const bag = args as unknown as Record<string, unknown>;
  for (const key of ["reader", "mouthIsReader"]) {
    if (!Object.hasOwn(bag, key) || bag[key] === undefined) {
      fail(`missing required mouth gate input: ${key}`);
    }
  }
  if (typeof args.mouthIsReader !== "boolean") {
    fail("mouthIsReader must be a boolean");
  }
  if (
    typeof args.reader !== "object" || args.reader === null ||
    typeof args.reader.show !== "boolean" ||
    !(TARGET_GATE_REASONS as readonly string[]).includes(args.reader.reason)
  ) {
    fail("reader must be the result of canShowEnergy or canShowTarget");
  }

  // LA CHAÎNE DU LECTEUR D'ABORD, ET SON MOTIF SURVIT TEL QUEL. Un lecteur sous
  // plancher qui demande la part d'un autre lit `restriction_floor`: le motif
  // qui se répare, pas celui qui se contourne.
  if (!args.reader.show) return { emit: false, reason: args.reader.reason };
  if (!args.mouthIsReader) return { emit: false, reason: "other_mouth" };
  return { emit: true, reason: "open" };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT F (2026-09-04) — LE KCAL D'UNE BOÎTE À UN NOM, SOUS LA CEINTURE DE
// **CETTE** BOUCHE — et plus sous celle du lecteur.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LA DÉCISION, MOT POUR MOT ────────────────────────────────────────────
// « C'est affiché pour les personnes qui ont l'objectif de prendre ou perdre
// du poids. Si le maître est la femme et que c'est le mari qui veut perdre du
// poids, alors ça affiche le nombre de calories sur le compte du maître. Dès
// qu'il y a un objectif de perte ou gain de poids c'est affiché, peu importe
// qui regarde. » (2026-09-04)
//
// ── CE QU'ELLE RENVERSE, ET COMMENT ON RÉPOND À CHACUNE DES TROIS RAISONS ─
// `canEmitMouthEnergy` (au-dessus) dit NON à la question §11 n°4: un chiffre ne
// sort que pour la bouche qui le demande. Ses trois raisons étaient justes le
// jour où elles ont été écrites, et cette porte-ci répond à chacune plutôt que
// de retourner un booléen:
//
//   1. « Les cinq états sont clés sur auth.users, pas sur member_id. » — Cette
//      porte NE LIT PAS la ceinture du lecteur. Elle prend la chaîne de
//      sécurité ①②③ **de la bouche** (`energySafetyGates`, avec SON âge lu sur
//      `household_members.birth_date`, SON plancher quand elle a un compte, la
//      doctrine du foyer) et SON interrupteur ④ (`energySwitchFrom` avec SA
//      direction, lue sur `household_members.goal`). Le chiffre sort sous la
//      ceinture de celui qu'il concerne.
//   2. « Une bouche sans compte ne peut rien éteindre. » — Vrai, et assumé par
//      la décision: le maître qui a ouvert le foyer peut retirer l'objectif de
//      la bouche, et c'est ce qui éteint. La bouche n'est pas nommée à côté
//      d'un corps: le kcal d'une boîte est une QUANTITÉ DU PLAN
//      (`plan_quantities`), au prorata de ses grammes — jamais un poids, une
//      taille ou un besoin.
//   3. « Ce qui touche le corps est à soi. » — Le corps reste à soi. Ce qui
//      sort est ce que pèse une boîte de nourriture, pas ce que pèse quelqu'un.
//
// ⛔ CE QUE CETTE PORTE NE FAIT PAS. Elle ne touche PAS `canEmitMouthEnergy`,
// qui reste la règle du CONSEIL DU MIDI (`eatingOutAdvice`, C9): un conseil
// est une consigne adressée à quelqu'un, et il ne s'adresse qu'à qui le
// demande. Un kcal sur un couvercle n'est pas une consigne.
//
// ⛔ LE PLANCHER, L'ÂGE ET LE COACH FERMENT TOUJOURS, pour cette bouche-là. Un
// mineur du foyer n'a JAMAIS de kcal sur sa boîte, objectif ou pas; une bouche
// sans date de naissance non plus (`age_unknown`, fail-closed).
//
// ⚠️ LE LECTEUR GARDE UN DROIT: le sien. Voir `meal-energy-v1`: si le lecteur
// a EXPLICITEMENT éteint son chiffre (`explicit_off`), rien ne sort sur son
// écran, boîtes des autres comprises — R7, « un chiffre qu'on ne peut pas faire
// taire est un tracker ». Seule une fermeture PAR DÉFAUT du lecteur
// (`no_direction`: il est en maintenance et n'a rien choisi) laisse passer les
// boîtes des bouches à objectif. C'est là que « peu importe qui regarde »
// s'arrête, et c'est écrit.

/** Les motifs de l'émission par BOÎTE. La chaîne de sécurité, plus les deux
 *  états de l'interrupteur de la bouche. Jamais `other_mouth`: il n'y a plus
 *  d'« autre » ici, chaque bouche est jugée pour elle-même. */
export const BOX_ENERGY_REASONS = Object.freeze(
  [...ENERGY_SAFETY_REASONS, "student_off", "no_direction"] as const,
);
export type BoxEnergyReason = (typeof BOX_ENERGY_REASONS)[number];

export function canEmitBoxEnergy(args: {
  /** La chaîne ①②③ **de la bouche** — `energySafetyGates` sur SES entrées. REQUIS. */
  safety: EnergySafetyResult;
  /** L'interrupteur ④ **de la bouche** — `energySwitchFrom` sur SA direction. REQUIS. */
  mouthSwitch: { on: boolean; source: EnergySwitchSource };
}): { emit: boolean; reason: BoxEnergyReason } {
  if (args === null || typeof args !== "object") {
    fail("canEmitBoxEnergy requires an input object");
  }
  const bag = args as unknown as Record<string, unknown>;
  for (const key of ["safety", "mouthSwitch"]) {
    if (!Object.hasOwn(bag, key) || bag[key] === undefined) {
      fail(`missing required box gate input: ${key} — an absent gate is a disarmed gate`);
    }
  }
  if (
    typeof args.safety !== "object" || args.safety === null ||
    typeof args.safety.open !== "boolean" ||
    !(ENERGY_SAFETY_REASONS as readonly string[]).includes(args.safety.reason)
  ) {
    fail("safety must be the result of energySafetyGates");
  }
  if (
    typeof args.mouthSwitch !== "object" || args.mouthSwitch === null ||
    typeof args.mouthSwitch.on !== "boolean" ||
    !(ENERGY_SWITCH_SOURCES as readonly string[]).includes(args.mouthSwitch.source)
  ) {
    fail("mouthSwitch must be the result of energySwitchFrom");
  }
  // LA SÉCURITÉ D'ABORD, ET SON MOTIF SURVIT TEL QUEL — même ordre que partout.
  if (!args.safety.open) return { emit: false, reason: args.safety.reason };
  if (!args.mouthSwitch.on) {
    return {
      emit: false,
      // Deux silences différents: « elle a éteint » se répare en rallumant,
      // « elle n'a pas d'objectif » ne se répare pas — il n'y a rien à ouvrir.
      reason: args.mouthSwitch.source === "explicit_off" ? "student_off" : "no_direction",
    };
  }
  return { emit: true, reason: "open" };
}
