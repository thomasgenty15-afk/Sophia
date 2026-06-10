import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import {
  VISIBLE_OUTPUT_STYLE_RULES,
  visibleOutputStyleIssues,
} from "../../../router/response_style_policy.ts";
import type {
  AdjustPlanConversationContext,
  AdjustPlanVisibleTaskKind,
} from "./local_flow.ts";

export type AdjustPlanVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: AdjustPlanVisibleTaskKind;
  conversation_context: AdjustPlanConversationContext;
  validation_errors_to_fix?: string[];
  trace_event?: (event: Record<string, unknown>) => void;
};

export type AdjustPlanVisibleAgent = (
  input: AdjustPlanVisibleAgentInput,
) => Promise<string | null>;

const FORBIDDEN_SUCCESS_CLAIMS = [
  "c'est applique",
  "c'est appliqué",
  "j'ai applique",
  "j'ai appliqué",
  "je l'ai deplace",
  "je l'ai déplacé",
  "je l'ai modifie",
  "je l'ai modifié",
  "j'ai modifie le plan",
  "j'ai modifié le plan",
  "j'ai enregistre",
  "j'ai enregistré",
  "c'est enregistre",
  "c'est enregistré",
  "j'ai valide",
  "j'ai validé",
  "disponible dans ton plan",
  "est disponible dans ton plan",
];

const INTERNAL_LABELS = [
  "scope",
  "slot",
  "json",
  "dispatcher",
  "flow_action",
  "platform_handoff",
  "plan_item_ids",
  "conversation_context",
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("’", "'")
    .toLowerCase();
}

function requiresPlanDestination(stage: AdjustPlanVisibleTaskKind): boolean {
  return [
    "plan_handoff_ready",
    "revise_plan_handoff",
    "repeat_plan_handoff",
    "destination_short",
    "apply_attempt",
  ].includes(stage);
}

function hasVisibleHandoffCore(input: AdjustPlanVisibleAgentInput): boolean {
  const scope = input.conversation_context.known_values.scope;
  const need = input.conversation_context.known_values.adjustment_need;
  const hasTarget = Boolean(
    !scope.needs_scope_clarification &&
      scope.kind !== "unknown" &&
      (scope.target_summary ||
        scope.plan_item_ids.length > 0 ||
        scope.level_id ||
        scope.level_title ||
        scope.plan_id ||
        scope.plan_title),
  );
  const hasChangeKind = Boolean(
    need.change_kind &&
      need.change_kind !== "unknown" &&
      need.change_kind !== "clarify",
  );
  return Boolean(
    hasTarget &&
      need.reason_change &&
      need.requested_change &&
      hasChangeKind,
  );
}

export function adjustPlanVisibleContractIssues(
  message: string,
  input: AdjustPlanVisibleAgentInput,
): string[] {
  const issues: string[] = visibleOutputStyleIssues(message);
  const normalized = normalizeForGuard(message);
  if (!message.trim()) issues.push("empty_message");
  for (const claim of FORBIDDEN_SUCCESS_CLAIMS) {
    if (normalized.includes(normalizeForGuard(claim))) {
      issues.push(`forbidden_success_claim:${claim}`);
    }
  }
  for (const label of INTERNAL_LABELS) {
    if (normalized.includes(normalizeForGuard(label))) {
      issues.push(`internal_label_visible:${label}`);
    }
  }
  if (requiresPlanDestination(input.stage) && !normalized.includes("plan")) {
    issues.push("missing_plan_destination");
  }
  if (
    requiresPlanDestination(input.stage) &&
    input.stage !== "destination_short" &&
    !hasVisibleHandoffCore(input)
  ) {
    issues.push("missing_handoff_core_context");
  }
  if (
    input.stage === "cancel_close" &&
    (normalized.includes("plan") ||
      normalized.includes("plateforme") ||
      normalized.includes("niveau actif") ||
      normalized.includes("ajuster mon plan"))
  ) {
    issues.push("cancel_close_should_not_redirect_to_plan");
  }
  const suggested = input.conversation_context.handoff_data.revised_value ??
    input.conversation_context.handoff_data.suggested_platform_input ??
    input.conversation_context.handoff_data.grouped_by_plan?.[0]
      ?.suggested_platform_input ??
    null;
  if (
    requiresPlanDestination(input.stage) &&
    input.stage !== "destination_short" &&
    !suggested
  ) {
    issues.push("missing_suggested_platform_input_in_context");
  }
  return issues;
}

const STAGE_PROMPTS: Record<
  Exclude<AdjustPlanVisibleTaskKind, "none">,
  string[]
> = {
  clarify_scope: [
    "Stage ask_scope.",
    "Pose une seule question naturelle pour identifier ce qui doit etre ajuste dans Plan.",
    "Si plusieurs plans/actions candidats sont fournis dans conversation_context, aide le user a designer le bon sans choisir a sa place.",
    "Ne propose pas encore de handoff final.",
  ],
  clarify_adjustment_need: [
    "Stage ask_adjustment_need.",
    "Demande une seule precision sur ce qui doit changer et pourquoi.",
    "Utilise seulement les valeurs connues et manquantes de conversation_context.",
    "N'invente pas le changement demande.",
  ],
  clarify_constraints: [
    "Stage ask_constraints.",
    "Pose une seule question pour proteger ce qu'il faut preserver, eviter ou ne pas toucher.",
    "Ne transforme pas une contrainte candidate en fait confirme.",
  ],
  plan_handoff_ready: [
    "Stage handoff_ready.",
    "Avant la proposition a saisir, rends lisibles trois reperes: quoi modifier depuis known_values.scope.target_summary ou selected_candidate, pourquoi depuis reason_change, et nature de modification depuis change_kind.",
    "Ces reperes doivent etre naturels et courts, sans template fixe ni labels internes.",
    "Donne naturellement la proposition concrete a reprendre dans Plan.",
    "Utilise handoff_data.suggested_platform_input ou grouped_by_plan.",
    "Mentionne clairement le chemin produit: sur la plateforme, dans Plan, sous le niveau actif, le user trouve Ajuster mon plan pour saisir la proposition.",
    "Ne dis jamais que c'est applique, modifie, sauvegarde, valide ou enregistre.",
  ],
  revise_plan_handoff: [
    "Stage revise_handoff.",
    "Dis que la formulation a reprendre est la nouvelle version, puis redonne seulement ce qui change.",
    "Garde le lien avec quoi modifier, pourquoi et la nature de modification si conversation_context les contient.",
    "Rappelle le chemin produit seulement si utile: plateforme, Plan, sous le niveau actif, Ajuster mon plan.",
    "Ne modifie pas les champs; ils sont deja dans conversation_context.",
  ],
  repeat_plan_handoff: [
    "Stage repeat_handoff.",
    "Redis courtement le chemin produit et la proposition deja preparee.",
    "Le chemin produit attendu est: plateforme, Plan, sous le niveau actif, Ajuster mon plan.",
    "Ne rajoute pas de nouveau raisonnement ni de nouveau champ.",
  ],
  destination_short: [
    "Stage destination_followup.",
    "Reponds court avec le chemin produit precis: plateforme, Plan, sous le niveau actif, Ajuster mon plan.",
    "Si utile, ajoute la phrase a reprendre dans ce champ.",
    "Ne fais pas de tutoriel produit large.",
  ],
  explain_handoff: [
    "Stage explain_handoff.",
    "Explique brievement le raisonnement depuis evidence_used, contraintes et state_summary.",
    "Ne change pas la proposition.",
  ],
  inline_tool_return: [
    "Stage inline_tool_return.",
    "Rends la reponse inline puis reviens au prochain focus du flow adjust_plan_item.",
    "Ne change pas l'etat parent et ne cree pas de nouveaux champs.",
  ],
  apply_attempt: [
    "Stage apply_attempt.",
    "Refuse doucement l'application depuis le chat.",
    "Explique que le user doit le faire sur la plateforme: Plan, sous le niveau actif, Ajuster mon plan.",
    "Avant de redonner quoi saisir, rappelle naturellement quoi modifier, pourquoi, et la nature de modification presents dans conversation_context.",
    "Ne cree pas de confirmation executable.",
  ],
  cancel_close: [
    "Stage stop_or_cancel.",
    "Ferme courtement le flow local.",
    "Ne redirige pas vers Plan, la plateforme, le niveau actif ou Ajuster mon plan.",
    "Ne propose pas de retourner au plan apres un stop, cancel, abandon ou laisse tomber.",
    "Pas de question finale, pas de coaching additionnel, pas de global visible.",
  ],
  exit_or_cancel: [
    "Stage exit_ack.",
    "Si un message local est necessaire, fais une transition minimale.",
    "Ne traite pas le nouveau sujet; le dispatcher cible s'en chargera.",
  ],
  safety: [
    "Stage safety_transition.",
    "Ne continue pas le travail Plan.",
    "Fais uniquement une transition minimale vers la prise en charge safety si necessaire.",
  ],
  contract_recovery: [
    "Stage contract_recovery.",
    "Le flow reste local mais il manque une donnee structurelle pour continuer proprement.",
    "Pose une clarification courte et recuperable depuis missing_or_weak_values.",
    "N'expose pas l'erreur interne et ne bascule pas vers global.",
  ],
};

export function visibleSystemPrompt(
  input: AdjustPlanVisibleAgentInput,
): string {
  return [
    "Tu es l'agent conversationnel visible du flow adjust_plan_item.",
    "Tu ecris uniquement le prochain message visible de Sophia.",
    "Tu ne decides rien, tu ne remplis aucun champ, tu ne routes pas et tu ne corriges pas l'etat.",
    "Tu recois uniquement visible_task.conversation_context, deja filtre par le dispatcher local et le reducer.",
    "Tu n'as pas acces au db_context_pack brut ni a la micro_memory_context brute.",
    "Le chat ne modifie jamais le plan. Ne pretends jamais avoir applique, modifie, deplace, valide, sauvegarde ou enregistre le plan.",
    "Si tu fais un handoff, la destination canonique est Plan.",
    "Pour les stages de handoff Plan, exploite trois reperes obligatoires depuis conversation_context: quoi modifier via known_values.scope.target_summary ou selected_candidate, pourquoi via known_values.adjustment_need.reason_change, nature de modification via known_values.adjustment_need.change_kind.",
    "Utilise known_values.adjustment_need.requested_change pour formuler le resultat attendu, sans le confondre avec la nature de modification.",
    "Pour les stages de handoff Plan, avant de dire quoi saisir dans Ajuster mon plan, donne assez de contexte pour que le user comprenne ce qui change, dans quel sens, et pourquoi, sans template fixe.",
    "Destination produit precise: sur la plateforme, dans Plan, sous le niveau actif, le user trouve Ajuster mon plan; c'est la qu'il reprend la proposition.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Si le stage demande une question, pose une seule vraie question naturelle.",
    "N'affiche jamais les labels internes scope, slot, JSON, dispatcher, flow_action, platform_handoff ou plan_item_ids.",
    "Formule naturellement, sans template fixe et sans modele repetitif.",
    ...(input.stage === "none"
      ? ["Stage none interdit: ne produis pas de message."]
      : STAGE_PROMPTS[input.stage]),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runAdjustPlanVisibleAgent(
  input: AdjustPlanVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_adjust_plan_item_visible_message",
    stage: input.stage,
    conversation_context: input.conversation_context,
    platform_destination: "Plan",
    hard_constraints: {
      no_chat_mutation: true,
      forbidden_success_claims: FORBIDDEN_SUCCESS_CLAIMS,
      internal_labels_not_visible: INTERNAL_LABELS,
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
        source: `adjust_plan_item.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    const issues = adjustPlanVisibleContractIssues(message ?? "", input);
    input.trace_event?.({
      component: "adjust_plan_item.visible_agent",
      stage: input.stage,
      accepted: Boolean(message && issues.length === 0),
      issues,
    });
    if (message && issues.length === 0) return message;
    console.warn("[AdjustPlanItem] visible agent contract failed", {
      stage: input.stage,
      issues,
    });
    return null;
  } catch (error) {
    console.warn("[AdjustPlanItem] visible agent failed", error);
    return null;
  }
}
