import type {
  AdjustPlanConstraint,
  AdjustPlanDecision,
  AdjustPlanHandoffDraft,
} from "./contract.ts";
import type { AdjustPlanEffectMaterializationResult } from "./effects.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

export type AdjustPlanReplyRenderIntent =
  | "start"
  | "revise"
  | "repeat"
  | "apply_attempt"
  | "destination_only";

function cleanLine(value: unknown, fallback = ""): string {
  const cleaned = String(value ?? fallback)
    .replace(/\s+/g, " ")
    .replace(/\b[Cc]['’]est fait\b/g, "")
    .replace(/\bj['’]ai (?:modifi[eé]|ajust[eé]|appliqu[eé])\b/gi, "")
    .replace(/\bje peux l['’]?appliquer\b/gi, "")
    .replace(/\bdis[- ]moi oui et je le fais\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function destinationInstruction(draft: AdjustPlanHandoffDraft): string {
  const target = getHandoffTargetForOperation("adjust_plan_item");
  return cleanLine(
    draft.destination?.instruction,
    target?.platform_steps?.length
      ? target.platform_steps.join(" ")
      : "Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.",
  );
}

function containsPlanDestination(value: string): boolean {
  return /\bPlan\b/i.test(value);
}

function fallbackReply(
  draft: AdjustPlanHandoffDraft,
  intent: AdjustPlanReplyRenderIntent,
): string {
  const suggested = cleanLine(
    draft.suggested_platform_input,
    "Je veux ajuster mon plan pour le rendre plus simple et plus tenable, sans perdre le cap important.",
  );
  const destination = destinationInstruction(draft);
  if (intent === "destination_only") {
    return `${destination} Tu as deja une bonne base a reprendre la-bas.`;
  }
  if (intent === "repeat") {
    return `La phrase a reprendre est : "${suggested}"\n\n${destination}`;
  }
  if (intent === "apply_attempt") {
    return `La formulation est prete, mais l'ajustement se fait dans Plan : "${suggested}"\n\n${destination}`;
  }
  return `Tu peux demander un ajustement dans ce sens : "${suggested}"\n\n${destination}`;
}

export function finalizeAdjustPlanPlatformInputReply(args: {
  draft: AdjustPlanHandoffDraft;
  reply: string | null | undefined;
  intent?: AdjustPlanReplyRenderIntent;
}): string {
  const intent = args.intent ?? "start";
  const destination = destinationInstruction(args.draft);
  let content = cleanLine(args.reply, fallbackReply(args.draft, intent));
  if (!containsPlanDestination(content)) {
    content = `${content}\n\n${destination}`;
  }
  if (
    intent === "apply_attempt" &&
    /\b(?:fait|appliqu[eé]|modifi[eé])\b/i.test(content)
  ) {
    content = fallbackReply(args.draft, "apply_attempt");
  }
  return content.trim();
}

export function renderAdjustPlanHandoffDraft(
  draft: AdjustPlanHandoffDraft,
  options: { compact?: boolean; destinationOnly?: boolean } = {},
): string {
  const intent = options.destinationOnly
    ? "destination_only"
    : options.compact
    ? "repeat"
    : "start";
  return finalizeAdjustPlanPlatformInputReply({
    draft,
    reply: null,
    intent,
  });
}

export function renderAdjustPlanDecision(args: {
  state: AdjustPlanDecision;
  effect_result?: AdjustPlanEffectMaterializationResult | null;
  constraints?: AdjustPlanConstraint[];
}): string {
  void args;
  return renderNonCommittedReply(
    null,
    "Je peux t'aider à formuler une demande d'ajustement à reprendre dans Plan. L'ajustement se fait ensuite dans la plateforme.",
  );
}

export function renderAdjustPlanDraftGenerationConfirmationQuestion(): string {
  return "Je peux t'aider à formuler une demande claire à reprendre dans Plan. Tu veux une version courte à coller là-bas ?";
}
