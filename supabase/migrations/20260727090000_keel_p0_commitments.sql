-- ============================================================================
-- KEEL P0 — commitments engine schema
-- ============================================================================
-- KEEL = the runtime of the protocol a coach has written. The coach authors
-- the plan; the AI executes it, observes facts, and derives adherence.
-- Three layers (docs/keel/CONTRACT.md):
--   PRESCRIPTION (plan_templates -> plan_versions -> plan_commitments)
--   FACTS        (protocol_events, planned_deviations — append-only)
--   DERIVED      (commitment_evaluations, weekly_reviews — recomputable)
-- Zero incremental counters anywhere. Derived state is always recomputable
-- from facts (the legacy current_reps counter class of bug is structurally
-- excluded here).
--
-- Authority: docs/keel/CONTRACT.md (rules R1-R7) and docs/keel/SCHEMA.md.
-- Every CHECK below cites the rule it enforces.
--
-- *** NON APPLIQUEE — REVUE HUMAINE REQUISE ***
-- This migration is WRITTEN, never applied by an agent. A human reviews it
-- and applies it (supabase db push is human-only in this repo).
--
-- ============================================================================
-- PROVENANCE GATE REMOVED — product decision, 2026-07-28
-- ============================================================================
-- `plan_commitments.provenance` and `plan_commitments.requires_clinician_signoff`
-- (defined below, under GOVERNANCE) were written to drive the "supplement safety
-- gate": a line above an NIH upper limit, or on the interaction watchlist,
-- WITHOUT provenance = 'clinician_ordered' was degraded at render — the student
-- received an educational food-first suggestion with the dose removed, and the
-- coach was shown a button to restore the prescription by attesting it was
-- clinician-ordered.
--
-- THAT GATE NO LONGER EXISTS. The coach is the prescriber and the authority on
-- their own plan; the software does not put a condition in front of what they
-- wrote. The prescription now reaches the student exactly as written, dose
-- included. What survives is a factual, coach-only reference note ("Above the
-- NIH upper limit (4000 IU/day)"), which blocks nothing and asks nothing.
--
-- THE COLUMNS ARE DELIBERATELY NOT DROPPED. A destructive migration on columns
-- that are still selected, inserted and exported elsewhere buys nothing and can
-- break a read path; the honest change is to stop READING them to degrade
-- anything, which is what was done. They keep their defaults and their CHECK,
-- and they are inert: nothing in the codebase branches on either value.
--
-- The risk this decision accepts is written down, not implied — see
-- docs/keel/LEGAL.md section 5.2 (a coach who is not a registered dietitian can
-- prescribe a dosage above a UL and KEEL will carry it verbatim).
--
-- Code: supabase/functions/plan-template-v1/safety.ts,
--       supabase/functions/_shared/keel/render.ts (renderCoachSafetyNote).
-- ============================================================================


-- ============================================================================
-- PRESCRIPTION — reference vocabularies first (FK targets)
-- ============================================================================

-- slot_vocabulary — global (per-tenant vocabularies refused, see CONTRACT
-- "Refused, on the record"). One vocabulary for meal and non-meal slots.
create table if not exists public.slot_vocabulary (
  key text primary key,                       -- R1: ASCII snake_case token
  label_i18n_key text not null,               -- content is translated at render
  default_local_time time,                    -- null = no meaningful default
  sort_order int not null
);

insert into public.slot_vocabulary (key, label_i18n_key, default_local_time, sort_order) values
  ('on_waking',    'slot.on_waking',    '06:30', 10),
  ('breakfast',    'slot.breakfast',    '07:30', 20),
  ('snack_am',     'slot.snack_am',     '10:30', 30),
  ('pre_workout',  'slot.pre_workout',  null,    40),
  ('lunch',        'slot.lunch',        '12:30', 50),
  ('post_workout', 'slot.post_workout', null,    60),
  ('snack_pm',     'slot.snack_pm',     '16:30', 70),
  ('dinner',       'slot.dinner',       '19:30', 80),
  ('before_bed',   'slot.before_bed',   '22:30', 90),
  ('any_meal',     'slot.any_meal',     null,    100),
  ('any_time',     'slot.any_time',     null,    110);

-- food_groups — flat FNDDS-derived (CC0) seed. Read by the evaluator for food
-- matching and class_equivalent swap resolution (R5-compliant: a column, not
-- jsonb). No nutrient ontology — deliberately (CONTRACT "Refused").
create table if not exists public.food_groups (
  slug text primary key,                      -- R1: ASCII snake_case token
  class text not null check (class in (
    'protein','legume','dairy','grain','vegetable','fruit',
    'fat','discretionary','beverage'
  )),
  typical_portion numeric not null,           -- R4: SI-ish canonical units
  unit text not null check (unit in ('g','ml')),
  label_i18n_key text not null
);

insert into public.food_groups (slug, class, typical_portion, unit, label_i18n_key) values
  ('lean_protein',       'protein',       120, 'g',  'food_group.lean_protein'),
  ('fatty_fish',         'protein',       140, 'g',  'food_group.fatty_fish'),
  ('white_fish',         'protein',       140, 'g',  'food_group.white_fish'),
  ('shellfish',          'protein',       100, 'g',  'food_group.shellfish'),
  ('poultry',            'protein',       120, 'g',  'food_group.poultry'),
  ('red_meat',           'protein',       120, 'g',  'food_group.red_meat'),
  ('eggs',               'protein',       100, 'g',  'food_group.eggs'),
  ('legumes',            'legume',        150, 'g',  'food_group.legumes'),
  ('tofu_tempeh',        'protein',       100, 'g',  'food_group.tofu_tempeh'),
  ('dairy_yogurt',       'dairy',         150, 'g',  'food_group.dairy_yogurt'),
  ('dairy_cheese',       'dairy',         30,  'g',  'food_group.dairy_cheese'),
  ('whole_grain',        'grain',         150, 'g',  'food_group.whole_grain'),
  ('refined_grain',      'grain',         150, 'g',  'food_group.refined_grain'),
  ('starchy_veg',        'vegetable',     150, 'g',  'food_group.starchy_veg'),
  ('cruciferous_veg',    'vegetable',     80,  'g',  'food_group.cruciferous_veg'),
  ('leafy_greens',       'vegetable',     80,  'g',  'food_group.leafy_greens'),
  ('non_starchy_veg',    'vegetable',     80,  'g',  'food_group.non_starchy_veg'),
  ('berries',            'fruit',         125, 'g',  'food_group.berries'),
  ('citrus',             'fruit',         150, 'g',  'food_group.citrus'),
  ('other_fruit',        'fruit',         150, 'g',  'food_group.other_fruit'),
  ('nuts_seeds',         'fat',           30,  'g',  'food_group.nuts_seeds'),
  ('olive_oil',          'fat',           15,  'ml', 'food_group.olive_oil'),
  ('other_added_fat',    'fat',           15,  'g',  'food_group.other_added_fat'),
  ('sauce_dressing',     'discretionary', 30,  'g',  'food_group.sauce_dressing'),
  ('sugar_sweets',       'discretionary', 30,  'g',  'food_group.sugar_sweets'),
  ('fried_food',         'discretionary', 100, 'g',  'food_group.fried_food'),
  ('alcohol',            'beverage',      150, 'ml', 'food_group.alcohol'),
  ('sweetened_beverage', 'beverage',      330, 'ml', 'food_group.sweetened_beverage'),
  ('water',              'beverage',      250, 'ml', 'food_group.water'),
  ('coffee_tea',         'beverage',      250, 'ml', 'food_group.coffee_tea');


-- ============================================================================
-- PRESCRIPTION — coach-scoped tables
-- TODO P3: coaches / coach_clients tables do not exist yet. coach_id stays a
-- bare uuid (no FK) until the tenancy migration; RLS below is service_role
-- only until coach policies land in P3.
-- ============================================================================

-- plan_templates — the coach works HERE. Clonable skeleton; the PDF import
-- creates the template once, each student is a clone + diff.
create table if not exists public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,                     -- TODO P3: FK -> coaches(id)
  title text not null,
  description text,
  content_locale text not null,               -- R2: prose rows carry a locale
  default_swap_policy jsonb not null default '{}',  -- a policy, not a list
  default_autonomy text not null default 'strict'
    check (default_autonomy in ('strict','swap_within_policy','flexible')),
  default_flex_allowance int not null default 4,    -- per week
  default_adherence_target_pct int not null default 80,
  commitments jsonb not null default '[]',    -- clonable skeleton (template keys, no student ids)
  version int not null default 1,
  status text not null default 'draft'
    check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- plan_documents — the dump. Source kept forever.
create table if not exists public.plan_documents (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,                     -- TODO P3: FK -> coaches(id)
  template_id uuid references public.plan_templates(id) on delete set null,
  storage_path text not null,
  mime_type text not null,
  original_filename text not null,
  page_count int,
  ingestion_path text not null
    check (ingestion_path in ('native_text','born_digital_pdf','ocr')),
  ocr_result jsonb,        -- typed blocks + bbox + inline confidence
  layout_probe jsonb,      -- independent geometric read (anti column-drift)
  status text not null default 'uploaded'
    check (status in ('uploaded','parsing','parsed','failed')),
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ============================================================================
-- PRESCRIPTION — student-scoped tables
-- ============================================================================

-- plan_versions — the contract published to ONE student.
create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,                     -- TODO P3: FK -> coaches(id)
  -- RGPD purge: student rows die with the auth user.
  student_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.plan_templates(id) on delete set null,
  source_document_id uuid references public.plan_documents(id) on delete set null,
  version int not null default 1,
  status text not null default 'draft'
    check (status in ('draft','in_review','published','superseded','archived')),
  title text not null,
  content_locale text not null,               -- R2 (title, notes_for_student)
  timezone text not null,
  anchor_week_start date,
  duration_weeks int,
  -- Per-tenant; changes the adherence denominator.
  week_starts_on text not null default 'mon'
    check (week_starts_on in ('mon','tue','wed','thu','fri','sat','sun')),
  -- Calendar-based, coach-authored, never "earned".
  phase_plan jsonb not null default '[]',     -- [{phase_id,label,week_from,week_to}]
  adherence_target_pct int not null default 80,
  flex_allowance_per_week int not null default 4,
  published_at timestamptz,
  published_by uuid,                          -- TODO P3: FK -> coaches(id)
  supersedes_version_id uuid references public.plan_versions(id) on delete set null,
  -- NOTE: publish must re-seed in-flight scheduled_checkins (phantom-commit class).
  notes_for_student text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SCHEMA.md: partial unique index — 1 'published' per student.
-- Pattern copied from user_plans_v2_one_active_per_transformation_idx
-- (squash 20260522143735).
create unique index if not exists plan_versions_one_published_per_student_idx
  on public.plan_versions (student_id)
  where status = 'published';

create index if not exists plan_versions_student_idx
  on public.plan_versions (student_id, created_at desc);


-- plan_commitments — THE CORE. One row = one typed engagement, four
-- orthogonal axes (CONTRACT R6 names the evaluator branches).
create table if not exists public.plan_commitments (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  -- RGPD purge: FK to auth.users, cascade.
  user_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null,                     -- TODO P3: FK -> coaches(id)
  template_commitment_key text,               -- join key back to the template

  -- AXIS 1 · POLARITY + display class
  polarity text not null check (polarity in ('do','avoid','capture')),
  activity_class text not null default 'other'
    check (activity_class in (
      'nutrition','supplement','movement','recovery','exposure',
      'sleep','mind','measurement','other'
    )),
    -- R6 exemption: activity_class has zero logic branches; icons, grouping,
    -- template library, safety routing only.

  -- AXIS 2 · TIME ANCHOR — columns, never jsonb (R5)
  anchor_kind text not null
    check (anchor_kind in ('slot','clock','window','free')),
  slot_key text references public.slot_vocabulary(key),
  clock_local time,
  tolerance_minutes int,
  window_start_local time,                    -- 'window' may cross midnight:
  window_end_local time,                      -- no start<end CHECK on purpose

  -- AXIS 3 · LEVEL — one numeric comparator
  measure text not null check (measure in (
    'energy','protein','carb','fat','fiber','sodium','water','micronutrient',
    'portion','serving','exchange','dose','duration','distance','load','reps',
    'count','rpe','scale','clock_time','temperature','boolean','presence',
    'composition'
  )),
  unit text check (unit in (
    'kcal','g','mg','mcg','IU','ml','l','min','h','km','kg','capsule',
    'tablet','scoop','portion','serving','rep','session','celsius','point',
    'hhmm','none'
  )),
  target_op text not null
    check (target_op in ('>=','<=','==','between','any')),
  target_min numeric,
  target_max numeric,
  tolerance_pct numeric default 10,
  substance_ref text,        -- flat ASCII slug, ~40 seed, no ontology
  food_group_ref text references public.food_groups(slug),

  -- AXIS 4 · EVIDENCE
  evidence_kind text not null check (evidence_kind in (
    'self_report','numeric_entry','photo','device','none_implicit'
  )),
  evidence_required boolean not null default false,
  auto_source text
    check (auto_source in ('whoop','oura','apple_health','cgm','scale')),
  counts_toward_adherence boolean not null default true,  -- false => OUTCOME axis

  -- CADENCE
  evaluation_grain text not null
    check (evaluation_grain in ('occasion','day','week')),
  slot_kind text check (slot_kind in ('nominal','opportunistic')),
  scheduled_days text[]
    check (scheduled_days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  required_days_per_week int
    check (required_days_per_week between 0 and 7),       -- the DENOMINATOR
  expected_occasions_per_day int default 1,

  -- GOVERNANCE
  priority text not null default 'core'
    check (priority in ('core','secondary','optional')),
  autonomy text not null default 'strict'
    check (autonomy in ('strict','swap_within_policy','flexible')),
  flex_eligible boolean not null default false,
  -- INERT SINCE 2026-07-28 — see the "PROVENANCE GATE REMOVED" note at the head
  -- of this file. Kept, defaults kept, CHECK kept; no code reads either column
  -- to change what a student receives.
  provenance text not null default 'coach_educational'
    check (provenance in ('coach_educational','clinician_ordered')),
  requires_clinician_signoff boolean not null default false,

  -- CONTENT & TRACE
  title text not null,
  student_instruction text,                   -- verbatim, citable
  content jsonb not null default '{}',        -- NEVER read by the evaluator (R5)
  content_locale text not null,               -- R2
  source_span jsonb,                          -- {page, quote, bbox}
  phase_id text,
  auto_generated boolean not null default false,
  status text not null default 'active'
    check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- R7: measure IN ('dose','micronutrient') requires substance_ref — an
  -- unknown or missing slug fails the write, loudly.
  constraint plan_commitments_substance_ref_check check (
    measure not in ('dose','micronutrient') or substance_ref is not null
  ),

  -- Anchor coherence: each kind requires its columns and forbids the others.
  -- Exception, dictated by acceptance fixture 3 (SCHEMA.md): a 'slot' anchor
  -- MAY also carry a window ("slot:breakfast, window 07:00-09:30") — the
  -- window feeds timing_status (met + off_window), the slot stays the key.
  constraint plan_commitments_anchor_check check (
    (anchor_kind = 'slot' and slot_key is not null
      and clock_local is null and tolerance_minutes is null
      and ((window_start_local is null and window_end_local is null)
        or (window_start_local is not null and window_end_local is not null)))
    or
    (anchor_kind = 'clock' and clock_local is not null
      and slot_key is null
      and window_start_local is null and window_end_local is null)
    or
    (anchor_kind = 'window'
      and window_start_local is not null and window_end_local is not null
      and slot_key is null and clock_local is null and tolerance_minutes is null)
    or
    (anchor_kind = 'free'
      and slot_key is null and clock_local is null and tolerance_minutes is null
      and window_start_local is null and window_end_local is null)
  ),

  -- Target coherence: '==' stores its value in target_min; hhmm targets are
  -- encoded as numeric HHMM (e.g. 23:00 -> 2300).
  constraint plan_commitments_target_check check (
    (target_op = '>=' and target_min is not null and target_max is null)
    or (target_op = '<=' and target_max is not null and target_min is null)
    or (target_op = '==' and target_min is not null and target_max is null)
    or (target_op = 'between' and target_min is not null and target_max is not null
        and target_min <= target_max)
    or (target_op = 'any' and target_min is null and target_max is null)
  ),

  -- SCHEMA.md coherence: grain='occasion' requires slot resolution (an
  -- anchor that resolves to an occasion — never 'free').
  constraint plan_commitments_occasion_anchor_check check (
    evaluation_grain <> 'occasion' or anchor_kind <> 'free'
  ),

  -- SCHEMA.md coherence: slot_kind='nominal' forbids the 'any_meal' slot
  -- (a nominal slot must be pre-seedable at day open, R6).
  constraint plan_commitments_nominal_slot_check check (
    slot_kind is distinct from 'nominal' or slot_key is distinct from 'any_meal'
  ),

  -- SCHEMA.md coherence: polarity='avoid' evaluates at day/week grain only
  -- (R6: no fact => met, inverted default — meaningless per occasion).
  constraint plan_commitments_avoid_grain_check check (
    polarity <> 'avoid' or evaluation_grain in ('day','week')
  )
  -- No current_* column anywhere: derived state is recomputed, never counted.
);

create index if not exists plan_commitments_plan_version_idx
  on public.plan_commitments (plan_version_id);
create index if not exists plan_commitments_user_status_idx
  on public.plan_commitments (user_id, status);


-- commitment_relations — P1 readers, table created in P0 for the freeze.
create table if not exists public.commitment_relations (
  id uuid primary key default gen_random_uuid(),
  commitment_a uuid not null references public.plan_commitments(id) on delete cascade,
  commitment_b uuid references public.plan_commitments(id) on delete cascade,
  relation_kind text not null check (relation_kind in (
    'co_ingest','separate_by_minutes','requires_cofactor','antagonist'
  )),
  param_minutes int,
  cofactor_ref text references public.food_groups(slug),  -- "with dietary fat" (no commitment_b)
  created_at timestamptz not null default now(),

  -- R7 spirit: each kind requires its parameter, loudly.
  constraint commitment_relations_kind_params_check check (
    (relation_kind = 'separate_by_minutes' and param_minutes is not null
      and commitment_b is not null)
    or (relation_kind = 'requires_cofactor' and cofactor_ref is not null
      and commitment_b is null)
    or (relation_kind in ('co_ingest','antagonist') and commitment_b is not null
      and param_minutes is null and cofactor_ref is null)
  )
);

comment on table public.commitment_relations is
  'Readers: render + safety ONLY. Never the evaluator. See docs/keel/CONTRACT.md NON-INPUTS.';


-- ============================================================================
-- FACTS — append-only
-- ============================================================================

-- protocol_events — the renamed intake_events ("intake" would lock nutrition
-- into the name of the table 100% of the code touches).
create table if not exists public.protocol_events (
  id uuid primary key default gen_random_uuid(),
  -- RGPD purge: FK to auth.users, cascade.
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  local_date date not null,
  slot_key text references public.slot_vocabulary(key),
  source text not null check (source in (
    'photo','text','voice','chat','quick_tap','integration','coach_entry'
  )),
  media_path text,
  recognized jsonb,
  recognition_confidence numeric,
  quantity numeric,                           -- what was EXPLICITLY reported
  unit text,                                  -- R4: canonical SI-ish unit
  substance_ref text,
  food_group_ref text references public.food_groups(slug),
  student_note text,                          -- redacted before coach exposure
  -- R2: this table carries prose (student_note); every row states its locale
  -- (writers pass the student's conversation_locale — no guessing later).
  content_locale text not null,
  evidence_weight numeric,                    -- photo 1.0 / detailed text 0.8 / thumbs-up 0.4
  source_message_id text,
  created_at timestamptz not null default now()
);

-- Idempotence: one event per source message (SCHEMA.md).
create unique index if not exists protocol_events_source_message_idx
  on public.protocol_events (user_id, source_message_id)
  where source_message_id is not null;

create index if not exists protocol_events_user_date_idx
  on public.protocol_events (user_id, local_date);


-- planned_deviations — flex declared IN ADVANCE. Evaluator emits
-- not_applicable and removes the day/slot from the denominator.
create table if not exists public.planned_deviations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  local_date date not null,
  slot_key text references public.slot_vocabulary(key),
  kind text not null check (kind in (
    'restaurant','social','travel','family','work','other'
  )),
  declared_at timestamptz not null default now(),
  declared_via text not null check (declared_via in ('chat','weekly_review','app')),
  note text,
  content_locale text not null,               -- R2 (note is prose)
  consumed_flex boolean not null default false,
  coach_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists planned_deviations_user_date_idx
  on public.planned_deviations (user_id, local_date);


-- upcoming_contexts — fed by weekly review and chat; arms defense cards
-- before the deviation happens.
create table if not exists public.upcoming_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  slot_key text references public.slot_vocabulary(key),
  kind text not null check (kind in (
    'restaurant','social','travel','family','work','other'
  )),
  source text not null check (source in ('chat','weekly_review','app')),
  note text,
  content_locale text not null,               -- R2 (note is prose)
  created_at timestamptz not null default now()
);

create index if not exists upcoming_contexts_user_date_idx
  on public.upcoming_contexts (user_id, local_date);


-- ============================================================================
-- DERIVED — recomputable, never incremented
-- ============================================================================

create table if not exists public.commitment_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  commitment_id uuid not null references public.plan_commitments(id) on delete cascade,
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  local_date date not null,
  slot_key text references public.slot_vocabulary(key),
  grain text not null check (grain in ('occasion','day','week')),
  expected jsonb,                             -- snapshot of the target at day-open
  observed_value numeric,
  observed jsonb,
  status text not null default 'unknown' check (status in (
    'unknown','met','partial','missed','not_applicable','flex_used'
  )),
  timing_status text not null default 'unknown' check (timing_status in (
    'on_time','off_window','unknown','not_applicable'
  )),
  evidence text not null default 'none' check (evidence in (
    'none','self_report','photo','text_log','integration','coach_override','inferred'
  )),
  confidence numeric,
  source_event_ids uuid[],
  resolved_at timestamptz,
  resolved_by text check (resolved_by in ('system','student','coach')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SCHEMA.md: UNIQUE (user_id, commitment_id, local_date, slot_key). Postgres
-- UNIQUE constraints treat NULLs as distinct, so day/week-grain rows (slot_key
-- NULL) could duplicate. Chosen fix: a functional unique index coalescing
-- slot_key to the reserved token 'no_slot' (R1 ASCII; not a slot_vocabulary
-- key, so it can never collide with a real slot). A generated column would
-- add a physical column for no reader — the index is the lighter tool.
create unique index if not exists commitment_evaluations_identity_idx
  on public.commitment_evaluations
  (user_id, commitment_id, local_date, coalesce(slot_key, 'no_slot'));

create index if not exists commitment_evaluations_user_date_idx
  on public.commitment_evaluations (user_id, local_date);


create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- NOT NULL: never average two versions. If republished mid-week:
  -- plan_version_changed_midweek=true, two segments, one number per segment.
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  week_start_date date not null,
  plan_version_changed_midweek boolean not null default false,
  logging_coverage numeric,       -- coverage < 4/7 => insufficient_data, no pct
  core_adherence_pct numeric,
  overall_adherence_pct numeric,
  evaluable_days int,
  flex_used int,
  flex_allowance int,
  self_rated_adherence int,
  biofeedback jsonb,              -- {hunger, energy, sleep, digestion, satiety, stress}
  outcomes jsonb,                 -- {weight_7d_avg, delta, measurements, photos}
  outcome_direction text,         -- taxonomy lives in code (no evaluator branch, R6)
  top_failing_commitment_id uuid references public.plan_commitments(id) on delete set null,
  lapse_context text,
  risk_band text check (risk_band in (
    'on_track','watch','at_risk','disengaged','outcome_mismatch','restriction_flag'
  )),
  student_narrative text,
  coach_draft_reply text,
  content_locale text not null,   -- R2 (narrative, draft reply, lapse_context)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_version_id, week_start_date)
);


-- ============================================================================
-- DIALOGUE
-- ============================================================================

-- contract_change_requests — the AI escalates, the coach decides.
-- suggested_option is a DRAFT, never applied.
create table if not exists public.contract_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_version_id uuid references public.plan_versions(id) on delete cascade,
  commitment_id uuid references public.plan_commitments(id) on delete set null,
  raised_by text not null check (raised_by in ('student','sophia','system')),
  reason_code text not null check (reason_code in (
    'too_much_food','not_enough_food','schedule_conflict','dislikes_food',
    'travel','budget','symptom','social_event','allergen_violation',
    'restriction_signal','other'
  )),
  student_words text,             -- verbatim, citable
  sophia_summary text,
  sophia_evidence jsonb,
  suggested_option jsonb,         -- a draft, never applied
  -- allergen_violation / restriction_signal are the only reason_codes allowed
  -- to carry urgency='immediate' (they bypass the weekly digest).
  urgency text not null default 'routine'
    check (urgency in ('routine','next_digest','immediate')),
  status text not null default 'open'
    check (status in ('open','resolved','dismissed')),
  coach_decision text,
  content_locale text not null,   -- R2 (student_words, summary, decision)
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists contract_change_requests_user_status_idx
  on public.contract_change_requests (user_id, status);


-- ============================================================================
-- SAFETY
-- ============================================================================

-- student_safety_constraints — structured identifiers, NEVER prose. Loaded
-- every turn, outside the LLM memory path (an allergy cannot be a
-- probabilistic memory). A deterministic post-generation validator rejects
-- any output containing a severity='medical' token.
create table if not exists public.student_safety_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'allergy','intolerance','medical','religious','dislike'
  )),
  allergen_ref text,              -- R1: ASCII slug identifiers
  substance_ref text,
  medication_class text,
  severity text not null check (severity in ('medical','strict','preference')),
  declared_by text not null check (declared_by in ('student','coach')),
  notes text,
  content_locale text not null,   -- R2 (notes is prose)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identifiers, never prose: a constraint must name at least one ref.
  constraint student_safety_constraints_ref_check check (
    allergen_ref is not null
    or substance_ref is not null
    or medication_class is not null
  )
);

create index if not exists student_safety_constraints_user_idx
  on public.student_safety_constraints (user_id);


-- substance_limits — seeded from NIH ULs. exceeds_ul is DERIVED at
-- validation (target_min > UL), never stored as a counter.
-- Note (CONTRACT): functional-medicine dosing routinely sits ABOVE UL
-- (D3 5000 IU vs UL 4000) — nominal case, not an edge case.
create table if not exists public.substance_limits (
  substance_ref text primary key,             -- R1: ASCII slug
  ul_amount numeric not null,
  ul_unit text not null check (ul_unit in ('IU','mg','mcg','g')),
  per text not null default 'day' check (per in ('day','week'))
);

insert into public.substance_limits (substance_ref, ul_amount, ul_unit, per) values
  ('vitamin_d3',           4000, 'IU',  'day'),
  ('vitamin_a',            3000, 'mcg', 'day'),
  ('iron_bisglycinate',    45,   'mg',  'day'),
  ('zinc',                 40,   'mg',  'day'),
  ('selenium',             400,  'mcg', 'day'),
  ('niacin',               35,   'mg',  'day'),
  ('vitamin_e',            1000, 'mg',  'day'),
  ('calcium_citrate',      2500, 'mg',  'day'),
  ('iodine',               1100, 'mcg', 'day'),
  ('magnesium_glycinate',  350,  'mg',  'day');  -- supplemental Mg only (NIH)


-- substance_interactions — the narrow watchlist (CONTRACT: flat seed + narrow
-- watchlist only; a nutrient interaction engine is refused, on the record).
create table if not exists public.substance_interactions (
  id uuid primary key default gen_random_uuid(),
  substance_ref text not null,                -- R1: ASCII slug
  medication_class text not null,             -- R1: ASCII slug
  severity text not null check (severity in ('high','moderate','low')),
  note text not null,
  content_locale text not null default 'en',  -- R2 (note is prose, seed is English)
  unique (substance_ref, medication_class)
);

insert into public.substance_interactions (substance_ref, medication_class, severity, note) values
  ('st_johns_wort',     'anticoagulants',      'high',
   'St. John''s wort induces CYP450 enzymes and can reduce anticoagulant efficacy.'),
  ('st_johns_wort',     'oral_contraceptives', 'high',
   'St. John''s wort induces CYP450 enzymes and can reduce contraceptive efficacy.'),
  ('st_johns_wort',     'ssri',                'high',
   'Combining St. John''s wort with SSRIs raises serotonin syndrome risk.'),
  ('st_johns_wort',     'immunosuppressants',  'high',
   'St. John''s wort induces CYP450 enzymes and can lower immunosuppressant levels.'),
  ('vitamin_k2',        'warfarin',            'high',
   'Vitamin K antagonizes warfarin; intake changes destabilize INR.'),
  ('iron_bisglycinate', 'levothyroxine',       'moderate',
   'Iron chelates levothyroxine; separate intake by at least 4 hours.'),
  ('calcium_citrate',   'levothyroxine',       'moderate',
   'Calcium reduces levothyroxine absorption; separate intake by at least 4 hours.'),
  ('vitamin_d3',        'digoxin',             'moderate',
   'High-dose vitamin D can raise calcium and potentiate digoxin toxicity.');


-- ============================================================================
-- RLS — enable on ALL tables; default-deny, explicit policies only
-- ============================================================================
-- Doctrine: the prescription and derived layers are coach/system-authored —
-- the student reads, never writes ("the student never grades their own
-- paper"). Facts and dialogue are student-writable but append-only: SELECT +
-- INSERT policies, no student UPDATE/DELETE anywhere. service_role (edge
-- functions) bypasses RLS for system writes.

alter table public.slot_vocabulary            enable row level security;
alter table public.food_groups                enable row level security;
alter table public.plan_templates             enable row level security;
alter table public.plan_documents             enable row level security;
alter table public.plan_versions              enable row level security;
alter table public.plan_commitments           enable row level security;
alter table public.commitment_relations       enable row level security;
alter table public.protocol_events            enable row level security;
alter table public.planned_deviations         enable row level security;
alter table public.upcoming_contexts          enable row level security;
alter table public.commitment_evaluations     enable row level security;
alter table public.weekly_reviews             enable row level security;
alter table public.contract_change_requests   enable row level security;
alter table public.student_safety_constraints enable row level security;
alter table public.substance_limits           enable row level security;
alter table public.substance_interactions     enable row level security;

-- Reference vocabularies: readable by any authenticated user; writes are
-- service_role only (no insert/update/delete policy).
create policy slot_vocabulary_read on public.slot_vocabulary
  for select to authenticated using (true);
create policy food_groups_read on public.food_groups
  for select to authenticated using (true);
create policy substance_limits_read on public.substance_limits
  for select to authenticated using (true);
create policy substance_interactions_read on public.substance_interactions
  for select to authenticated using (true);

-- Coach-scoped tables: TODO P3 — the coaches table does not exist yet, so
-- the intended policy (auth.uid() = (select user_id from coaches where
-- id = coach_id)) cannot be written. Until P3: RLS enabled with NO policy
-- = deny all for authenticated; only service_role touches these tables.
-- (No policy statement here is deliberate, not an omission.)

-- PRESCRIPTION (student side): read-only.
create policy plan_versions_owner_read on public.plan_versions
  for select to authenticated using (auth.uid() = student_id);
create policy plan_commitments_owner_read on public.plan_commitments
  for select to authenticated using (auth.uid() = user_id);
-- commitment_relations carries no user_id: scope through commitment_a.
create policy commitment_relations_owner_read on public.commitment_relations
  for select to authenticated using (
    exists (
      select 1 from public.plan_commitments c
      where c.id = commitment_relations.commitment_a
        and c.user_id = auth.uid()
    )
  );

-- FACTS: owner read + append (no update/delete — append-only layer).
create policy protocol_events_owner_read on public.protocol_events
  for select to authenticated using (auth.uid() = user_id);
create policy protocol_events_owner_insert on public.protocol_events
  for insert to authenticated with check (auth.uid() = user_id);
create policy planned_deviations_owner_read on public.planned_deviations
  for select to authenticated using (auth.uid() = user_id);
create policy planned_deviations_owner_insert on public.planned_deviations
  for insert to authenticated with check (auth.uid() = user_id);
create policy upcoming_contexts_owner_read on public.upcoming_contexts
  for select to authenticated using (auth.uid() = user_id);
create policy upcoming_contexts_owner_insert on public.upcoming_contexts
  for insert to authenticated with check (auth.uid() = user_id);

-- DERIVED: system-computed; the student reads.
create policy commitment_evaluations_owner_read on public.commitment_evaluations
  for select to authenticated using (auth.uid() = user_id);
create policy weekly_reviews_owner_read on public.weekly_reviews
  for select to authenticated using (auth.uid() = user_id);

-- DIALOGUE: the student may raise and read; the coach decides via
-- service_role (P3 brings coach policies).
create policy contract_change_requests_owner_read on public.contract_change_requests
  for select to authenticated using (auth.uid() = user_id);
create policy contract_change_requests_owner_insert on public.contract_change_requests
  for insert to authenticated with check (auth.uid() = user_id);

-- SAFETY: the student declares and reads their own constraints; updates go
-- through service_role (validated paths only — an allergy edit is not casual).
create policy student_safety_constraints_owner_read on public.student_safety_constraints
  for select to authenticated using (auth.uid() = user_id);
create policy student_safety_constraints_owner_insert on public.student_safety_constraints
  for insert to authenticated with check (auth.uid() = user_id);
