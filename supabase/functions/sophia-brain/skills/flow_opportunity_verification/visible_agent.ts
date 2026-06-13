import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import type {
  FlowOpportunityConversationContext,
  FlowOpportunityVisibleTaskKind,
} from "./contract.ts";

export type FlowOpportunityVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: FlowOpportunityVisibleTaskKind;
  conversation_context: FlowOpportunityConversationContext;
};

export type FlowOpportunityVisibleAgent = (
  input: FlowOpportunityVisibleAgentInput,
) => Promise<string | null>;

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return null;
  }
}

function stageInstruction(stage: FlowOpportunityVisibleTaskKind): string {
  switch (stage) {
    case "offer_status_recap":
      return "Propose un rappel d'etat court sans rendre le recap.";
    case "offer_preference_update":
      return "Propose d'ajuster les preferences coach sans dire que la preference est modifiee.";
    case "offer_emotional_repair":
      return "Propose une prise en charge emotionnelle courte, sans diagnostic.";
    case "offer_demotivation_repair":
      return "Propose une aide de remobilisation courte, sans moraliser.";
    case "reanchor_offer_after_product_help":
      return "Rappelle sobrement l'offre initiale apres l'explication produit.";
    case "handoff_status_recap_ready":
      return "Transition minimale vers status_recap; ne rends pas le status toi-meme.";
    case "handoff_target_flow_ready":
      return "Transition minimale vers le flow cible; ne promets pas d'effet final.";
    case "decline_ack":
      return "Confirme sans insister que l'opportunite n'est pas lancee.";
    case "repeat_current_state":
      return "Repete l'offre initiale sans changer de flow.";
    case "revise_focus_question":
      return "Pose une seule question ou confirme le nouveau focus.";
    case "correct_target_flow_ack":
      return "Acte la correction sans executer l'effet final.";
    case "blocked_or_unsupported":
      return "Explique sobrement que la demande inline n'est pas couverte.";
    case "complete_or_stale":
      return "Cloture sans relancer l'opportunite.";
    case "stop_or_cancel":
      return "Confirme la sortie ou l'annulation, sans nouvelle proposition.";
    case "exit_ack":
      return "Message tres court ou vide si le meme message sera reprocess.";
    case "safety_transition":
      return "Ne propose rien; transition minimale vers safety.";
    case "offer_target_flow_generic":
      return "Propose le flow cible sans inventer ses capacites.";
    case "none":
      return "Retourne un message vide.";
  }
}

function visibleSystemPrompt(input: FlowOpportunityVisibleAgentInput): string {
  const stage = input.stage;
  return [
    `Tu es l'agent conversationnel local stage-specific: ${stage}.`,
    "Tu écris uniquement le prochain message visible de Sophia pour ce stage.",
    "Tu ne routes pas, tu ne choisis pas le flow, tu ne valides pas de mutation.",
    "Tu utilises uniquement visible_task.conversation_context. Aucun autre contexte n'est disponible.",
    "N'affirme jamais qu'une preference, carte, potion, rappel ou plan a ete modifie sans commit du flow cible.",
    "Si conversation_context.direct_effect_results contient committed_effects, confirme ces effets dans ton message visible, avec le style du flow courant.",
    "Si conversation_context.direct_effect_results contient seulement blocked_effects, ne confirme aucun effet; demande la precision manquante naturellement.",
    "Ne mentionne jamais JSON, dispatcher, reducer, DB, table, prompt ou outil interne.",
    "Ne rends pas product_help; si product_help est appele, sa reponse visible appartient a product_help.",
    "Ne rends pas status_recap; le flow status_recap rendra les faits DB-grounded.",
    VISIBLE_OUTPUT_STYLE_RULES,
    stageInstruction(stage),
    "Style: court, naturel, une seule question maximum si une question est necessaire.",
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runFlowOpportunityVisibleAgent(
  input: FlowOpportunityVisibleAgentInput,
): Promise<string | null> {
  if (input.stage === "none" || input.stage === "exit_ack") {
    return "";
  }
  const directEffectResults = input.conversation_context &&
      typeof input.conversation_context === "object" &&
      !Array.isArray(input.conversation_context)
    ? (input.conversation_context as Record<string, unknown>)
      .direct_effect_results
    : null;
  const committedEffects = directEffectResults &&
      typeof directEffectResults === "object" &&
      !Array.isArray(directEffectResults) &&
      Array.isArray((directEffectResults as any).committed_effects)
    ? (directEffectResults as any).committed_effects
    : [];
  const blockedEffects = directEffectResults &&
      typeof directEffectResults === "object" &&
      !Array.isArray(directEffectResults) &&
      Array.isArray((directEffectResults as any).blocked_effects)
    ? (directEffectResults as any).blocked_effects
    : [];
  const userPrompt = JSON.stringify({
    task: "write_flow_opportunity_visible_message",
    stage: input.stage,
    visible_task: {
      kind: input.stage,
      conversation_context: input.conversation_context,
    },
    hard_constraints: {
      toolExecution: "none",
      executedTools: [],
      committed_effects: committedEffects,
      blocked_effects: blockedEffects,
      must_confirm_committed_direct_effects: committedEffects.length > 0,
      must_not_confirm_blocked_direct_effects: blockedEffects.length > 0,
      no_durable_claim_without_target_commit: true,
      no_product_help_rendering: true,
      no_status_recap_rendering: true,
      no_mutation_language: true,
    },
    required_json_shape: { message: "string" },
  });
  try {
    const raw = await generateWithGemini(
      visibleSystemPrompt(input),
      userPrompt,
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `flow_opportunity_verification.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    return message;
  } catch (error) {
    console.warn("[FlowOpportunityVerification] visible agent failed", error);
    return null;
  }
}
