// FF-025 · L'ARMEMENT DE L'INVITATION À LA PHOTO — après l'écriture, jamais avant.
//
// Même forme, même place et même discipline que `armMealPrecisionQuestion`, et
// ce n'est pas une élégance: les deux surfaces partagent UN budget, et deux
// armements écrits différemment finiraient par consommer ce budget deux fois de
// deux manières.
//
// ── L'ORDRE EST LE CONTRAT ──────────────────────────────────────────────────
//   1. on n'évalue QUE ce que la base a rendu (`committed_effects`), et on lit
//      `plan_relation` sur la ligne RELUE. Une invitation adossée à un fait que
//      le dispatcher a demandé mais que l'intake a refusé parlerait d'un repas
//      qui n'existe pas — le défaut D1 de FF-009, par une autre porte;
//   2. le gate refuse pour une raison NOMMÉE;
//   3. la place du budget est CONSOMMÉE AVANT que l'invitation ne parte. Si
//      l'inscription échoue, l'invitation ne part pas: mieux vaut une
//      invitation perdue qu'un budget qui ne plafonne rien.
//
// ── POURQUOI AVANT LA QUESTION DE PRÉCISION, DANS LE TOUR ───────────────────
// Les deux lisent le budget avant qu'aucune n'écrive, donc l'ordre d'appel EST
// l'arbitrage. L'invitation passe d'abord sur un repas hors plan, et c'est un
// arbitrage produit assumé: une photo répond à la composition, à la
// préparation et à l'accompagnement d'un seul geste de trois secondes, là où la
// question textuelle n'ouvre qu'un axe et demande une phrase. Sur tout le
// reste (repas conforme, relation inconnue), le gate rend `not_off_plan` en
// premier refus et la question de précision garde la main entière.
//
// La cohérence est en plus tenue par le schéma: l'index unique
// `(user_id, asked_for_message_id)` fait que la seconde surface à s'inscrire
// pour le MÊME message reçoit `alreadyRecorded`, donc se tait — l'arbitrage ne
// dépend pas d'un verrou applicatif qu'on pourrait oublier de poser.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  countDailyAsks,
  DAILY_ASK_BUDGET,
  hasEverAsked,
  recordDailyAsk,
} from "../../_shared/keel/daily_ask_budget.ts";
import { gatePhotoInvitation } from "../../_shared/keel/photo_invitation.ts";

export interface PhotoInvitationArmResult {
  /** La phrase à ajouter à la réponse, ou null. */
  sentence: string | null;
  /** true quand la variante éducative est partie (une fois par personne). */
  educating: boolean;
  /** L'événement auquel une photo à venir devra se rattacher. */
  invitedEventId: string | null;
  /** Nommé même quand on n'invite pas: le refus doit être lisible en trace. */
  reason_code: string;
}

/**
 * Un fait écrit par ce tour, réduit à ce dont l'invitation a besoin.
 *
 * `plan_relation` est la valeur que la BASE a rendue, relue par l'exécuteur —
 * jamais celle que le modèle a demandée.
 */
export interface CommittedOffPlanFact {
  protocol_event_id: string;
  plan_relation: string | null;
}

export async function armPhotoInvitation(args: {
  supabase: SupabaseClient;
  userId: string;
  /** R7 — la phrase part vers l'élève: elle porte la langue du tour. */
  responseLocale: string;
  committed: readonly CommittedOffPlanFact[];
  safetyBand: string | null | undefined;
  futureIntent: boolean;
  /**
   * `false` sur le chemin du cerveau, et c'est EXACT: une photo ne traverse pas
   * `sophia-brain`, elle passe par `meal-photo-upload-v1`. Le paramètre reste
   * requis parce que la garde, elle, doit exister le jour où un tour portera
   * une image — un paramètre de garde optionnel est une garde désarmée.
   */
  hasMedia: boolean;
  flowAlreadyOpen: boolean;
  localDate: string | null;
  sourceMessageId: string;
}): Promise<PhotoInvitationArmResult> {
  const committed = args.committed.filter((fact) =>
    String(fact.protocol_event_id ?? "").trim() !== ""
  );
  // LE FAIT HORS PLAN, et un seul: c'est celui auquel une photo se rattachera.
  // Le premier, parce que c'est l'ancre du repas pour un lecteur humain —
  // même choix que `linkToEventId` dans la lane de précision.
  const offPlan = committed.find((fact) =>
    String(fact.plan_relation ?? "").trim() === "off_plan"
  ) ?? null;

  const idle = (reason: string): PhotoInvitationArmResult => ({
    sentence: null,
    educating: false,
    invitedEventId: null,
    reason_code: reason,
  });

  // Le gate est joué une PREMIÈRE fois sans toucher la base: les refus qui ne
  // demandent aucune lecture (safety, intention, photo jointe, pas hors plan,
  // flow ouvert) doivent coûter zéro aller-retour. Même patron que
  // `armMealPrecisionQuestion`.
  const cheapGate = gatePhotoInvitation({
    locale: args.responseLocale,
    planRelation: offPlan?.plan_relation ?? null,
    safetyBand: args.safetyBand,
    hasMedia: args.hasMedia,
    futureIntent: args.futureIntent,
    committedEventCount: committed.length,
    asksMadeToday: 0,
    alreadyInvitedEver: true,
    flowAlreadyOpen: args.flowAlreadyOpen,
    budget: DAILY_ASK_BUDGET,
  });
  if (!cheapGate.invite) return idle(cheapGate.reason_code);

  const localDate = String(args.localDate ?? "").trim();
  const [count, ever] = await Promise.all([
    countDailyAsks(args.supabase, { userId: args.userId, localDate }),
    hasEverAsked(args.supabase, {
      userId: args.userId,
      kind: "photo_invitation",
    }),
  ]);
  const gate = gatePhotoInvitation({
    locale: args.responseLocale,
    planRelation: offPlan?.plan_relation ?? null,
    safetyBand: args.safetyBand,
    hasMedia: args.hasMedia,
    futureIntent: args.futureIntent,
    committedEventCount: committed.length,
    asksMadeToday: count.count,
    alreadyInvitedEver: ever.ever,
    flowAlreadyOpen: args.flowAlreadyOpen,
    budget: DAILY_ASK_BUDGET,
  });
  if (!gate.invite || gate.sentence === null) {
    return idle(`${gate.reason_code}:${count.reason}`);
  }

  // LA PLACE EST PRISE AVANT L'INVITATION.
  const recorded = await recordDailyAsk(args.supabase, {
    userId: args.userId,
    localDate,
    kind: "photo_invitation",
    // Le canal est le TOUR de conversation: ce n'est ni la question d'un repas
    // déclaré (`text`) ni celle d'une photo analysée (`photo`).
    source: "chat",
    // Une invitation n'a pas d'axe de précision, et le CHECK en base refuse
    // qu'on lui en invente un.
    axis: null,
    text: gate.sentence,
    protocolEventId: offPlan?.protocol_event_id ?? null,
    askedForMessageId: args.sourceMessageId,
  });
  if (!recorded.ok) return idle("budget_record_failed");
  if (recorded.alreadyRecorded) {
    // Rejeu du même message (502 de Kong, retry du client), ou une autre
    // surface qui a déjà pris la place de ce tour. L'invitation est déjà
    // partie une fois; la répéter serait la relance que R2 interdit.
    return idle("already_asked_for_this_message");
  }

  return {
    sentence: gate.sentence,
    educating: gate.educating,
    invitedEventId: offPlan?.protocol_event_id ?? null,
    reason_code: "invite",
  };
}
