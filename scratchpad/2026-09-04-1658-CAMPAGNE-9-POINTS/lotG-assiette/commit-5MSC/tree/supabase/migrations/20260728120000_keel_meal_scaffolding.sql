-- ============================================================================
-- KEEL — MEAL SCAFFOLDING (Q6 §2.3, §2.4)
--
-- STATUS: applied and verified on the LOCAL database only (npx supabase db
-- reset --local). NOT applied to any remote — human review required.
--
-- WHAT THIS IS
-- The coach composes a week of meals for one student. Two tables:
--   meal_ideas        — a dish, written by a human. Reusable across students.
--   meal_plan_entries — that dish, placed on a day and a slot of one plan.
--
-- WHAT THIS IS NOT — and the three reasons it structurally cannot become it:
--
--   1. IT IS NOT A SECOND AUTHOR.
--      `author_kind` has exactly two legal values, 'coach' and 'keel_library'.
--      There is no 'ai'. A model cannot be the author of a line the student
--      reads, and that is a CHECK constraint, not a code review habit
--      (Q6 §2.3, §4: "author_kind a deux valeurs").
--
--   2. IT IS NOT GRADED, AND THE WALL IS A FOREIGN KEY.
--      Adherence is computed from `commitment_evaluations`, whose key column is
--
--          commitment_id uuid not null
--            references public.plan_commitments(id) on delete cascade
--
--      (20260727090000_keel_p0_commitments.sql). A `meal_ideas.id` cannot
--      satisfy that FK. No row in either table below can produce an evaluation
--      — not by policy, by referential integrity. Nothing here has a
--      `counts_toward_adherence` column either: encoding scaffolding as a
--      commitment with the flag off would still mint an evaluation row, a
--      badge and a place in the student's day (Q6 §3.B.3).
--
--   3. IT NEVER WRITES A FACT.
--      Not one trigger, not one function below writes to `protocol_events`.
--      Two events on four days is the whole display gate for the coach's
--      weekly read (LOGGED_DAY_MIN_EVENTS = 2, adherence.ts:55). A suggested
--      dish that logged itself would lift that gate on its own, turning
--      "insufficient data" into a percentage the student never earned. That is
--      irreversible once released, which is why it is stated here rather than
--      remembered later.
--
-- WHY day_token AND NOT local_date
-- A meal plan is a WEEK the coach composes once and the student reads every
-- week of the plan. Dated rows would force a re-composition every Monday and
-- would silently expire; `mon`..`sun` (R1 ASCII tokens, the same vocabulary as
-- plan_commitments.scheduled_days) makes the composition durable and lets the
-- student's screen resolve it against their own timezone at read time.
-- ============================================================================


-- ============================================================================
-- 1. meal_ideas — the dish. A human wrote it.
-- ============================================================================

create table if not exists public.meal_ideas (
  id uuid primary key default gen_random_uuid(),

  -- THE INVARIANT. Two values, and the absence of a third is the feature.
  author_kind text not null default 'coach'
    check (author_kind in ('coach', 'keel_library')),

  -- The owning coach. 'keel_library' rows are seeded server-side with the
  -- coach who adopted them, so ownership is never null and RLS never needs a
  -- null branch.
  coach_id uuid not null references public.coaches(id) on delete cascade,

  -- NULL = a reusable idea in the coach's own library, offered to any of their
  -- students. Non-null = written for one student (an allergy workaround, a
  -- dish they said they liked). The library case is the default because the
  -- point of the table is that a dish is written ONCE.
  student_id uuid references auth.users(id) on delete cascade,

  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 2000),

  -- Which moment of the day this dish is for. NULL = any. References the
  -- global vocabulary: the grid's columns come from this table, never from a
  -- list typed into a React file.
  slot_key text references public.slot_vocabulary(key),

  -- What the dish puts on the plate, in the ONLY food vocabulary this product
  -- has (food_groups.slug). No grams, no calories, no nutrient ontology
  -- (CONTRACT "Refused"; Q6 §4). Validated against food_groups by the trigger
  -- below — Postgres cannot express an FK from an array element.
  food_group_refs text[] not null default '{}'::text[],

  content_locale text not null default 'en',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meal_ideas_coach_idx
  on public.meal_ideas (coach_id, status);
create index if not exists meal_ideas_student_idx
  on public.meal_ideas (student_id) where student_id is not null;

comment on column public.meal_ideas.author_kind is
  'coach | keel_library. There is deliberately no ai value: a model may choose '
  'among these rows, it may never author one.';


-- Every slug in food_group_refs must exist in food_groups, and the array must
-- not carry duplicates. An FK cannot reach inside an array, so the check is a
-- trigger — and it FAILS THE WRITE (R7) instead of storing a slug that the
-- coverage read would later silently skip.
create or replace function public.keel_meal_idea_food_groups_valid()
returns trigger
language plpgsql
as $$
declare
  bad text;
begin
  if new.food_group_refs is null then
    new.food_group_refs := '{}'::text[];
  end if;

  -- coalesce, because array_length('{}', 1) is NULL, not 0. Without it the
  -- comparison below is NULL <> 0 = true and EVERY dish with nothing ticked is
  -- rejected as "duplicated" — a dish with no food group is perfectly legal
  -- (it simply cannot cover a nutrition line, which the coverage read says out
  -- loud rather than pretending).
  if coalesce(array_length(new.food_group_refs, 1), 0) is distinct from
     (select count(distinct g)::int from unnest(new.food_group_refs) g) then
    raise exception 'meal_ideas.food_group_refs contains duplicates: %',
      new.food_group_refs;
  end if;

  select g into bad
  from unnest(new.food_group_refs) g
  where not exists (select 1 from public.food_groups f where f.slug = g)
  limit 1;

  if bad is not null then
    raise exception 'meal_ideas.food_group_refs references unknown food group %', bad;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists meal_ideas_food_groups_valid on public.meal_ideas;
create trigger meal_ideas_food_groups_valid
  before insert or update on public.meal_ideas
  for each row execute function public.keel_meal_idea_food_groups_valid();


-- ============================================================================
-- 2. meal_plan_entries — the dish, placed on the week
-- ============================================================================

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),

  plan_version_id uuid not null
    references public.plan_versions(id) on delete cascade,
  -- Denormalised on purpose: RLS reads these two columns on every row, and
  -- resolving them through plan_versions on each policy evaluation is the
  -- shape that makes a policy quadratic.
  coach_id uuid not null references public.coaches(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,

  -- R1 tokens, same vocabulary as plan_commitments.scheduled_days.
  day_token text not null
    check (day_token in ('mon','tue','wed','thu','fri','sat','sun')),
  slot_key text not null references public.slot_vocabulary(key),

  meal_idea_id uuid not null references public.meal_ideas(id) on delete cascade,

  -- The coach's own sentence about THIS placement ("double the portion, you
  -- train that evening"). Student-visible, never parsed.
  note text check (note is null or length(note) <= 500),
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Placing the same dish twice on the same cell is not a second suggestion,
  -- it is a double click. The unique index makes the fan-out idempotent, which
  -- is what lets "repeat this breakfast on five days" be replayed safely.
  constraint meal_plan_entries_cell_unique
    unique (plan_version_id, day_token, slot_key, meal_idea_id)
);

create index if not exists meal_plan_entries_week_idx
  on public.meal_plan_entries (plan_version_id, day_token, slot_key);
create index if not exists meal_plan_entries_student_idx
  on public.meal_plan_entries (student_id);

create or replace function public.keel_meal_plan_entry_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists meal_plan_entries_touch on public.meal_plan_entries;
create trigger meal_plan_entries_touch
  before update on public.meal_plan_entries
  for each row execute function public.keel_meal_plan_entry_touch();


-- ============================================================================
-- 3. RLS — the coach writes, the student reads
--
-- Same doctrine as every other KEEL table: there is NO student write policy
-- anywhere below. A suggestion the student could edit would stop being the
-- coach's word, which is the only thing that makes it worth reading.
-- ============================================================================

alter table public.meal_ideas       enable row level security;
alter table public.meal_plan_entries enable row level security;

-- The coach owns their library outright (same shape as plan_templates).
create policy meal_ideas_coach_all on public.meal_ideas
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

-- The student reads the ideas that are actually ON their week, and nothing
-- else. A coach's library is their working material: an idea they wrote and
-- did not place is not published, and this policy is what makes that true.
create policy meal_ideas_student_read on public.meal_ideas
  for select to authenticated
  using (
    status = 'active'
    and exists (
      select 1 from public.meal_plan_entries e
      where e.meal_idea_id = meal_ideas.id
        and e.student_id = (select auth.uid())
    )
  );

create policy meal_plan_entries_coach_all on public.meal_plan_entries
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

create policy meal_plan_entries_student_read on public.meal_plan_entries
  for select to authenticated
  using ((select auth.uid()) = student_id);


-- ============================================================================
-- 4. FALSIFIABILITY — the wall, asserted here rather than trusted
--
-- Q6 §3.B asks for a test whose failure would mean the scaffolding has started
-- to score. These two run at migration time, on the real catalogue.
-- ============================================================================

do $$
declare
  n int;
begin
  -- (a) commitment_evaluations still points at plan_commitments and at nothing
  --     else. If a later migration ever repointed it, the scaffolding would
  --     become gradeable in silence; this is where that stops.
  select count(*) into n
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = rc.constraint_name
   and ccu.constraint_schema = rc.constraint_schema
  where kcu.table_schema = 'public'
    and kcu.table_name = 'commitment_evaluations'
    and kcu.column_name = 'commitment_id'
    and ccu.table_name = 'plan_commitments';
  if n = 0 then
    raise exception
      'commitment_evaluations.commitment_id no longer references plan_commitments — '
      'the meal layer would become gradeable';
  end if;

  -- (b) neither meal table can reach commitment_evaluations. A dish that could
  --     be evaluated is a dish that scores.
  select count(*) into n
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = rc.constraint_name
   and ccu.constraint_schema = rc.constraint_schema
  where kcu.table_schema = 'public'
    and kcu.table_name in ('meal_ideas', 'meal_plan_entries')
    and ccu.table_name in ('commitment_evaluations', 'protocol_events');
  if n > 0 then
    raise exception
      'a meal table references commitment_evaluations or protocol_events — '
      'the scaffolding must not touch the counter';
  end if;
end;
$$;
