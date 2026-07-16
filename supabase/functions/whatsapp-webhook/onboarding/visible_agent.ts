import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import type {
  WhatsAppOnboardingConversationContext,
  WhatsAppOnboardingReducerResult,
} from "./contract.ts";

export type WhatsAppOnboardingVisibleInput = {
  requestId: string;
  userId: string;
  reduced: WhatsAppOnboardingReducerResult;
  conversationContext: WhatsAppOnboardingConversationContext;
};

function stageInstruction(input: WhatsAppOnboardingVisibleInput): string {
  switch (input.reduced.visible_task) {
    case "plan_wait":
      return "Plan wait: explique calmement que Sophia attend encore la finalisation ou synchronisation du plan; propose une seule prochaine action simple; ne parle pas de preferences.";
    case "plan_draft_ready_confirm_on_web":
      return "Plan draft ready: dis clairement que le plan est pret en preview et que le user doit le finaliser et l'activer sur le site Sophia Coach, en precisant que tu le verras automatiquement et que tu lui feras signe ici des que c'est lance. Ne lui demande JAMAIS de confirmer ici que c'est fait: l'activation est detectee seule et tu enchaines aussitot, donc une confirmation manuelle arriverait apres ta relance et polluerait la question suivante. Si le user dit que c'est deja bon mais que plan_status reste draft_pending_confirmation, dis que tu ne le vois pas encore active et redemande l'activation sur le site. Ne dis pas que Sophia synchronise encore.";
    case "plan_ready_resume_preferences":
      return "Plan ready resume preferences: accuse reception que le plan est pret, puis pose une seule question de ton: est-ce que le user prefere une Sophia douce, directe, ou un mix.";
    case "ask_tone":
      return "Ask tone: pose uniquement la question de preference de ton, avec options douces/directes/mix en formulation naturelle; ne traite aucune autre preference.";
    case "preference_saved_next_challenge":
      return "Preference saved next challenge: dis brievement que la preference de ton est notee pour la suite, puis demande comment challenger quand le user decroche: leger, equilibre, ou plus direct.";
    case "preference_saved_next_questions":
      return "Preference saved next questions: dis brievement que la preference de challenge est notee, puis demande si Sophia doit poser peu de questions, creuser un peu, ou questionner franchement quand ca aide.";
    case "preference_skipped":
      return "Preference skipped: dis qu'on garde le reglage par defaut pour l'instant et avance vers la prochaine question sans culpabiliser.";
    case "ask_plan_feedback":
      return "Ask plan feedback: demande en une seule question comment la creation du plan s'est passee et si le resultat convient.";
    case "ask_topic_choice":
      return "Ask topic choice: demande si le user veut commencer par son plan ou par autre chose plus important maintenant.";
    case "complete_to_plan":
      return "Complete to plan: cloture l'onboarding et commence par le plan avec un resume user-facing propre, sans metadata interne; termine par une seule question utile pour demarrer.";
    case "blocked_exit_before_plan_ready":
      return "Blocked exit before plan ready: reduis la pression, reconnais le ras-le-bol ou l'incertitude, mais explique que le plan reste le seul point incompressible; propose une action simple liee au plan.";
    case "stop_after_plan_ready":
      return "Sortie apres plan pret: accuse reception tres court si un message local est requis; ne pose aucune question; ne traite pas le nouveau sujet dans ce prompt visible.";
    case "progress_attempt_blocked":
      return "Progress attempt blocked: explique sobrement que ce tour reste dans l'onboarding WhatsApp et qu'aucune progression de plan n'a ete loggee; ramene a la question courante en une seule phrase.";
    case "repeat_question":
      return "Repeat question: reformule plus simplement la question onboarding courante, sans catalogue et sans pression.";
    case "technical_blocked":
      return "Technical blocked: indique sobrement qu'un blocage technique empeche d'avancer et propose une prochaine action sure; ne fabrique pas de succes.";
    case "complete_to_global":
      return "Exit: reconnais brievement la demande et laisse le sujet demande reprendre; ne repose pas de question onboarding.";
    case "safety":
      return "Safety: ne produis pas de coaching onboarding; laisse la pipeline safety reprendre.";
  }
  const exhaustive: never = input.reduced.visible_task;
  return `Technical blocked: unexpected visible task ${exhaustive}.`;
}

export async function runWhatsAppOnboardingVisibleAgent(
  input: WhatsAppOnboardingVisibleInput,
): Promise<string> {
  const systemPrompt = [
    `Tu es l'agent visible du flow whatsapp_onboarding.`,
    "Tu ecris uniquement le prochain message visible de Sophia.",
    "Tu ne prends aucune decision metier.",
    "Tu ne remplis aucun champ.",
    "Tu n'appelles aucun outil.",
    "Tu ne logges aucune progression de plan.",
    "Tu ne dis jamais qu'une action du plan est faite.",
    "Tu ne dis jamais que la preference doit etre appliquee dans la plateforme si le contexte dit qu'elle a ete notee.",
    "Tu n'exposes jamais de metadata interne du plan comme status, kind, dimension, id ou task.",
    "Message WhatsApp court, naturel, sans formulaire.",
    stageInstruction(input),
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "write_whatsapp_onboarding_visible_message",
    visible_task: {
      kind: input.reduced.visible_task,
      conversation_context: input.conversationContext,
    },
    constraints: {
      no_plan_progress_log: true,
      no_platform_handoff_for_saved_preference: true,
      no_internal_plan_metadata: true,
      no_deterministic_template: true,
    },
  });
  const response = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.25,
    false,
    [],
    "auto",
    {
      requestId: input.requestId,
      userId: input.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: `whatsapp_onboarding.visible.${input.reduced.visible_task}`,
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return String(response ?? "").trim();
}
