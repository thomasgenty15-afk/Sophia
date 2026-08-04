import { describe, expect, it } from "vitest";

import { resolveOnboardingBackAction } from "./onboardingBackNavigation";

describe("resolveOnboardingBackAction", () => {
  it("returns to the dashboard from a multi-part transition questionnaire", () => {
    expect(resolveOnboardingBackAction({
      entryMode: "add_transformation",
      stage: "questionnaire",
      isMultiPartTransitionFlow: true,
    })).toEqual({ kind: "dashboard" });
  });

  it("returns locally to the questionnaire from a multi-part transition plan review", () => {
    expect(resolveOnboardingBackAction({
      entryMode: "add_transformation",
      stage: "plan_review",
      isMultiPartTransitionFlow: true,
    })).toEqual({ kind: "local_stage_reset", stage: "questionnaire" });
  });

  it("keeps the default server-backed return flow for regular questionnaires", () => {
    expect(resolveOnboardingBackAction({
      entryMode: "default",
      stage: "questionnaire",
      isMultiPartTransitionFlow: false,
    })).toEqual({ kind: "server_stage_reset", stage: "priorities" });
  });
});
