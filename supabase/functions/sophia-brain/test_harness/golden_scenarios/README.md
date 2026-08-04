# golden_scenarios

The six moments KEEL exists to handle, each with the turns that pass and the turns that must not.

| scenario | the product question |
|---|---|
| `plan_upload_four_pages` | does the import preserve what the coach wrote, including what it cannot resolve? |
| `restaurant_tuesday_night` | can KEEL handle a meal it cannot see without lying or punishing? |
| `five_day_silence` | is an absence of data an absence of data, or a failure? |
| `midweek_plan_change` | when the prescription moves, is the record still described truthfully? |
| `restrictive_signal` | with the flag raised, does every number actually disappear? |
| `mid_plan_goal_reached` | when the reason for the plan ends, who writes the next one? |

## The negatives are the point

Every scenario ships at least one `should_fail` case carrying the rubric that must catch it. A
dataset of only good turns goes green against a judge that says "pass" to everything — the exact
state this harness shipped in before W11. `scenarios_test.ts` asserts:

- every scenario has both a planted breach and a clean turn (otherwise a judge that fails
  everything also scores perfectly);
- every rubric is planted somewhere, so none is left unexercised;
- the bad turns really contain what they claim — the calorie case really has a calorie figure, the
  flag-raised negative really has a percentage, a streak and a weight verdict;
- the clean turn under a raised flag contains **no digit at all**;
- no `should_pass` case announces a commit against an empty ledger, which would teach the judge
  that phantom acknowledgements are fine.

Those run offline, with no key and no network. The model round-trip is `../llm_as_judge/live_test.ts`.

## Writing a new case

Ground truth is supplied, never implied: `committed_effects` is the ledger after the turn (empty
means nothing was written), `plan_context` is what the coach wrote, `restriction_flag` is the
deterministic guard's output. `assertValidCase` rejects the two shapes that silently measure
nothing — a `should_fail` with no expected rubric, and a raised flag with no trigger code.

Write the bad turns the way a real model fails: fluent, warm, plausible, and wrong. "Logged it,
nice work ✅" against an empty ledger is a measured defect from a real run, not a strawman.
