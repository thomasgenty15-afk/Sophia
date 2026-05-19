import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { DefenseCardGeneratorInput } from "../_shared/operation_payload_builder.ts";
import type {
  DefenseCardConfidence,
  DefenseCardIntakeState,
  DefenseCardStep,
} from "./workflow.ts";

type DefenseResponseHint = NonNullable<
  DefenseCardGeneratorInput["defense_response_hint"]
>;

export type DefenseCardSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  current_state?: DefenseCardIntakeState | null;
  operation_input?: Record<string, unknown> | null;
};

export type DefenseCardSlotFillerOutput = {
  current_step: DefenseCardStep;
  state_patch: Partial<DefenseCardIntakeState>;
  draft_review_decision?: {
    decision:
      | "approve"
      | "reject"
      | "revise"
      | "explain"
      | "topic_change"
      | "unclear";
    confidence: DefenseCardConfidence;
    evidence: string[];
  };
  missing_slots: string[];
  confidence: DefenseCardConfidence;
  generated_user_message?: string | null;
  evidence?: string[];
};

export type DefenseCardSlotFiller = (
  input: DefenseCardSlotFillerInput,
) => Promise<DefenseCardSlotFillerOutput | null>;

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
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("defense_card_slots_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("defense_card_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): DefenseCardConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function step(value: unknown): DefenseCardStep {
  const raw = String(value ?? "").trim();
  return [
      "attachment_intake",
      "risk_intake",
      "response_design",
      "draft_generation",
      "draft_validation",
      "confirmation",
    ].includes(raw)
    ? raw as DefenseCardStep
    : "attachment_intake";
}

function triggerType(
  value: unknown,
): DefenseCardGeneratorInput["trigger"]["type"] | null {
  const raw = String(value ?? "").trim();
  return [
      "temptation",
      "impulse",
      "emotional_drop",
      "social_context",
      "fatigue",
      "stress",
      "habit_loop",
      "avoidance",
    ].includes(raw)
    ? raw as DefenseCardGeneratorInput["trigger"]["type"]
    : null;
}

function defenseGoal(
  value: unknown,
): DefenseCardGeneratorInput["defense_goal"] | null {
  const raw = String(value ?? "").trim();
  return [
      "avoid_relapse",
      "interrupt_impulse",
      "protect_action",
      "leave_context",
      "reduce_damage",
    ].includes(raw)
    ? raw as DefenseCardGeneratorInput["defense_goal"]
    : null;
}

function strategyHint(
  value: unknown,
): DefenseResponseHint["strategy_hint"] | null {
  const raw = String(value ?? "").trim();
  return [
      "delay",
      "leave_context",
      "replace_action",
      "contact_support",
      "environment_block",
      "self_talk",
      "unknown",
    ].includes(raw)
    ? raw as DefenseResponseHint["strategy_hint"]
    : null;
}

function normalizeStatePatch(value: unknown): Partial<DefenseCardIntakeState> {
  const root = objectValue(value);
  if (!root) return {};
  const patch: Partial<DefenseCardIntakeState> = {};
  const toolFit = objectValue(root.tool_fit);
  if (toolFit) {
    const status = ["defense", "attack_better", "unclear"].includes(
        String(toolFit.status ?? ""),
      )
      ? String(toolFit.status) as "defense" | "attack_better" | "unclear"
      : "unclear";
    patch.tool_fit = {
      status,
      reason: toolFit.reason == null
        ? null
        : String(toolFit.reason).trim() || null,
      confidence: confidence(toolFit.confidence),
      evidence: stringArray(toolFit.evidence),
    };
  }
  const attachment = objectValue(root.attachment);
  if (attachment) {
    const status = ["identified", "missing", "ambiguous"].includes(
        String(attachment.status ?? ""),
      )
      ? String(attachment.status) as "identified" | "missing" | "ambiguous"
      : "missing";
    patch.attachment = status === "identified"
      ? {
        status,
        kind: ["personal_action", "free_risk_context", "recurring_context"]
            .includes(String(attachment.kind ?? ""))
          ? attachment.kind as DefenseCardGeneratorInput["attachment"]["kind"]
          : "plan_item",
        plan_item_id: attachment.plan_item_id == null
          ? null
          : String(attachment.plan_item_id),
        title: String(attachment.title ?? "").trim(),
        confidence: confidence(attachment.confidence),
        evidence: stringArray(attachment.evidence),
      }
      : {
        status,
        candidates: Array.isArray(attachment.candidates)
          ? attachment.candidates.flatMap((candidate: any) => {
            const id = String(candidate?.plan_item_id ?? "").trim();
            const title = String(candidate?.title ?? "").trim();
            if (!id || !title) return [];
            return [{
              kind: "plan_item" as const,
              plan_item_id: id,
              title,
              confidence: Number(candidate?.confidence ?? 0),
              evidence: stringArray(candidate?.evidence),
            }];
          }).slice(0, 4)
          : [],
        confidence: confidence(attachment.confidence),
        evidence: stringArray(attachment.evidence),
      };
  }
  const risk = objectValue(root.risk_situation);
  if (risk) {
    const status = ["identified", "missing", "ambiguous"].includes(
        String(risk.status ?? ""),
      )
      ? String(risk.status) as "identified" | "missing" | "ambiguous"
      : "missing";
    patch.risk_situation = {
      status,
      label: risk.label == null ? null : String(risk.label).trim() || null,
      description: risk.description == null
        ? null
        : String(risk.description).trim() || null,
      timing_hint: risk.timing_hint == null
        ? null
        : String(risk.timing_hint).trim() || null,
      context_hint: risk.context_hint == null
        ? null
        : String(risk.context_hint).trim() || null,
      confidence: confidence(risk.confidence),
      evidence: stringArray(risk.evidence),
    };
  }
  const trigger = objectValue(root.trigger);
  if (trigger) {
    const status = ["identified", "missing", "ambiguous"].includes(
        String(trigger.status ?? ""),
      )
      ? String(trigger.status) as "identified" | "missing" | "ambiguous"
      : "missing";
    patch.trigger = {
      status,
      type: triggerType(trigger.type),
      confidence: Math.max(0, Math.min(1, Number(trigger.confidence ?? 0.5))),
      evidence: stringArray(trigger.evidence),
    };
  }
  const goal = objectValue(root.defense_goal);
  if (goal) {
    const value = defenseGoal(goal.value);
    patch.defense_goal = {
      status: value ? "identified" : "missing",
      value,
      confidence: confidence(goal.confidence),
      evidence: stringArray(goal.evidence),
    };
  }
  const response = objectValue(root.defense_response_hint);
  if (response) {
    const status = ["identified", "missing", "ambiguous"].includes(
        String(response.status ?? ""),
      )
      ? String(response.status) as "identified" | "missing" | "ambiguous"
      : "missing";
    patch.defense_response_hint = {
      status,
      strategy_hint: strategyHint(response.strategy_hint),
      value: response.value == null
        ? null
        : String(response.value).trim() || null,
      confidence: confidence(response.confidence),
      evidence: stringArray(response.evidence),
    };
  }
  if (Array.isArray(root.constraints)) {
    patch.constraints = stringArray(root.constraints);
  }
  if (Array.isArray(root.missing_slots)) {
    patch.missing_slots = stringArray(root.missing_slots);
  }
  patch.generated_user_message = root.generated_user_message == null
    ? undefined
    : String(root.generated_user_message).trim() || null;
  patch.confidence = confidence(root.confidence);
  patch.current_step = step(root.current_step);
  return patch;
}

function normalizeDraftReviewDecision(
  value: unknown,
): DefenseCardSlotFillerOutput[
  "draft_review_decision"
] {
  const root = objectValue(value);
  if (!root) return undefined;
  const rawDecision = String(root.decision ?? "").trim();
  const decision = [
      "approve",
      "reject",
      "revise",
      "explain",
      "topic_change",
      "unclear",
    ].includes(rawDecision)
    ? rawDecision as NonNullable<
      DefenseCardSlotFillerOutput["draft_review_decision"]
    >["decision"]
    : "unclear";
  return {
    decision,
    confidence: confidence(root.confidence),
    evidence: stringArray(root.evidence),
  };
}

export function normalizeDefenseCardSlotFillerOutput(
  raw: unknown,
): DefenseCardSlotFillerOutput {
  const root = parseJsonObject(raw);
  return {
    current_step: step(root.current_step),
    state_patch: normalizeStatePatch(root.state_patch),
    draft_review_decision: normalizeDraftReviewDecision(
      objectValue(root.state_patch)?.draft_validation,
    ),
    missing_slots: stringArray(root.missing_slots),
    confidence: confidence(root.confidence),
    generated_user_message: root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null,
    evidence: stringArray(root.evidence),
  };
}

export async function fillDefenseCardSlotsWithAi(
  input: DefenseCardSlotFillerInput,
): Promise<DefenseCardSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le slot filler interne du Tool Skill prepare_defense_card de Sophia.",
    "Tu ne réponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Principe strict: la compréhension du message user est ici, dans ce JSON. Le code ne fera pas de regex ni de fallback métier.",
    "Une carte de defense sert aux moments de risque: impulsion, rechute, tentation, fatigue, stress, habitude qui embarque, moment ou la personne peut deraper.",
    "Si le user demande explicitement une carte de defense mais décrit un problème de demarrage, ne bascule pas automatiquement vers attaque: mets tool_fit.status='unclear' et demande s'il veut couvrir un moment de craquage avec une defense ou plutot demarrer avec une attaque.",
    "Tu dois identifier ou mettre à jour: tool_fit, attachment, risk_situation, trigger, defense_goal, defense_response_hint, contraintes, slots manquants, message court a envoyer au user.",
    "Si operation_input.previous_draft existe, tu es dans le sous-skill draft_validation: dans le meme JSON, remplis state_patch.draft_validation.decision avec approve|reject|revise|explain|topic_change|unclear.",
    "Dans draft_validation, approve veut dire que le user demande clairement d'appliquer/creer la carte maintenant; reject refuse; revise corrige ou demande de reproposer; explain demande des details; topic_change sort du brouillon; unclear ne suffit pas.",
    "Dans draft_validation, si le user dit oui a une demande de preparer/montrer/reformuler le brouillon, ce n'est pas approve: c'est revise tant qu'il ne demande pas explicitement la creation.",
    "Dans draft_validation, si le user donne une correction exacte puis dit d'appliquer, classe revise si le brouillon doit d'abord intégrer cette correction.",
    "Si operation_input.attachment_candidate existe, tu es dans la validation d'attache: si le user accepte ce candidat, copie-le dans state_patch.attachment avec status identified; s'il le refuse, mets attachment.status missing et pose une nouvelle question; s'il corrige, identifie la nouvelle attache depuis son message.",
    "Pour une carte de defense, le minimum metier est: l'action/contexte a proteger, le moment precis ou ca craque, et le piege concret qui embarque le user (ce qui se passe en fait / pourquoi il cede).",
    "Si la cible est seulement inferee depuis le plan_snapshot sans etre nommee par le user, demande confirmation dans generated_user_message au lieu de generer directement.",
    "Si le moment ou le piege n'est pas clair, pose une question explicite: qu'est-ce qui se passe exactement au moment ou ca craque, et pourquoi ca t'embarque ?",
    "Les messages user doivent être courts et naturels pour WhatsApp. Pas de pavé.",
    'Tu tutoies toujours l\'utilisateur dans generated_user_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand generated_user_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_prepare_defense_card_tool_skill_slots",
    required_json_shape: {
      current_step:
        "attachment_intake|risk_intake|response_design|draft_generation|draft_validation|confirmation",
      state_patch: {
        tool_fit: {
          status: "defense|attack_better|unclear",
          reason: "string|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        attachment: {
          status: "missing|ambiguous|identified",
          kind: "plan_item|personal_action|free_risk_context|recurring_context",
          plan_item_id: "string|null",
          title: "string",
          candidates: [{
            kind: "plan_item",
            plan_item_id: "string",
            title: "string",
            confidence: 0.0,
            evidence: ["string"],
          }],
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        risk_situation: {
          status: "missing|ambiguous|identified",
          label: "string|null",
          description: "string|null",
          timing_hint: "string|null",
          context_hint: "string|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        trigger: {
          status: "missing|ambiguous|identified",
          type:
            "temptation|impulse|emotional_drop|social_context|fatigue|stress|habit_loop|avoidance",
          confidence: 0.0,
          evidence: ["string"],
        },
        defense_goal: {
          status: "missing|identified",
          value:
            "avoid_relapse|interrupt_impulse|protect_action|leave_context|reduce_damage",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        defense_response_hint: {
          status: "missing|ambiguous|identified",
          strategy_hint:
            "delay|leave_context|replace_action|contact_support|environment_block|self_talk|unknown",
          value: "string|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        constraints: ["string"],
        draft_validation: {
          decision: "approve|reject|revise|explain|topic_change|unclear",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        missing_slots: ["string"],
        generated_user_message: "string|null",
        confidence: "low|medium|high",
      },
      missing_slots: ["string"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    current_user_message: input.message,
    recent_messages: input.recent_messages ?? [],
    plan_snapshot: input.plan_snapshot ?? {},
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.1,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "prepare_defense_card.slot_filler",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeDefenseCardSlotFillerOutput(raw);
}
