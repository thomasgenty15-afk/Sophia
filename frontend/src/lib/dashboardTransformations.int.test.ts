import { describe, expect, it } from "vitest";

import type { UserTransformationRow } from "../types/v2";
import {
  isVisibleTransformationStatus,
  resolveDashboardTransformations,
} from "./dashboardTransformations";

function makeTransformation(
  id: string,
  status: UserTransformationRow["status"],
  overrides: Partial<UserTransformationRow> = {},
): UserTransformationRow {
  return {
    id,
    cycle_id: "cycle-1",
    priority_order: 1,
    status,
    title: id,
    internal_summary: `${id} summary`,
    user_summary: `${id} user summary`,
    success_definition: null,
    main_constraint: null,
    ordering_rationale: null,
    questionnaire_schema: null,
    questionnaire_answers: null,
    completion_summary: null,
    handoff_payload: null,
    base_de_vie_payload: null,
    unlocked_principles: null,
    created_at: "2026-04-20T08:00:00.000Z",
    updated_at: "2026-04-20T08:00:00.000Z",
    activated_at: status === "active" ? "2026-04-20T08:00:00.000Z" : null,
    completed_at: status === "completed" ? "2026-04-20T08:00:00.000Z" : null,
    ...overrides,
  };
}

describe("isVisibleTransformationStatus", () => {
  it("keeps completed transformations visible for non-scope flows", () => {
    expect(isVisibleTransformationStatus("completed")).toBe(true);
  });
});

describe("resolveDashboardTransformations", () => {
  it("keeps completed transformations out of dashboard scopes", () => {
    const completed = makeTransformation("t-completed", "completed");
    const active = makeTransformation("t-active", "active");
    const ready = makeTransformation("t-ready", "ready");

    const result = resolveDashboardTransformations({
      transformations: [completed, active, ready],
      cycleActiveTransformationId: null,
      selectedTransformationId: "t-completed",
    });

    expect(result.visibleTransformations.map((item) => item.id)).toEqual([
      "t-completed",
      "t-active",
      "t-ready",
    ]);
    expect(result.navigableScopeTransformations.map((item) => item.id)).toEqual([
      "t-active",
    ]);
    expect(result.activeTransformation?.id).toBe("t-active");
    expect(result.transformation?.id).toBe("t-active");
    expect(result.nextTransformation?.id).toBe("t-ready");
  });

  it("does not fallback to completed when no active scope remains", () => {
    const completed = makeTransformation("t-completed", "completed");
    const pending = makeTransformation("t-pending", "pending");

    const result = resolveDashboardTransformations({
      transformations: [completed, pending],
      cycleActiveTransformationId: "t-completed",
      selectedTransformationId: "t-completed",
    });

    expect(result.navigableScopeTransformations).toEqual([]);
    expect(result.activeTransformation).toBeNull();
    expect(result.transformation).toBeNull();
    expect(result.nextTransformation?.id).toBe("t-pending");
  });

  it("prioritizes the explicit multi-part next transformation over another pending one", () => {
    const active = makeTransformation("t-current", "active", {
      priority_order: 3,
      handoff_payload: {
        onboarding_v2: {
          plan_type_classification: {
            journey_strategy: {
              mode: "two_transformations",
            },
          },
          multi_part_journey: {
            is_multi_part: true,
            part_number: 1,
            estimated_total_parts: 2,
            next_transformation_id: "t-part-2",
          },
        },
      },
    });
    const unrelatedPending = makeTransformation("t-pending", "pending", {
      priority_order: 2,
    });
    const sequencedDraft = makeTransformation("t-part-2", "draft", {
      priority_order: 4,
    });

    const result = resolveDashboardTransformations({
      transformations: [unrelatedPending, active, sequencedDraft],
      cycleActiveTransformationId: active.id,
      selectedTransformationId: active.id,
    });

    expect(result.transformation?.id).toBe(active.id);
    expect(result.nextTransformation?.id).toBe(sequencedDraft.id);
  });
});
