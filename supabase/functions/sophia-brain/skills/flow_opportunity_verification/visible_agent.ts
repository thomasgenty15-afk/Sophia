import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  FlowOpportunityLocalState,
  FlowOpportunityVisibleTaskKind,
} from "./contract.ts";

export type FlowOpportunityVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: FlowOpportunityVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  local_state: FlowOpportunityLocalState | null;
  dispatcher_instruction?: string | null;
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
    case "accept_and_launch_status_recap":
      return "Transition minimale vers status_recap; ne rends pas le status toi-meme.";
    case "accept_and_launch_target_flow":
      return "Transition minimale vers le flow cible; ne promets pas d'effet final.";
    case "decline_ack":
      return "Confirme sans insister que l'opportunite n'est pas lancee.";
    case "repeat_offer":
      return "Repete l'offre initiale sans changer de flow.";
    case "revise_focus_question":
      return "Pose une seule question ou confirme le nouveau focus.";
    case "correct_target_flow_ack":
      return "Acte la correction sans executer l'effet final.";
    case "unsupported_inside_flow":
      return "Explique sobrement que la demande inline n'est pas couverte.";
    case "stale_or_already_answered":
      return "Cloture sans relancer l'opportunite.";
    case "cancel_or_exit":
      return "Confirme la sortie ou l'annulation, sans nouvelle proposition.";
    case "handoff_to_global":
      return "Message tres court ou vide si le meme message sera reprocess.";
    case "safety":
      return "Ne propose rien; transition minimale vers safety.";
    case "offer_target_flow_generic":
      return "Propose le flow cible sans inventer ses capacites.";
    case "none":
      return "Retourne un message vide.";
  }
}

function fallbackVisibleMessage(
  input: FlowOpportunityVisibleAgentInput,
): string {
  const target = input.local_state?.target_flow ?? "ce point";
  switch (input.stage) {
    case "offer_status_recap":
      return "Tu veux que je te fasse un rappel rapide de ce qui est actif ?";
    case "offer_preference_update":
      return "Tu veux qu'on regarde si ça mérite un ajustement de tes préférences coach ?";
    case "offer_emotional_repair":
      return "Tu veux qu'on prenne ça par un petit point émotionnel plutôt que de pousser l'action ?";
    case "offer_demotivation_repair":
      return "Tu veux qu'on fasse un mini-reset pour retrouver un peu d'élan ?";
    case "reanchor_offer_after_product_help":
      return "Du coup, tu veux que je reprenne l'offre initiale maintenant ?";
    case "accept_and_launch_status_recap":
      return "Ok, je te fais le rappel.";
    case "accept_and_launch_target_flow":
      return "Ok, je bascule sur ça.";
    case "decline_ack":
      return "Ok, je ne lance pas ça.";
    case "repeat_offer":
      return `Je te proposais de lancer ${target}. Tu veux qu'on le fasse ?`;
    case "revise_focus_question":
      return "Tu veux que je le fasse sur quel focus exactement ?";
    case "correct_target_flow_ack":
      return "Ok, je change de direction.";
    case "unsupported_inside_flow":
      return "Je ne peux pas traiter ça dans cette vérification.";
    case "stale_or_already_answered":
      return "Ok, je laisse cette proposition de côté.";
    case "cancel_or_exit":
      return "Ok, on sort de cette proposition.";
    case "safety":
      return "Je mets cette proposition de côté.";
    case "handoff_to_global":
    case "none":
      return "";
    case "offer_target_flow_generic":
      return `Tu veux que je lance ${target} ?`;
  }
}

function visibleSystemPrompt(input: FlowOpportunityVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du flow flow_opportunity_verification.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne choisis pas le flow, tu ne valides pas de mutation.",
    "N'affirme jamais qu'une preference, carte, potion, rappel ou plan a ete modifie sans commit du flow cible.",
    "Ne mentionne jamais JSON, dispatcher, reducer, DB, table, prompt ou outil interne.",
    "Ne rends pas product_help; si product_help est appele, sa reponse visible appartient a product_help.",
    "Ne rends pas status_recap; le flow status_recap rendra les faits DB-grounded.",
    stageInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runFlowOpportunityVisibleAgent(
  input: FlowOpportunityVisibleAgentInput,
): Promise<string | null> {
  if (input.stage === "none" || input.stage === "handoff_to_global") {
    return "";
  }
  const userPrompt = JSON.stringify({
    task: "write_flow_opportunity_visible_message",
    stage: input.stage,
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    local_state: input.local_state,
    dispatcher_instruction: input.dispatcher_instruction ?? null,
    hard_constraints: {
      toolExecution: "none",
      executedTools: [],
      committed_effects: [],
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
    return parseVisibleMessage(raw) ?? fallbackVisibleMessage(input);
  } catch (error) {
    console.warn("[FlowOpportunityVerification] visible agent failed", error);
    return fallbackVisibleMessage(input);
  }
}
