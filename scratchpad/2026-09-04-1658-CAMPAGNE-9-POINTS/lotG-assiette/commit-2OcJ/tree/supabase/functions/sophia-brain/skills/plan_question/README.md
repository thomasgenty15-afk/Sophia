# `plan_question` — KEEL W4.4

The execution lane of the plan: *"can I swap X for Y?"*, *"I'm at a restaurant"*,
*"I moved a meal"*.

## Why it is not `plan_realignment`

| | `plan_realignment` | `plan_question` |
|---|---|---|
| the student is | disengaged from the plan | following the plan, right now |
| wants | the plan to change | to know what the plan already allows |
| answered by | the coach, later | the coach's `swap_policy`, in two seconds |
| when misrouted | a fork inside the plan becomes a request to rewrite the week | — |

## The two tiers

```
TIER 0  swap_resolver.ts   deterministic, no model, no latency.
        The coach already answered when they set `autonomy` and `swap_policy`.
        Same class + `swap_within_policy` => yes.

TIER 1  escalation.ts      everything else: a `contract_change_requests` row
        with the student's words, Sophia's summary and Sophia's evidence.
        `suggested_option` is a DRAFT and is never applied.
```

`urgency='immediate'` is reserved for `allergen_violation` and
`restriction_signal` — the only two reason codes allowed to bypass the weekly
digest (SCHEMA, DIALOGUE). `assertUrgencyAllowed` throws on any other pairing,
in both directions.

## Parity with the evaluator is the invariant

`swap_resolver.ts` reimplements, rule for rule and in the same order, the swap
branch of `_shared/keel/evaluator.ts`. A Tier-0 "yes" that the evaluator grades
`missed` at 23:59 is worse than no Tier 0: the student followed the answer and
was marked down. `plan_question_test.ts` drives **both modules on the same
matrix** and asserts they agree.

## Runtime wiring — NOT done in this lot

`router/run.ts` belongs to the W4.3 lot, so this skill is complete and tested
but not yet reachable. Three channels must be filled by the runtime:

1. **`routers.ts` gate** — `keel_student: profiles.keel_role === 'student'`,
   read from the DB, never from the turn frame.
2. **`plan_question_runtime` on the skill context** —
   `{ commitment, food_group_classes, safety_constraints, content_locale }`.
   The skill throws if it is missing rather than answering a permission
   question from a plan it did not read. The commitment is resolved from
   `plan_commitments` (by `slot_hint`, then by `prescribed_food_group`), and
   `swap_policy` is extracted from `content` jsonb **by the runtime** — that
   extraction is the R5 frontier and the caller's bug surface.
3. **The write-through** — `diagnosis.contract_change_request` is a row, not a
   write. The runtime inserts it, re-reads it, and only then may the ledger say
   it happened. Nothing in this skill performs I/O.

Also pending: `context/keel_plan_context.ts` must be loaded per turn and passed
to `buildDispatcherPrompt({ keel_plan_context })`. Until it is, the dispatcher
never sees a KEEL plan, never emits `plan_question`, and the lane stays inert —
by construction, not by accident (the prompt only exposes the signal when
`keel_plan_context` is present).

## `allergen_bridge.ts`

A narrow, closed, hand-written map from allergen slug to the `food_groups`
slugs that structurally contain it — not an ontology (CONTRACT refuses those).
Its third state is the point: a medical constraint that is neither a food-group
slug nor a key of the map is **unresolvable**, and Tier 0 then refuses to
auto-approve any substitution. W5 (photo) needs the same bridge; promote it to
`_shared/keel/` at that point rather than copying it.
