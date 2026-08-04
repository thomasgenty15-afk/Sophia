# Rubric: plan_fidelity

**id:** `plan_fidelity`
**blocking:** no (a failure here is a quality defect, not a product-level breach)
**authority:** `docs/keel/CONTRACT.md` — R6 named evaluator branches, "`unknown` is first-class
and excluded from the denominator", "Two numbers, never merged" (coverage vs adherence), display
gate `coverage < 4/7 ⇒ insufficient_data`.

## What this rubric judges

Whether the turn represents the **coach's plan and the student's record accurately**: right line,
right day, right slot, right vocabulary, and the right silence where the system does not know.

## FAIL — any one of these is a failure

1. **Wrong line or wrong slot.** The turn talks about a commitment that is not the one the
   student raised, or attributes an event to a slot the plan does not anchor it to (a breakfast
   log answered as if it settled the dinner line).
2. **Wrong day.** "Tomorrow" resolved to the wrong date, a weekly line treated as daily, a
   scheduled day the coach did not write.
3. **Silence read as failure.** Treating a day with no log as a missed day. A day not logged is
   not a day failed: it is `unknown`, and `unknown` stays out of the denominator.
4. **Merging the two numbers.** Reporting coverage as adherence or vice versa; "you're at 60 %"
   when 60 % is the share of days logged.
5. **A percentage below the gate.** Any adherence percentage when fewer than 4 of 7 days are
   logged. The correct output there is `insufficient_data` and no number at all.
6. **Grading a `capture` line by its captured value.** For `polarity='capture'`, the capture is
   what is evaluated, never what was captured.
7. **Auto-crediting.** Inferring a micronutrient from a food log, inferring a fasting window from
   silence, or converting a photo into a quantity.
8. **Ignoring a declared deviation.** A `planned_deviation` declared in advance yields
   `not_applicable`; scoring it as a miss is a fail.
9. **Losing the coach's words.** Paraphrasing a `plan_guidance` line the student asked about
   instead of quoting it, when the case supplies the verbatim text.

## PASS — these are correct and must not be marked down

- "I don't know" where the record is `unknown`.
- Reporting coverage and adherence as two separate things.
- Refusing to give a percentage under the gate and saying why.
- Naming the slot and the day explicitly when confirming.
- Quoting the coach verbatim, with attribution.
- Reporting a portion band (`small` / `moderate` / `large` / `unclear`) instead of a quantity.

## Evidence requirement

A `fail` verdict MUST quote the inaccurate sentence **verbatim** and name the field of
`plan_context` or `known_state` it contradicts.

## Severity

- `major` — a percentage under the gate, silence graded as a miss, auto-crediting, wrong line.
- `minor` — imprecise slot or day wording that does not change what was recorded.
