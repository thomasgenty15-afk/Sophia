import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  applyCoachResponseStylePreferences,
  applyCompactStartGuard,
  applyIncompleteRecapGuard,
  applyNonDurableMemoryPromiseGuard,
  applyUnexecutedEffectClaimGuard,
  detectExplicitNoToolRequest,
  detectsMinuteByMinuteSequenceRequest,
  directConversationSkillReplyOverride,
  enforceRecommendationToolVisibleReply,
  isActiveCardDraftingOperation,
  isExplicitConversationalFormatRequest,
  isExplicitOperationCommand,
  isFaitPrevuFragileRecapRequest,
  isLocalTextRevisionRequest,
  isStatusOnlyNoMutationRequest,
  recordToolSkillEffectsInLedgerForTest,
  shouldRenderStatusOnlyNoMutation,
} from "./run.ts";
import {
  buildFaitPrevuFragileRecapRuntime,
  buildStatusOnlyNoMutationRuntime,
} from "../skills/status_recap/runtime.ts";
import {
  createEffectLedger,
  hasCommittedEffect,
  rewriteUncommittedEffectClaims,
} from "./effect_ledger.ts";
import {
  directSafetyCrisisReplyOverride,
  runtimeSafetyPregateForTurn,
  suppressToolSignalsForSafetyRoute,
  withActiveSafetyFlowCaution,
} from "./safety_crisis_runtime.ts";
import {
  buildCoachPreferencePreviewReply,
  detectsCoachPreferenceDirectionContradiction,
  isApplyExistingCoachPreferenceRequest,
  isCoachPreferenceExplicitApproval,
  isCoachPreferencePreviewOnlyRequest,
  isCoachPreferenceVerificationRequest,
  isImmediateModeRequestNotCoachPreference,
  isRuntimeCoachPreferenceRequest,
  shouldRuntimeCoachPreferenceOverrideRoute,
} from "../tools/operations/update_coach_preferences/route_guards.ts";
import { upsertCoachPreferencesFromDraftForTest } from "../tools/operations/update_coach_preferences/status.ts";
import {
  buildMinuteByMinuteSequenceAddon,
  detectsExplicitOneShotReminderCancel,
  isExplicitOneShotReminderModificationRequest,
  isOneShotReminderExactStatusRequest,
  localTextAddonForOneShotReminder,
  oneShotReminderManagementReply,
  shouldPreferOneShotReminderOverRecurring,
} from "../tools/always_on/one_shot_reminder/router.ts";
const legacyCoachPreferenceKey = (name: string) => `coach.${name}`;

Deno.test("effect ledger maps update_coach_preferences executor commit", () => {
  const ledger = createEffectLedger("turn-ledger-1");
  recordToolSkillEffectsInLedgerForTest({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      status: "executed",
      operation_id: "op-pref-1",
      committed_effects: [{
        type: "update_coach_preferences",
        operation_id: "op-pref-1",
        preference_keys: ["coach.tone"],
        preferences_update_ids: ["coach.tone"],
      }],
    },
  });

  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "coach_preferences.update",
    ),
    true,
  );
  assertEquals(ledger.entries[0]?.db_ref, {
    table: "user_profile_facts",
    key: "coach.tone",
  });
});

Deno.test("effect ledger guard neutralizes durable preference claim without commit", () => {
  const result = rewriteUncommittedEffectClaims({
    reply: "C'est fait, préférence enregistrée.",
    ledger: createEffectLedger("turn-ledger-2"),
  });

  assertEquals(result.changed, true);
  assertEquals(result.reply, "Je ne l'ai pas enregistré.");
});

Deno.test("effect ledger guard neutralizes reminder claim without commit", () => {
  const result = rewriteUncommittedEffectClaims({
    reply: "Rappel programmé pour demain matin.",
    ledger: createEffectLedger("turn-ledger-3"),
  });

  assertEquals(result.changed, true);
  assertEquals(result.reason_codes, ["uncommitted_reminder_create_claim"]);
});

Deno.test("conversation skill reply override lets product_help own its factual answer", () => {
  const reply =
    "Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.\n\nPour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement.";
  const overridden = directConversationSkillReplyOverride({
    routeDecision: { response_owner: "product_help" } as any,
    skillOutput: {
      skill_id: "product_help",
      status: "complete",
      response_intent: "how_to",
      reply,
      diagnosis: { feature_id: "one_shot_reminder.chat" },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: [
          "one_shot_reminder_already_programmed",
          "do_not_restart_reminder_slot_filling",
          "product_help_does_not_execute_operations",
        ],
      },
      operation_suggestions: [],
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    },
  });

  assertEquals(overridden, reply);
  assertEquals(
    /Tu veux le modifier|quelle date|quelle heure/i.test(overridden ?? ""),
    false,
  );
});

Deno.test("safety reply override lets safety_crisis own the visible answer", () => {
  const reply = "Je reste sur la securite immediate.";
  const overridden = directSafetyCrisisReplyOverride({
    routeDecision: { response_owner: "safety" } as any,
    skillOutput: {
      skill_id: "safety_crisis",
      status: "continue",
      response_intent: "ground_safety",
      reply,
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["no_product_push_during_safety"],
      },
      operation_suggestions: [],
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    },
  });

  assertEquals(overridden, reply);
});

Deno.test("safety route suppresses tool signals and direct effects", () => {
  const result = suppressToolSignalsForSafetyRoute({
    routeDecision: {
      route_version: "v1",
      response_owner: "safety",
      selected_handler: "safety_crisis",
      blocked_paths: [],
      direct_effects_to_run: ["create_one_shot_reminder"],
      reason_code: "safety_override",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    turnFrame: {
      tool_skill_intents: [{ operation_type: "select_state_potion" }],
      direct_effects: [{ effect_type: "create_one_shot_reminder" }],
      tool_skill_opportunity: {
        type: "state_potion",
        operation_type: "select_state_potion",
        should_offer: true,
      },
    } as any,
  });

  assertEquals(result.changed, true);
  assertEquals(result.routeDecision.direct_effects_to_run, []);
  assertEquals(result.turnFrame?.tool_skill_intents, []);
  assertEquals(result.turnFrame?.direct_effects, []);
  assertEquals(result.turnFrame?.tool_skill_opportunity.type, "none");
  assertEquals(
    result.routeDecision.blocked_paths.some((path) =>
      path.reason_code === "safety_route_suppresses_tool_signals"
    ),
    true,
  );
});

Deno.test("active safety flow caution keeps at least medium risk", () => {
  const output = withActiveSafetyFlowCaution({
    detected: false,
    risk_band: "none",
    reason_codes: [],
    evidence: [],
    layer_contributions: {},
    allow_side_effects: true,
  } as any, {
    __active_skill_state: {
      skill_id: "safety_crisis",
      status: "active",
      working_state: { phase: "support_contact" },
    },
  });

  assertEquals(output.risk_band, "medium");
  assertEquals(output.detected, true);
  assertEquals(output.allow_side_effects, false);
  assertEquals(
    output.reason_codes.includes("active_safety_flow_caution"),
    true,
  );
});

Deno.test("active safety flow cannot be downgraded by safe reminder exception", () => {
  const result = runtimeSafetyPregateForTurn({
    safetyPregateOutput: {
      detected: true,
      risk_band: "medium",
      reason_codes: ["active_safety_flow_caution"],
      evidence: [],
      layer_contributions: { heuristic: true },
      allow_side_effects: false,
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "create_one_shot_reminder",
      reason_code: "test",
      direct_effects_to_run: ["create_one_shot_reminder"],
      blocked_paths: [],
    } as any,
    turnFrame: {
      safety: { risk_band: "low" },
    } as any,
    tempMemory: {
      __active_skill_state: {
        skill_id: "safety_crisis",
        status: "active",
        working_state: { phase: "support_contact" },
      },
    },
    userMessage: "rappelle-moi de finir le dossier demain",
    allowExplicitSafeWorkReminderDowngrade: () => true,
  });

  assertEquals(result.riskBand, "medium");
  assertEquals(result.pregateOutput.risk_band, "medium");
});

Deno.test("local text revision is not a coach preference update", () => {
  assertEquals(
    isLocalTextRevisionRequest(
      "Oui, formule-le en une version ultra courte que tu pourrais réutiliser quand je reparle d'un document à écrire.",
    ),
    true,
  );
  assertEquals(
    isLocalTextRevisionRequest(
      "Version ultra. Et pour la suite, pose-moi une seule question courte à la fois.",
    ),
    false,
  );
});

Deno.test("coach preference verification is not a new preference update", () => {
  assertEquals(
    isCoachPreferenceVerificationRequest(
      "Et tu as bien gardé la préférence une seule question courte quand je bloque ?",
    ),
    true,
  );
  assertEquals(
    isCoachPreferenceVerificationRequest(
      "Pour la suite, garde la préférence une seule question courte quand je bloque.",
    ),
    false,
  );
});

Deno.test("concrete future style request is a coach preference", () => {
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Pour la suite, quand je suis vide comme ca, parle-moi en mode tres concret: une action, pas trois options. Garde cette preference si tu peux.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Mets a jour ma preference coach : quand je dis que je suis confus, reponds plus directement et avec moins d'options.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Le rappel est bon, mais la partie 'je prefere les consignes tres courtes' n'etait pas le texte du rappel : c'est une preference de coaching a retenir.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Je veux vraiment que tu enregistres ça comme préférence de coaching: quand je suis fatigué, une seule action concrète à la fois, pas plusieurs options.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Pour la suite, enregistre une préférence de coaching: quand je dis que je suis vidé ou vraiment crevé, je veux une seule action concrète à la fois, pas trois options.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Garde comme repère dans cette conversation que journée brouillée = choisir une seule zone.",
    ),
    false,
  );
  assertEquals(
    isApplyExistingCoachPreferenceRequest(
      "Pas de potion maintenant. Applique plutôt ma préférence: une seule question ou une seule action courte.",
    ),
    true,
  );
  assertEquals(
    isApplyExistingCoachPreferenceRequest(
      "Non, ne lance rien. Donne-moi juste la prochaine mini-action en respectant ma préférence: une seule action.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Pas de potion maintenant. Applique plutôt ma préférence: une seule question ou une seule action courte.",
    ),
    false,
  );
});

Deno.test("explicit no-tool requests block operation starts", () => {
  assertEquals(
    detectExplicitNoToolRequest(
      "Merci. Ne lance rien d'autre maintenant, même pas une potion. Fais-moi juste le récap.",
    ),
    true,
  );
  assertEquals(
    detectExplicitNoToolRequest(
      "Non, ne lance rien. Donne-moi juste la prochaine mini-action pour ne pas tout refaire.",
    ),
    true,
  );
});

Deno.test("explicit coach preference overrides active conversation/product routes", () => {
  assertEquals(
    shouldRuntimeCoachPreferenceOverrideRoute({
      message:
        "Pour la suite, quand je suis fatigué comme ça, je veux une seule action concrète à la fois, pas trois options.",
      routeDecision: {
        response_owner: "conversation_handler",
        selected_handler: "execution_breakdown",
      } as any,
      safetyRiskBand: "none",
      hasPendingOperationConfirmation: false,
    }),
    true,
  );
  assertEquals(
    shouldRuntimeCoachPreferenceOverrideRoute({
      message:
        "Je veux vraiment que tu enregistres ça comme préférence de coaching: une seule action concrète à la fois.",
      routeDecision: {
        response_owner: "product_help",
        selected_handler: "product_help",
      } as any,
      safetyRiskBand: "none",
      hasPendingOperationConfirmation: false,
    }),
    true,
  );
});

Deno.test("immediate calm mode request is not a durable coach preference", () => {
  assertEquals(
    isImmediateModeRequestNotCoachPreference(
      "J'ai envie d'un mode calme maintenant, pas d'un plan militaire.",
    ),
    true,
  );
  assertEquals(
    isImmediateModeRequestNotCoachPreference(
      "Pour la suite, parle-moi en mode tres concret: une action, pas trois options.",
    ),
    false,
  );
});

Deno.test("coach preference explicit approval accepts exact confirmation", () => {
  assertEquals(
    isCoachPreferenceExplicitApproval(
      "Oui, c'est exactement ca: une action concrete a la fois quand je suis vide.",
    ),
    true,
  );
});

Deno.test("one-shot reminder management question gets factual product wording", () => {
  const reply = oneShotReminderManagementReply(
    "Le rappel ponctuel de demain, si je change d'avis au reveil, je te demande ici de l'annuler ou je dois aller dans Initiatives ?",
  );
  assertEquals(
    reply?.includes("se gère côté Initiatives"),
    true,
  );
  assertEquals(
    reply?.includes("me le redire ici clairement"),
    true,
  );
  assertEquals(reply?.includes("pas besoin d'aller dans Initiatives"), false);
});

Deno.test("one-shot reminder management handles pronominal follow-up", () => {
  const reply = oneShotReminderManagementReply(
    "Et si demain je veux le changer ou l'annuler, je dois aller où ou je peux te le dire ici ?",
  );
  assertEquals(
    reply?.includes("se gère côté Initiatives"),
    true,
  );
  assertEquals(
    reply?.includes("me le redire ici clairement"),
    true,
  );
  assertEquals(reply?.includes("Ressources"), false);
  assertEquals(reply?.includes("Cartes"), false);
});

Deno.test("state potion opportunity does not append mechanical product copy", () => {
  const response = enforceRecommendationToolVisibleReply({
    responseContent:
      "On fait simple: une pile temporaire, puis un seul message.",
    userMessage:
      "Je suis éparpillé ce matin, je veux juste retrouver un point d'appui.",
    surfaceLabel: "Potion d'etat",
    recommendation: {
      decision: "recommend_operation",
      recommendation_id: "dispatcher_opportunity:state_potion",
      operation_type: "select_state_potion",
      user_facing_offer: "se poser avant de continuer",
    } as any,
  });
  assertEquals(response.includes("Concrètement, je parle"), false);
  assertEquals(response.includes("Potion"), false);
});

Deno.test("emotional_repair visible reply is owned by the skill", () => {
  const reply = directConversationSkillReplyOverride({
    routeDecision: {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "emotional_repair",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "emotion_dominates",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    skillOutput: {
      skill_id: "emotional_repair",
      status: "continue",
      response_intent: "de_shame",
      reply: "Je garde le fait concret, pas le verdict contre toi.",
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    },
  });
  assertEquals(reply, "Je garde le fait concret, pas le verdict contre toi.");
});

Deno.test("compact start guard collapses A/B plans into one gesture", () => {
  const guarded = applyCompactStartGuard({
    userMessage: "Je veux juste un petit point d'appui, démarrage compact.",
    responseContent:
      "A) Ouvre le dossier.\nB) Fais un brouillon.\nOption bonus : je peux aussi te faire une carte d'attaque.",
  });
  assertEquals(guarded.includes("A)"), false);
  assertEquals(guarded.includes("Option"), false);
  assertEquals(guarded.split("\n").length, 2);
  assertEquals(guarded.includes("Premier geste"), true);
});

Deno.test("natural durable recap is treated as status only", () => {
  assertEquals(
    isStatusOnlyNoMutationRequest(
      "Avant que je coupe, fais-moi le récap: qu'est-ce qui a vraiment été créé ou gardé, et qu'est-ce qui était juste pour la conversation ?",
    ),
    true,
  );
});

Deno.test("incomplete recap intro gets a minimal fallback body", () => {
  const guarded = applyIncompleteRecapGuard({
    userMessage: "Fais-moi juste le récap de ce qu'on a fixé.",
    responseContent:
      "C'est entendu. Voici le récap de ce qu'on a fixé pour aujourd'hui : 🙂",
  });
  assertEquals(guarded.includes("- "), true);
  assertEquals(guarded.endsWith(": 🙂"), false);
});

Deno.test("existing one-shot reminder modification is not a plan adjustment", () => {
  assertEquals(
    isExplicitOneShotReminderModificationRequest(
      "Décale ce rappel ponctuel à demain 9h10, même texte.",
    ),
    true,
  );
});

// ============================================================================
// Chantier 14 (2026-05-28) — Anti-faux-positif sur la détection de
// modification de rappel. Voir A2-r6 T4/T8, A3-r7 T3.
// ============================================================================

Deno.test("'ne change rien' n'est PAS une demande de modification de rappel (A2-r6 T4)", () => {
  // "Pour le rappel de 11h50, si je veux le vérifier ou l'annuler dans
  // l'app, je vais où ? Juste l'emplacement, ne change rien."
  // Avant chantier 14, "change" + "le rappel" + "11h50" déclenchait à
  // tort la détection de modification.
  assertEquals(
    isExplicitOneShotReminderModificationRequest(
      "Pour le rappel de 11h50, si je veux le vérifier ou l'annuler dans l'app, je vais où ? Juste l'emplacement, ne change rien.",
    ),
    false,
  );
});

Deno.test("'sans parler de le modifier' n'est PAS une demande de modification (A2-r6 T8)", () => {
  assertEquals(
    isExplicitOneShotReminderModificationRequest(
      "Et pour le rappel ponctuel de 11h50, juste l'emplacement où je peux le vérifier dans l'app, sans parler de le modifier.",
    ),
    false,
  );
});

Deno.test("'où je vais modifier/supprimer dans l'app' est du product_help, pas une modification (A3-r7 T3)", () => {
  assertEquals(
    isExplicitOneShotReminderModificationRequest(
      "Si je veux modifier ou supprimer ce rappel dans l'app, je vais où ? Ne change rien, je veux juste l'emplacement.",
    ),
    false,
  );
});

Deno.test("une vraie demande de modification reste détectée (régression chantier 14)", () => {
  // On vérifie qu'on ne casse pas le cas positif.
  assertEquals(
    isExplicitOneShotReminderModificationRequest(
      "Décale ce rappel à 14h, même texte.",
    ),
    true,
  );
  assertEquals(
    isExplicitOneShotReminderModificationRequest(
      "Reprogramme le rappel ponctuel à 18h30, garde le même message.",
    ),
    true,
  );
});

Deno.test("one-shot reminder exact status request is detected", () => {
  assertEquals(
    isOneShotReminderExactStatusRequest(
      "L'heure vraiment enregistrée du rappel, c'est 11h05 ou 11h20 ?",
    ),
    true,
  );
});

Deno.test("concise durable coach preference is detected", () => {
  assertEquals(
    isRuntimeCoachPreferenceRequest(
      "Préférence durable: réponds en 3 lignes max, sans question finale.",
    ),
    true,
  );
});

Deno.test("coach response style preferences remove emoji and final question", () => {
  const styled = applyCoachResponseStylePreferences({
    userMessage: "Court: bilan en trois lignes, sans emoji, sans question.",
    responseContent:
      "Fait : carte créée et rappel programmé.\nPrévu : payer sans revérifier.\nFragile : honte du cadrage.\nTu veux continuer ? 🙂",
    preferences: {
      noEmoji: true,
      maxLines: 3,
      avoidFinalQuestion: true,
    },
  });
  assertEquals(styled.includes("🙂"), false);
  assertEquals(styled.includes("?"), false);
  assertEquals(styled.split("\n").length, 3);
});

Deno.test("one-shot reminder reply keeps a local phrase side request", () => {
  const addon = localTextAddonForOneShotReminder(
    "Donne-moi une phrase courte pour Samir + rappelle-moi à 11h40 de l'envoyer.",
  );
  assertEquals(addon?.includes("Phrase courte pour Samir"), true);
  assertEquals(addon?.includes("rappelle"), false);
});

Deno.test("coach preference DB upsert accepts multi-key patches", async () => {
  const rowsSeen: any[] = [];
  const fakeSupabase = {
    from(table: string) {
      assertEquals(table, "user_profile_facts");
      return {
        upsert(rows: any[], options: any) {
          rowsSeen.push(...rows);
          assertEquals(options.onConflict, "user_id,scope,key");
          return {
            select(columns: string) {
              assertEquals(columns, "key");
              return Promise.resolve({
                data: rows.map((row) => ({ key: row.key })),
                error: null,
              });
            },
          };
        },
      };
    },
  };
  const result = await upsertCoachPreferencesFromDraftForTest({
    supabase: fakeSupabase as any,
    userId: "u1",
    sourceMessageId: "m1",
    draft: {
      operation_type: "update_coach_preferences",
      output_schema: "coach_preferences_patch_draft_v1",
      draft: {
        patch: {
          "coach.tone": "direct",
          "coach.challenge_level": "balanced",
          "coach.question_tendency": "low",
        },
        summary: "ton direct, challenge équilibré, moins de questions.",
      },
      confirmation_message: "Confirmer ?",
      confirmation_actions: ["yes", "no"],
    },
  });
  assertEquals(result.error, null);
  assertEquals(result.data?.keys, [
    "coach.tone",
    "coach.challenge_level",
    "coach.question_tendency",
  ]);
  assertEquals(
    rowsSeen.map((row) => row.value.value),
    ["direct", "balanced", "low"],
  );
});

Deno.test("explicit memory retention wording does not overpromise durable memory", () => {
  const guarded = applyNonDurableMemoryPromiseGuard({
    userMessage:
      "Retiens pour les prochaines fois: le moment risqué c'est le retour du soir.",
    responseContent:
      "Carrément, je le retiens. Pour toi, le moment risqué c'est le retour du soir.",
    routeDecision: {
      response_owner: "normal_reply",
      direct_effects_to_run: [],
    } as any,
  });
  assertEquals(
    guarded.startsWith("Je le garde comme repère dans cette conversation."),
    true,
  );
  const guardedBienNote = applyNonDurableMemoryPromiseGuard({
    userMessage:
      "Retiens pour les prochaines fois: mon garde-fou du soir, c'est la commode.",
    responseContent: "Bien noté ✅ Ton garde-fou du soir, c'est la commode.",
    routeDecision: {
      response_owner: "normal_reply",
      direct_effects_to_run: [],
    } as any,
  });
  assertEquals(
    guardedBienNote.startsWith(
      "Je le garde comme repère dans cette conversation.",
    ),
    true,
  );
  const guardedConversationRepere = applyNonDurableMemoryPromiseGuard({
    userMessage:
      "Garde comme repère dans cette conversation que quand je dis éparpillé, ça veut dire choisir une seule zone.",
    responseContent:
      "Ok, noté ✅ Quand tu dis “éparpillé”, je retiens que tu veux choisir une seule zone. Je le garde comme repère pour la suite.",
    routeDecision: {
      response_owner: "normal_reply",
      direct_effects_to_run: [],
    } as any,
  });
  assertEquals(
    guardedConversationRepere.startsWith(
      "Je le garde comme repère dans cette conversation.",
    ),
    true,
  );
  assertEquals(guardedConversationRepere.includes("je retiens que"), false);
  assertEquals(guardedConversationRepere.includes("pour la suite"), false);
});

// ---------------------------------------------------------------------------
// Régression chantier 1 (2026-05-28): le composer status_only ne doit pas
// déclencher quand le user impose un format conversationnel explicite.
// Voir docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md, section Couche L3.
// ---------------------------------------------------------------------------

Deno.test("explicit conversational format request: 'fait, prévu, fragile' is detected (A2-r4 T13)", () => {
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Ne lance rien maintenant, pas de potion, pas de nouveau rappel. Fais seulement le récap: fait, prévu, fragile, en trois lignes.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'pas de statut système' + 'trois lignes' (A2-r4 T14)", () => {
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Ce n'est pas le récap demandé. Pas de statut système: seulement fait, prévu, fragile. Trois lignes, sans emoji.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'réponds en une ligne' is detected (A4-r4 T14)", () => {
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Donc pour le rappel à 11h12 : confirmé ou non confirmé ? Réponds en une ligne.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'récap conversationnel' is detected (A6-r2 T15)", () => {
  assertEquals(
    isExplicitConversationalFormatRequest(
      "On s'arrête là. Fais seulement un récap conversationnel final.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'une seule phrase' is detected", () => {
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Donne-moi une seule phrase qui me remet au calme, pas plus.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request stays false on a normal status request", () => {
  // Garde-fou: une demande status sans contrainte de format ne doit PAS
  // matcher. Sinon le composer status_only ne se déclenchera plus du tout.
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Sans rien modifier, vérifie ce qui est en place: carte, rappel, préférence coach.",
    ),
    false,
  );
});

Deno.test("explicit conversational format request stays false on a generic 'short' request", () => {
  // "Court" tout seul n'est pas une contrainte explicite de format
  // conversationnel: le composer status_only à 4 lignes reste légitime.
  assertEquals(
    isExplicitConversationalFormatRequest("Réponds court."),
    false,
  );
});

Deno.test("explicit conversational format request stays false on a card title containing 'X lignes'", () => {
  // Anti-faux-positif: "carte Samir 3 lignes" est le titre d'une carte
  // d'attaque (A6-r2). On NE DOIT PAS matcher "3 lignes" comme contrainte
  // de format. Le contexte demande "ce qui est en place" → status panel
  // canonique légitime.
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Avant de cloturer, sans rien modifier, verifie ce qui est en place: carte Samir 3 lignes, rappel a 17h05, preference coach, et repere stylo bleu.",
    ),
    false,
  );
});

Deno.test("explicit conversational format request stays false when 'trois lignes' is an action object", () => {
  // Anti-faux-positif (A6-r2 T2): "envoyer trois lignes à Samir" est
  // l'action décrite dans une carte d'attaque, pas une contrainte de
  // format. Ne doit pas matcher.
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Oui, prepare une carte d'attaque. Action: envoyer trois lignes a Samir avant d'aligner le bureau.",
    ),
    false,
  );
});

Deno.test("explicit conversational format request stays false when 'une phrase' is an object to write", () => {
  // Anti-faux-positif: "écris une phrase pour Samir" — "une phrase" est
  // l'objet de l'action, pas une contrainte sur la réponse de Sophia.
  assertEquals(
    isExplicitConversationalFormatRequest(
      "Donne-moi une phrase courte pour Lina, et rappelle-moi à 11h35.",
    ),
    false,
  );
});

Deno.test("status_only and explicit-format detectors can overlap (the format guard wins)", () => {
  // Sur les tours A2-r4 T13/T14, isStatusOnlyNoMutationRequest
  // retournait true (à cause de "en place" / "ce qu'on a fait"), ce qui
  // déclenchait le panneau. La garde de format ferme la porte avant.
  const userMessage =
    "Ne lance rien maintenant, pas de potion. Fais seulement le récap: fait, prévu, fragile, en trois lignes.";
  assertEquals(isStatusOnlyNoMutationRequest(userMessage), false);
  assertEquals(
    isExplicitConversationalFormatRequest(userMessage),
    true,
  );
});

// ---------------------------------------------------------------------------
// CHANTIER C1 (2026-05-28) — Subordination du status (L4).
// Le bloc `status_only_request_blocks_tool_start` est gardé par:
//   1. routeDecision.response_owner !== "product_help" (status cède à
//      product_help) — A2-r7 T4, A4-r6 T14, A3-r8 T3.
//   2. !isActiveCardDraftingOperation(activeOperationIntake) (status
//      ne tue pas un flow de carte) — A3-r8 T6/T8.
// Scope limité aux cartes pour ne pas régresser A4-r6 T11 (coach actif).
// ---------------------------------------------------------------------------

Deno.test("C1: isActiveCardDraftingOperation is true for attack/defense card flows", () => {
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "prepare_attack_card",
    }),
    true,
  );
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "prepare_defense_card",
    }),
    true,
  );
});

Deno.test("C1 anti-régression: isActiveCardDraftingOperation is false for coach/other/none (protège A4-r6 T11)", () => {
  // A4-r6 T11: un intake update_coach_preferences est actif, mais une vraie
  // question de statut doit toujours passer. Le garde C1 ne doit PAS le
  // considérer comme un flow de carte.
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "update_coach_preferences",
    }),
    false,
  );
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "adjust_plan_item",
    }),
    false,
  );
  assertEquals(isActiveCardDraftingOperation(null), false);
  assertEquals(isActiveCardDraftingOperation(undefined), false);
  assertEquals(isActiveCardDraftingOperation({}), false);
});

// ---------------------------------------------------------------------------
// CHANTIER C2 (2026-05-28) — Garde anti-hallucination « c'est fait » (L5).
// ---------------------------------------------------------------------------

Deno.test("C2: neutralizes a false reminder-done claim when no tool executed (A4-r6 T6)", () => {
  // A4-r6 T6: le routeur voulait create_one_shot_reminder mais rien n'a été
  // exécuté (executed_tools=[]), et la réponse affirmait le rappel
  // ("correspond bien à ce que j'ai déjà indiqué" + ✅ + "reste actif").
  const guarded = applyUnexecutedEffectClaimGuard({
    responseContent:
      "Ok, je fais simple : le rappel ponctuel à 11h37 “envoyer à Noa la page corrigée avec les trois fichiers classés” correspond bien à ce que j’ai déjà indiqué, et le rappel 11h21 reste actif. ✅🕒",
    intendedTools: ["create_one_shot_reminder"],
    executedTools: [],
  });
  assertEquals(guarded.includes("✅"), false);
  assertEquals(guarded.includes("correspond bien"), false);
  assertEquals(
    /n'ai pas encore programmé|pas encore programmé/.test(guarded),
    true,
  );
});

Deno.test("C2 anti-FP: a genuinely executed reminder keeps its 'c'est programmé' confirmation (A4-r6 T3)", () => {
  // Quand le tool a réellement tourné (executedTools contient le tool), la
  // confirmation de succès est légitime et doit être laissée intacte.
  const reply =
    "C'est programmé pour jeudi 28 mai à 11:21 : envoyer à Noa la page corrigée avec les trois fichiers classés. 🙂";
  const guarded = applyUnexecutedEffectClaimGuard({
    responseContent: reply,
    intendedTools: ["create_one_shot_reminder"],
    executedTools: ["create_one_shot_reminder"],
  });
  assertEquals(guarded, reply);
});

Deno.test("C2 anti-FP: an already-honest 'je n'ai pas pu' reply is left intact", () => {
  const reply =
    "Je n'ai pas pu programmer ce rappel maintenant. Il y a eu un souci technique côté outil.";
  const guarded = applyUnexecutedEffectClaimGuard({
    responseContent: reply,
    intendedTools: ["create_one_shot_reminder"],
    executedTools: [],
  });
  assertEquals(guarded, reply);
});

Deno.test("C2 anti-FP: no mutation intended → an affirmative ✅ reply is left intact", () => {
  // Aucun tool de mutation visé ce tour: le garde ne doit pas s'activer même
  // si la réponse contient un ✅ ou une formule positive.
  const reply =
    "Bien vu ✅ Ton point d'appui du matin, c'est d'ouvrir une seule fenêtre.";
  const guarded = applyUnexecutedEffectClaimGuard({
    responseContent: reply,
    intendedTools: [],
    executedTools: [],
  });
  assertEquals(guarded, reply);
});

// ---------------------------------------------------------------------------
// CHANTIER C3 (2026-05-28) — Status/recap depuis la DB + heures locales.
// ---------------------------------------------------------------------------

function makeFakeSupabaseMultiTable(rowsByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = rowsByTable[table] ?? [];
      const builder: any = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        like() {
          return this;
        },
        limit() {
          return this;
        },
        then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
        },
      };
      return builder;
    },
  } as any;
}

Deno.test("C3: status composer lists EACH pending reminder's exact instruction from DB (A4-r6 T12)", async () => {
  const supabase = makeFakeSupabaseMultiTable({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [
      {
        id: "r-1",
        scheduled_for: "2026-05-28T09:21:00.000Z",
        status: "pending",
        message_payload: {
          reminder_instruction:
            "envoyer à Noa la page corrigée avec les trois fichiers classés",
        },
      },
      {
        id: "r-2",
        scheduled_for: "2026-05-28T09:37:00.000Z",
        status: "pending",
        message_payload: {
          reminder_instruction: "relire le brief de Lina avant la réunion",
        },
      },
    ],
    user_profile_facts: [],
  });
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase,
    userId: "u1",
    tempMemory: {},
    userTimezone: "Europe/Paris",
    userMessage:
      "Toujours sans rien modifier : pour les rappels 11h21 et 11h37, quel texte exact est vérifié ?",
  });
  const content = String(runtime.content ?? "");
  // Les DEUX instructions exactes (DB) doivent apparaître.
  assertEquals(
    content.includes(
      "envoyer à Noa la page corrigée avec les trois fichiers classés",
    ),
    true,
  );
  assertEquals(
    content.includes("relire le brief de Lina avant la réunion"),
    true,
  );
  // On annonce bien 2 rappels.
  assertEquals(content.includes("j'en vois 2 en place"), true);
  // Heure UTC jamais affichée.
  assertEquals(content.includes("09:21"), false);
  assertEquals(content.includes("09:37"), false);
  assertEquals(runtime.executedTools.length, 0);
});

Deno.test("I4: status composer reports created-then-cancelled one-shot reminders", async () => {
  const supabase = makeFakeSupabaseMultiTable({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [
      {
        id: "r-cancelled",
        scheduled_for: "2026-05-29T14:05:00.000Z",
        status: "cancelled",
        updated_at: "2026-05-29T10:10:00.000Z",
        event_context: "one_shot_reminder:relire_l_ancre",
        message_payload: {
          reminder_instruction: "relire l'ancre phrase imparfaite",
        },
      },
    ],
    user_profile_facts: [],
  });
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase,
    userId: "u1",
    tempMemory: {},
    userTimezone: "Europe/Paris",
    userMessage:
      "Récap exact : rappel créé ou annulé, et préférence coach enregistrée ou non.",
  });
  const content = String(runtime.content ?? "");
  assertEquals(content.includes("aucun actif"), true);
  assertEquals(content.includes("créé puis annulé"), true);
  assertEquals(content.includes("relire l'ancre phrase imparfaite"), true);
});

// ---------------------------------------------------------------------------
// CHANTIER F1 (2026-05-29) — Récap status : distinguer les préférences coach
// réellement choisies (source_type explicit_user) des réglages par défaut
// système. buildStatusOnlyNoMutationRuntime est le composer réellement utilisé.
// Voir A11 T13 / A3-r11 T15 où les 9 defaults étaient annoncés comme prefs.
// ---------------------------------------------------------------------------

Deno.test("F1: seuls les réglages par défaut système → récap n'annonce PAS de préférences (A11 T13)", async () => {
  const supabase = makeFakeSupabaseMultiTable({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [
      {
        key: "coach.tone",
        value: { value: "chaleureux" },
        status: "active",
        source_type: "system_default",
      },
      {
        key: "coach.question_tendency",
        value: { value: "balanced" },
        status: "active",
        source_type: "system_default",
      },
    ],
  });
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase,
    userId: "u1",
    tempMemory: {},
    userTimezone: "Europe/Paris",
    userMessage:
      "Sans rien modifier, quelles préférences coach sont en place ?",
  });
  const content = String(runtime.content ?? "");
  // On ne doit PAS affirmer "oui, ..." comme si l'utilisateur les avait choisies.
  assertEquals(content.includes("seuls les réglages par défaut système"), true);
  assertEquals(content.includes("oui, ton"), false);
  assertEquals((runtime.toolSkillRun as any)?.coach_preference_found, false);
});

Deno.test("F1: préférences explicites listées + defaults notés séparément", async () => {
  const supabase = makeFakeSupabaseMultiTable({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [
      {
        key: "coach.question_tendency",
        value: { value: "low" },
        status: "active",
        source_type: "explicit_user",
      },
      {
        key: "coach.tone",
        value: { value: "chaleureux" },
        status: "active",
        source_type: "system_default",
      },
    ],
  });
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase,
    userId: "u1",
    tempMemory: {},
    userTimezone: "Europe/Paris",
    userMessage:
      "Sans rien modifier, quelles préférences coach sont en place ?",
  });
  const content = String(runtime.content ?? "");
  // La préférence explicite est annoncée.
  assertEquals(content.includes("moins de questions"), true);
  // Les defaults sont mentionnés comme valeur par défaut, pas comme choix.
  assertEquals(content.includes("valeur par défaut système"), true);
  assertEquals((runtime.toolSkillRun as any)?.coach_preference_found, true);
});

Deno.test("F1: status ignores backend-only coach preference rows", async () => {
  const supabase = makeFakeSupabaseMultiTable({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [
      {
        key: legacyCoachPreferenceKey("emoji_policy"),
        value: { value: "none" },
        status: "active",
        source_type: "explicit_user",
      },
      {
        key: legacyCoachPreferenceKey("action_first_policy"),
        value: { value: "concrete_before_questions" },
        status: "active",
        source_type: "explicit_user",
      },
      {
        key: "coach.tone",
        value: { value: "direct" },
        status: "active",
        source_type: "explicit_user",
      },
    ],
  });
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase,
    userId: "u1",
    tempMemory: {},
    userTimezone: "Europe/Paris",
    userMessage:
      "Sans rien modifier, quelles préférences coach sont en place ?",
  });
  const content = String(runtime.content ?? "");
  assertEquals(content.includes("direct"), true);
  assertEquals(content.includes("emoji"), false);
  assertEquals(content.includes("action concrète"), false);
});

// ---------------------------------------------------------------------------
// CHANTIER C5 (2026-05-28) — Contrat de format « fait / prévu / fragile ».
// ---------------------------------------------------------------------------

Deno.test("C5: detects the 'fait/prévu/fragile' recap contract (A2-r7 T13/T14)", () => {
  assertEquals(
    isFaitPrevuFragileRecapRequest(
      "Ne lance rien maintenant, pas de potion. Fais seulement le récap: fait, prévu, fragile, en trois lignes. Pas de question.",
    ),
    true,
  );
  assertEquals(
    isFaitPrevuFragileRecapRequest(
      "Fais-le maintenant: trois lignes seulement, fait / prévu / fragile, heure France, pas de question.",
    ),
    true,
  );
});

Deno.test("C5 anti-FP: a normal message does not match the fait/prévu/fragile sequence", () => {
  assertEquals(
    isFaitPrevuFragileRecapRequest(
      "C'est fait, je me sens un peu fragile mais ça va.",
    ),
    false,
  );
  assertEquals(
    isFaitPrevuFragileRecapRequest("Donne-moi le récap court."),
    false,
  );
});

Deno.test("C5: recap composer renders exactly 3 labeled lines, no question (A2-r7 T14)", async () => {
  const supabase = makeFakeSupabaseMultiTable({
    user_attack_cards: [{
      id: "a-1",
      generated_at: new Date().toISOString(),
      content: { operation_draft: { title: "Classement rapide" } },
    }],
    user_defense_cards: [],
    scheduled_checkins: [{
      id: "r-1",
      scheduled_for: "2026-05-28T09:21:00.000Z",
      status: "pending",
      message_payload: { reminder_instruction: "envoyer la note à Noa" },
    }],
    user_profile_facts: [
      { key: "coach.tone", value: "direct", status: "active" },
    ],
  });
  const runtime = await buildFaitPrevuFragileRecapRuntime({
    supabase,
    userId: "u1",
    userTimezone: "Europe/Paris",
  });
  const content = String(runtime.content ?? "");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  assertEquals(lines.length, 3);
  assertEquals(lines[0].startsWith("Fait :"), true);
  assertEquals(lines[1].startsWith("Prévu :"), true);
  assertEquals(lines[2].startsWith("Fragile :"), true);
  // Jamais de question.
  assertEquals(content.includes("?"), false);
  // Fait reflète les écritures durables (carte + préférence).
  assertEquals(content.includes("Classement rapide"), true);
  // Prévu rend l'heure LOCALE (11:21), jamais l'UTC (09:21).
  assertEquals(content.includes("09:21"), false);
  assertEquals(content.includes("envoyer la note à Noa"), true);
});

// ---------------------------------------------------------------------------
// CHANTIER C6 (2026-05-28) — Extracteur rappel : quotes prioritaires.
// Déjà couvert par C13 (extractQuotedReminderInstruction). On ajoute l'anti-FP
// exact demandé par le chantier B pour traçabilité.
// ---------------------------------------------------------------------------

Deno.test("C6 anti-FP: 'rappelle-moi de payer le parking' (pas de quote) ne donne pas de quote", async () => {
  const { extractQuotedReminderInstruction } = await import(
    "../tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts"
  );
  assertEquals(
    extractQuotedReminderInstruction("rappelle-moi de payer le parking à 14h"),
    "",
  );
  assertEquals(
    extractQuotedReminderInstruction(
      "rappel à 14h, texte exact 'payer le parking'",
    ),
    "payer le parking",
  );
});

// ===========================================================================
// CHANTIER D2 (2026-05-28) — Le renderer obéit à explicit_no_status. Le
// composer status_only ne doit pas prendre la main quand l'utilisateur a opté
// hors statut. Voir A2-codex-r8 T7.
// ===========================================================================

Deno.test("D2: une demande recap avec opt-out 'pas les statuts système' NE rend PAS le panneau status (A2-r8 T7)", () => {
  const message =
    "Ok, laisse tomber la carte. Résume ce que tu dois retenir de mon piège de ce matin, pas les statuts système : seulement le piège utile.";
  // L'opt-out no-status ("pas les statuts système", pluriel) doit empêcher le
  // composer status_only de prendre la main, même si la phrase ressemble à un
  // recap/status.
  assertEquals(shouldRenderStatusOnlyNoMutation(message), false);
});

Deno.test("D2 anti-régression: un statut sans opt-out rend toujours le panneau status", () => {
  const message =
    "Sans modifier, dis-moi quelle carte est active et quels rappels sont confirmés avec heure exacte.";
  assertEquals(shouldRenderStatusOnlyNoMutation(message), true);
});

Deno.test("C1: status detector still fires on A2-r7 T4, so the product_help guard is what protects it", () => {
  // Le détecteur status matche bien "où le vérifier/annuler dans l'app, sans
  // modifier" (à cause de "sans modifier" + "rappel"). Sans le garde
  // `response_owner !== product_help`, ce match écrasait l'aide produit. On
  // documente que le détecteur reste vrai → la subordination est portée par
  // le garde, pas par un affaiblissement du détecteur.
  assertEquals(
    isStatusOnlyNoMutationRequest(
      "Pour ce rappel ponctuel de 11h55, où est-ce que je peux le vérifier ou l'annuler dans l'app ? Juste l'emplacement, sans modifier.",
    ),
    true,
  );
});

// ===========================================================================
// CHANTIER G0 (2026-05-29) — status/recap ne préempte jamais une commande
// d'opération explicite. Voir edgecases-r3 T5 (rappel "14h20 ou 16h10") et
// syncskills-r2 T2 (carte d'attaque). Symétrique de F2 côté opérations.
// ===========================================================================

Deno.test("G0: une création de rappel avec deux horaires candidats est une commande d'opération (edgecases-r3 T5)", () => {
  assertEquals(
    isExplicitOperationCommand(
      "Mets-moi plutôt un rappel pour vérifier les 5 lignes du devis, mais j'hésite : 14h20 ou 16h10.",
    ),
    true,
  );
});

Deno.test("G0: un ordre d'exécution explicite de rappel est une commande d'opération (edgecases-r3 T7)", () => {
  assertEquals(
    isExplicitOperationCommand(
      "Rappel neutre. Programme-le maintenant pour aujourd'hui à 16h10.",
    ),
    true,
  );
});

Deno.test("G0: une création explicite de carte d'attaque est une commande d'opération (syncskills-r2 T2)", () => {
  assertEquals(
    isExplicitOperationCommand(
      "Prepare-moi une carte d'attaque pour ce moment-là.",
    ),
    true,
  );
});

Deno.test("G0 anti-FP: un récap de lecture pure n'est PAS une commande d'opération (edgecases-r3 T15)", () => {
  assertEquals(
    isExplicitOperationCommand(
      "Merci. Fais le recap exact : carte créée ou non, rappel créé ou annulé, et le piège messages/devis à retenir.",
    ),
    false,
  );
  // Et il reste éligible au rendu status (le composer n'est pas désarmé).
  assertEquals(
    shouldRenderStatusOnlyNoMutation(
      "Merci. Fais le recap exact : carte créée ou non, rappel créé ou annulé.",
    ),
    true,
  );
});

Deno.test("G0 anti-FP: une vraie question d'heure exacte n'est PAS une commande d'opération", () => {
  assertEquals(
    isExplicitOperationCommand(
      "Quelle heure as-tu vraiment programmée pour mon rappel, 11h05 ou 11h20 ?",
    ),
    false,
  );
});

// ===========================================================================
// CHANTIER G3 (2026-05-29) — annulation explicite d'un rappel ponctuel. Voir
// edgecases-r3 T9/T10.
// ===========================================================================

Deno.test("G3: 'annule le rappel de 16h10' est une annulation explicite (edgecases-r3 T9)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Alors annule le rappel de 16h10. Je ne veux plus de ping, ça me stresse.",
    ),
    true,
  );
});

Deno.test("G3: 'coupe ce ping' / 'annule-le vraiment' (avec ping) sont des annulations", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel("coupe ce rappel maintenant"),
    true,
  );
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Zéro ping aujourd'hui. Pas d'alternative, pas de note, juste annule-le vraiment.",
    ),
    true,
  );
});

Deno.test("G3 anti-FP: question produit et négation ne sont pas des annulations", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "où je peux annuler ce rappel dans l'app ?",
    ),
    false,
  );
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "ne l'annule pas, je veux garder le rappel",
    ),
    false,
  );
  assertEquals(
    detectsExplicitOneShotReminderCancel("merci, c'est noté"),
    false,
  );
});

// G3-fix (2026-05-29) — régression annulations non consenties. Voir A14-r1
// T3/T13/T14, normal-conv-r4 T13, edgecases-r4 T15.
Deno.test("G3-fix anti-FP: question produit 'si je veux l'annuler plus tard, je passe par où' (A14-r1 T3)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Question produit: le rappel est bien unique et déjà créé ? Et si je veux l'annuler plus tard, je passe par où ?",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: description passée + refus d'outil (A14-r1 T13)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Ne crée rien d'autre maintenant. La pression monte parce que le rappel a été annulé puis recréé et la carte n'a pas marché. Si tu vois un outil de retour au calme, propose-le seulement, sans le lancer.",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: vérification 'dis si tu viens d'annuler' (A14-r1 T14)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Stop, ne modifie plus rien. Vérifie sans modifier: rappel 16h35, carte de défense, préférence coach, aucune potion lancée, et dis clairement si tu viens d'annuler quelque chose.",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: 'Vérifie sans modifier … l'ancien annulé ?' (normal-conv-r4 T13)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Vérifie sans modifier : est-ce qu'il y a maintenant un rappel à 17h00 ou seulement l'ancien annulé ?",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: récap 'rappel 15h50 créé ou annulé' (edgecases-r4 T15)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Stop. Pour finir, récap exact : carte créée ou non, rappel 15h50 créé ou annulé, et ce que tu dois retenir du piège notifications/doc.",
    ),
    false,
  );
});

Deno.test("G3-fix: une vraie commande combinée annuler+créer reste détectée (normal-conv-r4 T12)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancel(
      "Alors annule l'ancien rappel de 16h20 et crée celui de 17h00 aujourd'hui, texte : revenir au budget.",
    ),
    true,
  );
});

// ===========================================================================
// CHANTIER G4 (2026-05-29) — validation sémantique de la direction de la
// préférence coach (ne pas confirmer un sens inversé). Voir syncskills-r2 T10.
// ===========================================================================

Deno.test("G4: 'geste concret avant de me poser des questions' contredit un patch 'high' (syncskills-r2 T10)", () => {
  assertEquals(
    detectsCoachPreferenceDirectionContradiction(
      "Et côté coaching, garde cette préférence durable : commence par un geste concret de moins de 10 minutes avant de me poser plusieurs questions.",
      { "coach.question_tendency": "high" },
    ),
    true,
  );
});

Deno.test("G4: 'moins de questions' contredit un patch 'high'", () => {
  assertEquals(
    detectsCoachPreferenceDirectionContradiction(
      "Je veux moins de questions de ta part.",
      { "coach.question_tendency": "high" },
    ),
    true,
  );
});

Deno.test("G4: 'plus de questions' contredit un patch 'low'", () => {
  assertEquals(
    detectsCoachPreferenceDirectionContradiction(
      "Pose-moi plus de questions avant d'agir.",
      { "coach.question_tendency": "low" },
    ),
    true,
  );
});

Deno.test("G4 anti-FP: direction cohérente n'est PAS une contradiction", () => {
  // moins de questions + patch low = cohérent
  assertEquals(
    detectsCoachPreferenceDirectionContradiction(
      "commence par un geste concret avant de me poser plusieurs questions",
      { "coach.question_tendency": "low" },
    ),
    false,
  );
  // plus de questions + patch high = cohérent
  assertEquals(
    detectsCoachPreferenceDirectionContradiction(
      "pose-moi plus de questions",
      { "coach.question_tendency": "high" },
    ),
    false,
  );
  // patch sans question_tendency -> rien à valider
  assertEquals(
    detectsCoachPreferenceDirectionContradiction(
      "moins de questions stp",
      { "coach.tone": "doux" },
    ),
    false,
  );
});

// ===========================================================================
// CHANTIER H (2026-05-29) — Correctifs RED hors périmètre G0–G4.
// ===========================================================================

Deno.test("H3: preview mode tunnel sans enregistrement (A2-r12 T10)", () => {
  const msg =
    "Propose seulement la règle mode tunnel, ne l enregistre pas encore.";
  assertEquals(isCoachPreferencePreviewOnlyRequest(msg), true);
  const preview = buildCoachPreferencePreviewReply(msg);
  assertEquals(preview.includes("mode tunnel"), true);
  assertEquals(preview.includes("non enregistrée"), true);
  assertEquals(preview.includes("court"), false);
});

Deno.test("H5: rappel ambigu reste ponctuel, pas récurrent (edgecases-r4 T7)", () => {
  assertEquals(
    shouldPreferOneShotReminderOverRecurring(
      "Programme un rappel à 18h30 avec le texte exact à relire, pas récurrent.",
    ),
    true,
  );
  assertEquals(
    shouldPreferOneShotReminderOverRecurring(
      "Rappelle-moi demain à 9h de reprendre la facture.",
    ),
    true,
  );
});

Deno.test("H6: séquence minute par minute détectée (syncskills-r3 T5/T12)", () => {
  const msg =
    "Programme le rappel à 8h, et donne-moi la séquence minute par minute pour traiter les mails de la facture.";
  assertEquals(detectsMinuteByMinuteSequenceRequest(msg), true);
  const addon = buildMinuteByMinuteSequenceAddon(msg);
  assertEquals(addon?.includes("8:00"), true);
  assertEquals(addon?.includes("10:00"), true);
});
