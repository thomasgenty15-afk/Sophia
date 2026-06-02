import type {
  AdjustPlanHandoffDraft,
  AdjustPlanScopeKind,
} from "./contract.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function sentence(value: unknown, fallback = ""): string {
  const cleaned = text(value, fallback)
    .replace(/\s+([.,])/g, "$1")
    .replace(/\s*([!?;:])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/u, "")
    .trim();
  return cleaned || fallback;
}

function list(values: unknown, fallback: string[]): string[] {
  const items = Array.isArray(values)
    ? values.map((item) => text(item)).filter(Boolean)
    : [];
  return items.length ? items : fallback;
}

function userFacingRecommendation(value: unknown, fallback: string): string {
  let cleaned = text(value, fallback)
    .replace(/\b[Ll]e sous-skill doit(?: surtout)?\s*/g, "")
    .replace(/\b[Ll]a réponse coach doit\s*/g, "")
    .replace(/\b[Ll]a bonne posture est de\s*/g, "")
    .replace(/\b[Oo]rienter la réponse vers\s+/g, "Je te conseille ")
    .replace(/\b[Oo]rienter la réponse\s*:\s*/g, "")
    .replace(
      /\b[Tt]raiter cela comme\s*/g,
      "Je te conseille de traiter cela comme ",
    )
    .replace(/\b[Gg]arder une posture de\s*/g, "Je te conseille de garder ")
    .replace(/\b[Pp]roposer un cadrage simple\s*:\s*/g, "")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  cleaned = cleaned.replace(
    /\bdoit d'abord confirmer\b/g,
    "commence par confirmer",
  ).replace(
    /\bdoit surtout distinguer\b/g,
    "distingue",
  ).trim();
  return cleaned || fallback;
}

function userFacingListItem(value: unknown, fallback: string): string {
  let cleaned = text(value, fallback)
    .replace(/^Ne pas traiter cela comme\s+/i, "Éviter de traiter cela comme ")
    .replace(/^Ne pas\s+([aeiouhàâéèêëîïôùûü])/i, "Éviter d'$1")
    .replace(/^Ne pas\s+/i, "Éviter de ")
    .replace(/^Eviter de\s+/i, "Éviter de ")
    .replace(/^Éviter\s+(?!d['’]|de\b)/i, "Éviter de ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/^Éviter\b/i.test(cleaned)) {
    cleaned = userFacingRecommendation(cleaned, cleaned);
  }
  return cleaned
    .replace(
      /\bÉviter de Je te conseille de traiter cela comme\b/gi,
      "Éviter de traiter cela comme",
    )
    .replace(/\bÉviter de Je te conseille\b/gi, "Éviter")
    .replace(/\s+/g, " ")
    .trim();
}

function userFacingList(values: unknown, fallback: string[]): string[] {
  return list(values, fallback).map((item) => userFacingListItem(item, item))
    .filter(Boolean);
}

function guidanceFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const guidance = (operationInput as any)?.coaching_guidance;
  return guidance && typeof guidance === "object"
    ? guidance as Record<string, unknown>
    : null;
}

function genericPreserveList(values: string[]): boolean {
  const normalized = values.map((value) =>
    value.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  );
  return normalized.length <= 1 &&
    normalized.some((value) =>
      value.includes("reste du plan") ||
      value.includes("objectif de fond") ||
      value.includes("elements du plan")
    );
}

function genericAvoidList(values: string[]): boolean {
  const normalized = values.map((value) =>
    value.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  );
  return normalized.length <= 3 &&
    normalized.every((value) =>
      value.includes("objectif global") ||
      value.includes("autres actions") ||
      value.includes("structure complete") ||
      value.includes("changer plus large") ||
      value.includes("tout le plan")
    );
}

function scopePreserveFallback(
  scope: AdjustPlanScopeKind,
  target: string,
): string[] {
  if (scope === "whole_plan") {
    return [
      "l'intention globale du plan",
      "les blocs que tu veux garder",
      "le principe de tester avant de modifier durablement",
    ];
  }
  if (scope === "current_level" || scope === "current_week") {
    return [
      "le niveau comme repère",
      "l'objectif de fond",
      "la limite temporelle de l'allègement",
    ];
  }
  return [
    `l'intention de ${target}`,
    "le bénéfice utile de l'action",
    "le fait de changer seulement cette cible",
  ];
}

function scopeAvoidFallback(scope: AdjustPlanScopeKind): string[] {
  if (scope === "whole_plan") {
    return [
      "valider un ordre définitif sans l'avoir testé",
      "supprimer ou renommer des blocs sans demande explicite",
      "transformer le réordonnancement en refonte complète",
    ];
  }
  if (scope === "current_level" || scope === "current_week") {
    return [
      "modifier l'objectif du niveau",
      "étendre l'allègement au-delà de la période demandée",
      "convertir une baisse de charge en abandon du niveau",
    ];
  }
  return [
    "abandonner l'action alors que tu veux la garder",
    "changer l'objectif global pour un blocage local",
    "ajouter une structure plus lourde que la version actuelle",
  ];
}

function handoffPreserveList(args: {
  scope: AdjustPlanScopeKind;
  target: string;
  generated: unknown;
  guidance?: Record<string, unknown> | null;
}): string[] {
  const fallback = scopePreserveFallback(args.scope, args.target);
  const fromGenerated = userFacingList(args.generated, fallback);
  const fromGuidance = userFacingList(args.guidance?.preserve, []);
  if (
    fromGuidance.length &&
    (genericPreserveList(fromGenerated) ||
      fromGuidance.length > fromGenerated.length)
  ) {
    return fromGuidance;
  }
  return fromGenerated.length ? fromGenerated : fallback;
}

function handoffAvoidList(args: {
  scope: AdjustPlanScopeKind;
  generated: unknown;
  guidance?: Record<string, unknown> | null;
}): string[] {
  const fallback = scopeAvoidFallback(args.scope);
  const fromGenerated = userFacingList(args.generated, fallback);
  const fromGuidance = userFacingList(args.guidance?.avoid, []);
  if (
    fromGuidance.length &&
    (genericAvoidList(fromGenerated) ||
      fromGuidance.length > fromGenerated.length)
  ) {
    return fromGuidance;
  }
  return fromGenerated.length ? fromGenerated : fallback;
}

function scopeKindFromDraft(
  draft?: PlanAdjustmentDraftV1 | null,
  operationInput?: Record<string, unknown> | null,
): AdjustPlanScopeKind {
  const inputScope = text(
    (operationInput as any)?.scope?.kind ??
      (operationInput as any)?.intake_state?.scope?.kind,
  );
  if (
    inputScope === "specific_plan_item" ||
    inputScope === "action_cluster" ||
    inputScope === "current_week" ||
    inputScope === "current_level" ||
    inputScope === "whole_plan"
  ) {
    return inputScope;
  }
  const resultScope = text(draft?.draft?.adjust_plan_result?.scope);
  if (resultScope === "action") return "specific_plan_item";
  if (resultScope === "level") return "current_level";
  if (resultScope === "whole_plan") return "whole_plan";
  return "unknown";
}

function targetSummary(
  draft?: PlanAdjustmentDraftV1 | null,
  operationInput?: Record<string, unknown> | null,
): string {
  return text(
    (operationInput as any)?.scope?.label ??
      (operationInput as any)?.scope?.target_hint ??
      draft?.draft?.scope_label ??
      draft?.draft?.title,
    "le plan",
  );
}

function changedSummaries(draft?: PlanAdjustmentDraftV1 | null): string[] {
  const changed = draft?.draft?.adjust_plan_result?.applied_change
    ?.changed_items;
  if (!Array.isArray(changed)) return [];
  return changed.map((item: any) => {
    const title = text(item?.title, "Action");
    const after = text(item?.after);
    return after ? `${title}: ${after}` : title;
  }).filter(Boolean);
}

function userFacingObservation(args: {
  scope: AdjustPlanScopeKind;
  value: unknown;
  fallback: string;
}): string {
  const raw = text(args.value, args.fallback);
  const cleaned = raw
    .replace(/\s*;\s*techniquement,?[^.?!]*[.?!]?/gi, ".")
    .replace(/\s*;\s*techniquement,?[^;]*$/gi, ".")
    .replace(/\btechniquement,?\s*/gi, "")
    .replace(
      /\bil manque encore le contenu pr[eé]cis [^.?!]*[.?!]?/gi,
      "",
    )
    .replace(/\bmissing slots?\b/gi, "")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned) return cleaned;
  if (args.scope === "current_level" || args.scope === "current_week") {
    return "Tu veux alléger la période concernée sans abandonner l'objectif du niveau.";
  }
  if (args.scope === "whole_plan") {
    return "Tu veux revoir la trajectoire globale en préservant ce qui fonctionne déjà.";
  }
  return args.fallback;
}

function revisionDetail(value: string): string {
  let detail = sentence(value, "rendre la recommandation plus tenable");
  const cleanupPatterns = [
    /^\s*en fait[, ]*/i,
    /^\s*rends(?:-|\s)?(?:la|le|ça|ca|cela|cette reco|la reco)?\s+(?:encore\s+)?plus\s+(?:l[eé]g[eè]re|leger|simple|prudente?|douce?)\s*:?\s*/i,
    /^\s*rends(?:-|\s)?(?:la|le|ça|ca|cela)?\s*:?\s*/i,
    /^\s*corrige(?:-|\s)?(?:la|le|ça|ca|cela)?\s*:?\s*/i,
    /^\s*plut[oô]t\s+/i,
    /^\s*je veux\s+/i,
    /^\s*je voudrais\s+/i,
  ];
  for (const pattern of cleanupPatterns) {
    detail = detail.replace(pattern, "").trim();
  }
  return sentence(detail, "rendre la recommandation plus tenable");
}

function revisedRecommendation(args: {
  previous: AdjustPlanHandoffDraft;
  request: string;
}): { summary: string; recommended_change: string } {
  const scope = args.previous.scope.kind;
  const target = text(args.previous.scope.target_summary, "la cible concernée");
  const detail = revisionDetail(args.request);
  if (scope === "whole_plan") {
    const summary = `Rends la révision du plan plus prudente : ${detail}.`;
    return {
      summary,
      recommended_change:
        `${summary} Dans Plan, utilise cette version comme un test ou un brief de révision avant de modifier durablement toute la trajectoire.`,
    };
  }
  if (scope === "current_level" || scope === "current_week") {
    const summary = `Limite l'allègement à la période concernée : ${detail}.`;
    return {
      summary,
      recommended_change:
        `${summary} Garde le niveau comme repère et ajuste seulement le volume actuel dans Plan.`,
    };
  }
  const summary = `Passe ${target} sur une version plus légère : ${detail}.`;
  return {
    summary,
    recommended_change:
      `${summary} Garde l'intention de l'action et ajuste seulement cette cible dans Plan.`,
  };
}

export function buildAdjustPlanHandoffDraft(args: {
  draft?: PlanAdjustmentDraftV1 | null;
  operationInput?: Record<string, unknown> | null;
  fallbackSummary?: string | null;
  missingDecisions?: string[];
}): AdjustPlanHandoffDraft {
  const draft = args.draft ?? null;
  const result = draft?.draft?.adjust_plan_result;
  const scopeKind = scopeKindFromDraft(draft, args.operationInput);
  const target = targetSummary(draft, args.operationInput);
  const guidance = guidanceFromOperationInput(args.operationInput);
  const summary = text(
    result?.applied_change?.summary ??
      draft?.draft?.proposed_change ??
      args.fallbackSummary,
    "Ajuster le plan pour le rendre plus tenable.",
  );
  const changed = changedSummaries(draft);
  const generatedPreserve = result?.applied_change?.preserved_items?.map((
    item: any,
  ) => text(item?.title || item?.reason));
  const preserve = handoffPreserveList({
    scope: scopeKind,
    target,
    generated: generatedPreserve,
    guidance,
  });
  const avoid = handoffAvoidList({
    scope: scopeKind,
    generated: result?.boundaries?.explicitly_not_affected,
    guidance,
  });
  const handoffTarget = getHandoffTargetForOperation("adjust_plan_item");
  const destination = handoffTarget?.user_facing_destination ?? "section Plan";
  const platformSteps = scopeKind === "whole_plan"
    ? [
      handoffTarget?.platform_steps[0] ?? "Va dans la section Plan.",
      "Ouvre la vue du plan global.",
      "Utilise cette recommandation comme brief de révision avant de modifier la trajectoire.",
    ]
    : scopeKind === "current_level" || scopeKind === "current_week"
    ? [
      handoffTarget?.platform_steps[0] ?? "Va dans la section Plan.",
      "Ouvre le niveau ou la semaine concernée.",
      "Allège la charge actuelle sans changer l'objectif global.",
    ]
    : [
      handoffTarget?.platform_steps[0] ?? "Va dans la section Plan.",
      `Ouvre ${target}.`,
      "Reprends l'ajustement recommandé seulement sur cette cible.",
    ];

  return {
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    scope: {
      kind: scopeKind,
      target_summary: target,
    },
    user_goal_summary: userFacingRecommendation(
      draft?.draft?.decision_basis?.user_problem ??
        result?.rationale?.user_problem ??
        summary,
      summary,
    ),
    coaching_read: userFacingRecommendation(
      draft?.draft?.why_it_helps ??
        result?.rationale?.why_this_change ??
        "Le bon ajustement doit réduire la friction sans effacer l'intention du plan.",
      "Le bon ajustement doit réduire la friction sans effacer l'intention du plan.",
    ),
    recommendation: {
      summary: userFacingRecommendation(summary, summary),
      recommended_change: userFacingRecommendation(
        changed.length ? changed.join("; ") : summary,
        summary,
      ),
      preserve,
      avoid,
      platform_destination: destination,
      platform_steps: platformSteps,
    },
    missing_decisions: args.missingDecisions ?? [],
  };
}

export function buildAdjustPlanHandoffDraftFromContext(args: {
  userMessage: string;
  operationInput?: Record<string, unknown> | null;
  coachingGuidance?: Record<string, unknown> | null;
}): AdjustPlanHandoffDraft {
  const guidance = args.coachingGuidance ?? {};
  const operationInput = args.operationInput ?? {};
  const scope = scopeKindFromDraft(null, operationInput);
  const target = targetSummary(null, operationInput);
  const recommendation = userFacingRecommendation(
    guidance.recommendation,
    scope === "whole_plan"
      ? "Ajouter une recommandation prudente de trajectoire dans le plan, en préservant l'objectif global."
      : scope === "current_level" || scope === "current_week"
      ? "Alléger temporairement la charge actuelle sans changer l'objectif global."
      : "Alléger la cible concernée en version plus tenable.",
  );
  const observation = text(
    userFacingObservation({
      scope,
      value: guidance.observation,
      fallback: text(
        args.userMessage,
        "La demande vise un ajustement du plan.",
      ),
    }),
    text(args.userMessage, "La demande vise un ajustement du plan."),
  );
  const preserve = handoffPreserveList({
    scope,
    target,
    generated: guidance.preserve,
    guidance,
  });
  const avoid = handoffAvoidList({
    scope,
    generated: guidance.avoid,
    guidance,
  });
  const handoffTarget = getHandoffTargetForOperation("adjust_plan_item");
  const platformSteps = scope === "whole_plan"
    ? [
      handoffTarget?.platform_steps[0] ?? "Va dans la section Plan.",
      "Ouvre la vue du plan global.",
      "Utilise cette recommandation comme brief de révision avant de changer la trajectoire.",
    ]
    : scope === "current_level" || scope === "current_week"
    ? [
      handoffTarget?.platform_steps[0] ?? "Va dans la section Plan.",
      "Ouvre le niveau ou la semaine concernée.",
      "Reprends cette recommandation en allégeant seulement la période concernée.",
    ]
    : [
      handoffTarget?.platform_steps[0] ?? "Va dans la section Plan.",
      `Ouvre ${target}.`,
      "Reprends cette recommandation seulement sur cette cible.",
    ];
  return {
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    scope: {
      kind: scope,
      target_summary: target,
    },
    user_goal_summary: observation,
    coaching_read: text(
      guidance.trajectory_hypothesis,
      "Le bon ajustement doit réduire la friction sans effacer l'intention du plan.",
    ),
    recommendation: {
      summary: recommendation,
      recommended_change: recommendation,
      preserve,
      avoid,
      platform_destination: handoffTarget?.user_facing_destination ??
        "section Plan",
      platform_steps: platformSteps,
    },
    missing_decisions: list(guidance.questions_to_clarify, []),
  };
}

export function reviseAdjustPlanHandoffDraft(args: {
  previous: AdjustPlanHandoffDraft;
  revisionRequest: string;
}): AdjustPlanHandoffDraft {
  const request = text(
    args.revisionRequest,
    "Rendre la recommandation plus légère.",
  );
  const previous = args.previous;
  const revised = revisedRecommendation({ previous, request });
  const preserve = genericPreserveList(previous.recommendation.preserve)
    ? scopePreserveFallback(
      previous.scope.kind,
      text(
        previous.scope.target_summary,
        "la cible concernée",
      ),
    )
    : userFacingList(
      previous.recommendation.preserve,
      scopePreserveFallback(
        previous.scope.kind,
        text(previous.scope.target_summary, "la cible concernée"),
      ),
    );
  const avoid = genericAvoidList(previous.recommendation.avoid)
    ? scopeAvoidFallback(previous.scope.kind)
    : userFacingList(
      previous.recommendation.avoid,
      scopeAvoidFallback(previous.scope.kind),
    );
  return {
    ...previous,
    user_goal_summary: text(
      previous.user_goal_summary,
      "L'utilisateur veut ajuster le plan sans changer l'objectif.",
    ),
    coaching_read: text(
      previous.coaching_read,
      "Le bon ajustement doit réduire la friction sans effacer l'intention du plan.",
    ),
    recommendation: {
      ...previous.recommendation,
      summary: revised.summary,
      recommended_change: revised.recommended_change,
      preserve,
      avoid,
      platform_destination: text(
        previous.recommendation.platform_destination,
        "section Plan",
      ),
      platform_steps: list(previous.recommendation.platform_steps, [
        "Va dans la section Plan.",
        "Ouvre la cible concernée.",
        "Reprends cette version allégée sans changer l'objectif global.",
      ]),
    },
    missing_decisions: [],
  };
}
