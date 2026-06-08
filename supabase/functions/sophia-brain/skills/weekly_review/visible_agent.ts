import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  WeeklyReviewLocalDispatcherOutput,
  WeeklyReviewVisibleTaskKind,
} from "./local_flow.ts";

export type WeeklyReviewVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: WeeklyReviewVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  weekly_state: Record<string, unknown>;
  weekly_progress_review: unknown;
  weekly_adaptive_review: unknown;
  dispatcher_output: WeeklyReviewLocalDispatcherOutput;
  handoff_summary: string | null;
  committed_effect: unknown;
};

export type WeeklyReviewVisibleAgent = (
  input: WeeklyReviewVisibleAgentInput,
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
    return cleanMessage(raw);
  }
}

function visibleTaskInstruction(stage: WeeklyReviewVisibleTaskKind): string {
  switch (stage) {
    case "answer_weekly_question":
      return "Reconnais la reponse du user, puis avance vers la lecture weekly ou la prochaine question utile. Une question max.";
    case "clarify_human_signal":
      return "Pose une seule question de clarification sur le signal humain manquant. Ne demande pas deux dimensions separees.";
    case "weekly_reading":
      return "Donne la lecture weekly en langage humain, sans appliquer quoi que ce soit. Si une direction est utile, formule-la comme proposition.";
    case "weekly_recap":
      return "Redis le bilan weekly de maniere courte. Ne rajoute pas une nouvelle decision.";
    case "explain_reasoning":
      return "Explique sobrement le raisonnement a partir des preuves daily et du ressenti humain, sans rapport technique.";
    case "plan_handoff_ready":
      return "Dis naturellement quoi reprendre dans Plan. Nomme le plan si disponible. Si plusieurs plans sont touches, groupe par plan.";
    case "revise_plan_handoff":
      return "Confirme que la version revisee remplace l'ancienne pour le handoff Plan. Redonne seulement ce qui change.";
    case "repeat_plan_handoff":
      return "Redis le chemin Plan et la proposition, sans refaire toute la justification.";
    case "apply_attempt":
      return "Refuse doucement l'application depuis le chat et redonne le chemin Plan avec la proposition a reprendre.";
    case "forgotten_progress_clarify":
      return "Demande une seule clarification pour identifier la progression oubliee. Ne dis pas que c'est corrige.";
    case "forgotten_progress_ack":
      return "Confirme seulement la correction de progression committee. Ne dis pas que le plan weekly a ete modifie.";
    case "forgotten_progress_blocked":
      return "Explique sobrement que la correction de progression n'a pas pu etre notee et demande la cible ou le niveau manquant.";
    case "complete_no_change":
      return "Ferme le weekly sans handoff Plan. Indique que rien n'est modifie depuis le chat.";
    case "stop_close":
      return "Ferme ou met de cote le weekly sans culpabiliser et sans proposer d'outil.";
    case "exit_or_cancel":
      return "Confirme sobrement la sortie locale si un message visible est necessaire. Ne traite pas la nouvelle demande.";
    case "safety":
      return "Ne continue pas le weekly. Formule une transition minimale laissant la prise en charge safety reprendre.";
  }
}

function visibleSystemPrompt(input: WeeklyReviewVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du flow weekly_adaptive_review_v1.",
    "Tu ecris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne decides pas les faits, tu ne corriges pas le reducer.",
    "Le weekly est un point de fin de semaine: il peut recommander une direction, mais ne modifie jamais le plan depuis le chat.",
    "Ne mentionne jamais JSON, dispatcher, reducer, table, prompt, labels internes ou outil interne.",
    "N'utilise pas les labels internes: bridge_week, carry_over, repeat_week, level_review, plan_patch, item_decision, dominant_blocker.",
    "Ne dis jamais que tu as applique, modifie, reporte, valide, enregistre ou cree un changement de plan.",
    "Ne cree aucun pending confirmation executable.",
    "Ne propose pas carte, potion, rappel ou preference coach.",
    "Une question maximum quand tu poses une question.",
    "Reste compact.",
    visibleTaskInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runWeeklyReviewVisibleAgent(
  input: WeeklyReviewVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_weekly_adaptive_review_visible_message",
    stage: input.stage,
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    weekly_state: input.weekly_state,
    weekly_progress_review_summary: input.weekly_progress_review,
    weekly_adaptive_review: input.weekly_adaptive_review,
    dispatcher_output: input.dispatcher_output,
    handoff_summary: input.handoff_summary,
    committed_effect: input.committed_effect,
    hard_constraints: {
      no_chat_plan_mutation: true,
      executedTools: [],
      committed_plan_effects: [],
      platform_destination: input.dispatcher_output.handoff_updates
        .platform_destination,
      no_internal_labels: true,
      one_question_max: true,
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
        source: `weekly_adaptive_review.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return parseVisibleMessage(raw);
  } catch (error) {
    console.warn("[WeeklyReview] visible agent failed", error);
    return null;
  }
}
