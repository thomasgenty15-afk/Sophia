/**
 * LA LIVRAISON IN-APP — écrire le message, remplir le ledger, laisser Realtime faire.
 *
 * ── CE QUI REMPLACE QUOI ─────────────────────────────────────────────────────
 * `whatsapp-send` faisait quatre choses : décider (gardes + plafonds), rendre
 * (templates), envoyer (Graph), tracer (ledger + retries). Ici il n'en reste
 * que deux, et elles sont séparées :
 *   - décider   → `delivery_policy.ts`, pur, testable sans base ;
 *   - écrire    → ce fichier.
 *
 * Rendre et envoyer disparaissent : la livraison in-app EST une écriture. C'est
 * pourquoi il n'y a pas de retry ici. Un INSERT qui échoue a échoué ; le
 * rejouer sans clé d'idempotence produirait un doublon, ce qui est pire que
 * l'absence. `process-whatsapp-outbound-retries` meurt sans successeur.
 *
 * ── LE LEDGER CONSIGNE AUSSI LES REFUS ───────────────────────────────────────
 * Un message bloqué par un plafond écrit une ligne `status='skipped'` avec son
 * motif. Sans ça, « ce cron n'a rien envoyé » et « ce cron a tout fait bloquer
 * par un plafond » sont indiscernables dans la base — et c'est exactement le
 * défaut qui a laissé trois `403` quotidiens passer pour un jour sans élève à
 * relancer (`internal_send.ts`, en-tête).
 *
 * ── LE TEMPS RÉEL EST UNE CONSÉQUENCE, PAS UN APPEL ──────────────────────────
 * Aucune publication explicite : `chat_messages` est dans la publication
 * `supabase_realtime` (migration `20260804120000`) et la RLS `select_own` fait
 * le filtrage. Un message écrit EST un message livré. C'est la propriété qui
 * rend le proactif in-app trivial là où il demandait un template payant.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  DAILY_UNSOLICITED_CAP,
  decideChatDelivery,
  type DeliveryDecision,
  GUARANTEED_PURPOSES,
  OPT_IN_PURPOSES,
} from "./delivery_policy.ts";
import { localDateFor } from "../keel/reengagement_io.ts";

/** Le scope des messages du canal in-app. Un seul, partout. */
export const CHAT_SCOPE = "app";

/** Un bouton de réponse rapide rendu sous le message. */
export type ChatButton = {
  /** Identifiant EXACT, déterministe. Jamais interprété par un LLM. */
  payload: string;
  label: string;
};

export type DeliverChatMessageParams = {
  userId: string;
  content: string;
  /** Sert aux plafonds ET au journal. Vide pour une réponse de conversation. */
  purpose?: string;
  /** `true` quand le message répond au tour que l'élève vient d'envoyer. */
  isReply?: boolean;
  /** Les boutons arment la question (voir `armed_question.ts`). */
  buttons?: ChatButton[];
  /** `false` = composé pour un état qui n'existe plus ⇒ ne part pas. */
  composedStateStillValid?: boolean | null;
  requestId?: string;
  /** Fusionné dans `chat_messages.metadata`. */
  metadata?: Record<string, unknown>;
  /** Injectable pour les tests. */
  now?: Date;
};

export type DeliverChatMessageResult = {
  delivered: boolean;
  reason: string;
  /** `chat_messages.id` quand livré. */
  chatMessageId: string | null;
  /** `outbound_messages.id` — présent même quand refusé. */
  outboundId: string | null;
};

type ProfileRow = {
  timezone?: string | null;
  chat_last_inbound_at?: string | null;
  proactive_muted_at?: string | null;
  deletion_requested_at?: string | null;
};

/**
 * LE JOUR LOCAL EST UNE CHAÎNE ÉCRITE SUR LA LIGNE, PAS UN INTERVALLE RECALCULÉ.
 *
 * Chaque livraison porte `metadata.local_date`, calculée UNE fois par
 * `localDateFor`. Compter, c'est comparer des chaînes — côté TS comme côté SQL
 * (`claim_in_app_outbound`). Un intervalle UTC aurait obligé les deux côtés à
 * résoudre le décalage du jour concerné, et deux calculs de « quel jour est-il
 * pour cet élève » ont déjà produit, dans ce dépôt, une clé
 * `(user_id, local_date)` qui ne se rejoignait jamais.
 */
async function countDeliveredToday(
  admin: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    /** `true` = les non sollicités ; sinon on filtre sur les purposes donnés. */
    unsolicitedOnly?: boolean;
    purposes?: string[];
  },
): Promise<number> {
  let query = admin
    .from("outbound_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("delivery_channel", "in_app")
    .eq("status", "sent")
    .filter("metadata->>local_date", "eq", args.localDate);
  if (args.unsolicitedOnly) {
    query = query.filter("metadata->>counts_as_unsolicited", "eq", "true");
  }
  if (args.purposes && args.purposes.length > 0) {
    query = query.filter(
      "metadata->>purpose",
      "in",
      `(${args.purposes.join(",")})`,
    );
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function utcDayBoundsForLocalDate(
  localDate: string,
  timezone: string | null,
): { startIso: string; endIso: string } {
  // Utilisé UNIQUEMENT pour présélectionner des `scheduled_checkins`, dont la
  // colonne est un vrai instant : la borne est large (±14 h couvre UTC−12…+14)
  // et la date locale exacte est recalculée ligne par ligne juste après. Ici
  // sur-compter fait RÉSERVER un créneau de plus, donc fait taire — le côté sûr.
  const dayMs = 24 * 60 * 60 * 1000;
  const midnightUtc = Date.parse(`${localDate}T00:00:00.000Z`);
  const slack = String(timezone ?? "").trim() ? 14 * 60 * 60 * 1000 : 0;
  return {
    startIso: new Date(midnightUtc - slack).toISOString(),
    endIso: new Date(midnightUtc + dayMs + slack).toISOString(),
  };
}

/**
 * Combien de bilans garantis sont ATTENDUS aujourd'hui — ils réservent leurs
 * créneaux dans le plafond. Compte les envois déjà partis ET les créneaux
 * planifiés encore ouverts, sans doublonner.
 */
async function countGuaranteedExpectedToday(
  admin: SupabaseClient,
  args: { userId: string; timezone: string | null; localDate: string },
): Promise<number> {
  const { startIso, endIso } = utcDayBoundsForLocalDate(
    args.localDate,
    args.timezone,
  );
  const { data, error } = await admin
    .from("scheduled_checkins")
    .select("id,scheduled_for,event_context")
    .eq("user_id", args.userId)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .gte("scheduled_for", startIso)
    .lt("scheduled_for", endIso);
  if (error) {
    // Une table de planification illisible ne doit pas faire échouer une
    // livraison : le repli est 0 réservation, c'est-à-dire le budget PLEIN.
    // Choix assumé de disponibilité, journalisé fort — même arbitrage que le
    // fail-open des contraintes de sécurité, et pour la même raison.
    console.warn(JSON.stringify({
      tag: "chat_delivery_guaranteed_count_failed",
      user_id: args.userId,
      error: error.message,
    }));
    return 0;
  }
  const rows = (data ?? []) as Array<
    { scheduled_for?: string; event_context?: string | null }
  >;
  return rows.filter((row) =>
    row.scheduled_for &&
    localDateFor(new Date(row.scheduled_for), args.timezone) === args.localDate
  ).length;
}

async function loadProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await admin
    .from("profiles")
    .select(
      "timezone,chat_last_inbound_at,proactive_muted_at,deletion_requested_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ProfileRow | null;
}

/**
 * Écrit la ligne de ledger — et, quand le message consomme un créneau, RÉSERVE
 * ce créneau dans la même transaction.
 *
 * Rend `null` quand la réservation a échoué (un autre envoi simultané a pris le
 * dernier créneau). C'est le SEUL endroit où le plafond est réellement opposable
 * : le compte fait plus haut en TS sert à donner un motif tôt et à éviter un
 * aller-retour, il ne garantit rien sous concurrence (mesuré : 6/6 livrés pour
 * un plafond de 2 avant cette fonction).
 */
async function writeOutboundRow(
  admin: SupabaseClient,
  args: {
    userId: string;
    requestId: string | null;
    contentPreview: string;
    status: "sent" | "skipped";
    decision: DeliveryDecision;
    purpose: string;
    buttons: ChatButton[];
    chatMessageId: string | null;
    localDate: string;
  },
): Promise<{ id: string | null; capRejected: boolean; claimFailed: boolean }> {
  // `subjectToCap`, PAS `countsAsUnsolicited` : un bilan consomme un créneau
  // sans être opposable au plafond. Confondre les deux refusait le bilan du
  // soir dès que deux nudges étaient partis (voir `DeliveryDecision`).
  const enforceCap = args.status === "sent" && args.decision.subjectToCap;
  const { data, error } = await admin.rpc("claim_in_app_outbound", {
    p_user_id: args.userId,
    p_request_id: args.requestId,
    p_message_type: args.buttons.length > 0 ? "interactive_buttons" : "text",
    p_content_preview: args.contentPreview,
    p_status: args.status,
    p_last_error_code: args.status === "skipped" ? args.decision.reason : null,
    p_metadata: {
      purpose: args.purpose || null,
      delivery_reason: args.decision.reason,
      // Le compteur de plafond lit CE champ, pas le purpose : c'est la
      // décision qui dit ce qu'un message consomme, pas son étiquette.
      counts_as_unsolicited: args.decision.countsAsUnsolicited,
      local_date: args.localDate,
      chat_message_id: args.chatMessageId,
      buttons: args.buttons.map((b) => b.payload),
    },
    p_enforce_cap: enforceCap,
    p_cap: DAILY_UNSOLICITED_CAP,
    p_local_date: args.localDate,
  });
  if (error) {
    // Rater la réservation N'EST PAS « le plafond a mordu ». Les deux
    // empêchent la livraison, mais un 502 de Kong consigné en
    // `unsolicited_daily_cap` est un mensonge dans le ledger — et un ledger
    // qui ment est pire qu'un ledger vide, parce qu'on le croit.
    //
    // Mesuré : la passe de concurrence a produit exactement ce cas
    // (« An invalid response was received from the upstream server » sur un
    // appel RPC simultané), et le premier jet l'avait rangé sous le plafond.
    console.warn(JSON.stringify({
      tag: "chat_delivery_claim_failed",
      user_id: args.userId,
      enforce_cap: enforceCap,
      error: error.message,
    }));
    // Fail-closed quand la réservation était en jeu : on ne peut pas conclure
    // qu'un créneau était libre, donc on ne livre pas.
    return { id: null, capRejected: false, claimFailed: enforceCap };
  }
  const id = String(data ?? "") || null;
  return {
    id,
    capRejected: enforceCap && !id,
    claimFailed: !enforceCap && !id,
  };
}

/**
 * Livre un message de Sophia dans la bulle de l'élève.
 *
 * Ordre : charger l'état → décider → écrire (ou consigner le refus).
 * L'écriture de `chat_messages` vient AVANT celle du ledger : c'est elle qui
 * déclenche Realtime, et c'est elle que l'élève voit.
 */
/**
 * PRÉ-VÉRIFICATION DE LIVRAISON — même décision, sans rien écrire.
 *
 * Elle existe pour un défaut MESURÉ (QA phase C, 2026-08-06) : la relance de
 * réengagement ouvrait son épisode, chargeait la doctrine du coach et appelait
 * un modèle pour composer son corps — et découvrait SEULEMENT ensuite que le
 * plafond de messages non sollicités du jour était atteint. Un tick réel a
 * jeté 8 appels et 8 221 tokens de cette façon, et le job tourne toutes les
 * heures.
 *
 * UNE SEULE SOURCE DE VÉRITÉ. Cette fonction appelle exactement le même
 * `decideChatDelivery` que `deliverChatMessage`, avec les mêmes compteurs. Elle
 * ne remplace pas la décision finale : l'appelant compose seulement si elle dit
 * oui, et c'est `deliverChatMessage` qui tranche pour de bon (l'état peut avoir
 * bougé entre les deux, et c'est acceptable — le pire cas retombe sur le
 * comportement d'avant).
 *
 * Aucune ligne de ledger n'est écrite ici : un refus de PRÉ-vérification n'est
 * pas un envoi refusé, c'est un envoi jamais tenté.
 */
export async function probeChatDelivery(
  admin: SupabaseClient,
  params: { userId: string; purpose: string; now?: Date },
): Promise<{ deliver: boolean; reason: string }> {
  try {
    const now = params.now ?? new Date();
    const profile = await loadProfile(admin, params.userId);
    // Pas de profil lisible ⇒ on NE tranche PAS ici. La pré-vérification n'a
    // qu'un seul mandat (le plafond); tout le reste appartient à
    // `deliverChatMessage`, qui refusera proprement et écrira son ledger.
    if (!profile) return { deliver: true, reason: "probe_unavailable" };
    const timezone = String(profile.timezone ?? "").trim() || null;
    const localDate = localDateFor(now, timezone);
    const [unsolicitedSentToday, optInSentToday, guaranteedExpectedToday] =
      await Promise.all([
        countDeliveredToday(admin, {
          userId: params.userId,
          localDate,
          unsolicitedOnly: true,
        }),
        countDeliveredToday(admin, {
          userId: params.userId,
          localDate,
          purposes: [...OPT_IN_PURPOSES],
        }),
        countGuaranteedExpectedToday(admin, {
          userId: params.userId,
          timezone,
          localDate,
        }),
      ]);
    const decision = decideChatDelivery({
      purpose: String(params.purpose ?? "").trim(),
      isReply: false,
      lastInboundAtIso: profile.chat_last_inbound_at ?? null,
      nowIso: now.toISOString(),
      muted: Boolean(profile.proactive_muted_at),
      deletionPending: Boolean(profile.deletion_requested_at),
      composedStateStillValid: null,
      unsolicitedSentToday,
      guaranteedExpectedToday,
      optInSentToday,
    });
    return { deliver: decision.deliver, reason: decision.reason };
  } catch {
    // FAIL-OPEN ASSUMÉ: une pré-vérification qui échoue ne doit pas empêcher
    // un envoi légitime. `deliverChatMessage` reste le juge.
    return { deliver: true, reason: "probe_unavailable" };
  }
}

export async function deliverChatMessage(
  admin: SupabaseClient,
  params: DeliverChatMessageParams,
): Promise<DeliverChatMessageResult> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const purpose = String(params.purpose ?? "").trim();
  const buttons = params.buttons ?? [];
  const content = String(params.content ?? "").trim();

  if (!content) {
    return {
      delivered: false,
      reason: "empty_content",
      chatMessageId: null,
      outboundId: null,
    };
  }

  const profile = await loadProfile(admin, params.userId);
  if (!profile) {
    // Pattern (a) « prémisse fausse » : l'élève n'existe pas / a été purgé.
    // Aucune ligne de ledger : il n'y a pas de propriétaire à qui l'attacher,
    // et la FK la refuserait de toute façon.
    return {
      delivered: false,
      reason: "unknown_user",
      chatMessageId: null,
      outboundId: null,
    };
  }

  const timezone = String(profile.timezone ?? "").trim() || null;
  const localDate = localDateFor(now, timezone);
  const isReply = params.isReply === true;

  // Les compteurs ne sont chargés QUE si une décision peut en dépendre. Un
  // simple aller-retour de conversation ne doit pas coûter trois requêtes.
  const needsCounters = !isReply;
  const [unsolicitedSentToday, optInSentToday, guaranteedExpectedToday] =
    needsCounters
      ? await Promise.all([
        countDeliveredToday(admin, {
          userId: params.userId,
          localDate,
          unsolicitedOnly: true,
        }),
        countDeliveredToday(admin, {
          userId: params.userId,
          localDate,
          purposes: [...OPT_IN_PURPOSES],
        }),
        countGuaranteedExpectedToday(admin, {
          userId: params.userId,
          timezone,
          localDate,
        }),
      ])
      : [0, 0, 0];

  const decision = decideChatDelivery({
    purpose,
    isReply,
    lastInboundAtIso: profile.chat_last_inbound_at ?? null,
    nowIso,
    muted: Boolean(profile.proactive_muted_at),
    deletionPending: Boolean(profile.deletion_requested_at),
    composedStateStillValid: params.composedStateStillValid ?? null,
    unsolicitedSentToday,
    guaranteedExpectedToday,
    optInSentToday,
  });

  if (!decision.deliver) {
    const skipped = await writeOutboundRow(admin, {
      userId: params.userId,
      requestId: params.requestId ?? null,
      contentPreview: content,
      status: "skipped",
      decision,
      purpose,
      buttons,
      chatMessageId: null,
      localDate,
    });
    return {
      delivered: false,
      reason: decision.reason,
      chatMessageId: null,
      outboundId: skipped.id,
    };
  }

  // ── LA RÉSERVATION VIENT AVANT LE MESSAGE VISIBLE ─────────────────────────
  // Inverser les deux rendrait le plafond décoratif : un message refusé par la
  // réservation aurait déjà été vu par l'élève. On paie une ligne de ledger
  // orpheline en cas d'échec de l'INSERT suivant — un ledger qui sur-compte
  // fait taire, ce qui est le côté sûr d'un anti-spam.
  const claim = await writeOutboundRow(admin, {
    userId: params.userId,
    requestId: params.requestId ?? null,
    contentPreview: content,
    status: "sent",
    decision,
    purpose,
    buttons,
    chatMessageId: null,
    localDate,
  });
  if (claim.capRejected || claim.claimFailed) {
    // Deux motifs DISTINCTS, jamais confondus :
    //   - `unsolicited_daily_cap` : un autre envoi simultané a pris le dernier
    //     créneau. C'est le plafond qui a fonctionné.
    //   - `delivery_claim_failed` : la réservation n'a pas pu être faite (base
    //     ou passerelle). On ne sait pas s'il restait de la place ; on ne livre
    //     pas, et on le DIT.
    const rejected: DeliveryDecision = {
      deliver: false,
      reason: claim.capRejected
        ? "unsolicited_daily_cap"
        : "delivery_claim_failed",
      countsAsUnsolicited: false,
      subjectToCap: false,
    };
    const skipped = await writeOutboundRow(admin, {
      userId: params.userId,
      requestId: params.requestId ?? null,
      contentPreview: content,
      status: "skipped",
      decision: rejected,
      purpose,
      buttons,
      chatMessageId: null,
      localDate,
    });
    return {
      delivered: false,
      reason: rejected.reason,
      chatMessageId: null,
      outboundId: skipped.id,
    };
  }

  const { data: inserted, error: insertError } = await admin
    .from("chat_messages")
    .insert({
      user_id: params.userId,
      scope: CHAT_SCOPE,
      role: "assistant",
      content,
      agent_used: "companion",
      created_at: nowIso,
      metadata: {
        ...(params.metadata ?? {}),
        channel: "in_app",
        purpose: purpose || null,
        is_proactive: !isReply,
        delivery_reason: decision.reason,
        request_id: params.requestId ?? null,
        // Les boutons voyagent AVEC le message : c'est ce qui les rend
        // rejouables au reload, là où un template Meta les perdait.
        buttons: buttons.map((b) => ({ payload: b.payload, label: b.label })),
      },
    } as never)
    .select("id")
    .maybeSingle();
  if (insertError) throw insertError;

  const chatMessageId = String((inserted as { id?: string } | null)?.id ?? "") ||
    null;

  // La FRAÎCHEUR DU SALUT. `process-checkins` compare dernier entrant et
  // dernier sortant pour décider si Sophia dit « bonjour » ou reprend une
  // conversation en cours. Sans cette écriture, la colonne resterait figée et
  // chaque élève passerait pour éternellement absent — l'exact symétrique du
  // défaut d'opt-in, mais qui fait se RÉPÉTER au lieu de faire taire.
  //
  // Best-effort: rater cette trace ne défait pas une livraison déjà reçue.
  const { error: freshnessError } = await admin
    .from("profiles")
    .update({ chat_last_outbound_at: nowIso } as never)
    .eq("id", params.userId);
  if (freshnessError) {
    console.warn(JSON.stringify({
      tag: "chat_delivery_freshness_update_failed",
      user_id: params.userId,
      error: freshnessError.message,
    }));
  }

  // Le ledger apprend à quel message visible il correspond. Best-effort: la
  // livraison a eu lieu, l'élève l'a reçue, et rater ce lien ne la défait pas.
  if (claim.id && chatMessageId) {
    const { error: linkError } = await admin
      .from("outbound_messages")
      .update({
        metadata: {
          purpose: purpose || null,
          delivery_reason: decision.reason,
          counts_as_unsolicited: decision.countsAsUnsolicited,
          local_date: localDate,
          chat_message_id: chatMessageId,
          buttons: buttons.map((b) => b.payload),
        },
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", claim.id);
    if (linkError) {
      console.warn(JSON.stringify({
        tag: "chat_delivery_ledger_link_failed",
        user_id: params.userId,
        outbound_id: claim.id,
        error: linkError.message,
      }));
    }
  }

  return {
    delivered: true,
    reason: decision.reason,
    chatMessageId,
    outboundId: claim.id,
  };
}

/** Réexport pour les appelants qui n'ont besoin que des ensembles de purposes. */
export { GUARANTEED_PURPOSES, OPT_IN_PURPOSES };
