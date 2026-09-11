-- ============================================================================
-- LOT 1 · UN COMPTE SEUL EST UN FOYER D'UNE PERSONNE, ÉPROUVÉ EN BASE.
--
-- Ce qu'un mock TypeScript ne PEUT pas prouver: l'idempotence sous verrou,
-- l'index unique, le refus d'un `p_user` arbitraire, et le fait qu'un
-- rattachement existant ressorte INTACT — échéance d'essai comprise.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/personal_household_test.sql
--
-- ⚠️ Tout se passe dans une transaction ROLLBACK: la base ressort intacte.
-- ⛔ Aucun compte réel n'est utilisé: trois comptes de test sont créés ici.
-- ============================================================================

begin;

create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- ── LE DÉCOR ───────────────────────────────────────────────────────────────
-- Trois comptes: un neuf sans foyer, un déjà rattaché, un supprimé.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('11111111-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot1.neuf@keeltest.dev', now(), now()),
  ('11111111-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot1.deja@keeltest.dev', now(), now()),
  ('11111111-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot1.efface@keeltest.dev', now(), now());
update auth.users set deleted_at = now() where id = '11111111-0000-4000-8000-000000000003';

-- ⛔ LE DÉCLENCHEUR A DÉJÀ POSÉ UN FOYER À CHACUN DES TROIS. Depuis
-- 20260910194000 un profil neuf reçoit son foyer personnel, et
-- `handle_new_user` crée le profil dès l'insertion du compte. Sans cette
-- remise à zéro, ① n'aurait plus rien à créer et le foyer manuel de ②
-- violerait `household_members_one_per_user`.
-- ⚠️ Ce n'est pas un contournement du déclencheur: c'est le fichier
-- `personal_household_lifecycle_test.sql` § ④ qui le mesure, lui.
delete from public.households h
where h.created_by in ('11111111-0000-4000-8000-000000000001'::uuid,
                       '11111111-0000-4000-8000-000000000002'::uuid,
                       '11111111-0000-4000-8000-000000000003'::uuid)
  and h.origin = 'personal_auto';

insert into public.profiles (id, full_name, birth_date)
values ('11111111-0000-4000-8000-000000000001', 'Ada Lovelace', '1990-12-10')
on conflict (id) do update set full_name = excluded.full_name, birth_date = excluded.birth_date;

-- Le compte ② a DÉJÀ un foyer, avec une échéance ancienne qu'on doit retrouver
-- telle quelle: c'est la moitié « ne pas réinitialiser un essai ».
insert into public.households (id, name, created_by, free_until, origin)
values ('22222222-0000-4000-8000-000000000002', 'Chez eux',
        '11111111-0000-4000-8000-000000000002', date '2020-01-01', 'created');
insert into public.household_members (household_id, user_id, role, first_name)
values ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002',
        'owner', 'Grace');

-- ── ① UN COMPTE NEUF REÇOIT UN FOYER, MARQUÉ `personal_auto` ──────────────
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
-- ⛔ ON NE CHANGE PAS LE RÔLE DE SESSION. `auth.role()` lit la CLAIM, pas le
-- rôle Postgres (voir sa définition). Un `set_config('role', ...)` rendrait en
-- prime la table temporaire de ce fichier inaccessible.
create temporary table t_un as
  select public.keel_ensure_personal_household() as r;
insert into t_probe select '① compte neuf: créé',
  (r->>'ok')::boolean and (r->>'created')::boolean and r->>'origin' = 'personal_auto',
  r::text from t_un;

-- ⛔ L'ESSAI EST CELUI DU DÉFAUT — sept jours. Décision du propriétaire du
-- 2026-09-10, qui RENVERSE le § 1.4 du plan. Ce test la fige: si quelqu'un
-- écrit `free_until` à la main dans la fonction, ou remet `NULL`, il rougit.
insert into t_probe select '① essai = défaut de la colonne (7 j)',
  (r->>'free_until')::date = current_date + public.keel_household_trial_days(),
  format('free_until=%s attendu=%s', r->>'free_until',
         current_date + public.keel_household_trial_days())
from t_un;

-- L'identité vient de `profiles`, jamais inventée.
insert into t_probe select '① le prénom vient du profil',
  (select first_name from public.household_members
   where user_id = '11111111-0000-4000-8000-000000000001') = 'Ada'
  and (select birth_date from public.household_members
       where user_id = '11111111-0000-4000-8000-000000000001') = date '1990-12-10',
  (select format('%s / %s', first_name, birth_date) from public.household_members
   where user_id = '11111111-0000-4000-8000-000000000001');

-- ── ② UN SECOND APPEL NE CRÉE RIEN ────────────────────────────────────────
create temporary table t_deux as
  select public.keel_ensure_personal_household() as r;
insert into t_probe select '② idempotent: mêmes identifiants, created=false',
  (select r->>'household_id' from t_deux) = (select r->>'household_id' from t_un)
  and (select r->>'member_id' from t_deux) = (select r->>'member_id' from t_un)
  and not (select (r->>'created')::boolean from t_deux),
  (select r::text from t_deux);

insert into t_probe select '② aucune double appartenance',
  (select count(*) from public.household_members
   where user_id = '11111111-0000-4000-8000-000000000001') = 1,
  format('lignes=%s', (select count(*) from public.household_members
                       where user_id = '11111111-0000-4000-8000-000000000001'));

-- ── ③ UN COMPTE DÉJÀ RATTACHÉ RESSORT INTACT ──────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
create temporary table t_trois as
  select public.keel_ensure_personal_household() as r;
insert into t_probe select '③ rattaché: rendu tel quel',
  (select r->>'household_id' from t_trois) = '22222222-0000-4000-8000-000000000002'
  and not (select (r->>'created')::boolean from t_trois)
  and (select r->>'origin' from t_trois) = 'created',
  (select r::text from t_trois);

-- ⛔ ET SON ESSAI N'EST PAS TOUCHÉ. C'est le cas qui compte le plus de tout ce
-- fichier: un rattrapage qui repasserait sur les 76 foyers existants ne doit
-- rendre à personne un essai périmé depuis 2020.
insert into t_probe select '③ échéance ancienne PRÉSERVÉE',
  (select free_until from public.households
   where id = '22222222-0000-4000-8000-000000000002') = date '2020-01-01',
  format('free_until=%s', (select free_until from public.households
                           where id = '22222222-0000-4000-8000-000000000002'));

-- ── ④ UN COMPTE SUPPRIMÉ NE SE RECRÉE PAS ─────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into t_probe select '④ compte supprimé: refus',
  (public.keel_ensure_personal_household()->>'reason') = 'account_deleted',
  public.keel_ensure_personal_household()::text;

-- ── ⑤ UN `p_user` ARBITRAIRE EST REFUSÉ SOUS JETON UTILISATEUR ────────────
-- ⛔ SANS CETTE GARDE, N'IMPORTE QUI FABRIQUE UN FOYER AU NOM DE N'IMPORTE QUI.
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into t_probe select '⑤ p_user d''autrui: not_allowed',
  (public.keel_ensure_personal_household('11111111-0000-4000-8000-000000000002')
     ->>'reason') = 'not_allowed',
  public.keel_ensure_personal_household('11111111-0000-4000-8000-000000000002')::text;

-- ⚠️ ET LE MÊME `p_user` QUE SOI RESTE PERMIS: le garde vise l'usurpation, pas
-- la forme de l'appel.
insert into t_probe select '⑤ p_user = soi: permis',
  (public.keel_ensure_personal_household('11111111-0000-4000-8000-000000000001')
     ->>'ok')::boolean,
  public.keel_ensure_personal_household('11111111-0000-4000-8000-000000000001')::text;

-- ── ⑥ L'ORIGINE NE DÉCIDE D'AUCUN DROIT ───────────────────────────────────
-- Les deux foyers sont couverts ou non par la MÊME règle, quelle que soit leur
-- origine: `keel_household_is_covered`, et elle seule.
insert into t_probe select '⑥ couverture lue par la règle unique',
  public.keel_household_is_covered(
    (select (r->>'household_id')::uuid from t_un))
  and not public.keel_household_is_covered('22222222-0000-4000-8000-000000000002'),
  format('auto=%s ancien(2020)=%s',
    public.keel_household_is_covered((select (r->>'household_id')::uuid from t_un)),
    public.keel_household_is_covered('22222222-0000-4000-8000-000000000002'));

-- ── LE VERDICT ─────────────────────────────────────────────────────────────
select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail from t_probe order by name;
do $$
declare n integer;
begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'LOT 1 · % cas en échec', n; end if;
  raise notice 'LOT 1 · foyer personnel: tous les cas passent';
end $$;

rollback;
