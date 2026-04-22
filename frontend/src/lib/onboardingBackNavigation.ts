import type { OnboardingV2Draft } from "./onboardingV2";

export type OnboardingBackAction =
  | { kind: "none" }
  | { kind: "dashboard" }
  | { kind: "local_stage_reset"; stage: OnboardingV2Draft["stage"] }
  | { kind: "server_stage_reset"; stage: OnboardingV2Draft["stage"] };

type ResolveOnboardingBackActionArgs = {
  entryMode: OnboardingV2Draft["entry_mode"];
  stage: OnboardingV2Draft["stage"];
  isMultiPartTransitionFlow: boolean;
};

const DEFAULT_BACK_STAGE_BY_STAGE: Partial<Record<
  OnboardingV2Draft["stage"],
  OnboardingV2Draft["stage"]
>> = {
  validation: "capture",
  priorities: "capture",
  questionnaire_setup: "priorities",
  questionnaire: "priorities",
  profile: "questionnaire",
  plan_review: "profile",
};

export function resolveOnboardingBackAction(
  args: ResolveOnboardingBackActionArgs,
): OnboardingBackAction {
  if (args.isMultiPartTransitionFlow && args.entryMode === "add_transformation") {
    if (args.stage === "questionnaire") {
      return { kind: "dashboard" };
    }
    if (args.stage === "plan_review") {
      return { kind: "local_stage_reset", stage: "questionnaire" };
    }
  }

  const stage = DEFAULT_BACK_STAGE_BY_STAGE[args.stage];
  if (!stage) {
    return { kind: "none" };
  }

  return { kind: "server_stage_reset", stage };
}
