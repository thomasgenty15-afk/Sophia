import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  VISIBLE_OUTPUT_STYLE_RULES,
  visibleOutputStyleIssues,
} from "../../router/response_style_policy.ts";
import type {
  StatusRecapConversationContext,
  StatusRecapVisibleTaskKind,
} from "./contract.ts";

export type StatusRecapVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: StatusRecapVisibleTaskKind;
  conversation_context: StatusRecapConversationContext;
};

export type StatusRecapVisibleAgent = (
  input: StatusRecapVisibleAgentInput,
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

type StatusRecapStagePrompt = {
  prompt_id: string;
  instruction: string;
  output_contract: string;
};

export const STATUS_RECAP_STAGE_PROMPTS: Record<
  StatusRecapVisibleTaskKind,
  StatusRecapStagePrompt
> = {
  status_compact: {
    prompt_id: "status_recap.visible.status_compact",
    instruction:
      "Rends un recap court de ce qui existe vraiment, seulement depuis conversation_context.filtered_facts.",
    output_contract:
      "Message bref, factuel, sans question sauf si le contexte le demande explicitement.",
  },
  object_status: {
    prompt_id: "status_recap.visible.object_status",
    instruction:
      "Réponds seulement sur les objets ou catégories ciblés; ne transforme pas en recap global.",
    output_contract:
      "Liste ou phrase compacte centrée sur les objets demandés.",
  },
  coach_preferences_status: {
    prompt_id: "status_recap.visible.coach_preferences_status",
    instruction:
      "Réponds seulement sur les préférences coach explicites; indique sobrement si seuls les defaults système existent.",
    output_contract:
      "Distingue préférence explicite et absence de préférence explicite.",
  },
  cancelled_objects: {
    prompt_id: "status_recap.visible.cancelled_objects",
    instruction:
      "Explique les objets annulés comme créés puis annulés et pas actifs si les faits le montrent.",
    output_contract: "Ne présente jamais un objet annulé comme actif.",
  },
  recent_effects: {
    prompt_id: "status_recap.visible.recent_effects",
    instruction:
      "Résume les effets récents; ne compte jamais requested, failed ou blocked comme objet durable créé.",
    output_contract:
      "Sépare ce qui a été demandé, bloqué, échoué et effectivement durable.",
  },
  fait_prevu_fragile: {
    prompt_id: "status_recap.visible.fait_prevu_fragile",
    instruction:
      "Rends exactement trois lignes labellisées Fait, Prévu, Fragile. Ne pose aucune question.",
    output_contract: "Exactement trois lignes, sans préambule.",
  },
  narrow_scope_question: {
    prompt_id: "status_recap.visible.narrow_scope_question",
    instruction:
      "Pose une seule question courte pour choisir le périmètre du status.",
    output_contract: "Une seule question, pas de recap.",
  },
  repeat_status: {
    prompt_id: "status_recap.visible.repeat_status",
    instruction:
      "Redis le dernier status à partir des faits et du previous_answer_summary disponible.",
    output_contract: "Répétition concise, sans nouveau routage.",
  },
  explain_sources: {
    prompt_id: "status_recap.visible.explain_sources",
    instruction:
      "Explique brièvement que la réponse vient du contexte factuel filtré et de l'historique d'effets pour les événements récents.",
    output_contract:
      "Explique les sources sans nommer tables internes, JSON, dispatcher ou reducer.",
  },
  no_source: {
    prompt_id: "status_recap.visible.no_source",
    instruction:
      "Dis clairement qu'il n'y a pas assez de source factuelle pour affirmer qu'un objet existe.",
    output_contract: "Non-claim bref, sans supposition.",
  },
  human_recap_redirect: {
    prompt_id: "status_recap.visible.human_recap_redirect",
    instruction:
      "Dis brièvement qu'on sort du recap d'état factuel pour traiter le recap humain/conversationnel.",
    output_contract: "Transition courte, pas de status DB inventé.",
  },
  stop_or_cancel: {
    prompt_id: "status_recap.visible.stop_or_cancel",
    instruction:
      "Confirme sobrement l'arrêt du flow status sans nouveau sujet et sans relancer le dispatcher global.",
    output_contract: "Une phrase courte.",
  },
  exit_ack: {
    prompt_id: "status_recap.visible.exit_ack",
    instruction:
      "N'écris pas de réponse visible nominale; cette scène ne devrait être utilisée que pour trace/compat.",
    output_contract:
      "Message vide ou transition minimale si explicitement requis.",
  },
  safety: {
    prompt_id: "status_recap.visible.safety_transition",
    instruction:
      "Ne traite pas le status; formule une transition minimale laissant la prise en charge safety reprendre.",
    output_contract: "Transition minimale, sans détail produit.",
  },
};

function visibleSystemPrompt(input: StatusRecapVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du flow status_recap.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne décides pas les faits, tu ne corriges pas le reducer.",
    "Tu reçois uniquement conversation_context, déjà filtré par le reducer. Tu n'affirmes aucun objet durable absent de conversation_context.filtered_facts.",
    "status_recap est strictement read-only: ne promets jamais création, modification, annulation, activation, confirmation, programmation ou enregistrement.",
    "Ne mentionne jamais JSON, dispatcher, reducer, DB, table, prompt ou outil interne.",
    "Ne donne pas d'aide produit détaillée du type où cliquer ou où changer.",
    "N'écris pas un template fixe sauf pour fait/prévu/fragile qui doit avoir exactement trois lignes.",
    "Si une source manque, préfère une phrase de non-claim plutôt qu'une supposition.",
    VISIBLE_OUTPUT_STYLE_RULES,
    STATUS_RECAP_STAGE_PROMPTS[input.stage].instruction,
    STATUS_RECAP_STAGE_PROMPTS[input.stage].output_contract,
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runStatusRecapVisibleAgent(
  input: StatusRecapVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_status_recap_visible_message",
    stage: input.stage,
    conversation_context: input.conversation_context,
    hard_constraints: {
      toolExecution: "none",
      executedTools: [],
      operation_suggestions: [],
      committed_effects: [],
      no_durable_claim_without_grounded_fact: true,
      no_product_help: true,
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
        source: STATUS_RECAP_STAGE_PROMPTS[input.stage].prompt_id,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    return message && visibleOutputStyleIssues(message).length === 0
      ? message
      : null;
  } catch (error) {
    console.warn("[StatusRecap] visible agent failed", error);
    return null;
  }
}
