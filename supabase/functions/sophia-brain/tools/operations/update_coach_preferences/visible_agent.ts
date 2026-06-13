import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../../router/response_style_policy.ts";
import type {
  CoachPreferenceConversationContext,
  CoachPreferenceVisibleTaskKind,
} from "./contract.ts";

export type CoachPreferenceVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: CoachPreferenceVisibleTaskKind;
  conversation_context: CoachPreferenceConversationContext;
};

export type CoachPreferenceVisibleAgent = (
  input: CoachPreferenceVisibleAgentInput,
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

const STAGE_PROMPTS: Record<CoachPreferenceVisibleTaskKind, string> = {
  preference_saved:
    "Stage preference_saved. Confirme naturellement seulement si conversation_context.write_result.committed=true. Mentionne les préférences écrites depuis conversation_context. Ne promets jamais un format non supporté.",
  ask_durable_vs_punctual:
    "Stage ask_durable_vs_punctual. Demande en une seule question si la demande vaut seulement maintenant ou durablement. Ne choisis pas toi-même.",
  ask_setting_or_value:
    "Stage ask_setting_or_value. Demande en une seule question la préférence ou l'intensité manquante indiquée par conversation_context.missing_or_weak_values.",
  confirm_supported_mapping:
    "Stage confirm_supported_mapping. Demande confirmation pour traduire la demande vers le réglage supporté proposé dans selected_candidate/known_values.proposed_updates. Ne dis pas que c'est enregistré.",
  punctual_instruction_ack:
    "Stage punctual_instruction_ack. Accuse réception comme consigne ponctuelle pour cette réponse seulement. Ne prétends pas stocker une préférence durable.",
  unsupported_preference:
    "Stage unsupported_preference. Explique sobrement qu'il n'existe pas de réglage durable pour cette demande exacte. Propose seulement un mapping si conversation_context en fournit un.",
  get_info_db:
    "Stage get_info_db. Ce stage devrait être rendu par status_recap inline. Si tu es appelé, utilise seulement inline_tool_result.summary et ne modifie rien.",
  get_info_product:
    "Stage get_info_product. Ce stage devrait être rendu par product_help inline. Si tu es appelé, explique seulement les trois réglages disponibles depuis conversation_context.",
  repeat_saved_preferences:
    "Stage repeat_saved_preferences. Redis court les préférences récemment écrites ou proposées depuis conversation_context, sans lire d'autre contexte.",
  repeat_current_state:
    "Stage repeat_current_state. Redis court l'état courant du flow depuis conversation_context. Ne décide rien de nouveau.",
  write_failed_or_blocked:
    "Stage write_failed_or_blocked. Dis clairement que ce n'est pas appliqué/stocké et donne la raison user-safe fournie dans write_result.blocked_reason.",
  inline_tool_return:
    "Stage inline_tool_return. Fais une reprise courte après un inline tool si conversation_context l'exige. Ne refais pas la réponse du sous-skill.",
  exit_or_cancel:
    "Stage exit_or_cancel. Confirme l'annulation locale en une phrase courte. Ne traite aucun nouveau sujet.",
  stop_or_cancel:
    "Stage stop_or_cancel. Acknowledge l'arrêt local en une phrase courte, sans question finale, sans relance, sans outil.",
  exit_ack:
    "Stage exit_ack. Si un ack est nécessaire avant handoff, une phrase minimale. Ne traite pas le nouveau sujet; le dispatcher cible le fera.",
  safety:
    "Stage safety. Ne traite pas la préférence. Transition minimale, sans conseil safety complet.",
  safety_transition:
    "Stage safety_transition. Ne traite pas la préférence. Transition minimale laissant safety_crisis reprendre.",
};

function visibleSystemPrompt(input: CoachPreferenceVisibleAgentInput): string {
  return [
    `Tu es le prompt visible stage-specific ${input.stage} du flow update_coach_preferences.`,
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne décides aucune préférence, tu ne mappes aucune demande, tu ne routes pas et tu ne corriges pas l'état.",
    "Tu reçois uniquement visible_task.conversation_context déjà filtré par le dispatcher local/reducer/runtime.",
    "Ne lis pas et n'invente pas de DB, mémoire brute, state brut, routing ou outil.",
    "Ne prétends jamais qu'une préférence est notée, gardée, enregistrée, appliquée ou modifiée si conversation_context.write_result.committed=false.",
    "Si conversation_context.write_result.committed=true, tu peux confirmer le commit réel avec un ton naturel.",
    "Ne mentionne jamais de confirmation token, pending confirmation, JSON, reducer, dispatcher, DB ou table.",
    "N'écris pas un template fixe ni une fiche à libellés.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Si le stage demande une question, pose une seule question.",
    STAGE_PROMPTS[input.stage],
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runCoachPreferenceVisibleAgent(
  input: CoachPreferenceVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_update_coach_preferences_visible_message",
    stage: input.stage,
    conversation_context: input.conversation_context,
    hard_constraints: {
      visible_agent_does_not_decide_preferences: true,
      success_claim_requires_conversation_context_committed_true: true,
      only_use_conversation_context: true,
      supported_preferences_only: {
        "coach.tone": ["soft", "warm_direct", "direct"],
        "coach.challenge_level": ["low", "balanced", "high"],
        "coach.question_tendency": ["low", "normal", "high"],
      },
    },
    required_json_shape: { message: "string" },
  });
  try {
    const raw = await generateWithGemini(
      visibleSystemPrompt(input),
      userPrompt,
      0.45,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `update_coach_preferences.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    return message;
  } catch (error) {
    console.warn("[UpdateCoachPreferences] visible agent failed", error);
    return null;
  }
}
