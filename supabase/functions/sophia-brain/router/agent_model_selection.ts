import type { AgentMode } from "../state-manager.ts";
import {
  type DispatcherMemoryPlan,
  type DispatcherModelTierHint,
} from "./dispatcher.ts";
import { getGlobalAiModel } from "../../_shared/gemini.ts";

function envString(name: string, fallback = ""): string {
  let raw = "";
  try {
    const denoEnv = (globalThis as any)?.Deno?.env;
    raw = String(denoEnv?.get?.(name) ?? "").trim();
  } catch {
    return fallback;
  }
  return raw || fallback;
}

export function resolveAgentChatModel(args: {
  effectiveMode: AgentMode;
  memoryPlan?: DispatcherMemoryPlan | null;
  explicitModel?: string | null;
}): {
  model: string;
  source:
    | "explicit_override"
    | "non_companion_default"
    | "companion_default"
    | "memory_plan_lite"
    | "memory_plan_standard"
    | "memory_plan_deep";
  tier: DispatcherModelTierHint | "default" | "explicit";
} {
  const explicitModel = String(args.explicitModel ?? "").trim();
  if (explicitModel) {
    return {
      model: explicitModel,
      source: "explicit_override",
      tier: "explicit",
    };
  }

  const defaultModel = String(getGlobalAiModel("gemini-2.5-flash")).trim();
  if (args.effectiveMode !== "companion") {
    return {
      model: defaultModel,
      source: "non_companion_default",
      tier: "default",
    };
  }

  const plan = args.memoryPlan ?? null;
  const confidence = Number(plan?.plan_confidence ?? 0);
  const hint = String(plan?.model_tier_hint ?? "").trim().toLowerCase();
  const targets = Array.isArray(plan?.targets) ? plan?.targets ?? [] : [];
  const hasSensitiveMemoryTarget = targets.some((target: any) => {
    const key = String(target?.key ?? target?.query_hint ?? "")
      .trim()
      .toLowerCase();
    return key.startsWith("sante.") || key.startsWith("addictions.") ||
      /\b(allerg|medical|sante|santé|douleur|ingredient|ingrédient|restaurant|alcool|whisky|apero|apéro)\b/
        .test(key);
  });
  const hasEntityMemoryTarget = targets.some((target: any) =>
    String(target?.type ?? "").trim() === "entity"
  );
  if (
    confidence < 0.6 ||
    (hint !== "lite" && hint !== "standard" && hint !== "deep")
  ) {
    return {
      model: defaultModel,
      source: "companion_default",
      tier: "default",
    };
  }

  const tierModelMap: Record<DispatcherModelTierHint, string> = {
    lite: envString(
      "SOPHIA_COMPANION_MODEL_LITE",
      "gpt-5.4-nano",
    ),
    standard: envString(
      "SOPHIA_COMPANION_MODEL_STANDARD",
      "gemini-3-flash-preview",
    ),
    deep: envString(
      "SOPHIA_COMPANION_MODEL_DEEP",
      "gemini-3.1-pro-preview",
    ),
  };
  const effectiveHint: DispatcherModelTierHint =
    hint === "lite" && (hasSensitiveMemoryTarget || hasEntityMemoryTarget)
      ? "standard"
      : (hint as DispatcherModelTierHint);

  return {
    model: tierModelMap[effectiveHint],
    source: `memory_plan_${effectiveHint}` as
      | "memory_plan_lite"
      | "memory_plan_standard"
      | "memory_plan_deep",
    tier: effectiveHint,
  };
}
