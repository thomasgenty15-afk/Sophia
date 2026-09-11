-- ============================================================================
-- LOT 1 · UN DÉPART REND SON FOYER, ET PAS UN ESSAI NEUF.
--
-- Ce que les mocks TypeScript ne peuvent pas prouver: qu'après un départ le
-- compte a de nouveau UN foyer (index unique compris), et que l'échéance
-- reposée est celle d'avant l'invitation — pas sept jours neufs.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/personal_household_departure_test.sql
--
-- ⚠️ Transaction ROLLBACK: la base ressort intacte.
-- ============================================================================

begin;

create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- ── LE DÉCOR ───────────────────────────────────────────────────────────────
-- Un maître, deux invités. Le déclencheur pose un foyer à chacun.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('55555555-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','dep.maitre@keeltest.dev',now(),now()),
  ('55555555-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','dep.detache@keeltest.dev',now(),now()),
  ('55555555-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','dep.retire@keeltest.dev',now(),now());

insert into public.profiles (id, full_name, country) values
  ('55555555-0000-4000-8000-000000000001','Max Maitre','FR'),
  ('55555555-0000-4000-8000-000000000002','Dina Detachee','FR'),
  ('55555555-0000-4000-8000-000000000003','Remi Retire','FR')
on conflict (id) do update set full_name=excluded.full_name, country=excluded.country;

-- ⚠️ ON MARQUE LES DEUX FOYERS PERSONNELS DES INVITÉS AVEC UNE ÉCHÉANCE
-- RECONNAISSABLE. C'est elle qu'on doit retrouver après le départ; sept jours
-- neufs ressortiraient comme `current_date + 7`, et le test rougirait.
update public.households set free_until = date '2026-08-01'
 where created_by = '55555555-0000-4000-8000-000000000002' and origin = 'personal_auto';
update public.households set free_until = date '2026-08-02'
 where created_by = '55555555-0000-4000-8000-000000000003' and origin = 'personal_auto';

-- Le foyer du maître devient collectif: deux bouches à réclamer.
insert into public.household_members (member_id, household_id, user_id, role, first_name)
values
  ('56000000-0000-4000-8000-000000000002',
   public.keel_household_of('55555555-0000-4000-8000-000000000001'), null, 'member', 'Dina'),
  ('56000000-0000-4000-8000-000000000003',
   public.keel_household_of('55555555-0000-4000-8000-000000000001'), null, 'member', 'Remi'),
  ('56000000-0000-4000-8000-000000000004',
   public.keel_household_of('55555555-0000-4000-8000-000000000001'), null, 'member', 'Bebe');

insert into public.household_invitations (household_id, email, token_hash, member_id, expires_at)
values
  (public.keel_household_of('55555555-0000-4000-8000-000000000001'),
   'dep.detache@keeltest.dev', public.coach_invite_token_hash('jeton-dina'),
   '56000000-0000-4000-8000-000000000002', now() + interval '7 days'),
  (public.keel_household_of('55555555-0000-4000-8000-000000000001'),
   'dep.retire@keeltest.dev', public.coach_invite_token_hash('jeton-remi'),
   '56000000-0000-4000-8000-000000000003', now() + interval '7 days');

-- ── ① LA RÉCLAMATION RANGE L'ÉCHÉANCE QU'ELLE EFFACE ──────────────────────
select set_config('request.jwt.claims',
  '{"sub":"55555555-0000-4000-8000-000000000002","role":"authenticated"}', true);
create temporary table t_j2 as select public.keel_household_join('jeton-dina','FR') as r;
insert into t_probe select '① Dina rejoint', coalesce((r->>'ok')::boolean,false), r::text from t_j2;
insert into t_probe select '① son échéance est rangée sur la ligne',
  (select personal_free_until from public.household_members
    where member_id='56000000-0000-4000-8000-000000000002') = date '2026-08-01',
  format('rangée=%s', (select personal_free_until from public.household_members
    where member_id='56000000-0000-4000-8000-000000000002'));
insert into t_probe select '① son foyer personnel a bien disparu',
  (select count(*) from public.households
    where created_by='55555555-0000-4000-8000-000000000002' and origin='personal_auto')=0,
  format('restants=%s',(select count(*) from public.households
    where created_by='55555555-0000-4000-8000-000000000002' and origin='personal_auto'));

select set_config('request.jwt.claims',
  '{"sub":"55555555-0000-4000-8000-000000000003","role":"authenticated"}', true);
-- ⚠️ UN SEUL APPEL, RANGÉ. Appeler deux fois (une pour le verdict, une pour le
-- détail) consomme l'invitation au premier tour: le détail dirait
-- `already_used` sur une réclamation qui a pourtant réussi.
create temporary table t_j3 as select public.keel_household_join('jeton-remi','FR') as r;
insert into t_probe select '① Rémi rejoint', coalesce((r->>'ok')::boolean,false), r::text from t_j3;

-- ── ② LE DÉTACHEMENT REND LE FOYER, AVEC L'ÉCHÉANCE D'AVANT ───────────────
select set_config('request.jwt.claims',
  '{"sub":"55555555-0000-4000-8000-000000000001","role":"authenticated"}', true);
create temporary table t_det as
  select public.keel_household_detach_member('56000000-0000-4000-8000-000000000002') as r;
insert into t_probe select '② détachement accepté',
  coalesce((r->>'ok')::boolean,false), r::text from t_det;
insert into t_probe select '② Dina a de nouveau UN foyer, un seul',
  (select count(*) from public.household_members
    where user_id='55555555-0000-4000-8000-000000000002')=1
  and public.keel_household_of('55555555-0000-4000-8000-000000000002') is not null,
  format('lignes=%s foyer=%s',
    (select count(*) from public.household_members
      where user_id='55555555-0000-4000-8000-000000000002'),
    public.keel_household_of('55555555-0000-4000-8000-000000000002'));
-- ⛔ LE CŒUR DU FICHIER. Sept jours neufs vaudraient current_date + 7.
insert into t_probe select '② PAS d''essai neuf: échéance = celle d''avant',
  (select h.free_until from public.households h
    where h.id = public.keel_household_of('55555555-0000-4000-8000-000000000002')) = date '2026-08-01',
  format('rendue=%s attendu=2026-08-01 (neuf aurait donné %s)',
    (select h.free_until from public.households h
      where h.id = public.keel_household_of('55555555-0000-4000-8000-000000000002')),
    current_date + public.keel_household_trial_days());
insert into t_probe select '② la bouche reste chez le maître, sans compte',
  (select user_id is null and personal_free_until is null and household_id =
      public.keel_household_of('55555555-0000-4000-8000-000000000001')
   from public.household_members where member_id='56000000-0000-4000-8000-000000000002'),
  (select format('user=%s reste=%s', user_id, personal_free_until)
   from public.household_members where member_id='56000000-0000-4000-8000-000000000002');

-- ── ③ LE RETRAIT AUSSI ────────────────────────────────────────────────────
create temporary table t_ret as
  select public.keel_household_remove_member('56000000-0000-4000-8000-000000000003') as r;
insert into t_probe select '③ retrait accepté',
  coalesce((r->>'ok')::boolean,false), r::text from t_ret;
insert into t_probe select '③ Rémi a un foyer, avec son échéance d''avant',
  public.keel_household_of('55555555-0000-4000-8000-000000000003') is not null
  and (select h.free_until from public.households h
        where h.id = public.keel_household_of('55555555-0000-4000-8000-000000000003')) = date '2026-08-02',
  format('foyer=%s échéance=%s',
    public.keel_household_of('55555555-0000-4000-8000-000000000003'),
    (select h.free_until from public.households h
      where h.id = public.keel_household_of('55555555-0000-4000-8000-000000000003')));
insert into t_probe select '③ la bouche, elle, est partie',
  (select count(*) from public.household_members
    where member_id='56000000-0000-4000-8000-000000000003')=0, '';

-- ── ④ UNE BOUCHE SANS COMPTE NE RELOGE PERSONNE ───────────────────────────
create temporary table t_bebe as
  select public.keel_household_remove_member('56000000-0000-4000-8000-000000000004') as r;
insert into t_probe select '④ bouche sans compte: retrait sans reloger',
-- ⚠️ `->` REND UN jsonb `null`, PAS UN NULL SQL: `is null` y serait toujours
-- faux. On lit le TYPE de la valeur.
  coalesce((r->>'ok')::boolean,false)
  and jsonb_typeof(r->'foyer_rendu') = 'null', r::text from t_bebe;

-- ── ⑤ LES DEUX REFUS DU MAÎTRE TIENNENT ───────────────────────────────────
insert into t_probe select '⑤ le maître ne se détache pas lui-même',
  (public.keel_household_detach_member(
     (select member_id from public.household_members
       where user_id='55555555-0000-4000-8000-000000000001'))->>'reason')='cannot_detach_owner', '';
insert into t_probe select '⑤ le maître ne se retire pas lui-même',
  (public.keel_household_remove_member(
     (select member_id from public.household_members
       where user_id='55555555-0000-4000-8000-000000000001'))->>'reason')='cannot_remove_owner', '';

-- ── ⑥ LA LISTE DES ÉCRIVAINS D'ÉCHÉANCE NE GRANDIT PAS ───────────────────
-- ⛔ CINQ FONCTIONS ÉCRIVENT `households.free_until`, ET ELLES SEULES. Chacune
-- a été lue: `keel__ensure_personal_household` pose le défaut (sept jours, la
-- décision du propriétaire du 2026-09-10); `keel_household_create` ne touche
-- rien quand il renomme; `keel_household_dissolve` sauve puis repose;
-- les deux portes de départ reposent l'échéance rangée à l'arrivée.
-- Une sixième qui apparaît sans être lue rouvre la ferme à essais: on la
-- nomme ici, ou ce fichier rougit.
insert into t_probe select '⑥ écrivains de free_until: la liste ne grandit pas',
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* 'free_until'
      and p.prosrc ~* '(insert into public.households|set +free_until|update public.households)')
  = array['keel__ensure_personal_household','keel_household_create',
          'keel_household_detach_member','keel_household_dissolve',
          'keel_household_remove_member'],
  (select array_agg(p.proname::text order by p.proname)::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* 'free_until'
      and p.prosrc ~* '(insert into public.households|set +free_until|update public.households)');

select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail
from t_probe order by name;

do $$ declare n integer; begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'LOT 1 départ · % cas en échec', n; end if;
  raise notice 'LOT 1 · départ: tous les cas passent';
end $$;

rollback;
