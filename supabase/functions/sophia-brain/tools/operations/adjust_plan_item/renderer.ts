import type {
  AdjustPlanConstraint,
  AdjustPlanDecision,
  AdjustPlanHandoffDraft,
} from "./contract.ts";
import type { AdjustPlanEffectMaterializationResult } from "./effects.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

function hasCommittedEffect(
  effectResult?: AdjustPlanEffectMaterializationResult | null,
): boolean {
  void effectResult;
  return false;
}

function missingSlotReply(state: AdjustPlanDecision): string {
  const missing = [
    ...state.scope.missing_slots,
    ...state.change.missing_slots,
  ];
  if (missing.includes("scope")) {
    return "Je peux le préparer, mais il me manque la cible exacte du plan à ajuster.";
  }
  if (missing.includes("requested_change")) {
    return "Je peux le préparer, mais il me manque le changement concret que tu veux proposer.";
  }
  return "Je peux le préparer, mais il me manque une précision avant de faire un brouillon fiable.";
}

export function renderAdjustPlanDecision(args: {
  state: AdjustPlanDecision;
  effect_result?: AdjustPlanEffectMaterializationResult | null;
  constraints?: AdjustPlanConstraint[];
}): string {
  const { state, effect_result } = args;
  const noCommitFallback =
    "Tu peux reprendre cet ajustement dans la section Plan; le changement se fait là-bas.";
  if (effect_result?.failed_effects.length) {
    return "Le plan reste inchangé ici. Tu peux reprendre l'ajustement dans la section Plan.";
  }
  if (hasCommittedEffect(effect_result)) {
    return noCommitFallback;
  }
  if (state.intent === "reject_draft" || state.status === "rejected") {
    return "Ok, je laisse cet ajustement de côté. Le plan reste inchangé.";
  }
  if (state.intent === "off_topic" || state.status === "off_topic") {
    return renderNonCommittedReply(state.reply, "");
  }
  if (state.intent === "explain_draft") {
    return renderNonCommittedReply(
      state.reply,
      state.draft.summary ||
        "Je peux expliquer la recommandation et te dire où la reprendre dans Plan.",
    );
  }
  if (
    state.effect_plan.blocked_reason === "missing_slots" ||
    state.scope.missing_slots.length > 0 ||
    state.change.missing_slots.length > 0
  ) {
    return renderNonCommittedReply(state.reply, missingSlotReply(state));
  }
  if (state.draft.available) {
    return renderNonCommittedReply(
      state.reply,
      [
        state.draft.summary ?? "J'ai un brouillon d'ajustement.",
        "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas.",
      ].join("\n\n"),
    );
  }
  return renderNonCommittedReply(
    state.reply,
    noCommitFallback,
  );
}

export function renderAdjustPlanDraftGenerationConfirmationQuestion(): string {
  return "Je peux préparer une recommandation concrète d'ajustement, puis te dire où la reprendre dans la plateforme. Tu veux que je la formule ?";
}

function cleanLine(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\b[Cc]['’]est fait\b/g, "La recommandation est prête")
    .replace(
      /\bj['’]ai (?:modifi[eé]|ajust[eé]|appliqu[eé])\b/gi,
      "je recommande d'ajuster",
    )
    .replace(
      /\bje (?:peux|vais) l['’]?appliquer\b/gi,
      "tu peux le reprendre dans la plateforme",
    )
    .replace(
      /\bdis[- ]moi oui et je le fais\b/gi,
      "reprends cette version dans la plateforme",
    )
    .replace(
      /\bapplique l['’]ajustement recommandé\b/gi,
      "reprends l'ajustement recommandé dans Plan",
    )
    .replace(
      /\bapplique cette version\b/gi,
      "reprends cette version dans Plan",
    )
    .trim();
}

function cleanList(
  values: unknown[] | undefined,
  fallback: string[],
): string[] {
  const cleaned = (values ?? []).map(cleanLine).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

function renderList(values: string[]): string {
  return values.map((value) => `- ${value.replace(/[.。]+$/u, "")}`).join("\n");
}

function handoffClosing(destination: string): string {
  const place = destination.toLowerCase().includes("plan")
    ? "Plan"
    : destination;
  return `Il ne te reste plus qu'à ouvrir ${place} et reprendre cette version là-bas.`;
}

export function renderAdjustPlanHandoffDraft(
  draft: AdjustPlanHandoffDraft,
  options: { compact?: boolean; destinationOnly?: boolean } = {},
): string {
  const target = getHandoffTargetForOperation("adjust_plan_item");
  const destination = cleanLine(
    target?.user_facing_destination ??
      draft.recommendation.platform_destination ??
      "Plan",
  );
  const steps = cleanList(draft.recommendation.platform_steps, [
    ...(target?.platform_steps ?? []),
  ]);
  const preserve = cleanList(draft.recommendation.preserve, [
    "l'objectif de fond",
  ]);
  const avoid = cleanList(draft.recommendation.avoid, [
    "changer tout le plan si le blocage vient seulement de la charge actuelle",
  ]);
  const missing = cleanList(draft.missing_decisions, []);
  if (options.destinationOnly) {
    const destinationBlocks = [
      `Dans Plan : ${destination}.`,
      steps.length ? renderList(steps.slice(0, 2)) : "",
      handoffClosing(destination),
    ];
    return destinationBlocks.filter(Boolean).join("\n\n");
  }
  if (options.compact) {
    const compactBlocks = [
      `À reprendre dans Plan : ${
        cleanLine(draft.recommendation.recommended_change)
      }`,
      `Où : ${destination}.`,
      steps.length ? renderList(steps.slice(0, 2)) : "",
      handoffClosing(destination),
    ];
    if (missing.length) {
      compactBlocks.splice(
        1,
        0,
        `À trancher dans Plan : ${missing.join("; ")}.`,
      );
    }
    return compactBlocks.filter(Boolean).join("\n\n");
  }
  const blocks = [
    `Ce que je comprends : ${cleanLine(draft.user_goal_summary)}`,
    `Ma recommandation : ${cleanLine(draft.recommendation.recommended_change)}`,
    `Pourquoi : ${cleanLine(draft.coaching_read)}`,
    `À préserver :\n${renderList(preserve)}`,
    `À éviter :\n${renderList(avoid)}`,
    `À reprendre dans Plan : ${destination}.\n${renderList(steps)}`,
    handoffClosing(destination),
  ];
  if (missing.length) {
    blocks.splice(
      2,
      0,
      `Point à clarifier avant de le reprendre dans Plan : ${
        missing.join("; ")
      }.`,
    );
  }
  return blocks.filter(Boolean).join("\n\n");
}
