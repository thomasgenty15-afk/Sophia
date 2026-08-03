# keel_properties

Three properties. Not three examples — three statements that must hold over the whole input space,
asserted by enumeration.

| file | invariant | space covered |
|---|---|---|
| `phantom_ack_property_test.ts` | zero committed effects ⇒ zero acknowledgement | 13 student reports × 11 renderings × the disarm matrix |
| `no_calorie_to_student_property_test.ts` | no energy/macro quantity reaches a student | 19 field shapes × 3 nestings; 6 verdict sets × 4 bands × 3 qualities × 3 confidences × 2 bindings |
| `restriction_no_pressure_property_test.ts` | a flagged student gets no adherence pressure on any channel | 2⁹ surface subsets; 4 dates × 9 slots × 2 plan sizes; 3 conversation lanes |

The schema half of the same three lives in `supabase/tests/keel/w11_property_scenarios.sql`, which
raises rather than echoes.

## Why properties rather than more fixtures

Example tests are answered by example. A lexicon that grows a hole between two chosen inputs stays
green forever, and the hole is found in production. Each file here crosses its corpora and asserts
the invariant, so a red names the exact pair that broke it.

## The rules these files follow

**Every belt states its disarm condition** (doctrine P9). Each property has a companion test
proving the guard does NOT fire when its premise is absent: one committed effect disarms the ack
guard entirely; a clear flag suppresses nothing; non-quantified nutrition vocabulary is never
redacted. A belt with no disarm test is a belt on its way to muting the product — the failure that
is indistinguishable from safety until a coach cancels.

**Falsifiability is asserted, not assumed.** `deriveKeelDayPlan` returning nothing under a raised
flag proves nothing unless the same day with the flag down provisions something. Both directions
are tested, side by side, in every channel that has a behavioural test.

**Wiring is part of the property.** A pure guard nobody calls is a document. `restriction_guard.ts`
was written, tested with 41 cases, and called from nowhere for an entire wave. So each file also
asserts its guard is reached from the runtime that is supposed to reach it.

**A real defect is pinned, never skipped.** Two `PINNED DEFECT` tests live here. They assert the
CURRENT, wrong behaviour and go red the day it is fixed — which is the prompt to come back, delete
the pin, and write the real assertion. Both are listed in `docs/keel/TESTING.md`.

## What is deliberately NOT here

Anything a model has to judge. If a rule can be stated deterministically it belongs in this
directory; the rubrics in `../llm_as_judge/rubrics/` exist only for the ways prose slips around a
rule that cannot be written as a predicate. The judge measures. These files decide.
