import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import {
  VISIBLE_OUTPUT_STYLE_RULES,
  visibleOutputStyleIssues,
} from "../router/response_style_policy.ts";
import type {
  ClarificationConversationContext,
  ClarificationLocalState,
  ClarificationVisibleTask,
  ClarificationVisibleTaskKind,
} from "./contract.ts";

export type ClarificationVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: ClarificationVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  local_state: ClarificationLocalState | null;
  visible_task: ClarificationVisibleTask;
  dispatcher_evidence: string[];
};

export type ClarificationVisibleAgent = (
  input: ClarificationVisibleAgentInput,
) => Promise<string | null>;

function stagePrompt(stage: ClarificationVisibleTaskKind): string {
  const common = [
    "Tu ecris le prochain message visible de Sophia dans le flow clarification.",
    "Tu ne decides pas, tu ne routes pas, tu ne remplis aucun champ metier.",
    "Tu ecris seulement depuis conversation_context.",
    "Tu n'as pas acces a la DB brute, a la memoire brute, au reducer, ni a l'etat local complet.",
    "Ne parle jamais de dispatcher, signal, candidate_id, candidat, JSON, operation_type, reducer ou note_information.",
    "Ne dis jamais qu'une action est creee, lancee, activee, programmee, enregistree ou executee.",
    "Ne lance aucun outil et ne promets aucune mutation.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Retourne uniquement le message visible.",
  ];
  switch (stage) {
    case "ask_choice":
      return [
        ...common,
        "Stage: ask_choice.",
        "Pose une seule question naturelle pour aider le user a choisir entre les directions plausibles.",
        "Utilise candidate_labels et question_goal. Ne liste pas toutes les options si cela alourdit.",
        "Message court. Pas de recommandation sauf si visible_task donne une meilleure hypothese explicite.",
      ].join("\n");
    case "ask_target_reference":
      return [
        ...common,
        "Stage: ask_target_reference.",
        "Pose une seule question ciblee pour identifier l'action, carte, rappel ou objet vise.",
        "Si best_reference_guess existe, utilise-le pour formuler une confirmation ou une alternative courte.",
        "Si plusieurs known_references existent, cite seulement la plus utile; ne fais pas un inventaire.",
      ].join("\n");
    case "confirm_candidate":
      return [
        ...common,
        "Stage: confirm_candidate.",
        "Confirme sobrement l'hypothese fournie par selected_candidate_label ou best_reference_guess.",
        "Pose une seule question de confirmation si question_constraints.should_confirm_guess=true.",
        "Ne verrouille rien et ne dis jamais que c'est fait.",
      ].join("\n");
    case "ask_disambiguation":
      return [
        ...common,
        "Stage: ask_disambiguation.",
        "Pose une seule question naturelle qui aide le user a choisir entre les directions plausibles.",
        "Message court. Pas de recommandation.",
      ].join("\n");
    case "ask_simpler_choice":
      return [
        ...common,
        "Stage: ask_simpler_choice.",
        "Repose une question plus simple avec deux ou trois options maximum.",
        "Une seule question. Ne culpabilise pas.",
      ].join("\n");
    case "still_ambiguous":
      return [
        ...common,
        "Stage: still_ambiguous.",
        "Dis simplement ce qui reste flou et demande une precision minimale.",
        "Une seule question.",
      ].join("\n");
    case "resolved_transition":
      return [
        ...common,
        "Stage: resolved_transition.",
        "Acknowledgement naturel et court.",
        "Ne dis pas que l'action est faite. Ne pose pas de nouvelle question.",
      ].join("\n");
    case "explain_options":
      return [
        ...common,
        "Stage: explain_options.",
        "Explique courtement la difference entre options sans choisir a la place du user.",
        "Termine par une seule question de choix si utile.",
      ].join("\n");
    case "repeat_question":
      return [
        ...common,
        "Stage: repeat_question.",
        "Redis la question plus clairement.",
        "Une seule question. Pas d'historique long.",
      ].join("\n");
    case "stop_or_cancel":
      return [
        ...common,
        "Stage: stop_or_cancel.",
        "Acknowledgement court et fermeture locale.",
        "Ne pose aucune question finale. Ne propose pas de continuer.",
      ].join("\n");
    case "exit_ack":
      return [
        ...common,
        "Stage: exit_ack.",
        "Transition tres courte pour laisser le nouveau sujet etre traite.",
        "Ne pose pas de question.",
      ].join("\n");
    case "inline_info_return":
    case "inline_tool_return":
      return [
        ...common,
        "Stage: inline_info_return.",
        "Ramene doucement au choix initial apres une reponse inline.",
        "Utilise question_goal ou resume_clarification_goal si fourni dans visible_task.",
        "Une seule question maximum. Ne repete pas toute la reponse inline.",
      ].join("\n");
    case "safety":
      return [
        ...common,
        "Stage: safety.",
        "Ne continue pas la clarification. Priorite a la securite.",
        "Message minimal.",
      ].join("\n");
  }
  return [
    ...common,
    `Stage: ${stage}.`,
    "Suis strictement visible_task.",
  ].join("\n");
}

function guardVisibleMessage(
  message: string,
  stage: ClarificationVisibleTaskKind,
): string | null {
  void stage;
  const trimmed = message.trim();
  if (!trimmed) return null;
  if (visibleOutputStyleIssues(trimmed).length > 0) return null;
  const forbidden = [
    /\bdispatcher\b/i,
    /\bsignal\b/i,
    /\bcandidate_id\b/i,
    /\bcandidat\b/i,
    /\bjson\b/i,
    /\boperation_type\b/i,
    /\breducer\b/i,
    /\bnote_information\b/i,
  ];
  return forbidden.some((pattern) => pattern.test(trimmed)) ? null : trimmed;
}

function conversationContext(
  visibleTask: ClarificationVisibleTask,
): ClarificationConversationContext {
  return visibleTask.conversation_context;
}

export function buildClarificationVisibleAgentUserPrompt(
  input: ClarificationVisibleAgentInput,
): string {
  return JSON.stringify({
    stage: input.stage,
    conversation_context: conversationContext(input.visible_task),
  });
}

export const runClarificationVisibleAgent: ClarificationVisibleAgent = async (
  input,
) => {
  const userPrompt = buildClarificationVisibleAgentUserPrompt(input);
  try {
    const text = await generateWithGemini(
      stagePrompt(input.stage),
      userPrompt,
      0.4,
      false,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `clarification.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = String(text ?? "").trim();
    return message ? guardVisibleMessage(message, input.stage) : null;
  } catch (error) {
    console.warn("[Clarification] visible agent failed", {
      stage: input.stage,
      error,
    });
    return null;
  }
};
