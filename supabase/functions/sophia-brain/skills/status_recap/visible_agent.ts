import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
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
      "Rends un recap court, naturel et factuel de ce qui existe vraiment, seulement depuis conversation_context.filtered_facts. Pour un scope global, couvre chaque categorie non vide dans coverage_requirements sans imposer une structure de catégories.",
    output_contract:
      "Message bref, factuel, fluide, sans question sauf si le contexte le demande explicitement. Ne laisse pas une categorie non vide hors réponse, mais choisis librement la forme la plus claire.",
  },
  object_status: {
    prompt_id: "status_recap.visible.object_status",
    instruction:
      "Réponds seulement sur les objets ou catégories ciblés, dans une forme naturelle; si la cible est globale/unknown ou requested_categories contient all, couvre chaque categorie non vide dans coverage_requirements.",
    output_contract:
      "Phrase ou liste compacte centrée sur les objets demandés. Ne limite pas aux rappels si des préférences coach ou autres catégories filtrées sont explicitement demandées ou incluses par all.",
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
      "Résume les effets récents demandés; ne compte jamais requested, failed ou blocked comme objet durable créé. Si le user demande ce qui a été créé/enregistré, réponds sur les effets réellement committed/delivered et n'ajoute pas les préférences coach existantes sauf si elles font partie des effets récents fournis.",
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

export function statusRecapCoverageRequirements(
  context: StatusRecapConversationContext,
): string[] {
  const facts = context.filtered_facts;
  const hasSpecificTargets = context.target_objects.some((target) =>
    target !== "unknown"
  );
  const globalScope = (context.requested_categories.includes("all") ||
    context.target_objects.includes("unknown")) && !hasSpecificTargets;
  const categoryRequested = (
    category: string,
    target: string,
  ) =>
    globalScope ||
    context.requested_categories.includes(category as any) ||
    context.target_objects.includes(target as any);
  const requirements: string[] = [];
  if (
    facts.attack_cards.length > 0 &&
    categoryRequested("attack_cards", "attack_card")
  ) {
    requirements.push("mentionner les cartes d'attaque actives présentes");
  }
  if (
    facts.defense_cards.length > 0 &&
    categoryRequested("defense_cards", "defense_card")
  ) {
    requirements.push("mentionner les cartes de défense actives présentes");
  }
  if (
    facts.one_shot_reminders.pending.length > 0 &&
    categoryRequested("one_shot_reminders", "one_shot_reminder")
  ) {
    requirements.push("mentionner les rappels ponctuels actifs/en attente");
  }
  if (
    facts.one_shot_reminders.cancelled_recent.length > 0 &&
    categoryRequested("one_shot_reminders", "one_shot_reminder")
  ) {
    requirements.push(
      "mentionner les rappels ponctuels annulés si le scope inclut les annulés ou est global",
    );
  }
  if (
    facts.recurring_reminders.length > 0 &&
    categoryRequested("recurring_reminders", "recurring_reminder")
  ) {
    requirements.push("mentionner les rappels récurrents actifs présents");
  }
  if (
    facts.potion_sessions.length > 0 && categoryRequested("potions", "potion")
  ) {
    requirements.push("mentionner les sessions/potions présentes");
  }
  if (
    facts.coach_preferences.length > 0 &&
    categoryRequested("coach_preferences", "coach_preference")
  ) {
    requirements.push("mentionner les préférences coach explicites présentes");
  }
  if (
    facts.recent_effect_history.length > 0 &&
    categoryRequested("recent_effects", "unknown")
  ) {
    requirements.push(
      "mentionner les effets récents présents sans les compter comme objets durables",
    );
  }
  return requirements;
}

export function statusRecapRestitutionGuidance(
  stage: StatusRecapVisibleTaskKind,
): string[] {
  const guidance = [
    "La restitution doit être conversationnelle: claire, courte, mais pas mécanique.",
    "Hors stage fait_prevu_fragile, n'utilise pas les labels imposés Fait, Prévu, Fragile; le user n'a pas forcément demandé cette grille.",
    "Ne transforme pas les coverage_requirements en titres visibles; ils servent seulement à vérifier que les faits importants ne sont pas oubliés.",
    "Restitue les libellés complets présents dans filtered_facts quand le user demande ce qui existe ou ce qui a été créé; ne tronque pas un rappel, une carte ou une préférence en perdant une partie utile du libellé.",
    "Ne restitue que les catégories demandées ou imposées par coverage_requirements. N'ajoute pas une catégorie voisine simplement parce qu'elle est présente dans filtered_facts.",
    "Quand la demande porte sur ce qui a été créé/enregistré/modifié pendant l'échange, ne transforme pas des préférences ou objets déjà existants en créations du tour. Mentionne une préférence seulement si elle est demandée explicitement ou si filtered_facts.recent_effect_history montre une modification liée.",
    "Tu peux grouper naturellement les faits proches dans une phrase ou une liste courte.",
    "Exemples de formes possibles selon le contexte: 'Je vois surtout...', 'Dans ton espace, il y a...', 'Côté rappels, je vois...', 'Sur les préférences coach, je vois...'. Ce sont des exemples de ton, pas des templates à recopier.",
    "Si un objet est annulé, dis simplement qu'il est annulé; ne l'appelle pas fragile sauf si le contexte parle vraiment d'incertitude, blocage ou instabilité.",
    "Si une catégorie est vide, mentionne-la seulement si cela aide à répondre à la demande du user.",
  ];
  if (stage === "fait_prevu_fragile") {
    return [
      "Le stage fait_prevu_fragile est l'exception: utilise exactement les trois lignes Fait, Prévu, Fragile, sans autre structure.",
    ];
  }
  return guidance;
}

function visibleSystemPrompt(input: StatusRecapVisibleAgentInput): string {
  return [
    "Tu es l'agent visible du flow status_recap.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne routes pas, tu ne décides pas les faits, tu ne corriges pas le reducer.",
    "Tu reçois uniquement conversation_context, déjà filtré par le reducer. Tu n'affirmes aucun objet durable absent de conversation_context.filtered_facts.",
    "status_recap est strictement read-only: ne promets jamais création, modification, annulation, activation, confirmation, programmation ou enregistrement.",
    "Ne mentionne jamais JSON, dispatcher, reducer, DB, table, prompt ou outil interne.",
    "Ne donne pas d'aide produit détaillée du type où cliquer ou où changer.",
    "N'écris jamais un template fixe. Le format fait/prévu/fragile n'est autorisé que pour le stage fait_prevu_fragile.",
    "Ne nomme pas une catégorie en introduction si tu ne rends pas au moins un fait ou un non-claim clair sur cette catégorie dans le message.",
    "Si coverage_requirements contient des éléments, chaque élément doit être couvert par un fait ou un non-claim clair, sans inventer hors filtered_facts.",
    "Si une source manque, préfère une phrase de non-claim plutôt qu'une supposition.",
    ...statusRecapRestitutionGuidance(input.stage),
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
    coverage_requirements: statusRecapCoverageRequirements(
      input.conversation_context,
    ),
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
    return message;
  } catch (error) {
    console.warn("[StatusRecap] visible agent failed", error);
    return null;
  }
}
