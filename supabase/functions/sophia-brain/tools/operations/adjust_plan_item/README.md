Adjust plan Tool Skill target for S6.

This Tool Skill is intentionally split into five internal sub-skills:

1. `scope_router`
   Decides whether the user is talking about one action, the current level, or the whole plan.

2. `action_intake`
   Fills the action-specific adjustment payload after `scope_router` selects `specific_plan_item`.

3. `level_intake`
   Fills the current-level payload after `scope_router` selects `current_level`. It must preserve the global plan boundary unless the user explicitly asks for a whole-plan change.

4. `whole_plan_intake`
   Fills the whole-plan payload after `scope_router` selects `whole_plan`. It must preserve the global objective when requested and collect enough reason/change-target detail before generation.

5. `draft_validation`
   Runs after draft generation. It blocks confirmation until the draft contains enough concrete, materialized examples to explain what will change.

`operation_type` remains `adjust_plan_item` because it identifies the executor/tool family. The conversational taxonomy is Tool Skill / sub-skill.

Progression order:

1. `scope`
2. `reason_change`
3. `change_target`
4. `constraints`
5. `affected_items`
6. `draft_generation`
7. `draft_validation`
8. `user_confirmation`
9. `execution`
10. `closure`

Minimum generation contracts:

- Action: identified plan item, adjustment type, reason, constraints. `reduce` creates a bridge action and preserves the original action after it unless the user explicitly asks to replace/remove it.
- Level: reason change, change target, constraints, and concrete affected items before execution. The draft must prove that the whole plan is not modified.
- Whole plan: global reason change, global change target, preserved intent, and concrete examples of impact before confirmation.

Slot filling:

- `workflow.ts` contains the global Tool Skill progression contract, stage order, sub-skill registry, minimum ready slots, and draft review state.
- `slot_filler.ts` contains the AI slot-filling prompt and JSON contract.
- `runAdjustPlanItemIntake` accepts an injectable `slot_filler` for tests and controlled runtime use.
- Runtime AI slot filling can be enabled with `SOPHIA_ADJUST_PLAN_AI_SLOT_FILLING=1`.
- If the AI slot filler is unavailable, the deterministic fallback still keeps the Tool Skill safe and asks for missing slots instead of applying a patch.

Validation:

- `draft_validation` blocks confirmation when materialized examples are missing, when a level draft touches the global plan, when the confirmation message claims execution before confirmation, or when user-facing messages contain technical JSON vocabulary.

Legacy perimeter still in `legacy_intake.ts`:

- semantic transition guards and non-AI fallbacks used only to keep existing QA flows stable;
- scope-specific slot completion for `specific_plan_item`, `current_level`, and `whole_plan` while `structured_intake.ts` is expanded;
- generator input mapping for action/level/whole-plan payloads;
- deterministic draft fallbacks for current-level load and copy-forward cases;
- draft materialization validation and weekly-review compatibility bridges;
- safety behavior for missing slots and draft generation confirmation.

Extraction target order:

1. move scope completion to `scope_resolver.ts`;
2. move generator input mapping and deterministic fallback selection to `draft_builder.ts`;
3. move draft validation bridges to `confirmation.ts`;
4. keep visible text in `renderer.ts`;
5. keep DB effects in `effects.ts` / `materializer.ts`.
