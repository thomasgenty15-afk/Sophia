/**
 * LA POLITIQUE DE LIVRAISON IN-APP — module PUR, aucune I/O.
 *
 * ── CE QUI CHANGE DE NATURE ICI ──────────────────────────────────────────────
 * Les plafonds de `whatsapp-send` n'étaient pas des choix produit : c'étaient
 * des contraintes Meta déguisées. « 2 proactifs par jour hors fenêtre 24h »
 * voulait dire « 2 templates payants par jour, parce qu'au-delà on paie et on
 * se fait signaler ». La fenêtre de 24h n'existait pas non plus : c'était la
 * frontière au-delà de laquelle Meta interdit le texte libre.
 *
 * Meta est parti. **Ces règles sont maintenant les nôtres, et il faut donc
 * qu'elles se justifient toutes seules.** Ce fichier est l'endroit où c'est
 * écrit, et c'est la raison pour laquelle il est pur : une règle produit doit
 * être lisible et testable sans base de données.
 *
 *   - **Conversation active** (l'élève a écrit récemment) → aucun plafond.
 *     Justification : dans un échange en cours, un message de Sophia est une
 *     réponse ou une relance attendue. Le plafonner produirait des silences
 *     absurdes au milieu d'une conversation. Ce n'est PAS la fenêtre de 24h de
 *     Meta : le seuil est plus court (10 h) et il ne conditionne aucun format.
 *   - **Hors conversation active** → 2 relances non sollicitées par jour local.
 *     Justification : deux notifications quotidiennes non demandées, c'est le
 *     plancher de ce qu'un compagnon quotidien doit pouvoir faire, et le
 *     plafond de ce qu'un produit peut se permettre avant d'être coupé.
 *   - **Les bilans garantis réservent leurs créneaux** dans ce plafond au lieu
 *     de s'ajouter. Justification inchangée : le soir + le dimanche, ce sont
 *     eux qui comptent, pas un nudge de plus.
 *   - **Les envois programmés que l'élève a acceptés** (rappels de créneau du
 *     plan de son coach) ont leur PROPRE allocation. Justification : ce n'est
 *     pas un message qu'on lui impose, c'est celui pour lequel il s'est
 *     inscrit. Mais « accepté » ne veut pas dire « illimité » : un plan dense a
 *     huit créneaux, et huit notifications d'affilée est un désabonnement.
 *
 * ── CE QUI N'EST PAS UN CHOIX PRODUIT, ET NE LE DEVIENDRA PAS ────────────────
 * `muted` (l'ancien STOP) ne coupe QUE le proactif. Une conversation directe
 * répond toujours : couper la réponse à quelqu'un qui écrit, c'est le punir
 * d'avoir demandé le silence.
 *
 * `deletion_pending` et le gel de l'état à la livraison sont des règles de
 * vérité, pas de confort : un message composé pour un état qui n'existe plus au
 * moment de partir ne doit pas partir (« priorité état à la livraison »).
 */

/** Une conversation est « active » si l'élève a écrit dans cette fenêtre. */
export const ACTIVE_CONVERSATION_WINDOW_MS = 10 * 60 * 60 * 1000;

/** Relances NON SOLLICITÉES par jour local, hors conversation active. */
export const DAILY_UNSOLICITED_CAP = 2;

/** Envois programmés acceptés (rappels de créneau) par jour local. */
export const DAILY_OPT_IN_CAP = 5;

/**
 * Les bilans : ils partent toujours, et ils RÉSERVENT leur créneau dans le
 * plafond au lieu de s'y ajouter.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * FF-062 R16 — TRANCHÉ LE 2026-09-01: C'EST CETTE LISTE QUI GRANDIT, PAS LE
 * PLAFOND.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * FF-062 R1 autorise **trois** messages proactifs par jour dans son pire cas
 * (le repas d'un créneau hors plan + le rappel de pesée + le bilan du soir),
 * alors que `DAILY_UNSOLICITED_CAP` en autorise **deux**. Sans arbitrage, le
 * troisième serait refusé par cette politique — et il aurait l'air de marcher,
 * puisqu'un refus se compte comme une décision produit et pas comme une panne.
 *
 * Deux issues existaient. Monter le plafond à trois aurait relâché la garde
 * pour TOUS les non-sollicités, y compris ceux qu'elle protège justement — un
 * élève pourrait recevoir trois relances là où deux étaient la limite étudiée.
 *
 * On fait donc entrer ici les canaux **adossés à un fait du plan**: ils
 * réservent leur créneau au lieu de s'y ajouter, exactement comme les bilans,
 * et le plafond des non-sollicités reste à deux. C'est la forme exacte de T4
 * amendée: *« le budget partagé tient pour les demandes non sollicitées; les
 * canaux adossés à un fait du plan en sont exemptés »*.
 *
 * ⚠️ CE QUE ÇA COÛTE, ET IL FAUT LE SAVOIR: un jour chargé (trois canaux
 * garantis) ne laisse plus de créneau à une relance. C'est le bon arbitrage
 * dans ce sens-là — quelqu'un qui reçoit déjà trois messages n'a pas besoin
 * d'être relancé — mais c'est un arbitrage, pas une conséquence neutre.
 *
 * ⛔ CETTE LISTE N'EST PAS UNE COMMODITÉ. Un purpose ajouté ici ne peut plus
 * être refusé par le plafond: il part TOUJOURS. N'y entre que ce qui répond à
 * un fait que la personne a produit — un plan qui s'achève, un créneau qu'elle
 * a déclaré, une pesée qu'elle attend. Une envie de parler n'y entre pas.
 */
export const GUARANTEED_PURPOSES = new Set<string>([
  "keel_daily_pulse",
  "keel_weekly_flow",
  "action_evening_review",
  "action_evening_review_already_resolved",
  "weekly_progress_review",
  // ⟳ FF-062 — AJOUTÉS AVEC LEUR CANAL, le 2026-09-02 (lot 6). Leur émetteur
  // est `keel-proactive-v1`; les déclarer avant lui aurait fait deux lignes que
  // personne ne peut expliquer.
  //
  // ⛔ POURQUOI CES DEUX-LÀ Y ONT DROIT, ET PAS « UNE ENVIE DE PARLER »: les
  // deux répondent à un fait que la PERSONNE a produit. C1 part parce qu'elle a
  // coché « je mange dehors » sur ce créneau; C2 parce que la cadence de son
  // objectif est écoulée depuis sa dernière pesée. Ni l'un ni l'autre ne
  // s'invente une occasion.
  //
  // ⚠️ ET C'EST CE QUI REND R1 STRUCTUREL. Un jour à trois canaux (C1 + C2 +
  // le bilan du soir) livre trois messages, et ces trois-là CONSOMMENT chacun
  // un créneau (`countsAsUnsolicited: true` en étape 8): le plafond des non
  // sollicités tombe alors à zéro et la relance de la journée est refusée. Le
  // pire cas de la fiche fait donc exactement trois messages, sans qu'aucun
  // compteur neuf n'ait été écrit.
  "keel_slot_meal",
  "keel_weigh_in",
  // ⟳ FF-054 §3.2 — LE RETOUR DE FIN DE PLAN, SOUS SON PROPRE NOM (2026-09-02).
  //
  // Il sortait sous `keel_daily_pulse` pour hériter de la garantie de ce
  // purpose-là, ce qui rendait « combien de retours de fin de plan sont
  // partis ? » indénombrable — la question même que §10 de sa fiche pose. Il a
  // son nom depuis qu'il a son émetteur (`runPlanFeedbackStep`, 22h locales).
  //
  // Il a le droit d'être garanti pour la raison qui vaut pour les deux
  // au-dessus: il répond à un fait que la personne a produit — sa fenêtre de
  // plan vient de se fermer. Une fois par plan, jamais deux.
  "keel_plan_feedback",
]);

/** Envois programmés que l'élève a acceptés en acceptant le plan de son coach. */
export const OPT_IN_PURPOSES = new Set<string>([
  "keel_slot_reminder",
  "keel_sunday_digest",
]);

// ── `keel_coach_broadcast` N'EST DANS AUCUN DE CES ENSEMBLES, ET C'EST VOULU ──
//
// Le message de cohorte du coach (20260806180500) tombe donc en étape 9: le
// plafond NON SOLLICITÉ. Trois raisons de ne pas le promouvoir:
//
//   * ce n'est pas un envoi PROGRAMMÉ que l'élève a accepté (`OPT_IN`): il ne
//     suit aucun rythme que l'élève connaît, il arrive quand son coach écrit;
//   * ce n'est pas un bilan (`GUARANTEED`): rien ne casse s'il n'arrive pas
//     aujourd'hui, alors qu'un bilan manqué est une mesure perdue;
//   * le plafond est la protection contre un coach enthousiaste, en plus de la
//     cadence hebdomadaire tenue en base.
//
// CONSÉQUENCE ASSUMÉE: un jour où l'élève a déjà reçu une relance, la diffusion
// peut être écartée. C'est le bon arbitrage dans ce sens-là — mais il vaut
// d'être su, et `skipped_count` sur la ligne de diffusion le rend visible au
// coach au lieu de le laisser croire que tout le monde a reçu.

/**
 * Confirmations transactionnelles. Jamais plafonnées, jamais coupées par un
 * mute : ce sont des accusés d'une action que l'élève vient de faire.
 */
export const TRANSACTIONAL_PURPOSES = new Set<string>([
  "subscription_confirmed",
  "subscription_modified",
  "account_deletion_confirmed",
  "account_export_ready",
]);

export type DeliveryDecisionInput = {
  purpose: string;
  /**
   * `true` quand le message est une RÉPONSE au tour que l'élève vient
   * d'envoyer. Un message de réponse ne traverse aucun plafond : il n'est pas
   * une notification, il est l'autre moitié d'un échange.
   */
  isReply: boolean;
  /** ISO du dernier message entrant de l'élève, ou null s'il n'a jamais écrit. */
  lastInboundAtIso: string | null;
  nowIso: string;
  /** L'élève a coupé les relances proactives (l'ancien STOP). */
  muted: boolean;
  /** Suppression de compte demandée : plus rien ne part, sauf la confirmation. */
  deletionPending: boolean;
  /**
   * L'état pour lequel le message a été composé vaut-il encore ? Composé pour
   * un plan qui vient d'être archivé → non. `null` = pas d'état à vérifier.
   */
  composedStateStillValid: boolean | null;
  /** Relances non sollicitées déjà parties aujourd'hui (jour local de l'élève). */
  unsolicitedSentToday: number;
  /** Bilans garantis ATTENDUS aujourd'hui — ils réservent leurs créneaux. */
  guaranteedExpectedToday: number;
  /** Envois programmés acceptés déjà partis aujourd'hui. */
  optInSentToday: number;
};

export type DeliveryDecision = {
  deliver: boolean;
  /** Motif machine, stable, journalisable. */
  reason: string;
  /**
   * Le message CONSOMME-T-IL un créneau non sollicité ? (il compte pour les
   * suivants)
   */
  countsAsUnsolicited: boolean;
  /**
   * Le message est-il OPPOSABLE au plafond ? (le plafond peut le refuser)
   *
   * ── LES DEUX NE SONT PAS LA MÊME CHOSE, ET LES CONFONDRE A CASSÉ UN BILAN ──
   * Un bilan du soir `counts_as_unsolicited: true` — il consomme un créneau,
   * c'est toute la règle « les bilans réservent leurs créneaux au lieu de s'y
   * ajouter ». Mais il n'est PAS opposable au plafond : il part toujours.
   *
   * Le premier jet passait `countsAsUnsolicited` à la réservation atomique
   * comme s'il valait « soumis au plafond ». Résultat, mesuré par
   * `delivery_int_test.ts` : après deux nudges, le bilan du soir était REFUSÉ —
   * exactement le message que la règle des créneaux réservés existe pour
   * protéger. Le test a mordu ; d'où ce second champ, explicite.
   */
  subjectToCap: boolean;
};

function allow(
  reason: string,
  countsAsUnsolicited: boolean,
  subjectToCap = false,
): DeliveryDecision {
  return { deliver: true, reason, countsAsUnsolicited, subjectToCap };
}

function block(reason: string): DeliveryDecision {
  return {
    deliver: false,
    reason,
    countsAsUnsolicited: false,
    subjectToCap: false,
  };
}

export function isConversationActive(
  lastInboundAtIso: string | null,
  nowIso: string,
): boolean {
  if (!lastInboundAtIso) return false;
  const last = Date.parse(lastInboundAtIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return false;
  // Un dernier entrant DANS LE FUTUR n'ouvre pas une conversation: c'est une
  // horloge désaccordée, pas une preuve de présence. Le refus est explicite
  // parce qu'un `now - last` négatif passait le seuil sans discuter.
  if (last > now) return false;
  return now - last <= ACTIVE_CONVERSATION_WINDOW_MS;
}

/**
 * L'ORDRE DES GARDES EST L'INVARIANT. De la plus dure à la plus souple :
 *   suppression → réponse directe → transactionnel → mute → état composé → plafonds.
 *
 * Il n'est pas commutatif. Mettre le mute avant la réponse directe couperait la
 * réponse de quelqu'un qui écrit. Mettre les plafonds avant l'état composé
 * ferait consommer un créneau à un message qui ne devait pas partir.
 */
export function decideChatDelivery(
  input: DeliveryDecisionInput,
): DeliveryDecision {
  const purpose = String(input.purpose ?? "").trim();

  // 1. Compte en suppression : plus rien, sauf le message qui confirme
  //    justement la suppression.
  if (input.deletionPending && purpose !== "account_deletion_confirmed") {
    return block("deletion_pending");
  }

  // 2. Une réponse n'est pas une notification. Elle passe toujours.
  if (input.isReply) return allow("reply", false);

  // 3. Transactionnel : accusé d'une action que l'élève vient de faire.
  if (TRANSACTIONAL_PURPOSES.has(purpose)) {
    return allow("transactional", false);
  }

  // 4. Le mute coupe le proactif — et RIEN d'autre (la garde 2 est passée).
  if (input.muted) return block("muted");

  // 5. « Priorité état à la livraison » : le message a été composé pour un état
  //    qui n'est plus vrai. Il ne part pas, et il ne consomme rien.
  if (input.composedStateStillValid === false) {
    return block("composed_state_stale");
  }

  // 6. Conversation active : aucun plafond. Ce n'est pas la fenêtre Meta —
  //    c'est le constat qu'un échange est en cours.
  if (isConversationActive(input.lastInboundAtIso, input.nowIso)) {
    return allow("conversation_active", false);
  }

  // 7. Envois programmés acceptés : allocation SÉPARÉE, dans les deux sens.
  //    Ils ne consomment pas le plafond non sollicité et il ne les bloque pas.
  if (OPT_IN_PURPOSES.has(purpose)) {
    if (input.optInSentToday >= DAILY_OPT_IN_CAP) {
      return block("opt_in_daily_cap");
    }
    return allow("opt_in_scheduled", false);
  }

  // 8. Les bilans garantis partent toujours — mais ils COMPTENT.
  //    `countsAsUnsolicited: true` (ils consomment un créneau) et
  //    `subjectToCap: false` (le plafond ne peut pas les refuser). Voir le
  //    commentaire de `DeliveryDecision`.
  if (GUARANTEED_PURPOSES.has(purpose)) {
    return allow("guaranteed", true, false);
  }

  // 9. Le plafond non sollicité, bilans attendus réservés.
  //    `Math.min` sur le plafond : un jour à 3 bilans attendus (impossible
  //    aujourd'hui, possible demain) ne doit pas rendre le budget NÉGATIF et
  //    bloquer même les bilans eux-mêmes.
  const reserved = Math.min(
    DAILY_UNSOLICITED_CAP,
    Math.max(0, input.guaranteedExpectedToday),
  );
  const budget = DAILY_UNSOLICITED_CAP - reserved;
  if (input.unsolicitedSentToday >= budget) {
    return block("unsolicited_daily_cap");
  }
  return allow("unsolicited_within_cap", true, true);
}
