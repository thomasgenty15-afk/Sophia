import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  applyAttackCardSingleTechniquePreferenceForTest,
  applyCoachResponseStylePreferencesForTest,
  applyIncompleteRecapGuardForTest,
  applyNonDurableMemoryPromiseGuardForTest,
  applyShortRepairNoProductOfferGuardForTest,
  directProductHelpReplyOverrideForTest,
  directSafetyCrisisReplyOverrideForTest,
  enforceRecommendationToolVisibleReplyForTest,
  isApplyExistingCoachPreferenceRequestForTest,
  isAttackCardCancellationRequestForTest,
  isAttackCardExplicitApprovalForTest,
  isBroadRescueRequestNotDefenseCardForTest,
  isCoachPreferenceExplicitApprovalForTest,
  isCoachPreferenceVerificationRequestForTest,
  isDefenseCardExplicitApprovalForTest,
  isDefenseCardRevisionForPendingDraftForTest,
  isExplicitDefenseCardIntentForTest,
  isExplicitNoToolRequestForTest,
  isExplicitOneShotReminderModificationRequestForTest,
  isImmediateModeRequestNotCoachPreferenceForTest,
  isLocalMemoryReformulationRequestForTest,
  isLocalTextRevisionRequestForTest,
  isMicroActionOnlyNotAttackCardForTest,
  isOneShotReminderExactStatusRequestForTest,
  isRuntimeCoachPreferenceRequestForTest,
  isStatusOnlyNoMutationRequestForTest,
  oneShotReminderManagementReplyForTest,
  shouldRuntimeCoachPreferenceOverrideRouteForTest,
  statePotionDeclineReplyForTest,
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
