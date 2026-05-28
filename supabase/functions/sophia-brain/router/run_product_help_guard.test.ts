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
  isExplicitConversationalFormatRequestForTest,
  isStatusOnlyNoMutationRequestForTest,
  loadRecentActiveAttackCardForUser,
  localTextAddonForOneShotReminderForTest,
  userExplicitlyAsksForNewAttackCardForTest,
  oneShotReminderManagementReplyForTest,
  shouldRuntimeCoachPreferenceOverrideRouteForTest,
  statePotionDeclineReplyForTest,
  upsertCoachPreferencesFromDraftForTest,
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
        },
        summary: "zéro emoji, trois lignes max, pas de question finale.",
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
  ]);
  assertEquals(
    rowsSeen.map((row) => row.value.value),
    ["none", "three", "avoid_unnecessary"],
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
