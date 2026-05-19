import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { ATTACK_TECHNIQUES, type AttackTechniqueKey } from "./generator.ts";
import type {
  AttackCardConfidence,
  AttackCardIntakeState,
  AttackCardStep,
} from "./workflow.ts";

export type AttackCardSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  current_state?: AttackCardIntakeState | null;
  operation_input?: Record<string, unknown> | null;
};

export type AttackCardSlotFillerOutput = {
  current_step: AttackCardStep;
  state_patch: Partial<AttackCardIntakeState>;
  draft_review_decision?: {
    decision:
      | "approve"
      | "reject"
      | "revise"
      | "explain"
      | "topic_change"
      | "unclear";
    confidence: AttackCardConfidence;
    evidence: string[];
  };
  missing_slots: string[];
  confidence: AttackCardConfidence;
  generated_user_message?: string | null;
  evidence?: string[];
};

export type AttackCardSlotFiller = (
  input: AttackCardSlotFillerInput,
) => Promise<AttackCardSlotFillerOutput | null>;

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
  if (start < 0 || end <= start) throw new Error("attack_card_slots_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("attack_card_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): AttackCardConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function step(value: unknown): AttackCardStep {
  const raw = String(value ?? "").trim();
  return [
      "target_intake",
      "technique_selection",
      "keyword_intake",
      "draft_generation",
      "draft_validation",
      "confirmation",
    ].includes(raw)
    ? raw as AttackCardStep
    : "target_intake";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeTechnique(value: unknown): AttackTechniqueKey | null {
  const raw = String(value ?? "").trim();
  return raw in ATTACK_TECHNIQUES ? raw as AttackTechniqueKey : null;
}

function normalizeTechniqueOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: any) => {
    const technique = normalizeTechnique(entry?.technique_key);
    if (!technique) return [];
    return [{
      technique_key: technique,
      title: String(entry?.title ?? ATTACK_TECHNIQUES[technique].title),
      description: String(
        entry?.description ?? ATTACK_TECHNIQUES[technique].pour_quoi,
      ),
      reason: String(entry?.reason ?? "").trim(),
      example: String(entry?.example ?? ATTACK_TECHNIQUES[technique].example),
      recommended: Boolean(entry?.recommended),
    }];
  }).slice(0, 3);
}

function normalizeStatePatch(value: unknown): Partial<AttackCardIntakeState> {
  const root = objectValue(value);
  if (!root) return {};
  const patch: Partial<AttackCardIntakeState> = {};
  const target = objectValue(root.target);
  if (target) {
    const status = target.status === "identified" ||
        target.status === "missing" || target.status === "ambiguous"
      ? target.status
      : "missing";
    patch.target = status === "identified"
      ? {
        status,
        kind: target.kind === "personal_action"
          ? "personal_action"
          : "plan_item",
        plan_item_id: target.plan_item_id == null
          ? null
          : String(target.plan_item_id),
        title: String(target.title ?? "").trim(),
        confidence: confidence(target.confidence),
        evidence: stringArray(target.evidence),
      }
      : {
        status,
        kind: "unknown",
        candidates: Array.isArray(target.candidates)
          ? target.candidates.flatMap((candidate: any) => {
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
          : undefined,
        confidence: confidence(target.confidence),
        evidence: stringArray(target.evidence),
      };
  }
  const technique = objectValue(root.technique);
  if (technique) {
    const status = technique.status === "identified" ||
        technique.status === "missing" || technique.status === "ambiguous"
      ? technique.status
      : "missing";
    patch.technique = {
      status,
      value: normalizeTechnique(technique.value),
      explicitly_requested: Boolean(technique.explicitly_requested),
      fit_warning: technique.fit_warning == null
        ? null
        : String(technique.fit_warning).trim() || null,
      options: normalizeTechniqueOptions(technique.options),
      confidence: confidence(technique.confidence),
      evidence: stringArray(technique.evidence),
    };
  }
  const activationKeyword = objectValue(root.activation_keyword);
  if (activationKeyword) {
    const status = [
        "not_applicable",
        "missing",
        "ambiguous",
        "identified",
      ].includes(String(activationKeyword.status ?? ""))
      ? String(activationKeyword.status) as
        | "not_applicable"
        | "missing"
        | "ambiguous"
        | "identified"
      : "missing";
    patch.activation_keyword = {
      status,
      value: activationKeyword.value == null
        ? null
        : String(activationKeyword.value).trim() || null,
      options: stringArray(activationKeyword.options).slice(0, 3),
      rejected_value: activationKeyword.rejected_value == null
        ? null
        : String(activationKeyword.rejected_value).trim() || null,
      confidence: confidence(activationKeyword.confidence),
      evidence: stringArray(activationKeyword.evidence),
    };
  }
  const blocker = objectValue(root.blocker);
  if (blocker) {
    const blockerType = String(blocker.type ?? "");
    patch.blocker = {
      type: [
          "avoidance",
          "procrastination",
          "action_too_heavy",
          "unclear_first_step",
          "low_energy",
          "friction",
          "mixed",
        ].includes(blockerType)
        ? blockerType as any
        : "mixed",
      confidence: Math.max(0, Math.min(1, Number(blocker.confidence ?? 0.5))),
      evidence: stringArray(blocker.evidence),
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
): AttackCardSlotFillerOutput[
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
      AttackCardSlotFillerOutput["draft_review_decision"]
    >["decision"]
    : "unclear";
  return {
    decision,
    confidence: confidence(root.confidence),
    evidence: stringArray(root.evidence),
  };
}

export function normalizeAttackCardSlotFillerOutput(
  raw: unknown,
): AttackCardSlotFillerOutput {
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

export async function fillAttackCardSlotsWithAi(
  input: AttackCardSlotFillerInput,
): Promise<AttackCardSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le slot filler interne du Tool Skill prepare_attack_card de Sophia.",
    "Tu ne réponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Principe strict: la compréhension du message user est ici, dans ce JSON. Le code ne fera pas de regex ni de fallback métier.",
    "Tu dois identifier ou mettre a jour: cible, technique, mot de bascule si applicable, blocker, contraintes, slots manquants, message court a envoyer au user.",
    "Si operation_input.previous_draft existe, tu es dans le sous-skill draft_validation: dans le meme JSON, remplis state_patch.draft_validation.decision avec approve|reject|revise|explain|topic_change|unclear.",
    "Dans draft_validation, approve veut dire que le user demande clairement d'appliquer/creer la carte maintenant; reject refuse; revise corrige ou demande de reproposer; explain demande des details; topic_change sort du brouillon; unclear ne suffit pas.",
    "Dans draft_validation, si le user dit oui a une demande de preparer/montrer/reformuler le brouillon, ce n'est pas approve: c'est revise tant qu'il ne demande pas explicitement la creation.",
    "Dans draft_validation, si le user donne une correction exacte puis dit d'appliquer, classe revise si le brouillon doit d'abord intégrer cette correction.",
    "Les techniques autorisées viennent de la source de vérité fournie. Ne crée jamais une technique hors enum.",
    "Quand tu proposes des techniques au user, affiche uniquement les titres exacts de attack_techniques_source_of_truth[technique_key].title. Ne raccourcis pas et ne renomme pas les techniques.",
    "Chaque option proposée doit garder son technique_key exact avec le title exact correspondant.",
    "Ne choisis pas une technique d'office si le user ne l'a pas demandée explicitement et si plusieurs options sont plausibles: propose 2-3 options pertinentes.",
    "Mot de bascule convient surtout si le user risque de craquer, abandonner, esquiver ou a besoin d'un mot court a envoyer a Sophia.",
    "Si le user corrige un champ, conserve les autres champs déjà valides dans l'état.",
    "Si operation_input.target_candidate existe, tu es dans la validation de cible: si le user accepte ce candidat, copie-le dans state_patch.target avec status identified; s'il le refuse, mets target.status missing et pose une nouvelle question; s'il corrige, identifie la nouvelle cible depuis son message.",
    "Si des slots manquent, generated_user_message doit contenir une question WhatsApp courte.",
    'Tu tutoies toujours l\'utilisateur dans generated_user_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand generated_user_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Retourne uniquement du JSON valide.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_prepare_attack_card_tool_skill_slots",
    required_json_shape: {
      current_step:
        "target_intake|technique_selection|keyword_intake|draft_generation|draft_validation|confirmation",
      state_patch: {
        target: {
          status: "missing|ambiguous|identified",
          kind: "plan_item|personal_action|unknown",
          plan_item_id: "string|null",
          title: "string",
          confidence: "low|medium|high",
          evidence: ["string"],
          candidates: [{
            plan_item_id: "string",
            title: "string",
            confidence: 0.7,
            evidence: ["string"],
          }],
        },
        technique: {
          status: "missing|ambiguous|identified",
          value: Object.keys(ATTACK_TECHNIQUES),
          explicitly_requested: "boolean",
          fit_warning: "string|null",
          options: [{
            technique_key: Object.keys(ATTACK_TECHNIQUES),
            title: "string",
            description: "string",
            reason: "string",
            example: "string",
            recommended: "boolean",
          }],
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        activation_keyword: {
          status: "not_applicable|missing|ambiguous|identified",
          value: "string|null",
          options: ["string"],
          rejected_value: "string|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        blocker: {
          type:
            "avoidance|procrastination|action_too_heavy|unclear_first_step|low_energy|friction|mixed",
          confidence: 0.7,
          evidence: ["string"],
        },
        constraints: ["string"],
        draft_validation: {
          decision: "approve|reject|revise|explain|topic_change|unclear",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        missing_slots: ["target|technique|activation_keyword"],
        confidence: "low|medium|high",
        generated_user_message: "string|null",
      },
      missing_slots: ["target|technique|activation_keyword"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    message: input.message,
    recent_messages: input.recent_messages ?? [],
    plan_snapshot: input.plan_snapshot ?? null,
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
    attack_techniques_source_of_truth: ATTACK_TECHNIQUES,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.12,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "prepare_attack_card.slot_filler",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeAttackCardSlotFillerOutput(raw);
}
