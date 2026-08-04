// La politique de livraison in-app — épreuve de fonctionnement + adversariale.
//
// Les tests qui portent une décision produit :
//   * « un élève muté reçoit toujours la RÉPONSE à ce qu'il écrit » — couper la
//     réponse de quelqu'un qui parle, c'est le punir d'avoir demandé le silence ;
//   * « les bilans réservent leur créneau au lieu de s'y ajouter » ;
//   * « un état composé périmé ne consomme aucun créneau » ;
//   * « un dernier entrant dans le futur n'ouvre pas une conversation ».

import { assertEquals } from "jsr:@std/assert@1";

import {
  ACTIVE_CONVERSATION_WINDOW_MS,
  DAILY_OPT_IN_CAP,
  DAILY_UNSOLICITED_CAP,
  decideChatDelivery,
  type DeliveryDecisionInput,
  isConversationActive,
} from "./delivery_policy.ts";

const NOW = "2026-08-04T20:00:00.000Z";

function input(patch: Partial<DeliveryDecisionInput> = {}): DeliveryDecisionInput {
  return {
    purpose: "keel_nudge",
    isReply: false,
    lastInboundAtIso: null,
    nowIso: NOW,
    muted: false,
    deletionPending: false,
    composedStateStillValid: null,
    unsolicitedSentToday: 0,
    guaranteedExpectedToday: 0,
    optInSentToday: 0,
    ...patch,
  };
}

function isoMinus(ms: number): string {
  return new Date(Date.parse(NOW) - ms).toISOString();
}

// ── FENÊTRE DE CONVERSATION ─────────────────────────────────────────────────

Deno.test("conversation active: bornes exactes", () => {
  assertEquals(isConversationActive(null, NOW), false);
  assertEquals(isConversationActive(isoMinus(0), NOW), true);
  assertEquals(isConversationActive(isoMinus(ACTIVE_CONVERSATION_WINDOW_MS), NOW), true);
  assertEquals(isConversationActive(isoMinus(ACTIVE_CONVERSATION_WINDOW_MS + 1), NOW), false);
});

Deno.test("un dernier entrant DANS LE FUTUR n'ouvre pas une conversation", () => {
  // Sans le refus explicite, `now - last` est négatif et passe le seuil: une
  // horloge client désaccordée aurait désarmé tous les plafonds.
  assertEquals(isConversationActive("2026-08-05T00:00:00.000Z", NOW), false);
});

Deno.test("dates illisibles: pas de conversation, pas d'exception", () => {
  assertEquals(isConversationActive("pas une date", NOW), false);
  assertEquals(isConversationActive(NOW, "pas une date"), false);
});

// ── ORDRE DES GARDES ────────────────────────────────────────────────────────

Deno.test("suppression de compte: tout est coupé sauf la confirmation", () => {
  assertEquals(decideChatDelivery(input({ deletionPending: true })).reason, "deletion_pending");
  // Même une réponse directe est coupée: la garde 1 est AVANT la garde 2.
  assertEquals(decideChatDelivery(input({ deletionPending: true, isReply: true })).reason, "deletion_pending");
  const confirmation = decideChatDelivery(input({
    deletionPending: true,
    purpose: "account_deletion_confirmed",
  }));
  assertEquals(confirmation.deliver, true);
  assertEquals(confirmation.reason, "transactional");
});

Deno.test("MUTÉ: le proactif s'arrête, la conversation directe MARCHE toujours", () => {
  // Le test qui porte la décision produit. Edge case n°6 du prompt.
  const proactive = decideChatDelivery(input({ muted: true }));
  assertEquals(proactive.deliver, false);
  assertEquals(proactive.reason, "muted");

  const reply = decideChatDelivery(input({ muted: true, isReply: true }));
  assertEquals(reply.deliver, true);
  assertEquals(reply.reason, "reply");

  // Et les bilans garantis sont bien coupés eux aussi: « garanti » n'a jamais
  // voulu dire « malgré un refus explicite de l'élève ».
  assertEquals(
    decideChatDelivery(input({ muted: true, purpose: "keel_daily_pulse" })).deliver,
    false,
  );
  // Un accusé transactionnel, en revanche, n'est pas une relance.
  assertEquals(
    decideChatDelivery(input({ muted: true, purpose: "subscription_confirmed" })).deliver,
    true,
  );
});

Deno.test("une réponse ne traverse aucun plafond", () => {
  const d = decideChatDelivery(input({
    isReply: true,
    unsolicitedSentToday: 99,
    guaranteedExpectedToday: 99,
  }));
  assertEquals(d.deliver, true);
  assertEquals(d.countsAsUnsolicited, false);
});

Deno.test("état composé périmé: bloqué ET ne consomme aucun créneau", () => {
  // Edge case n°10: plan archivé entre la composition et la livraison.
  const d = decideChatDelivery(input({ composedStateStillValid: false }));
  assertEquals(d.deliver, false);
  assertEquals(d.reason, "composed_state_stale");
  assertEquals(d.countsAsUnsolicited, false);
  // `null` = rien à vérifier, pas « invalide ».
  assertEquals(decideChatDelivery(input({ composedStateStillValid: null })).deliver, true);
  assertEquals(decideChatDelivery(input({ composedStateStillValid: true })).deliver, true);
});

// ── PLAFONDS ────────────────────────────────────────────────────────────────

Deno.test("conversation active: aucun plafond", () => {
  const d = decideChatDelivery(input({
    lastInboundAtIso: isoMinus(60_000),
    unsolicitedSentToday: 50,
  }));
  assertEquals(d.deliver, true);
  assertEquals(d.reason, "conversation_active");
  assertEquals(d.countsAsUnsolicited, false);
});

Deno.test("hors conversation: le plafond non sollicité mord à la bonne valeur", () => {
  for (let sent = 0; sent < DAILY_UNSOLICITED_CAP; sent += 1) {
    const d = decideChatDelivery(input({ unsolicitedSentToday: sent }));
    assertEquals(d.deliver, true, `sent=${sent}`);
    assertEquals(d.countsAsUnsolicited, true);
  }
  const blocked = decideChatDelivery(input({ unsolicitedSentToday: DAILY_UNSOLICITED_CAP }));
  assertEquals(blocked.deliver, false);
  assertEquals(blocked.reason, "unsolicited_daily_cap");
});

Deno.test("les bilans attendus RÉSERVENT leur créneau au lieu de s'y ajouter", () => {
  // 1 bilan attendu → budget non sollicité = 1.
  assertEquals(decideChatDelivery(input({ guaranteedExpectedToday: 1, unsolicitedSentToday: 0 })).deliver, true);
  assertEquals(decideChatDelivery(input({ guaranteedExpectedToday: 1, unsolicitedSentToday: 1 })).deliver, false);
  // 2 bilans attendus → budget = 0, aucun nudge de plus ce jour-là.
  assertEquals(decideChatDelivery(input({ guaranteedExpectedToday: 2, unsolicitedSentToday: 0 })).deliver, false);
});

Deno.test("les bilans eux-mêmes partent TOUJOURS, même à budget saturé", () => {
  // La règle qui compte: réserver un créneau ne doit jamais bloquer celui pour
  // qui on l'a réservé. Un `guaranteedExpectedToday` absurde ne doit pas rendre
  // le budget négatif au point de bloquer le bilan.
  for (const expected of [0, 1, 2, 5, 99]) {
    const d = decideChatDelivery(input({
      purpose: "keel_daily_pulse",
      guaranteedExpectedToday: expected,
      unsolicitedSentToday: 99,
    }));
    assertEquals(d.deliver, true, `expected=${expected}`);
    assertEquals(d.reason, "guaranteed");
    assertEquals(d.countsAsUnsolicited, true);
  }
});

Deno.test("CONSOMMER un créneau et ÊTRE OPPOSABLE au plafond sont deux choses", () => {
  // Le test qui pin le défaut trouvé par l'épreuve de réel: passer
  // `countsAsUnsolicited` à la réservation atomique comme s'il valait « soumis
  // au plafond » refusait le bilan du soir après deux nudges — précisément le
  // message que la réservation de créneaux existe pour protéger.
  const guaranteed = decideChatDelivery(input({ purpose: "keel_daily_pulse" }));
  assertEquals(guaranteed.countsAsUnsolicited, true, "un bilan consomme un créneau");
  assertEquals(guaranteed.subjectToCap, false, "un bilan n'est jamais refusé par le plafond");

  const nudge = decideChatDelivery(input({ purpose: "keel_nudge" }));
  assertEquals(nudge.countsAsUnsolicited, true);
  assertEquals(nudge.subjectToCap, true, "un nudge, lui, est opposable");

  // Tout le reste ne consomme rien et n'est opposable à rien.
  for (const d of [
    decideChatDelivery(input({ isReply: true })),
    decideChatDelivery(input({ purpose: "subscription_confirmed" })),
    decideChatDelivery(input({ purpose: "keel_slot_reminder" })),
    decideChatDelivery(input({ lastInboundAtIso: isoMinus(1000) })),
  ]) {
    assertEquals(d.countsAsUnsolicited, false, d.reason);
    assertEquals(d.subjectToCap, false, d.reason);
  }
});

Deno.test("un refus n'est jamais opposable ni consommateur", () => {
  for (const d of [
    decideChatDelivery(input({ deletionPending: true })),
    decideChatDelivery(input({ muted: true })),
    decideChatDelivery(input({ composedStateStillValid: false })),
    decideChatDelivery(input({ unsolicitedSentToday: DAILY_UNSOLICITED_CAP })),
    decideChatDelivery(input({ purpose: "keel_slot_reminder", optInSentToday: DAILY_OPT_IN_CAP })),
  ]) {
    assertEquals(d.deliver, false, d.reason);
    assertEquals(d.countsAsUnsolicited, false, d.reason);
    assertEquals(d.subjectToCap, false, d.reason);
  }
});

Deno.test("un guaranteedExpectedToday négatif ne DÉBLOQUE pas le plafond", () => {
  // Une valeur aberrante venue d'un count raté ne doit pas AGRANDIR le budget.
  const d = decideChatDelivery(input({
    guaranteedExpectedToday: -5,
    unsolicitedSentToday: DAILY_UNSOLICITED_CAP,
  }));
  assertEquals(d.deliver, false);
});

Deno.test("envois acceptés: allocation séparée dans LES DEUX sens", () => {
  // Le plafond non sollicité saturé ne les bloque pas...
  const d = decideChatDelivery(input({
    purpose: "keel_slot_reminder",
    unsolicitedSentToday: 99,
    guaranteedExpectedToday: 2,
  }));
  assertEquals(d.deliver, true);
  assertEquals(d.reason, "opt_in_scheduled");
  // ...et ils ne le consomment pas.
  assertEquals(d.countsAsUnsolicited, false);

  // Mais ils ont leur propre borne.
  assertEquals(
    decideChatDelivery(input({ purpose: "keel_slot_reminder", optInSentToday: DAILY_OPT_IN_CAP - 1 })).deliver,
    true,
  );
  const capped = decideChatDelivery(input({ purpose: "keel_slot_reminder", optInSentToday: DAILY_OPT_IN_CAP }));
  assertEquals(capped.deliver, false);
  assertEquals(capped.reason, "opt_in_daily_cap");
});

Deno.test("un purpose inconnu tombe dans le plafond non sollicité, pas hors plafond", () => {
  // Pattern (g) du gantelet: le défaut silencieux. Un purpose non mappé ne doit
  // pas s'échapper des plafonds parce qu'il n'est dans aucun ensemble.
  const d = decideChatDelivery(input({ purpose: "purpose_qui_n_existe_pas", unsolicitedSentToday: DAILY_UNSOLICITED_CAP }));
  assertEquals(d.deliver, false);
  assertEquals(d.reason, "unsolicited_daily_cap");
});

Deno.test("purpose vide ou absent: même traitement, jamais une exception", () => {
  assertEquals(decideChatDelivery(input({ purpose: "" })).deliver, true);
  assertEquals(
    decideChatDelivery(input({ purpose: "   ", unsolicitedSentToday: DAILY_UNSOLICITED_CAP })).reason,
    "unsolicited_daily_cap",
  );
});

// ── ÉTAT VIDE (pattern (f) du gantelet) ─────────────────────────────────────

Deno.test("élève qui n'a JAMAIS écrit: pas de conversation, plafonds actifs", () => {
  const d = decideChatDelivery(input({ lastInboundAtIso: null }));
  assertEquals(d.reason, "unsolicited_within_cap");
  assertEquals(
    decideChatDelivery(input({ lastInboundAtIso: null, unsolicitedSentToday: DAILY_UNSOLICITED_CAP })).deliver,
    false,
  );
});
