/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE BLOC D'ORCHESTRATION MINIMAL : LANCER LE CONTRÔLE, ATTRAPER, DÉCIDER,
 * REFUSER — OU PUBLIER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE MODULE FERME, ET IL EST RESTÉ OUVERT TROIS LOTS. Le cas
 * « validation indisponible » n'était prouvé qu'au niveau des types :
 * `candidateStateOf(null)` rend `validation_unavailable`, `chooseReplacement`
 * rend `keep_previous`, et des épingles de SOURCE lisaient le handler. Aucune
 * exception n'avait jamais été levée dans ce chemin : le `catch` était LU,
 * jamais EXÉCUTÉ. Un `catch` jamais exécuté est indiscernable d'un `catch`
 * cassé — la cicatrice « ceinture armée sur coffre vide », au dernier contrôle
 * du produit.
 *
 * ⛔ LA MÉTHODE EST IMPOSÉE, ET ELLE INTERDIT L'INTERRUPTEUR. Pas de drapeau
 * HTTP, pas de secret, pas de variable d'environnement, pas de branche « si
 * test » : la panne s'obtient en passant une FONCTION DE CONTRÔLE qui jette.
 * En production, l'appelant passe toujours le vrai contrôle ; dans un test, il
 * passe une fonction qui jette. Le code de production ne porte donc AUCUN
 * moyen de désarmer le contrôle : il n'y a rien à désarmer, il n'y a qu'un
 * paramètre à fournir.
 *
 * ⛔ `validate` ET `publish` SONT REQUIS, JAMAIS `?`. La doctrine du dépôt
 * (« paramètre de garde optionnel = garde désarmée ») : un `validate?` ferait
 * de « pas de contrôle » le défaut SILENCIEUX de tout appelant qui l'oublie.
 * Les champs qui peuvent légitimement manquer — le journal, la livraison de la
 * garde amont — sont requis ET nullables : on doit ÉCRIRE `null`, donc le
 * choisir.
 *
 * ── ⚠️ UNE PANNE DE JOURNAL N'EST PAS UNE PANNE DE CONTRÔLE ────────────────
 *
 * Le `try` du handler enfermait le contrôle ET son `console.log`. Un
 * `JSON.stringify` qui jette (cycle, `BigInt`, `toJSON` hostile) tombait donc
 * dans le même `catch` et se racontait « validation indisponible » : on
 * refusait un plan que la garde avait, en fait, jugé propre. Ici les deux
 * vivent dans DEUX `try` séparés : le contrôle décide, le journal ne décide
 * rien. `journal: "failed"` le dit, et `onJournalFailure` permet à l'appelant
 * de le compter AVANT de publier.
 *
 * ⚠️ SANS I/O PROPRE. Ce module n'ouvre rien, ne lit aucune horloge, ne tire
 * aucun aléa : tous les effets (journal, écriture, remise de quota) sont
 * INJECTÉS. C'est ce qui rend « zéro écriture » mesurable au lieu d'être
 * déduit de la position des lignes dans un fichier de 19 000 lignes.
 */

import {
  type CandidateState,
  candidateStateOf,
  chooseReplacement,
  type ReplacementVerdict,
} from "./plan_repair_loop.ts";
import { type DeliveryState } from "./final_plan_gate.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LE CONTRÔLE QUI TOURNE, OU QUI JETTE — ET SON JOURNAL, À PART
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE RÉSULTAT D'UN CONTRÔLE.
 *
 * ⛔ `ran: false` N'EST PAS « RIEN TROUVÉ ». C'est toute la distinction que ce
 * type porte : une liste vide parce que le recensement a jeté se relit « plan
 * sain », et c'est très exactement la façon dont une garde meurt dans ce
 * dépôt.
 */
export type ValidationRun<T> =
  | {
    readonly ran: true;
    readonly value: T;
    /**
     * `"none"` = aucun journal demandé ; `"written"` = écrit ; `"failed"` =
     * le journal a jeté — et le contrôle, lui, a bien tourné.
     */
    readonly journal: "none" | "written" | "failed";
    readonly journalError: unknown;
  }
  | {
    readonly ran: false;
    /** Le motif posé dans `issues[]` par l'appelant. Jamais vide. */
    readonly reason: string;
    /** L'exception RÉELLE, rendue telle quelle : l'appelant la journalise. */
    readonly error: unknown;
  };

/**
 * LANCE UN CONTRÔLE, ATTRAPE, ET JOURNALISE À PART. PURE (aux effets injectés
 * près : `validate` et `journal` sont ceux de l'appelant).
 *
 * ⛔ `validate` EST REQUIS. Il n'a pas de valeur par défaut, et il ne peut pas
 * être `null` : un appelant qui n'a pas de contrôle à lancer n'a rien à faire
 * ici.
 *
 * ⚠️ L'ORDRE COMPTE : le contrôle d'abord, dans son propre `try` ; le journal
 * ensuite, dans le sien. Inverser, ou les fondre, rend une panne d'écriture de
 * trace indiscernable d'une panne de contrôle.
 */
export function runValidation<T>(args: {
  /** Le motif à écrire quand le contrôle jette. Vide ⇒ `"unknown"`. */
  readonly reason: string;
  /** ⛔ LE VRAI CONTRÔLE. Requis. */
  readonly validate: () => T;
  /** Requis ET nullable : `null` = ce site ne journalise rien. */
  readonly journal: ((value: T) => void) | null;
}): ValidationRun<T> {
  const motif = String(args.reason ?? "").trim();
  let value: T;
  try {
    value = args.validate();
  } catch (error) {
    return { ran: false, reason: motif === "" ? "unknown" : motif, error };
  }
  if (args.journal === null) {
    return { ran: true, value, journal: "none", journalError: null };
  }
  try {
    args.journal(value);
  } catch (journalError) {
    // ⛔ ON NE REQUALIFIE PAS. Le contrôle a rendu `value` ; c'est la trace qui
    // est tombée. Rendre `ran: false` ici referait le défaut qu'on ferme.
    return { ran: true, value, journal: "failed", journalError };
  }
  return { ran: true, value, journal: "written", journalError: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② CE QUE LA DÉCISION LIT, ET CE QU'ELLE REND
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE RELEVÉ DE SORTIE : ce que le dernier contrôle rend.
 *
 * ⚠️ `bites` EST LA SEULE CHOSE QUE LA DÉCISION REGARDE. Le reste du relevé
 * (les surfaces, leurs compteurs) appartient à l'appelant et voyage intact
 * jusqu'à lui.
 */
export interface OutputLockSurvey {
  readonly bites: readonly unknown[];
}

/** Ce que la décision lit de la garde AMONT. `null` = elle a jeté. */
export interface GateDeliveryLike {
  readonly state: DeliveryState;
  readonly blocking: readonly unknown[];
}

/**
 * LE VERDICT DE PUBLICATION.
 *
 * ⛔ QUATRE SORTIES, ET ELLES NE SE FONDENT JAMAIS :
 *
 *   · `published`            — `publish` a été appelée, une fois, et elle SEULE
 *                              écrit.
 *   · `validation_unavailable` — notre instrument est tombé. On n'accuse pas le
 *                              plan : on n'en sait rien. `source` dit lequel des
 *                              deux contrôles est tombé.
 *   · `output_lock_violation` — une morsure a survécu au relevé final. Le fond
 *                              est faux, c'est le plan qu'on refuse.
 *   · `not_deliverable`      — la garde finale a des causes bloquantes.
 */
export type PlanPublicationOutcome<L, D, R> =
  | {
    readonly kind: "published";
    readonly result: R;
    readonly survey: L;
    readonly candidate: CandidateState;
    readonly journalFailed: boolean;
  }
  | {
    readonly kind: "validation_unavailable";
    /** Lequel des deux contrôles est tombé. */
    readonly source: "output_lock" | "final_gate";
    readonly reason: string;
    /** L'exception réelle du relevé final ; `null` quand c'est la garde amont. */
    readonly error: unknown;
    /** `null` quand le relevé final est tombé AVANT toute lecture de la garde. */
    readonly candidate: CandidateState | null;
    readonly journalFailed: boolean;
  }
  | {
    readonly kind: "output_lock_violation";
    readonly survey: L;
    readonly journalFailed: boolean;
  }
  | {
    readonly kind: "not_deliverable";
    readonly survey: L;
    readonly delivery: D;
    readonly candidate: CandidateState;
    readonly verdict: ReplacementVerdict;
    readonly journalFailed: boolean;
  };

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE BLOC : CONTRÔLE → DÉCISION → REFUS OU PUBLICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LANCE LE DERNIER CONTRÔLE, DÉCIDE, ET NE PUBLIE QUE SI RIEN NE REFUSE.
 *
 * ⛔ `publish` EST APPELÉE UNE FOIS, AU PLUS, ET JAMAIS SUR UN REFUS. C'est la
 * propriété que le plan réclame en toutes lettres : « vérifier que la branche
 * de refus empêche réellement l'écriture/activation ; ajouter un message ou
 * compter `blocking` ne suffit pas ». Elle porte les DEUX écritures du chemin —
 * le magasin d'aperçu et la ligne de plan — et elle est injectée, donc un test
 * la remplace par un espion et COMPTE.
 *
 * ⛔ L'ORDRE DES QUATRE PORTES EST CELUI DU HANDLER, et le changer changerait
 * le produit :
 *   ① le relevé final jette            → refus technique
 *   ② une morsure survit               → refus de plan
 *   ③ la garde amont n'a pas de verdict → refus technique
 *   ④ la garde amont a des bloquantes   → refus de plan
 * puis, et seulement puis, `publish`.
 *
 * ⚠️ CETTE FONCTION NE JOURNALISE RIEN ET N'ÉCRIT RIEN D'ELLE-MÊME. Les
 * `issues`, les traces et la remise de quota restent chez l'appelant, qui sait
 * ce qu'il est en train de servir.
 */
export async function decidePlanPublication<
  L extends OutputLockSurvey,
  D extends GateDeliveryLike,
  R,
>(args: {
  /** ⛔ LE VRAI RELEVÉ FINAL. Requis. */
  readonly validate: () => L;
  /** Requis ET nullable. */
  readonly journal: ((survey: L) => void) | null;
  /** Le motif écrit quand le relevé jette. */
  readonly reason: string;
  /**
   * Requis ET nullable. `null` = la garde finale a jeté plus haut, et c'est
   * `candidateStateOf` qui en tire `validation_unavailable`.
   */
  readonly gateDelivery: D | null;
  /** `false` = aucune version valide en base ; la décision devient explicite. */
  readonly previousIsUsable: boolean;
  /** ⛔ LA SEULE ÉCRITURE DU CHEMIN. Requise. */
  readonly publish: (survey: L) => Promise<R>;
  /**
   * Requis ET nullable. Appelé si le JOURNAL du relevé a jeté — donc avant
   * `publish`, pour que l'appelant puisse le compter sur le plan qui part.
   */
  readonly onJournalFailure: ((error: unknown) => void) | null;
}): Promise<PlanPublicationOutcome<L, D, R>> {
  const run = runValidation({
    reason: args.reason,
    validate: args.validate,
    journal: args.journal,
  });
  if (!run.ran) {
    // ① Le relevé a jeté : on ne sait RIEN des surfaces servies. Une liste
    // vide se relirait « plan sain ».
    return {
      kind: "validation_unavailable",
      source: "output_lock",
      reason: run.reason,
      error: run.error,
      candidate: null,
      journalFailed: false,
    };
  }
  const journalFailed = run.journal === "failed";
  if (journalFailed && args.onJournalFailure !== null) {
    args.onJournalFailure(run.journalError);
  }
  if (run.value.bites.length > 0) {
    // ② Le fond est faux : quelqu'un ne doit pas manger ça.
    return { kind: "output_lock_violation", survey: run.value, journalFailed };
  }
  // ③ ET C'EST LE SEUL PRODUCTEUR DE `validation_unavailable` CÔTÉ GARDE :
  // `candidateStateOf(null)`. Le fabriquer ailleurs rouvrirait la confusion
  // entre « mesuré et mauvais » et « pas mesuré ».
  const candidate = candidateStateOf(args.gateDelivery);
  const verdict = chooseReplacement({
    candidate,
    previousIsUsable: args.previousIsUsable,
  });
  if (verdict !== "replace" && candidate === "validation_unavailable") {
    return {
      kind: "validation_unavailable",
      source: "final_gate",
      reason: "final_gate_unavailable",
      error: null,
      candidate,
      journalFailed,
    };
  }
  if (args.gateDelivery !== null && args.gateDelivery.state === "not_deliverable") {
    // ④ Le plan est MESURÉ et jugé non livrable.
    //
    // ⟳ 2026-09-14 · BÊTA 1B ⑧ — ON LIT L'ÉTAT, PLUS `blocking.length`. Les
    // deux étaient équivalents jusqu'ici (`not_deliverable` ⟺ au moins une
    // bloquante), et ils ne le sont plus: `finalGateDelivery` rend aussi cet
    // état quand un CONTRÔLE ESSENTIEL n'a pas conclu — un plan sans aucun
    // refus dont la nutrition n'a jamais été mesurée n'est pas un plan propre,
    // c'est un plan qu'on n'a pas lu. Lire `blocking` l'aurait publié.
    return {
      kind: "not_deliverable",
      survey: run.value,
      delivery: args.gateDelivery,
      candidate,
      verdict,
      journalFailed,
    };
  }
  return {
    kind: "published",
    result: await args.publish(run.value),
    survey: run.value,
    candidate,
    journalFailed,
  };
}
