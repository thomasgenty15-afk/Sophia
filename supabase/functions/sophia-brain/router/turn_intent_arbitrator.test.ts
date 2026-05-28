import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  arbitrateTurnIntent,
  detectsDurableCoachPreference,
  detectsExactDurableStatus,
  detectsExplicitNoStatusRequest,
  detectsExplicitOneShotReminderCreate,
  detectsExplicitProductHelp,
  detectsMultiEntityDurableStatus,
  detectsRecapRequest,
  looksLikeAttackCardSlotCorrection,
} from "./turn_intent_arbitrator.ts";

function routeDecision(
  overrides: Partial<RouteDecision> = {},
): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "tool_skill",
    selected_handler: "prepare_attack_card",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "test",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  };
}

function turnFrame(overrides: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "low", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [{
      operation_type: "prepare_attack_card",
      explicitness: "explicit",
      confidence_band: "high",
      ambiguity: "none",
      user_intent: "create",
    }],
    tool_skill_opportunity: {
      type: "attack_card",
      operation_type: "prepare_attack_card",
      surface_id: "attack_card",
      confidence_band: "high",
      should_offer: true,
      prop_reason: "test",
      source_span: null,
      target_hint: null,
      target_status: "identified",
      suggested_question_intent: "offer_attack_card",
      offer_timing: "now",
      must_not_execute: true,
    },
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
    ...overrides,
  };
}

Deno.test("central arbitrator routes explicit new one-shot reminder before active card", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Oui, crée un nouveau rappel à 11h25 avec le même texte, et garde l'ancien actif.",
    routeDecision: routeDecision(),
    turnFrame: turnFrame(),
    tempMemory: {
      __active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    },
    activeOperationIntake: { operation_type: "prepare_attack_card" },
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(result.routeDecision.direct_effects_to_run, [
    "create_one_shot_reminder",
  ]);
  assertEquals(
    result.turnFrame.direct_effects[0]?.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(result.tempMemory.__active_tool_skill_intake, undefined);
});

Deno.test("central arbitrator propagates raw_text in one_shot_reminder payload_hint", () => {
  // Régression 2026-05-28: payload_hint était {} vide, donc le runtime aval
  // (maybeCreateOneShotReminder) recevait une intent sans texte source et
  // ne créait pas le rappel (A4-r4 T8/T9). On vérifie que raw_text est
  // bien propagé pour que l'extracteur de payload aval ait de quoi lire.
  const userMessage =
    "Rappel ponctuel aujourd'hui à 11h12 : envoyer à Lina la synthèse nettoyée.";
  const result = arbitrateTurnIntent({
    userMessage,
    routeDecision: routeDecision({
      response_owner: "normal_reply",
      selected_handler: undefined,
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  const reminderEffect = result.turnFrame.direct_effects.find((effect) =>
    effect.effect_type === "create_one_shot_reminder"
  );
  assertEquals(reminderEffect?.effect_type, "create_one_shot_reminder");
  assertEquals(
    (reminderEffect?.payload_hint as { raw_text?: string })?.raw_text,
    userMessage,
  );
});

Deno.test("central arbitrator routes durable coach preference before product_help", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Préférence durable de coaching: quand je suis en vrac, une seule action.",
    routeDecision: routeDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "tool_skill");
  assertEquals(
    result.routeDecision.selected_handler,
    "update_coach_preferences",
  );
  assertEquals(
    result.turnFrame.tool_skill_intents[0]?.operation_type,
    "update_coach_preferences",
  );
});

Deno.test("central arbitrator routes explicit product help before status", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Si je veux vérifier ou annuler ce rappel dans l'app, je vais où ? Ne change rien.",
    routeDecision: routeDecision({
      response_owner: "normal_reply",
      selected_handler: undefined,
      reason_code: "status_only_request_blocks_tool_start",
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "product_help");
  assertEquals(result.routeDecision.selected_handler, "product_help");
});

Deno.test("central arbitrator routes exact durable status before product help", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Point rappels : est-ce que tu as vraiment enregistré 11h10, 11h25, les deux, ou aucun ?",
    routeDecision: routeDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_status_exact_priority",
  );
});

Deno.test("central arbitrator does NOT hijack an explicit attack card request that contains the word 'piège'", () => {
  // Régression A6-r2 T2 (2026-05-28): l'ancien detectsHumanRecap matchait
  // le mot 'piege' nu et supprimait l'intent prepare_attack_card du
  // turn_frame. Cette suppression a cassé la création de carte sur une
  // demande pourtant maximalement explicite ("prepare une carte d'attaque.
  // Action: ... Piège: ... Signal visuel: ... Phrase: ...").
  //
  // Aujourd'hui detectsHumanRecap est supprimé, mais on garde ce test
  // comme garde-fou: tout détecteur transitionnel ajouté à l'arbitre doit
  // continuer à passer ce test.
  const userMessage =
    "Oui, prepare une carte d'attaque. Action: envoyer trois lignes a Samir avant d'aligner le bureau. Piège: chercher une surface nette pour eviter d'ecrire. Signal visuel: le stylo bleu pose sur le clavier. Phrase: stylo bleu = trois lignes a Samir, pas de rangement.";
  const result = arbitrateTurnIntent({
    userMessage,
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    }),
    turnFrame: turnFrame(),
    tempMemory: {},
  });

  assertEquals(result.changed, false);
  assertEquals(result.routeDecision.response_owner, "tool_skill");
  assertEquals(
    result.routeDecision.selected_handler,
    "prepare_attack_card",
  );
  assertEquals(
    result.turnFrame.tool_skill_intents[0]?.operation_type,
    "prepare_attack_card",
  );
});

Deno.test("central arbitrator does NOT hijack an explicit attack card request that contains 'honte'", () => {
  // Même famille que le test précédent: l'ancien detectsHumanRecap matchait
  // aussi 'honte' nu. On vérifie que la demande de carte d'attaque structurée
  // passe quand 'honte' apparaît dans la définition de la carte.
  const userMessage =
    "Crée une carte d'attaque. Action: envoyer le message avant d'attendre. Piège: la honte qui me fait retarder. Signal: la sensation de chaleur dans la nuque. Phrase: je préfère envoyer maintenant.";
  const result = arbitrateTurnIntent({
    userMessage,
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    }),
    turnFrame: turnFrame(),
    tempMemory: {},
  });

  assertEquals(result.changed, false);
  assertEquals(result.routeDecision.response_owner, "tool_skill");
  assertEquals(
    result.routeDecision.selected_handler,
    "prepare_attack_card",
  );
});

// ===========================================================================
// Chantier 16 (2026-05-28) — Mémoire conversationnelle + opt-out status.
// Voir A2-r6 T9.
// ===========================================================================

Deno.test("detectsRecapRequest matches 'résume ce que tu dois retenir' (A2-r6 T9)", () => {
  const positives = [
    "Résume ce que tu dois retenir de mon piège de ce matin",
    "Donne-moi ce que tu as retenu",
    "Qu'est-ce que tu as retenu ?",
    "Que retiens tu de cette conversation ?",
    "Dis-moi ce que tu retiens",
  ];
  for (const msg of positives) {
    assertEquals(detectsRecapRequest(msg), true, msg);
  }
});

Deno.test("detectsExplicitNoStatusRequest matches opt-out phrasings (A2-r6 T9)", () => {
  const positives = [
    "Résume ce que tu retiens, pas les statuts système",
    "Donne-moi ce qui sert pour la suite, sans les statuts",
    "Pas le statut, juste ce qui est utile",
  ];
  for (const msg of positives) {
    assertEquals(detectsExplicitNoStatusRequest(msg), true, msg);
  }
});

Deno.test("detectsExplicitNoStatusRequest stays false on normal requests", () => {
  assertEquals(
    detectsExplicitNoStatusRequest("Récap des statuts svp"),
    false,
  );
  assertEquals(
    detectsExplicitNoStatusRequest("Programme un rappel à 9h"),
    false,
  );
});

Deno.test("central arbitrator forces normal_reply on 'pas les statuts système' (A2-r6 T9)", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Résume ce que tu dois retenir de mon piège de ce matin, pas les statuts système: seulement ce qui sert pour la suite.",
    routeDecision: routeDecision({
      response_owner: "normal_reply",
      selected_handler: undefined,
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_explicit_no_status_request",
  );
});

// ===========================================================================
// Chantier 15 (2026-05-28) — Élargir detectsExplicitOneShotReminderCreate
// aux "crée le deuxième/second rappel" / "ajoute un rappel". Voir A4-r6 T5.
// ===========================================================================

Deno.test("detectsExplicitOneShotReminderCreate matches 'crée le deuxième rappel à HH' (A4-r6 T5)", () => {
  const positives = [
    "crée le deuxième rappel à 11h37",
    "Oui, crée le deuxième rappel à 11h37 avec exactement le même texte",
    "ajoute un rappel à 14h pour appeler Mina",
    "fais-moi un rappel à 9h05",
    "mets un autre rappel à 18h00",
    "programme une seconde rappel à 11h15",
    "crée un troisième rappel demain à 8h",
  ];
  for (const msg of positives) {
    assertEquals(detectsExplicitOneShotReminderCreate(msg), true, msg);
  }
});

Deno.test("detectsExplicitOneShotReminderCreate stays false on non-create framings", () => {
  const negatives = [
    "comment je retrouve un rappel dans l'app ?",
    "où je vérifie ce rappel ?",
    "annule le rappel de 11h",
  ];
  for (const msg of negatives) {
    assertEquals(detectsExplicitOneShotReminderCreate(msg), false, msg);
  }
});

Deno.test("central arbitrator routes 'crée le deuxième rappel' to reminder even when dispatcher chose prepare_attack_card (A4-r6 T5)", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Oui, crée le deuxième rappel à 11h37 avec exactement le même texte : envoyer à Noa la page corrigée avec les trois fichiers classés. Garde celui de 11h21 actif.",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    }),
    turnFrame: turnFrame(),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_one_shot_reminder_priority",
  );
  assertEquals(
    result.routeDecision.direct_effects_to_run,
    ["create_one_shot_reminder"],
  );
});

Deno.test("central arbitrator transitional detectors cover priority families", () => {
  assertEquals(
    detectsExplicitOneShotReminderCreate(
      "Rappel ponctuel aujourd'hui à 11h25 : envoyer la note.",
    ),
    true,
  );
  assertEquals(
    detectsDurableCoachPreference("Préférence durable: zéro emoji."),
    true,
  );
  assertEquals(
    detectsExplicitProductHelp("Où dans l'app je retrouve ce rappel ?"),
    true,
  );
  assertEquals(
    detectsExactDurableStatus("11h10, 11h25, les deux ou aucun confirmé ?"),
    true,
  );
});

// ===========================================================================
// Chantier 8 (2026-05-28) — Multi-entity durable status. Voir A4-r5 T10,
// A7-r2 T11. Pattern "quelle carte / quels rappels / quelle préf active ?"
// doit aller à status_only, pas à product_help.
// ===========================================================================

Deno.test("detectsMultiEntityDurableStatus matches A4-r5 T10 prompt", () => {
  const msg =
    "point état durable : quelle carte / quels rappels / quelle pref active ? réponds factuel.";
  assertEquals(detectsMultiEntityDurableStatus(msg), true);
});

Deno.test("detectsMultiEntityDurableStatus matches 'point durable' framing alone", () => {
  assertEquals(
    detectsMultiEntityDurableStatus("Fais-moi un point durable s'il te plaît."),
    true,
  );
});

Deno.test("detectsMultiEntityDurableStatus matches 'état durable' framing alone", () => {
  assertEquals(
    detectsMultiEntityDurableStatus("Donne l'état durable actuel."),
    true,
  );
});

Deno.test("detectsMultiEntityDurableStatus matches 'réponds factuel' + question word", () => {
  assertEquals(
    detectsMultiEntityDurableStatus(
      "Réponds factuel : quelle carte est active ?",
    ),
    true,
  );
});

Deno.test("detectsMultiEntityDurableStatus does NOT trigger on single-entity product help", () => {
  // "où je retrouve la carte" est du product_help légitime, pas du status.
  assertEquals(
    detectsMultiEntityDurableStatus("Où je retrouve la carte dans l'app ?"),
    false,
  );
  assertEquals(
    detectsMultiEntityDurableStatus("Comment annuler ce rappel ?"),
    false,
  );
});

Deno.test("detectsMultiEntityDurableStatus does NOT trigger on 'quelle carte' alone", () => {
  // Anti-faux-positif: une mention de "quelle carte" SEULE sans framing
  // durable et sans 2e entité ne déclenche pas.
  assertEquals(
    detectsMultiEntityDurableStatus("Quelle carte tu choisis ?"),
    false,
  );
});

// ===========================================================================
// Chantier 9 (2026-05-28) — Mid-flow attack card correction. Voir A7-r2 T3.
// ===========================================================================

Deno.test("looksLikeAttackCardSlotCorrection matches typical slot corrections", () => {
  const positives = [
    "non, change la phrase en \"je préfère envoyer maintenant\"",
    "plutôt action : envoyer la note avant midi",
    "remplace le piège par l'envie de tout ranger d'abord",
    "modifie le signal visuel : c'est le stylo bleu",
    "non plutôt action : appeler Mina d'abord",
    "change la technique pour ancre visuelle",
  ];
  for (const msg of positives) {
    assertEquals(looksLikeAttackCardSlotCorrection(msg), true, msg);
  }
});

Deno.test("looksLikeAttackCardSlotCorrection does NOT match explicit product help", () => {
  const negatives = [
    "où dans l'app je retrouve la phrase de ma carte ?",
    "comment annuler la carte ?",
    "dans l'interface, où je modifie le signal ?",
  ];
  for (const msg of negatives) {
    assertEquals(looksLikeAttackCardSlotCorrection(msg), false, msg);
  }
});

Deno.test("looksLikeAttackCardSlotCorrection does NOT match generic recap (no correction verb)", () => {
  assertEquals(
    looksLikeAttackCardSlotCorrection(
      "L'action c'est envoyer la note, le piège c'est de ranger d'abord.",
    ),
    false,
  );
});

// ===========================================================================
// Chantier 10 (2026-05-28) — Recap request must NOT mutate coach prefs.
// Voir A7-r2 T15.
// ===========================================================================

Deno.test("detectsRecapRequest matches typical recap requests", () => {
  const positives = [
    "fais-moi un récap final stp",
    "récapitule ce qu'on a fait",
    "fais le point sur ce qu'on a couvert",
    "fais un bilan de cette session",
    "résume-nous ce qu'on a fait",
    "récap de session : où on en est ?",
    "récapitulatif final ?",
    "fais un point sur la session",
  ];
  for (const msg of positives) {
    assertEquals(detectsRecapRequest(msg), true, msg);
  }
});

Deno.test("detectsRecapRequest does NOT match coach preference statements", () => {
  const negatives = [
    "Préférence durable : zéro emoji.",
    "Garde cette préférence pour la suite.",
    "Programme un rappel à 9h.",
  ];
  for (const msg of negatives) {
    assertEquals(detectsRecapRequest(msg), false, msg);
  }
});

Deno.test("central arbitrator forces normal_reply on recap request (A7-r2 T15)", () => {
  // Sans le chantier 10, le dispatcher peut router "récap final" vers
  // update_coach_preferences (parce que le récap mentionne la préférence
  // active). On vérifie ici que l'arbitrator force normal_reply pour
  // laisser le composer companion produire un résumé à partir de
  // durableEffectsSummary.
  const result = arbitrateTurnIntent({
    userMessage:
      "Récap final : fais-moi un point sur ce qu'on a fait (rappels, prefs).",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
    }),
    turnFrame: turnFrame({
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_recap_request_priority",
  );
  assertEquals(result.turnFrame.tool_skill_intents.length, 0);
});

Deno.test("central arbitrator forces tool_skill continuation when pending attack card + slot correction (A7-r2 T3)", () => {
  // Sans le chantier 9, le dispatcher peut router vers product_help quand
  // l'utilisateur corrige un slot ("change la phrase en X") parce que la
  // mention de "phrase" déclenche le détecteur produit. On vérifie ici que
  // l'arbitrator force le retour vers tool_skill.prepare_attack_card.
  const result = arbitrateTurnIntent({
    userMessage: "non plutôt change la phrase signal en 'stylo bleu = action'",
    routeDecision: routeDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
    pendingOperationConfirmation: { operation_type: "prepare_attack_card" },
  });

  assertEquals(result.changed, true);
  assertEquals(result.routeDecision.response_owner, "tool_skill");
  assertEquals(result.routeDecision.selected_handler, "prepare_attack_card");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_pending_attack_card_continuation",
  );
});

Deno.test("central arbitrator does NOT force tool_skill continuation when no pending intake", () => {
  const result = arbitrateTurnIntent({
    userMessage: "change la phrase en 'stylo bleu = action'",
    routeDecision: routeDecision({
      response_owner: "normal_reply",
      selected_handler: undefined,
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
  });

  assertEquals(result.changed, false);
});

// ===========================================================================
// Chantier 11 (2026-05-28) — Reorder: multi-entity status BEFORE coach_pref.
// Voir A4-r6 T10.
// ===========================================================================

// ===========================================================================
// Chantier 19 (2026-05-28) — rewriteForProductHelp clears stale tool_skill
// flow entries to prevent contamination. Voir A4-r6 T13.
// ===========================================================================

Deno.test("rewriteForProductHelp clears pending coach_preference draft from tempMemory (A4-r6 T13)", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Question produit, pas une action : où est-ce que je retrouve une carte d'attaque créée et un rappel ponctuel dans l'app ?",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
    }),
    turnFrame: turnFrame({
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_type: "update_coach_preferences",
        draft: { patch: { "coach.question_tendency": "low" } },
      },
      pending_tool_skill_confirmation: {
        operation_type: "update_coach_preferences",
      },
    },
    pendingOperationConfirmation: null,
  });

  assertEquals(result.routeDecision.response_owner, "product_help");
  assertEquals(result.routeDecision.selected_handler, "product_help");
  // Le draft coach_preferences doit avoir disparu de la tempMemory.
  assertEquals(
    (result.tempMemory as any)?.__pending_tool_skill_confirmation,
    undefined,
  );
  assertEquals(
    (result.tempMemory as any)?.pending_tool_skill_confirmation,
    undefined,
  );
});

Deno.test("central arbitrator routes multi-entity status BEFORE coach_preference (A4-r6 T10)", () => {
  // "Statut fiable sans rien modifier : quelle carte est active, quels
  // rappels sont confirmés avec heure exacte, et quelle préférence coach
  // est appliquée ?" — matche AUSSI detectsDurableCoachPreference (mots
  // "preference coach"). Sans le reorder, ça tombait sur update_coach_pref.
  const result = arbitrateTurnIntent({
    userMessage:
      "Statut fiable sans rien modifier : quelle carte est active, quels rappels sont confirmés avec heure exacte, et quelle préférence coach est appliquée ?",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
    }),
    turnFrame: turnFrame({
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_status_exact_priority",
  );
});

Deno.test("central arbitrator routes multi-entity status before product_help (A4-r5 T10)", () => {
  // Sans le chantier 8, detectsExplicitProductHelp matche ("carte" + "rappel"
  // + "dans l'app") et hijacke le routage. Avec le chantier 8, on doit
  // aller à status_only / normal_reply.
  const result = arbitrateTurnIntent({
    userMessage:
      "Point état durable : quelle carte / quels rappels / quelle pref active dans l'app ? Réponds factuel.",
    routeDecision: routeDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
    }),
    turnFrame: turnFrame({ tool_skill_intents: [] }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_status_exact_priority",
  );
});
