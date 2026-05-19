import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildAllowedAdjustmentSet } from "./candidate_builder.ts";
import { compileAdjustPlanIntent } from "./draft_compiler.ts";

function planSnapshot(items: Array<Record<string, unknown>>) {
  return { items };
}

Deno.test("compiler accepts items present in the editable set", () => {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Faire le choix du brut", status: "active" },
      { id: "h2", title: "Préparer tes alternatives d'avance", status: "active" },
    ]),
    scope_kind: "current_level",
  });
  const result = compileAdjustPlanIntent({
    allowed_set: allowed,
    proposed_affected_item_labels: [
      "Faire le choix du brut",
      "préparer tes alternatives", // loose match
    ],
    proposed_adjustment_type: "reduce_load",
    require_affected_items: true,
  });
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.reason_code}`);
  }
  assertEquals(result.compiled_affected_items.length, 2);
});

Deno.test("compiler rejects an item that is excluded (operation_bridge)", () => {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Marche active", status: "active" },
      {
        id: "b1",
        title: "Mini version brouillon",
        status: "active",
        source_kind: "operation_bridge",
      },
    ]),
    scope_kind: "current_level",
  });
  const result = compileAdjustPlanIntent({
    allowed_set: allowed,
    proposed_affected_item_labels: ["mini version brouillon"],
    proposed_adjustment_type: "reduce_load",
    require_affected_items: true,
  });
  if (result.ok) throw new Error("expected rejection");
  assertEquals(result.reason_code, "items_outside_allowed_set");
  assertEquals(result.rejected_items.length, 1);
  assertEquals(result.rejected_items[0].reason_code, "item_excluded");
});

Deno.test("compiler rejects an item that is conditional (pending without explicit signal)", () => {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      {
        id: "p1",
        title: "Mission future",
        status: "pending",
      },
    ]),
    scope_kind: "current_level",
    signals: {
      user_explicitly_named_titles: ["mission future"],
    },
  });
  const result = compileAdjustPlanIntent({
    allowed_set: allowed,
    proposed_affected_item_labels: ["mission future"],
    proposed_adjustment_type: "reduce_load",
    require_affected_items: true,
  });
  if (result.ok) throw new Error("expected rejection on conditional item");
  assertEquals(result.reason_code, "items_outside_allowed_set");
  assertEquals(
    result.rejected_items[0].reason_code,
    "item_requires_explicit_request",
  );
});

Deno.test("compiler rejects pause_level when no explicit pause signal", () => {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Marche", status: "active" },
    ]),
    scope_kind: "current_level",
  });
  const result = compileAdjustPlanIntent({
    allowed_set: allowed,
    proposed_affected_item_labels: ["Marche"],
    proposed_adjustment_type: "pause_level",
    require_affected_items: true,
  });
  if (result.ok) throw new Error("expected rejection");
  assertEquals(result.reason_code, "adjustment_type_requires_explicit_request");
});

Deno.test("compiler accepts pause_level when explicit pause signal is set", () => {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Marche", status: "active" },
    ]),
    scope_kind: "current_level",
    signals: { user_explicit_pause_request: true },
  });
  const result = compileAdjustPlanIntent({
    allowed_set: allowed,
    proposed_affected_item_labels: ["Marche"],
    proposed_adjustment_type: "pause_level",
    require_affected_items: true,
  });
  if (!result.ok) {
    throw new Error(`expected ok with pause signal, got ${result.reason_code}`);
  }
});

Deno.test("compiler rejects label that does not match any item", () => {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      { id: "h1", title: "Marche", status: "active" },
    ]),
    scope_kind: "current_level",
  });
  const result = compileAdjustPlanIntent({
    allowed_set: allowed,
    proposed_affected_item_labels: ["Faire du sport extreme"],
    proposed_adjustment_type: "reduce_load",
    require_affected_items: true,
  });
  if (result.ok) throw new Error("expected rejection on unmatched label");
  assertEquals(result.rejected_items[0].reason_code, "label_unmatched");
});

Deno.test("compiler reports no_editable_items when set is empty and required", () => {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot([
      {
        id: "c1",
        title: "Clarif",
        dimension: "clarifications",
        item_nature: "clarification",
      },
    ]),
    scope_kind: "current_level",
  });
  const result = compileAdjustPlanIntent({
    allowed_set: allowed,
    proposed_affected_item_labels: [],
    proposed_adjustment_type: "reduce_load",
    require_affected_items: true,
  });
  if (result.ok) throw new Error("expected rejection on empty set");
  assertEquals(result.reason_code, "no_editable_items_available");
});
