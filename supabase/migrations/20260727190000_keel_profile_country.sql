-- ============================================================================
-- KEEL W4.2 / closes the W3.3 defect — profiles.country.
--
-- THE DEFECT, from EXECUTION_LOG W3.3:
--   `crisis_resources` (23 rows, US/GB/FR + the 'ZZ' international fallback)
--   shipped with a resolver that had nothing to resolve ON. The only
--   country-bearing column in `profiles` is `locale`, which is
--   `not null default 'fr-FR'` for the entire fleet. Every user therefore
--   resolved to FR, and an American student in crisis was handed 3114 -- a
--   French number that does not connect from the United States. The table was
--   right, the resolver was right, and the wiring was inert.
--
-- WHY A COLUMN AND NOT A DERIVATION
--   Country is not a language (CONTRACT R3, generalized): a fr-FR speaker in
--   Montreal, a Brit living in Paris and an American reading the app in
--   English all break locale-as-country. Deriving it would repeat, on a safety
--   path, the exact class of guess R7 forbids.
--
-- NULLABLE ON PURPOSE
--   An unknown country must stay unknown. A default would be a silent guess,
--   and `crisis_resources.ts` already has a documented, LOUD degradation for a
--   missing country (international fallback 'ZZ' + a logged warning). NULL is
--   what feeds it honestly.
-- ============================================================================

alter table public.profiles
  add column if not exists country text;

comment on column public.profiles.country is
  'ISO 3166-1 alpha-2, uppercase. Where the user physically is, distinct from locale (R3/R4 spirit). Read FIRST by the crisis-resource resolver; NULL means unknown and degrades onto the documented international fallback, never onto a guess.';

-- CHECK: shape only, not a closed country list.
--   * uppercase two-letter is the ISO invariant; anything else is a bug at the
--     write site and must fail there (R7), not three layers later.
--   * a closed list would have to be maintained forever and would reject a
--     legitimate country the day someone signs up from it. The list that IS
--     closed is the one of SEEDED crisis resources (US/GB/FR today), and that
--     one lives in `crisis_resources` where the fallback is already handled.
alter table public.profiles
  drop constraint if exists profiles_country_iso3166_check;

alter table public.profiles
  add constraint profiles_country_iso3166_check
  check (country is null or country ~ '^[A-Z]{2}$');


-- ============================================================================
-- Best-effort backfill from `locale`
-- ============================================================================
--
-- ONLY the region subtag is used ('fr-FR' -> FR, 'en-US' -> US, 'en-GB' -> GB).
-- A bare language is NOT mapped: 'en' alone would have to be guessed between US
-- and GB, and 'fr' alone between FR, BE, CH and CA. This mirrors
-- `crisisCountryFromLocale` in _shared/keel/crisis_resources.ts exactly, minus
-- its one documented legacy exception ('fr' -> FR), which is a RUNTIME
-- fallback of the French branch and must not be frozen into stored data.
--
-- Consequence, stated rather than hidden: after this migration essentially the
-- whole existing fleet carries country='FR', because locale is 'fr-FR' for all
-- of them by default. That is not the fix -- it is the honest transcription of
-- what we currently know. The fix is that a NEW student now has a place to
-- declare a real country, and that the resolver reads it first.
update public.profiles p
set country = upper(split_part(replace(p.locale, '_', '-'), '-', 2))
where p.country is null
  and p.locale is not null
  and split_part(replace(p.locale, '_', '-'), '-', 2) ~ '^[A-Za-z]{2}$';


-- ============================================================================
-- Index
-- ============================================================================
--
-- Partial: the readers are per-country cohort queries (which students does a
-- seeded crisis-resource set actually cover, coach/ops screens). Rows with an
-- unknown country are not a cohort and do not belong in the index.
create index if not exists profiles_country_idx
  on public.profiles (country)
  where country is not null;


-- ============================================================================
-- Fail loud (R7): a backfill that silently did nothing is a safety regression
-- disguised as a green migration.
-- ============================================================================
do $$
declare
  total_profiles bigint;
  with_country bigint;
  malformed bigint;
begin
  select count(*) into total_profiles from public.profiles;
  select count(*) into with_country from public.profiles where country is not null;
  select count(*) into malformed
  from public.profiles
  where country is not null and country !~ '^[A-Z]{2}$';

  if malformed > 0 then
    raise exception
      'W4.2 profiles.country: % row(s) hold a non ISO 3166-1 alpha-2 value',
      malformed;
  end if;

  -- Not an exception: an empty `profiles` table (fresh local reset) is a
  -- legitimate state. A populated table with zero resolved country is not,
  -- and gets named in the log.
  if total_profiles > 0 and with_country = 0 then
    raise warning
      'W4.2 profiles.country: % profile(s), none resolved from locale. The crisis-resource resolver will degrade onto the international fallback for every one of them.',
      total_profiles;
  end if;

  raise notice
    'W4.2 profiles.country: %/% profile(s) backfilled from locale',
    with_country, total_profiles;
end $$;
