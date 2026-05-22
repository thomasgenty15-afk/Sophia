import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  directProductHelpReplyOverrideForTest,
  directSafetyCrisisReplyOverrideForTest,
  isAttackCardExplicitApprovalForTest,
  isBroadRescueRequestNotDefenseCardForTest,
  isCoachPreferenceExplicitApprovalForTest,
  isCoachPreferenceVerificationRequestForTest,
  isDefenseCardExplicitApprovalForTest,
  isImmediateModeRequestNotCoachPreferenceForTest,
  isLocalMemoryReformulationRequestForTest,
  isLocalTextRevisionRequestForTest,
  isRuntimeCoachPreferenceRequestForTest,
  oneShotReminderManagementReplyForTest,
  applyNonDurableMemoryPromiseGuardForTest,
  shouldRuntimeCoachPreferenceOverrideRouteForTest,
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
    responseContent:
      "Bien noté ✅ Ton garde-fou du soir, c'est la commode.",
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
});
