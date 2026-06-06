import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { runPrepareDefenseCardAiIntake } from "./ai_intake.ts";
import { executePrepareDefenseCard } from "./executor.ts";
import {
  readyDefenseCardStatePatch,
  structuredDefenseCardDraftGenerator,
  structuredDefenseCardPlatformFieldFiller,
  structuredDefenseCardSlotFiller,
} from "./test_helpers.ts";
import { normalizeDefenseCardSlotFillerOutput } from "./slot_filler.ts";
import { normalizeDefenseCardPlatformFieldFillerOutput } from "./platform_field_filler.ts";
import {
  createDefenseCardPlatformFieldState,
  mergeDefenseCardPlatformFieldState,
  normalizeDefenseCardPlatformFieldState,
} from "./platform_fields.ts";
import {
  defenseSkillResult,
  maybeRunPrepareDefenseCardOperation,
  toRuntimeResult,
} from "./router.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";
import type { DefenseCardHandoffDraft } from "./contract.ts";
import {
  renderDefenseCardExecuted,
  renderDefenseCardSkillResult,
} from "./renderer.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

const SECRET = "s5-test-secret";

Deno.test("prepare_defense_card renderer blocks success language without committed effect", () => {
  const message = renderDefenseCardSkillResult({
    status: "pending_confirmation",
    reply: "C'est fait. La carte de défense a été créée.",
    committed_effects: [],
  } as any);
  assertEquals(message.includes("C'est fait"), false);
  assertEquals(message.includes("créée"), false);
});

function sampleDefenseDraft(): DefenseCardDraftV1 {
  return {
    operation_type: "prepare_defense_card",
    output_schema: "defense_card_draft_v1",
    draft: {
      title: "Carte de défense - scroll",
      impulse_label: "scroll fatigue",
      target_label: "marche",
      situation: "je rentre fatigue et je pars scroller",
      signal: "je pose le sac et j'ouvre le telephone",
      risk_situation: "je rentre fatigue et je pars scroller",
      trigger: "fatigue",
      defense_response:
        "Je pose le telephone loin de moi et j'attends 10 minutes.",
      plan_b: "Je reduis les degats et je reprends au prochain moment stable.",
      fallback_plan:
        "Je reduis les degats et je reprends au prochain moment stable.",
      why_it_helps: "La reponse est prete avant le moment fragile.",
      generic_defense:
        "Je pose le telephone loin de moi et j'attends 10 minutes.",
    },
    confirmation_message:
      "Voici ta carte de défense :\nLe moment : je rentre fatigue et je pars scroller\nLe piège : je pose le sac et j'ouvre le telephone\nMon geste : Je pose le telephone loin de moi et j'attends 10 minutes.\nPlan B : Je reduis les degats et je reprends au prochain moment stable.\nOn valide ?",
    confirmation_actions: ["yes", "no"],
  };
}

function sampleDefenseHandoffDraft(
  draft: DefenseCardDraftV1,
  targetSummary = "marche",
): DefenseCardHandoffDraft {
  return {
    operation_type: "prepare_defense_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: targetSummary,
    risk_summary: draft.draft.risk_situation,
    platform_flow: {
      route_kind: "free_card",
      route_label: "Carte de défense libre",
      entry_need: {
        question_label:
          "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
        value:
          `J'ai besoin d'aide pour ${targetSummary}, surtout quand ${draft.draft.risk_situation}.`,
        status: "locked",
      },
      questionnaire_answers: [],
    },
    platform_fields: {
      route_kind: "free_card",
      status: "complete",
      missing_field_ids: [],
      fields: [
        {
          field_id: "support_need",
          question_label:
            "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
          required: true,
          status: "locked",
          locked_value:
            `J'ai besoin d'aide pour ${targetSummary}, surtout quand ${draft.draft.risk_situation}.`,
          proposed_value: null,
          user_evidence: [targetSummary, draft.draft.risk_situation],
          needs_user_confirmation: false,
          evidence: ["test"],
        },
      ],
    },
    recommendation: {
      platform_destination:
        "dans Ressources / Défense / Cartes de défense libres / Ajouter une carte",
      platform_steps: [
        "Ouvre Ressources / Défense.",
        "Dans Cartes de défense libres, clique sur Ajouter une carte.",
        "Renseigne les réponses préparées.",
      ],
    },
    missing_decisions: [],
  };
}

function fakeDefenseWriteSupabase(counter: { defenseWrites: number }) {
  return {
    from(table: string) {
      if (table === "user_cycles") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { id: "cycle-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "user_defense_cards") {
        return {
          insert: () => {
            counter.defenseWrites++;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "defense-1" },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "user_plan_items") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected_table:${table}`);
    },
  } as any;
}

function fakeFailingDefenseWriteSupabase() {
  return {
    from(table: string) {
      if (table === "user_cycles") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { id: "cycle-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "user_defense_cards") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: new Error("write_failed_for_test"),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected_table:${table}`);
    },
  } as any;
}

Deno.test("prepare_defense_card AI flow only advances from structured slots", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais une carte de defense pour ma marche quand je rentre fatigue",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-no-fallback",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller({
      attachment: {
        status: "missing",
        confidence: "low",
        evidence: ["AI did not identify attachment"],
      },
      risk_situation: {
        status: "missing",
        confidence: "low",
        evidence: ["AI did not identify risk"],
      },
    }, ["attachment", "risk_situation"]),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.state_patch.missing_slots, [
    "attachment",
    "risk_situation",
  ]);
  assertEquals(
    (output.state_patch.intake_state as any)?.attachment.status,
    "missing",
  );
  assertEquals(
    (output.state_patch.operation_input as any)?.attachment,
    undefined,
  );
});

Deno.test("prepare_defense_card AI flow asks a deterministic clarification when AI omits the question", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "prepare une carte de defense pour ce moment fragile",
    plan_snapshot: {},
    trigger_message_id: "m-defense-missing-question",
    safety_pregate_risk_band: "none",
    slot_filler: async () => ({
      current_step: "attachment_intake",
      user_intent: "draft_only",
      constraints: [],
      state_patch: {
        tool_fit: {
          status: "defense",
          confidence: "high",
          evidence: ["structured fit"],
        },
        attachment: {
          status: "missing",
          confidence: "low",
          evidence: ["missing target"],
        },
        risk_situation: {
          status: "identified",
          label: "moment fragile",
          description: "risque identifié",
          confidence: "medium",
          evidence: ["structured risk"],
        },
      },
      missing_slots: ["attachment"],
      confidence: "medium",
      generated_user_message: null,
      evidence: ["structured test filler"],
    }),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.reason_code, undefined);
  assertEquals(output.next_question?.slot, "attachment");
  assertStringIncludes(
    output.next_question?.question ?? "",
    "situation ou action précise",
  );
  assertEquals(output.readiness.reason, "structured_ai_missing_attachment");
});

Deno.test("prepare_defense_card AI flow produces a platform handoff draft without pending executable", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ce moment de risque",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-ready",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(output.draft, undefined);
  assertEquals(output.platform_fields?.status, "complete");
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.committed_effects, undefined);
  assertEquals(output.confirmation?.message?.includes("version à reprendre"), false);
});

Deno.test("defense_card platform field intake locks the single explicit support_need field", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Besoin: éviter le scroll. Moment: quand je rentre fatigué. Signal: j'ouvre YouTube. Geste: poser le téléphone dans l'entrée.",
    trigger_message_id: "m-defense-platform-multilock",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller({
      ...readyDefenseCardStatePatch(),
      attachment: {
        status: "identified",
        kind: "free_risk_context",
        plan_item_id: null,
        title: "éviter le scroll",
        confidence: "high",
        evidence: ["Besoin: éviter le scroll"],
      },
    }),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller({
      entryNeed: "éviter le scroll",
      riskMoment: "quand je rentre fatigué",
      firstSignal: "j'ouvre YouTube",
      defenseResponse: "poser le téléphone dans l'entrée",
    }),
    draft_generator: async () => {
      throw new Error("draft_generator_should_not_run");
    },
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(output.draft, undefined);
  assertEquals(output.platform_fields?.status, "complete");
  assertEquals(output.platform_fields?.missing_field_ids, []);
  assertEquals(
    output.platform_fields?.fields.filter((field) =>
      field.required && field.status === "locked"
    ).length,
    1,
  );
  assertEquals(output.platform_fields?.fields[0]?.field_id, "support_need");
});

Deno.test("defense_card platform field intake asks only the support_need field when missing", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Je veux une carte pour quand je rentre fatigué et je pars scroller.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-platform-missing",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller({
      missingFieldIds: ["support_need"],
      generatedUserMessage:
        "Avec quelle situation, contexte, environnement ou pulsion as-tu besoin d'aide ?",
    }),
    draft_generator: async () => {
      throw new Error("draft_generator_should_not_run");
    },
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.phase, "platform_field_intake");
  assertEquals(output.next_question?.slot, "platform_field");
  assertEquals(output.state_patch.missing_slots, [
    "platform_field:support_need",
  ]);
});

Deno.test("defense_card platform field intake proposes vague support_need instead of locking", () => {
  const output = normalizeDefenseCardPlatformFieldFillerOutput({
    current_step: "platform_field_intake",
    state_patch: {
      platform_fields: {
        route_kind: "free_card",
        fields: [{
          field_id: "support_need",
          question_label:
            "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
          required: true,
          status: "proposed",
          proposed_value: "j'ai besoin d'aide pour arrêter",
          locked_value: null,
          user_evidence: [],
          needs_user_confirmation: true,
          evidence: ["vague user answer"],
        }],
        missing_field_ids: ["support_need"],
      },
      generated_user_message:
        "Tu peux préciser la situation ou la pulsion exacte ?",
    },
    confidence: "medium",
    evidence: ["structured test"],
  }, "free_card");

  const supportNeed = output.state_patch.platform_fields.fields.find((
    field,
  ) => field.field_id === "support_need");
  assertEquals(supportNeed?.status, "proposed");
  assertEquals(output.state_patch.platform_fields.status, "partial");
  assertEquals(
    output.state_patch.platform_fields.missing_field_ids.includes(
      "support_need",
    ),
    true,
  );
});

Deno.test("defense_card platform field correction updates the support_need field", () => {
  const base = normalizeDefenseCardPlatformFieldState({
    route_kind: "free_card",
    fields: [
      {
        field_id: "support_need",
        question_label:
          "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
        required: true,
        status: "locked",
        locked_value: "j'ai besoin d'aide quand je rentre fatigué",
        user_evidence: ["quand je rentre fatigué"],
        needs_user_confirmation: false,
        evidence: ["test"],
      },
    ],
  }, "free_card") ?? createDefenseCardPlatformFieldState("free_card");
  const correction = normalizeDefenseCardPlatformFieldState({
    route_kind: "free_card",
    fields: [
      {
        field_id: "support_need",
        question_label:
          "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
        required: true,
        status: "locked",
        locked_value:
          "j'ai besoin d'aide quand je ferme mes mails et que j'ouvre Insta",
        user_evidence: ["quand je ferme mes mails", "j'ouvre Insta"],
        needs_user_confirmation: false,
        evidence: ["correction"],
      },
    ],
  }, "free_card");
  const merged = mergeDefenseCardPlatformFieldState(base, correction);

  assertEquals(
    merged.fields.find((field) => field.field_id === "support_need")
      ?.locked_value,
    "j'ai besoin d'aide quand je ferme mes mails et que j'ouvre Insta",
  );
  assertEquals(merged.status, "complete");
});

Deno.test("defense_card plan item route still uses the single support_need field", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Fais une carte de défense pour mon action mails du soir.",
    plan_snapshot: { items: [{ id: "walk", title: "mails du soir" }] },
    trigger_message_id: "m-defense-platform-plan",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(
      readyDefenseCardStatePatch({ title: "mails du soir" }),
    ),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller({
      riskMoment: "après 22h quand je ferme mes mails",
      firstSignal: "j'ouvre YouTube",
      defenseResponse: "fermer l'ordinateur",
    }),
    draft_generator: async () => {
      throw new Error("draft_generator_should_not_run");
    },
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(output.platform_fields?.route_kind, "plan_item_card");
  assertEquals(
    output.platform_fields?.fields.some((field) =>
      field.field_id === "support_need"
    ),
    true,
  );
  assertEquals(output.platform_fields?.fields.length, 1);
});

Deno.test("prepare_defense_card AI flow never calls draft generator in nominal platform flow", async () => {
  let draftGeneratorCalled = false;
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Prépare-moi une carte de défense pour éviter de repousser l'appel client, sans la créer.",
    plan_snapshot: { items: [{ id: "walk", title: "appel client" }] },
    trigger_message_id: "m-defense-generator-fallback",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(
      readyDefenseCardStatePatch({
        title: "appel client",
        riskLabel: "je risque de repousser l'appel client",
        triggerType: "avoidance",
      }),
    ),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller({
      entryNeed: "appel client",
      riskMoment: "je risque de repousser l'appel client",
      firstSignal: "le stress monte",
      defenseResponse: "Je lance l'appel avant de renégocier.",
    }),
    draft_generator: async () => {
      draftGeneratorCalled = true;
      throw new Error("generator_failed_for_test");
    },
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(output.reason_code, undefined);
  assertEquals(output.draft, undefined);
  assertEquals(output.platform_fields?.status, "complete");
  assertEquals(draftGeneratorCalled, false);
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.committed_effects, undefined);
});

Deno.test("prepare_defense_card AI flow can generate when risk text is in description only", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux prévenir le moment où je risque de repousser l'appel quand le stress monte.",
    plan_snapshot: {},
    trigger_message_id: "m-defense-risk-description",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller({
      tool_fit: {
        status: "defense",
        confidence: "high",
        evidence: ["structured fit"],
      },
      attachment: {
        status: "identified",
        kind: "personal_action",
        plan_item_id: null,
        title: "appel client",
        confidence: "high",
        evidence: ["repousser l'appel"],
      },
      risk_situation: {
        status: "identified",
        label: null,
        description:
          "quand le stress monte et que l'envie de repousser l'appel apparaît",
        confidence: "high",
        evidence: ["stress", "repousser l'appel"],
      },
    }),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller({
      entryNeed: "appel client",
      riskMoment:
        "quand le stress monte et que l'envie de repousser l'appel apparaît",
      firstSignal: "je me dis que je le ferai plus tard",
      defenseResponse: "Je lance l'appel avant de renégocier avec moi-même.",
    }),
    draft_generator: async (input) => ({
      operation_type: "prepare_defense_card",
      output_schema: "defense_card_draft_v1",
      draft: {
        title: "Carte de défense - appel client",
        impulse_label: "repousser l'appel",
        target_label: input.state.attachment.status === "identified"
          ? input.state.attachment.title
          : "appel client",
        situation: input.state.risk_situation.description ?? "",
        signal: "je me dis que je le ferai plus tard",
        risk_situation: input.state.risk_situation.description ?? "",
        trigger: "avoidance",
        defense_response: "Je lance l'appel avant de renégocier avec moi-même.",
        plan_b: "Si je bloque, j'envoie un message court puis je rappelle.",
        fallback_plan:
          "Si je bloque, j'envoie un message court puis je rappelle.",
        why_it_helps: "La réponse arrive avant l'évitement.",
        generic_defense: "Je lance l'appel avant de renégocier avec moi-même.",
      },
      confirmation_message: "",
      confirmation_actions: ["yes", "no"],
    }),
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(output.state_patch.missing_slots, []);
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.committed_effects, undefined);
});

Deno.test("prepare_defense_card AI flow sanitizes duplicated labeled draft fields", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ce moment de risque",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-labeled-fields",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: async (input) => {
      const response =
        "Le moment : je rentre fatigue et je pars scroller\nLe piege : moment de risque identifié\nMon geste : Je pose le telephone loin de moi et j'attends 10 minutes.\nPlan B : Je reduis les degats.";
      return {
        operation_type: "prepare_defense_card",
        output_schema: "defense_card_draft_v1",
        draft: {
          title: "Carte de defense - scroll",
          impulse_label: "scroll",
          target_label: String(
            (input.state.attachment as any).title ?? "marche",
          ),
          situation: input.state.risk_situation.label ?? "",
          signal: input.state.risk_situation.description ?? "",
          risk_situation: input.state.risk_situation.label ?? "",
          trigger: input.state.trigger.type ?? "fatigue",
          defense_response: response,
          plan_b: response,
          fallback_plan: response,
          why_it_helps: "Elle prepare une reponse courte.",
          generic_defense: response,
        },
        confirmation_message: response,
        confirmation_actions: ["yes", "no"],
      };
    },
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(
    output.platform_fields?.fields.find((field) =>
      field.field_id === "support_need"
    )?.locked_value,
    "marche - je rentre fatigue et je pars scroller",
  );
  const message = output.confirmation?.message ?? "";
  assertEquals(message.includes("Le moment"), false);
  assertEquals(message.includes("Mon geste"), false);
  assertEquals(message.includes("Plan B"), false);
});

Deno.test("prepare_defense_card AI flow stops on slot filler failure without regex fallback", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais une carte de defense pour ma marche quand je rentre fatigue",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-ai-failure",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "ai_unavailable");
  assertEquals(output.readiness.fallback_to_dashboard, false);
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.readiness.reason, "ai_slot_filler_unavailable");
  assertEquals(output.state_patch.missing_slots, []);
});

Deno.test("prepare_defense_card AI flow keeps deterministic safety and DB guards", async () => {
  const safety = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, fais une carte",
    trigger_message_id: "m-defense-safety",
    safety_pregate_risk_band: "critical",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });
  assertEquals(safety.status, "blocked_by_safety");

  const invalidAttachment = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ça",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-invalid-target",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(
      readyDefenseCardStatePatch({ planItemId: "missing-id" }),
    ),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });
  assertEquals(invalidAttachment.status, "ask_question");
  assertEquals(invalidAttachment.reason_code, undefined);
  assertEquals(invalidAttachment.readiness.reason, "structured_ai_missing_attachment");
  assertStringIncludes(
    invalidAttachment.next_question?.question ?? "",
    "situation ou action précise",
  );
});

Deno.test("prepare_defense_card AI flow lets AI decide attack-vs-defense fit", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais un outil pour demarrer ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-tool-fit",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller({
      tool_fit: {
        status: "attack_better",
        reason: "Le user parle de demarrer, pas d'un moment de rechute.",
        confidence: "high",
        evidence: ["structured fit"],
      },
      attachment: {
        status: "identified",
        kind: "plan_item",
        plan_item_id: "walk",
        title: "marche",
        confidence: "high",
        evidence: ["structured attachment"],
      },
      generated_user_message:
        "Là ça ressemble plutôt à une carte d'attaque pour démarrer. Tu veux bien ça, ou une défense pour un moment de dérapage ?",
    }, ["tool_fit"]),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.next_question?.slot, "tool_fit");
  assertStringIncludes(output.next_question?.question ?? "", "carte d'attaque");
});

Deno.test("prepare_defense_card slot filler normalizes draft_only intent and no_create constraint", () => {
  const output = normalizeDefenseCardSlotFillerOutput({
    current_step: "draft_generation",
    user_intent: "draft_only",
    constraints: [
      { kind: "draft_only", evidence: ["juste un brouillon"] },
      { kind: "no_create", evidence: ["sans créer"] },
    ],
    state_patch: {
      user_intent: "draft_only",
      constraints: [
        { kind: "draft_only", evidence: ["juste un brouillon"] },
        { kind: "no_create", evidence: ["sans créer"] },
      ],
    },
    missing_slots: [],
    confidence: "high",
    generated_user_message: null,
    evidence: ["structured intent"],
  });

  assertEquals(output.user_intent, "draft_only");
  assertEquals(output.constraints.map((constraint) => constraint.kind), [
    "draft_only",
    "no_create",
  ]);
  assertEquals((output.state_patch as any).user_intent, "draft_only");
});

Deno.test("prepare_defense_card router draft-only never creates defense card", async () => {
  const writes = { defenseWrites: 0 };
  const draft = sampleDefenseDraft();
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage: "prépare-moi juste un brouillon sans créer",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-draft-only",
    requestId: "r-draft-only",
    planSnapshot: { items: [{ id: "walk", title: "marche" }] },
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "pending_confirmation",
      source: "direct_user_request",
      phase: "confirmation",
      draft,
      confirmation: {
        required: true,
        message: draft.confirmation_message,
        actions: ["yes", "no"],
      },
      pending_confirmation: {
        operation_id: "op-draft-only",
        operation_type: "prepare_defense_card",
        draft,
      },
      readiness: {
        ready_to_generate: true,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "ready",
      },
      state_patch: {
        summary: "draft only",
        phase: "confirmation",
        user_intent: "draft_only",
        constraints: [
          { kind: "draft_only", evidence: ["juste un brouillon"] },
          { kind: "no_create", evidence: ["sans créer"] },
        ],
        missing_slots: [],
        turn_count_increment: 1,
      },
    }),
  });

  assertEquals(result?.toolExecution, "platform_handoff");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.status, "handoff_ready");
  assertEquals((result?.toolSkillRun as any)?.requested_effects, []);
  assertEquals((result?.toolSkillRun as any)?.allowed_effects, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(
    (result?.toolSkillRun as any)?.platform_handoff?.no_chat_mutation,
    true,
  );
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card apply_attempt does not execute", async () => {
  const writes = { defenseWrites: 0 };
  const draft = sampleDefenseDraft();
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage: "ok crée-la",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-create",
        operation_type: "prepare_defense_card",
        draft,
        attachment: {
          kind: "plan_item",
          plan_item_id: "walk",
          title: "marche",
        },
        risk_situation: { label: draft.draft.risk_situation },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-create",
    requestId: "r-create",
    planSnapshot: { items: [{ id: "walk", title: "marche" }] },
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source: "direct_user_request",
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "draft_review_approve",
      },
      state_patch: {
        summary: "approve",
        phase: "confirmation",
        user_intent: "create",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        draft_review_decision: {
          decision: "approve",
          confidence: "high",
          evidence: ["ok crée-la"],
        },
      },
    }),
  });

  assertEquals(result?.toolExecution, "platform_handoff");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals((result?.toolSkillRun as any)?.allowed_effects, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertStringIncludes(
    result?.content ?? "",
    "Je ne crée pas la carte depuis le chat",
  );
  assertStringIncludes(
    result?.content ?? "",
    "Va dans Ressources / Défense / Cartes de défense",
  );
  assertEquals(
    result?.content?.includes("Dans la plateforme, le champ à préparer est"),
    false,
  );
  assertEquals(result?.content?.includes("Moment / contexte"), false);
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card router pending draft explain does not create", async () => {
  const writes = { defenseWrites: 0 };
  const draft = sampleDefenseDraft();
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage: "montre-moi le brouillon",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-explain",
        operation_type: "prepare_defense_card",
        draft,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-explain",
    requestId: "r-explain",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source: "direct_user_request",
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "draft_review_explain",
      },
      state_patch: {
        summary: "explain",
        phase: "confirmation",
        user_intent: "explain",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        draft_review_decision: {
          decision: "explain",
          confidence: "high",
          evidence: ["montre-moi"],
        },
      },
    }),
  });

  assertEquals(result?.toolExecution, "platform_handoff");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((result?.toolSkillRun as any)?.status, "repeat_handoff");
  assertStringIncludes(
    result?.content ?? "",
    "Dans la plateforme, le champ à préparer est",
  );
  assertEquals(result?.content?.includes("Champs finaux à recopier"), false);
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card router pending draft reject clears pending", async () => {
  const writes = { defenseWrites: 0 };
  const draft = sampleDefenseDraft();
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage: "finalement non",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-reject",
        operation_type: "prepare_defense_card",
        draft,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-reject",
    requestId: "r-reject",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source: "direct_user_request",
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "draft_review_reject",
      },
      state_patch: {
        summary: "reject",
        phase: "confirmation",
        user_intent: "reject",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        draft_review_decision: {
          decision: "reject",
          confidence: "high",
          evidence: ["finalement non"],
        },
      },
    }),
  });

  assertEquals(result?.toolExecution, "platform_handoff");
  assertEquals((result?.toolSkillRun as any)?.status, "cancelled");
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(
    (result?.nextTempMemory as any)?.__pending_tool_skill_confirmation,
    undefined,
  );
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card router pending draft revise preserves attachment and risk for intake", async () => {
  const writes = { defenseWrites: 0 };
  const draft = sampleDefenseDraft();
  let previousInput: Record<string, unknown> | null = null;
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage: "change le plan B",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-revise",
        operation_type: "prepare_defense_card",
        draft,
        attachment: {
          kind: "plan_item",
          plan_item_id: "walk",
          title: "marche",
        },
        risk_situation: { label: draft.draft.risk_situation },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-revise",
    requestId: "r-revise",
    runIntake: async (input) => {
      previousInput = input.operation_input ?? null;
      return {
        operation_type: "prepare_defense_card",
        status: "ask_question",
        source: "direct_user_request",
        phase: "response_design",
        next_question: {
          needed: true,
          slot: "defense_response",
          status: "missing",
          reason: "structured_ai_missing_plan_b",
          question: "Quel plan B tu veux à la place ?",
          known_slots: input.operation_input ?? {},
        },
        readiness: {
          ready_to_generate: false,
          fallback_to_dashboard: false,
          invalid_recommendation_payload: false,
          missing_required_slots: ["defense_response"],
          reason: "structured_ai_missing_plan_b",
        },
        state_patch: {
          summary: "revise",
          phase: "response_design",
          user_intent: "revise",
          constraints: [],
          missing_slots: ["defense_response"],
          turn_count_increment: 1,
          operation_input: input.operation_input ?? null,
          draft_review_decision: {
            decision: "revise",
            confidence: "high",
            evidence: ["change le plan B"],
          },
        },
      };
    },
  });

  assertEquals(result?.toolExecution, "blocked");
  assertEquals((previousInput as any)?.attachment?.plan_item_id, "walk");
  assertEquals(
    (previousInput as any)?.risk_situation?.label,
    draft.draft.risk_situation,
  );
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card router seeds fresh intake from TurnFrame structured intent", async () => {
  const writes = { defenseWrites: 0 };
  let previousInput: Record<string, unknown> | null = null;
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage:
      "Prépare-moi quoi mettre dans l'app pour mes vidéos du soir, sans créer.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        target_hint:
          "moment où je finis mes mails tard et je bascule sur des vidéos",
        operation_input: {
          trigger: "fin de session mails tardive",
          risk_behavior: "bascule sur des vidéos au lieu de dormir",
        },
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-turnframe-seed",
    requestId: "r-turnframe-seed",
    runIntake: async (input) => {
      previousInput = input.operation_input ?? null;
      return {
        operation_type: "prepare_defense_card",
        status: "ask_question",
        source: "direct_user_request",
        phase: "response_design",
        next_question: {
          needed: true,
          slot: "defense_response",
          status: "missing",
          reason: "structured_ai_missing_defense_response",
          question: "Quel geste simple tu veux prévoir ?",
          known_slots: input.operation_input ?? {},
        },
        readiness: {
          ready_to_generate: false,
          fallback_to_dashboard: false,
          invalid_recommendation_payload: false,
          missing_required_slots: ["defense_response"],
          reason: "structured_ai_missing_defense_response",
        },
        state_patch: {
          summary: "collecting",
          phase: "response_design",
          user_intent: "draft_only",
          constraints: [{ kind: "no_create", evidence: ["sans créer"] }],
          missing_slots: ["defense_response"],
          turn_count_increment: 1,
          operation_input: input.operation_input ?? null,
        },
      };
    },
  });

  assertEquals(result?.toolExecution, "blocked");
  assertEquals(
    (previousInput as any)?.attachment?.kind,
    "free_risk_context",
  );
  assertEquals(
    (previousInput as any)?.attachment?.title,
    "moment où je finis mes mails tard et je bascule sur des vidéos",
  );
  assertEquals(
    (previousInput as any)?.risk_situation?.label,
    "bascule sur des vidéos au lieu de dormir",
  );
  assertEquals(
    (previousInput as any)?.dispatcher_intent?.confidence_band,
    "high",
  );
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card AI flow asks clarification when tool_fit is unclear", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux une carte de defense pour demarrer ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-tool-fit-unclear",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller({
      tool_fit: {
        status: "unclear",
        reason: "Defense explicite mais besoin de demarrage.",
        confidence: "high",
        evidence: ["structured unclear fit"],
      },
      generated_user_message:
        "Tu veux protéger un moment de craquage, ou plutôt démarrer l'action ?",
    }, ["tool_fit"]),
    platform_field_filler: structuredDefenseCardPlatformFieldFiller(),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.next_question?.slot, "tool_fit");
  assertStringIncludes(output.next_question?.question ?? "", "démarrer");
});

Deno.test("prepare_defense_card failed intake never marks executed tool", async () => {
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase({ defenseWrites: 0 }),
    userId: "u1",
    userMessage: "prépare une carte de défense",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-failed",
    requestId: "r-failed",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "technical_blocked",
      source: "direct_user_request",
      phase: "risk_intake",
      ack: "Je n'ai pas pu préparer cette carte.",
      reason_code: "ai_unavailable",
      technical_source: "ai_unavailable",
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "prepare_defense_card",
        reason_code: "ai_unavailable",
      }],
      should_preserve_pending: true,
      retryable: true,
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "ai_slot_filler_unavailable",
      },
      state_patch: {
        summary: "failed",
        phase: "risk_intake",
        user_intent: "unknown",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
      },
    }),
  });

  assertEquals(result?.toolExecution, "failed");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
});

Deno.test("prepare_defense_card writer failure has no done language without commit", async () => {
  const draft = sampleDefenseDraft();
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeFailingDefenseWriteSupabase(),
    userId: "u1",
    userMessage: "ok crée-la",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-write-fails",
        operation_type: "prepare_defense_card",
        draft,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-write-fails",
    requestId: "r-write-fails",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source: "direct_user_request",
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "draft_review_approve",
      },
      state_patch: {
        summary: "approve",
        phase: "confirmation",
        user_intent: "create",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        draft_review_decision: {
          decision: "approve",
          confidence: "high",
          evidence: ["ok crée-la"],
        },
      },
    }),
  });

  assertEquals(result?.toolExecution, "platform_handoff");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((result?.content ?? "").includes("C'est fait"), false);
});

Deno.test("prepare_defense_card handoff renderer includes full platform content and no mutation wording", async () => {
  const writes = { defenseWrites: 0 };
  const draft = sampleDefenseDraft();
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage: "prépare une carte de défense sans la créer",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-handoff-renderer",
    requestId: "r-handoff-renderer",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "handoff_ready",
      source: "direct_user_request",
      phase: "confirmation",
      draft,
      confirmation: {
        required: false,
        message: draft.confirmation_message,
        actions: ["yes", "no"],
      },
      handoff_message: draft.confirmation_message,
      readiness: {
        ready_to_generate: true,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "handoff_ready",
      },
      state_patch: {
        summary: "handoff",
        phase: "confirmation",
        user_intent: "draft_only",
        constraints: [{ kind: "no_create", evidence: ["sans la créer"] }],
        missing_slots: [],
        turn_count_increment: 1,
      },
    }),
  });

  const content = result?.content ?? "";
  assertStringIncludes(content, "Où aller");
  assertStringIncludes(
    content,
    "Dans la plateforme, le champ à préparer est",
  );
  assertStringIncludes(
    content,
    "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
  );
  assertStringIncludes(content, "Je te proposerais d'écrire");
  assertEquals(content.includes(" ? : "), false);
  assertEquals(content.includes("Besoin libre :"), false);
  assertEquals(content.includes("Moment / contexte :"), false);
  assertEquals(content.includes("Premier signal :"), false);
  assertEquals(content.includes("Geste de défense :"), false);
  assertEquals(content.includes("Cible à protéger"), false);
  assertEquals(content.includes("Risque identifié"), false);
  assertEquals(content.includes("Réponse :"), false);
  assertEquals(content.includes("version à reprendre"), false);
  assertEquals(content.includes("brouillon"), false);
  assertEquals(content.includes("Champs finaux à recopier"), false);
  assertEquals(content.includes("À préserver"), false);
  assertEquals(content.includes("À éviter"), false);
  assertStringIncludes(
    content,
    `Où aller : ${
      getHandoffTargetForOperation("prepare_defense_card")
        ?.user_facing_destination
    }`,
  );
  assertStringIncludes(
    content,
    "Je ne crée pas la carte depuis le chat.",
  );
  assertEquals(content.includes("C'est fait"), false);
  assertEquals(content.includes("j'ai créé"), false);
  assertEquals(content.includes("j'ai ajouté"), false);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card handoff never creates confirmation token or calls defense writers", async () => {
  const source = await Deno.readTextFile(
    new URL("./router.ts", import.meta.url),
  );
  assertEquals(source.includes("createConfirmationToken"), false);
  assertEquals(source.includes("executePrepareDefenseCard"), false);
  assertEquals(source.includes("writeDefenseCardFromDraft"), false);
});

Deno.test("prepare_defense_card active handoff captures redis-moi as repeat_handoff", async () => {
  const draft = sampleDefenseDraft();
  const handoffState = {
    operation_type: "prepare_defense_card",
    skill_id: "prepare_defense_card",
    mode: "platform_handoff",
    status: "handoff_delivered",
    draft: sampleDefenseHandoffDraft(draft, "marche"),
    draft_payload: draft,
    operation_input: { previous_draft: draft },
    turn_count: 1,
    max_turns: 6,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    no_chat_mutation: true,
  };
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase({ defenseWrites: 0 }),
    userId: "u1",
    userMessage: "redis-moi quoi mettre",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: { __active_tool_skill_intake: handoffState },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-repeat",
    requestId: "r-repeat",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source: "direct_user_request",
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "draft_review_explain",
      },
      state_patch: {
        summary: "repeat",
        phase: "confirmation",
        user_intent: "explain",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        draft_review_decision: {
          decision: "explain",
          confidence: "high",
          evidence: ["redis-moi"],
        },
      },
    }),
  });
  assertEquals((result?.toolSkillRun as any)?.status, "repeat_handoff");
  assertEquals(result?.executedTools, []);
});

Deno.test("prepare_defense_card active handoff captures Pas de carte finalement as cancelled", async () => {
  const draft = sampleDefenseDraft();
  const writes = { defenseWrites: 0 };
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase(writes),
    userId: "u1",
    userMessage: "Pas de carte finalement.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft: sampleDefenseHandoffDraft(draft, "scroll après dîner"),
        draft_payload: draft,
        operation_input: { previous_draft: draft },
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      reason_code: "explicit_cancel_clears_active_handoff",
      direct_effects_to_run: [],
      blocked_paths: [],
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-cancel-active",
    requestId: "r-cancel-active",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source: "direct_user_request",
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "draft_review_reject",
      },
      state_patch: {
        summary: "cancel",
        phase: "confirmation",
        user_intent: "reject",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        draft_review_decision: {
          decision: "reject",
          confidence: "high",
          evidence: ["Pas de carte finalement."],
        },
      },
    }),
  });
  assertEquals(result?.toolExecution, "platform_handoff");
  assertEquals((result?.toolSkillRun as any)?.status, "cancelled");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(writes.defenseWrites, 0);
  assertEquals(
    (result?.nextTempMemory as any)?.__active_tool_skill_intake,
    undefined,
  );
});

Deno.test("prepare_defense_card active handoff captures ok crée-la as apply_attempt", async () => {
  const draft = sampleDefenseDraft();
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase({ defenseWrites: 0 }),
    userId: "u1",
    userMessage: "ok crée-la",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft: sampleDefenseHandoffDraft(draft, "marche"),
        draft_payload: draft,
        operation_input: { previous_draft: draft },
        turn_count: 1,
        max_turns: 6,
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-apply",
    requestId: "r-apply",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source: "direct_user_request",
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "draft_review_approve",
      },
      state_patch: {
        summary: "apply",
        phase: "confirmation",
        user_intent: "create",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        draft_review_decision: {
          decision: "approve",
          confidence: "high",
          evidence: ["ok crée-la"],
        },
      },
    }),
  });
  assertEquals((result?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
});

Deno.test("prepare_defense_card active handoff control intents do not require AI review", async () => {
  const draft = sampleDefenseDraft();
  const handoffState = {
    operation_type: "prepare_defense_card",
    skill_id: "prepare_defense_card",
    mode: "platform_handoff",
    status: "handoff_delivered",
    draft: sampleDefenseHandoffDraft(draft, "appel client"),
    draft_payload: draft,
    operation_input: { previous_draft: draft },
    turn_count: 1,
    max_turns: 6,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    no_chat_mutation: true,
  };
  const cases = [
    {
      message: "redis-moi",
      reason: "active_handoff_repeat_handoff",
      expected: "repeat_handoff",
    },
    {
      message: "ok crée-la",
      reason: "active_handoff_apply_attempt",
      expected: "apply_attempt",
    },
    {
      message: "pas de carte finalement",
      reason: "explicit_cancel_clears_active_handoff",
      expected: "cancelled",
    },
  ];
  for (const item of cases) {
    let reviewCalled = false;
    const result = await maybeRunPrepareDefenseCardOperation({
      supabase: fakeDefenseWriteSupabase({ defenseWrites: 0 }),
      userId: "u1",
      userMessage: item.message,
      channel: "whatsapp",
      userTimezone: "Europe/Paris",
      tempMemory: { __active_tool_skill_intake: handoffState },
      turnFrame: null,
      routeDecision: {
        response_owner: "tool_skill",
        selected_handler: "prepare_defense_card",
        reason_code: item.reason,
      } as any,
      safetyPregateOutput: { risk_band: "none" } as any,
      sourceMessageId: `m-${item.expected}`,
      requestId: `r-${item.expected}`,
      runIntake: async () => {
        reviewCalled = true;
        throw new Error("review_should_not_run");
      },
    });
    assertEquals(reviewCalled, false);
    assertEquals((result?.toolSkillRun as any)?.status, item.expected);
    assertEquals(result?.executedTools, []);
    assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  }
});

Deno.test("prepare_defense_card revise_handoff regenerates recommendation without execution", async () => {
  const draft = sampleDefenseDraft();
  const revisedDraft: DefenseCardDraftV1 = {
    ...draft,
    draft: {
      ...draft.draft,
      defense_response:
        "Je pose doucement le téléphone loin de moi et je prends juste trois respirations.",
      plan_b:
        "Si c'est trop dur, je marche deux minutes et je reprends plus tard.",
    },
  };
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseWriteSupabase({ defenseWrites: 0 }),
    userId: "u1",
    userMessage: "rends-la plus douce, avec un plan B",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft: sampleDefenseHandoffDraft(draft, "marche"),
        draft_payload: draft,
        operation_input: { previous_draft: draft },
        turn_count: 1,
        max_turns: 6,
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-revise-handoff",
    requestId: "r-revise-handoff",
    runIntake: async () => ({
      operation_type: "prepare_defense_card",
      status: "handoff_ready",
      source: "direct_user_request",
      phase: "confirmation",
      draft: revisedDraft,
      readiness: {
        ready_to_generate: true,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: "handoff_ready",
      },
      state_patch: {
        summary: "revise",
        phase: "confirmation",
        user_intent: "revise",
        constraints: [],
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: { previous_draft: draft },
        draft_review_decision: {
          decision: "revise",
          confidence: "high",
          evidence: ["plus douce", "plan B"],
        },
      },
    }),
  });
  assertEquals((result?.toolSkillRun as any)?.status, "revise_handoff");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertStringIncludes(
    result?.content ?? "",
    "Dans la plateforme, le champ à préparer est",
  );
  assertEquals(
    result?.content?.includes("Je pose doucement le téléphone loin de moi"),
    false,
  );
});

Deno.test("prepare_defense_card executor returns technical success only", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = sampleDefenseDraft();
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-technical",
    operation_type: "prepare_defense_card",
    draft,
    source_message_id: "m-technical",
    pending_confirmation_id: "op-technical",
    secret: SECRET,
  });
  const executed = await executePrepareDefenseCard({
    operation_id: "op-technical",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_defense_card: async () => ({ defense_card_id: "defense-technical" }),
    secret: SECRET,
  });

  assertEquals(executed, {
    status: "executed",
    defense_card_id: "defense-technical",
  });
});

Deno.test("prepare_defense_card contract result maps committed effects to runtime", () => {
  const draft = sampleDefenseDraft();
  const runtime = toRuntimeResult({
    nextTempMemory: {},
    skillResult: defenseSkillResult({
      status: "executed",
      userIntent: "create",
      reasonCode: "executed",
      reply: renderDefenseCardExecuted({
        draft,
        committedEffects: [{
          type: "create_defense_card",
          operation_id: "op-map",
          defense_card_id: "defense-map",
        }],
      }),
      requestedEffects: [{
        type: "create_defense_card",
        operation_id: "op-map",
        draft,
      }],
      allowedEffects: [{
        type: "create_defense_card",
        operation_id: "op-map",
        draft,
      }],
      committedEffects: [{
        type: "create_defense_card",
        operation_id: "op-map",
        defense_card_id: "defense-map",
      }],
    }),
  });

  assertEquals(runtime.toolExecution, "success");
  assertEquals(runtime.executedTools, ["prepare_defense_card"]);
  assertEquals((runtime.toolSkillRun as any).committed_effects[0], {
    type: "create_defense_card",
    operation_id: "op-map",
    defense_card_id: "defense-map",
  });
});
