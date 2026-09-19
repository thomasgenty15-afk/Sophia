/**
 * LA BOUCLE DE RÉPARATION D'UN PLAN — UNE SEULE, ET ELLE COMPTE CE QU'ELLE FAIT.
 *
 * ⛔ CE QUE CE MODULE REMPLACE. Le générateur portait une SUCCESSION de
 * relances nommées (`protein_anchor_retry`, `exclusion_retry`, `swap_retry`,
 * `preference_split_retry`, `unfed_retry`, `density_repair`…), chacune avec sa
 * propre réservation dans un budget partagé. Trois conséquences, toutes
 * mesurées:
 *
 *   · un plan pouvait consommer ses deux rattrapages sur deux défauts MINEURS
 *     et n'en avoir aucun pour une violation de sécurité arrivée plus tard;
 *   · deux défauts présents en même temps partaient en DEUX appels au lieu
 *     d'une instruction; et
 *   · un « rattrapage refusé: repair_reserved » se lisait comme une panne
 *     alors que c'était une file d'attente.
 *
 * ⛔⛔ ÉTAT AU 2026-09-11 — CE MODULE N'EST PAS ENCORE BRANCHÉ, ET LA RAISON
 * EST MESURÉE. Le brancher au point d'étranglement existant
 * (`planRepairGranted`, une décision PAR SITE) a été tenté puis ANNULÉ: sur
 * l'ordre réel de la lane du foyer, la règle par nature accorde `protein` puis
 * `exclusion` et **perd `density_repair`** — la réparation qui a fait passer un
 * foyer de 6 assiettes dans les bornes à 12 sur 15.
 *
 * La cause n'est pas un barème: `protein` s'exécute EN PREMIER, `density` en
 * avant-dernier, et le chantier place `sizing` AU-DESSUS de `protein`. Au site
 * de `protein`, la mesure de densité n'existe pas encore dans le fichier —
 * aucune décision LOCALE ne peut savoir s'il faut lui garder un slot.
 *
 * ⟳ CE QUI LÈVE LA CONTRADICTION est la boucle elle-même: collecter TOUS les
 * défauts d'abord, puis en faire UNE instruction. Sans réservation, parce que
 * sans concurrence. Il faut pour cela hisser la MESURE au-dessus du premier
 * rattrapage — une refonte du corps du générateur, pas un rebranchement.
 * `plan_repair_loop_test.ts` § ⑦ épingle la mesure qui le prouve.
 *
 * ⚠️ CE MODULE NE PARLE À PERSONNE. Il est PUR: il décide, il ne compose pas.
 * Le générateur lui donne ce qu'il a mesuré et lui demande « est-ce que je
 * rappelle le modèle, et pour dire quoi ». C'est ce qui rend les situations du
 * chantier éprouvables sans base et sans appel modèle.
 */

import type { GateRefusal } from "./final_plan_gate.ts";
import type {
  OutputContractFinding,
  OutputContractReport,
} from "./composition_contract.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES DÉFAUTS, ET L'ORDRE DANS LEQUEL ON EN PARLE AU MODÈLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ L'ORDRE DE CETTE LISTE EST LE CONTRAT, pas une commodité de lecture. Une
 * instruction qui commence par « et ajoute des lentilles » avant de dire « ce
 * plat contient l'allergène de quelqu'un » fait lire le second comme un
 * détail. Le chantier fixe l'ordre: sécurité, présence des repas,
 * compatibilité calories/grammes/densité, protéines, préférences.
 */
export const REPAIR_DEFECT_KINDS = [
  "safety",
  "missing_meal",
  "sizing",
  "protein",
  "preference",
] as const;
export type RepairDefectKind = (typeof REPAIR_DEFECT_KINDS)[number];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-12 · LOT 2 — LA MESURE RÉELLE D'UN DÉFAUT, ET SA CIBLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI ELLE EXISTE, ET LE DÉFAUT EST MESURÉ. Jusqu'ici un défaut ne
 * portait que `detail` (une phrase) et `magnitude` (un nombre SANS unité ni
 * nature). Deux conséquences, toutes deux vues sur les archives du
 * 2026-09-11:
 *
 *   · `energy_off` et `bounds_off` rendaient la même cause, donc la même
 *     phrase, et la phrase parlait de calories. Le tir n° 4 a demandé au
 *     modèle de corriger « 0 % contre 728 kcal visées » — le vrai défaut
 *     était la densité;
 *   · rien, en aval, ne pouvait décider « ne demande pas une correction
 *     calorique, les calories sont bonnes »: l'information n'existait pas
 *     dans le type.
 *
 * ⛔ TROIS NATURES QUI NE SE MÉLANGENT JAMAIS: l'ÉNERGIE (kcal), la MASSE
 * (grammes de l'assiette cuite), la DENSITÉ (kcal/100 g). Plus la PROTÉINE
 * (grammes), qui avait déjà son chemin. Chacune porte sa mesure ET sa cible
 * ou ses bornes — « de combien ça manque » ne veut rien dire sans « par
 * rapport à quoi ».
 *
 * ⚠️ TOUS LES NOMBRES SONT NULLABLES, JAMAIS ABSENTS. `null` = « on ne sait
 * pas », et il se lit; `0` dirait « il ne manque rien ».
 */
export type RepairMeasure =
  | {
    readonly of: "energy";
    readonly servedKcal: number | null;
    readonly targetKcal: number | null;
    readonly deltaPct: number | null;
    /** La tolérance appliquée, en POURCENTS. */
    readonly tolerancePct: number | null;
  }
  | {
    readonly of: "mass";
    readonly grams: number | null;
    readonly minG: number | null;
    readonly maxG: number | null;
  }
  | {
    readonly of: "density";
    readonly per100G: number | null;
    readonly minPer100G: number | null;
    readonly maxPer100G: number | null;
  }
  | {
    readonly of: "protein";
    readonly servedG: number | null;
    readonly floorG: number | null;
  };

/** Les natures de mesure, fermées — un `switch` exhaustif s'y appuie. */
export const REPAIR_MEASURE_KINDS = [
  "energy",
  "mass",
  "density",
  "protein",
] as const;

/**
 * ⟳ 2026-09-12 · FERMETURE LOT 1 — D'OÙ VIENT UN CONSTAT.
 *
 * ⛔ SANS LUI, « 37 défauts » NE SE RELIT PAS. `PlanDefectPass.bySource`
 * comptait déjà les trois familles, mais le compte vivait à côté des défauts
 * et pas DEDANS : un défaut isolé ne savait plus dire qui l'avait vu.
 */
export const REPAIR_DEFECT_SOURCES = [
  "gate",
  "output_contract",
  "quantities",
  /** Un constat d'amont (ancre protéique, exclusion, bouche non nourrie…). */
  "upstream",
] as const;
export type RepairDefectSource = (typeof REPAIR_DEFECT_SOURCES)[number];

export interface RepairDefect {
  kind: RepairDefectKind;
  /** Le jour, le moment, le plat — ce qui permet de dire OÙ, au modèle. */
  day: string | null;
  slot: string | null;
  dish: string | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 1 — L'ADRESSE STRUCTURÉE, PAS UNE PHRASE
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT QUE CES QUATRE CHAMPS FERMENT. `GateRefusal` porte `cause` et
   * `preparation_id` ; `defectsFromRefusals` les JETAIT. En aval, le seul
   * moyen de savoir « quelle préparation » ou « est-ce une portion absente »
   * était de relire `detail` — une phrase anglaise écrite pour le modèle. Le
   * plan l'interdit en toutes lettres : « ne jamais retrouver une préparation
   * par recherche dans `detail` ou par rapprochement de titres ».
   *
   * ⛔ REQUIS ET NULLABLES, JAMAIS `?` — la règle du dépôt
   * (`optional-gate-params-are-disarmed-gates`). Un champ facultatif ferait de
   * « je ne sais pas » la réponse silencieuse de tous les constructeurs.
   */
  /** La cause de la garde finale (`protein_floor_short`…). `null` = autre source. */
  cause: string | null;
  /**
   * ⛔ LA DATE ISO, SÉPARÉE DU JETON DE JOUR. `day` porte tantôt `sat`, tantôt
   * `2026-09-14` selon la cause — et c'est cette ambiguïté qui faisait rendre
   * un périmètre vide à `repairScopeOf` pour un défaut journalier.
   */
  date: string | null;
  /** La préparation en cause. `null` = le défaut ne porte pas sur un lot. */
  preparationId: string | null;
  /**
   * ⟳ 2026-09-13 · LOT 2 — LA SESSION EN CAUSE, PAR SON INDEX DANS LE PLAN.
   *
   * ⛔ POURQUOI UN INDEX ET PAS UN JETON. Le jeton (`S1`) est attribué par la
   * TABLE DES SESSIONS, qui se construit au moment de la réparation ; le
   * constat, lui, naît bien plus tôt — le verrou de sortie rend un
   * `sessionIndex`. Traduire ici demanderait au producteur de constat de
   * connaître la table, c'est-à-dire d'être branché sur l'aval.
   *
   * ⛔ REQUIS ET NULLABLE, JAMAIS `?`. `null` = ce défaut ne porte pas sur une
   * session. Facultatif, il ferait de « je ne sais pas » la réponse silencieuse
   * de tous les constructeurs — le mode d'échec n° 1 du dépôt
   * (`optional-gate-params-are-disarmed-gates`).
   */
  sessionIndex: number | null;
  /** Qui a vu ce défaut. */
  source: RepairDefectSource;
  /** À qui ce défaut appartient. `null` = il porte sur le plat, pas une bouche. */
  memberId: string | null;
  /** La phrase qui part au modèle. Jamais un code interne. */
  detail: string;
  /**
   * ⛔ `false` = ce défaut est CONNU et NE SE RÉPARE PAS PAR UN APPEL. Une
   * référence alimentaire introuvable, par exemple: le modèle ne la fera pas
   * exister en réécrivant sa recette. Le compter comme réparable ferait brûler
   * une tentative pour rien — et le chantier l'interdit en toutes lettres:
   * « un contrôle déterministe ne consomme pas de tentative ».
   */
  repairable: boolean;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-11 · LOT E — DE COMBIEN CE DÉFAUT MANQUE. `null` = on ne sait
   * pas le chiffrer.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ IL EXISTE PARCE QUE COMPTER NE SUFFIT PAS. Le chantier le demande en
   * toutes lettres: « accepter une amélioration quantifiée même si le nombre
   * de défauts ne baisse pas — le passage PERTE de 3 défauts importants à 3
   * défauts plus faibles doit pouvoir être conservé ». `judgeCandidate`
   * rejetait ce cas-là (`no_improvement`), donc la réparation qui a fait
   * passer 105,4 → 118,4 kcal/100 g pour un minimum de 123 était JETÉE: elle
   * ne fermait aucun défaut, elle les rapprochait tous.
   *
   * ⚠️ L'UNITÉ EST CELLE DU DÉFAUT, ET ELLE N'EST PAS MÉLANGÉE ENTRE NATURES.
   * Un écart de densité se compte en kcal/100 g, un manque de protéine en
   * grammes. La comparaison se fait DÉFAUT PAR DÉFAUT, jamais en additionnant
   * des unités différentes — voir `magnitudeComparison`.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif ferait de « pas de
   * magnitude » la réponse silencieuse de tous les appelants, c'est-à-dire
   * laisserait cette porte construite et désarmée — le mode d'échec n° 1 du
   * dépôt (`optional-gate-params-are-disarmed-gates`).
   */
  magnitude: number | null;
  /**
   * ⟳ 2026-09-12 · LOT 2 — CE QUI A ÉTÉ MESURÉ, ET CONTRE QUOI.
   *
   * ⛔ REQUIS ET NULLABLE, JAMAIS `?` — même règle que `magnitude` juste
   * au-dessus, et pour la même raison mesurée. `null` = « aucune mesure
   * chiffrable pour ce défaut » (une identité manquante, une ligne d'achat
   * absente): c'est un aveu, pas un zéro.
   */
  measure: RepairMeasure | null;
}

/**
 * L'UNITÉ D'UNE MESURE, EN TOUTES LETTRES. Sert aux phrases envoyées au
 * modèle. PURE.
 */
export function measureUnit(m: RepairMeasure): string {
  switch (m.of) {
    case "energy":
      return "kcal";
    case "mass":
      return "g";
    case "density":
      return "kcal/100 g";
    case "protein":
      return "g of protein";
  }
}

const KIND_ORDER: Record<RepairDefectKind, number> = Object.freeze(
  Object.fromEntries(REPAIR_DEFECT_KINDS.map((k, i) => [k, i])) as Record<
    RepairDefectKind,
    number
  >,
);

/**
 * TRIE LES DÉFAUTS DANS L'ORDRE DU CHANTIER, PUIS PAR JOUR ET MOMENT.
 *
 * ⚠️ STABLE SUR LE RESTE: deux défauts de même nature, même jour et même
 * moment gardent leur ordre d'arrivée. Une instruction qui change d'ordre
 * d'une génération à l'autre rend deux runs incomparables.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function orderDefects(defects: readonly RepairDefect[]): RepairDefect[] {
  return [...defects]
    .map((d, i) => ({ d, i }))
    .sort((a, b) =>
      KIND_ORDER[a.d.kind] - KIND_ORDER[b.d.kind] ||
      String(a.d.day ?? "").localeCompare(String(b.d.day ?? "")) ||
      String(a.d.slot ?? "").localeCompare(String(b.d.slot ?? "")) ||
      a.i - b.i
    )
    .map((x) => x.d);
}

/**
 * Un repas absent est réparé avant les défauts de finition du reste du plan.
 * Les défauts de sécurité voyagent toujours avec lui; rien de moins prioritaire
 * ne gonfle ce premier message. Au tour suivant, le plan complet est remesuré
 * et les défauts différés reviennent normalement.
 */
export function defectsForRepairAttempt(
  defects: readonly RepairDefect[],
): RepairDefect[] {
  const hasMissingMeal = defects.some((d) => d.kind === "missing_meal");
  if (!hasMissingMeal) return orderDefects(defects);
  return orderDefects(
    defects.filter((d) => d.kind === "safety" || d.kind === "missing_meal"),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA RÉGRESSION DE SÉCURITÉ — PAR IDENTITÉ, JAMAIS PAR COMPTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'IDENTITÉ D'UNE VIOLATION. Tout ce qui la distingue d'une autre.
 *
 * ⛔ LE COMPTE NE SUFFIT PAS, ET C'EST ÉCRIT DANS LE CHANTIER: « rejeter une
 * nouvelle violation même si une ancienne disparaît ou si le nombre reste
 * identique ». Une recomposition qui retire l'arachide de Léa et met du gluten
 * dans l'assiette de Marc rend DEUX pour DEUX — et un comparateur de comptes
 * l'accepterait comme un progrès.
 *
 * ⛔ ET LE PREMIER MATCH PAR PLAT NE SUFFIT PAS NON PLUS: deux bouches peuvent
 * mordre sur le même plat pour deux règles différentes. `member_id` et `term`
 * sont dans la clé pour cette raison.
 */
export function violationKey(r: GateRefusal): string {
  return [
    r.cause,
    r.day ?? "",
    r.slot ?? "",
    r.dish ?? "",
    r.preparation_id ?? "",
    r.member_id ?? "",
    r.term ?? "",
  ].join(" ");
}

export interface SafetyComparison {
  /** `true` dès qu'UNE violation absente d'avant apparaît après. */
  regressed: boolean;
  /** Celles qui n'existaient pas dans la version précédente. */
  added: readonly GateRefusal[];
  /** Celles qui ont disparu. Elles ne rachètent PAS une ajoutée. */
  removed: readonly GateRefusal[];
}

/**
 * COMPARE DEUX VERSIONS D'UN PLAN SUR LEURS VIOLATIONS.
 *
 * ⚠️ SEULES LES VIOLATIONS QUI REFUSENT ENTRENT. Une cause en politique
 * `count` est une MESURE, pas un danger; la traiter comme une régression
 * rejetterait une candidate sur un compteur d'observation.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function compareSafety(
  before: readonly GateRefusal[],
  after: readonly GateRefusal[],
): SafetyComparison {
  const bloquantes = (rs: readonly GateRefusal[]) =>
    rs.filter((r) => r.severity === "refuse");
  const avant = new Map(bloquantes(before).map((r) => [violationKey(r), r]));
  const apres = new Map(bloquantes(after).map((r) => [violationKey(r), r]));
  const added = [...apres].filter(([k]) => !avant.has(k)).map(([, r]) => r);
  const removed = [...avant].filter(([k]) => !apres.has(k)).map(([, r]) => r);
  return { regressed: added.length > 0, added, removed };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA DÉCISION: RAPPELLE-T-ON LE MODÈLE, ET POUR DIRE QUOI ?
// ═══════════════════════════════════════════════════════════════════════════

export const REPAIR_PASS_REFUSALS = [
  /** Rien à réparer. C'est un SUCCÈS, pas un refus de service. */
  "no_defects",
  /** Les deux tentatives ont été prises. */
  "attempts_exhausted",
  /** Il ne reste pas de quoi faire un aller-retour et écrire. */
  "no_time_left",
  /** Il reste des défauts, mais aucun qu'un appel modèle puisse réparer. */
  "nothing_repairable",
] as const;
export type RepairPassRefusal = (typeof REPAIR_PASS_REFUSALS)[number];

export type RepairPass =
  | { call: true; defects: readonly RepairDefect[]; timeoutMs: number }
  | { call: false; reason: RepairPassRefusal };

/**
 * ⛔ LE PLANCHER D'UN APPEL UTILE. Sous ce temps-là, un aller-retour modèle
 * n'a pas le temps de rendre un plan ET d'être mesuré: l'appeler quand même
 * dépense un jeton pour jeter sa réponse.
 */
export const REPAIR_MIN_CALL_MS = 40_000;

/**
 * DÉCIDE D'UNE PASSE DE RÉPARATION.
 *
 * ⛔ `timeout = 0` VEUT DIRE « N'APPELLE PAS », JAMAIS « prends le défaut ».
 * C'est écrit dans le chantier, et c'est la cicatrice d'un mode d'échec connu:
 * un timeout calculé à zéro qui retombe sur la valeur par défaut fait partir un
 * appel de 300 s alors que la requête en avait 4 devant elle.
 *
 * PURE: no I/O, no clock, no randomness — l'horloge est un ARGUMENT.
 */
export function planRepairPass(args: {
  defects: readonly RepairDefect[];
  /** Combien de tentatives fournisseur ont DÉJÀ été transmises. */
  attemptsUsed: number;
  /** Le plafond du chantier: deux essais supplémentaires. */
  maxAttempts: number;
  /** Ce qui reste avant l'échéance absolue, réserve d'écriture déjà retirée. */
  remainingMs: number;
}): RepairPass {
  if (args.defects.length === 0) return { call: false, reason: "no_defects" };
  // ⚠️ L'ORDRE DES REFUS COMPTE. « Plus de tentative » se lit avant « rien à
  // réparer »: un plan qui a brûlé ses deux essais et garde des défauts
  // réparables n'a pas le même sens qu'un plan dont tous les défauts sont
  // déterministes.
  if (args.attemptsUsed >= args.maxAttempts) {
    return { call: false, reason: "attempts_exhausted" };
  }
  if (args.remainingMs < REPAIR_MIN_CALL_MS) {
    return { call: false, reason: "no_time_left" };
  }
  // ⛔ SEULS LES RÉPARABLES DÉCLENCHENT UN APPEL — « un contrôle déterministe
  // ne consomme pas de tentative ». Mais TOUS les défauts réparables présents
  // partent dans la MÊME instruction: c'est la moitié du lot.
  const reparables = orderDefects(args.defects.filter((d) => d.repairable));
  if (reparables.length === 0) {
    return { call: false, reason: "nothing_repairable" };
  }
  return { call: true, defects: reparables, timeoutMs: args.remainingMs };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ bis · ⟳ 2026-09-12 · LOT 2 — DEUX APPELS RÉELS, ET LE SECOND APRÈS UN REJET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ LE PLAFOND EST UN NOMBRE D'APPELS RÉELLEMENT PARTIS, PAS D'ADOPTIONS.
 *
 * La revue de clôture C6 § 4 le dit sans détour: « la formulation "deux
 * adoptions possibles" n'est pas une description fiable du contrat. Le budget
 * compte des tentatives; un appel rejeté consomme bien une tentative. » Un
 * appel qui part, échoue, revient illisible ou se fait rejeter par le juge a
 * été facturé et a coûté du temps: il compte.
 */
export const PLAN_REPAIR_MAX_CALLS = 2;

export const REPAIR_DECISION_REFUSALS = [
  ...REPAIR_PASS_REFUSALS,
  /** ⟳ 2026-09-12 · LOT 2 — deux appels sont PARTIS, quel qu'ait été leur sort. */
  "calls_exhausted",
  /**
   * ⟳ 2026-09-15 · DÉCISION PRODUIT — IL Y A DES DÉFAUTS, MAIS AUCUN NE BLOQUE
   * LA LIVRAISON : on ne rappelle pas le modèle, le plan part avec ses écarts
   * NOMMÉS à l'écran (c'est ce que la garde fait déjà en `count`).
   *
   * ⛔ MESURÉ SUR LA CAMPAGNE DU 2026-09-15 : les deux seuls tirs réparés (sur
   * huit) ont dépensé quatre appels et une centaine de secondes chacun pour un
   * −5 % de protéines sur une journée couverte à 35 % et une densité de
   * petit-déjeuner — deux écarts COMPTÉS, non bloquants — sans en fermer aucun.
   * La réparation coûtait tout et ne rendait rien ; on la réserve à ce qui
   * empêcherait le plan de partir.
   *
   * ⟳ 2026-09-19 — « BLOQUANT » SE LIT DÉSORMAIS « À RÉPARER ». Le jeton est
   * gardé (il est épinglé dans trois suites de tests et dans les `issues`
   * écrites), mais il tombe quand `mustRepair` vaut zéro : ni défaut bloquant,
   * ni défaut chassé (`CHASED_CAUSES`). Une case trouée, comptée depuis ce
   * jour, ne le déclenche donc PAS — elle vaut un appel.
   */
  "no_blocking_defect",
] as const;
export type RepairDecisionRefusal = (typeof REPAIR_DECISION_REFUSALS)[number];

export type RepairDecision =
  | {
    call: true;
    defects: readonly RepairDefect[];
    timeoutMs: number;
    /**
     * Le verdict de la candidate précédente, quand il y en a eu une.
     * ⛔ IL VOYAGE JUSQU'À L'INSTRUCTION: un second essai qui ne dit pas
     * pourquoi le premier a été jeté redemande la même chose.
     */
    afterVerdict: CandidateVerdict | null;
  }
  | { call: false; reason: RepairDecisionRefusal };

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA DÉCISION DE RÉPARATION — UNE SEULE, APRÈS LA PASSE COMMUNE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'ELLE REMPLACE, ET LE DÉFAUT EST MESURÉ. Le générateur posait
 * `c4Stop = true` dès qu'une candidate était rejetée par `judgeCandidate`, et
 * `!c4Stop` interdisait tout nouvel appel. Les tirs n° 1 et n° 3 de la
 * campagne du 2026-09-11 ont fait **une seule** réparation, ont été refusés,
 * et n'ont jamais épuisé leur budget. L'arrêt précoce était une règle
 * SUPPLÉMENTAIRE, invisible dans le contrat annoncé.
 *
 * ⛔ ELLE NE PROMET RIEN. « Réévaluer l'intérêt et la faisabilité d'une
 * seconde tentative » n'est pas « un second essai réussira »: elle rend
 * `call: true` quand il reste un appel, du temps et un défaut réparable, et
 * `false` avec son motif sinon.
 *
 * ⛔ L'ORDRE DES REFUS EST LE CONTRAT. `calls_exhausted` se lit AVANT
 * `attempts_exhausted`: le plafond dur du chantier porte sur les appels
 * réellement partis, et le budget partagé (qui compte aussi les rattrapages
 * d'amont) est le second verrou, pas le premier. Les confondre ferait
 * chercher un budget trop petit là où c'est le plafond d'appels qui a mordu.
 *
 * PURE: no I/O, no clock, no randomness — l'horloge est un ARGUMENT.
 */
export function planRepairDecision(args: {
  readonly defects: readonly RepairDefect[];
  /**
   * ⟳ 2026-09-15 — COMBIEN DE CES DÉFAUTS FONT PARTIR UN APPEL.
   * ⟳ 2026-09-19 — `mustRepair`, PLUS `blocking`.
   *
   * Ce sont les défauts qui EMPÊCHERAIENT le plan de partir (sévérité
   * `refuse` dans ce run), PLUS ceux que la politique de réparation chasse
   * même comptés (`CHASED_CAUSES`) : depuis le 2026-09-19 une case trouée ne
   * refuse plus le plan, mais elle vaut toujours un appel tant qu'il reste du
   * budget. Le nom a changé parce que le mot « bloquant » aurait menti sur la
   * seconde moitié.
   *
   * ⛔ REQUIS, JAMAIS `?` (règle du dépôt : un paramètre de garde optionnel est
   * une garde désarmée). C'est `collectPlanDefects` qui le compte ; à zéro,
   * aucun appel modèle ne part, quel que soit le nombre de défauts comptés.
   */
  readonly mustRepair: number;
  /** Les appels de réparation RÉELLEMENT partis, échecs et rejets compris. */
  readonly callsMade: number;
  readonly maxCalls: number;
  /** Ce que le budget PARTAGÉ a déjà accordé (rattrapages d'amont compris). */
  readonly attemptsUsed: number;
  readonly maxAttempts: number;
  /** Ce qui reste avant l'échéance absolue, réserve d'écriture déjà retirée. */
  readonly remainingMs: number;
  /** Le verdict de la dernière candidate jugée. `null` = aucune encore. */
  readonly lastVerdict: CandidateVerdict | null;
}): RepairDecision {
  if (args.defects.length === 0) return { call: false, reason: "no_defects" };
  // ⛔ LA POLITIQUE AVANT LES RESSOURCES. « Il reste du budget » ne fait pas
  // partir un appel pour un écart que la garde ne fait que compter.
  if (args.mustRepair <= 0) return { call: false, reason: "no_blocking_defect" };
  if (args.callsMade >= args.maxCalls) {
    return { call: false, reason: "calls_exhausted" };
  }
  if (args.attemptsUsed >= args.maxAttempts) {
    return { call: false, reason: "attempts_exhausted" };
  }
  if (args.remainingMs < REPAIR_MIN_CALL_MS) {
    return { call: false, reason: "no_time_left" };
  }
  const reparables = orderDefects(args.defects.filter((d) => d.repairable));
  if (reparables.length === 0) {
    return { call: false, reason: "nothing_repairable" };
  }
  return {
    call: true,
    defects: reparables,
    timeoutMs: args.remainingMs,
    // ⚠️ `adopt` N'EST PAS UN REJET: on ne dit au modèle « ta réponse a été
    // jetée » que lorsqu'elle l'a été.
    afterVerdict: args.lastVerdict === "adopt" ? null : args.lastVerdict,
  };
}

/** Ce qu'on garde d'un tour, et si un tour de plus a un sens. */
export interface RepairRoundOutcome {
  /** `previous_best` = la candidate est jetée, l'ancienne version revient. */
  readonly keep: "candidate" | "previous_best";
  /**
   * ⛔ `true` NE VEUT PAS DIRE « ÇA VA MARCHER ». Il veut dire: il reste un
   * appel, du temps, et au moins un défaut qu'un appel modèle peut réparer.
   */
  readonly mayRetry: boolean;
  /** Pourquoi `mayRetry` est faux. Vide quand il est vrai. */
  readonly reason: RepairDecisionRefusal | "";
}

/**
 * CE QU'ON FAIT D'UNE CANDIDATE JUGÉE — ET POURQUOI UN REJET N'ARRÊTE PLUS.
 *
 * ⛔ LE REJET RESTAURE, IL NE FERME PAS. C'est la correction attendue de la
 * revue § 4: « rejeter la candidate dégradée, conserver la meilleure version,
 * puis réévaluer l'intérêt et la faisabilité d'une seconde tentative avec le
 * budget et le temps restants ».
 *
 * ⚠️ ET LE COMPTE D'APPELS EST CELUI D'APRÈS L'APPEL QUI VIENT D'ÊTRE FAIT.
 * L'appel rejeté a été payé: le passer à `callsMade` est ce qui empêche une
 * boucle qui rejette indéfiniment.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairRoundOutcome(args: {
  readonly verdict: CandidateVerdict;
  readonly remainingDefects: readonly RepairDefect[];
  /** ⟳ 2026-09-19 — ceux des défauts restants qui valent un appel ; voir `planRepairDecision.mustRepair`. */
  readonly remainingMustRepair: number;
  readonly callsMade: number;
  readonly maxCalls: number;
  readonly attemptsUsed: number;
  readonly maxAttempts: number;
  readonly remainingMs: number;
}): RepairRoundOutcome {
  const keep = args.verdict === "adopt" ? "candidate" : "previous_best";
  const suite = planRepairDecision({
    defects: args.remainingDefects,
    mustRepair: args.remainingMustRepair,
    callsMade: args.callsMade,
    maxCalls: args.maxCalls,
    attemptsUsed: args.attemptsUsed,
    maxAttempts: args.maxAttempts,
    remainingMs: args.remainingMs,
    lastVerdict: args.verdict,
  });
  return {
    keep,
    mayRetry: suite.call,
    reason: suite.call ? "" : suite.reason,
  };
}

/**
 * LE TEMPS D'UN APPEL DE REPLI, QUAND LE PREMIER MODÈLE A ÉCHOUÉ.
 *
 * ⛔ LE REPLI NE REPREND PAS LE TIMEOUT ENTIER DU PREMIER, et c'est une
 * exigence littérale du chantier. Le premier a déjà consommé du temps réel: lui
 * réoffrir son plafond ferait dépasser l'échéance absolue de la requête, donc
 * couperait l'écriture — un plan calculé, correct, et jamais persisté.
 *
 * `0` veut dire « n'appelle pas ». Il ne retombe sur aucun défaut.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function fallbackTimeoutMs(args: {
  /** Ce qui reste avant l'échéance absolue, réserve d'écriture déjà retirée. */
  remainingMs: number;
  /** Ce que la tentative précédente a réellement consommé. */
  spentMs: number;
}): number {
  const reste = args.remainingMs - args.spentMs;
  return reste >= REPAIR_MIN_CALL_MS ? reste : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA CANDIDATE QU'ON GARDE
// ═══════════════════════════════════════════════════════════════════════════

export const CANDIDATE_VERDICTS = [
  /** Elle remplace la précédente. */
  "adopt",
  /** Elle est rejetée: elle ajoute une violation de sécurité. */
  "safety_regression",
  /** Elle est rejetée: elle ne répare rien et n'ajoute rien. */
  "no_improvement",
] as const;
export type CandidateVerdict = (typeof CANDIDATE_VERDICTS)[number];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 · LOT E — CE QU'IL FAUT AVOIR GAGNÉ POUR REMPLACER UNE VERSION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ UN GAIN SOUS CE SEUIL N'EST PAS UN GAIN. Remplacer une version déjà relue
 * par une version 2 % meilleure brouille la comparaison du run suivant et
 * coûte une écriture pour un écart que personne ne mesure dans une assiette.
 * 10 % est la tolérance que le chantier accepte déjà sur un repas (« repas à
 * ±10 % »): en dessous, on est dans le bruit que le produit tolère par ailleurs.
 *
 * ⚠️ CE N'EST PAS UNE TOLÉRANCE SUR LE DÉFAUT. Le défaut reste un défaut, il
 * reste compté et il repart dans l'instruction suivante s'il reste du budget.
 * Ce seuil décide d'UNE chose: garde-t-on cette version-ci plutôt que celle
 * d'avant.
 */
export const REPAIR_MAGNITUDE_MIN_GAIN = 0.10;

/** Ce que la comparaison d'ampleur a pu dire, et pourquoi elle s'est tue. */
export interface MagnitudeComparison {
  /** `false` = les deux versions ne se comparent pas défaut par défaut. */
  comparable: boolean;
  /** La somme des écarts d'AVANT, sur les défauts appariés. `null` si incomparable. */
  before: number | null;
  after: number | null;
  /** `before − after`, signé. Positif = la candidate est plus proche. */
  gain: number | null;
  /** Pourquoi `comparable` est faux. Vide quand il est vrai. */
  note: string;
}

/**
 * L'AMPLEUR A-T-ELLE BAISSÉ, À NOMBRE DE DÉFAUTS ÉGAL ?
 *
 * ⛔ DÉFAUT PAR DÉFAUT, APPARIÉS PAR (NATURE, JOUR, MOMENT, BOUCHE). On
 * n'additionne JAMAIS des kcal/100 g avec des grammes de protéine: une somme
 * de deux unités différentes est un nombre qui ne veut rien dire, et il
 * suffirait d'un gros écart de densité pour absorber une protéine manquante.
 * Les paires sont donc formées d'abord, et seules les paires de MÊME NATURE
 * sont comparées.
 *
 * ⚠️ INCOMPARABLE DÈS QU'UNE PAIRE MANQUE OU QU'UNE MAGNITUDE EST `null`. On ne
 * devine pas: un défaut apparu ailleurs, ou dont on ne sait pas dire de combien
 * il manque, laisse la décision au compte — c'est-à-dire au comportement
 * d'avant ce lot.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function magnitudeComparison(
  before: readonly RepairDefect[],
  after: readonly RepairDefect[],
): MagnitudeComparison {
  const nope = (note: string): MagnitudeComparison => ({
    comparable: false,
    before: null,
    after: null,
    gain: null,
    note,
  });
  if (before.length === 0 || before.length !== after.length) {
    return nope("count_differs");
  }
  const key = (d: RepairDefect) =>
    `${d.kind}|${d.day ?? ""}|${d.slot ?? ""}|${d.memberId ?? ""}`;
  const bucket = (ds: readonly RepairDefect[]) => {
    const m = new Map<string, RepairDefect[]>();
    for (const d of ds) {
      const list = m.get(key(d));
      if (list === undefined) m.set(key(d), [d]);
      else list.push(d);
    }
    return m;
  };
  const av = bucket(before);
  const ap = bucket(after);
  if (av.size !== ap.size) return nope("cells_differ");
  let sumBefore = 0;
  let sumAfter = 0;
  for (const [k, listA] of av) {
    const listB = ap.get(k);
    if (listB === undefined || listB.length !== listA.length) {
      return nope("cells_differ");
    }
    for (const [i, d] of listA.entries()) {
      const a = d.magnitude;
      const b = listB[i].magnitude;
      if (a === null || b === null) return nope("magnitude_unknown");
      if (!Number.isFinite(a) || !Number.isFinite(b)) return nope("magnitude_unknown");
      if (a < 0 || b < 0) return nope("magnitude_negative");
      sumBefore += a;
      sumAfter += b;
    }
  }
  return {
    comparable: true,
    before: sumBefore,
    after: sumAfter,
    gain: sumBefore - sumAfter,
    note: "",
  };
}

/**
 * GARDE LA DERNIÈRE CANDIDATE UTILISABLE — ET REJETTE UNE RÉGRESSION.
 *
 * ⛔ « UTILISABLE » N'EST PAS « CONFORME », et le chantier insiste: un plan
 * livré avec des écarts a été servi dans sa dernière version utilisable, ce qui
 * n'est pas la même chose qu'un plan juste. Cette fonction choisit; elle ne
 * déclare rien conforme.
 *
 * ⚠️ UNE CANDIDATE QUI NE RÉPARE RIEN EST REJETÉE, même sans régression: la
 * garder ferait remplacer une version relue par une version équivalente que
 * personne n'a demandée, et brouillerait la comparaison du run suivant.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 · LOT E — « NE RÉPARE RIEN » N'EST PAS « NE BAISSE PAS LE COMPTE »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CETTE VERSION FERME, MESURÉ. Le premier rattrapage réel du
 * plan PERTE amenait le poulet/quinoa de **105,4 à 118,4 kcal/100 g** pour un
 * minimum de 123, et les deux autres assiettes de la même casserole de 119,9 à
 * 133,6 et de 125,5 à 138,1 pour un minimum de 141. **Trois défauts avant,
 * trois après** — donc `no_improvement`, donc une version jetée qui avait
 * fermé les trois quarts de l'écart. Le chantier l'écrit: « le passage PERTE
 * de 3 défauts importants à 3 défauts plus faibles doit pouvoir être conservé ».
 *
 * ⛔ ET LA GARDE DE SÉCURITÉ PASSE TOUJOURS AVANT, INCHANGÉE. Une régression de
 * sécurité rejette la candidate quelle que soit son ampleur: c'est le premier
 * test de la fonction, et aucun gain ne le contourne. Une nature de défaut PLUS
 * GRAVE qui devient plus nombreuse rejette aussi — « 3 écarts de densité » qui
 * deviennent « 3 allergènes » ne sont pas trois défauts plus faibles.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function judgeCandidate(args: {
  beforeRefusals: readonly GateRefusal[];
  afterRefusals: readonly GateRefusal[];
  beforeDefects: readonly RepairDefect[];
  afterDefects: readonly RepairDefect[];
}): {
  verdict: CandidateVerdict;
  safety: SafetyComparison;
  /** Ce que la comparaison d'ampleur a dit. Écrit même quand elle n'a pas décidé. */
  magnitude: MagnitudeComparison;
} {
  const safety = compareSafety(args.beforeRefusals, args.afterRefusals);
  const magnitude = magnitudeComparison(args.beforeDefects, args.afterDefects);
  if (safety.regressed) return { verdict: "safety_regression", safety, magnitude };
  // ⚠️ ON COMPTE LES DÉFAUTS RESTANTS, pas les défauts réparés: une candidate
  // qui en répare un et en crée un autre n'a rien amélioré.
  const avant = args.beforeDefects.length;
  const apres = args.afterDefects.length;
  if (apres < avant || safety.removed.length > 0) {
    return { verdict: "adopt", safety, magnitude };
  }
  // ── L'AMPLEUR, À NOMBRE ÉGAL ─────────────────────────────────────────────
  // ⛔ UNE NATURE PLUS GRAVE QUI GROSSIT REJETTE, avant même de regarder les
  // nombres. `REPAIR_DEFECT_KINDS` est ordonnée du plus grave au moins grave;
  // un défaut qui remonte cette liste n'est pas « plus faible ».
  if (apres === avant && magnitude.comparable && magnitude.gain !== null) {
    if (worseKindGrew(args.beforeDefects, args.afterDefects)) {
      return { verdict: "no_improvement", safety, magnitude };
    }
    const before = magnitude.before ?? 0;
    if (before > 0 && magnitude.gain >= before * REPAIR_MAGNITUDE_MIN_GAIN) {
      return { verdict: "adopt", safety, magnitude };
    }
  }
  return { verdict: "no_improvement", safety, magnitude };
}

/** Une nature PLUS GRAVE est-elle plus nombreuse après qu'avant ? */
function worseKindGrew(
  before: readonly RepairDefect[],
  after: readonly RepairDefect[],
): boolean {
  const count = (ds: readonly RepairDefect[], kind: RepairDefectKind) =>
    ds.filter((d) => d.kind === kind).length;
  for (const kind of REPAIR_DEFECT_KINDS) {
    if (count(after, kind) > count(before, kind)) return true;
    // Une nature qui a BAISSÉ ne peut plus être compensée par une plus faible
    // qui monte: c'est un progrès, et on sort avant de le condamner.
    if (count(after, kind) < count(before, kind)) return false;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE BRANCHEMENT — UNE DÉCISION PAR SITE, SUR L'AXE DU CHANTIER
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CECI REMPLACE: `PLAN_REPAIR_RESERVED_AFTER`, une table qui donnait
// à CHAQUE ÉTIQUETTE un nombre de slots à laisser derrière elle
// (`protein_anchor_retry: 2`, `exclusion_retry: 1`, `swap_retry: 2`…). Deux
// défauts, tous les deux mesurés:
//
//   · LES NOMBRES ÉTAIENT ACCORDÉS À LA MAIN, sur l'ORDRE D'EXÉCUTION du
//     fichier — pas sur l'importance du défaut. Le commentaire de la table le
//     disait: « lane du foyer, dans l'ordre d'exécution ». Déplacer un bloc
//     dans le générateur rendait la table fausse en silence.
//   · UN RATTRAPAGE NEUF NON INSCRIT était traité comme le plus faible, donc
//     refusé — une garde qui refuse par défaut ressemble à une garde qui marche.
//
// ⚠️ CE QUI REMPLACE N'EST PAS « PLUS DE PRIORITÉ »: la dernière tentative est
// RÉSERVÉE aux défauts qui ne peuvent pas attendre. Ce qui change, c'est que
// la règle porte sur la NATURE du défaut — l'axe que le chantier fixe — et
// plus sur la place du bloc dans le fichier.

/**
 * L'ÉTIQUETTE HISTORIQUE D'UN RATTRAPAGE → SA NATURE.
 *
 * ⚠️ LES ÉTIQUETTES RESTENT, ET C'EST VOLONTAIRE: elles nomment le SITE dans
 * les journaux, et trois mois de logs les portent. Ce qui change est ce
 * qu'elles décident.
 */
export const REPAIR_LABEL_KIND: Readonly<Record<string, RepairDefectKind>> =
  Object
    .freeze({
      // lane du foyer
      // ⟳ 2026-09-12 · ÉTAPE C4 — LE DERNIER SITE, APRÈS LA GARDE FINALE.
      // ⛔ `safety` PARCE QU'IL PORTE TOUT: son instruction part avec TOUS les
      // défauts réparables mesurés, sécurité comprise. Le classer plus bas le
      // ferait refuser par la table de réserve — c'est-à-dire couperait le seul
      // site qui répare le plancher protéique, le défaut n° 1 de la campagne du
      // 2026-09-11 (4 plans sur 6).
      final_repair: "safety",
      exclusion_retry: "safety",
      unfed_retry: "missing_meal",
      density_repair: "sizing",
      dedicated_repair: "sizing",
      protein_anchor_retry: "protein",
      swap_retry: "preference",
      preference_split_retry: "preference",
      // lane individuelle
      empty_slots_retry: "missing_meal",
      composition_retry: "sizing",
    });

/**
 * ⛔ UNE ÉTIQUETTE INCONNUE VAUT `preference` — LA PLUS FAIBLE, ET ELLE SE
 * VOIT. Elle peut donc prendre la PREMIÈRE tentative mais jamais la dernière:
 * un rattrapage neuf qu'on oublie d'inscrire ici n'est ni muselé (l'ancienne
 * table le refusait toujours, ce qui se lisait comme une panne) ni prioritaire
 * sur une allergie.
 */
export function repairKindOf(label: string): RepairDefectKind {
  return REPAIR_LABEL_KIND[String(label ?? "").trim()] ?? "preference";
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 — `grantAttemptFor` A ÉTÉ ÉCRIT ICI, PUIS RETIRÉ
// ══════════════════════════════════════════════════════════════════════════
//
// Il réservait la DERNIÈRE tentative à la sécurité et à la livraison, sans
// rien mesurer. Sur l'ordre réel de la lane, il accordait `protein` puis
// `exclusion` et **perdait `density_repair`** — la réparation qui fait passer
// un foyer de 6 assiettes dans les bornes à 12 sur 15.
//
// ⛔ LA LEÇON, ET ELLE VAUT D'ÊTRE ÉCRITE: aucune règle qui ne MESURE PAS ne
// peut arbitrer ces slots. Il faut savoir quels défauts existent vraiment.
//
// CE QUI L'A REMPLACÉ: la pesée a été remontée au-dessus des rattrapages dans
// `generate-household-meal-v1`, et `planRepairReservedAfter(label, pending)`
// (`plan_budget.ts`) réserve désormais le nombre de natures PLUS PRIORITAIRES
// RÉELLEMENT EN DÉFAUT — zéro quand il n'y en a aucune. `repairKindOf`
// ci-dessus est la moitié de ce module qui sert à ça.

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ ⟳ 2026-09-11 · LOT E — DE LA GARDE FINALE AUX DÉFAUTS RÉPARABLES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA NATURE D'UNE CAUSE DE LA GARDE FINALE, ET SI UN APPEL MODÈLE PEUT LA
 * RÉPARER.
 *
 * ⛔ CETTE TABLE EST LE SEUL PONT ENTRE `final_plan_gate.ts` ET LE BUDGET. Sans
 * elle, le verdict final ne pouvait alimenter AUCUNE réparation: `judgeCandidate`
 * et `planRepairPass` n'avaient aucun appelant de production le 2026-09-11
 * (`grep -rn "planRepairPass\|judgeCandidate" supabase/functions/ | grep -v _test`
 * ne rendait que leurs déclarations). Deux modules armés, un coffre vide.
 *
 * ⚠️ `repairable: false` N'EST PAS « SANS IMPORTANCE ». Une référence pendante
 * ou une identité alimentaire refusée ne se répare pas en redemandant une
 * recette: le modèle ne fera pas exister une fiche. Le chantier l'écrit — « un
 * contrôle déterministe ne consomme pas de tentative » — et brûler un essai
 * dessus retirerait celui d'une allergie.
 */
const CAUSE_TO_DEFECT: Readonly<
  Record<string, { kind: RepairDefectKind; repairable: boolean }>
> = Object.freeze({
  // ── sécurité: tout ce qui met dans une assiette ce qui ne doit pas y être ──
  table_exclusion_served: { kind: "safety", repairable: true },
  member_exclusion_served: { kind: "safety", repairable: true },
  regime_forbidden_component: { kind: "safety", repairable: true },
  house_rule_served: { kind: "safety", repairable: true },
  eaten_before_cooked: { kind: "safety", repairable: true },
  eaten_too_late: { kind: "safety", repairable: true },
  perishable_bought_too_early: { kind: "safety", repairable: true },
  // ── un repas qui manque ────────────────────────────────────────────────
  cell_without_dish: { kind: "missing_meal", repairable: true },
  mouth_unfed: { kind: "missing_meal", repairable: true },
  box_missing: { kind: "missing_meal", repairable: true },
  boxes_none_delivered: { kind: "missing_meal", repairable: true },
  // ⛔ UNE CASE SANS PORTION EST UN REPAS QUI MANQUE, PAS UN ÉCART DE TAILLE.
  // C'est le défaut ① du 2026-09-11, et le classer en `sizing` l'aurait fait
  // passer derrière une correction de densité.
  cell_without_portion: { kind: "missing_meal", repairable: true },
  ingredient_not_bought: { kind: "missing_meal", repairable: true },
  ingredient_short_bought: { kind: "missing_meal", repairable: true },
  /**
   * ⟳ 2026-09-14 · BÊTA 1A — UNE BOUCHE QUE LA CASSEROLE NE PEUT PAS NOURRIR
   * ET QUI N'A PAS DE PLAT À ELLE N'A RIEN À MANGER. C'est un repas qui
   * manque, au sens propre: le plan pose devant elle une assiette que sa ligne
   * lui interdit.
   *
   * ⛔ ET ELLE EST RÉPARABLE, CE QUI N'EST PAS UN DÉTAIL. Elle est BLOQUANTE au
   * lot 4: sans entrée ici, elle tomberait dans le repli « cause inconnue ⇒
   * preference, non réparable », c'est-à-dire un verrou qui refuse le plan sans
   * jamais laisser personne le corriger. Ce dépôt appelle ça une garde cassée,
   * et il en a déjà payé une.
   */
  dedicated_dish_missing: { kind: "missing_meal", repairable: true },
  /**
   * ⟳ 2026-09-14 · BÊTA 1A — DEUX REPAS CONCURRENTS SUR UNE CASE. Même famille
   * (c'est le REPAS de la case qui est faux) et réparable pour la même raison:
   * elle bloque, donc elle doit pouvoir être corrigée. Ce que le modèle doit
   * faire est retirer l'un des deux ou adresser l'un d'eux à une bouche — et
   * c'est lui qui sait lequel, puisque c'est lui qui a composé les deux.
   */
  cell_two_table_dishes: { kind: "missing_meal", repairable: true },
  /**
   * ⟳ 2026-09-14 · BÊTA 1A — « MON REPAS À MOI » NON SERVI: une préférence,
   * annoncée, jamais bloquante — et réparable, parce qu'un appel modèle sait
   * très bien ajouter ce plat quand il reste de la place.
   */
  own_meal_dish_missing: { kind: "preference", repairable: true },
  // ── la taille ──────────────────────────────────────────────────────────
  cell_energy_off: { kind: "sizing", repairable: true },
  /**
   * ⟳ 2026-09-12 · LOT 2 — LA MASSE ET LA DENSITÉ, SÉPARÉES DES CALORIES.
   * Même nature (`sizing`) et même réparabilité que l'énergie: ce qui change
   * est la PHRASE, écrite par `plan_defect_pass.ts` sur le contrat de la case.
   */
  cell_bounds_off: { kind: "sizing", repairable: true },
  day_energy_off: { kind: "sizing", repairable: true },
  mouth_energy_short: { kind: "sizing", repairable: true },
  // ── la protéine ────────────────────────────────────────────────────────
  protein_floor_short: { kind: "protein", repairable: true },
  // ── ce qu'un appel modèle ne répare PAS ────────────────────────────────
  uses_dangling: { kind: "preference", repairable: false },
  box_item_dangling: { kind: "preference", repairable: false },
  session_cites_unknown: { kind: "preference", repairable: false },
  cook_day_unplaced: { kind: "preference", repairable: false },
  preparation_without_session: { kind: "preference", repairable: false },
  session_day_mismatch: { kind: "preference", repairable: false },
  shopping_undated: { kind: "preference", repairable: false },
  unclassified_perishable: { kind: "preference", repairable: false },
  title_promises_missing_preparation: { kind: "preference", repairable: false },
  /**
   * ⛔ UNE PORTION ILLISIBLE NE SE RÉPARE PAS PAR UNE RECETTE. Elle vient d'une
   * identité alimentaire absente ou refusée: redemander un plat au modèle
   * rendrait le même trou avec d'autres mots. La correction est au référentiel.
   */
  cell_energy_unmeasurable: { kind: "preference", repairable: false },
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-19 — LES CAUSES QUE LA RÉPARATION CHASSE MÊME COMPTÉES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le 2026-09-19, la complétude d'une case a cessé de REFUSER un plan
 * (`FINAL_GATE_POLICY_LOT_4`, voir le pavé) : elle se répare, puis se livre
 * nommée. Mais la décision d'appel ne lisait que les défauts BLOQUANTS —
 * « seul un défaut bloquant fait partir un appel ». Passer ces causes en
 * `count` sans cette liste aurait donc ÉTEINT leur réparation : un trou du
 * premier jet serait parti tel quel à l'écran, sans qu'aucun appel n'essaie
 * de le boucher. C'était le contraire du but.
 *
 * ⛔ FERMÉE ET NOMMÉE, jamais dérivée de `kind`. `missing_meal` contient aussi
 * `ingredient_not_bought` et `box_missing` — des causes dont la politique de
 * réparation n'a pas été mesurée sous ce régime. On ne chasse que ce qu'on a
 * vu échouer : une case vide, une bouche sans part, une case sans portion,
 * deux plats de table sur la même case.
 *
 * ⚠️ UNE CAUSE ICI ET EN `refuse` EST INOFFENSIVE : elle est déjà dans
 * `mustRepair` par sa sévérité. La liste n'a d'effet que sur ce qui est
 * compté — c'est son seul rôle.
 */
export const CHASED_CAUSES: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    "cell_without_dish",
    "mouth_unfed",
    "cell_without_portion",
    "cell_two_table_dishes",
  ]),
);

/**
 * LES DÉFAUTS RÉPARABLES, LUS SUR LA SORTIE DE LA GARDE FINALE.
 *
 * ⛔ TOUS LES REFUS ENTRENT, PAS SEULEMENT LES BLOQUANTS. Une cause en
 * politique `count` décrit un défaut RÉEL: c'est sa SÉVÉRITÉ qui est en
 * observation, pas son existence. Ne lire que les bloquants ferait un moteur
 * qui, sous le lot 1, ne réparerait jamais rien — la garde débranchée dans
 * l'autre sens.
 *
 * ⚠️ L'AMPLITUDE N'EST RENSEIGNÉE QUE SI ELLE EST LISIBLE. `magnitude: null`
 * est un aveu, pas un zéro: `magnitudeComparison` s'abstient alors au lieu de
 * comparer des grandeurs inventées.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function defectsFromRefusals(
  refusals: readonly GateRefusal[],
  magnitudes?: ReadonlyMap<string, number>,
  /**
   * ⟳ 2026-09-12 · LOT 2 — LA MESURE ET SA CIBLE, INDEXÉES PAR `violationKey`.
   *
   * ⚠️ FACULTATIVE ICI, ARMÉE CHEZ SON APPELANT. `collectPlanDefects`
   * (`plan_defect_pass.ts`) la construit TOUJOURS et la passe TOUJOURS — un
   * test l'épingle. Elle reste facultative sur cette signature-ci uniquement
   * pour que le chemin d'adoption, qui n'a aucun contrat en main, puisse
   * continuer d'appeler sans mentir sur ce qu'il a mesuré.
   */
  measures?: ReadonlyMap<string, RepairMeasure>,
  /**
   * ⟳ 2026-09-12 · LOT 2 — LA PHRASE RÉÉCRITE, INDEXÉE PAR `violationKey`.
   *
   * ⛔ POURQUOI RÉÉCRIRE. `GateRefusal.detail` est écrit en FRANÇAIS, pour le
   * journal et l'écran; `RepairDefect.detail` part au MODÈLE, dans une
   * instruction anglaise. Mesuré sur le tir n° 1 archivé: la consigne de
   * réparation contenait « "champignons de Paris" n'est ni sur la liste de
   * courses ni au garde-manger » au milieu d'un bloc anglais. Quand
   * l'appelant sait dire la même chose en anglais ET avec les nombres du
   * contrat, c'est sa phrase qui part.
   */
  details?: ReadonlyMap<string, string>,
): RepairDefect[] {
  const out: RepairDefect[] = [];
  for (const r of refusals ?? []) {
    const mapped = CAUSE_TO_DEFECT[r.cause];
    // ⛔ UNE CAUSE INCONNUE DE CETTE TABLE N'EST PAS IGNORÉE: elle devient le
    // défaut le plus faible et NON réparable. Un `continue` silencieux ferait
    // disparaître d'un verdict la cause ajoutée le mois prochain.
    const kind = mapped?.kind ?? "preference";
    const repairable = mapped?.repairable ?? false;
    const key = violationKey(r);
    // ⛔ LE JOUR D'UN REFUS EST TANTÔT UN JETON, TANTÔT UNE DATE, et la cause
    // seule ne le dit pas de façon fiable (`protein_floor_short` et
    // `day_energy_off` portent une date ; les refus de case portent `sat`). On
    // lit donc la FORME, qui ne ment pas : `2026-09-14` est une date.
    const jour = String(r.day ?? "").trim();
    const estDate = /^\d{4}-\d{2}-\d{2}$/.test(jour);
    out.push({
      kind,
      day: r.day,
      slot: r.slot,
      dish: r.dish,
      cause: r.cause,
      date: estDate ? jour : null,
      // ⚠️ UNE GARDE FINALE NE VOIT PAS DE SESSION: elle juge des assiettes.
      sessionIndex: null,
      preparationId: r.preparation_id,
      source: "gate",
      memberId: r.member_id,
      detail: details?.get(key) ?? r.detail,
      repairable,
      magnitude: magnitudes?.get(key) ?? null,
      measure: measures?.get(key) ?? null,
    });
  }
  return orderDefects(out);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ bis · ⟳ 2026-09-12 · ÉTAPE C1 — DU CONTRAT DE SORTIE AUX MÊMES DÉFAUTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA PHRASE QU'UN CONSTAT DE CONTRAT DIT AU MODÈLE.
 *
 * ⛔ EN ANGLAIS, COMME TOUTE INSTRUCTION DE RÉPARATION, et SANS jargon interne:
 * `ref_missing` est un code, « you weighed it and gave no id » est une consigne.
 * `RepairDefect.detail` porte « la phrase qui part au modèle. Jamais un code
 * interne », et ce contrat-là ne se contourne pas ici.
 */
function outputContractDetail(finding: OutputContractFinding): string {
  const where = finding.site.preparationId !== null
    ? `preparation "${finding.site.preparationId}"`
    : "this dish";
  switch (finding.verdict) {
    case "ref_missing":
      return `"${finding.term}" in ${where} carries a weight but no "ref". ` +
        `Give it the id from the food list, spelled exactly as listed, or make ` +
        `it a dash with no amount.`;
    case "ref_refused":
      return `"${finding.term}" in ${where} carries a "ref" that is not on the ` +
        `food list. Use one that is, spelled exactly as listed.`;
    case "quantity_missing":
      return `"${finding.term}" in ${where} has an id but no "amount"/"unit", ` +
        `and it is not a dash. Write how much of it goes in.`;
    default:
      return `"${finding.term}" in ${where} does not meet the ingredient contract.`;
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES DÉFAUTS DU CONTRAT DE SORTIE, DANS LE MÊME TYPE QUE LES AUTRES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI `sizing` ET POURQUOI `repairable: true`. Il y a déjà, dans
 * `CAUSE_TO_DEFECT` juste au-dessus, une cause d'identité NON réparable:
 * `cell_energy_unmeasurable`, avec la note « une portion illisible ne se répare
 * pas par une recette… la correction est au référentiel ». Elle reste vraie —
 * et elle parle d'autre chose. Là-bas, l'aliment est introuvable: le modèle ne
 * fera pas exister une fiche. ICI, le catalogue A ÉTÉ SERVI dans le prompt
 * (121 lignes au tir n° 2) et le modèle ne l'a pas cité: un appel qui redonne
 * la liste répare pour de bon. Confondre les deux brûlerait une tentative pour
 * rien d'un côté, et en refuserait une utile de l'autre.
 *
 * ⛔ `magnitude: null`, ET C'EST UN AVEU, PAS UN ZÉRO. Un identifiant manquant
 * ne se compte ni en kcal/100 g ni en grammes; lui inventer une amplitude
 * ferait comparer des grandeurs sans unité commune, ce que
 * `magnitudeComparison` refuse par construction.
 *
 * ⚠️ `memberId: null` — le défaut porte sur la LIGNE, pas sur une bouche. Une
 * pita non pesée éteint le plat pour tout le monde qui en mange.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function defectsFromOutputContract(
  report: OutputContractReport,
): RepairDefect[] {
  return orderDefects(report.findings.map((finding) => ({
    kind: "sizing" as RepairDefectKind,
    day: finding.site.day,
    slot: finding.site.slot,
    dish: finding.site.dish,
    cause: null,
    date: null,
    // ⛔ ET LA PRÉPARATION EST NOMMÉE. `OutputContractFinding.site` la porte
    // déjà ; la perdre ici obligeait le périmètre à deviner le lot en cause.
    preparationId: finding.site.preparationId,
    // ⚠️ LE CONTRAT DE SORTIE PORTE SUR DES RECETTES, jamais sur un déroulé.
    sessionIndex: null,
    source: "output_contract" as RepairDefectSource,
    memberId: null,
    detail: outputContractDetail(finding),
    repairable: true,
    magnitude: null,
    // ⛔ AUCUNE MESURE: un identifiant manquant ne se compte ni en kcal, ni en
    // grammes, ni en kcal/100 g. Lui en inventer une ferait comparer des
    // grandeurs sans unité commune.
    measure: null,
  })));
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ ⟳ 2026-09-11 · LOT E — ON NE REMPLACE PAS UN PLAN VALIDE PAR UNE ÉPAVE
// ═══════════════════════════════════════════════════════════════════════════

export const REPLACEMENT_VERDICTS = [
  /** La candidate part en base. */
  "replace",
  /** ⛔ L'ANCIEN PLAN RESTE. La candidate n'est pas livrable. */
  "keep_previous",
  /** Aucun plan précédent, et la candidate n'est pas livrable: on rend un ÉCHEC. */
  "fail_explicit",
] as const;
export type ReplacementVerdict = (typeof REPLACEMENT_VERDICTS)[number];

/**
 * FAUT-IL ÉCRIRE CETTE CANDIDATE ?
 *
 * ⛔ « PRÉSERVER L'ANCIEN PLAN VALIDE TANT QUE LE REMPLACEMENT N'EST PAS
 * LIVRABLE » est une phrase du chantier, et c'est une BRANCHE, pas un message.
 * Le plan l'écrit aussi à l'envers: « vérifier que la branche de refus empêche
 * réellement l'écriture; ajouter un message ou compter `blocking` ne suffit
 * pas ». C'est l'APPELANT qui doit s'abstenir d'écrire sur `keep_previous` et
 * `fail_explicit`; cette fonction lui donne la décision, pas l'exécution.
 *
 * ⚠️ `deliverable_with_gaps` ÉCRIT. C'est la politique déjà acceptée du dépôt:
 * une version utilisable avec un écart nutritionnel résiduel est servie, avec
 * ses motifs nommés. Elle ne passe simplement pas le critère de fin du banc.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-12 · LOT 2 — L'ÉTAT D'UNE CANDIDATE, ET LE QUATRIÈME EN EST UN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ « UN ÉCART MESURÉ » ET « UNE VALIDATION INDISPONIBLE » SONT DEUX ÉTATS
 * DIFFÉRENTS, ET ILS DOIVENT L'ÊTRE DANS LE TYPE. La revue § 7 le mesure: une
 * exception de la garde finale laissait continuer la livraison avec
 * `validation: null` — l'absence d'un verdict « conforme » prise pour un
 * verdict. Un plan dont on ne sait RIEN n'est pas un plan « livrable avec des
 * écarts »: il n'a pas été contrôlé.
 *
 * ⚠️ ET CE N'EST PAS UN QUATRIÈME ÉTAT PERSISTÉ. `PLAN_VALIDATION_STATES`
 * (`plan_validation.ts`) en compte trois, doublés côté écran, et un test
 * épingle la bijection avec `DELIVERY_STATES`. Ce quatrième-ci vit dans la
 * DÉCISION D'ACTIVATION, qui est justement l'endroit où il change quelque
 * chose: on n'active pas, et on ne raconte rien de faux.
 */
export const CANDIDATE_STATES = [
  "conforme",
  "deliverable_with_gaps",
  "not_deliverable",
  /** ⛔ LA GARDE N'A PAS RENDU DE VERDICT. Ce n'est PAS « pas d'écart ». */
  "validation_unavailable",
] as const;
export type CandidateState = (typeof CANDIDATE_STATES)[number];

/**
 * L'ÉTAT D'UNE CANDIDATE, LU SUR LA LIVRAISON DE LA GARDE. PURE.
 *
 * ⛔ `null` EN ENTRÉE = LA GARDE A JETÉ (exception attrapée, contexte absent),
 * et rend `validation_unavailable`. C'est le seul producteur de cet état: le
 * fabriquer ailleurs rouvrirait la confusion que ce lot ferme.
 */
export function candidateStateOf(
  delivery: { readonly state: "conforme" | "deliverable_with_gaps" | "not_deliverable" } | null,
): CandidateState {
  return delivery === null ? "validation_unavailable" : delivery.state;
}

export function chooseReplacement(args: {
  candidate: CandidateState;
  /** `null` = aucune version valide en base. */
  previousIsUsable: boolean;
}): ReplacementVerdict {
  // ⛔ DEUX ÉTATS N'ÉCRIVENT PAS, ET ILS N'ONT PAS LA MÊME CAUSE. `not_deliverable`
  // est un plan MESURÉ et jugé mauvais; `validation_unavailable` est un plan
  // dont on ne sait rien. Les deux préservent l'ancien — c'est la seule chose
  // qu'ils partagent, et c'est ce que cette fonction décide.
  if (
    args.candidate === "not_deliverable" ||
    args.candidate === "validation_unavailable"
  ) {
    return args.previousIsUsable ? "keep_previous" : "fail_explicit";
  }
  return "replace";
}
