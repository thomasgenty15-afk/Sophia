import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  applyAttackCardSingleTechniquePreferenceForTest,
  applyCoachResponseStylePreferencesForTest,
  applyCompactStartGuardForTest,
  applyIncompleteRecapGuardForTest,
  applyNonDurableMemoryPromiseGuardForTest,
  applyShortRepairNoProductOfferGuardForTest,
  directProductHelpReplyOverrideForTest,
  directSafetyCrisisReplyOverrideForTest,
  enforceRecommendationToolVisibleReplyForTest,
  isApplyExistingCoachPreferenceRequestForTest,
  applyUnexecutedEffectClaimGuardForTest,
  buildFaitPrevuFragileRecapRuntime,
  buildStatusOnlyNoMutationRuntime,
  isActiveCardDraftingOperationForTest,
  isFaitPrevuFragileRecapRequestForTest,
  isAttackCardCancellationRequestForTest,
  isAttackCardExplicitApprovalForTest,
  isBroadRescueRequestNotDefenseCardForTest,
  isCoachPreferenceExplicitApprovalForTest,
  isCoachPreferenceVerificationRequestForTest,
  isDefenseCardExplicitApprovalForTest,
  isDefenseCardRevisionForPendingDraftForTest,
  detectsCoachPreferenceDirectionContradictionForTest,
  detectsExplicitOneShotReminderCancelForTest,
  isExplicitDefenseCardIntentForTest,
  isExplicitNoToolRequestForTest,
  isExplicitOneShotReminderModificationRequestForTest,
  isExplicitOperationCommandForTest,
  isImmediateModeRequestNotCoachPreferenceForTest,
  isLocalMemoryReformulationRequestForTest,
  isLocalTextRevisionRequestForTest,
  isMicroActionOnlyNotAttackCardForTest,
  isOneShotReminderExactStatusRequestForTest,
  isRuntimeCoachPreferenceRequestForTest,
  isExplicitConversationalFormatRequestForTest,
  isStatusOnlyNoMutationRequestForTest,
  shouldRenderStatusOnlyNoMutationForTest,
  loadRecentActiveAttackCardForUser,
  localTextAddonForOneShotReminderForTest,
  userExplicitlyAsksForNewAttackCardForTest,
  oneShotReminderManagementReplyForTest,
  shouldRuntimeCoachPreferenceOverrideRouteForTest,
  statePotionDeclineReplyForTest,
  detectsPotionFollowUpRefusalForTest,
  detectsExplicitStatePotionExitForTest,
  detectsExplicitNoPotionRequestForTest,
  upsertCoachPreferencesFromDraftForTest,
  detectsExplicitConcreteDeliverableRequestForTest,
  buildExplicitNoPotionConcreteReplyForTest,
  shouldPreferOneShotReminderOverRecurringForTest,
  detectsMinuteByMinuteSequenceRequestForTest,
  buildMinuteByMinuteSequenceAddonForTest,
  isCoachPreferencePreviewOnlyRequestForTest,
  buildCoachPreferencePreviewReplyForTest,
} from "./run.ts";

Deno.test("product_help one-shot reminder reply override keeps the factual skill answer", () => {
  const reply =
    "Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.\n\nPour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement.";
  const overridden = directProductHelpReplyOverrideForTest({
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
  const overridden = directSafetyCrisisReplyOverrideForTest({
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

Deno.test("local text revision is not a coach preference update", () => {
  assertEquals(
    isLocalTextRevisionRequestForTest(
      "Oui, formule-le en une version ultra courte que tu pourrais réutiliser quand je reparle d'un document à écrire.",
    ),
    true,
  );
  assertEquals(
    isLocalTextRevisionRequestForTest(
      "Version ultra. Et pour la suite, pose-moi une seule question courte à la fois.",
    ),
    false,
  );
});

Deno.test("coach preference verification is not a new preference update", () => {
  assertEquals(
    isCoachPreferenceVerificationRequestForTest(
      "Et tu as bien gardé la préférence une seule question courte quand je bloque ?",
    ),
    true,
  );
  assertEquals(
    isCoachPreferenceVerificationRequestForTest(
      "Pour la suite, garde la préférence une seule question courte quand je bloque.",
    ),
    false,
  );
});

Deno.test("attack card explicit approval tolerates a side note", () => {
  assertEquals(
    isAttackCardExplicitApprovalForTest(
      "Oui, crée cette carte. Et garde en tête ce piège: chercher à tout comprendre d'abord me bloque avant le brouillon.",
    ),
    true,
  );
  assertEquals(
    isAttackCardExplicitApprovalForTest(
      "Oui, crée cette carte mais change le texte pour qu'il soit plus court.",
    ),
    false,
  );
});

Deno.test("I1: attack card draft-only wording is not treated as creation approval", () => {
  assertEquals(
    isAttackCardExplicitApprovalForTest(
      "Oui, affiche le brouillon complet maintenant, sans le créer encore.",
    ),
    false,
  );
});

Deno.test("defense card explicit approval wins over generic card wording", () => {
  assertEquals(
    isDefenseCardExplicitApprovalForTest(
      "Oui, crée cette carte. Elle doit m'aider quand je veux esquiver la discussion.",
    ),
    true,
  );
  assertEquals(
    isDefenseCardExplicitApprovalForTest(
      "Oui, crée cette carte mais change le texte pour qu'il soit plus court.",
    ),
    false,
  );
});

Deno.test("defense card pending revision is not routed as adjust_plan_item", () => {
  assertEquals(
    isDefenseCardRevisionForPendingDraftForTest(
      "Change le geste: taper Nora dans la recherche, envoyer le message, puis quitter Slack.",
    ),
    true,
  );
  assertEquals(
    isDefenseCardRevisionForPendingDraftForTest(
      "Oui, valide cette version.",
    ),
    false,
  );
});

Deno.test("local memory reformulation is not a recurring reminder", () => {
  assertEquals(
    isLocalMemoryReformulationRequestForTest(
      "Reformule-le en une phrase ultra courte que tu peux me ressortir quand je dis que je suis fatigué le soir.",
    ),
    true,
  );
  assertEquals(
    isLocalMemoryReformulationRequestForTest(
      "Programme-moi un rappel tous les soirs à 22h30: baisse les exigences.",
    ),
    false,
  );
});

Deno.test("concrete future style request is a coach preference", () => {
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Pour la suite, quand je suis vide comme ca, parle-moi en mode tres concret: une action, pas trois options. Garde cette preference si tu peux.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Mets a jour ma preference coach : quand je dis que je suis confus, reponds plus directement et avec moins d'options.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Le rappel est bon, mais la partie 'je prefere les consignes tres courtes' n'etait pas le texte du rappel : c'est une preference de coaching a retenir.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Je veux vraiment que tu enregistres ça comme préférence de coaching: quand je suis fatigué, une seule action concrète à la fois, pas plusieurs options.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Pour la suite, enregistre une préférence de coaching: quand je dis que je suis vidé ou vraiment crevé, je veux une seule action concrète à la fois, pas trois options.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Garde comme repère dans cette conversation que journée brouillée = choisir une seule zone.",
    ),
    false,
  );
  assertEquals(
    isApplyExistingCoachPreferenceRequestForTest(
      "Pas de potion maintenant. Applique plutôt ma préférence: une seule question ou une seule action courte.",
    ),
    true,
  );
  assertEquals(
    isApplyExistingCoachPreferenceRequestForTest(
      "Non, ne lance rien. Donne-moi juste la prochaine mini-action en respectant ma préférence: une seule action.",
    ),
    true,
  );
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Pas de potion maintenant. Applique plutôt ma préférence: une seule question ou une seule action courte.",
    ),
    false,
  );
});

Deno.test("explicit no-tool requests block operation starts", () => {
  assertEquals(
    isExplicitNoToolRequestForTest(
      "Merci. Ne lance rien d'autre maintenant, même pas une potion. Fais-moi juste le récap.",
    ),
    true,
  );
  assertEquals(
    isExplicitNoToolRequestForTest(
      "Non, ne lance rien. Donne-moi juste la prochaine mini-action pour ne pas tout refaire.",
    ),
    true,
  );
});

Deno.test("micro-action only requests do not start attack cards", () => {
  assertEquals(
    isMicroActionOnlyNotAttackCardForTest(
      "Je veux juste le premier geste, pas une méthode complète.",
    ),
    true,
  );
  assertEquals(
    isMicroActionOnlyNotAttackCardForTest(
      "Fais-moi une carte d'attaque pour la cotisation.",
    ),
    false,
  );
});

Deno.test("attack card cancellation exits active card flow", () => {
  assertEquals(
    isAttackCardCancellationRequestForTest(
      "Stop carte. Donne-moi juste une phrase de début.",
    ),
    true,
  );
});

Deno.test("explicit coach preference overrides active conversation/product routes", () => {
  assertEquals(
    shouldRuntimeCoachPreferenceOverrideRouteForTest({
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
    shouldRuntimeCoachPreferenceOverrideRouteForTest({
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
    isImmediateModeRequestNotCoachPreferenceForTest(
      "J'ai envie d'un mode calme maintenant, pas d'un plan militaire.",
    ),
    true,
  );
  assertEquals(
    isImmediateModeRequestNotCoachPreferenceForTest(
      "Pour la suite, parle-moi en mode tres concret: une action, pas trois options.",
    ),
    false,
  );
});

Deno.test("broad evening rescue request is not a defense card start", () => {
  assertEquals(
    isBroadRescueRequestNotDefenseCardForTest(
      "Je rentre du boulot completement vide. Je veux juste sauver ma soiree sans me mettre la pression, sinon je vais finir sur mon telephone jusqu'a minuit.",
    ),
    true,
  );
  assertEquals(
    isBroadRescueRequestNotDefenseCardForTest(
      "Je rentre tard et je suis vide. Aide-moi a sauver le minimum avec mon telephone dans la main, sans grand plan.",
    ),
    true,
  );
  assertEquals(
    isBroadRescueRequestNotDefenseCardForTest(
      "J'aimerais une carte de defense pour le moment ou je m'assois sur le canape et que j'ouvre TikTok.",
    ),
    false,
  );
  assertEquals(
    isBroadRescueRequestNotDefenseCardForTest(
      "Maintenant le vrai piege c'est TikTok. Prepare-moi une carte de defense pour ce moment precis.",
    ),
    false,
  );
  assertEquals(
    isImmediateModeRequestNotCoachPreferenceForTest(
      "Maintenant le vrai piege c'est TikTok. Prepare-moi une carte de defense pour ce moment precis.",
    ),
    false,
  );
});

Deno.test("coach preference explicit approval accepts exact confirmation", () => {
  assertEquals(
    isCoachPreferenceExplicitApprovalForTest(
      "Oui, c'est exactement ca: une action concrete a la fois quand je suis vide.",
    ),
    true,
  );
});

Deno.test("one-shot reminder management question gets factual product wording", () => {
  const reply = oneShotReminderManagementReplyForTest(
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
  const reply = oneShotReminderManagementReplyForTest(
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

Deno.test("short emotional repair guard removes product offers", () => {
  const guarded = applyShortRepairNoProductOfferGuardForTest({
    userMessage:
      "Je culpabilise un peu. Réponds court, aide-moi à redescendre.",
    responseContent:
      "Tu as déjà avancé. Ce n'est pas rien.\n\nRespire une fois et laisse la session se terminer là.\n\nTu veux qu'on choisisse une Potion d'état apaisement avant de continuer ? 🙂",
  });
  assertEquals(guarded.includes("Potion"), false);
  assertEquals(guarded.includes("Tu veux"), false);
  assertEquals(guarded.includes("Respire"), true);
});

Deno.test("attack card low-question preference collapses technique choices", () => {
  const guarded = applyAttackCardSingleTechniquePreferenceForTest({
    needed: true,
    slot: "technique",
    status: "missing",
    reason: "structured_ai_missing_technique",
    technique_options: [
      {
        technique_key: "preparer_terrain",
        title: "Preparer le terrain",
        description: "micro-setup",
        reason: "réduit la friction",
        example: "ouvrir le dossier",
      },
      {
        technique_key: "texte_recadrage",
        title: "Le texte magique",
        description: "phrase courte",
        reason: "coupe la négociation interne",
        example: "je commence par une facture",
        recommended: true,
      },
      {
        technique_key: "ancre_visuelle",
        title: "Ancre visuelle",
        description: "signal physique",
        reason: "déclenche le départ",
        example: "post-it",
      },
    ],
    known_slots: { target: { kind: "personal_action", title: "admin" } },
  }, { preferSingleTechnique: true }) as any;
  assertEquals(guarded.technique_options.length, 1);
  assertEquals(guarded.technique_options[0].technique_key, "texte_recadrage");
  assertEquals(guarded.question.includes("On part là-dessus"), true);
  assertEquals(
    guarded.known_slots.suggested_attack_technique,
    "texte_recadrage",
  );
});

Deno.test("state potion opportunity does not append mechanical product copy", () => {
  const response = enforceRecommendationToolVisibleReplyForTest({
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

Deno.test("compact start guard collapses A/B plans into one gesture", () => {
  const guarded = applyCompactStartGuardForTest({
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
    isStatusOnlyNoMutationRequestForTest(
      "Avant que je coupe, fais-moi le récap: qu'est-ce qui a vraiment été créé ou gardé, et qu'est-ce qui était juste pour la conversation ?",
    ),
    true,
  );
});

Deno.test("incomplete recap intro gets a minimal fallback body", () => {
  const guarded = applyIncompleteRecapGuardForTest({
    userMessage: "Fais-moi juste le récap de ce qu'on a fixé.",
    responseContent:
      "C'est entendu. Voici le récap de ce qu'on a fixé pour aujourd'hui : 🙂",
  });
  assertEquals(guarded.includes("- "), true);
  assertEquals(guarded.endsWith(": 🙂"), false);
});

Deno.test("short no-tool repair removes state-potion choice offers", () => {
  const guarded = applyShortRepairNoProductOfferGuardForTest({
    userMessage: "Réponds court, pas de potion et ne lance rien.",
    responseContent:
      "Ok. Pose le téléphone et écris juste la première phrase.\n\nTu veux que je choisisse entre Guérison et Amour ?",
  });
  assertEquals(guarded.includes("Guérison"), false);
  assertEquals(guarded.includes("Amour"), false);
});

Deno.test("explicit defense card intent is separate from attack card wording", () => {
  assertEquals(
    isExplicitDefenseCardIntentForTest(
      "Prépare-moi une carte de défense pour répondre calmement quand Nora m'accuse sur Slack.",
    ),
    true,
  );
});

Deno.test("existing one-shot reminder modification is not a plan adjustment", () => {
  assertEquals(
    isExplicitOneShotReminderModificationRequestForTest(
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
    isExplicitOneShotReminderModificationRequestForTest(
      "Pour le rappel de 11h50, si je veux le vérifier ou l'annuler dans l'app, je vais où ? Juste l'emplacement, ne change rien.",
    ),
    false,
  );
});

Deno.test("'sans parler de le modifier' n'est PAS une demande de modification (A2-r6 T8)", () => {
  assertEquals(
    isExplicitOneShotReminderModificationRequestForTest(
      "Et pour le rappel ponctuel de 11h50, juste l'emplacement où je peux le vérifier dans l'app, sans parler de le modifier.",
    ),
    false,
  );
});

Deno.test("'où je vais modifier/supprimer dans l'app' est du product_help, pas une modification (A3-r7 T3)", () => {
  assertEquals(
    isExplicitOneShotReminderModificationRequestForTest(
      "Si je veux modifier ou supprimer ce rappel dans l'app, je vais où ? Ne change rien, je veux juste l'emplacement.",
    ),
    false,
  );
});

Deno.test("une vraie demande de modification reste détectée (régression chantier 14)", () => {
  // On vérifie qu'on ne casse pas le cas positif.
  assertEquals(
    isExplicitOneShotReminderModificationRequestForTest(
      "Décale ce rappel à 14h, même texte.",
    ),
    true,
  );
  assertEquals(
    isExplicitOneShotReminderModificationRequestForTest(
      "Reprogramme le rappel ponctuel à 18h30, garde le même message.",
    ),
    true,
  );
});

Deno.test("one-shot reminder exact status request is detected", () => {
  assertEquals(
    isOneShotReminderExactStatusRequestForTest(
      "L'heure vraiment enregistrée du rappel, c'est 11h05 ou 11h20 ?",
    ),
    true,
  );
});

Deno.test("concise durable coach preference is detected", () => {
  assertEquals(
    isRuntimeCoachPreferenceRequestForTest(
      "Préférence durable: réponds en 3 lignes max, sans question finale.",
    ),
    true,
  );
});

Deno.test("coach response style preferences remove emoji and final question", () => {
  const styled = applyCoachResponseStylePreferencesForTest({
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
  const addon = localTextAddonForOneShotReminderForTest(
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
          "coach.emoji_policy": "none",
          "coach.response_max_lines": "three",
          "coach.final_question_policy": "avoid_unnecessary",
          "coach.action_first_policy": "concrete_before_questions",
        },
        summary:
          "zéro emoji, trois lignes max, pas de question finale, action d'abord.",
      },
      confirmation_message: "Confirmer ?",
      confirmation_actions: ["yes", "no"],
    },
  });
  assertEquals(result.error, null);
  assertEquals(result.data?.keys, [
    "coach.emoji_policy",
    "coach.response_max_lines",
    "coach.final_question_policy",
    "coach.action_first_policy",
  ]);
  assertEquals(
    rowsSeen.map((row) => row.value.value),
    ["none", "three", "avoid_unnecessary", "concrete_before_questions"],
  );
});

Deno.test("state potion decline keeps concrete continuation context", () => {
  const reply = statePotionDeclineReplyForTest(
    "Pas de potion pour le moment. Je vais faire la pile temporaire. Ensuite le piège c'est que j'ouvre Slack pour envoyer un message et je pars lire dix conversations.",
  );
  assertEquals(reply.includes("je ne lance pas de potion"), true);
  assertEquals(reply.includes("recherche"), true);
  assertEquals(reply.includes("quitte l'app"), true);
});

Deno.test("explicit memory retention wording does not overpromise durable memory", () => {
  const guarded = applyNonDurableMemoryPromiseGuardForTest({
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
  const guardedBienNote = applyNonDurableMemoryPromiseGuardForTest({
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
  const guardedConversationRepere = applyNonDurableMemoryPromiseGuardForTest({
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
// Voir docs/agent-playbook/13-architecture-skills, section Couche L3.
// ---------------------------------------------------------------------------

Deno.test("explicit conversational format request: 'fait, prévu, fragile' is detected (A2-r4 T13)", () => {
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
      "Ne lance rien maintenant, pas de potion, pas de nouveau rappel. Fais seulement le récap: fait, prévu, fragile, en trois lignes.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'pas de statut système' + 'trois lignes' (A2-r4 T14)", () => {
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
      "Ce n'est pas le récap demandé. Pas de statut système: seulement fait, prévu, fragile. Trois lignes, sans emoji.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'réponds en une ligne' is detected (A4-r4 T14)", () => {
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
      "Donc pour le rappel à 11h12 : confirmé ou non confirmé ? Réponds en une ligne.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'récap conversationnel' is detected (A6-r2 T15)", () => {
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
      "On s'arrête là. Fais seulement un récap conversationnel final.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request: 'une seule phrase' is detected", () => {
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
      "Donne-moi une seule phrase qui me remet au calme, pas plus.",
    ),
    true,
  );
});

Deno.test("explicit conversational format request stays false on a normal status request", () => {
  // Garde-fou: une demande status sans contrainte de format ne doit PAS
  // matcher. Sinon le composer status_only ne se déclenchera plus du tout.
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
      "Sans rien modifier, vérifie ce qui est en place: carte, rappel, préférence coach.",
    ),
    false,
  );
});

Deno.test("explicit conversational format request stays false on a generic 'short' request", () => {
  // "Court" tout seul n'est pas une contrainte explicite de format
  // conversationnel: le composer status_only à 4 lignes reste légitime.
  assertEquals(
    isExplicitConversationalFormatRequestForTest("Réponds court."),
    false,
  );
});

Deno.test("explicit conversational format request stays false on a card title containing 'X lignes'", () => {
  // Anti-faux-positif: "carte Samir 3 lignes" est le titre d'une carte
  // d'attaque (A6-r2). On NE DOIT PAS matcher "3 lignes" comme contrainte
  // de format. Le contexte demande "ce qui est en place" → status panel
  // canonique légitime.
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
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
    isExplicitConversationalFormatRequestForTest(
      "Oui, prepare une carte d'attaque. Action: envoyer trois lignes a Samir avant d'aligner le bureau.",
    ),
    false,
  );
});

Deno.test("explicit conversational format request stays false when 'une phrase' is an object to write", () => {
  // Anti-faux-positif: "écris une phrase pour Samir" — "une phrase" est
  // l'objet de l'action, pas une contrainte sur la réponse de Sophia.
  assertEquals(
    isExplicitConversationalFormatRequestForTest(
      "Donne-moi une phrase courte pour Lina, et rappelle-moi à 11h35.",
    ),
    false,
  );
});

Deno.test("status_only and explicit-format detectors can overlap (the format guard wins)", () => {
  // Sur les tours A2-r4 T13/T14, isStatusOnlyNoMutationRequestForTest
  // retournait true (à cause de "en place" / "ce qu'on a fait"), ce qui
  // déclenchait le panneau. La garde de format ferme la porte avant.
  const userMessage =
    "Ne lance rien maintenant, pas de potion. Fais seulement le récap: fait, prévu, fragile, en trois lignes.";
  assertEquals(isStatusOnlyNoMutationRequestForTest(userMessage), false);
  assertEquals(
    isExplicitConversationalFormatRequestForTest(userMessage),
    true,
  );
});

// ---------------------------------------------------------------------------
// Régression chantier 4 (2026-05-28): garde anti-doublon prepare_attack_card.
// Voir A2-r4 Tour 8 et docs/agent-playbook/13-architecture-skills.
// ---------------------------------------------------------------------------

function makeFakeSupabaseAttackCardsTable(rows: unknown[]) {
  return {
    from(table: string) {
      // Le helper interroge uniquement user_attack_cards.
      assertEquals(table, "user_attack_cards");
      const builder: any = {
        select(_cols: string) {
          return this;
        },
        eq(_col: string, _val: unknown) {
          return this;
        },
        order(_col: string, _opts?: any) {
          return this;
        },
        limit(_n: number) {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  } as any;
}

Deno.test("userExplicitlyAsksForNewAttackCardForTest detects 'nouvelle carte'", () => {
  assertEquals(
    userExplicitlyAsksForNewAttackCardForTest(
      "Cree-moi une nouvelle carte pour la session de travail du soir.",
    ),
    true,
  );
});

Deno.test("userExplicitlyAsksForNewAttackCardForTest detects 'une autre carte'", () => {
  assertEquals(
    userExplicitlyAsksForNewAttackCardForTest(
      "Fais-moi une autre carte pour le rangement du sas.",
    ),
    true,
  );
});

Deno.test("userExplicitlyAsksForNewAttackCardForTest detects 'encore une carte'", () => {
  assertEquals(
    userExplicitlyAsksForNewAttackCardForTest(
      "Encore une carte stp, pour la facture cette fois.",
    ),
    true,
  );
});

Deno.test("userExplicitlyAsksForNewAttackCardForTest stays false when user references existing card (A2-r4 T8)", () => {
  // Régression: le bug consistait justement à recréer une carte quand le
  // user en référençait une existante. La garde NE DOIT PAS matcher ici.
  assertEquals(
    userExplicitlyAsksForNewAttackCardForTest(
      "Je ne parle pas du rappel, je parle de la carte d'attaque que tu viens de créer. Donne juste l'emplacement.",
    ),
    false,
  );
});

Deno.test("userExplicitlyAsksForNewAttackCardForTest stays false on a fresh card request without 'nouvelle'", () => {
  // "Crée une carte d'attaque" sans qualificateur n'est pas une demande
  // explicite de NOUVELLE carte. Si une carte existe déjà, on doit
  // déclencher la clarification (la garde retourne false ici, et le
  // garde-fou de run.ts demandera au user).
  assertEquals(
    userExplicitlyAsksForNewAttackCardForTest(
      "Crée-moi une carte d'attaque pour le mail à Lina.",
    ),
    false,
  );
});

Deno.test("loadRecentActiveAttackCardForUser returns null when no active card exists", async () => {
  const supabase = makeFakeSupabaseAttackCardsTable([]);
  const result = await loadRecentActiveAttackCardForUser({
    supabase,
    userId: "u1",
  });
  assertEquals(result, null);
});

Deno.test("loadRecentActiveAttackCardForUser returns the card when created recently", async () => {
  const recentIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabaseAttackCardsTable([{
    id: "card-1",
    generated_at: recentIso,
    content: {
      operation_draft: {
        title: "Payer la facture une fois pour toutes",
        technique: "ancre_visuelle",
      },
    },
  }]);
  const result = await loadRecentActiveAttackCardForUser({
    supabase,
    userId: "u1",
  });
  if (!result) throw new Error("expected a card");
  assertEquals(result.id, "card-1");
  assertEquals(result.title, "Payer la facture une fois pour toutes");
  assertEquals(result.technique, "ancre_visuelle");
  // Age dans la fenêtre <5 min: passe.
  assertEquals(result.ageSeconds >= 100 && result.ageSeconds <= 200, true);
});

Deno.test("loadRecentActiveAttackCardForUser returns null when card is too old (>5 min)", async () => {
  const oldIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabaseAttackCardsTable([{
    id: "card-old",
    generated_at: oldIso,
    content: {
      operation_draft: { title: "Carte ancienne" },
    },
  }]);
  const result = await loadRecentActiveAttackCardForUser({
    supabase,
    userId: "u1",
  });
  assertEquals(result, null);
});

Deno.test("loadRecentActiveAttackCardForUser respects custom maxAgeSeconds", async () => {
  const iso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabaseAttackCardsTable([{
    id: "card-mid",
    generated_at: iso,
    content: { operation_draft: { title: "Carte" } },
  }]);
  // Avec maxAgeSeconds = 1200 (20 min), la carte de 10 min passe.
  const inWindow = await loadRecentActiveAttackCardForUser({
    supabase: makeFakeSupabaseAttackCardsTable([{
      id: "card-mid",
      generated_at: iso,
      content: { operation_draft: { title: "Carte" } },
    }]),
    userId: "u1",
    maxAgeSeconds: 1200,
  });
  if (!inWindow) throw new Error("expected card in 20-min window");
  assertEquals(inWindow.id, "card-mid");
  // Avec maxAgeSeconds = 60 (1 min), la carte de 10 min est éjectée.
  const outOfWindow = await loadRecentActiveAttackCardForUser({
    supabase,
    userId: "u1",
    maxAgeSeconds: 60,
  });
  assertEquals(outOfWindow, null);
});

Deno.test("loadRecentActiveAttackCardForUser swallows DB errors and returns null", async () => {
  const supabase = {
    from(_table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: null, error: { message: "DB down" } });
        },
      };
    },
  } as any;
  const result = await loadRecentActiveAttackCardForUser({
    supabase,
    userId: "u1",
  });
  assertEquals(result, null);
});

Deno.test("loadRecentActiveAttackCardForUser returns null when supabase has no .from method", async () => {
  const result = await loadRecentActiveAttackCardForUser({
    supabase: {} as any,
    userId: "u1",
  });
  assertEquals(result, null);
});

// ---------------------------------------------------------------------------
// CHANTIER C1 (2026-05-28) — Subordination du status (L4).
// Le bloc `status_only_request_blocks_tool_start` est gardé par:
//   1. routeDecision.response_owner !== "product_help" (status cède à
//      product_help) — A2-r7 T4, A4-r6 T14, A3-r8 T3.
//   2. !isActiveCardDraftingOperationForTest(activeOperationIntake) (status
//      ne tue pas un flow de carte) — A3-r8 T6/T8.
// Scope limité aux cartes pour ne pas régresser A4-r6 T11 (coach actif).
// ---------------------------------------------------------------------------

Deno.test("C1: isActiveCardDraftingOperationForTest is true for attack/defense card flows", () => {
  assertEquals(
    isActiveCardDraftingOperationForTest({
      operation_type: "prepare_attack_card",
    }),
    true,
  );
  assertEquals(
    isActiveCardDraftingOperationForTest({
      operation_type: "prepare_defense_card",
    }),
    true,
  );
});

Deno.test("C1 anti-régression: isActiveCardDraftingOperationForTest is false for coach/other/none (protège A4-r6 T11)", () => {
  // A4-r6 T11: un intake update_coach_preferences est actif, mais une vraie
  // question de statut doit toujours passer. Le garde C1 ne doit PAS le
  // considérer comme un flow de carte.
  assertEquals(
    isActiveCardDraftingOperationForTest({
      operation_type: "update_coach_preferences",
    }),
    false,
  );
  assertEquals(
    isActiveCardDraftingOperationForTest({ operation_type: "adjust_plan_item" }),
    false,
  );
  assertEquals(isActiveCardDraftingOperationForTest(null), false);
  assertEquals(isActiveCardDraftingOperationForTest(undefined), false);
  assertEquals(isActiveCardDraftingOperationForTest({}), false);
});

// ---------------------------------------------------------------------------
// CHANTIER C2 (2026-05-28) — Garde anti-hallucination « c'est fait » (L5).
// ---------------------------------------------------------------------------

Deno.test("C2: neutralizes a false reminder-done claim when no tool executed (A4-r6 T6)", () => {
  // A4-r6 T6: le routeur voulait create_one_shot_reminder mais rien n'a été
  // exécuté (executed_tools=[]), et la réponse affirmait le rappel
  // ("correspond bien à ce que j'ai déjà indiqué" + ✅ + "reste actif").
  const guarded = applyUnexecutedEffectClaimGuardForTest({
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
  const guarded = applyUnexecutedEffectClaimGuardForTest({
    responseContent: reply,
    intendedTools: ["create_one_shot_reminder"],
    executedTools: ["create_one_shot_reminder"],
  });
  assertEquals(guarded, reply);
});

Deno.test("C2 anti-FP: an already-honest 'je n'ai pas pu' reply is left intact", () => {
  const reply =
    "Je n'ai pas pu programmer ce rappel maintenant. Il y a eu un souci technique côté outil.";
  const guarded = applyUnexecutedEffectClaimGuardForTest({
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
  const guarded = applyUnexecutedEffectClaimGuardForTest({
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
  assertEquals(content.includes("relire le brief de Lina avant la réunion"), true);
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
      { key: "coach.tone", value: { value: "chaleureux" }, status: "active", source_type: "system_default" },
      { key: "coach.question_tendency", value: { value: "balanced" }, status: "active", source_type: "system_default" },
      { key: "coach.emoji_policy", value: { value: "normal" }, status: "active", source_type: "system_default" },
    ],
  });
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase,
    userId: "u1",
    tempMemory: {},
    userTimezone: "Europe/Paris",
    userMessage: "Sans rien modifier, quelles préférences coach sont en place ?",
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
      { key: "coach.response_max_lines", value: { value: "three" }, status: "active", source_type: "explicit_user" },
      { key: "coach.tone", value: { value: "chaleureux" }, status: "active", source_type: "system_default" },
      { key: "coach.emoji_policy", value: { value: "normal" }, status: "active", source_type: "system_default" },
    ],
  });
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase,
    userId: "u1",
    tempMemory: {},
    userTimezone: "Europe/Paris",
    userMessage: "Sans rien modifier, quelles préférences coach sont en place ?",
  });
  const content = String(runtime.content ?? "");
  // La préférence explicite est annoncée.
  assertEquals(content.includes("trois lignes max"), true);
  // Les defaults sont mentionnés comme valeur par défaut, pas comme choix.
  assertEquals(content.includes("valeur par défaut système"), true);
  assertEquals((runtime.toolSkillRun as any)?.coach_preference_found, true);
});

// ---------------------------------------------------------------------------
// CHANTIER C5 (2026-05-28) — Contrat de format « fait / prévu / fragile ».
// ---------------------------------------------------------------------------

Deno.test("C5: detects the 'fait/prévu/fragile' recap contract (A2-r7 T13/T14)", () => {
  assertEquals(
    isFaitPrevuFragileRecapRequestForTest(
      "Ne lance rien maintenant, pas de potion. Fais seulement le récap: fait, prévu, fragile, en trois lignes. Pas de question.",
    ),
    true,
  );
  assertEquals(
    isFaitPrevuFragileRecapRequestForTest(
      "Fais-le maintenant: trois lignes seulement, fait / prévu / fragile, heure France, pas de question.",
    ),
    true,
  );
});

Deno.test("C5 anti-FP: a normal message does not match the fait/prévu/fragile sequence", () => {
  assertEquals(
    isFaitPrevuFragileRecapRequestForTest(
      "C'est fait, je me sens un peu fragile mais ça va.",
    ),
    false,
  );
  assertEquals(
    isFaitPrevuFragileRecapRequestForTest("Donne-moi le récap court."),
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
  const { extractQuotedReminderInstruction } = await import("../tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts");
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
  assertEquals(shouldRenderStatusOnlyNoMutationForTest(message), false);
});

Deno.test("D2 anti-régression: un statut sans opt-out rend toujours le panneau status", () => {
  const message =
    "Sans modifier, dis-moi quelle carte est active et quels rappels sont confirmés avec heure exacte.";
  assertEquals(shouldRenderStatusOnlyNoMutationForTest(message), true);
});

Deno.test("C1: status detector still fires on A2-r7 T4, so the product_help guard is what protects it", () => {
  // Le détecteur status matche bien "où le vérifier/annuler dans l'app, sans
  // modifier" (à cause de "sans modifier" + "rappel"). Sans le garde
  // `response_owner !== product_help`, ce match écrasait l'aide produit. On
  // documente que le détecteur reste vrai → la subordination est portée par
  // le garde, pas par un affaiblissement du détecteur.
  assertEquals(
    isStatusOnlyNoMutationRequestForTest(
      "Pour ce rappel ponctuel de 11h55, où est-ce que je peux le vérifier ou l'annuler dans l'app ? Juste l'emplacement, sans modifier.",
    ),
    true,
  );
});

// ===========================================================================
// CHANTIER E0 (2026-05-28) — Potion : refus de programmation = aucun effet
// durable. Détecteur de consentement. Voir A3-r10 T6 ("ne programme rien").
// ===========================================================================

Deno.test("E0: 'ne programme rien' est détecté comme refus de programmation (A3-r10 T6)", () => {
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "Non, ne programme rien. Je veux la phrase maintenant, et je répète : ne mémorise pas le nom du client.",
    ),
    true,
  );
});

Deno.test("E0: variantes 'pas de rappel' / 'aucun suivi' / 'sans relance' détectées", () => {
  assertEquals(detectsPotionFollowUpRefusalForTest("surtout pas de rappel"), true);
  assertEquals(detectsPotionFollowUpRefusalForTest("je ne veux aucun suivi"), true);
  assertEquals(detectsPotionFollowUpRefusalForTest("sans relance stp"), true);
  assertEquals(
    detectsPotionFollowUpRefusalForTest("ne me programme aucun rappel"),
    true,
  );
});

Deno.test("E0 anti-FP: une demande normale de potion/rappel n'est pas un refus", () => {
  // Pas de négation : on ne doit pas suspendre la programmation.
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "Oui. Écris la phrase maintenant.",
    ),
    false,
  );
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "Lance vraiment l'apaisement maintenant, pas une analyse.",
    ),
    false,
  );
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "programme-moi un rappel tous les matins",
    ),
    false,
  );
});

// ===========================================================================
// CHANTIER F0 (2026-05-29) — Potion : généralise E0. Le refus de récurrence
// peut prendre d'autres formes (operations-r2 T7/T10/T13) et doit aussi être
// capté pour bloquer tout effet durable non consenti.
// ===========================================================================

Deno.test("F0: refus de récurrence variantes operations-r2 (T7/T10/T13)", () => {
  // T7
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "lance une potion d'apaisement courte pour maintenant seulement, pas de rituel récurrent",
    ),
    true,
  );
  // T10
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "Je confirme seulement une potion maintenant, sans rappel, sans demain, sans semaine.",
    ),
    true,
  );
  // T13
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "Oui, je suis d'accord : programme ce rappel ponctuel à 14h35, rien d'autre.",
    ),
    true,
  );
});

Deno.test("F0: autres formulations de refus de suivi durable", () => {
  assertEquals(detectsPotionFollowUpRefusalForTest("pas de routine"), true);
  assertEquals(detectsPotionFollowUpRefusalForTest("non récurrent"), true);
  assertEquals(detectsPotionFollowUpRefusalForTest("une seule fois"), true);
  assertEquals(
    detectsPotionFollowUpRefusalForTest("juste pour maintenant"),
    true,
  );
  assertEquals(
    detectsPotionFollowUpRefusalForTest("non pour le suivi du matin"),
    true,
  );
  assertEquals(detectsPotionFollowUpRefusalForTest("rien d'autre"), true);
  // apostrophe typographique
  assertEquals(detectsPotionFollowUpRefusalForTest("rien d’autre"), true);
});

Deno.test("F0 anti-FP: une demande de suivi/récurrence légitime n'est pas un refus", () => {
  assertEquals(
    detectsPotionFollowUpRefusalForTest(
      "Oui, programme un rappel récurrent chaque matin à 8h.",
    ),
    false,
  );
  assertEquals(
    detectsPotionFollowUpRefusalForTest("Active le rituel du soir stp"),
    false,
  );
  assertEquals(
    detectsPotionFollowUpRefusalForTest("Je veux un suivi quotidien"),
    false,
  );
});

// ===========================================================================
// CHANTIER E1 (2026-05-28) — Potion : sortie propre sur STOP explicite. Voir
// A3-r10 T8 ("Stop potion. Où je vois dans l'app...").
// ===========================================================================

Deno.test("E1: 'Stop potion' est détecté comme sortie explicite (A3-r10 T8)", () => {
  assertEquals(
    detectsExplicitStatePotionExitForTest(
      "Stop potion. Où je vois dans l'app qu'une potion ou un mode comme ça est actif ? Et comment je l'arrête ?",
    ),
    true,
  );
});

Deno.test("E1: variantes d'arrêt explicites détectées", () => {
  assertEquals(detectsExplicitStatePotionExitForTest("arrête la potion"), true);
  assertEquals(
    detectsExplicitStatePotionExitForTest("annule la potion s'il te plaît"),
    true,
  );
  assertEquals(
    detectsExplicitStatePotionExitForTest("laisse tomber la potion"),
    true,
  );
  assertEquals(
    detectsExplicitStatePotionExitForTest("désactive ce mode"),
    true,
  );
});

// ===========================================================================
// CHANTIER E3 (2026-05-28) — Le garde L4 explicit_defense_card_intent est
// subordonné à une préférence durable. Voir A11 T9/T10.
// ===========================================================================

Deno.test("E3: une demande explicite de création de carte de défense reste détectée (anti-FP)", () => {
  // Le garde défense doit continuer de fonctionner pour une vraie création.
  assertEquals(
    isExplicitDefenseCardIntentForTest(
      "Crée une carte de défense pour mon piège crypto: moment où ça craque = j'ouvre l'onglet; plan = fermer l'onglet.",
    ),
    true,
  );
});

Deno.test("E1 anti-FP: lancer/continuer une potion n'est pas une sortie", () => {
  assertEquals(
    detectsExplicitStatePotionExitForTest("Lance la potion d'apaisement maintenant"),
    false,
  );
  assertEquals(
    detectsExplicitStatePotionExitForTest("oui je veux bien cette potion"),
    false,
  );
  // Aucune cible potion/mode -> pas de sortie potion.
  assertEquals(
    detectsExplicitStatePotionExitForTest("stop, j'ai compris merci"),
    false,
  );
});

// ===========================================================================
// CHANTIER G0 (2026-05-29) — status/recap ne préempte jamais une commande
// d'opération explicite. Voir edgecases-r3 T5 (rappel "14h20 ou 16h10") et
// syncskills-r2 T2 (carte d'attaque). Symétrique de F2 côté opérations.
// ===========================================================================

Deno.test("G0: une création de rappel avec deux horaires candidats est une commande d'opération (edgecases-r3 T5)", () => {
  assertEquals(
    isExplicitOperationCommandForTest(
      "Mets-moi plutôt un rappel pour vérifier les 5 lignes du devis, mais j'hésite : 14h20 ou 16h10.",
    ),
    true,
  );
});

Deno.test("G0: un ordre d'exécution explicite de rappel est une commande d'opération (edgecases-r3 T7)", () => {
  assertEquals(
    isExplicitOperationCommandForTest(
      "Rappel neutre. Programme-le maintenant pour aujourd'hui à 16h10.",
    ),
    true,
  );
});

Deno.test("G0: une création explicite de carte d'attaque est une commande d'opération (syncskills-r2 T2)", () => {
  assertEquals(
    isExplicitOperationCommandForTest(
      "Prepare-moi une carte d'attaque pour ce moment-là.",
    ),
    true,
  );
});

Deno.test("G0 anti-FP: un récap de lecture pure n'est PAS une commande d'opération (edgecases-r3 T15)", () => {
  assertEquals(
    isExplicitOperationCommandForTest(
      "Merci. Fais le recap exact : carte créée ou non, rappel créé ou annulé, et le piège messages/devis à retenir.",
    ),
    false,
  );
  // Et il reste éligible au rendu status (le composer n'est pas désarmé).
  assertEquals(
    shouldRenderStatusOnlyNoMutationForTest(
      "Merci. Fais le recap exact : carte créée ou non, rappel créé ou annulé.",
    ),
    true,
  );
});

Deno.test("G0 anti-FP: une vraie question d'heure exacte n'est PAS une commande d'opération", () => {
  assertEquals(
    isExplicitOperationCommandForTest(
      "Quelle heure as-tu vraiment programmée pour mon rappel, 11h05 ou 11h20 ?",
    ),
    false,
  );
});

// ===========================================================================
// CHANTIER G1 (2026-05-29) — "pas de potion" = hard-negative. Voir
// edgecases-r3 T12-14, syncskills-r2 T13-14.
// ===========================================================================

Deno.test("G1: 'Ne me propose pas de potion' est un refus dur de potion (edgecases-r3 T12)", () => {
  assertEquals(
    detectsExplicitNoPotionRequestForTest(
      "Ça s'est mis à tourner en boucle. Ne me propose pas de potion et ne relance pas de rappel : donne-moi juste une phrase de réparation.",
    ),
    true,
  );
});

Deno.test("G1: 'ne lance pas de potion' est un refus dur de potion (syncskills-r2 T13)", () => {
  assertEquals(
    detectsExplicitNoPotionRequestForTest(
      "Choisis courte action + une phrase utile. La tout de suite j'ai une petite baisse d'énergie, mais ne lance pas de potion: propose seulement un reset de 2 minutes pour revenir à la facture.",
    ),
    true,
  );
});

Deno.test("G1: 'sans potion' et 'pas de potion' sont des refus durs", () => {
  assertEquals(
    detectsExplicitNoPotionRequestForTest("Aide-moi mais sans potion stp."),
    true,
  );
  assertEquals(
    detectsExplicitNoPotionRequestForTest("Pas de potion, juste un conseil."),
    true,
  );
});

Deno.test("G1 anti-FP: accepter/demander une potion n'est PAS un refus", () => {
  assertEquals(
    detectsExplicitNoPotionRequestForTest("Oui, lance la potion d'apaisement."),
    false,
  );
  assertEquals(
    detectsExplicitNoPotionRequestForTest("Je veux bien une potion là."),
    false,
  );
  // Aucune mention de potion -> pas un refus de potion.
  assertEquals(
    detectsExplicitNoPotionRequestForTest("Pas de rappel, juste une phrase."),
    false,
  );
});

// ===========================================================================
// CHANTIER G3 (2026-05-29) — annulation explicite d'un rappel ponctuel. Voir
// edgecases-r3 T9/T10.
// ===========================================================================

Deno.test("G3: 'annule le rappel de 16h10' est une annulation explicite (edgecases-r3 T9)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "Alors annule le rappel de 16h10. Je ne veux plus de ping, ça me stresse.",
    ),
    true,
  );
});

Deno.test("G3: 'coupe ce ping' / 'annule-le vraiment' (avec ping) sont des annulations", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest("coupe ce rappel maintenant"),
    true,
  );
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "Zéro ping aujourd'hui. Pas d'alternative, pas de note, juste annule-le vraiment.",
    ),
    true,
  );
});

Deno.test("G3 anti-FP: question produit et négation ne sont pas des annulations", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "où je peux annuler ce rappel dans l'app ?",
    ),
    false,
  );
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "ne l'annule pas, je veux garder le rappel",
    ),
    false,
  );
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest("merci, c'est noté"),
    false,
  );
});

// G3-fix (2026-05-29) — régression annulations non consenties. Voir A14-r1
// T3/T13/T14, normal-conv-r4 T13, edgecases-r4 T15.
Deno.test("G3-fix anti-FP: question produit 'si je veux l'annuler plus tard, je passe par où' (A14-r1 T3)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "Question produit: le rappel est bien unique et déjà créé ? Et si je veux l'annuler plus tard, je passe par où ?",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: description passée + refus d'outil (A14-r1 T13)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "Ne crée rien d'autre maintenant. La pression monte parce que le rappel a été annulé puis recréé et la carte n'a pas marché. Si tu vois un outil de retour au calme, propose-le seulement, sans le lancer.",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: vérification 'dis si tu viens d'annuler' (A14-r1 T14)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "Stop, ne modifie plus rien. Vérifie sans modifier: rappel 16h35, carte de défense, préférence coach, aucune potion lancée, et dis clairement si tu viens d'annuler quelque chose.",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: 'Vérifie sans modifier … l'ancien annulé ?' (normal-conv-r4 T13)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "Vérifie sans modifier : est-ce qu'il y a maintenant un rappel à 17h00 ou seulement l'ancien annulé ?",
    ),
    false,
  );
});

Deno.test("G3-fix anti-FP: récap 'rappel 15h50 créé ou annulé' (edgecases-r4 T15)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
      "Stop. Pour finir, récap exact : carte créée ou non, rappel 15h50 créé ou annulé, et ce que tu dois retenir du piège notifications/doc.",
    ),
    false,
  );
});

Deno.test("G3-fix: une vraie commande combinée annuler+créer reste détectée (normal-conv-r4 T12)", () => {
  assertEquals(
    detectsExplicitOneShotReminderCancelForTest(
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
    detectsCoachPreferenceDirectionContradictionForTest(
      "Et côté coaching, garde cette préférence durable : commence par un geste concret de moins de 10 minutes avant de me poser plusieurs questions.",
      { "coach.question_tendency": "high" },
    ),
    true,
  );
});

Deno.test("G4: 'moins de questions' contredit un patch 'high'", () => {
  assertEquals(
    detectsCoachPreferenceDirectionContradictionForTest(
      "Je veux moins de questions de ta part.",
      { "coach.question_tendency": "high" },
    ),
    true,
  );
});

Deno.test("G4: 'plus de questions' contredit un patch 'low'", () => {
  assertEquals(
    detectsCoachPreferenceDirectionContradictionForTest(
      "Pose-moi plus de questions avant d'agir.",
      { "coach.question_tendency": "low" },
    ),
    true,
  );
});

Deno.test("G4 anti-FP: direction cohérente n'est PAS une contradiction", () => {
  // moins de questions + patch low = cohérent
  assertEquals(
    detectsCoachPreferenceDirectionContradictionForTest(
      "commence par un geste concret avant de me poser plusieurs questions",
      { "coach.question_tendency": "low" },
    ),
    false,
  );
  // plus de questions + patch high = cohérent
  assertEquals(
    detectsCoachPreferenceDirectionContradictionForTest(
      "pose-moi plus de questions",
      { "coach.question_tendency": "high" },
    ),
    false,
  );
  // patch sans question_tendency -> rien à valider
  assertEquals(
    detectsCoachPreferenceDirectionContradictionForTest(
      "moins de questions stp",
      { "coach.tone": "doux" },
    ),
    false,
  );
});

// ===========================================================================
// CHANTIER H (2026-05-29) — Correctifs RED hors périmètre G0–G4.
// ===========================================================================

Deno.test("H1: refus potion + livrable concret détecté (edgecases-r4 T12-14)", () => {
  const msg =
    "Non, pas de potion. Donne-moi une phrase de réparation et une micro-action, sans question.";
  assertEquals(detectsExplicitNoPotionRequestForTest(msg), true);
  assertEquals(detectsExplicitConcreteDeliverableRequestForTest(msg), true);
  const reply = buildExplicitNoPotionConcreteReplyForTest(msg);
  assertEquals(reply.includes("Phrase de réparation"), true);
  assertEquals(reply.includes("Micro-action"), true);
  assertEquals(reply.includes("?"), false);
});

Deno.test("H1: reset 2 minutes sans potion livré sans question (syncskills-r3 T13)", () => {
  const msg =
    "Pas de potion. Reset de 2 minutes pour revenir à la facture, sans question.";
  const reply = buildExplicitNoPotionConcreteReplyForTest(msg);
  assertEquals(reply.includes("Reset 2 minutes"), true);
  assertEquals(reply.includes("Minute 1"), true);
  assertEquals(reply.includes("?"), false);
});

Deno.test("H3: preview mode tunnel sans enregistrement (A2-r12 T10)", () => {
  const msg =
    "Propose seulement la règle mode tunnel, ne l enregistre pas encore.";
  assertEquals(isCoachPreferencePreviewOnlyRequestForTest(msg), true);
  const preview = buildCoachPreferencePreviewReplyForTest(msg);
  assertEquals(preview.includes("mode tunnel"), true);
  assertEquals(preview.includes("non enregistrée"), true);
  assertEquals(preview.includes("court"), false);
});

Deno.test("H5: rappel ambigu reste ponctuel, pas récurrent (edgecases-r4 T7)", () => {
  assertEquals(
    shouldPreferOneShotReminderOverRecurringForTest(
      "Programme un rappel à 18h30 avec le texte exact à relire, pas récurrent.",
    ),
    true,
  );
  assertEquals(
    shouldPreferOneShotReminderOverRecurringForTest(
      "Rappelle-moi demain à 9h de reprendre la facture.",
    ),
    true,
  );
});

Deno.test("H6: séquence minute par minute détectée (syncskills-r3 T5/T12)", () => {
  const msg =
    "Programme le rappel à 8h, et donne-moi la séquence minute par minute pour traiter les mails de la facture.";
  assertEquals(detectsMinuteByMinuteSequenceRequestForTest(msg), true);
  const addon = buildMinuteByMinuteSequenceAddonForTest(msg);
  assertEquals(addon?.includes("8:00"), true);
  assertEquals(addon?.includes("10:00"), true);
});
