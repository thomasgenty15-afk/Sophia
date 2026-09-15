# KEEL — Schema

> Companion to [CONTRACT.md](CONTRACT.md). The contract states the rules; this file states the
> tables. The **acceptance fixtures** at the bottom are the definition of done for the model:
> the schema is valid if and only if every fixture line encodes without an ad-hoc field.
>
> Status: specification. The P0 migration (`keel_p0_commitments.sql`) materializes it. Nothing
> here exists in the database until a human applies the migration.

## Table map

```
TENANCY      coaches · coach_clients · coach_invitations · coach_access_events
PRESCRIPTION plan_documents · plan_templates · plan_versions · plan_commitments
             slot_vocabulary · food_groups · commitment_relations (P1)
FACTS        protocol_events · planned_deviations · upcoming_contexts
DERIVED      commitment_evaluations · weekly_reviews
DIALOGUE     contract_change_requests
SAFETY       student_safety_constraints · substance_limits
CARDS        card_templates · student_cards · card_wins
```

---

## PRESCRIPTION layer

### `plan_templates` — the coach works HERE
The clonable skeleton. The PDF import creates the template **once**; each student is a
clone + diff. Without this table, onboarding 25 clients costs 25 imports + 25 reviews and the
permanent gain is zero.

| column | type | notes |
|---|---|---|
| id, coach_id | uuid | |
| title, description | text | + `content_locale` (R2) |
| default_swap_policy | jsonb | a **policy**, not an enumerated list |
| default_autonomy | `strict\|swap_within_policy\|flexible` | |
| default_flex_allowance | int, default 4 | per week |
| default_adherence_target_pct | int, default 80 | |
| commitments | jsonb | the clonable skeleton (template keys, no student ids) |
| version, status | int, `draft\|active\|archived` | |

### `plan_documents` — the dump
| column | notes |
|---|---|
| id, coach_id, template_id? | |
| storage_path, mime_type, original_filename, page_count | source kept forever |
| ingestion_path | `native_text \| born_digital_pdf \| ocr` |
| ocr_result | jsonb — typed blocks + bbox + inline confidence |
| layout_probe | jsonb — **independent geometric read** (anti column-drift, see CONTRACT) |
| status, parse_error | `uploaded\|parsing\|parsed\|failed` |

### `plan_versions` — the contract published to ONE student
| column | notes |
|---|---|
| id, coach_id, student_id, template_id?, source_document_id? | |
| version, status | `draft\|in_review\|published\|superseded\|archived` — **partial unique index: 1 `published` per student** |
| title, timezone, anchor_week_start, duration_weeks | |
| week_starts_on | `mon` default — **per-tenant; changes the adherence denominator** |
| phase_plan | jsonb `[{phase_id,label,week_from,week_to}]` — calendar-based, coach-authored, never "earned" |
| adherence_target_pct, flex_allowance_per_week | |
| published_at, published_by, supersedes_version_id, notes_for_student | publish **re-seeds in-flight scheduled_checkins** (phantom-commit class) |

### `plan_commitments` — THE CORE
One row = one typed engagement. Four orthogonal axes (see CONTRACT R6 for the named branches).

```sql
id uuid PK, plan_version_id uuid NOT NULL, user_id uuid NOT NULL, coach_id uuid NOT NULL,
template_commitment_key text,            -- join key back to the template

-- AXIS 1 · POLARITY + display class
polarity text NOT NULL CHECK (polarity IN ('do','avoid','capture')),
activity_class text NOT NULL DEFAULT 'other',
  -- nutrition|supplement|movement|recovery|exposure|sleep|mind|measurement|other
  -- R6 exemption: no logic branch; icons, grouping, template library, safety routing

-- AXIS 2 · TIME ANCHOR — columns, never jsonb
anchor_kind text NOT NULL CHECK (anchor_kind IN ('slot','clock','window','free')),
slot_key text REFERENCES slot_vocabulary(key),        -- 'slot'
clock_local time, tolerance_minutes int,              -- 'clock'
window_start_local time, window_end_local time,       -- 'window' (may cross midnight)
-- CHECK: each kind requires its columns and forbids the others

-- AXIS 3 · LEVEL — dose, duration, quantity: one numeric comparator
measure text NOT NULL,
  -- energy|protein|carb|fat|fiber|sodium|water|micronutrient|portion|serving|exchange
  -- |dose|duration|distance|load|reps|count|rpe|scale|clock_time|temperature
  -- |boolean|presence|composition
unit text,   -- kcal|g|mg|mcg|IU|ml|l|min|h|km|kg|capsule|tablet|scoop|portion|serving
             -- |rep|session|celsius|point|hhmm|none
target_op text NOT NULL CHECK (target_op IN ('>=','<=','==','between','any')),
target_min numeric, target_max numeric,
tolerance_pct numeric DEFAULT 10,
substance_ref text,      -- flat ASCII slug, ~40 seed, no ontology
  -- CHECK: measure IN ('dose','micronutrient') => substance_ref NOT NULL  (R7)
food_group_ref text REFERENCES food_groups(slug),   -- read by evaluator (R5-compliant column)

-- AXIS 4 · EVIDENCE
evidence_kind text NOT NULL
  CHECK (evidence_kind IN ('self_report','numeric_entry','photo','device','none_implicit')),
evidence_required boolean NOT NULL DEFAULT false,
auto_source text,        -- whoop|oura|apple_health|cgm|scale|null
counts_toward_adherence boolean NOT NULL DEFAULT true,  -- false => OUTCOME axis, not adherence

-- CADENCE (survives from the original synthesis, unchanged)
evaluation_grain text NOT NULL CHECK (evaluation_grain IN ('occasion','day','week')),
slot_kind text CHECK (slot_kind IN ('nominal','opportunistic')),
scheduled_days text[] CHECK (scheduled_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']),
required_days_per_week int CHECK (required_days_per_week BETWEEN 0 AND 7),  -- DENOMINATOR
expected_occasions_per_day int DEFAULT 1,

-- GOVERNANCE
priority text NOT NULL DEFAULT 'core' CHECK (priority IN ('core','secondary','optional')),
autonomy text NOT NULL DEFAULT 'strict'
  CHECK (autonomy IN ('strict','swap_within_policy','flexible')),
flex_eligible boolean NOT NULL DEFAULT false,
-- INERT since 2026-07-28 (provenance gate removed): kept, defaulted, read by nothing.
provenance text NOT NULL DEFAULT 'coach_educational'
  CHECK (provenance IN ('coach_educational','clinician_ordered')),
requires_clinician_signoff boolean NOT NULL DEFAULT false,

-- CONTENT & TRACE
title text NOT NULL, student_instruction text,   -- verbatim, citable
content jsonb NOT NULL DEFAULT '{}',             -- NEVER read by the evaluator (R5)
content_locale text NOT NULL,                    -- R2
source_span jsonb,                               -- {page, quote, bbox}
phase_id text, auto_generated boolean NOT NULL DEFAULT false,
status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived'))
```

Coherence CHECKs: `grain='occasion' → slot resolution required`;
`slot_kind='nominal' → slot_key <> 'any_meal'`; `polarity='avoid' → grain IN ('day','week')`.
**No `current_*` column anywhere.**

### `slot_vocabulary` — global, one vocabulary for meal and non-meal slots
`key, label_i18n_key, default_local_time, sort_order`. Seed:
`on_waking, breakfast, snack_am, pre_workout, lunch, post_workout, snack_pm, dinner, before_bed,
any_meal, any_time`. Meal and non-meal anchors sharing one vocabulary is where the
nutrition+actions unification materially happens (and gives ~70 % of combination-timing for free:
iron at `on_waking`, calcium at `dinner` = separated, no relation row needed).

### `food_groups`
`slug PK, class, typical_portion, unit, label_i18n_key`. Seeded from **USDA FNDDS** (CC0).
Read by the evaluator (food matching + `class_equivalent` swap resolution) and by `swap_policy`.

### `commitment_relations` — P1, render+safety readers ONLY
```sql
commitment_a uuid NOT NULL, commitment_b uuid NULL,
relation_kind text CHECK (relation_kind IN
  ('co_ingest','separate_by_minutes','requires_cofactor','antagonist')),
param_minutes int NULL,
cofactor_ref text NULL REFERENCES food_groups(slug)   -- "with dietary fat" (no commitment_b)
```
**Sealed out of the evaluator** (CONTRACT non-input #1). Guidance in reminders/digest
("take it with your vitamin-C source") and safety alerts. Never grading.

---

## FACTS layer (append-only)

### `protocol_events`
The renamed `intake_events` — "intake" would lock nutrition into the name of the table 100 % of
the code touches.

| column | notes |
|---|---|
| id, user_id, occurred_at, local_date, slot_key? | |
| source | `photo\|text\|voice\|chat\|quick_tap\|integration\|coach_entry` |
| media_path, recognized jsonb, recognition_confidence | |
| quantity numeric, unit text, substance_ref?, food_group_ref? | what was explicitly reported |
| student_note text (+ content_locale) | **redacted before coach exposure** |
| evidence_weight numeric | photo 1.0 / detailed text 0.8 / 👍 0.4 |
| source_message_id | `UNIQUE partial (user_id, source_message_id)` — idempotence |

### `planned_deviations` — flex declared IN ADVANCE
`user_id, plan_version_id, local_date, slot_key?, kind (restaurant|social|travel|family|work|other),
declared_at, declared_via (chat|weekly_review|app), note, consumed_flex, coach_visible`.
Declared before the event: arms the defense card **3 h ahead**; evaluator emits `not_applicable`
and removes the day/slot from the denominator. Elicited by the Sunday digest (non-blocking,
no state machine — the weekly validation gate does not exist in KEEL).

### `upcoming_contexts`
`user_id, local_date, slot_key?, kind, source, note` — fed by weekly review and chat; arms cards
before the deviation happens.

---

## DERIVED layer (recomputable, never incremented)

### `commitment_evaluations`
```sql
user_id, commitment_id, plan_version_id, local_date, slot_key?, grain,
expected jsonb,                -- snapshot of the target at day-open
observed_value numeric, observed jsonb,
status text CHECK (status IN ('unknown','met','partial','missed','not_applicable','flex_used')),
timing_status text CHECK (timing_status IN ('on_time','off_window','unknown','not_applicable')),
evidence text CHECK (evidence IN
  ('none','self_report','photo','text_log','integration','coach_override','inferred')),
confidence numeric, source_event_ids uuid[],
resolved_at, resolved_by text CHECK (resolved_by IN ('system','student','coach')),
UNIQUE (user_id, commitment_id, local_date, slot_key)
```
No `ordinal`, no 1..7 cap: the key is **(date, slot)** — 4 meals × 7 days = 28 rows, trivially.

### Adherence formula (from the synthesis, unchanged)
```
w(core)=3  w(secondary)=2  w(optional)=1
s(met)=1  s(flex_used)=1  s(partial)=0.5  s(missed)=0
coverage_C   = min(1, |resolved evals| / expected_occasions_per_day)
contribution = w(C) × mean(s) over resolved evals        -- cardinality-neutral
day_score    = Σ contribution·coverage / Σ (w × coverage)
week         = mean(day_score) over evaluable days
```
`unknown`/`not_applicable` excluded from denominators. Honest logging can never score below
hiding. Display gate: `logging_coverage < 4/7 ⇒ insufficient_data`.

### `weekly_reviews`
`plan_version_id NOT NULL` (never average two versions: if republished mid-week,
`plan_version_changed_midweek=true`, two segments, one number per segment).
Coverage, core/overall adherence, evaluable_days, flex used/allowance, self-rated adherence,
`biofeedback jsonb {hunger, energy, sleep, digestion, satiety, stress}`,
`outcomes jsonb {weight_7d_avg, delta, measurements, photos}`, outcome_direction,
top_failing_commitment_id, lapse_context, `risk_band` (matrix: `on_track | watch | at_risk |
disengaged | outcome_mismatch | restriction_flag`), student_narrative, coach_draft_reply.

---

## DIALOGUE

### `contract_change_requests` — the AI escalates, the coach decides
`raised_by (student|sophia|system)`, reason_code (`too_much_food|not_enough_food|schedule_conflict|
dislikes_food|travel|budget|symptom|social_event|allergen_violation|restriction_signal|other`),
student_words, sophia_summary, sophia_evidence, `suggested_option` (**a draft, never applied**),
urgency (`routine|next_digest|immediate`), status, coach_decision.
`allergen_violation` and `restriction_signal` are the only contexts that bypass the weekly digest.

---

## SAFETY

### `student_safety_constraints` — identifiers, never prose
`user_id, kind (allergy|intolerance|medical|religious|dislike), allergen_ref?/substance_ref?,
medication_class?, severity (medical|strict|preference), declared_by (student|coach), notes`.
Loaded **every turn, outside the LLM memory path** (the memorizer runs at midnight and produces
`candidate` items — an allergy cannot be a probabilistic memory). Deterministic post-generation
validator rejects any output containing a `severity='medical'` token.
Includes the narrow interaction watchlist (St John's wort × CYP450, vitamin K × warfarin,
iron accumulation, high-dose D × cardiac meds).

### `substance_limits`
`substance_ref, ul_amount, ul_unit, per ('day'|'week')` — seeded from NIH/EFSA ULs.
`exceeds_ul` is **derived** at validation (`target_min > UL`), never stored.
Since **2026-07-28** it produces a **factual, coach-only reference note** and nothing else: no
degradation, no block, no sign-off. The provenance gate is gone (CONTRACT, LEGAL §5.2).

---

## TENANCY (P3, spec'd now for the freeze)

`coaches`, `coach_clients` (status `invited|active|paused|ended` — **`active` is the billable
seat**; `consent_granted_at` required by CHECK for `active`; partial unique: one live coach per
student), `coach_invitations` (email, `invite_token_hash` sha256 only, expiry; accepted via the
referral-attribution pattern in `handle_new_user`, **not** `inviteUserByEmail`),
`coach_access_events` (server-written audit log, readable by the student).

Coach read access: `coached_student_ids()` — `SECURITY DEFINER STABLE` returning `uuid[]`,
called as `user_id = ANY((SELECT public.coached_student_ids()))` to force the InitPlan (one call
per query, not per row). Tier A: direct SELECT policies on structural tables. Tier B: column-
allowlist `SECURITY DEFINER` views for anything carrying student verbatim (PostgREST grants are
per-role; coach and student are both `authenticated`, so column restriction by policy is
impossible). Memory, safety, conversations, billing: no policy at all — hermetically closed.
**No write policy anywhere: the coach is structurally read-only.**

---

## Not carried over from legacy (deliberate)

- `user_habit_week_plans` + its state machine (`pending_confirmation|confirmed|auto_applied`) —
  weekly validation by the student does not exist in KEEL (the student would grade their own
  paper; the product had already reduced it to a 21 h ratification window before auto-applying
  at 07:00).
- Planning columns of `user_habit_week_occurrences` (`planned_day`, `original_planned_day`,
  `source='auto_rescheduled'`…) — facts live in `protocol_events`; evaluation is derived;
  "what to do with a missed slot" stops being a schema question (grain `week` stays satisfiable
  until Sunday; grain `occasion|day` is simply `missed`).
- `weekly_planning_ai.ts` (one Gemini call per user per week to pick days) — with pinned
  `scheduled_days` or `required_days_per_week` as denominator, there is nothing to compute.
- `target_reps` / `current_reps` and every incremental counter.
- **Migration prerequisite:** re-home `activateDueWeekItemsForUser`
  (sole caller today: `weekly_planning_lifecycle.ts:247`) onto the weekly rollover cron,
  or week unlocking silently breaks.

---

## ACCEPTANCE FIXTURES

> The schema is valid **iff** every line below encodes without an ad-hoc field.
> Columns: title | polarity | class | grain | anchor | measure/unit/op/target | days | evidence | prio

### Fixture 1 — epigenetics / functional-nutrition protocol (the commissioning use case)

| # | title | pol | class | grain | anchor | measure | days | evidence | prio |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Vitamin D3 5000 IU | do | supplement | occasion | slot:breakfast | dose `vitamin_d3` IU >=5000 | 7 | self_report | core |
| 2 | Omega-3 2 g EPA+DHA, any source | do | nutrition | day | free | **micronutrient** `omega3_epa_dha` g >=2 | 7 | self_report | core |
| 3 | Magnesium glycinate 400 mg | do | supplement | occasion | slot:before_bed | dose `magnesium_glycinate` mg >=400 | 7 | self_report | secondary |
| 4 | Cruciferous veg 2 servings/day | do | nutrition | day | slot:any_meal | serving `food_group:cruciferous_veg` >=2, n_exp/day=2 | 7 | photo | core |
| 5 | Fatty fish 3×/week | do | nutrition | week | free | serving `food_group:fatty_fish` >=3, req/7=3 | — | photo | secondary |
| 6 | Berries 1 serving/day | do | nutrition | day | free | serving `food_group:berries` >=1 | 7 | self_report | optional |
| 7 | Protocol breakfast (eggs+oats+berries) | do | nutrition | occasion | slot:breakfast | presence (composition in `content`) | mon-fri | photo | secondary |
| 8 | Iron bisglycinate 25 mg fasted | do | supplement | occasion | slot:on_waking | dose `iron_bisglycinate` mg >=25 | 7 | self_report | core |
| 9 | No alcohol on weekdays | avoid | nutrition | day | free | presence `alcohol` ==0 | mon-fri | none_implicit | secondary |
| 10 | 16:8 eating window kept | do | nutrition | day | window 20:00→12:00 | boolean | 7 | self_report | core |

Line 1 is **above** the NIH UL (4000 IU) → it is published to the student **as written, 5000 IU
included**, and the coach's screen carries the note "Above the NIH upper limit (4000 IU/day)".
Line 2 is satisfied by "capsule this morning + salmon tonight ≈ 2.5 g" reported
explicitly — never deduced from line 5's logged salmon. Line 8 carries P1 relations
(`requires_cofactor: vitamin_c`, `separate_by_minutes: 120` vs any calcium line). Line 10 is
self-report — fasting inference from meal timestamps is refused (`auto_evaluated`, P6-gated).

### Fixture 2 — biohacker protocol (non-nutrition grafts, same engine)

| # | title | pol | class | grain | anchor | measure | evidence |
|---|---|---|---|---|---|---|---|
| 1 | Cold exposure 3 min ≤ 11 °C | do | exposure | occasion | slot:on_waking (mon,wed,fri) | duration min >=3 | self_report |
| 2 | Morning light 10 min | do | exposure | occasion | window 06:00-10:00 | duration min >=10 | self_report |
| 3 | In bed by 23:00 | do | sleep | day | clock 23:00 | clock_time hhmm <=23:00 | device:oura |
| 4 | Sleep 7-9 h | capture | sleep | day | free | duration h between 7-9 | device:oura, `counts_toward_adherence=false` |
| 5 | Zone-2 cardio 3×/week | do | movement | week | free | session >=3, req/7=3 | self_report |
| 6 | Daily HRV reading | capture | measurement | day | free | count >=1 | device:whoop, `counts_toward_adherence=false` |

Line 4/6: silent Whoop/Oura feed ⇒ `unknown`, never `missed`, and excluded from adherence.
Line 2 at 14:00 ⇒ `met` + `off_window`.

### Fixture 3 — prescriptive dietitian plan (coeliac)

| # | title | pol | class | grain | anchor | measure | autonomy |
|---|---|---|---|---|---|---|---|
| 1 | Breakfast: 60 g oats + 150 g yogurt + 100 g berries | do | nutrition | occasion | slot:breakfast, window 07:00-09:30, mon/wed/fri | composition (plate in `content`) | swap_within_policy |
| 2 | Dinner per plan | do | nutrition | occasion | slot:dinner, window 18:00-20:30 | composition | swap_within_policy |
| 3 | Zero gluten | avoid | nutrition | day | free | presence `gluten` ==0, severity=medical | **strict** |
| 4 | Dinner before 20:30 | do | nutrition | occasion | window 18:00-20:30 | presence | flexible |
| 5 | Bloating 0-10 daily | capture | measurement | day | free | scale point | — |

Line 1 + photo of porridge+banana: banana ∈ FRUIT, `swap_within_policy` ⇒ `met`,
`observed.swap_applied=true` — zero escalation (Tier 0). Croissant photo ⇒ line 3 violated by the
**deterministic validator** (not the LLM) ⇒ `contract_change_requests` `urgency='immediate'`,
bypasses digest. Friday with no dinner event: line 2 is `nominal` ⇒ end-of-day sweep resolves
`missed` — a prescriptive plan stays evaluable without logging.
