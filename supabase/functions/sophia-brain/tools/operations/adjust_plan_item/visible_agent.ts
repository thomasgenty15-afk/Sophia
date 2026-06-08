import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { AdjustPlanHandoffDraft } from "./contract.ts";
import type {
  AdjustPlanLocalState,
  AdjustPlanVisibleTaskKind,
} from "./local_flow.ts";

export type AdjustPlanVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: AdjustPlanVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  local_state: AdjustPlanLocalState | null;
  draft: AdjustPlanHandoffDraft | null;
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
];

const INTERNAL_LABELS = [
  "scope",
  "slot",
  "json",
  "dispatcher",
  "flow_action",
  "platform_handoff",
  "plan_item_ids",
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

export function adjustPlanVisibleContractIssues(
  message: string,
  input: AdjustPlanVisibleAgentInput,
): string[] {
  const issues: string[] = [];
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
  const suggested = input.draft?.suggested_platform_input ??
    input.local_state?.platform_handoff.revised_value ??
    input.local_state?.platform_handoff.suggested_platform_input ??
    null;
  if (
    requiresPlanDestination(input.stage) &&
    input.stage !== "destination_short" &&
    suggested &&
    !message.includes(suggested)
  ) {
    issues.push("missing_suggested_platform_input");
  }
  return issues;
}

function visibleTaskInstruction(task: AdjustPlanVisibleTaskKind): string {
  switch (task) {
    case "clarify_scope":
      return "Pose une seule question naturelle pour identifier ce qui doit etre ajuste dans Plan. Si plusieurs plans existent, aide a designer le bon plan ou la bonne action.";
    case "clarify_adjustment_need":
      return "Demande une seule precision sur ce qui doit changer et pourquoi, sans proposition finale.";
    case "clarify_constraints":
      return "Pose une seule question pour proteger ce qu'il faut preserver, eviter ou ne surtout pas toucher.";
    case "plan_handoff_ready":
      return "Donne naturellement la proposition concrete a reprendre dans Plan. Si plusieurs plans sont touches, groupe par plan. Ne dis jamais que c'est applique.";
    case "revise_plan_handoff":
      return "Dis que la formulation a reprendre est la nouvelle version, puis redonne seulement ce qui change. Ne dis pas que c'est applique ou enregistre.";
    case "repeat_plan_handoff":
      return "Redis courtement la destination Plan et la proposition, sans refaire tout le raisonnement.";
    case "destination_short":
      return "Reponds court avec la destination Plan et, si utile, la phrase a reprendre.";
    case "explain_handoff":
      return "Explique brievement le raisonnement sans labels internes, sans rapport et sans nouvelle proposition non presente dans l'etat.";
    case "apply_attempt":
      return "Refuse doucement l'application depuis le chat et redonne la destination Plan avec la proposition a reprendre.";
    case "cancel_close":
      return "Ferme le flow courtement sans handoff actif ni modification de plan.";
    case "exit_or_cancel":
      return "Message minimal si necessaire avant de laisser le dispatcher global reprendre; ne force pas l'ajustement.";
    case "safety":
      return "Ne continue pas l'ajustement Plan. Message minimal avant reprise safety.";
    case "none":
      throw new Error("adjust_plan_item_visible_stage_none_unreachable");
  }
}

function visibleSystemPrompt(input: AdjustPlanVisibleAgentInput): string {
  return [
    "Tu es l'agent conversationnel visible du flow adjust_plan_item.",
    "Tu ecris uniquement le prochain message visible de Sophia.",
    "Tu ne decides rien, tu ne remplis aucun champ, tu ne routes pas et tu ne corriges pas l'etat.",
    "Tu recois un etat structure deja decide par le dispatcher local et le reducer.",
    "Le chat ne modifie jamais le plan. Ne pretends jamais avoir applique, modifie, deplace, valide, sauvegarde ou enregistre le plan.",
    "Si tu fais un handoff, la destination canonique est Plan.",
    "Si le stage demande une question, pose une seule vraie question naturelle.",
    "N'affiche jamais les labels internes scope, slot, JSON, dispatcher, flow_action, platform_handoff ou plan_item_ids.",
    "Formule naturellement, sans template fixe et sans modele repetitif.",
    visibleTaskInstruction(input.stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runAdjustPlanVisibleAgent(
  input: AdjustPlanVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_adjust_plan_item_visible_message",
    stage: input.stage,
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    local_state: input.local_state,
    scope: input.local_state?.scope ?? null,
    adjustment_need: input.local_state?.adjustment_need ?? null,
    platform_handoff: input.local_state?.platform_handoff ?? null,
    handoff_draft: input.draft,
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
