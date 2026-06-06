import type { AdjustPlanHandoffDraft } from "./contract.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";

function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function list(values: unknown, fallback: string[]): string[] {
  const items = Array.isArray(values)
    ? values.map((item) => text(item)).filter(Boolean)
    : [];
  return (items.length ? items : fallback).slice(0, 4);
}

function platformInstruction(): string {
  return "Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.";
}

export function buildAdjustPlanPlatformInputDraft(args: {
  userMessage: string;
  previous?: AdjustPlanHandoffDraft | null;
  revisionRequest?: string | null;
  userBlockerSummary?: string | null;
  suggestedPlatformInput?: string | null;
  preserve?: string[];
  avoid?: string[];
  missingClarity?: string[];
}): AdjustPlanHandoffDraft {
  const source = text(
    args.revisionRequest,
    text(args.userMessage, "Je veux rendre mon plan plus tenable."),
  );
  const previous = args.previous ?? null;
  const suggested = text(
    args.suggestedPlatformInput,
    previous?.suggested_platform_input
      ? `${previous.suggested_platform_input} ${source}`
      : `Je veux ajuster mon plan pour le rendre plus simple et plus tenable, sans perdre le cap important. Ce qui bloque : ${source}`,
  );
  return {
    operation_type: "adjust_plan_item",
    mode: "platform_input_coaching",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_blocker_summary: text(
      args.userBlockerSummary,
      previous?.user_blocker_summary ??
        "tu veux rendre ton plan plus tenable sans perdre ce qui compte.",
    ),
    suggested_platform_input: suggested,
    preserve: list(
      args.preserve,
      previous?.preserve ?? [
        "le cap important",
        "ce qui fonctionne déjà",
        "une version humainement tenable",
      ],
    ),
    avoid: list(
      args.avoid,
      previous?.avoid ?? [
        "transformer l'ajustement en abandon",
        "tout refaire si ce n'est pas nécessaire",
        "ajouter une consigne plus lourde que le plan actuel",
      ],
    ),
    destination: {
      product_area: "Plan",
      instruction: platformInstruction(),
    },
    missing_clarity: list(args.missingClarity, []),
  };
}

export function buildAdjustPlanHandoffDraft(args: {
  draft?: PlanAdjustmentDraftV1 | null;
  operationInput?: Record<string, unknown> | null;
  fallbackSummary?: string | null;
  missingDecisions?: string[];
}): AdjustPlanHandoffDraft {
  const summary = text(
    args.fallbackSummary,
    text(
      args.draft?.draft?.decision_basis?.user_problem,
      "Je veux rendre mon plan plus tenable.",
    ),
  );
  return buildAdjustPlanPlatformInputDraft({
    userMessage: summary,
    userBlockerSummary: summary,
    suggestedPlatformInput: text(
      args.draft?.draft?.proposed_change,
      `Je veux ajuster mon plan pour le rendre plus tenable : ${summary}`,
    ),
    preserve: list(
      args.draft?.draft?.decision_basis?.must_preserve,
      ["le cap important", "ce qui fonctionne déjà"],
    ),
    avoid: ["transformer cette demande en exécution depuis le chat"],
    missingClarity: args.missingDecisions ?? [],
  });
}

export function buildAdjustPlanHandoffDraftFromContext(args: {
  userMessage: string;
  operationInput?: Record<string, unknown> | null;
  coachingGuidance?: Record<string, unknown> | null;
}): AdjustPlanHandoffDraft {
  const guidance = args.coachingGuidance ?? {};
  return buildAdjustPlanPlatformInputDraft({
    userMessage: args.userMessage,
    userBlockerSummary: text(guidance.observation, args.userMessage),
    suggestedPlatformInput: text(
      guidance.recommendation,
      `Je veux ajuster mon plan pour qu'il soit plus tenable : ${args.userMessage}`,
    ),
    preserve: list(guidance.preserve, [
      "le cap important",
      "ce qui fonctionne déjà",
    ]),
    avoid: list(guidance.avoid, [
      "tout refaire si ce n'est pas nécessaire",
      "transformer l'ajustement en abandon",
    ]),
    missingClarity: list(guidance.questions_to_clarify, []),
  });
}

export function reviseAdjustPlanHandoffDraft(args: {
  previous: AdjustPlanHandoffDraft;
  revisionRequest: string;
}): AdjustPlanHandoffDraft {
  return buildAdjustPlanPlatformInputDraft({
    userMessage: args.revisionRequest,
    previous: args.previous,
    revisionRequest: args.revisionRequest,
    userBlockerSummary: args.previous.user_blocker_summary,
  });
}
