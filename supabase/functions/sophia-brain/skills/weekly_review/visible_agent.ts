import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import type {
  WeeklyReviewConversationContext,
  WeeklyReviewVisibleTaskKind,
} from "./local_flow.ts";

export type WeeklyReviewVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: WeeklyReviewVisibleTaskKind;
  user_message?: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  conversation_context: WeeklyReviewConversationContext;
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
    case "ask_week_experience":
      return "Ouvre ou reprend le weekly depuis le contexte DB/daily. Demande comment le user a vecu la semaine. Une question max, pas de solution.";
    case "review_action_gaps":
      return [
        "Verifie d'abord les actions et gaps a partir de conversation_context.item_summaries et conversation_context.known_action_gaps.",
        "Tant que action_review_complete est false, ne demande pas le ressenti d'avancee vers l'objectif global.",
        "Si plusieurs actions existent et que leur statut user n'est pas stabilise, demande un bilan action par action: fait / partiel / pas fait / pourquoi.",
        "Ne zoome pas sur une seule action tant que le bilan global des actions n'est pas stabilise, sauf si toutes les autres actions sont deja claires dans conversation_context.",
        "Confirme ce qui est clair, puis demande une seule precision utile sur l'action ou le gap manquant.",
      ].join(" ");
    case "explore_action_blocker":
      return "Explore le blocage sur l'action precise. Distingue demarrage, moment critique, contexte, charge, sens ou mauvais calibrage. Une question max.";
    case "qualify_attack_or_defense_fit":
      return "Qualifie si une carte d'attaque ou de defense correspond au blocage. Ne lance rien; demande le consentement ou la precision manquante.";
    case "ask_global_progress_feeling":
      return "Demande le ressenti d'avancee vers l'objectif global, en reliant sobrement aux actions de la semaine. Une question max.";
    case "deepen_global_progress":
      return "Approfondis un ressenti d'avancee negatif, ambigu ou contradictoire. Reste empathique et cherche le levier, pas une solution immediate.";
    case "qualify_solution_fit":
      return "Compare sobrement les pistes possibles depuis le contexte: Plan, carte, potion ou rappel. Ne propose un detour que si le contexte le demande; sinon clarifie.";
    case "offer_child_detour":
      return "Propose le detour outil indique dans detour_candidate avec consentement explicite. Explique qu'il sert le weekly et que le weekly reprendra apres.";
    case "return_from_child_flow":
      return "Reprends le weekly apres le detour. Integre le resultat disponible et toute revision_summary presente dans handoff_data ou child_flow_result_details. Si le child flow a seulement prepare une saisie plateforme, dis que la revision sera a reprendre dans la plateforme, puis oriente vers la synthese sans rouvrir un nouveau flow.";
    case "weekly_synthesis":
      return [
        "Fais la synthese weekly dans cet ordre: semaine vecue; actions/gaps; ressenti d'avancee vers l'objectif global; detour ou elements prepares; question de confirmation/cloture si necessaire.",
        "Respecte strictement les statuts action par action: une action partielle reste partielle, une action relachee ne devient jamais une reussite pleine.",
        "Si une revision_summary existe pour un child flow, integre-la explicitement comme element a reprendre par le user lors de la saisie plateforme.",
        "Valorise l'effort sans embellir les faits. Ne ferme pas encore si une confirmation manque.",
      ].join(" ");
    case "weekly_closure":
      return "Cloture clairement le weekly. Dis que le point weekly est termine, ne pose pas de nouvelle question et ne pretend pas avoir modifie le Plan.";
    case "answer_weekly_question":
      return "Reconnais la reponse du user, puis avance vers la lecture weekly ou la prochaine question utile. Une question max.";
    case "clarify_human_signal":
      return "Pose une seule question de clarification sur le signal humain manquant. Ne demande pas deux dimensions separees.";
    case "weekly_recap":
      return "Redis le bilan weekly de maniere courte. Ne rajoute pas une nouvelle decision.";
    case "explain_reasoning":
      return "Explique sobrement le raisonnement a partir des preuves daily et du ressenti humain, sans rapport technique.";
    case "forgotten_progress_clarify":
      return "Demande une seule clarification pour identifier la progression oubliee. Ne dis pas que c'est corrige.";
    case "forgotten_progress_ack":
      return "Confirme seulement la correction de progression committee. Ne dis pas que le plan weekly a ete modifie.";
    case "forgotten_progress_blocked":
      return "Explique sobrement que la correction de progression n'a pas pu etre notee et demande la cible ou le niveau manquant.";
    case "stop_close":
    case "stop_or_cancel":
      return "Ferme ou met de cote le weekly sans culpabiliser et sans proposer d'outil.";
    case "inline_tool_return":
      return "Rends la reponse inline en une phrase ou deux, puis indique sobrement que le point weekly reste le fil parent si utile.";
    case "exit_or_cancel":
      return "Confirme sobrement la sortie locale si un message visible est necessaire. Ne traite pas la nouvelle demande.";
    case "safety_transition":
    case "safety":
      return "Ne continue pas le weekly. Formule une transition minimale laissant la prise en charge safety reprendre.";
  }
}

function visibleStageIdentity(stage: WeeklyReviewVisibleTaskKind): string {
  return `Tu es le prompt visible stage-specific weekly_adaptive_review_v1.${stage}.`;
}

function visibleSystemPrompt(input: WeeklyReviewVisibleAgentInput): string {
  return [
    visibleStageIdentity(input.stage),
    "Tu ecris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne decides pas les faits, tu ne corriges pas le reducer.",
    "Tu utilises uniquement conversation_context. Tu ne supposes pas de donnees DB ou memoire absentes de ce contexte.",
    "Le weekly est un point de fin de semaine: il peut recommander une direction, mais ne modifie jamais le plan depuis le chat.",
    "Frontiere chat/outils: Sophia ne peut pas avoir, creer, activer, rendre disponible ou finaliser une carte d'attaque, une carte de defense, un ajustement Plan, un rappel ou une potion depuis le chat weekly.",
    "Formulations interdites sans committed_effect explicite dans conversation_context: j'ai une carte, ta carte est disponible, la carte est prete, nouvel outil, j'ai modifie le plan, j'ai cree un rappel, j'ai cree une potion.",
    "Si un child flow revient avec platform_handoff sans committed_effect, dis seulement que les elements ont ete prepares pour que le user les saisisse dans la plateforme; ne dis jamais que l'objet existe deja.",
    "Ne mentionne jamais JSON, dispatcher, reducer, table, prompt, labels internes ou outil interne.",
    "N'utilise pas les labels internes: bridge_week, carry_over, repeat_week, level_review, item_decision, dominant_blocker.",
    "Ne dis jamais que tu as applique, modifie, reporte, valide, enregistre ou cree un changement de plan.",
    "Ne dis jamais que tu as cree, disponible ou pret une carte, une potion ou un rappel depuis le chat weekly.",
    "Ne cree aucun pending confirmation executable.",
    "Ne propose carte, potion, rappel ou Plan que si conversation_context.detour_candidate le demande explicitement. Sinon, qualifie ou clarifie.",
    "Si tu proposes un detour, dis qu'il sert le weekly et que le weekly reprendra ensuite.",
    "Respecte conversation_context.tone_constraints. Si le genre n'est pas explicitement confirme dans conversation_context, utilise des formulations neutres et evite les adjectifs accordes comme fatigue, encourage, rigoureux.",
    "Pour review_action_gaps: ne pose pas la question d'avancee vers l'objectif global tant que conversation_context.known_values.action_review_before_global_progress_required vaut true.",
    "Pour weekly_synthesis: ne transforme jamais un statut partiel, relache ou manque en succes complet.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Une question maximum quand tu poses une question.",
    "Reste compact.",
    visibleTaskInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runWeeklyReviewVisibleAgent(
  input: WeeklyReviewVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = buildWeeklyReviewVisibleAgentUserPrompt(input);
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
    const message = parseVisibleMessage(raw);
    return message;
  } catch (error) {
    console.warn("[WeeklyReview] visible agent failed", error);
    return null;
  }
}

export function buildWeeklyReviewVisibleAgentUserPrompt(
  input: WeeklyReviewVisibleAgentInput,
): string {
  return JSON.stringify({
    task: "write_weekly_adaptive_review_visible_message",
    stage: input.stage,
    conversation_context: input.conversation_context,
    hard_constraints: {
      no_chat_plan_mutation: true,
      executedTools: [],
      committed_plan_effects: [],
      platform_destination:
        input.conversation_context.handoff_data.platform_destination ?? null,
      no_internal_labels: true,
      one_question_max: true,
      do_not_say: input.conversation_context.do_not_say,
      no_chat_tool_claims: true,
      committed_effects: [],
    },
    required_json_shape: { message: "string" },
  });
}
