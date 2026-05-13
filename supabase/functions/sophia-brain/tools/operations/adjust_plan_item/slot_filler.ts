import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";

declare const Deno: any;

export type AdjustPlanSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  current_state?: unknown;
  operation_input?: Record<string, unknown> | null;
};

export type AdjustPlanSlotFillerOutput = {
  current_sub_skill:
    | "scope_router"
    | "action_intake"
    | "level_intake"
    | "whole_plan_intake"
    | "draft_validation";
  fill_order: string[];
  state_patch: {
    target_granularity?: unknown;
    scope?: unknown;
    payload?: unknown;
  };
  missing_slots: string[];
  confidence: "low" | "medium" | "high";
  next_question?: string | null;
  evidence?: string[];
};

export type AdjustPlanSlotFiller = (
  input: AdjustPlanSlotFillerInput,
) => Promise<AdjustPlanSlotFillerOutput | null>;

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export function shouldUseAdjustPlanAiSlotFiller(): boolean {
  return String(safeEnvGet("SOPHIA_ADJUST_PLAN_AI_SLOT_FILLING") ?? "")
    .trim() === "1";
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("adjust_plan_slots_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("adjust_plan_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeSlotFillerOutput(raw: unknown): AdjustPlanSlotFillerOutput {
  const root = parseJsonObject(raw);
  const subSkill = String(root.current_sub_skill ?? "").trim();
  const currentSubSkill = [
      "scope_router",
      "action_intake",
      "level_intake",
      "whole_plan_intake",
      "draft_validation",
    ].includes(subSkill)
    ? subSkill as AdjustPlanSlotFillerOutput["current_sub_skill"]
    : "scope_router";
  const confidenceRaw = String(root.confidence ?? "").trim();
  const confidence = confidenceRaw === "high" || confidenceRaw === "medium" ||
      confidenceRaw === "low"
    ? confidenceRaw
    : "low";
  const statePatch = root.state_patch && typeof root.state_patch === "object" &&
      !Array.isArray(root.state_patch)
    ? root.state_patch as AdjustPlanSlotFillerOutput["state_patch"]
    : {};
  return {
    current_sub_skill: currentSubSkill,
    fill_order: stringArray(root.fill_order),
    state_patch: statePatch,
    missing_slots: stringArray(root.missing_slots),
    confidence,
    next_question: root.next_question == null
      ? null
      : String(root.next_question).trim() || null,
    evidence: stringArray(root.evidence),
  };
}

export async function fillAdjustPlanSlotsWithAi(
  input: AdjustPlanSlotFillerInput,
): Promise<AdjustPlanSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le slot filler interne du Tool Skill adjust_plan de Sophia.",
    "Tu ne réponds jamais au user directement. Tu remplis uniquement un JSON de progression.",
    "Le Tool Skill global suit cet ordre idéal:",
    "1 scope_router: identifier action précise vs niveau actuel vs plan global.",
    "2 action_intake, level_intake ou whole_plan_intake selon le scope.",
    "3 draft_generation: seulement quand les slots minimaux sont prêts.",
    "4 draft_validation: vérifier le brouillon avant confirmation utilisateur.",
    "Un seul message utilisateur peut remplir plusieurs slots. Ne repose jamais une question pour un slot déjà rempli.",
    "Pour action_intake, minimum: plan_item_id, adjustment_type, reason, desired effect/constraints si disponibles.",
    "Pour level_intake, minimum: reason_change, change_target, constraints, et si possible deux actions candidates; le niveau ne doit pas toucher le plan global.",
    "Pour whole_plan_intake, minimum: reason_change, global change target, preserved intent, impacted/protected parts si disponibles.",
    "Toute contrainte exacte donnée par le user (durée, fréquence, action à protéger, action à toucher, horizon temporel) doit être copiée dans payload.constraints.values sous forme structurée.",
    "Si le scope est vague mais contient des indices qui dépassent une action isolée, privilégie current_level ou whole_plan selon les preuves.",
    "Retourne uniquement du JSON valide.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_adjust_plan_tool_skill_slots",
    required_json_shape: {
      current_sub_skill:
        "scope_router|action_intake|level_intake|whole_plan_intake|draft_validation",
      fill_order: [
        "scope",
        "reason_change",
        "change_target",
        "constraints",
        "affected_items",
        "draft_generation",
        "draft_validation",
      ],
      state_patch: {
        target_granularity: {
          status: "missing|ambiguous|identified",
          value: "single_action|action_cluster|current_level|whole_plan",
          confidence: "low|medium|high",
          evidence: ["string"],
          negative_evidence: ["string"],
        },
        scope: {
          status: "missing|ambiguous|identified",
          kind: "specific_plan_item|current_level|whole_plan",
          plan_item_id: "string|null",
          label: "string|null",
          evidence: ["string"],
        },
        payload:
          "ActionAdjustmentPayload|LevelAdjustmentPayload|WholePlanAdjustmentPayload|null",
      },
      missing_slots: ["string"],
      confidence: "low|medium|high",
      next_question: "string|null",
      evidence: ["string"],
    },
    message: input.message,
    recent_messages: input.recent_messages ?? [],
    plan_snapshot: input.plan_snapshot ?? null,
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.15,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "adjust_plan.slot_filler",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeSlotFillerOutput(raw);
}
