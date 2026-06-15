import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../../../router/response_style_policy.ts";
import type {
  ClarteVisibleTaskKind,
  StatePotionConversationContext,
  StatePotionSubskillVisibleTaskKind,
} from "../contract.ts";
import { stageSpecificVisibleInstruction } from "./stage_prompts.ts";

export type SelectStatePotionVisibleStage =
  | "potion_clarification"
  | "potion_selected"
  | "detail_field_intake"
  | "field_confirmation"
  | "handoff_ready"
  | "handoff_delivered"
  | "platform_destination_followup"
  | "apply_attempt"
  | "repeat_handoff"
  | "cancel"
  | "blocked"
  | "clarte_task"
  | "potion_subskill_task";

export type SelectStatePotionVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: SelectStatePotionVisibleStage;
  visible_task: {
    kind: SelectStatePotionVisibleStage;
    instruction?: string | null;
    conversation_context: StatePotionConversationContext;
  };
  validation_errors_to_fix?: string[];
  trace_event?: (event: Record<string, unknown>) => void;
};

export type SelectStatePotionVisibleAgent = (
  input: SelectStatePotionVisibleAgentInput,
) => Promise<string | null>;

const FORBIDDEN_VISIBLE_PATTERNS = [
  "Ce que je comprends",
  "Je te conseille de choisir",
  "À mettre dans la plateforme",
  "A mettre dans la plateforme",
  "Pourquoi cette potion",
  "Petit pas immédiat",
  "Petit pas immediat",
  "Potion :",
  "potion rappel",
  "potion de réparation",
  "potion de reparation",
  "apaisement court",
];

const FORBIDDEN_ACTIVATION_CLAIMS = [
  "c'est activé",
  "c'est active",
  "c'est lancé",
  "c'est lance",
  "je l'ai lancée",
  "je l'ai lancee",
  "je l'ai lancé",
  "je l'ai créé",
  "je l'ai cree",
  "je t'ai programmé",
  "je t'ai programme",
];

const ALLOWED_POTION_LABELS = [
  "Potion anti-décrochage",
  "Potion de courage",
  "Potion de guérison",
  "Potion de clarté",
  "Potion d'amour",
  "Potion d'apaisement",
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

export function visibleContractIssues(
  message: string,
  input: SelectStatePotionVisibleAgentInput,
): string[] {
  const issues: string[] = [];
  const normalized = normalizeForGuard(message);
  const context = input.visible_task.conversation_context;
  const instruction = input.visible_task.instruction ?? "";
  const handoffFields = context.handoff_data.fields;
  const lockedFields = handoffFields.filter((field) =>
    Boolean(field.locked_value ?? field.value ?? field.option_label)
  );
  for (const pattern of FORBIDDEN_VISIBLE_PATTERNS) {
    if (normalized.includes(normalizeForGuard(pattern))) {
      issues.push(`forbidden_visible_template:${pattern}`);
    }
  }
  for (const claim of FORBIDDEN_ACTIVATION_CLAIMS) {
    if (normalized.includes(normalizeForGuard(claim))) {
      issues.push(`forbidden_activation_claim:${claim}`);
    }
  }
  const potionLabel = context.handoff_data.potion_name ?? null;
  if (
    [
      "potion_selected",
      "handoff_ready",
      "handoff_delivered",
      "platform_destination_followup",
      "apply_attempt",
      "repeat_handoff",
    ].includes(input.stage) && potionLabel &&
    !normalized.includes(normalizeForGuard(potionLabel))
  ) {
    issues.push("missing_exact_potion_label");
  }
  if (
    ["platform_destination_followup", "apply_attempt"].includes(input.stage) &&
    !normalized.includes("etat / potions") &&
    !normalized.includes("état / potions")
  ) {
    issues.push("missing_platform_destination");
  }
  if (!message) issues.push("empty_message");
  if (input.stage === "potion_clarification") {
    const mentionedPotionLabels = ALLOWED_POTION_LABELS.filter((label) =>
      normalized.includes(normalizeForGuard(label))
    );
    if (mentionedPotionLabels.length >= 2) {
      issues.push("clarification_must_distinguish_needs_not_list_potion_names");
    }
  }
  if (input.stage === "clarte_task") {
    const fieldValue = context.handoff_data.fields[0]?.value ??
      context.handoff_data.fields[0]?.locked_value ??
      context.handoff_data.fields[0]?.candidate_value ??
      null;
    const task = instruction;
    const requiresPlatformData = [
      "handoff",
      "revision",
      "destination",
      "tentative",
      "repetition",
      "répétition",
    ].some((marker) => normalizeForGuard(task).includes(marker));
    if (
      !normalizeForGuard(task).includes("sortie") &&
      !normalizeForGuard(task).includes("safety") &&
      message.includes("Potion") &&
      !message.includes("Potion de clarté")
    ) {
      issues.push("clarte_missing_exact_potion_name");
    }
    if (requiresPlatformData) {
      if (
        !message.includes("État / Potions") &&
        !message.includes("Etat / Potions")
      ) {
        issues.push("clarte_missing_platform_destination");
      }
      if (!message.includes("Potion de clarté")) {
        issues.push("clarte_missing_potion_name");
      }
      if (fieldValue) {
        const fieldLabel = context.handoff_data.fields[0]?.field_label ??
          "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?";
        if (!message.includes(fieldLabel)) {
          issues.push("clarte_missing_field_label");
        }
        if (!message.includes(fieldValue)) {
          issues.push("clarte_missing_field_value");
        }
      }
    }
  }
  if (input.stage === "potion_subskill_task") {
    const task = instruction;
    const requiresPlatformData = [
      "handoff",
      "revision",
      "destination",
      "tentative",
      "repetition",
      "répétition",
    ].some((marker) => normalizeForGuard(task).includes(marker));
    if (
      context.handoff_data.potion_name &&
      message.includes("Potion") &&
      !message.includes(context.handoff_data.potion_name)
    ) {
      issues.push("potion_subskill_missing_exact_potion_name");
    }
    if (requiresPlatformData) {
      if (
        !message.includes("État / Potions") &&
        !message.includes("Etat / Potions")
      ) {
        issues.push("potion_subskill_missing_platform_destination");
      }
      const potionName = context.handoff_data.potion_name;
      if (potionName && !message.includes(potionName)) {
        issues.push("potion_subskill_missing_potion_name");
      }
      for (const field of lockedFields) {
        const fieldValue = field.value ?? field.locked_value ??
          field?.option_label ?? null;
        if (!message.includes(field.field_label)) {
          issues.push(`potion_subskill_missing_field_label:${field.field_id}`);
        }
        const visibleValue = field.option_label ?? field.locked_value ??
          fieldValue;
        if (visibleValue && !message.includes(visibleValue)) {
          issues.push(`potion_subskill_missing_field_value:${field.field_id}`);
        }
      }
    }
  }
  return issues;
}

export function clarteVisibleTaskInstruction(
  task: ClarteVisibleTaskKind | null | undefined,
): string | null {
  switch (task) {
    case "ask_deeper":
      return "Clarté / champ pas clair: pose une seule question naturelle centree sur ce qui s'est deconnecte entre le plan, les actions et le pourquoi profond.";
    case "confirm_proposal":
      return "Clarté / proposition: demande si la formulation proposee correspond, sans dire champ, slot ou valeur, et sans finaliser la potion.";
    case "handoff_ready":
      return "Clarté / handoff pret: donne naturellement Potion de clarté, le chemin État / Potions, puis recopie verbatim la question plateforme exacte et la valeur exacte a saisir. Ne remplace jamais la question par un résumé ou par l'id technique.";
    case "revision_done":
      return "Clarté / revision: indique que la nouvelle formulation remplace l'ancienne et redonne seulement la question plateforme exacte, la nouvelle valeur exacte et le chemin si utile.";
    case "destination_short":
      return "Clarté / destination: reponds court avec État / Potions et, si disponible, recopie la question plateforme exacte et la valeur exacte.";
    case "apply_attempt":
      return "Clarté / tentative de lancement: dis doucement que Sophia ne peut pas lancer depuis le chat, puis donne État / Potions, la question plateforme exacte et la valeur exacte a saisir.";
    case "repeat_handoff":
      return "Clarté / repetition: redis quoi mettre dans la plateforme sans refaire une longue justification; recopie la question plateforme exacte et la valeur exacte.";
    case "exit":
      return "Clarté / sortie: reponds court, sans forcer la potion et sans finalisation.";
    case "safety":
      return "Clarté / safety: ne pousse pas vers une potion et laisse la prise en charge safety reprendre.";
    default:
      return null;
  }
}

export function potionSubskillVisibleTaskInstruction(
  task: StatePotionSubskillVisibleTaskKind | null | undefined,
): string | null {
  switch (task) {
    case "ask_deeper":
      return "Potion / champ pas clair ou pas assez riche: pose une seule question naturelle sur le champ courant. Si conversation_context contient detail_sufficiency.followup_question pour le champ courant, utilise cette intention de question. Ne récite pas le label plateforme comme un formulaire.";
    case "confirm_proposal":
      return "Potion / proposition: demande si la formulation ou l'option proposée correspond, sans dire champ, slot ou valeur, et sans finaliser la potion.";
    case "handoff_ready":
      return "Potion / handoff prêt: donne naturellement le nom exact de la potion, le chemin État / Potions, puis recopie verbatim chaque question plateforme exacte et sa valeur exacte.";
    case "revision_done":
      return "Potion / révision: indique que la nouvelle formulation remplace l'ancienne et redonne seulement le champ modifié, avec chemin si utile.";
    case "destination_short":
      return "Potion / destination: réponds court avec État / Potions et, si disponible, recopie les champs exacts déjà prêts.";
    case "apply_attempt":
      return "Potion / tentative de lancement: dis doucement que Sophia ne peut pas lancer depuis le chat, puis donne État / Potions et les données exactes à saisir.";
    case "repeat_handoff":
      return "Potion / répétition: redis quoi mettre dans la plateforme sans refaire une longue justification; recopie les champs exacts et leurs valeurs.";
    case "exit":
      return "Potion / sortie: réponds court, sans forcer la potion et sans finalisation.";
    case "safety":
      return "Potion / safety: ne pousse pas vers une potion et laisse la prise en charge safety reprendre.";
    default:
      return null;
  }
}

function visibleSystemPrompt(
  input: SelectStatePotionVisibleAgentInput,
): string {
  const taskInstruction = input.visible_task.instruction ?? null;
  return [
    "Tu es l'agent conversationnel visible du flow select_state_potion.",
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne décides pas la potion, tu ne remplis pas les champs, tu ne routes pas.",
    "Tu reçois un état structuré déjà décidé par le dispatcher local et le reducer.",
    "Quand conversation_context est fourni, c'est ta seule source de contexte métier pour écrire le visible.",
    "Tu dois formuler naturellement, sans modèle à trous et sans structure répétitive.",
    stageSpecificVisibleInstruction(input.stage),
    "Interdit absolu: ne commence pas par 'Ce que je comprends', ne dis pas 'Je te conseille de choisir', ne crée pas un bloc 'À mettre dans la plateforme', ne rends pas 'Potion :' comme ligne template.",
    "Les emojis sont autorisés si le ton le permet.",
    "N'invente jamais de nom produit. Labels autorisés seulement: Potion anti-décrochage, Potion de courage, Potion de guérison, Potion de clarté, Potion d'amour, Potion d'apaisement.",
    "Ne rends jamais 'rappel' comme nom de potion, ni 'réparation', ni 'apaisement court'.",
    "Le chat ne lance jamais de potion. Ne prétends jamais avoir créé, lancé, activé, programmé ou sauvegardé une potion.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Si le stage demande une question, pose une seule vraie question naturelle, ancrée dans les mots du user.",
    "Si le stage est potion_clarification, distingue les besoins en langage naturel; ne liste pas deux noms de potions comme options de choix.",
    "Si le stage est potion_selected, annonce la potion exacte et explique brièvement pourquoi, sans commencer la collecte de champs détaillés.",
    "Si le stage est detail_field_intake, pose seulement la prochaine question conversationnelle; ne copie pas les labels UI comme un questionnaire.",
    "Si le stage est handoff_delivered ou handoff_ready, rends une synthèse naturelle et exploitable en mentionnant les champs plateforme exacts, mais sans format template.",
    "Si le stage est platform_destination_followup, réponds court avec le chemin État / Potions.",
    "Si le stage est apply_attempt, dis doucement que Sophia ne peut pas lancer depuis le chat et redonne le chemin plateforme.",
    "Si le stage est cancel, confirme brièvement que la potion est mise de côté; si le user demande autre chose sans potion, réponds naturellement sans protocole fixe.",
    ...(taskInstruction ? [taskInstruction] : []),
    ...(input.stage === "clarte_task" &&
        taskInstruction &&
        [
          "handoff",
          "revision",
          "destination",
          "tentative",
          "repetition",
          "répétition",
        ]
          .some((marker) => normalizeForGuard(taskInstruction).includes(marker))
      ? [
        "Obligation clarté: si une question plateforme et une valeur sont fournies dans conversation_context.handoff_data, tu dois les recopier exactement, caractère par caractère, dans le message visible.",
        "Tu peux écrire autour de ces données avec un ton naturel, mais tu ne dois ni paraphraser ni omettre la question plateforme ou la valeur.",
      ]
      : []),
    ...(input.stage === "potion_subskill_task" &&
        taskInstruction &&
        [
          "handoff",
          "revision",
          "destination",
          "tentative",
          "repetition",
          "répétition",
        ]
          .some((marker) => normalizeForGuard(taskInstruction).includes(marker))
      ? [
        "Obligation potion: si des questions plateforme et des valeurs sont fournies dans conversation_context.handoff_data, tu dois les recopier exactement dans le message visible.",
        "Tu peux écrire autour de ces données avec un ton naturel, mais tu ne dois ni paraphraser ni omettre les questions plateforme ou les valeurs.",
      ]
      : []),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

async function generateVisibleMessage(
  input: SelectStatePotionVisibleAgentInput,
  retryIssues: string[] = [],
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_select_state_potion_visible_message",
    stage: input.stage,
    visible_task: input.visible_task,
    hard_constraints: {
      platform_destination: "État / Potions",
      allowed_potion_labels: ALLOWED_POTION_LABELS,
      forbidden_visible_templates: FORBIDDEN_VISIBLE_PATTERNS,
      forbidden_activation_claims: FORBIDDEN_ACTIVATION_CLAIMS,
      validation_errors_to_fix: [
        ...(input.validation_errors_to_fix ?? []),
        ...retryIssues,
      ],
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
        source: `select_state_potion.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return parseVisibleMessage(raw);
  } catch (error) {
    console.warn("[SelectStatePotion] visible agent failed", error);
    return null;
  }
}

export async function runSelectStatePotionVisibleAgent(
  input: SelectStatePotionVisibleAgentInput,
): Promise<string | null> {
  const first = await generateVisibleMessage(input);
  const firstIssues = visibleContractIssues(first ?? "", input);
  input.trace_event?.({
    component: "visible_agent",
    stage: input.stage,
    attempt: 1,
    accepted: Boolean(first && firstIssues.length === 0),
    issues: firstIssues,
  });
  if (first && firstIssues.length === 0) return first;

  const second = await generateVisibleMessage(input, firstIssues);
  const secondIssues = visibleContractIssues(second ?? "", input);
  input.trace_event?.({
    component: "visible_agent",
    stage: input.stage,
    attempt: 2,
    accepted: Boolean(second && secondIssues.length === 0),
    issues: secondIssues,
    retry_triggered_by: firstIssues,
  });
  if (second && secondIssues.length === 0) return second;

  console.warn("[SelectStatePotion] visible agent contract failed", {
    stage: input.stage,
    issues: secondIssues.length > 0 ? secondIssues : firstIssues,
  });
  return null;
}
