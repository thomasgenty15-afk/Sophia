import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildAllowedAdjustmentSet,
  projectAllowedSetForAi,
} from "./candidate_builder.ts";

function planSnapshot(items: Array<Record<string, unknown>>) {
  return { items };
}

Deno.test("current_level: clarifications and operation_bridge are excluded", () => {
  const set = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      {
        id: "habit-1",
        title: "Sortir marcher 10 min",
        status: "active",
        item_nature: "habit",
      },
      {
        id: "clar-1",
        title: "Pourquoi cette action est importante",
        status: "active",
        dimension: "clarifications",
        item_nature: "clarification",
      },
      {
        id: "bridge-1",
        title: "Mini version brouillon",
        status: "active",
        source_kind: "operation_bridge",
      },
    ]),
    scope_kind: "current_level",
  });
  assertEquals(set.editable_items.length, 1);
  assertEquals(set.editable_items[0].plan_item_id, "habit-1");
  assertEquals(set.excluded_items.length, 2);
  const reasons = set.excluded_items.flatMap((item) => item.permission_reasons);
  if (!reasons.includes("clarification_not_editable")) {
    throw new Error("expected clarification_not_editable in excluded reasons");
  }
  if (!reasons.includes("operation_bridge_excluded")) {
    throw new Error("expected operation_bridge_excluded in excluded reasons");
  }
});

Deno.test("current_level: pending items become conditional when explicitly named", () => {
  const set = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      {
        id: "future-1",
        title: "Faire le choix du brut",
        status: "pending",
        item_nature: "habit",
      },
    ]),
    scope_kind: "current_level",
    signals: {
      user_explicitly_named_titles: ["faire le choix du brut"],
    },
  });
  assertEquals(set.editable_items.length, 0);
  assertEquals(set.conditional_items.length, 1);
  assertEquals(set.conditional_items[0].plan_item_id, "future-1");
  if (!set.conditional_items[0].permission_reasons.includes("explicit_user_target")) {
    throw new Error("expected explicit_user_target in conditional reasons");
  }
});

Deno.test("current_level: pause_level is conditional without explicit signal", () => {
  const set = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "habit-1", title: "Marche", status: "active" },
    ]),
    scope_kind: "current_level",
  });
  const conditional = set.conditional_adjustment_types.map((rule) => rule.value);
  if (!conditional.includes("pause_level")) {
    throw new Error("expected pause_level to be conditional without signal");
  }
});

Deno.test("current_level: pause_level becomes allowed when user explicitly asks for pause", () => {
  const set = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "habit-1", title: "Marche", status: "active" },
    ]),
    scope_kind: "current_level",
    signals: { user_explicit_pause_request: true },
  });
  const allowed = set.allowed_adjustment_types.map((rule) => rule.value);
  if (!allowed.includes("pause_level")) {
    throw new Error("expected pause_level to be allowed with explicit signal");
  }
});

Deno.test("whole_plan: only clarifications are excluded", () => {
  const set = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Marche", status: "active", item_nature: "habit" },
      { id: "m1", title: "Mission future", status: "pending", item_nature: "mission" },
      {
        id: "c1",
        title: "Clarif",
        dimension: "clarifications",
        item_nature: "clarification",
      },
    ]),
    scope_kind: "whole_plan",
  });
  assertEquals(set.editable_items.length, 2);
  assertEquals(set.excluded_items.length, 1);
});

Deno.test("specific_plan_item: only the targeted id is editable", () => {
  const set = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Marche", status: "active" },
      { id: "h2", title: "Lecture", status: "active" },
    ]),
    scope_kind: "specific_plan_item",
    scope_plan_item_id: "h1",
  });
  assertEquals(set.editable_items.length, 1);
  assertEquals(set.editable_items[0].plan_item_id, "h1");
  assertEquals(set.excluded_items.length, 1);
  assertEquals(set.excluded_items[0].plan_item_id, "h2");
});

Deno.test("projectAllowedSetForAi keeps the AI input compact", () => {
  const set = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Marche", status: "active" },
    ]),
    scope_kind: "current_level",
  });
  const projected = projectAllowedSetForAi(set);
  assertEquals(projected.scope_kind, "current_level");
  assertEquals(projected.editable_items.length, 1);
  assertEquals(projected.editable_items[0].plan_item_id, "h1");
  if (!Array.isArray(projected.allowed_adjustment_types)) {
    throw new Error("allowed_adjustment_types should be an array of strings");
  }
});
