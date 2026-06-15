import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../../router/response_style_policy.ts";
import type {
  PrepareAttackCardConversationContext,
  PrepareAttackCardVisibleTaskKind,
} from "./local_flow.ts";

export type PrepareAttackCardVisibleTaskForAgent = {
  kind: PrepareAttackCardVisibleTaskKind;
  instruction?: string | null;
  conversation_context: PrepareAttackCardConversationContext;
};

export type PrepareAttackCardVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: PrepareAttackCardVisibleTaskKind;
  visible_task: PrepareAttackCardVisibleTaskForAgent;
  validation_errors_to_fix?: string[];
  trace_event?: (event: Record<string, unknown>) => void;
};

export type PrepareAttackCardVisibleAgent = (
  input: PrepareAttackCardVisibleAgentInput,
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
  "c'est active",
  "c'est activé",
  "dis oui et je la crée",
  "dis oui et je la cree",
];

const EXACT_TECHNIQUE_LABELS = [
  "Le texte magique",
  "Mantra de force",
  "Ancre visuelle",
  "Meditation de 5 minutes",
  "Preparer le terrain",
  "Mot de bascule",
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

function cleanMessage(value: unknown): string {
  let text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  while (text.includes("\n\n\n")) {
    text = text.replaceAll("\n\n\n", "\n\n");
  }
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

function conversationContext(
  input: PrepareAttackCardVisibleAgentInput,
): PrepareAttackCardConversationContext {
  return input.visible_task.conversation_context;
}

function isRevisionContext(input: PrepareAttackCardVisibleAgentInput): boolean {
  const context = conversationContext(input);
  return Boolean(
    context.known_values.current_field?.previous_value ||
      context.selected_candidate.previous_value,
  );
}

function allowedTechniqueLabelsForStage(
  input: PrepareAttackCardVisibleAgentInput,
): string[] {
  if (input.stage !== "ask_or_confirm_technique") return [];
  const context = conversationContext(input);
  const labels = context.selected_candidate.allowed_technique_labels;
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => String(label ?? "").trim()).filter(Boolean);
}

export function prepareAttackCardVisibleContractIssues(
  message: string,
  input: PrepareAttackCardVisibleAgentInput,
): string[] {
  const issues: string[] = [];
  const normalized = normalizeForGuard(message);
  const allowedTechniqueLabels = allowedTechniqueLabelsForStage(input);
  if (!message.trim()) issues.push("empty_message");
  for (const claim of FORBIDDEN_CREATION_CLAIMS) {
    if (normalized.includes(normalizeForGuard(claim))) {
      issues.push(`forbidden_creation_claim:${claim}`);
    }
  }
  if (allowedTechniqueLabels.length > 0) {
    const allowed = new Set(
      allowedTechniqueLabels.map((label) => normalizeForGuard(label)),
    );
    for (const label of EXACT_TECHNIQUE_LABELS) {
      if (
        !allowed.has(normalizeForGuard(label)) &&
        normalized.includes(normalizeForGuard(label))
      ) {
        issues.push(`technique_label_outside_candidate_options:${label}`);
      }
    }
  }
  if (isRevisionContext(input)) {
    for (const claim of FORBIDDEN_REVISION_PERSISTENCE_CLAIMS) {
      if (normalized.includes(normalizeForGuard(claim))) {
        issues.push(`forbidden_revision_persistence_claim:${claim}`);
      }
    }
  }
  if (input.stage === "apply_attempt") {
    const mentionsChatBoundary = normalized.includes("depuis le chat") ||
      normalized.includes("dans le chat") ||
      normalized.includes("depuis cette conversation") ||
      normalized.includes("dans cette conversation") ||
      normalized.includes("ici");
    const statesNoCreation = normalized.includes("ne cree pas") ||
      normalized.includes("ne peux pas creer") ||
      normalized.includes("ne peux pas l'ajouter") ||
      normalized.includes("ne peux pas l'enregistrer") ||
      normalized.includes("pas la creer") ||
      normalized.includes("pas l'ajouter") ||
      normalized.includes("pas l'enregistrer");
    if (!mentionsChatBoundary && !statesNoCreation) {
      issues.push("apply_attempt_missing_chat_boundary");
    }
  }
  return issues;
}

function visibleTaskInstruction(
  task: PrepareAttackCardVisibleTaskKind,
): string {
  switch (task) {
    case "ask_target":
      return "Cible manquante ou ambiguë: pose une seule question naturelle pour comprendre quelle action, habitude, effort ou situation la carte doit aider à attaquer. Ne mentionne pas de destination plateforme ni de brouillon.";
    case "confirm_target_candidate":
      return "Cible candidate: demande si c'est bien cette cible, sans verrouiller autre chose et en laissant une correction facile. Ne mentionne pas de destination plateforme ni de brouillon.";
    case "ask_blocker":
      return "Piège manquant: pose une seule question naturelle sur ce qui fait dérailler le user au moment d'agir. Ne mentionne pas de destination plateforme ni de brouillon.";
    case "ask_or_confirm_technique":
      return "Technique: fais choisir ou confirmer la technique utile, uniquement avec les labels presents dans conversation_context.selected_candidate.allowed_technique_labels. Si conversation_context.selected_candidate.recommended_technique existe, propose cette technique en confirmation courte. Sinon, limite strictement le choix aux candidate_options fournies; ne liste jamais toutes les techniques produit.";
    case "ask_platform_field":
      return "Champ plateforme: pose une seule question naturelle pour obtenir le champ courant, sans formulaire et sans inventer de valeur.";
    case "confirm_platform_field_proposal":
      return "Proposition de champ: demande si la valeur proposée correspond, sans finaliser la carte.";
    case "handoff_ready":
      return "Handoff prêt: donne naturellement la destination Cartes d'attaque, la technique exacte, puis recopie chaque champ plateforme exact et sa valeur exacte. Si c'est une révision, n'écris pas que tu as pris en compte, noté, gardé, mémorisé ou enregistré la correction.";
    case "revision_done":
      return "Révision: dis sobrement que la formulation à recopier est la nouvelle version et redonne les champs utiles avec la destination si nécessaire. N'écris pas que tu as pris en compte, noté, gardé, mémorisé ou enregistré la correction.";
    case "destination_short":
      return "Destination: réponds court avec Cartes d'attaque et les champs prêts si disponibles.";
    case "apply_attempt":
      return "Tentative de création: dis explicitement que Sophia ne crée pas la carte depuis le chat, puis donne Cartes d'attaque et les données exactes à saisir.";
    case "repeat_handoff":
      return "Répétition: redis quoi saisir dans la plateforme sans refaire une longue justification.";
    case "inline_tool_return":
      return "Retour inline: formule une transition courte après la réponse produit/statut, en gardant le flow parent intact.";
    case "stop_or_cancel":
      return "Sortie carte: confirme brièvement que la carte est mise de côté si un message local est requis, sans question finale et sans traiter un nouveau sujet.";
    case "exit_ack":
      return "Exit: si un message source est nécessaire, fais une transition très courte; sinon le dispatcher cible reprendra.";
    case "exit_or_cancel":
      return "Sortie: confirme brièvement la mise de côté ou accompagne la sortie, sans forcer la carte.";
    case "safety":
      return "Safety: ne pousse pas vers une carte d'attaque et laisse la prise en charge safety reprendre.";
    case "safety_transition":
      return "Safety transition: message minimal, pas de coaching carte; la prise en charge safety doit reprendre.";
    case "none":
      throw new Error("prepare_attack_card_visible_stage_none_unreachable");
  }
}

export function visibleSystemPrompt(
  input: PrepareAttackCardVisibleAgentInput,
): string {
  const stageSpecificPrompt = visibleTaskInstruction(input.stage);
  return [
    `Tu es le prompt conversationnel stage-specific prepare_attack_card.visible.${input.stage}.`,
    "Tu écris uniquement le prochain message visible de Sophia pour ce stage.",
    "Tu ne décides rien, tu ne remplis aucun champ, tu ne routes pas et tu ne corriges pas l'état.",
    "Tu reçois uniquement visible_task.conversation_context, déjà filtré par le dispatcher local et le reducer.",
    "N'utilise aucune connaissance DB, mémoire brute, historique brut ou état local non présent dans conversation_context.",
    "Tu dois formuler naturellement, sans template fixe, sans renderer déterministe et sans modèle répétitif.",
    "Le chat ne crée jamais de carte d'attaque. Ne prétends jamais avoir créé, ajouté, activé, sauvegardé ou lancé une carte.",
    "Après une révision, ne prétends jamais avoir pris en compte, noté, gardé, mémorisé, enregistré ou sauvegardé la nouvelle formulation; donne seulement la formulation actuelle à recopier.",
    "N'invente jamais de technique. Labels autorisés uniquement: Le texte magique, Mantra de force, Ancre visuelle, Meditation de 5 minutes, Preparer le terrain, Mot de bascule.",
    "Pour ask_or_confirm_technique, si conversation_context.selected_candidate.allowed_technique_labels est non vide, ces labels remplacent la liste globale: ne mentionne aucune autre technique.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Si le stage demande une question, pose une seule vraie question naturelle.",
    "Si le stage demande un handoff, recopie les labels plateforme et valeurs exactes fournis dans conversation_context.handoff_data; tu peux écrire autour, mais pas les paraphraser ni les omettre.",
    stageSpecificPrompt,
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

async function generateVisibleMessage(
  input: PrepareAttackCardVisibleAgentInput,
  retryIssues: string[] = [],
): Promise<string | null> {
  const context = conversationContext(input);
  const userPrompt = JSON.stringify({
    task: "write_prepare_attack_card_visible_message",
    stage: input.stage,
    conversation_context: context,
    hard_constraints: {
      platform_destination: "Cartes d'attaque",
      exact_technique_labels: EXACT_TECHNIQUE_LABELS,
      allowed_technique_labels_for_this_stage: allowedTechniqueLabelsForStage(
        input,
      ),
      forbidden_creation_claims: FORBIDDEN_CREATION_CLAIMS,
      forbidden_revision_persistence_claims:
        FORBIDDEN_REVISION_PERSISTENCE_CLAIMS,
      validation_errors_to_fix: retryIssues.length > 0
        ? retryIssues
        : input.validation_errors_to_fix ?? [],
      visible_agent_may_only_use_conversation_context: true,
    },
    required_json_shape: {
      message: "string",
    },
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
        source: `prepare_attack_card.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return parseVisibleMessage(raw);
  } catch (error) {
    console.warn("[PrepareAttackCard] visible agent failed", error);
    return null;
  }
}

export async function runPrepareAttackCardVisibleAgent(
  input: PrepareAttackCardVisibleAgentInput,
): Promise<string | null> {
  const first = await generateVisibleMessage(input);
  const firstIssues = prepareAttackCardVisibleContractIssues(
    first ?? "",
    input,
  );
  input.trace_event?.({
    component: "visible_agent",
    stage: input.stage,
    attempt: 1,
    accepted: Boolean(first && firstIssues.length === 0),
    issues: firstIssues,
  });
  if (first && firstIssues.length === 0) return first;

  const second = await generateVisibleMessage(input, firstIssues);
  const secondIssues = prepareAttackCardVisibleContractIssues(
    second ?? "",
    input,
  );
  input.trace_event?.({
    component: "visible_agent",
    stage: input.stage,
    attempt: 2,
    accepted: Boolean(second && secondIssues.length === 0),
    issues: secondIssues,
    retry_triggered_by: firstIssues,
  });
  if (second && secondIssues.length === 0) return second;

  console.warn("[PrepareAttackCard] visible agent contract failed", {
    stage: input.stage,
    issues: secondIssues.length > 0 ? secondIssues : firstIssues,
  });
  return null;
}
