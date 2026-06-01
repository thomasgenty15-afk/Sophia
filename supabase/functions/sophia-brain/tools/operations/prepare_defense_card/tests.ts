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
  structuredDefenseCardSlotFiller,
} from "./test_helpers.ts";
import { normalizeDefenseCardSlotFillerOutput } from "./slot_filler.ts";
import {
  defenseSkillResult,
  maybeRunPrepareDefenseCardOperation,
  toRuntimeResult,
} from "./router.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";
import {
  renderDefenseCardExecuted,
  renderDefenseCardSkillResult,
} from "./renderer.ts";

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
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.state_patch.missing_slots, [
    "attachment",
    "risk_situation",
    "trigger",
    "defense_goal",
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

Deno.test("prepare_defense_card AI flow drafts from structured state and executor writes only after token", async () => {
  resetConsumedConfirmationTokensForTest();
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ce moment de risque",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-ready",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.target_label, "marche");
  assertEquals(
    (output.pending_confirmation as any)?.intake_state?.attachment.plan_item_id,
    "walk",
  );
  assertEquals(
    output.confirmation?.message,
    [
      "Voici ta carte de défense :",
      "Le moment : je rentre fatigue et je pars scroller",
      "Le piège : moment de risque identifié",
      "Mon geste : Je pose le telephone loin de moi et j'attends 10 minutes avant de decider.",
      "Plan B : Si ca ne suffit pas, je reduis les degats et je reprends au prochain moment stable.",
      "On valide ?",
    ].join("\n"),
  );

  let writes = 0;
  const blocked = await executePrepareDefenseCard({
    operation_id: String(output.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: output.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_defense_card: async () => {
      writes++;
      return { defense_card_id: "defense" };
    },
    secret: SECRET,
  });
  assertEquals(blocked.status, "blocked");
  assertEquals(writes, 0);

  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(output.pending_confirmation?.operation_id),
    operation_type: "prepare_defense_card",
    draft: output.draft,
    source_message_id: "yes-defense",
    pending_confirmation_id: "pending-defense",
    secret: SECRET,
  });
  const executed = await executePrepareDefenseCard({
    operation_id: String(output.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: output.draft!,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_defense_card: async () => ({ defense_card_id: "defense-1" }),
    secret: SECRET,
  });
  assertEquals(executed.status, "executed");
  assertEquals("ack" in executed, false);
  const renderedAck = renderDefenseCardExecuted({
    draft: output.draft!,
    committedEffects: [{
      type: "create_defense_card",
      operation_id: String(output.pending_confirmation?.operation_id),
      defense_card_id: "defense-1",
    }],
  });
  assertStringIncludes(renderedAck, "Ressources > Cartes de défense");
  assertStringIncludes(renderedAck, "l'ajuster depuis la plateforme");
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

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.draft?.draft.defense_response,
    "Je pose le telephone loin de moi et j'attends 10 minutes.",
  );
  assertEquals(output.draft?.draft.plan_b, "Je reduis les degats.");
  const message = output.confirmation?.message ?? "";
  assertEquals((message.match(/Le moment/g) ?? []).length, 1);
  assertEquals((message.match(/Le piège/g) ?? []).length, 1);
  assertEquals((message.match(/Mon geste/g) ?? []).length, 1);
  assertEquals((message.match(/Plan B/g) ?? []).length, 1);
  assertEquals(message.includes("Mon geste : Le moment"), false);
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
    draft_generator: structuredDefenseCardDraftGenerator,
  });
  assertEquals(invalidAttachment.status, "technical_blocked");
  assertEquals(invalidAttachment.reason_code, "invalid_ai_output");
  assertEquals(invalidAttachment.readiness.reason, "ai_slot_question_missing");
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

  assertEquals(result?.toolExecution, "blocked");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.status, "draft_ready");
  assertEquals(
    (result?.toolSkillRun as any)?.requested_effects?.[0]?.type,
    "create_defense_card",
  );
  assertEquals((result?.toolSkillRun as any)?.allowed_effects, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("prepare_defense_card router pending draft create goes through executor", async () => {
  resetConsumedConfirmationTokensForTest();
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

  assertEquals(result?.toolExecution, "success");
  assertEquals(result?.executedTools, ["prepare_defense_card"]);
  assertEquals((result?.toolSkillRun as any)?.status, "executed");
  assertEquals(
    (result?.toolSkillRun as any)?.allowed_effects?.[0]?.type,
    "create_defense_card",
  );
  assertEquals(
    (result?.toolSkillRun as any)?.committed_effects?.[0],
    {
      type: "create_defense_card",
      operation_id: "op-create",
      defense_card_id: "defense-1",
    },
  );
  assertEquals(writes.defenseWrites, 1);
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

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertStringIncludes(result?.content ?? "", "Voici ta carte de défense");
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

  assertEquals(result?.toolExecution, "blocked");
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

  assertEquals(result?.toolExecution, "blocked");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((result?.content ?? "").includes("C'est fait"), false);
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
