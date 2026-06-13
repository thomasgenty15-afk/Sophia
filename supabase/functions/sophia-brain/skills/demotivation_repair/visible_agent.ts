import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import type {
  DemotivationRepairVisibleTask,
  DemotivationRepairVisibleTaskKind,
} from "./contract.ts";

export type DemotivationRepairVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: DemotivationRepairVisibleTaskKind;
  visible_task: DemotivationRepairVisibleTask;
};

export type DemotivationRepairVisibleAgent = (
  input: DemotivationRepairVisibleAgentInput,
) => Promise<string | null>;

export function stagePrompt(stage: DemotivationRepairVisibleTaskKind): string {
  const common = [
    "Tu ecris le prochain message visible de Sophia dans demotivation_repair.",
    "Tu ne decides pas, tu ne routes pas, tu ne remplis pas les champs potion.",
    "Tu ecris seulement depuis visible_task.conversation_context.",
    "Tu n'utilises pas l'etat local brut, la DB brute, la memoire brute ou les messages recents bruts.",
    "Retourne uniquement le message visible, sans Markdown technique.",
    "Ne promets aucun write DB, aucune creation, aucune activation, aucun rappel.",
    "Si conversation_context.selected_candidate.potion est null, ne propose aucune potion.",
    "Respecte strictement conversation_context.max_questions: si max_questions=0, ne pose aucune question, n'utilise pas de point d'interrogation, et ne demande pas au user de repondre.",
    "Si max_questions=1, pose au maximum une seule question.",
    "Ne traite jamais la demotivation comme de la paresse.",
    "Ne dis jamais Potion rappel ni rappel comme nom visible de potion.",
    VISIBLE_OUTPUT_STYLE_RULES,
  ];
  switch (stage) {
    case "diagnose":
      return [
        ...common,
        "Stage: diagnose.",
        "Nomme doucement le type de decrochage sans moraliser.",
        "Pas de potion tant que le diagnostic est flou. Pas de plan edit.",
        "Une question maximum si autorisee.",
      ].join("\n");
    case "reduce_friction":
      return [
        ...common,
        "Stage: reduce_friction.",
        "Baisse la friction sans injonction.",
        "Si une micro-action est autorisee, elle doit etre minuscule et non culpabilisante.",
        "Ne propose pas de plan complet.",
      ].join("\n");
    case "restore_meaning":
      return [
        ...common,
        "Stage: restore_meaning.",
        "Aide le user a retrouver le lien entre actions, cap, raison profonde et energie.",
        "Ne route pas automatiquement vers Potion de clarté.",
        "Une question maximum centree sur ce qui ne fait plus sens.",
      ].join("\n");
    case "stabilize_energy":
      return [
        ...common,
        "Stage: stabilize_energy.",
        "Respecte une energie basse et protege le user d'un effort trop grand.",
        "Si le user demande juste soutien sans outil, reste conversationnel.",
      ].join("\n");
    case "smaller_step":
      return [
        ...common,
        "Stage: smaller_step.",
        "Donne un seul pas minuscule si le contrat autorise une action concrete.",
        "Pas de liste. Pas de plan edit. Ne dis pas que le user doit se forcer.",
      ].join("\n");
    case "action_card_candidate":
      return [
        ...common,
        "Stage: action_card_candidate.",
        "Propose un support produit consenti sans demarrer de tool.",
        "Ne cree pas de carte et ne donne pas de confirmation executable.",
        "Demande consentement.",
      ].join("\n");
    case "inline_tool_return":
      return [
        ...common,
        "Stage: inline_tool_return.",
        "Reponds sobrement au retour inline deja filtre dans conversation_context, puis preserve le fil demotivation_repair.",
        "Ne change pas de flow et ne lance rien.",
      ].join("\n");
    case "apply_attempt":
      return [
        ...common,
        "Stage: apply_attempt.",
        "Explique que rien n'est applique depuis le chat et ramene au prochain pas local ou au handoff consenti si le contexte l'autorise.",
        "Ne cree, n'active et ne modifie rien.",
      ].join("\n");
    case "potion_bridge_offer":
      return [
        ...common,
        "Stage: potion_bridge_offer.",
        "Propose seulement la potion selectionnee comme suite consentie, sans l'activer.",
        "Noms exacts autorises: Potion de clarté, Potion de courage, Potion anti-décrochage.",
        "Explique en une phrase pourquoi elle correspond au besoin durable, puis demande consentement simple.",
      ].join("\n");
    case "potion_bridge_choice":
      return [
        ...common,
        "Stage: potion_bridge_choice.",
        "Fais choisir entre deux options maximum parmi clarté, courage, anti-décrochage.",
        "Ne lance rien.",
      ].join("\n");
    case "potion_bridge_handoff":
      return [
        ...common,
        "Stage: potion_bridge_handoff.",
        "Message tres court de transition vers select_state_potion.",
        "Nom exact de la potion. Pour selected_potion=rappel, ecris Potion anti-décrochage.",
        "Ne dis pas activee, lancee, creee, programmee ou enregistree.",
        "Ne redemande pas tout le decrochage.",
      ].join("\n");
    case "ask_gentle_clarification":
      return [
        ...common,
        "Stage: ask_gentle_clarification.",
        "Pose une seule question douce centree sur la source du decrochage ou le besoin durable.",
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
        "Ne traite pas le contenu comme un flow motivationnel normal; indique que la priorite est la securite.",
      ].join("\n");
  }
}

export const runDemotivationRepairVisibleAgent: DemotivationRepairVisibleAgent =
  async (input) => {
    const userPrompt = JSON.stringify({
      task: "write_demotivation_repair_visible_message",
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
          source: `demotivation_repair.visible.${input.stage}`,
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
      const message = String(text ?? "").trim();
      return message;
    } catch (error) {
      console.warn("[DemotivationRepair] visible agent failed", {
        stage: input.stage,
        error,
      });
      return null;
    }
  };
