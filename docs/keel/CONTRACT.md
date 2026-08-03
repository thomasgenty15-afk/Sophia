# KEEL — Contract

> **This file is the authority.** Every KEEL module, migration, prompt and test cites these rules
> by number. A change here is a product decision, not a refactor. If code and this contract
> disagree, the code is wrong.
>
> KEEL = the runtime of the protocol a coach has written. The coach authors the plan; the AI
> executes it, observes facts, and derives adherence. The AI never authors, edits, or pads a
> prescription.

## The three layers

```
PRESCRIPTION  (what the coach wrote)          — plan_templates → plan_versions → plan_commitments
      ↓
FACTS         (what happened, append-only)    — protocol_events, planned_deviations
      ↓
DERIVED       (what it means, recomputable)   — commitment_evaluations, weekly_reviews
```

**Zero incremental counters anywhere in the schema.** Derived state is always recomputable from
facts. This is what makes retroactive correction ("actually I did eat well on Tuesday") possible
without corrupting history. The legacy `current_reps` counter needed three divergent write paths
and a backfill migration (`20260721130000`) — that class of bug is structurally excluded here.

---

## The seven unrecoverable rules

### R1 — Tokens are ASCII English, including inside jsonb
A string is **data** if code compares it, indexes it, or branches on it; it is **content** if only
a human reads it. Data is ASCII `snake_case` English, never translated, never localized —
including keys and values inside jsonb payloads. Content is translated by the render layer.
Enforced by `scripts/ci/token-lint.mjs`.

### R2 — `content_locale` on every row of prose
Every column that stores human prose (commitment titles, student instructions, notes, card bodies,
`source_span.quote`) sits on a row that carries `content_locale text NOT NULL` (BCP-47). A bare
`text` column whose language must be guessed a posteriori is forbidden.

### R3 — Three locales, never merged
- `ui_locale` — buttons, dates, chrome (per user).
- `conversation_locale` — what the AI writes, **persisted on the thread** (without persistence the
  language oscillates across turns; this repo has already paid for that failure mode).
- `content_locale` — the language of a stored artifact (per row, R2).
A coach may write in one language while the student reads another. These three never collapse
into one column.

### R4 — SI storage, display units as a separate axis
Quantities are stored in canonical SI-ish units (g, mg, mcg, ml, min, kg, kcal, °C, IU where
IU is the domain standard). `display_unit_system ('metric'|'imperial')` is a **profile setting,
distinct from locale** — a fr-CA coach may want pounds. Converting at render time loses nothing;
storing `lb` because the coach is American repeats the French-weekday mistake with irreversible
precision loss on top.

### R5 — The evaluator never reads `content` jsonb
If the evaluator needs a value, it is a **column**. `content` jsonb carries display material
(recipe composition, coach notes, swap policy details for render). This is the single rule that
prevents EAV drift — the usual way these schemas die. Proof from this repo: `scheduled_days` is
CHECK-protected while `mission_days` in jsonb carries live French (`"dimanche"`) that no CHECK
can reach.

### R6 — No enum value without a named evaluator branch
Every enum value must be read by a **named branch** of the evaluator, or it does not exist.
This rule killed the `archetype` enum (its 6 values decomposed without remainder into existing
axes). **Single documented exemption:** `activity_class` — zero logic branches; it serves icons,
grouping, coach template libraries, and safety routing only.

Named branches currently defined:
- `polarity='do'` — no fact ⇒ `unknown`.
- `polarity='avoid'` — no fact ⇒ `met` (inverted default); a contrary fact ⇒ `missed`.
- `polarity='capture'` — the **capture** is evaluated, never the captured value.
- `measure='dose'` — sums reported intakes of **the prescribed preparation** (`substance_ref`),
  occasion/day grain, vs target.
- `measure='micronutrient'` — sums **explicitly reported** elemental quantities of
  `substance_ref` across all sources (supplement or food), day/week grain, vs target range.
- `food_group_ref` — matches a logged food fact against the referenced group, resolving
  `class_equivalent` swaps per `swap_policy`.
- `slot_kind='nominal'` — pre-seeded `unknown` at day open; unresolved at day close ⇒ `missed`.
- `slot_kind='opportunistic'` — an evaluation is born when a fact arrives; absence of logging
  produces a **coverage deficit**, never a false `missed`.
- `auto_source` non-null — a silent device feed ⇒ `unknown`, **never** `missed`, and the line is
  excluded from adherence when `counts_toward_adherence=false`.

Evaluator output is **two fields**: `status` (`unknown|met|partial|missed|not_applicable|flex_used`)
× `timing_status` (`on_time|off_window|unknown|not_applicable`). "Done, but at the wrong time"
must be expressible (`met` + `off_window`) — otherwise the circadian coach must choose between a
false `met` and an unjust `missed`.

### R7 — Token mappings fail loudly
Any mapping over a token (`parseDayToken`, `parseUnit`, `t()`, slug lookups) **throws** on unknown
input. It never returns `undefined`, `[]`, or a silent fallback. Two normalizations that disagree
plus one silent drop equals a bug with no error — this repo has a live instance today
(`planSchedule.ts:289-290` returns `[]` for valid `mon..sun` tokens looked up against French keys).
Corollary: `measure IN ('dose','micronutrient')` requires `substance_ref NOT NULL` (CHECK), and an
unknown slug fails the write, loudly.

---

## Doctrine carried over from Sophia (still binding)

- **Execution truth.** Nothing is announced that is not a re-read DB row. Effects flow through
  `requested → allowed/blocked → committed/failed` (effect ledger, default-deny). No "it's
  scheduled" without a committed row.
- **`unknown` is first-class and excluded from the denominator.** A day not logged is not a day
  failed. `unknown` is never overwritten to `met` by silence or inference — this is why
  auto-summing micronutrients from food logs and auto-evaluating fasting windows are refused.
- **Two numbers, never merged.** `coverage` (did they report?) and `adherence` (did they follow?).
  Display gate: coverage < 4/7 ⇒ the coach sees `insufficient_data`, **no percentage**.
- **The student never grades their own paper.** There is no weekly plan ratification by the
  student. Legitimate student latitude lives in `autonomy`, `flex_eligible`, and
  `planned_deviations` (declared **in advance**, eliciting `not_applicable`).
- **The AI escalates, the coach decides.** `contract_change_requests` carries the student's words
  and the AI's evidence; `suggested_option` is a draft, never applied.

## NON-INPUTS of the evaluator

The evaluator must not import or read:

1. **`commitment_relations`** — co-ingestion / separation / cofactor / antagonist relations are
   **render guidance and safety alerts only**. No practitioner grades "taken 90 min apart instead
   of 120" as missed. A test asserts evaluator results are identical with and without relation
   rows, and that the evaluator module does not import the relations module.
2. **`content` jsonb** — R5.
3. **Cross-line deduction** — a logged salmon serving (food line) never produces or influences a
   `micronutrient` evaluation (nutrient line). The two lines are the coach's two distinct
   prescriptions. No nutrient-composition table exists in P0, deliberately.
4. **Photos as quantity sources** — a photo may evidence `presence`/`composition`/`portion`/
   `serving`; it never produces a `micronutrient` or `energy`/`macro_*` fact. Calorie counts are
   never displayed as facts.

## Supplement safety notes (P0) — the coach is the prescriber

> **The provenance gate was REMOVED on 2026-07-28 by product decision.** Until that date, a line
> above a UL or on the interaction watchlist without `provenance='clinician_ordered'` was
> *degraded at render* into an educational food-first suggestion, dose stripped, and the coach
> was offered a "Mark as clinician-ordered" button to buy the prescription back. **The coach is
> the authority on the plan they wrote. KEEL no longer puts a condition in front of it.** The
> prescription reaches the student verbatim, dose included. The risk this accepts is written
> down in [LEGAL.md](LEGAL.md) §5.2, not implied.

Molecule-register lines (`measure IN ('dose','micronutrient')`) carry **reference notes, for the
coach's eyes only**:
- `substance_limits` (seeded from NIH/EFSA ULs). `target > UL` derives `exceeds_ul` — derived,
  never stored as a counter. Note: functional-medicine dosing routinely sits **above** UL
  (D3 5000 IU vs UL 4000) — this is the nominal case, not an edge case, which is precisely why
  the gate that treated it as one had to go.
- Interaction watchlist (`substance_interactions`, narrow seed: St John's wort × CYP450
  substrates, vitamin K × warfarin, iron × levothyroxine, high-dose D × cardiac meds).

A note states the fact and stops: *"Above the NIH upper limit (4000 IU/day)"*,
*"Interaction watchlist: Levothyroxine — separate intake by at least 4 hours"*. Three properties
are **structural**, not a matter of wording, and are pinned by tests:
- **Coach-only.** `renderCoachSafetyNote` has no student branch and no `studentText`. The render
  layer can no longer produce a substitute for a prescription even if a caller asked it to.
- **No verdict.** `SafetyFinding` carries no `degraded`, no `student_text`, and no boolean at all
  for a caller to branch a refusal on. `provenance` is not even an input any more.
- **Informative, not normative.** No "must", no "needs sign-off", no severity word, no alarm
  colour, no control to click. It informs a professional; it does not authorize them.

`provenance` and `requires_clinician_signoff` remain **as columns** (dropping columns referenced
by exports and read paths buys nothing) — inert, at their defaults. See the header of migration
`20260727090000_keel_p0_commitments.sql`.

Safety constraints (`student_safety_constraints`) are **structured identifiers, never prose**
(`allergen_ref`, `substance_ref`, `severity`), loaded every turn, outside the LLM memory path —
an allergy cannot be a probabilistic memory. A deterministic post-generation validator rejects
any output containing a `severity='medical'` token.

## Refused, on the record

Rejected with reasons, so they are not re-litigated casually:
one `measure` per micronutrient (enum explosion — identity lives in `substance_ref`);
auto-summing nutrients from food logs and `auto_evaluated` fasting inference (silence-to-`met`);
recipe structure in columns (practitioners verify presence, not composition);
sequential ordering between commitments ("A before B" — no real plan asked);
grading absorption-timing deviations; nutrient ontology or interaction engine (flat ~40-slug seed
+ narrow watchlist only); weekly plan validation by the student in any form, including as an
option flag; pre-materialized weekly occurrences and auto-rescheduling; `relative` time anchor
(re-openable, additive); per-tenant `slot_vocabulary` (global in P0); white-label (v1);
impersonation of a student by a coach (breaks the `auth.uid()` invariant under 211 policies —
coach access is structurally read-only via `coached_student_ids()`).
