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

export interface RepairDefect {
  kind: RepairDefectKind;
  /** Le jour, le moment, le plat — ce qui permet de dire OÙ, au modèle. */
  day: string | null;
  slot: string | null;
  dish: string | null;
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
  // ── la taille ──────────────────────────────────────────────────────────
  cell_energy_off: { kind: "sizing", repairable: true },
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
): RepairDefect[] {
  const out: RepairDefect[] = [];
  for (const r of refusals ?? []) {
    const mapped = CAUSE_TO_DEFECT[r.cause];
    // ⛔ UNE CAUSE INCONNUE DE CETTE TABLE N'EST PAS IGNORÉE: elle devient le
    // défaut le plus faible et NON réparable. Un `continue` silencieux ferait
    // disparaître d'un verdict la cause ajoutée le mois prochain.
    const kind = mapped?.kind ?? "preference";
    const repairable = mapped?.repairable ?? false;
    out.push({
      kind,
      day: r.day,
      slot: r.slot,
      dish: r.dish,
      memberId: r.member_id,
      detail: r.detail,
      repairable,
      magnitude: magnitudes?.get(violationKey(r)) ?? null,
    });
  }
  return orderDefects(out);
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
export function chooseReplacement(args: {
  candidate: "conforme" | "deliverable_with_gaps" | "not_deliverable";
  /** `null` = aucune version valide en base. */
  previousIsUsable: boolean;
}): ReplacementVerdict {
  if (args.candidate !== "not_deliverable") return "replace";
  return args.previousIsUsable ? "keep_previous" : "fail_explicit";
}
