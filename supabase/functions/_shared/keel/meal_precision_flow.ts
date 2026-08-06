/**
 * LE FLOW DE PRÉCISION D'UN REPAS — UN mécanisme, DEUX entrées.
 *
 * ── POURQUOI UN SEUL FLOW, ET PAS DEUX JUMEAUX ───────────────────────────
 * Les deux besoins ont la même forme:
 *
 *   un fait est écrit → quelque chose de matériel manque → on pose UNE
 *   question → la réponse AMENDE le fait existant, jamais n'en crée un second.
 *
 * Côté PHOTO, ce qui manque vient de l'image (une hypothèse déclarée, une image
 * dégradée). Côté TEXTE, ce qui manque vient de la déclaration elle-même (« j'ai
 * mangé du poulet », et le coach ne sait ni s'il y avait un féculent, ni comment
 * c'était cuit). La SOURCE de l'incertitude diffère; la machine à états, elle,
 * est identique. Deux flows qui font la même chose divergent en trois mois, et
 * le second oublie toujours une garde du premier — ce module existe pour que ça
 * n'arrive pas.
 *
 * ── L'ESCAPE HATCH N'EST PAS UN CAS LIMITE ───────────────────────────────
 * §3.3bis, "mixed-initiative": les deux parties peuvent prendre l'initiative,
 * et celle de l'élève gagne TOUJOURS. « Un flow qui retient un utilisateur
 * contre son intention est un bug de conception, pas un cas limite. » Ce dépôt
 * a déjà payé exactement ça (`blocked_exit_before_plan_ready`,
 * `safety-crisis-flow-no-exit-on-denial`: trois tours de piège malgré un déni).
 *
 * Donc la sortie est vérifiée AVANT toute logique de flow, et elle est
 * inconditionnelle. Il n'existe aucun état de ce flow d'où l'on ne peut pas
 * sortir en changeant de sujet.
 *
 * ── LE CAS QUI JUSTIFIE LE FLOW (§7.4, J1 soir) ──────────────────────────
 * « Photo + "avec de l'huile du coup ?" → Mise à jour de l'entrée, pas de
 * double log. »
 *
 * Sans flow, ce message est un tour indépendant: le dispatcher y voit une
 * information alimentaire et écrit un SECOND `protocol_events`. L'élève a
 * mangé une fois et le protocole en compte deux — et la couverture, qui est la
 * métrique la plus prédictive (PHOTO_QUANTIFICATION §5), devient fausse à la
 * hausse.
 *
 * PURE MODULE: no I/O, no clock (le caller passe `now`), no randomness.
 */

import type { MealPrecisionAxis } from "./meal_precision.ts";

// ---------------------------------------------------------------------------
// L'état
// ---------------------------------------------------------------------------

/**
 * R1: tokens ASCII. R6: chaque valeur a une branche nommée dans `reduce`.
 *
 *   awaiting_clarification — une question a été posée, et sa réponse changerait
 *                            ce que le protocole du coach dit de ce repas.
 *   awaiting_correction    — l'accusé est parti sans question; l'élève peut
 *                            encore corriger ("non c'était du poulet").
 *   closed                 — le flow ne tourne plus.
 */
export const MEAL_PRECISION_STATES = [
  "awaiting_clarification",
  "awaiting_correction",
  "closed",
] as const;
export type MealPrecisionState = (typeof MEAL_PRECISION_STATES)[number];

/** D'où vient le fait que ce flow peut amender. */
export const MEAL_PRECISION_SOURCES = ["photo", "text"] as const;
export type MealPrecisionSourceKind = (typeof MEAL_PRECISION_SOURCES)[number];

export const MEAL_PRECISION_EXIT_REASONS = [
  "answered",
  "corrected",
  "topic_changed",
  "max_turns",
  "timeout",
  "new_photo",
  "new_declaration",
  "safety",
] as const;
export type MealPrecisionExitReason =
  (typeof MEAL_PRECISION_EXIT_REASONS)[number];

export interface MealPrecisionFlowState {
  state: MealPrecisionState;
  source: MealPrecisionSourceKind;
  /**
   * LES lignes `protocol_events` que ce flow peut encore amender — au pluriel,
   * et c'est la différence structurelle avec la version photo-seule.
   *
   * Une déclaration textuelle écrit UNE LIGNE PAR COMPOSANT (`intake.ts` dédupe
   * par identité): « du poulet et du riz » en produit deux. Un flow qui n'en
   * retenait qu'une amenderait la moitié du repas et laisserait l'autre moitié
   * porter une lecture que l'élève vient de contester.
   */
  eventIds: string[];
  /**
   * LES COCHES AUTOMATIQUES écrites pour ce repas — séparées d'`eventIds`, et
   * la séparation est le point.
   *
   * ── POURQUOI PAS DANS `eventIds` ──────────────────────────────────────────
   * Première tentative de correction (2026-08-05): on ajoutait simplement la
   * ligne `quick_tap` à `eventIds`. La correction amendait bien les deux — mais
   * `targetAmbiguous = eventIds.length > 1` traitait dès lors TOUTE photo
   * cochée comme une cible ambiguë, et `clearsCredit` passait à faux. Mesuré
   * 3/3: une photo de pomme corrigée gardait son `food_group_ref` au lieu de
   * l'effacer. Une coche n'est pas une cible CONCURRENTE de la photo: elle en
   * est DÉRIVÉE. Deux listes, deux traitements.
   *
   * Ces lignes-là ne s'amendent pas, elles se DÉCOCHENT — et seulement sur une
   * `correction`, jamais sur une `answer` (voir `amendMealPrecisionEvents`).
   */
  tickEventIds: string[];
  /**
   * Les clés d'identité DÉJÀ écrites pour ce repas
   * (`protocolEventComponentKey`). C'est l'anti-doublon de la réponse: quand
   * l'élève répond « du poulet avec du riz », le poulet est déjà un fait et ne
   * doit pas en devenir un second sous une autre clé de message.
   */
  componentKeys: string[];
  /** Tours entrants consommés depuis l'ouverture. */
  turns: number;
  openedAt: string;
  /** La question posée, si une l'a été. */
  question: string | null;
  /** L'axe de la question. Null quand aucune question n'a été posée. */
  axis: MealPrecisionAxis | null;
}

/**
 * Deux tours, pas plus.
 *
 * Le flow sert à rattacher UNE réponse à UNE question. Au-delà, l'élève parle
 * d'autre chose et le dispatcher global fait un meilleur travail que nous —
 * insister est précisément l'interrogatoire que §3.3bis interdit.
 */
export const MEAL_PRECISION_MAX_TURNS = 2;

/**
 * Au-delà, la réponse ne porte plus sur ce repas.
 *
 * 30 minutes et pas 24 h: « avec de l'huile du coup ? » deux heures plus tard
 * est un nouveau sujet, et amender un fait vieux de deux heures sur la foi
 * d'un message ambigu écrase une donnée réelle par une supposition.
 */
export const MEAL_PRECISION_TIMEOUT_MINUTES = 30;

// ---------------------------------------------------------------------------
// L'entrée du tour
// ---------------------------------------------------------------------------

/**
 * Ce que le dispatcher LOCAL a compris du message entrant.
 *
 * C'est un CLASSIFIEUR, jamais une regex (§3.1: « jamais de regex pour
 * interpréter un humain »). Ce module ne regarde pas le texte: il reçoit une
 * intention déjà classée et décide de la transition. C'est ce qui le rend
 * testable exhaustivement — et ce qui garantit qu'aucune regex de sens ne peut
 * s'y glisser plus tard.
 */
export const MEAL_PRECISION_INTENTS = [
  /** Répond à la question posée ("oui à l'huile d'olive", "avec du riz"). */
  "answers_question",
  /**
   * CONFIRME ou PRÉCISE ce qui a été enregistré, SANS le contester.
   *
   * ── LE JETON QUI MANQUAIT, ET CE QUE SON ABSENCE COÛTAIT ─────────────────
   * Quand l'accusé annonce une hypothèse et ouvre la porte — « I have ticked
   * "Chicken rice bowl" off. Tell me if that was not it » — l'élève a DEUX
   * réponses possibles: démentir, ou confirmer/préciser. Seule la première
   * était représentable.
   *
   * Et `answers_question` ne pouvait pas jouer ce rôle: il est interdit quand
   * aucune question n'a été posée (à raison — on ne répond pas à une question
   * qui n'existe pas), et la campagne du 2026-08-05 a mesuré que
   * `recognized.clarifying_question` est NULL sur **100 %** des lignes photo.
   * Le flow s'ouvre donc TOUJOURS en `awaiting_correction`, où le prompt
   * interdit explicitement `answers_question`. Résultat: « yes, cooked with
   * olive oil » n'avait d'autre sortie que `corrects_declaration` — classé
   * ainsi 4 fois sur 6, dans les deux langues, ce qui EFFAÇAIT le
   * `food_group_ref` de la photo et décochait un plat correctement identifié.
   * La condition de désarmement de la ceinture était inatteignable par
   * construction: elle n'était pas fragile, elle était morte-née.
   *
   * Ce jeton est disponible dans les DEUX états, avec ou sans question posée.
   * Il amende comme une réponse (le détail est un fait réel, il se garde) et
   * ne retire RIEN: ni le crédit, ni la coche.
   */
  "confirms_declaration",
  /**
   * Corrige ce qui a été enregistré ("c'était du poulet, pas du porc").
   *
   * UN SEUL token pour les deux sources: côté photo il corrige la LECTURE de
   * l'image, côté texte la SAISIE de sa propre phrase. Le geste est le même —
   * l'élève dit que ce qui est écrit est faux — et deux tokens auraient produit
   * deux branches à maintenir pour une seule transition (§P5.3: un vocabulaire).
   */
  "corrects_declaration",
  /** Parle d'autre chose. */
  "unrelated",
  /** Déclare un AUTRE repas: le tour doit écrire son propre fait. */
  "new_declaration",
  /** Envoie une nouvelle photo. Fait de TRANSPORT, jamais lu par un modèle. */
  "new_photo",
  /** Le classifieur n'a pas tranché. */
  "unknown",
] as const;
export type MealPrecisionIntent = (typeof MEAL_PRECISION_INTENTS)[number];

export interface MealPrecisionTurnInput {
  flow: MealPrecisionFlowState;
  intent: MealPrecisionIntent;
  /** Bande de safety du tour. Tout sauf `none` ferme le flow. */
  safetyBand?: "none" | "low" | "medium" | "high" | "critical" | null;
  now: Date;
}

export type MealPrecisionDecision =
  | {
    kind: "amend";
    eventIds: string[];
    /**
     * Les coches à DÉCOCHER. Non vide seulement sur une `correction` — voir
     * `tickEventIds` sur l'état, et pourquoi elles ne sont pas dans `eventIds`.
     */
    tickEventIds: string[];
    /** Ce que l'amendement porte: une réponse, ou une correction. */
    amendment: "answer" | "correction";
    /**
     * La réponse peut-elle AJOUTER des faits ?
     *
     * Une RÉPONSE le peut: « avec du riz » nomme un aliment réellement mangé,
     * et l'enfouir dans un jsonb le rendrait invisible à l'évaluateur — le
     * coach ne pourrait pas le compter. Il devient donc une ligne à part
     * entière, clé d'idempotence dérivée du message de RÉPONSE, liée au fait
     * d'origine.
     *
     * Une CORRECTION ne le peut pas: « non, c'était de la dinde » REMPLACE une
     * lecture, elle n'ajoute pas un second repas. Lui laisser écrire une ligne
     * produirait exactement le doublon que ce flow existe pour empêcher.
     */
    allowsNewComponents: boolean;
    nextFlow: MealPrecisionFlowState;
  }
  | {
    kind: "exit";
    reason: MealPrecisionExitReason;
    nextFlow: MealPrecisionFlowState;
  }
  | { kind: "stay"; nextFlow: MealPrecisionFlowState };

function closed(flow: MealPrecisionFlowState): MealPrecisionFlowState {
  return { ...flow, state: "closed" };
}

function minutesSince(openedAt: string, now: Date): number {
  const opened = new Date(openedAt).getTime();
  if (!Number.isFinite(opened)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - opened) / 60_000;
}

/**
 * L'ÉTAT APRÈS UN AMENDEMENT QUI NE RETIRE RIEN (confirmation, réponse).
 *
 * ── LE DÉFAUT MESURÉ 6/6, DÉTERMINISTE, LE 2026-08-06 ─────────────────────
 * Les TROIS branches d'amendement rendaient `closed(...)`, et la lane traduit
 * `closed` en état effacé. Un flow ne pouvait donc porter qu'UN SEUL
 * amendement, jamais deux. Séquence mesurée, dans les deux langues:
 *
 *   tour 1  « oui, c'est bien ça »        → amendement, flow FERMÉ
 *   tour 2  « en fait non, c'était des pâtes » → plus aucun flow:
 *           rien n'est amendé, LA COCHE DU PLAT DÉMENTI RESTE, et Sophia
 *           répond quand même « Got it — pasta, not the earlier thing ».
 *
 * Un accusé fantôme, sur la porte de correction que le produit vient d'ouvrir
 * lui-même. Et le trou en cachait deux autres: `MEAL_PRECISION_MAX_TURNS = 2`
 * était INATTEIGNABLE après tout amendement (seul `unknown` laissait le flow
 * ouvert), et l'empilement documenté dans `buildAmendedRecognized` — « c'était
 * du poulet » puis « et sans huile », deux faits que le coach doit voir — était
 * du code mort: `max(jsonb_array_length(amendments))` valait 1 sur tout le run.
 *
 * CONFIRMER OU RÉPONDRE NE RÈGLE PAS L'IDENTITÉ DU REPAS. La porte de
 * correction reste donc ouverte, bornée comme avant par `MAX_TURNS` et par la
 * fenêtre de fraîcheur. Une CORRECTION, elle, ferme: l'élève vient de dire ce
 * que c'était, l'identité est tranchée.
 *
 * L'état retombe sur `awaiting_correction`: la question, s'il y en avait une,
 * vient d'obtenir sa réponse — ce qui reste ouvert n'est plus qu'une porte.
 */
function stillOpenAfterNonDestructive(
  flow: MealPrecisionFlowState,
  turns: number,
): MealPrecisionFlowState {
  return { ...flow, turns, state: "awaiting_correction", question: null };
}

/**
 * La transition. L'ORDRE DES GARDES EST LE CONTRAT.
 *
 *   1. safety          — un tour de crise ferme le flow. On ne demande pas à
 *                        quelqu'un en détresse s'il a mis de l'huile.
 *   2. escape          — l'initiative de l'élève gagne, inconditionnellement,
 *                        et AVANT tout le reste (voir l'en-tête).
 *   3. new_photo       — la photo suivante ouvre son propre flow; l'ancien se
 *                        ferme au lieu de capturer la nouvelle.
 *   4. new_declaration — un autre repas déclaré ferme celui-ci pour la même
 *                        raison: le tour doit pouvoir écrire son propre fait.
 *   5. timeout         — au-delà de la fenêtre, ce n'est plus le même repas.
 *   6. max_turns       — deux tours et on rend la main.
 *   7. le métier       — répondre / corriger.
 */
export function reduceMealPrecisionFlow(
  input: MealPrecisionTurnInput,
): MealPrecisionDecision {
  const { flow, intent, now } = input;

  if (flow.state === "closed") {
    return { kind: "exit", reason: "topic_changed", nextFlow: flow };
  }

  const band = input.safetyBand ?? "none";
  if (band !== "none") {
    return { kind: "exit", reason: "safety", nextFlow: closed(flow) };
  }

  // L'ESCAPE HATCH. Avant le timeout, avant le max-tours, avant tout: si
  // l'élève parle d'autre chose, il sort. Aucun état n'y échappe.
  if (intent === "unrelated") {
    return { kind: "exit", reason: "topic_changed", nextFlow: closed(flow) };
  }

  if (intent === "new_photo") {
    return { kind: "exit", reason: "new_photo", nextFlow: closed(flow) };
  }

  if (intent === "new_declaration") {
    return { kind: "exit", reason: "new_declaration", nextFlow: closed(flow) };
  }

  if (minutesSince(flow.openedAt, now) > MEAL_PRECISION_TIMEOUT_MINUTES) {
    return { kind: "exit", reason: "timeout", nextFlow: closed(flow) };
  }

  const turns = flow.turns + 1;
  if (turns > MEAL_PRECISION_MAX_TURNS) {
    return { kind: "exit", reason: "max_turns", nextFlow: closed(flow) };
  }

  // MÊME TRANSITION QU'UNE RÉPONSE, et c'est le point: confirmer ou préciser
  // ajoute un fait, ne retire rien. `tickEventIds: []` est la condition de
  // désarmement du décochage — enfin atteignable, puisque ce jeton ne dépend
  // d'aucune question posée.
  if (intent === "confirms_declaration") {
    return {
      kind: "amend",
      eventIds: [...flow.eventIds],
      tickEventIds: [],
      amendment: "answer",
      allowsNewComponents: true,
      // ⚠️ LA PORTE RESTE OUVERTE — voir `stillOpenAfterNonDestructive`.
      nextFlow: stillOpenAfterNonDestructive(flow, turns),
    };
  }

  if (intent === "answers_question") {
    // LE CAS §7.4 J1 soir: on AMENDE les lignes, on n'en crée pas de seconde
    // POUR CE QUI EST DÉJÀ ÉCRIT. Ce que la réponse ajoute de NOUVEAU est un
    // fait à part entière — c'est `allowsNewComponents`, et l'anti-doublon est
    // porté par `componentKeys`, pas par un refus global d'écrire.
    return {
      kind: "amend",
      eventIds: [...flow.eventIds],
      // Une RÉPONSE précise le repas, elle ne dément pas le plat: la coche
      // reste. C'est la condition de désarmement du décochage.
      tickEventIds: [],
      amendment: "answer",
      allowsNewComponents: true,
      // Même raison que pour la confirmation: répondre ne règle pas l'identité
      // du repas, donc ça ne doit pas fermer la porte de correction.
      nextFlow: stillOpenAfterNonDestructive(flow, turns),
    };
  }

  if (intent === "corrects_declaration") {
    return {
      kind: "amend",
      eventIds: [...flow.eventIds],
      // Une CORRECTION dément l'identification: la coche automatique qui en
      // découlait doit tomber avec elle.
      tickEventIds: [...(flow.tickEventIds ?? [])],
      amendment: "correction",
      allowsNewComponents: false,
      nextFlow: closed({ ...flow, turns }),
    };
  }

  // `unknown`: le classifieur n'a pas tranché. On NE DEVINE PAS (§3.3bis:
  // deviner est interdit). On reste un tour de plus, ce qui laisse le
  // dispatcher global répondre normalement pendant que le flow attend — et le
  // max-tours ferme de toute façon au tour suivant.
  return { kind: "stay", nextFlow: { ...flow, turns } };
}

/** L'état initial, posé quand un repas vient d'être écrit. */
export function openMealPrecisionFlow(args: {
  source: MealPrecisionSourceKind;
  eventIds: readonly string[];
  /** Les coches automatiques de ce repas — voir `tickEventIds` sur l'état. */
  tickEventIds?: readonly string[];
  componentKeys?: readonly string[];
  question: string | null;
  axis?: MealPrecisionAxis | null;
  now: Date;
}): MealPrecisionFlowState {
  return {
    // Une question posée attend une réponse; sans question, on reste
    // seulement ouvert à une correction. Les deux states existent parce que
    // le renderer ne doit pas relancer une question qu'il n'a pas posée.
    state: args.question ? "awaiting_clarification" : "awaiting_correction",
    source: args.source,
    eventIds: [...args.eventIds].map((id) => String(id)).filter((id) =>
      id !== ""
    ),
    tickEventIds: [...(args.tickEventIds ?? [])].map((id) => String(id))
      .filter((id) => id !== ""),
    componentKeys: [...(args.componentKeys ?? [])].map((key) => String(key))
      .filter((key) => key !== ""),
    turns: 0,
    openedAt: args.now.toISOString(),
    question: args.question,
    axis: args.axis ?? null,
  };
}
