-- KEEL W3.3 — crisis_resources: emergency / crisis contacts per country.
--
-- Authority: docs/keel/CONTRACT.md (R1, R2, R7), docs/keel/BUILD_PLAN.md W3.3.
--
-- WHY THIS TABLE EXISTS
-- Three code paths hardcoded French numbers (3114, 15, 112) inside otherwise
-- country-agnostic safety logic:
--   sophia-brain/skills/safety_crisis/reducer.ts
--   sophia-brain/skills/safety_crisis/visible_agent.ts
--   sophia-brain/agents/sentry.ts
-- A US student in crisis was told to call a number that does not exist in the
-- US. Hardcoded resources are not a localization defect, they are a safety
-- defect. This table is the single source of truth; the TypeScript mirror in
-- supabase/functions/_shared/keel/crisis_resources.ts exists ONLY so the
-- deterministic (LLM-free, DB-free) crisis fallback path keeps working when
-- the database is unreachable — a drift test compares the two.
--
-- R1 — `country` and `kind` are ASCII tokens. `country` is ISO 3166-1 alpha-2
--      UPPERCASE. 'ZZ' is the ISO user-assigned code reserved here for the
--      documented INTERNATIONAL FALLBACK set (see R7 note below).
-- R2 — `label` is human prose, so the row carries `content_locale NOT NULL`.
--      The BUILD_PLAN sketch called this column `locale`; CONTRACT R2 fixes
--      the name, and the contract is the authority. Pilot seed is English
--      (`resolveResponseLocale` forces en-US); a French rendering of the same
--      row is a future INSERT with content_locale='fr', never a mutation.
-- R7 — the resolver never returns nothing and never guesses silently: an
--      unknown country logs loudly and degrades onto the 'ZZ' set. No number
--      is invented; 'ZZ' points at 112 (routes to local emergency services on
--      essentially every GSM network) and at a helpline directory.
--
-- RLS: readable by any authenticated user (a crisis contact is not private
-- data and the student surface must be able to read it). NO write policy at
-- all: rows are seeded by migrations; service_role bypasses RLS for the rare
-- operational correction.

create table if not exists public.crisis_resources (
  id uuid primary key default gen_random_uuid(),

  country text not null,                        -- R1: ISO 3166-1 alpha-2, upper
  kind text not null check (kind in (
    'suicide','emergency','eating_disorder','poison','domestic_violence'
  )),
  label text not null,                          -- prose (R2 -> content_locale)
  contact text not null,                        -- phone number or URL, atomic
  url text,
  content_locale text not null,                 -- R2 (BCP-47)
  priority int not null default 100,            -- lower first, within (country, kind)
  created_at timestamptz not null default now(),

  constraint crisis_resources_country_format
    check (country ~ '^[A-Z]{2}$'),
  constraint crisis_resources_unique_contact
    unique (country, kind, contact)
);

comment on table public.crisis_resources is
  'KEEL W3.3 — crisis/emergency contacts per country. Source of truth for '
  '_shared/keel/crisis_resources.ts. Country ZZ = documented international '
  'fallback used when the student country is unknown (logged, never silent).';

create index if not exists crisis_resources_lookup_idx
  on public.crisis_resources (country, kind, priority);

-- ---------------------------------------------------------------------------
-- SEED
-- ---------------------------------------------------------------------------
-- Labels are English (content_locale 'en') even for the French rows: R2 keeps
-- the language of the prose explicit instead of guessing it a posteriori, and
-- the pilot renders in English. `contact` stays the dialable/clickable atom so
-- the render layer composes ("15 or 112") instead of storing a sentence.

insert into public.crisis_resources
  (country, kind, label, contact, url, content_locale, priority)
values
  -- United States ----------------------------------------------------------
  ('US', 'suicide', '988 Suicide and Crisis Lifeline (call or text 988)',
   '988', 'https://988lifeline.org', 'en', 10),
  ('US', 'emergency', 'Emergency services',
   '911', null, 'en', 10),
  -- NEDA retired its phone helpline in 2023; its contact surface is now the
  -- screening/chat page. The staffed Alliance line is kept as the callable
  -- second option rather than inventing a number for NEDA.
  ('US', 'eating_disorder', 'NEDA (National Eating Disorders Association) helpline',
   'https://www.nationaleatingdisorders.org/help-support/contact-helpline',
   'https://www.nationaleatingdisorders.org', 'en', 10),
  ('US', 'eating_disorder', 'National Alliance for Eating Disorders helpline',
   '1-866-662-1235', 'https://www.allianceforeatingdisorders.com', 'en', 20),
  ('US', 'poison', 'Poison Help line',
   '1-800-222-1222', 'https://www.poisonhelp.org', 'en', 10),
  ('US', 'domestic_violence', 'National Domestic Violence Hotline',
   '1-800-799-7233', 'https://www.thehotline.org', 'en', 10),

  -- United Kingdom (ISO code GB; 'UK' is accepted as an input alias only) ---
  ('GB', 'suicide', 'Samaritans (free, 24/7)',
   '116 123', 'https://www.samaritans.org', 'en', 10),
  ('GB', 'emergency', 'Emergency services',
   '999', null, 'en', 10),
  ('GB', 'emergency', 'European emergency number',
   '112', null, 'en', 20),
  ('GB', 'eating_disorder', 'Beat eating disorders helpline (England)',
   '0808 801 0677', 'https://www.beateatingdisorders.org.uk', 'en', 10),
  ('GB', 'poison', 'Emergency services (poisoning)',
   '999', null, 'en', 10),
  ('GB', 'domestic_violence', 'National Domestic Abuse Helpline',
   '0808 2000 247', 'https://www.nationaldahelpline.org.uk', 'en', 10),

  -- France -----------------------------------------------------------------
  ('FR', 'suicide', 'National suicide prevention line (3114)',
   '3114', 'https://3114.fr', 'en', 10),
  ('FR', 'emergency', 'Emergency medical services (SAMU)',
   '15', null, 'en', 10),
  ('FR', 'emergency', 'European emergency number',
   '112', null, 'en', 20),
  ('FR', 'eating_disorder', 'FFAB eating disorder helpline (Anorexie Boulimie Info Ecoute)',
   '09 69 325 900', 'https://www.ffab.fr', 'en', 10),
  ('FR', 'poison', 'Emergency medical services (SAMU), poisoning',
   '15', null, 'en', 10),
  ('FR', 'domestic_violence', 'Violences Femmes Info',
   '3919', 'https://arretonslesviolences.gouv.fr', 'en', 10),

  -- ZZ — INTERNATIONAL FALLBACK (R7: loud degradation, never a guess) -------
  -- Every kind MUST be covered here: the resolver's contract is that it never
  -- returns an empty resource list on a crisis path.
  ('ZZ', 'suicide', 'Find a helpline in your country',
   'https://findahelpline.com', 'https://findahelpline.com', 'en', 10),
  ('ZZ', 'emergency', 'International emergency number (routes to local services on most networks)',
   '112', null, 'en', 10),
  ('ZZ', 'eating_disorder', 'Find a helpline in your country',
   'https://findahelpline.com', 'https://findahelpline.com', 'en', 10),
  ('ZZ', 'poison', 'International emergency number (routes to local services on most networks)',
   '112', null, 'en', 10),
  ('ZZ', 'domestic_violence', 'Find a helpline in your country',
   'https://findahelpline.com', 'https://findahelpline.com', 'en', 10)
on conflict (country, kind, contact) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.crisis_resources enable row level security;

-- Read for any authenticated user. No insert/update/delete policy exists on
-- purpose: writes are migrations (or service_role, which bypasses RLS).
drop policy if exists crisis_resources_read on public.crisis_resources;
create policy crisis_resources_read on public.crisis_resources
  for select to authenticated using (true);

-- Belt: even if a future policy were added by mistake, the table-level grants
-- keep authenticated/anon read-only.
revoke all on public.crisis_resources from anon, authenticated;
grant select on public.crisis_resources to authenticated;
