import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  VISIBLE_OUTPUT_STYLE_RULES,
  visibleOutputStyleIssues,
} from "../../router/response_style_policy.ts";
import type {
  EmotionalRepairVisibleTask,
  EmotionalRepairVisibleTaskKind,
} from "./contract.ts";

export type EmotionalRepairVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: EmotionalRepairVisibleTaskKind;
  visible_task: EmotionalRepairVisibleTask;
};

export type EmotionalRepairVisibleAgent = (
  input: EmotionalRepairVisibleAgentInput,
) => Promise<string | null>;

function stagePrompt(stage: EmotionalRepairVisibleTaskKind): string {
  const common = [
    "Tu ecris le prochain message visible de Sophia dans emotional_repair.",
    "Tu ne decides pas, tu ne routes pas, tu ne remplis pas les champs potion.",
    "Tu ecris seulement depuis visible_task.conversation_context.",
    "Tu n'utilises pas l'etat local brut, la DB brute ou la memoire brute.",
    "Retourne uniquement le message visible, sans Markdown technique.",
    "Ne promets aucun write DB, aucune creation, aucune activation, aucun rappel.",
    "Si conversation_context.selected_candidate.potion est null, ne propose aucune potion.",
    VISIBLE_OUTPUT_STYLE_RULES,
  ];
  switch (stage) {
    case "soft_presence":
      return [
        ...common,
        "Stage: soft_presence.",
        "Reste avec le user sans outil, sans plan, sans technique.",
        "Pas de potion. Pas de question si max_questions=0.",
      ].join("\n");
    case "de_shame":
      return [
        ...common,
        "Stage: de_shame.",
        "Separe honte/culpabilite et verdict identitaire.",
        "Pas de plan ni priorisation. Une question maximum si autorisee.",
      ].join("\n");
    case "separate_fact_from_identity":
      return [
        ...common,
        "Stage: separate_fact_from_identity.",
        "Garde le fait concret et refuse le verdict sur la personne.",
        "Ne repete pas l'auto-insulte comme identite principale.",
      ].join("\n");
    case "repair_relationship":
      return [
        ...common,
        "Stage: repair_relationship.",
        "Aide a reparer un lien ou une parole sans transformer ca en plan.",
        "Si une phrase concrete est utile, donne une phrase simple.",
      ].join("\n");
    case "concrete_phrase":
      return [
        ...common,
        "Stage: concrete_phrase.",
        "Donne une seule formulation directement utilisable, sobre et humaine.",
        "Pas de liste. Pas de protocole.",
      ].join("\n");
    case "stabilize_anxiety":
      return [
        ...common,
        "Stage: stabilize_anxiety.",
        "Apaise une anxiete non safety sans pousser produit ou performance.",
        "Si no_technique/no_protocol est present, reste en presence douce sans exercice.",
      ].join("\n");
    case "potion_bridge_offer":
      return [
        ...common,
        "Stage: potion_bridge_offer.",
        "Propose seulement la potion selectionnee comme suite consentie, sans l'activer.",
        "Noms exacts autorises: Potion d'amour, Potion de guerison, Potion d'apaisement.",
        "Explique en une phrase pourquoi elle correspond au besoin durable, puis demande consentement simple.",
      ].join("\n");
    case "potion_bridge_choice":
      return [
        ...common,
        "Stage: potion_bridge_choice.",
        "Fais choisir entre deux options maximum parmi amour, guerison, apaisement.",
        "Ne lance rien.",
      ].join("\n");
    case "potion_bridge_handoff":
      return [
        ...common,
        "Stage: potion_bridge_handoff.",
        "Message tres court de transition vers select_state_potion.",
        "Ne dis pas activee, lancee, creee ou enregistree.",
        "Ne redemande pas l'episode emotionnel.",
      ].join("\n");
    case "ask_gentle_clarification":
      return [
        ...common,
        "Stage: ask_gentle_clarification.",
        "Pose une seule question douce centree sur l'emotion ou le besoin durable.",
      ].join("\n");
    case "repeat_repair":
    case "exit_or_cancel":
      return [
        ...common,
        `Stage: ${stage}.`,
        "Redis le dernier point utile ou sors doucement du flow.",
        "Pas de nouvel outil.",
      ].join("\n");
    case "safety":
      return [
        ...common,
        "Stage: safety.",
        "Ne traite pas le contenu comme un flow emotionnel normal; indique que la priorite est la securite.",
      ].join("\n");
  }
}

export const runEmotionalRepairVisibleAgent: EmotionalRepairVisibleAgent =
  async (input) => {
    const userPrompt = JSON.stringify({
      task: "write_emotional_repair_visible_message",
      stage: input.stage,
      conversation_context: input.visible_task.conversation_context,
    });
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
          source: `emotional_repair.visible.${input.stage}`,
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
      const message = String(text ?? "").trim();
      return message && visibleOutputStyleIssues(message).length === 0
        ? message
        : null;
    } catch (error) {
      console.warn("[EmotionalRepair] visible agent failed", {
        stage: input.stage,
        error,
      });
      return null;
    }
  };
