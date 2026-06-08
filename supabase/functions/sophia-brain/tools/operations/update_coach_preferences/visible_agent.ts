import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type {
  CoachPreferenceLocalUpdate,
  CoachPreferenceVisibleTaskKind,
} from "./contract.ts";
import type { CoachPreferenceLocalFlowState } from "./state.ts";

export type CoachPreferenceVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: CoachPreferenceVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  local_state: CoachPreferenceLocalFlowState | null;
  current_preferences: Array<{ key: string; value: string; label: string }>;
  write_updates: CoachPreferenceLocalUpdate[];
  committed: boolean;
  committed_update_ids: string[];
  get_info_db_reply?: string | null;
  dispatcher_instruction?: string | null;
  blocked_reason?: string | null;
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

function visibleTaskInstruction(stage: CoachPreferenceVisibleTaskKind): string {
  switch (stage) {
    case "preference_saved":
      return "Confirme naturellement seulement parce que committed=true. Mentionne les préférences écrites, sans promettre un format non supporté.";
    case "ask_durable_vs_punctual":
      return "Demande en une seule question si la demande vaut seulement maintenant ou durablement.";
    case "ask_setting_or_value":
      return "Demande en une seule question la préférence ou l'intensité manquante.";
    case "confirm_supported_mapping":
      return "Demande confirmation pour traduire la demande vers le réglage supporté proposé; ne dis pas que c'est enregistré.";
    case "punctual_instruction_ack":
      return "Accuse réception comme consigne ponctuelle pour cette réponse seulement; ne prétends pas stocker une préférence.";
    case "unsupported_preference":
      return "Explique sobrement qu'il n'existe pas de réglage durable pour cette demande exacte; propose le mapping fourni s'il existe, sans l'enregistrer.";
    case "get_info_db":
      return "Réponds à partir du get_info_db_reply fourni, sans modifier les préférences.";
    case "get_info_product":
      return "Explique brièvement les trois réglages disponibles: ton, niveau de challenge, tendance à poser des questions.";
    case "repeat_saved_preferences":
      return "Redis court les préférences récemment écrites si l'état les fournit.";
    case "write_failed_or_blocked":
      return "Dis clairement que ce n'est pas appliqué/stocké et donne la raison utile sans détail technique lourd.";
    case "exit_or_cancel":
      return "Sors proprement du flow ou confirme l'annulation en une phrase courte.";
    case "safety":
      return "Ne traite pas la préférence; formule une transition minimale laissant la prise en charge safety reprendre.";
  }
}

function visibleSystemPrompt(input: CoachPreferenceVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du flow update_coach_preferences.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne décides aucune préférence, tu ne mappes aucune demande, tu ne routes pas et tu ne corriges pas l'état.",
    "Tu reçois un état déjà décidé par le dispatcher local, le reducer et le writer DB.",
    "Ne prétends jamais qu'une préférence est notée, gardée, enregistrée, appliquée ou modifiée si committed=false.",
    "Si committed=true, tu peux confirmer le commit DB réel avec un ton naturel.",
    "Ne mentionne jamais de confirmation token, pending confirmation, JSON, reducer, dispatcher, DB ou table.",
    "N'écris pas un template fixe ni une fiche à libellés.",
    "Si le stage demande une question, pose une seule question.",
    visibleTaskInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runCoachPreferenceVisibleAgent(
  input: CoachPreferenceVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_update_coach_preferences_visible_message",
    stage: input.stage,
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    local_state: input.local_state,
    current_preferences: input.current_preferences,
    write_updates: input.write_updates,
    committed: input.committed,
    committed_update_ids: input.committed_update_ids,
    get_info_db_reply: input.get_info_db_reply ?? null,
    dispatcher_instruction: input.dispatcher_instruction ?? null,
    blocked_reason: input.blocked_reason ?? null,
    hard_constraints: {
      visible_agent_does_not_decide_preferences: true,
      success_claim_requires_committed_true: true,
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
    return parseVisibleMessage(raw);
  } catch (error) {
    console.warn("[UpdateCoachPreferences] visible agent failed", error);
    return null;
  }
}
