import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../../router/response_style_policy.ts";
import {
  DEFENSE_CARD_PLATFORM_DESTINATION,
  DEFENSE_CARD_SUPPORT_NEED_LABEL,
  type PrepareDefenseCardConversationContext,
  type PrepareDefenseCardVisibleTaskKind,
} from "./local_flow.ts";

export type PrepareDefenseCardVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: PrepareDefenseCardVisibleTaskKind;
  conversation_context: PrepareDefenseCardConversationContext;
  validation_errors_to_fix?: string[];
  trace_event?: (event: Record<string, unknown>) => void;
};

export type PrepareDefenseCardVisibleAgent = (
  input: PrepareDefenseCardVisibleAgentInput,
) => Promise<string | null>;

const FORBIDDEN_CREATION_CLAIMS = [
  "c'est créé",
  "c'est cree",
  "je l'ai créée",
  "je l'ai creee",
  "je l'ai créé",
  "je l'ai cree",
  "je l'ai ajoutée",
  "je l'ai ajoutee",
  "c'est ajouté",
  "c'est ajoute",
  "c'est activé",
  "c'est active",
  "j'ai préparé la carte dans la plateforme",
  "j'ai prepare la carte dans la plateforme",
  "dis oui et je la crée",
  "dis oui et je la cree",
];

const INTERNAL_PLATFORM_FIELD_LABELS = [
  "entry_need",
  "risk_moment",
  "first_signal",
  "defense_response",
  "fallback_plan",
];

const FORBIDDEN_REVISION_PERSISTENCE_CLAIMS = [
  "j'ai bien pris en compte",
  "j'ai pris en compte",
  "c'est pris en compte",
  "c'est noté",
  "c'est note",
  "je note",
  "je garde",
  "je mémorise",
  "je memorise",
  "j'ai mémorisé",
  "j'ai memorise",
  "j'ai enregistré",
  "j'ai enregistre",
  "c'est enregistré",
  "c'est enregistre",
];

const NO_RESTITUTION_STAGES: PrepareDefenseCardVisibleTaskKind[] = [
  "ask_attachment",
  "confirm_attachment_candidate",
  "ask_risk_situation",
  "ask_trigger_or_signal",
  "ask_defense_goal_or_response",
];

const FORBIDDEN_EARLY_RESTITUTION_MARKERS = [
  DEFENSE_CARD_SUPPORT_NEED_LABEL,
  DEFENSE_CARD_PLATFORM_DESTINATION,
  "Cartes de défense",
  "carte de défense libre",
  "Ajouter une carte",
  "recopier",
  "à recopier",
  "a recopier",
  "tu peux utiliser cette formulation",
  "dans le champ",
  "pour ton champ",
];

function cleanMessage(value: unknown): string {
  let text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  while (text.includes("\n\n\n")) text = text.replaceAll("\n\n\n", "\n\n");
  return text;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return null;
  }
}

function normalizeForGuard(value: string): string {
  return value
    .replaceAll("’", "'")
    .replaceAll("É", "E")
    .replaceAll("é", "e")
    .replaceAll("È", "E")
    .replaceAll("è", "e")
    .replaceAll("Ê", "E")
    .replaceAll("ê", "e")
    .replaceAll("À", "A")
    .replaceAll("à", "a")
    .replaceAll("Ç", "C")
    .replaceAll("ç", "c")
    .toLowerCase();
}

function containsLiteral(haystack: string, needle: string): boolean {
  return haystack.indexOf(needle) >= 0;
}

function supportNeedValue(input: PrepareDefenseCardVisibleAgentInput) {
  return input.conversation_context.handoff_data.support_need_value ??
    input.conversation_context.known_values.support_need.locked_value ??
    input.conversation_context.known_values.support_need.candidate_value ??
    null;
}

function concreteDefenseValues(input: PrepareDefenseCardVisibleAgentInput) {
  const data = input.conversation_context.handoff_data;
  return [
    data.risk_context,
    data.defense_action,
    data.ritual_phrase,
  ].filter((value): value is string => Boolean(value));
}

function requiresPlatformData(stage: PrepareDefenseCardVisibleTaskKind) {
  return [
    "handoff_ready",
    "revision_done",
    "destination_short",
    "apply_attempt",
    "repeat_handoff",
  ].includes(stage);
}

function isRevisionContext(
  input: PrepareDefenseCardVisibleAgentInput,
): boolean {
  return Boolean(
    input.conversation_context.previous_values.support_need ||
      input.conversation_context.revision?.is_revision,
  );
}

export function prepareDefenseCardVisibleContractIssues(
  message: string,
  input: PrepareDefenseCardVisibleAgentInput,
): string[] {
  const issues: string[] = [];
  const normalized = normalizeForGuard(message);
  if (!message.trim()) issues.push("empty_message");
  for (const claim of FORBIDDEN_CREATION_CLAIMS) {
    if (normalized.includes(normalizeForGuard(claim))) {
      issues.push(`forbidden_creation_claim:${claim}`);
    }
  }
  for (const label of INTERNAL_PLATFORM_FIELD_LABELS) {
    if (normalized.includes(normalizeForGuard(label))) {
      issues.push(`internal_field_exposed:${label}`);
    }
  }
  if (isRevisionContext(input)) {
    for (const claim of FORBIDDEN_REVISION_PERSISTENCE_CLAIMS) {
      if (normalized.includes(normalizeForGuard(claim))) {
        issues.push(`forbidden_revision_persistence_claim:${claim}`);
      }
    }
  }
  if (NO_RESTITUTION_STAGES.includes(input.stage)) {
    for (const marker of FORBIDDEN_EARLY_RESTITUTION_MARKERS) {
      if (normalized.includes(normalizeForGuard(marker))) {
        issues.push(`forbidden_early_restitution:${marker}`);
      }
    }
    const value = supportNeedValue(input);
    if (value && containsLiteral(message, value)) {
      issues.push("forbidden_early_support_need_value");
    }
  }
  if (requiresPlatformData(input.stage)) {
    if (!normalized.includes(normalizeForGuard("Cartes de défense"))) {
      issues.push("missing_platform_destination");
    }
    const value = supportNeedValue(input);
    if (input.stage !== "apply_attempt" || value) {
      if (!containsLiteral(message, DEFENSE_CARD_SUPPORT_NEED_LABEL)) {
        issues.push("missing_support_need_label");
      }
      if (value && !containsLiteral(message, value)) {
        issues.push("missing_support_need_value");
      }
      for (const concreteValue of concreteDefenseValues(input)) {
        if (!containsLiteral(message, concreteValue)) {
          issues.push("missing_concrete_defense_value");
        }
      }
    }
  }
  return issues;
}

const VISIBLE_STAGE_PROMPTS: Record<PrepareDefenseCardVisibleTaskKind, string> =
  {
    clarify_attack_vs_defense:
      "Clarification: pose une seule question naturelle pour distinguer carte de défense (protéger un moment où ça risque de déraper) et carte d'attaque (aider à démarrer ou franchir une résistance).",
    redirect_attack_better:
      "Redirection: explique brièvement que le besoin ressemble plutôt à une carte d'attaque, sans remplir de champ attaque.",
    ask_attachment:
      "Attache: demande en une seule question ce que la carte de défense doit protéger.",
    confirm_attachment_candidate:
      "Attache candidate: demande si c'est bien cette action, habitude, situation ou contexte à protéger, en laissant une correction facile.",
    ask_risk_situation:
      "Risque: pose une seule question sur le moment concret où ça risque de déraper.",
    ask_trigger_or_signal:
      "Signal: pose une question courte sur ce qui annonce ou déclenche le dérapage.",
    ask_defense_goal_or_response:
      "But de défense: pose une seule question sur ce que la défense doit aider à empêcher, préserver ou interrompre.",
    ask_support_need:
      "Support need: pose une question naturelle pour obtenir une phrase utilisable dans le champ support_need, sans recopier le label comme un formulaire si une question naturelle suffit.",
    confirm_support_need_proposal:
      "Proposition support_need: demande si la formulation proposée correspond, sans dire champ ou slot et sans finaliser la carte.",
    handoff_ready:
      "Handoff prêt: donne naturellement la destination Cartes de défense, le label exact support_need et la valeur exacte à recopier. Si handoff_data contient risk_context, defense_action ou ritual_phrase, restitue aussi ces éléments concrets comme éléments préparés pour la saisie plateforme. Ajoute une phrase douce indiquant que la carte n'est pas créée depuis le chat. Si c'est une révision, n'écris pas que tu as pris en compte, noté, gardé, mémorisé ou enregistré la correction.",
    revision_done:
      "Révision: dis sobrement que la formulation à recopier est la nouvelle version, puis redonne uniquement l'élément corrigé avec le label exact si support_need change. N'écris pas que tu as pris en compte, noté, gardé, mémorisé ou enregistré la correction.",
    destination_short:
      "Destination: réponds en 1 à 2 phrases maximum avec seulement l'endroit où mettre la carte. Si la valeur support_need est disponible, tu peux ajouter le champ exact et sa valeur en une phrase courte. Ne répète pas le contexte de risque, l'action de défense, les étapes détaillées, ni tout le handoff sauf si le user demande explicitement de tout redire.",
    apply_attempt:
      "Tentative de création: dis que Sophia ne crée pas la carte depuis le chat, puis donne la destination et les données exactes si disponibles.",
    repeat_handoff:
      "Répétition: redis quoi saisir dans la plateforme sans longue justification et sans changer la valeur.",
    inline_tool_return:
      "Retour inline: rédige une transition courte depuis la réponse de l'outil inline sans décider la suite du flow.",
    stop_or_cancel:
      "Arrêt local: confirme brièvement qu'on met la carte de défense de côté, sans relancer un autre sujet.",
    exit_ack:
      "Sortie: accuse réception très brièvement avant qu'un autre dispatcher reprenne, sans répondre au nouveau sujet.",
    exit_or_cancel:
      "Sortie: confirme brièvement qu'on met la carte de défense de côté ou qu'on laisse la suite reprendre, sans forcer.",
    safety:
      "Safety: ne pousse pas vers une carte de défense et laisse la prise en charge safety reprendre.",
    safety_transition:
      "Transition safety: écris une phrase très courte qui laisse la prise en charge sécurité reprendre, sans conseil produit.",
    handoff_transition:
      "Transition locale: écris une phrase courte qui laisse un autre flow local reprendre, sans remplir ses champs.",
    none: "Aucun message visible ne doit être produit pour ce stage.",
  };

export function visibleSystemPrompt(
  input: PrepareDefenseCardVisibleAgentInput,
): string {
  return [
    "Tu es l'agent conversationnel visible du flow prepare_defense_card.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne décides rien, tu ne remplis aucun champ, tu ne routes pas et tu ne corriges pas l'état.",
    "Tu reçois uniquement visible_task.conversation_context, déjà filtré par le reducer.",
    "Tu n'utilises aucune mémoire brute, aucun état local brut, aucun draft brut et aucun historique brut.",
    "Tu dois formuler naturellement, sans template fixe, sans renderer déterministe et sans modèle répétitif.",
    "Le chat ne crée jamais de carte de défense. Ne prétends jamais avoir créé, ajouté, activé, sauvegardé ou lancé une carte.",
    "Après une révision, ne prétends jamais avoir pris en compte, noté, gardé, mémorisé, enregistré ou sauvegardé la nouvelle formulation; donne seulement la formulation actuelle à recopier.",
    `Le seul champ plateforme à mentionner quand demandé est exactement: ${DEFENSE_CARD_SUPPORT_NEED_LABEL}`,
    "N'affiche jamais entry_need, risk_moment, first_signal, defense_response ou fallback_plan comme champs plateforme.",
    "La destination produit à afficher vient de conversation_context.handoff_data.platform_destination. Ne remplace pas une destination liée à une action du Plan par la destination des cartes libres.",
    `Destination libre par défaut si aucune route spécifique n'est fournie: ${DEFENSE_CARD_PLATFORM_DESTINATION}. Le nom produit est carte de défense / Cartes de défense.`,
    VISIBLE_OUTPUT_STYLE_RULES,
    "Si le stage demande une question, pose une seule vraie question naturelle.",
    "Pour les stages d'enrichissement (ask_attachment, confirm_attachment_candidate, ask_risk_situation, ask_trigger_or_signal, ask_defense_goal_or_response), ne restitue jamais la carte, ne donne jamais de formulation à recopier, ne cite jamais le champ plateforme, ne cite jamais la destination et ne parle pas de créer/ajouter la carte. Même si toutes les informations semblent déjà présentes, le premier message visible doit seulement enrichir ou clarifier.",
    "Si le stage demande un handoff, recopie le label et la valeur exacts fournis dans conversation_context.handoff_data; tu peux écrire autour, mais pas les paraphraser ni les omettre.",
    "Si conversation_context.handoff_data contient risk_context, defense_action ou ritual_phrase, tu dois les inclure dans le message de handoff sans les remplacer par un résumé plus vague.",
    VISIBLE_STAGE_PROMPTS[input.stage],
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runPrepareDefenseCardVisibleAgent(
  input: PrepareDefenseCardVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_prepare_defense_card_visible_message",
    stage: input.stage,
    conversation_context: input.conversation_context,
    hard_constraints: {
      forbidden_creation_claims: FORBIDDEN_CREATION_CLAIMS,
      forbidden_revision_persistence_claims:
        FORBIDDEN_REVISION_PERSISTENCE_CLAIMS,
      internal_fields_not_visible: INTERNAL_PLATFORM_FIELD_LABELS,
      validation_errors_to_fix: input.validation_errors_to_fix ?? [],
    },
    required_json_shape: { message: "string" },
  });
  try {
    const raw = await generateWithGemini(
      visibleSystemPrompt(input),
      userPrompt,
      0.5,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `prepare_defense_card.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    const issues = prepareDefenseCardVisibleContractIssues(
      message ?? "",
      input,
    );
    input.trace_event?.({
      component: "prepare_defense_card.visible_agent",
      stage: input.stage,
      accepted: Boolean(message && issues.length === 0),
      issues,
    });
    if (message && issues.length === 0) return message;
    console.warn("[PrepareDefenseCard] visible agent contract failed", {
      stage: input.stage,
      issues,
    });
    return null;
  } catch (error) {
    console.warn("[PrepareDefenseCard] visible agent failed", error);
    return null;
  }
}
