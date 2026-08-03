-- ============================================================================
-- KEEL — substances reference table (corrective, BUILD_PLAN W1)
--
-- WHY: the acceptance-fixture run (docs/keel/SCHEMA.md) found an asymmetry.
-- `food_group_ref` was FK-protected and correctly rejected an unknown slug,
-- while `substance_ref` was a bare text column: `substance_ref='unobtainium'`
-- was ACCEPTED by the database. The vocabulary was enforced only in TypeScript
-- (`_shared/keel/tokens.ts::parseSubstanceRef`), so any write bypassing the
-- parser — a direct SQL insert, a future service-role job, a refactor — could
-- persist a slug that then makes `labelFor()` throw at RENDER time on
-- apparently valid data. That is precisely the failure mode R7 forbids:
-- fail at the write, loudly, not three layers later.
--
-- This migration makes `substances` the parent of every substance-keyed table
-- (plan_commitments, substance_limits, substance_interactions), mirroring what
-- `food_groups` already does for foods.
--
-- Seeded from the 40 canonical slugs of `_shared/keel/tokens.ts`. token-lint
-- asserts the two stay aligned.
-- ============================================================================

create table if not exists public.substances (
  slug            text primary key,
  kind            text not null default 'supplement'
                    check (kind in ('supplement','nutrient','compound','substance')),
  label_i18n_key  text not null,
  created_at      timestamptz not null default now()
);

comment on table public.substances is
  'KEEL canonical substance vocabulary. Parent of plan_commitments.substance_ref, '
  'substance_limits and substance_interactions. Mirror of _shared/keel/tokens.ts '
  'SUBSTANCE_REFS — kept aligned by scripts/ci/token-lint.mjs. No ontology: a flat '
  'slug list, deliberately (see docs/keel/CONTRACT.md "Refused, on the record").';

insert into public.substances (slug, kind, label_i18n_key) values
  ('vitamin_d3',           'supplement', 'substance.vitamin_d3'),
  ('omega3_epa_dha',       'nutrient',   'substance.omega3_epa_dha'),
  ('magnesium_glycinate',  'supplement', 'substance.magnesium_glycinate'),
  ('iron_bisglycinate',    'supplement', 'substance.iron_bisglycinate'),
  ('creatine_monohydrate', 'supplement', 'substance.creatine_monohydrate'),
  ('vitamin_k2',           'supplement', 'substance.vitamin_k2'),
  ('methylfolate',         'supplement', 'substance.methylfolate'),
  ('zinc',                 'nutrient',   'substance.zinc'),
  ('copper',               'nutrient',   'substance.copper'),
  ('curcumin',             'compound',   'substance.curcumin'),
  ('piperine',             'compound',   'substance.piperine'),
  ('alcohol',              'substance',  'substance.alcohol'),
  ('caffeine',             'substance',  'substance.caffeine'),
  ('gluten',               'substance',  'substance.gluten'),
  ('st_johns_wort',        'compound',   'substance.st_johns_wort'),
  ('melatonin',            'supplement', 'substance.melatonin'),
  ('ashwagandha',          'compound',   'substance.ashwagandha'),
  ('berberine',            'compound',   'substance.berberine'),
  ('vitamin_c',            'nutrient',   'substance.vitamin_c'),
  ('vitamin_a',            'nutrient',   'substance.vitamin_a'),
  ('vitamin_e',            'nutrient',   'substance.vitamin_e'),
  ('vitamin_b12',          'nutrient',   'substance.vitamin_b12'),
  ('niacin',               'nutrient',   'substance.niacin'),
  ('selenium',             'nutrient',   'substance.selenium'),
  ('iodine',               'nutrient',   'substance.iodine'),
  ('calcium_citrate',      'supplement', 'substance.calcium_citrate'),
  ('potassium',            'nutrient',   'substance.potassium'),
  ('omega3_epa',           'nutrient',   'substance.omega3_epa'),
  ('omega3_dha',           'nutrient',   'substance.omega3_dha'),
  ('collagen',             'supplement', 'substance.collagen'),
  ('whey_protein',         'supplement', 'substance.whey_protein'),
  ('casein',               'supplement', 'substance.casein'),
  ('fiber_psyllium',       'supplement', 'substance.fiber_psyllium'),
  ('probiotic',            'supplement', 'substance.probiotic'),
  ('coq10',                'supplement', 'substance.coq10'),
  ('nac',                  'supplement', 'substance.nac'),
  ('glycine',              'supplement', 'substance.glycine'),
  ('taurine',              'supplement', 'substance.taurine'),
  ('electrolytes',         'supplement', 'substance.electrolytes'),
  ('sodium_chloride',      'substance',  'substance.sodium_chloride')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Attach every substance-keyed column to the vocabulary.
-- Guarded so the migration is safe if a prior partial run created a constraint.
-- ---------------------------------------------------------------------------
alter table public.plan_commitments
  drop constraint if exists plan_commitments_substance_ref_fkey;
alter table public.plan_commitments
  add constraint plan_commitments_substance_ref_fkey
  foreign key (substance_ref) references public.substances(slug);

alter table public.substance_limits
  drop constraint if exists substance_limits_substance_ref_fkey;
alter table public.substance_limits
  add constraint substance_limits_substance_ref_fkey
  foreign key (substance_ref) references public.substances(slug);

alter table public.substance_interactions
  drop constraint if exists substance_interactions_substance_ref_fkey;
alter table public.substance_interactions
  add constraint substance_interactions_substance_ref_fkey
  foreign key (substance_ref) references public.substances(slug);

-- Read-only reference data: readable by any authenticated user, written only
-- by migrations (same posture as food_groups / slot_vocabulary).
alter table public.substances enable row level security;

drop policy if exists substances_read on public.substances;
create policy substances_read on public.substances
  for select to authenticated using (true);
