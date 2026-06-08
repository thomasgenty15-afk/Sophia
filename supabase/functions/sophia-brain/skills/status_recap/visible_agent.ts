import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  StatusRecapLocalFlowState,
  StatusRecapVisibleTaskKind,
} from "./contract.ts";

export type StatusRecapVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: StatusRecapVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  local_state: StatusRecapLocalFlowState | null;
  grounded_facts_json: Record<string, unknown>;
  dispatcher_instruction?: string | null;
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

function visibleTaskInstruction(stage: StatusRecapVisibleTaskKind): string {
  switch (stage) {
    case "status_compact":
      return "Rends un recap court de ce qui existe vraiment, seulement depuis grounded_facts_json.";
    case "object_status":
      return "Réponds seulement sur les objets ou catégories ciblés; ne transforme pas en recap global.";
    case "coach_preferences_status":
      return "Réponds seulement sur les préférences coach explicites; indique sobrement si seuls les defaults système existent.";
    case "cancelled_objects":
      return "Explique les objets annulés comme créés puis annulés et pas actifs si les faits le montrent.";
    case "recent_effects":
      return "Résume les effets récents; ne compte jamais requested, failed ou blocked comme objet durable créé.";
    case "fait_prevu_fragile":
      return "Rends exactement trois lignes labellisées Fait, Prévu, Fragile. Ne pose aucune question.";
    case "narrow_scope_question":
      return "Pose une seule question courte pour choisir le périmètre du status.";
    case "repeat_status":
      return "Redis le dernier status à partir des faits et du previous_answer_summary disponible.";
    case "explain_sources":
      return "Explique brièvement que la réponse vient des tables métier/projection DB et de l'historique d'effets pour les événements récents.";
    case "no_source":
      return "Dis clairement qu'il n'y a pas assez de source DB pour affirmer qu'un objet existe.";
    case "human_recap_redirect":
      return "Dis brièvement qu'on sort du recap d'état factuel pour traiter le recap humain/conversationnel.";
    case "exit_or_cancel":
      return "Confirme sobrement la sortie ou l'annulation du flow status, sans nouveau recap.";
    case "safety":
      return "Ne traite pas le status; formule une transition minimale laissant la prise en charge safety reprendre.";
  }
}

function visibleSystemPrompt(input: StatusRecapVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du flow status_recap.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne décides pas les faits, tu ne corriges pas le reducer.",
    "Tu reçois grounded_facts_json produit depuis la projection DB. Tu n'affirmes aucun objet durable absent de ces faits.",
    "status_recap est strictement read-only: ne promets jamais création, modification, annulation, activation, confirmation, programmation ou enregistrement.",
    "Ne mentionne jamais JSON, dispatcher, reducer, DB, table, prompt ou outil interne.",
    "Ne donne pas d'aide produit détaillée du type où cliquer ou où changer.",
    "N'écris pas un template fixe sauf pour fait/prévu/fragile qui doit avoir exactement trois lignes.",
    "Si une source manque, préfère une phrase de non-claim plutôt qu'une supposition.",
    visibleTaskInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runStatusRecapVisibleAgent(
  input: StatusRecapVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_status_recap_visible_message",
    stage: input.stage,
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    local_state: input.local_state,
    grounded_facts_json: input.grounded_facts_json,
    dispatcher_instruction: input.dispatcher_instruction ?? null,
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
        source: `status_recap.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return parseVisibleMessage(raw);
  } catch (error) {
    console.warn("[StatusRecap] visible agent failed", error);
    return null;
  }
}
