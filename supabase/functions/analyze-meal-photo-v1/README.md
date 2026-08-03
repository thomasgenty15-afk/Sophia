# analyze-meal-photo-v1

KEEL W5.3. One stored meal photo in, one updated `protocol_events` row out
(`recognized` + `recognition_confidence`).

Authority: [CONTRACT.md](../../../docs/keel/CONTRACT.md) NON-INPUT #4,
[BUILD_PLAN.md](../../../docs/keel/BUILD_PLAN.md) W5.3.

## What it produces, and what it structurally cannot

A photo may evidence **presence / composition / portion / serving**. It never
produces a `micronutrient`, `energy` or `macro_*` fact, and no calorie count is
ever displayed as a fact.

The reason is not squeamishness, it is measurement: food **identification** from
a photo is reliable (~87-97%), **quantification** is not. So:

| axis | what this function emits |
|---|---|
| foods | `detected_foods[]` with per-item confidence |
| food groups | `food_groups_present[]`, `food_groups_absent[]` (closed slug list) |
| portion | `portion_band`: `small \| moderate \| large \| unclear` — a **token**, never a number |
| plan conformity | `commitment_matches[]`: `consistent \| partial \| inconsistent \| not_visible` |
| calories, macros, grams | **nothing.** No field exists to hold them. |

`quantity` and `unit` are **not** in the UPDATE this function issues. The
evaluator already grades a numberless fact correctly on its own: `partial`
against a numeric target ("something was reported, the level is unknown-in-fact")
and `met` on `presence`/`composition`/`boolean` lines.

## The two filters

Both live in `_shared/keel/meal_analysis.ts` and are proved by
`_shared/keel/meal_analysis_test.ts`.

1. **Anti-hallucination.** `recognized.commitment_id` is the *explicit binding*
   the evaluator's I/O shell reads (`evaluate-adherence-v1/snapshot.ts`), and in
   `matchEvent` an explicit binding wins over every heuristic. A hallucinated
   uuid would therefore write an evaluation onto an arbitrary line of somebody's
   protocol. Every `commitment_id` outside **the day's** commitment list is
   rejected, listed in `rejected_commitment_ids`, and named in `issues`.
2. **Measurement.** Any `calories` / `kcal` / `macro_*` / `protein_g` /
   `nutrition_facts` field is deleted, and any *quantified* energy or macro claim
   in prose ("roughly 700 kcal") is redacted. Every deletion is recorded in
   `dropped_measurement_fields`. Disarm condition: unquantified prose
   ("a protein-rich plate") is untouched — the pattern requires a digit.

## Binding rule (the arbitration)

| situation | `recognized.commitment_id` |
|---|---|
| the student tapped the camera **on** a line | that line (explicit wins) |
| exactly **one** line judged `consistent`/`partial` | that line |
| **two or more** lines | **none**, plus `ambiguous_commitment_ids[]` |
| none, or only `not_visible`/`inconsistent` | none |

Ambiguity binds nothing on purpose. Splitting one photo into N bound facts is
the fan-out cardinality class this repo has already paid for; the full reading
stays in `recognized` either way, and the student can still log the lines by
hand.

## Contract

`POST` with `X-Internal-Secret`.

```jsonc
{
  "protocol_event_id": "uuid",   // required; must be source='photo'
  "base64": "...",               // optional: skip the bucket round-trip
  "mime_type": "image/jpeg",     // required with base64
  "force": false                 // re-analyze an already-analyzed event
}
```

Response (200): `status` (`analyzed` | `already_analyzed`), `binding`,
`commitments_in_context`, `rejected_commitment_ids`,
`dropped_measurement_fields`, `issues`, `recognized`, `recognition_confidence`,
and `student_message` — the one sentence a student may read back (no percentage,
no calorie, no evaluator status word).

**Idempotent.** A re-run on an event that already carries `analysis_version`
returns the stored reading and costs zero model calls. The predicate is a re-read
of the row, not an in-memory flag, so a retry, a redelivery and a manual replay
are all free.

**Write-through.** The UPDATE selects the row back; if the read-back does not
carry the analysis version just written, the function throws instead of
announcing a verdict that is not on file.

## Cost

Model: `_shared/vision.ts` (`KEEL_VISION_MODEL`, default **`gemini-3.1-pro-preview`**).

**Why Pro and not Flash.** Vision is the one place in KEEL where a wrong answer
costs trust rather than tokens: the metric that decides whether a coach keeps
using the product is the false-positive "compliant" rate. Judging a plate
against a prescription is fine-grained visual reasoning — exactly where Pro
separates from Flash.

**MEASURED, not estimated.** `_shared/vision.ts` writes the real `cost_usd` of
every call to `llm_usage_events`. Query:

```sql
select count(*), round(avg(prompt_tokens)) avg_in, round(avg(output_tokens)) avg_out,
       round(avg(cost_usd)::numeric, 6) avg_cost_usd
from public.llm_usage_events where source = 'analyze-meal-photo-v1';
```

| | Flash (previous default) | **Pro (current)** |
|---|---|---|
| input tokens | ~3,600 | ~3,600 |
| output tokens | ~610 | **~160** |
| cost per photo | ~$0.0037 | **~$0.011** |
| per student / month (2-3 photos/day) | ~$0.29 | **~$0.30-0.80** |

> **The price ratio is misleading, and in our favour.** Pro's per-token price is
> several times Flash's, but Pro answered in ~160 output tokens where Flash
> spent ~610 — most of them reasoning tokens billed as output. Net effect on a
> small-image benchmark: **~1.6x, not ~10x**. Against $12 per active student,
> the vision line stays a minor cost.
>
Historical note (Flash): the old overrun was on the OUTPUT side — `gemini-3-flash-preview` is a thinking
> model and its reasoning tokens are billed as output at $0.003/1k. Tightening
> the prompt ("one short sentence, 20 words maximum") was tried and moved the
> output token count by less than 3%, which is what identifies the cause. The
> two real levers are both outside this function: a thinking budget on the
> generation config in `_shared/vision.ts`, or `KEEL_VISION_MODEL=
> gemini-3.1-flash-lite` ($0.00025/1k in, $0.0015/1k out -> ~$0.0018/photo),
> which must be benchmarked for identification accuracy first (W5.5).

Cost controls already in place: the caller rate-limits per user (6 / 10 min,
40 / day on both surfaces); idempotence means a replay is free; a failed vision
call never retries beyond `_shared/vision.ts`'s 2 network retries.

## Known gaps

- **No re-evaluation is triggered.** The analysis writes the fact's payload; the
  derived `commitment_evaluations` row updates on the next
  `evaluate-adherence-v1` pass. Same behaviour as the in-app tap.
- **Allergens are not cross-checked.** `student_safety_constraints` is not
  consulted here; a photo showing a `severity='medical'` allergen produces no
  alert yet. That belt belongs to the safety pass, not to the vision pass.
- **No benchmark yet** (BUILD_PLAN W5.5: 100-150 annotated real photos, metric =
  false-positive "consistent" rate). `rejected_commitment_ids` and
  `dropped_measurement_fields` are emitted in the response precisely so that run
  can count them.
