import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  ProductHelpLocalFlowState,
  ProductHelpVisibleTaskKind,
} from "./contract.ts";

export type ProductHelpVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: ProductHelpVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  mode: "standalone" | "inline";
  local_state: ProductHelpLocalFlowState | null;
  visible_facts_json: Record<string, unknown>;
  dispatcher_instruction?: string | null;
};

export type ProductHelpVisibleAgent = (
  input: ProductHelpVisibleAgentInput,
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

function visibleTaskInstruction(stage: ProductHelpVisibleTaskKind): string {
  switch (stage) {
    case "answer_product_question":
      return "Réponds clairement à la question produit, sans lancer de flow ni muter quoi que ce soit.";
    case "clarify_product_question":
      return "Pose une seule question de clarification produit, sans proposer d'opération.";
    case "answer_destination":
      return "Donne le chemin produit exact ou la destination canonique, et la limite si nécessaire.";
    case "compare_features":
      return "Compare simplement les fonctions selon le besoin du user, sans choisir ou lancer un flow.";
    case "explain_limit":
      return "Explique ce qui est possible ou impossible, sans promettre une capacité absente.";
    case "bridge_explanation_only":
      return "Explique le flow ou la destination utile, sans le lancer ni produire de handoff exécutable.";
    case "repeat_answer":
      return "Redis l'information utile en version courte, sans nouvelle recommandation.";
    case "apply_attempt":
      return "Refuse doucement l'exécution depuis product_help et redonne la destination ou le flow à utiliser.";
    case "close_product_help":
      return "Clos product_help sobrement, sans proposer d'outil.";
    case "safety":
      return "Ne continue pas l'explication produit; formule une transition minimale laissant la prise en charge safety reprendre.";
  }
}

function visibleSystemPrompt(input: ProductHelpVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du skill product_help.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne lances aucun flow, tu ne remplis aucun champ d'un autre flow.",
    "product_help est strictement non-mutant: ne dis jamais que tu as créé, modifié, annulé, activé, programmé, enregistré ou appliqué quelque chose.",
    "N'invente aucun objet réel: pour affirmer qu'un objet existe ou a un état, il faut une source dans visible_facts_json.recent_committed_effects, visible_facts_json.grounding.db_sources_used ou active_flow_used.",
    "Ne rends pas un status recap complet.",
    "Si mode=inline, réponds à la question produit puis laisse naturellement le flow parent reprendre.",
    "Ne mentionne jamais JSON, dispatcher, reducer, prompt, DB, table ou outil interne.",
    "Reste court, naturel et concret.",
    visibleTaskInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

function hasCommittedGrounding(input: ProductHelpVisibleAgentInput): boolean {
  const facts = input.visible_facts_json as any;
  return Boolean(
    facts?.grounding?.active_flow_used ||
      (Array.isArray(facts?.grounding?.db_sources_used) &&
        facts.grounding.db_sources_used.length > 0) ||
      (Array.isArray(facts?.recent_committed_effects) &&
        facts.recent_committed_effects.length > 0),
  );
}

function applyNoDoneLanguageGuard(
  message: string,
  input: ProductHelpVisibleAgentInput,
): string {
  if (hasCommittedGrounding(input)) return message;
  return message
    .replace(/j'ai créé/gi, "je peux aider à créer")
    .replace(/j'ai modifié/gi, "je peux aider à modifier")
    .replace(/j'ai annulé/gi, "je peux aider à annuler")
    .replace(/j'ai activé/gi, "je peux aider à activer")
    .replace(/j'ai programmé/gi, "je peux aider à programmer")
    .replace(/j'ai enregistré/gi, "je peux aider à enregistrer")
    .replace(/c'est fait/gi, "ça passe par le flow adapté")
    .replace(/c'est créé/gi, "la création passe par le flow adapté")
    .replace(/c'est programmé/gi, "la programmation passe par confirmation")
    .trim();
}

export async function runProductHelpVisibleAgent(
  input: ProductHelpVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_product_help_visible_message",
    stage: input.stage,
    mode: input.mode,
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    local_state: input.local_state,
    visible_facts_json: input.visible_facts_json,
    dispatcher_instruction: input.dispatcher_instruction ?? null,
    hard_constraints: {
      toolExecution: "none",
      executedTools: [],
      operation_suggestions: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      no_durable_claim_without_grounded_fact: true,
      no_status_recap: true,
      no_parent_flow_mutation: input.mode === "inline",
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
        source: `product_help.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const parsed = parseVisibleMessage(raw);
    return parsed ? applyNoDoneLanguageGuard(parsed, input) : null;
  } catch (error) {
    console.warn("[ProductHelp] visible agent failed", error);
    return null;
  }
}
