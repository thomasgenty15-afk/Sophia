import { baseOutput } from "../_shared/skill_helpers.ts";
import { conversationEffectsFromCandidates } from "../_shared/conversation_skill_contract.ts";
import {
  type ProductHelpDecision,
  validateProductHelpDecision,
} from "./contract.ts";
import {
  enforceProductHelpReplyInvariants,
  renderProductHelpReply,
} from "./renderer.ts";
import type { ProductHelpFeature } from "./knowledge.ts";

export function reduceProductHelpTurn(args: {
  decision: ProductHelpDecision;
  feature: ProductHelpFeature;
  intake_errors: string[];
}) {
  const intakeOk = args.intake_errors.length === 0;
  const decision = validateProductHelpDecision(args.decision);
  const bridge = intakeOk ? decision.bridge : undefined;
  const reply = intakeOk
    ? enforceProductHelpReplyInvariants(
      decision.reply || renderProductHelpReply(decision, args.feature),
      decision,
      args.feature,
    )
    : undefined;

  return baseOutput("product_help", {
    status: "complete",
    response_intent: intakeOk ? decision.intent : "technical_intake_failure",
    reply,
    diagnosis: {
      feature_id: decision.target.feature_id || args.feature.id,
      feature_label: args.feature.label,
      intent: intakeOk ? decision.intent : "unclear",
      target: intakeOk ? decision.target : {
        kind: "unknown",
        confidence_band: "low",
      },
      grounding: intakeOk ? decision.grounding : {
        catalog_feature_ids: [],
        db_sources_required: false,
        db_sources_used: [],
      },
      bridge: bridge ?? null,
      operation_bridge: bridge
        ? {
          skill_or_operation: bridge.operation_type,
          requires_confirmation: true,
        }
        : intakeOk
        ? args.feature.operation_bridge ?? null
        : null,
      constraints: decision.constraints,
      locations: args.feature.locations.map((location) => location.surface),
      intake_status: intakeOk ? "structured" : "technical_fallback",
      intake_errors: args.intake_errors,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "product_help_does_not_execute_operations",
        "operation_bridge_requires_confirmation_when_present",
        ...decision.constraints,
      ],
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: conversationEffectsFromCandidates({
      intake_failed: !intakeOk,
    }),
    state_patch: {
      ...(intakeOk ? decision.state_patch : {}),
      summary: intakeOk
        ? decision.state_patch.summary ??
          `Product help answered for ${args.feature.id}.`
        : "Product help intake failed; no product answer rendered by code.",
      product_help_intake_errors: args.intake_errors,
      product_help_decision: intakeOk
        ? {
          intent: decision.intent,
          target: decision.target,
          bridge: bridge ?? null,
          operation_suggestions: [],
        }
        : null,
    },
  });
}

export const PRODUCT_HELP_REDUCER_INVARIANTS = [
  "product_help_never_executes_operations",
  "intake_failure_no_product_claim",
  "bridge_requires_confirmation",
  "operation_suggestions_always_empty",
] as const;
