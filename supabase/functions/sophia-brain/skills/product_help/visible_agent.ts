import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
// W9/R3 — la langue de la reponse VISIBLE est resolue par le point unique
// `resolveResponseLocale`, et le bloc RESPONSE_LANGUAGE part en DERNIERE
// instruction du prompt (la position est le mecanisme: la recence gagne).
import {
  appendResponseLanguageBlock,
  resolveResponseLocale,
} from "../../../_shared/keel/locale.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
} from "../../router/one_shot_reminder_prompt_contract.ts";
import {
  VISIBLE_CONVERSATION_FLOW_RULES,
  VISIBLE_OUTPUT_STYLE_RULES,
} from "../../router/response_style_policy.ts";
import { userIdentityVisiblePromptLines } from "../../context/user_identity.ts";
import type {
  ProductHelpConversationContext,
  ProductHelpVisibleTaskKind,
} from "./contract.ts";

export type ProductHelpVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: ProductHelpVisibleTaskKind;
  conversation_context: ProductHelpConversationContext;
  visible_runtime_context?: {
    style_rules: string;
    recent_messages: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    recent_effects_summary?: string | null;
    user_identity?: {
      first_name: string | null;
      age: number | null;
      gender: "male" | "female" | "other" | null;
    } | null;
  };
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
    case "stop_or_cancel":
      return "Accuse réception très brièvement. Ne pose pas de question et ne propose pas d'outil.";
    case "exit_ack":
      return "Si un message visible est nécessaire, fais une transition minimale. Ne réponds pas pour le dispatcher cible.";
    case "close_product_help":
      return "Clos product_help sobrement, sans proposer d'outil.";
    case "safety":
    case "safety_transition":
      return "Ne continue pas l'explication produit; formule une transition minimale laissant la prise en charge safety reprendre.";
  }
}

function visibleSystemPrompt(input: ProductHelpVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du skill product_help.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne lances aucun flow, tu ne remplis aucun champ d'un autre flow.",
    "product_help est strictement non-mutant: ne dis jamais que tu as créé, modifié, annulé, activé, programmé, enregistré ou appliqué quelque chose, sauf confirmation sobre d'un rappel deja prouve par conversation_context.known_values.direct_effect_confirmation_context.one_shot_reminder.committed=true ou par visible_runtime_context.recent_effects_summary avec une ligne 'Rappel ponctuel cree: execute et persiste' et etat DB actuel.",
    "Tu écris seulement à partir de conversation_context et, pour les questions sur ce qui vient d'être fait/programmé/noté/validé, de visible_runtime_context.recent_effects_summary. Tu ne lis pas de DB brute, de mémoire brute, ni d'autre contexte hors de ces champs.",
    "Si visible_runtime_context.recent_effects_summary contient un effet récent, utilise-le seulement pour répondre à ce type de question ou pour éviter une contradiction. Ne le mentionne pas spontanément et ne nomme jamais EffectLedger.",
    "Si visible_runtime_context.session_decisions est présent et que la question porte sur ce qui a été décidé/recommandé/retenu dans CETTE conversation ('c'était quoi déjà la potion conseillée ?'), réponds directement depuis ce bloc avec les noms exacts — ne dis JAMAIS que tu ne peux pas retrouver la décision, et ne renvoie pas le user chercher lui-même une information présente dans ce bloc.",
    "N'invente aucun objet réel: pour affirmer qu'un objet existe ou a un état, il faut une source dans conversation_context.known_values.grounded_sources, conversation_context.known_values.grounding.db_sources_used ou active_flow_used.",
    "Ne rends pas un inventaire d'etat reel complet.",
    "Si conversation_context indique un mode inline, réponds à la question produit puis laisse naturellement le flow parent reprendre.",
    ...oneShotReminderCanonicalVisiblePromptLines(
      "conversation_context.known_values.direct_effect_confirmation_context",
      {
        present: oneShotReminderVisibleContextPresent(
          input.conversation_context?.known_values
            ?.direct_effect_confirmation_context,
        ),
        committedThisTurn: directEffectContextCommittedThisTurn(
          input.conversation_context?.known_values
            ?.direct_effect_confirmation_context,
        ),
        committedKnown: committedOneShotReminderKnown({
          directEffectConfirmationContext:
            input.conversation_context?.known_values
              ?.direct_effect_confirmation_context,
          recentEffectsSummary:
            input.visible_runtime_context?.recent_effects_summary,
        }),
      },
    ),
    "Ne mentionne jamais JSON, dispatcher, reducer, prompt, DB, table ou outil interne.",
    ...userIdentityVisiblePromptLines(),
    VISIBLE_OUTPUT_STYLE_RULES,
    VISIBLE_CONVERSATION_FLOW_RULES,
    "Reste court, naturel et concret.",
    visibleTaskInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runProductHelpVisibleAgent(
  input: ProductHelpVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_product_help_visible_message",
    stage: input.stage,
    visible_runtime_context: input.visible_runtime_context ?? {
      style_rules: VISIBLE_OUTPUT_STYLE_RULES,
      recent_messages: [],
    },
    conversation_context: input.conversation_context,
    hard_constraints: {
      toolExecution: "none",
      executedTools: [],
      operation_suggestions: [],
      requested_effects: [],
      allowed_effects: [],
      one_shot_reminder: input.conversation_context.known_values
          .direct_effect_confirmation_context &&
          typeof input.conversation_context.known_values
              .direct_effect_confirmation_context === "object"
        ? (input.conversation_context.known_values
          .direct_effect_confirmation_context as any).one_shot_reminder ?? null
        : null,
      no_durable_claim_without_grounded_fact: true,
      no_live_status_inventory: true,
      no_parent_flow_mutation:
        input.conversation_context.known_values.mode === "inline" ||
        input.conversation_context.handoff_data.mode === "inline",
    },
    required_json_shape: { message: "string" },
  });
  try {
    const raw = await generateWithGemini(
      appendResponseLanguageBlock(
        visibleSystemPrompt(input),
        resolveResponseLocale({}),
      ),
      userPrompt,
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
        source: `product_help.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const parsed = parseVisibleMessage(raw);
    return parsed;
  } catch (error) {
    console.warn("[ProductHelp] visible agent failed", error);
    return null;
  }
}
