-- ============================================================================
-- KEEL — CARDS (BUILD_PLAN W8)
--
-- STATUS: applied and verified on the LOCAL database only (npx supabase db
-- reset --local). Never pushed to a remote by an agent.
--
-- Authority: docs/keel/CONTRACT.md (R1, R2, R5, R6, R7), docs/keel/SCHEMA.md
-- ("CARDS  card_templates - student_cards - card_wins"), BUILD_PLAN W8.1-W8.4.
--
-- WHAT THIS MIGRATION IS FOR
-- --------------------------
-- A card is an IMPLEMENTATION INTENTION: situation / signal / response /
-- plan B. It is the best-evidenced behaviour-change device we have, and it
-- only works when it is CONCRETE ("I order the grilled salmon at Chez Marco")
-- and when it arrives BEFORE the moment, not after it.
--
-- Three defects in the repo drove the shape below.
--
-- 1. THE CATALOGUE WAS DUPLICATED THREE TIMES AND HAD ALREADY DIVERGED.
--    `generate-attack-card-v1/index.ts:37-127`, `attackTechniquePreviews.ts`
--    and the merge inside `AttackCards.tsx` each carried their own copy of the
--    same six techniques, with different question wording in each. This table
--    is the single source; `owner_scope='global'` rows are seeded here, and
--    both the frontend and the edge functions read them from here.
--
-- 2. THE LLM REWROTE WHAT THE HUMAN WROTE (memory: defense-card-ui-qa,
--    17/07). Enrichment ran on the write path and silently replaced the user's
--    own sentences. Here the render is DETERMINISTIC and, more than that, it
--    is performed BY THE DATABASE: `student_cards.rendered` is computed by a
--    BEFORE trigger from `body_template` x `variable_values` and whatever the
--    client sent in that column is DISCARDED. There is no code path — LLM or
--    otherwise — that can put prose into a card that the human did not type
--    into a variable. That is a structural guarantee, not a convention.
--
-- 3. `current_reps` (memory: daily-review-counter-writethrough) taught the
--    house rule: no incremental counters. `card_wins` is an append-only fact
--    table; "how often did this card hold" is a COUNT, never a column.
--
-- DIVERGENCE FROM THE W8.1 BULLET LIST, DELIBERATE AND FLAGGED
-- -----------------------------------------------------------
-- W8.1 spells `trigger_spec` as jsonb `{slot, contexts[], time_bucket}`. It is
-- materialized here as three COLUMNS (`trigger_slot_key`, `trigger_contexts`,
-- `trigger_time_bucket`). Reasons, in the repo's own terms:
--   * R5's proof case is exactly this: `scheduled_days` is CHECK-protected
--     while `mission_days` in jsonb carries live French that no CHECK can
--     reach. A trigger vocabulary nobody can constrain is the same bug with a
--     different name.
--   * The arming sweep is a SQL filter over these fields. In jsonb it needs a
--     GIN index and a containment operator to do what `= any` does here.
--   * `trigger_contexts` shares its closed domain, verbatim, with
--     `planned_deviations.kind` and `upcoming_contexts.kind` — which is the
--     whole point: the arming join is a token match, so the tokens must be the
--     same tokens.
-- `variables` stays jsonb: it is a variable-length list of heterogeneous
-- descriptors, which no column can hold. It is not left unconstrained for
-- that reason — `keel_card_variables_valid()` is a CHECK, and the write fails
-- loudly (R7) on a malformed descriptor, exactly like the `substance_ref` FK
-- added in W1.0-bis after the base accepted 'unobtainium'.
--
-- CONTRACT NON-INPUT, RESTATED FOR THIS FEATURE
-- ---------------------------------------------
-- `card_wins` is NOT an adherence input. Holding a card is not the same fact
-- as following the prescription; the evaluator's named branches (R6) read
-- `protocol_events`, never cards. A test pins the absence of that edge.
-- ============================================================================


-- ============================================================================
-- 0. DETERMINISTIC RENDER + VALIDATION FUNCTIONS
--    Written first: the CHECKs below depend on them.
-- ============================================================================

-- Every `{{slot}}` in a body must be a declared variable, and every `{{` in
-- the body must open a well-formed slot. A template whose body references an
-- undeclared variable is unrenderable by construction, so it must be
-- unwritable — not discovered at render time in front of a student (R7).
create or replace function public.keel_card_body_slots_declared(
  p_body text,
  p_variables jsonb
) returns boolean
language sql
immutable
as $$
  select
    -- every well-formed slot resolves to a declared variable key
    not exists (
      select 1
      from regexp_matches(coalesce(p_body, ''), '\{\{([a-z][a-z0-9_]*)\}\}', 'g') as m
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(p_variables, '[]'::jsonb)) v
        where v ->> 'key' = m[1]
      )
    )
    -- and there is no stray '{{' that is not a well-formed slot
    and (
      (length(coalesce(p_body, '')) - length(replace(coalesce(p_body, ''), '{{', ''))) / 2
      = (
        select count(*)
        from regexp_matches(coalesce(p_body, ''), '\{\{[a-z][a-z0-9_]*\}\}', 'g')
      )
    );
$$;

comment on function public.keel_card_body_slots_declared(text, jsonb) is
  'CHECK helper: every {{slot}} in a card body is a declared variable key, and no stray {{ exists.';


-- Shape of the `variables` descriptor list. Closed type vocabulary (R1: ASCII
-- snake_case), unique keys, non-empty labels, and `choice` types carry at
-- least two options whose VALUES are tokens and whose LABELS are prose (R2 is
-- satisfied by the row's content_locale).
create or replace function public.keel_card_variables_valid(p_variables jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p_variables) = 'array'
    and jsonb_array_length(p_variables) between 1 and 8
    and not exists (
      select 1
      from jsonb_array_elements(p_variables) v
      where jsonb_typeof(v) <> 'object'
         or coalesce(v ->> 'key', '') !~ '^[a-z][a-z0-9_]*$'
         or coalesce(btrim(v ->> 'label'), '') = ''
         or coalesce(v ->> 'type', '') not in ('text', 'choice', 'time', 'number')
         or (
              v ->> 'type' = 'choice'
              and (
                jsonb_typeof(v -> 'options') is distinct from 'array'
                or jsonb_array_length(v -> 'options') < 2
                or exists (
                     select 1
                     from jsonb_array_elements(v -> 'options') o
                     where coalesce(o ->> 'value', '') !~ '^[a-z][a-z0-9_]*$'
                        or coalesce(btrim(o ->> 'label'), '') = ''
                   )
              )
            )
         or (v ->> 'type' <> 'choice' and v ? 'options')
    )
    and (
      select count(distinct v ->> 'key') from jsonb_array_elements(p_variables) v
    ) = jsonb_array_length(p_variables);
$$;

comment on function public.keel_card_variables_valid(jsonb) is
  'CHECK helper: typed variable descriptors [{key,label,type,options}] with a closed type vocabulary.';


-- THE RENDERER. Pure string substitution, no model, no network, no clock.
--
-- IMMUTABLE and deterministic: the same (template, values) pair always
-- produces the same text, which is what makes "the coach edit is sacred"
-- checkable rather than promised.
--
-- Fail-loud (R7) on: empty body, missing value, empty value, a `choice` value
-- outside its option list, and any slot still unresolved after substitution
-- (which catches the pathological case of a variable value that itself
-- contains `{{...}}`).
create or replace function public.keel_render_card(
  p_body_template text,
  p_variables jsonb,
  p_values jsonb
) returns text
language plpgsql
immutable
as $$
declare
  v_out   text := p_body_template;
  v_var   jsonb;
  v_opt   jsonb;
  v_key   text;
  v_type  text;
  v_raw   jsonb;
  v_text  text;
  v_label text;
begin
  if p_body_template is null or btrim(p_body_template) = '' then
    raise exception 'keel_render_card: empty body_template';
  end if;
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'keel_render_card: variable_values must be a json object, got %',
      coalesce(jsonb_typeof(p_values), 'null');
  end if;

  for v_var in select * from jsonb_array_elements(coalesce(p_variables, '[]'::jsonb)) loop
    v_key  := v_var ->> 'key';
    v_type := v_var ->> 'type';
    v_raw  := p_values -> v_key;

    if v_raw is null or jsonb_typeof(v_raw) = 'null' then
      raise exception 'keel_render_card: missing value for variable "%"', v_key;
    end if;

    if v_type = 'choice' then
      v_label := null;
      for v_opt in select * from jsonb_array_elements(v_var -> 'options') loop
        if (v_opt ->> 'value') = (v_raw #>> '{}') then
          v_label := v_opt ->> 'label';
        end if;
      end loop;
      if v_label is null then
        raise exception 'keel_render_card: value "%" is not an option of variable "%"',
          v_raw #>> '{}', v_key;
      end if;
      v_text := v_label;
    else
      v_text := v_raw #>> '{}';
    end if;

    if v_text is null or btrim(v_text) = '' then
      raise exception 'keel_render_card: empty value for variable "%"', v_key;
    end if;

    -- A value is prose, never a template. Without this line the substitution is
    -- order-dependent: a value of "{{plan_b}}" written into an early variable
    -- would be expanded by a later pass, so the same (template, values) pair
    -- could render differently if the variable order changed. Refused at the
    -- write, loudly (R7), rather than made to work.
    if v_text like '%{{%' or v_text like '%}}%' then
      raise exception 'keel_render_card: value for variable "%" contains template markers', v_key;
    end if;

    v_out := replace(v_out, '{{' || v_key || '}}', v_text);
  end loop;

  if v_out like '%{{%' then
    raise exception 'keel_render_card: unresolved slot after substitution: %', v_out;
  end if;

  return v_out;
end;
$$;

comment on function public.keel_render_card(text, jsonb, jsonb) is
  'Deterministic card render. No LLM anywhere on the write path (see defense-card-ui-qa).';


-- ============================================================================
-- 1. card_templates — THE single catalogue
-- ============================================================================

create table if not exists public.card_templates (
  id uuid primary key default gen_random_uuid(),

  -- Global rows are seeded by migration; coach rows belong to one coach.
  owner_scope text not null check (owner_scope in ('global', 'coach')),
  coach_id uuid references public.coaches(id) on delete cascade,

  -- R1: ASCII snake_case token, compared by code and joined on by the frontend.
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]*$'),

  -- The two families. `defense` = implementation intention against a
  -- situation; `attack` = a technique that builds an object the student uses
  -- ahead of the friction. Both render the same way; only the copy differs.
  card_kind text not null check (card_kind in ('defense', 'attack')),

  -- R6 exemption rides on the same reasoning as plan_commitments: zero logic
  -- branch, it serves icons, grouping and the coach's template library.
  activity_class text not null default 'nutrition',

  -- TRIGGER SPEC — columns, not jsonb (see header).
  -- null slot = the card is not anchored to a slot.
  trigger_slot_key text references public.slot_vocabulary(key),
  -- Shares the CLOSED domain of planned_deviations.kind / upcoming_contexts.kind.
  -- Empty array = context-agnostic (armed by slot or by time bucket only).
  trigger_contexts text[] not null default '{}'
    check (trigger_contexts <@ array['restaurant','social','travel','family','work','other']),
  trigger_time_bucket text not null default 'any'
    check (trigger_time_bucket in ('morning','midday','afternoon','evening','night','any')),

  -- ARMING — how far ahead of the event this card must land. The product rule
  -- in one column: a card served after the meal is not a card, it is a
  -- verdict. Bounded so no template can be written that arms after the fact
  -- (0) or a week early (>1440).
  arm_lead_minutes int not null default 180
    check (arm_lead_minutes between 15 and 1440),

  -- CONTENT (prose, R2 via content_locale on the row)
  title text not null check (btrim(title) <> ''),
  purpose text not null check (btrim(purpose) <> ''),      -- why you would pick this card
  produces text not null check (btrim(produces) <> ''),    -- what object it leaves you with
  usage text not null check (btrim(usage) <> ''),          -- how to use it once written
  body_template text not null check (btrim(body_template) <> ''),
  variables jsonb not null,
  content_locale text not null,

  -- Join back to the three legacy copies being retired. The legacy technique
  -- keys are French-spelled ASCII ('texte_recadrage'); KEEL tokens are English
  -- (R1). Renaming without this column would orphan every stored
  -- `user_attack_cards.content.techniques[].technique_key`, so the mapping is
  -- data, not a lookup table hidden in TypeScript.
  legacy_technique_key text,

  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint card_templates_scope_owner check (
    (owner_scope = 'global' and coach_id is null)
    or (owner_scope = 'coach' and coach_id is not null)
  ),
  constraint card_templates_variables_shape
    check (public.keel_card_variables_valid(variables)),
  constraint card_templates_body_slots_declared
    check (public.keel_card_body_slots_declared(body_template, variables))
);

-- One key per scope. Two partial indexes because `coach_id` is null on global
-- rows and NULLs do not collide in a plain unique index.
create unique index if not exists card_templates_global_key_idx
  on public.card_templates (template_key) where owner_scope = 'global';
create unique index if not exists card_templates_coach_key_idx
  on public.card_templates (coach_id, template_key) where owner_scope = 'coach';
create unique index if not exists card_templates_legacy_key_idx
  on public.card_templates (legacy_technique_key) where legacy_technique_key is not null;
create index if not exists card_templates_arming_idx
  on public.card_templates (card_kind, status);


-- ============================================================================
-- 2. student_cards — one filled card belonging to one student
-- ============================================================================

create table if not exists public.student_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- RESTRICT, not CASCADE: archiving a template must never delete the cards
  -- students wrote from it. Their words are theirs.
  template_id uuid not null references public.card_templates(id) on delete restrict,

  -- Optional anchors. `set null` because a republished plan must not destroy a
  -- card (the W7 lesson: the coach's action destroyed the student's evidence).
  plan_version_id uuid references public.plan_versions(id) on delete set null,
  commitment_id uuid references public.plan_commitments(id) on delete set null,

  variable_values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(variable_values) = 'object'),

  -- WRITTEN BY THE TRIGGER, NEVER BY A CLIENT. See keel_student_cards_render().
  rendered text not null default '' check (btrim(rendered) <> ''),
  rendered_at timestamptz not null default now(),
  render_engine_version int not null default 1,

  -- The `switch word` (legacy `pre_engagement`): a single token the student
  -- sends when the pressure rises. R1 — it is compared by code, so it is an
  -- ASCII token, lowercased at the write.
  keyword text check (keyword ~ '^[a-z0-9_]{2,32}$'),

  coach_approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,

  content_locale text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by text not null default 'student'
    check (created_by in ('student', 'coach', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Execution truth: "approved" is never a lone boolean nobody can date.
  constraint student_cards_approval_complete check (
    coach_approved = false
    or (approved_by is not null and approved_at is not null)
  )
);

-- One keyword per student: the switch word must resolve to exactly one card,
-- or the routing is a coin toss.
create unique index if not exists student_cards_keyword_idx
  on public.student_cards (user_id, keyword) where keyword is not null;
create index if not exists student_cards_user_status_idx
  on public.student_cards (user_id, status);
create index if not exists student_cards_template_idx
  on public.student_cards (template_id);


-- The renderer trigger. Three invariants in twenty lines:
--   1. `rendered` is ALWAYS the deterministic render. Client input for that
--      column is discarded, which is what forecloses the LLM-rewrite class.
--   2. A value for an undeclared variable is a caller bug, not noise: it
--      fails the write (R7) instead of being silently dropped.
--   3. `keyword` is normalized at the write, so the CHECK judges the stored
--      value, not the one the caller happened to type.
create or replace function public.keel_student_cards_render()
returns trigger
language plpgsql
as $$
declare
  v_body text;
  v_vars jsonb;
  v_extra text;
begin
  select body_template, variables into v_body, v_vars
  from public.card_templates
  where id = new.template_id;

  if not found then
    raise exception 'keel_student_cards_render: unknown template %', new.template_id;
  end if;

  select string_agg(k, ', ') into v_extra
  from jsonb_object_keys(new.variable_values) as k
  where not exists (
    select 1 from jsonb_array_elements(v_vars) v where v ->> 'key' = k
  );
  if v_extra is not null then
    raise exception 'keel_student_cards_render: variable_values carries undeclared key(s): %', v_extra;
  end if;

  new.keyword := nullif(btrim(lower(coalesce(new.keyword, ''))), '');
  new.rendered := public.keel_render_card(v_body, v_vars, new.variable_values);
  new.rendered_at := now();
  new.render_engine_version := 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_cards_render on public.student_cards;
create trigger student_cards_render
  before insert or update of template_id, variable_values, keyword
  on public.student_cards
  for each row execute function public.keel_student_cards_render();


-- ============================================================================
-- 3. card_armings — the ledger of "this card was armed BEFORE that event"
-- ============================================================================
--
-- Why a table and not a computed list: "armed" has to be a re-read row, or the
-- assistant can claim a card was ready when nothing ever fired (the phantom
-- accusation class this repo has paid for four times). `arm_at < event_at` is
-- a CHECK, so the product rule "before, never after" cannot be violated by a
-- caller with a bad clock.

create table if not exists public.card_armings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_card_id uuid not null references public.student_cards(id) on delete cascade,

  -- TWO values, and exactly two, because exactly two tables declare a future
  -- event: planned_deviations (the student declared a flex in advance) and
  -- upcoming_contexts (the weekly review or the chat noted something coming).
  -- R6's spirit applied outside the evaluator: a third value like 'slot' would
  -- have no reader in the sweep, so it does not exist. Adding it later is a
  -- one-line CHECK change plus the branch that justifies it.
  trigger_kind text not null
    check (trigger_kind in ('planned_deviation', 'upcoming_context')),
  -- The planned_deviations / upcoming_contexts row that armed this card. NOT
  -- NULL: an arming with no event behind it cannot be explained to the student,
  -- and cannot be re-derived if the sweep is replayed.
  trigger_ref_id uuid not null,

  local_date date not null,
  slot_key text references public.slot_vocabulary(key),

  event_at timestamptz not null,
  arm_at timestamptz not null,

  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'skipped', 'expired')),
  delivered_at timestamptz,
  delivery_channel text check (delivery_channel in ('whatsapp', 'app', 'chat')),

  created_at timestamptz not null default now(),

  constraint card_armings_before_the_event check (arm_at < event_at),
  constraint card_armings_delivery_complete check (
    status <> 'delivered'
    or (delivered_at is not null and delivery_channel is not null)
  )
);

-- Idempotence of the hourly sweep.
--
-- `nulls not distinct` (PG 15+), NOT `coalesce(slot_key, '_none')`. The
-- COALESCE version was written first and FAILED IN THE REAL RUN: an expression
-- index cannot be named in PostgREST's `on_conflict`, so every sweep came back
-- `there is no unique or exclusion constraint matching the ON CONFLICT
-- specification` — the upsert never ran, and a sweep that armed nothing looked
-- exactly like a sweep with nothing to arm. Plain columns keep the index
-- nameable; `nulls not distinct` is what makes the day-wide case (slot_key
-- null) collide with itself instead of inserting a fresh row every hour.
create unique index if not exists card_armings_unique_idx
  on public.card_armings (
    student_card_id,
    trigger_kind,
    trigger_ref_id,
    local_date,
    slot_key
  ) nulls not distinct;
create index if not exists card_armings_due_idx
  on public.card_armings (arm_at) where status = 'pending';
create index if not exists card_armings_user_date_idx
  on public.card_armings (user_id, local_date);


-- ============================================================================
-- 4. card_wins — append-only facts about the card, NOT about adherence
-- ============================================================================
--
-- CONTRACT non-input: the evaluator never reads this table. "I held the line"
-- is not "I followed the prescription"; conflating them would let a student
-- score by declaring willpower. It feeds the card's own usefulness signal and
-- the coach's read, nothing else. No counter column anywhere: the count is a
-- count.

create table if not exists public.card_wins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_card_id uuid not null references public.student_cards(id) on delete cascade,
  -- Null when the win was logged outside any arming (the student reached for
  -- the card on their own). Keeping it nullable is what lets us tell
  -- "the arming worked" apart from "they remembered it themselves".
  arming_id uuid references public.card_armings(id) on delete set null,

  occurred_at timestamptz not null default now(),
  local_date date not null,
  slot_key text references public.slot_vocabulary(key),

  -- R6 spirit: three values, three named readers in the card surface.
  -- `not_used` exists so "the card was there and I ignored it" is expressible;
  -- without it the absence of a win is ambiguous between "did not need it" and
  -- "it failed", and a card nobody can retire never gets retired.
  outcome text not null check (outcome in ('held', 'slipped', 'not_used')),
  source text not null check (source in ('chat', 'whatsapp', 'app', 'keyword')),
  source_message_id text,

  note text,
  content_locale text not null,
  created_at timestamptz not null default now()
);

-- Same idempotence key shape as protocol_events: one inbound message can only
-- ever write one win.
create unique index if not exists card_wins_source_message_idx
  on public.card_wins (user_id, source_message_id) where source_message_id is not null;
create index if not exists card_wins_card_idx
  on public.card_wins (student_card_id, local_date);
create index if not exists card_wins_user_date_idx
  on public.card_wins (user_id, local_date);


-- ============================================================================
-- 5. RLS
-- ============================================================================

alter table public.card_templates enable row level security;
alter table public.student_cards  enable row level security;
alter table public.card_armings   enable row level security;
alter table public.card_wins      enable row level security;

-- Global catalogue: readable by every authenticated user (it is the product's
-- vocabulary, like slot_vocabulary and food_groups). Writes to global rows are
-- migration-only: no policy grants them.
create policy card_templates_global_read on public.card_templates
  for select to authenticated
  using (owner_scope = 'global' and status = 'active');

-- A coach owns their own templates outright (same shape as plan_templates).
create policy card_templates_coach_all on public.card_templates
  for all to authenticated
  using (
    owner_scope = 'coach'
    and coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    owner_scope = 'coach'
    and coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

-- A student reads the templates of the coach who is actually coaching them.
create policy card_templates_student_read on public.card_templates
  for select to authenticated
  using (
    owner_scope = 'coach'
    and status = 'active'
    and coach_id in (
      select cc.coach_id from public.coach_clients cc
      where cc.student_user_id = (select auth.uid()) and cc.status = 'active'
    )
  );

-- The student owns their cards, including UPDATE and DELETE.
--
-- This is the one place in KEEL where the student may update a row, and it is
-- deliberate: the card is THEIR sentence. `rendered` is not writable in any
-- meaningful sense — the trigger overwrites it on every update — so the update
-- surface is exactly `variable_values`, `keyword` and `status`.
create policy student_cards_owner_select on public.student_cards
  for select to authenticated using ((select auth.uid()) = user_id);
create policy student_cards_owner_insert on public.student_cards
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy student_cards_owner_update on public.student_cards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy student_cards_owner_delete on public.student_cards
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Tier A read for the coach. Unlike protocol_events.student_note, a card is a
-- SHARED artifact by construction: `coach_approved` only means anything if the
-- coach can read what they are approving. No write policy — approval is
-- written server-side after the identity check, like every other coach action.
create policy student_cards_coach_select on public.student_cards
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

-- Armings: system-written (service_role). Both sides read.
create policy card_armings_owner_select on public.card_armings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy card_armings_coach_select on public.card_armings
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

-- Wins: the student logs and reads; the coach reads.
create policy card_wins_owner_select on public.card_wins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy card_wins_owner_insert on public.card_wins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy card_wins_coach_select on public.card_wins
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));


-- GRANTS — the second lock, deliberately tighter than the sibling KEEL tables.
--
-- Supabase's default privileges hand `anon` and `authenticated` the full
-- `arwdDxt` set on every new public table, so RLS is normally the ONLY control.
-- The MEGA_REVIEW's B2 finding is what this block answers: the two Tier B views
-- shipped writable because a migration relied on "there is no policy for that"
-- while the ROLE still held the privilege. A policy is a filter; a grant is a
-- capability. Where no policy will ever grant a capability, the capability is
-- removed too, so a future policy edit cannot accidentally re-open it.
--
--   anon        -> nothing at all. No policy on these four tables targets anon.
--   card_armings-> read only for both roles: the sweep is the sole author.
--   card_wins   -> append-only, which is the FACTS-layer doctrine. Without the
--                  revoke, "append-only" is a sentence in a comment.
revoke all on public.card_templates from anon;
revoke all on public.student_cards  from anon;
revoke all on public.card_armings   from anon;
revoke all on public.card_wins      from anon;

revoke insert, update, delete, truncate on public.card_armings from authenticated;
revoke update, delete, truncate on public.card_wins from authenticated;


-- ============================================================================
-- 6. SEED — the unified global catalogue
--
--    6 attack techniques (the three divergent copies collapse here) +
--    10 nutrition/protocol defense templates (W8.3).
--    English, ASCII (R1 for tokens; the prose is EN because KEEL surfaces are
--    born EN and W9 owns translation).
-- ============================================================================

insert into public.card_templates (
  owner_scope, template_key, card_kind, activity_class,
  trigger_slot_key, trigger_contexts, trigger_time_bucket, arm_lead_minutes,
  title, purpose, produces, usage, body_template, variables,
  content_locale, legacy_technique_key
) values

-- ---------------------------------------------------------------- ATTACK (6)
(
  'global', 'reframe_text', 'attack', 'mind',
  null, '{}', 'any', 180,
  'The magic text',
  'Make the inner argument stop when you catch yourself negotiating.',
  'A short text you re-read until the fight goes quiet and the action is obvious again.',
  'Read it the moment the resistance rises, not after you have already given in.',
  E'When I start negotiating about {{action}}, I read this.\nThe excuse I use: {{excuse}}\nWhat is actually true: {{truth}}\nI do not have to win the argument. I only have to start.',
  '[
    {"key":"action","label":"Which action do you keep negotiating with yourself about?","type":"text"},
    {"key":"excuse","label":"What do you tell yourself to avoid it? Write the excuse in your own words.","type":"text"},
    {"key":"truth","label":"What is true and important to you, facing that excuse?","type":"text"}
  ]'::jsonb,
  'en', 'texte_recadrage'
),
(
  'global', 'strength_mantra', 'attack', 'mind',
  'on_waking', '{}', 'morning', 60,
  'Strength mantra',
  'Build the steadiness ahead of time instead of waiting to feel strong in the moment.',
  'One sentence you repeat until your relationship to the effort shifts.',
  'Say it three times in the morning, out loud if you can.',
  E'{{why}}\nThat is why I hold on {{effort}}.\nI say it {{tone}}, three times, before the day starts.',
  '[
    {"key":"effort","label":"Which effort do you want to become steadier about?","type":"text"},
    {"key":"why","label":"Why does holding this matter to you?","type":"text"},
    {"key":"tone","label":"How should it sound?","type":"choice","options":[
      {"value":"calm","label":"calmly"},
      {"value":"noble","label":"with dignity"},
      {"value":"sharp","label":"sharply"}
    ]}
  ]'::jsonb,
  'en', 'mantra_force'
),
(
  'global', 'visual_anchor', 'attack', 'mind',
  null, '{}', 'any', 180,
  'Visual anchor',
  'Use your surroundings on purpose, so the environment reminds you instead of your willpower.',
  'One physical reminder plus the sentence it triggers.',
  'Put it where your eyes land on it at the moment that matters, not where it looks nice.',
  E'I put a reminder of {{commitment}} on {{place}}.\nWhen my eyes land on it I tell myself: {{phrase}}',
  '[
    {"key":"commitment","label":"Which commitment do you want to keep in sight?","type":"text"},
    {"key":"place","label":"Where will you put it? (fridge, mirror, desk, lock screen...)","type":"text"},
    {"key":"phrase","label":"What do you want to tell yourself when you see it? One short sentence.","type":"text"}
  ]'::jsonb,
  'en', 'ancre_visuelle'
),
(
  'global', 'morning_visualization', 'attack', 'mind',
  'on_waking', '{}', 'morning', 60,
  'Five-minute rehearsal',
  'Install a clear, calm picture of the behaviour before the day and its frictions take over.',
  'A short rehearsal you run in your head, blocker included.',
  'Five minutes, same moment every day, eyes closed, concrete details.',
  E'For five minutes {{moment}}, I picture myself doing {{action}} calmly.\nI picture {{blocker}} showing up.\nAnd I picture myself doing it anyway.',
  '[
    {"key":"action","label":"Which action do you want to feel natural?","type":"text"},
    {"key":"blocker","label":"What actually gets in the way when the moment arrives?","type":"text"},
    {"key":"moment","label":"When do you run it?","type":"choice","options":[
      {"value":"on_waking","label":"on waking"},
      {"value":"before_breakfast","label":"before breakfast"},
      {"value":"before_the_action","label":"just before the action"}
    ]}
  ]'::jsonb,
  'en', 'visualisation_matinale'
),
(
  'global', 'prepare_the_ground', 'attack', 'other',
  null, '{}', 'any', 180,
  'Prepare the ground',
  'Set the conditions before the friction arrives, instead of out-arguing it live.',
  'A concrete preparation, done at a named time, that removes the friction in advance.',
  'Do the preparation early enough that the right move is the easy one later.',
  E'At {{when_to_prepare}} I prepare {{prepared}}.\nSo that {{friction}} is already handled when it is time for {{action}}.',
  '[
    {"key":"action","label":"Which action do you want to make easier?","type":"text"},
    {"key":"friction","label":"What slows you down or gets in the way at that moment?","type":"text"},
    {"key":"prepared","label":"What do you prepare in advance?","type":"text"},
    {"key":"when_to_prepare","label":"At what time do you prepare it?","type":"time"}
  ]'::jsonb,
  'en', 'preparer_terrain'
),
(
  'global', 'switch_word', 'attack', 'mind',
  null, '{}', 'any', 180,
  'Switch word',
  'Have one word to send when the pressure rises, so you do not have to explain yourself first.',
  'A memorable keyword plus what it means, so support arrives in one message.',
  'Send the word alone. Nothing else is needed for the context to be picked up.',
  E'When {{situation}} starts, I send one word: {{keyword}}\nThat word means: help me hold on. I am protecting {{protects}}.',
  '[
    {"key":"situation","label":"In which precise situation do you risk giving in?","type":"text"},
    {"key":"keyword","label":"Which word will you send? One word, lowercase.","type":"text"},
    {"key":"protects","label":"When you hold on in that moment, what are you protecting?","type":"text"}
  ]'::jsonb,
  'en', 'pre_engagement'
),

-- -------------------------------------------------------------- DEFENSE (10)
(
  'global', 'restaurant_order', 'defense', 'nutrition',
  'any_meal', '{restaurant,social}', 'any', 180,
  'Restaurant: the order you already chose',
  'Decide the order before you are hungry and holding a menu.',
  'One default dish and one fallback, tied to the moment the menu arrives.',
  'Order first, before reading the rest of the menu and before the second drink.',
  E'Situation: I am at {{place}}.\nSignal: {{signal}}\nThen: I order {{go_to_dish}} before I read the rest of the menu.\nPlan B: {{plan_b}}',
  '[
    {"key":"place","label":"Which restaurant, or which kind of place?","type":"text"},
    {"key":"go_to_dish","label":"Which dish do you order there by default?","type":"text"},
    {"key":"signal","label":"What is the signal to order?","type":"choice","options":[
      {"value":"menu_arrives","label":"the menu arrives"},
      {"value":"first_drink","label":"the first drink is served"},
      {"value":"others_order","label":"the others start ordering"},
      {"value":"bread_basket","label":"the bread basket lands on the table"}
    ]},
    {"key":"plan_b","label":"If that dish is not on the menu, what do you order instead?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'evening_craving', 'defense', 'nutrition',
  'before_bed', '{}', 'evening', 120,
  'Evening craving',
  'Meet the evening pull with a decision you made while calm.',
  'A named replacement and a ten-minute rule, tied to a specific hour.',
  'Use it at the hour you wrote, not after the third handful.',
  E'Situation: it is around {{hour}} and I want {{craving}}.\nThen: I have {{replacement}} first, and I wait ten minutes.\nPlan B: {{plan_b}}',
  '[
    {"key":"craving","label":"What do you reach for in the evening?","type":"text"},
    {"key":"hour","label":"Around what time does it usually hit?","type":"time"},
    {"key":"replacement","label":"What do you have instead, first?","type":"text"},
    {"key":"plan_b","label":"If you still want it after ten minutes, what do you do?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'sunday_meal_prep', 'defense', 'nutrition',
  'any_time', '{}', 'afternoon', 240,
  'Sunday meal prep',
  'Give the week a floor, so a bad week still has meals already handled.',
  'One batch dish, a portion count, and where it lives.',
  'Cook it at the window you named. The point is the floor, not the variety.',
  E'Situation: Sunday, {{prep_window}}.\nThen: I cook {{dish}}, {{portions}} portions, stored in {{storage}}.\nThat is the floor of the week: even a bad week has {{portions}} meals already handled.\nPlan B: {{plan_b}}',
  '[
    {"key":"prep_window","label":"What time do you cook on Sunday?","type":"time"},
    {"key":"dish","label":"Which dish do you batch?","type":"text"},
    {"key":"portions","label":"How many portions?","type":"number"},
    {"key":"storage","label":"Where do they live? (fridge, freezer, glass boxes...)","type":"text"},
    {"key":"plan_b","label":"If Sunday falls through, when do you cook instead?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'after_slip_reset', 'defense', 'nutrition',
  null, '{other}', 'any', 60,
  'After a slip: the next meal',
  'Stop a slip from becoming a week, without compensating for it.',
  'The next meal, decided in advance, and one line you tell yourself.',
  'Use it right after the slip. Nothing gets skipped and nothing gets doubled.',
  E'Situation: I ate off plan.\nThen: the next meal is {{next_meal}}, and it is {{anchor_dish}}.\nNothing else changes. No skipping, no compensating, no earning it back.\nWhat I tell myself: {{one_line}}',
  '[
    {"key":"next_meal","label":"Which meal comes next in your day?","type":"choice","options":[
      {"value":"breakfast","label":"breakfast"},
      {"value":"lunch","label":"lunch"},
      {"value":"snack_pm","label":"the afternoon snack"},
      {"value":"dinner","label":"dinner"}
    ]},
    {"key":"anchor_dish","label":"What is that meal, concretely?","type":"text"},
    {"key":"one_line","label":"One line you tell yourself. No punishment, no debt.","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'between_meal_hunger', 'defense', 'nutrition',
  'snack_pm', '{}', 'afternoon', 90,
  'Hunger between meals',
  'Answer real hunger with something you chose, before the vending machine chooses for you.',
  'A default snack with a protein source, tied to the hour it usually hits.',
  'Eat it at the hour you named, without waiting to be starving.',
  E'Situation: hunger hits around {{usual_time}}, between meals.\nThen: I have {{go_to_snack}}, with {{protein_source}}.\nPlan B: {{plan_b}}',
  '[
    {"key":"usual_time","label":"What time does the hunger usually hit?","type":"time"},
    {"key":"go_to_snack","label":"What is your default snack?","type":"text"},
    {"key":"protein_source","label":"What protein goes with it?","type":"text"},
    {"key":"plan_b","label":"If none of that is available, what do you take?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'travel_day', 'defense', 'nutrition',
  null, '{travel,work}', 'any', 720,
  'Travel day',
  'Decide what goes in the bag while you are still at home and calm.',
  'A packed default and a bought default, so the trip has two floors.',
  'Arm it the evening before, when the bag is being packed.',
  E'Situation: {{leg}}.\nSignal: the bag is being packed.\nThen: {{packed}} goes in the bag.\nIf I did not pack: I buy {{bought_default}}.\nPlan B: {{plan_b}}',
  '[
    {"key":"leg","label":"Which trip or commute is this card for?","type":"text"},
    {"key":"packed","label":"What do you pack before leaving?","type":"text"},
    {"key":"bought_default","label":"What do you buy if you did not pack?","type":"text"},
    {"key":"plan_b","label":"If neither is possible, what do you do?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'hydration_anchor', 'defense', 'nutrition',
  'any_time', '{}', 'any', 60,
  'Hydration anchor',
  'Attach drinking to something that already happens, instead of to remembering.',
  'One container, one anchor moment, one starting time.',
  'Refill at the anchor moment. The container is the unit, not the glass.',
  E'Situation: {{refill_moment}}.\nThen: I fill {{container}} and drink it, starting at {{first_time}}.\nPlan B: {{plan_b}}',
  '[
    {"key":"container","label":"Which bottle or glass is your unit?","type":"text"},
    {"key":"first_time","label":"What time is the first one?","type":"time"},
    {"key":"refill_moment","label":"What is the anchor moment?","type":"choice","options":[
      {"value":"on_waking","label":"on waking"},
      {"value":"before_each_meal","label":"before each meal"},
      {"value":"every_hour","label":"every hour at work"},
      {"value":"post_workout","label":"right after training"}
    ]},
    {"key":"plan_b","label":"If you are away from your bottle, what do you do?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'social_fasting_window', 'defense', 'nutrition',
  null, '{social,family}', 'evening', 300,
  'Social evening inside a fasting window',
  'Shift the window on purpose and in advance, so the evening is planned and not a slip.',
  'A named shift for that day only, declared before the event.',
  'Declare it in advance. A declared deviation is not a failure, it is a plan.',
  E'Situation: {{event}} runs past {{window_end}}.\nThen: for that day only, I shift the window: {{chosen_shift}}.\nI declare it in advance, so it is planned, not a slip.\nPlan B: {{plan_b}}',
  '[
    {"key":"event","label":"Which evening or event is this for?","type":"text"},
    {"key":"window_end","label":"When does your eating window normally close?","type":"time"},
    {"key":"chosen_shift","label":"How do you shift it that day?","type":"text"},
    {"key":"plan_b","label":"If the evening runs even later, what do you do?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'work_lunch_trap', 'defense', 'nutrition',
  'lunch', '{work}', 'midday', 120,
  'Work lunch',
  'Build the same plate every time, so the queue does not decide for you.',
  'A default plate and the signal that starts it.',
  'Build the plate before you look at what everyone else took.',
  E'Situation: lunch at {{canteen}}.\nSignal: {{signal}}\nThen: I build {{default_plate}}.\nPlan B: {{plan_b}}',
  '[
    {"key":"canteen","label":"Which canteen, cafe or food court?","type":"text"},
    {"key":"default_plate","label":"What is your default plate there?","type":"text"},
    {"key":"signal","label":"What is the signal?","type":"choice","options":[
      {"value":"queue_starts","label":"you join the queue"},
      {"value":"colleagues_leave","label":"the colleagues get up to go"},
      {"value":"calendar_reminder","label":"the lunch reminder fires"}
    ]},
    {"key":"plan_b","label":"If your plate is not available, what do you take?","type":"text"}
  ]'::jsonb,
  'en', null
),
(
  'global', 'family_meal_pressure', 'defense', 'nutrition',
  null, '{family,social}', 'any', 180,
  'Family meal: the second serving',
  'Have the sentence ready, so declining costs you nothing socially.',
  'One sentence to say, and the portion rule it protects.',
  'Say the sentence the first time, warmly. It does not need a justification.',
  E'Situation: a meal at {{host}}.\nSignal: I am offered a second serving.\nThen: I say: {{phrase}}\nAnd I keep to {{portion_rule}}.\nPlan B: {{plan_b}}',
  '[
    {"key":"host","label":"Whose table is this?","type":"text"},
    {"key":"phrase","label":"One sentence you say when you are offered more.","type":"text"},
    {"key":"portion_rule","label":"What is the portion rule you are protecting?","type":"text"},
    {"key":"plan_b","label":"If the pressure keeps coming, what do you do?","type":"text"}
  ]'::jsonb,
  'en', null
)
on conflict do nothing;


-- ============================================================================
-- 7. CRON — the arming sweep
--
--    Hourly, like the provisioning cron and for the same reason (W1.3 bug 3):
--    a single daily UTC tick cannot arm a fleet spread over 25 hours of
--    offsets. Runs at :20, between provisioning (:00) and evaluation (:45), so
--    an arming created for today's newly opened day is in place before the
--    day's first reminders.
-- ============================================================================

do $$
declare
  job record;
begin
  for job in select jobid from cron.job where jobname = 'keel-arm-cards' loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

create or replace function pg_temp.schedule_card_arming_job()
returns void
language plpgsql
as $$
begin
  perform cron.schedule(
    'keel-arm-cards',
    '20 * * * *',
    format(
      $command$
      with cfg as (
        select
          coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
          coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
          coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
      )
      select
        net.http_post(
          url := rtrim((select base_url from cfg), '/') || '/functions/v1/' || %L,
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'apikey', (select anon_key from cfg),
            'authorization', 'Bearer ' || (select anon_key from cfg),
            'x-internal-secret', (select internal_secret from cfg)
          ),
          body := %L::jsonb
        ) as request_id
      from cfg
      where (select base_url from cfg) <> ''
        and (select anon_key from cfg) <> ''
        and (select internal_secret from cfg) <> '';
      $command$,
      'keel-cards-v1',
      '{"action":"arm_sweep"}'
    )
  );
end;
$$;

select pg_temp.schedule_card_arming_job();

-- Fail loud (R7): an unscheduled arming job means cards that exist and never
-- arrive, which is worse than no cards at all.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'keel-arm-cards') then
    raise exception 'keel-arm-cards cron job was not scheduled';
  end if;
end $$;


comment on table public.card_templates is
  'W8: THE single card catalogue. Replaces three divergent hardcoded copies (generate-attack-card-v1, attackTechniquePreviews.ts, AttackCards.tsx).';
comment on table public.student_cards is
  'W8: one filled card. `rendered` is written ONLY by the keel_student_cards_render trigger - zero LLM on the write path.';
comment on table public.card_armings is
  'W8: ledger proving a card was armed BEFORE the event. arm_at < event_at is a CHECK, not a convention.';
comment on table public.card_wins is
  'W8: append-only card facts. CONTRACT non-input: never read by the adherence evaluator.';
comment on column public.card_templates.legacy_technique_key is
  'Join key back to the retired French-spelled technique keys stored in user_attack_cards.content.';
