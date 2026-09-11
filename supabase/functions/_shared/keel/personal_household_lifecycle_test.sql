-- ============================================================================
-- LOT 1 · LE CYCLE DE VIE — l'invitation traverse un foyer personnel.
--
-- Ce qu'un mock ne peut pas prouver: que le détachement et la réclamation sont
-- dans la MÊME transaction, qu'aucune double appartenance ne survit, et qu'un
-- foyer COLLECTIF n'est pas abandonné par cette porte.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/personal_household_lifecycle_test.sql
--
-- ⚠️ Transaction ROLLBACK: la base ressort intacte. Aucun compte réel.
-- ============================================================================
begin;
create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- Le foyer d'accueil, avec une bouche libre à réclamer.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('33333333-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lc.hote@keeltest.dev',now(),now()),
  ('33333333-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lc.invite@keeltest.dev',now(),now()),
  ('33333333-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lc.collectif@keeltest.dev',now(),now());
-- ⛔ LE DÉCLENCHEUR A DÉJÀ POSÉ UN FOYER À CHACUN. Depuis 20260910194000, un
-- profil neuf reçoit son foyer personnel — et `handle_new_user` crée le profil
-- dès l'insertion du compte. Un décor qui poserait ses propres lignes
-- `household_members` violerait `household_members_one_per_user`.
-- On défait donc le provisionnement automatique pour les comptes dont ce
-- fichier construit le foyer à la main. ⚠️ Ce n'est PAS un contournement du
-- déclencheur: la section ④ le mesure, lui, sur la chaîne réelle.
delete from public.households h
where h.created_by in ('33333333-0000-4000-8000-000000000001'::uuid,
                       '33333333-0000-4000-8000-000000000003'::uuid)
  and h.origin = 'personal_auto';

insert into public.profiles (id, full_name, country) values
  ('33333333-0000-4000-8000-000000000002','Iris Invitee','FR'),
  ('33333333-0000-4000-8000-000000000003','Otto Collectif','FR')
on conflict (id) do update set full_name=excluded.full_name, country=excluded.country;

insert into public.households (id, name, created_by, origin)
values ('44444444-0000-4000-8000-000000000001','Chez l''hôte','33333333-0000-4000-8000-000000000001','created');
insert into public.household_members (household_id, user_id, role, first_name) values
  ('44444444-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001','owner','Hote');
insert into public.household_members (household_id, user_id, role, first_name, member_id) values
  ('44444444-0000-4000-8000-000000000001', null, 'member','Iris','55555555-0000-4000-8000-000000000001');
insert into public.household_invitations (household_id, email, token_hash, invited_by, expires_at, member_id)
values ('44444444-0000-4000-8000-000000000001','lc.invite@keeltest.dev',
        public.coach_invite_token_hash('jeton-lot1'),'33333333-0000-4000-8000-000000000001',
        now()+interval '7 days','55555555-0000-4000-8000-000000000001');

-- ── ① L'INVITÉE A DÉJÀ UN FOYER PERSONNEL, ET ELLE PEUT QUAND MÊME REJOINDRE ─
select set_config('request.jwt.claims','{"sub":"33333333-0000-4000-8000-000000000002","role":"authenticated"}',true);
create temporary table t_perso as select public.keel_ensure_personal_household() as r;
-- ⚠️ `created` VAUT `false` ICI, ET C'EST JUSTE: le déclencheur de
-- 20260910194000 a déjà posé le foyer à l'insertion du compte. Ce qu'on
-- vérifie est l'ÉTAT — elle a un foyer, et il est personnel — pas qui l'a
-- posé. Exiger `created` ferait rougir ce test le jour où le déclencheur
-- marche, c'est-à-dire exactement quand il ne devrait pas.
insert into t_probe select '① l''invitée a bien un foyer personnel',
  coalesce((r->>'ok')::boolean,false) and r->>'origin'='personal_auto', r::text from t_perso;

create temporary table t_join as select public.keel_household_join('jeton-lot1','FR') as r;
insert into t_probe select '① l''invitation TRAVERSE le foyer personnel',
  coalesce((r->>'ok')::boolean,false), r::text from t_join;
insert into t_probe select '① elle est bien dans le foyer d''accueil',
  public.keel_household_of('33333333-0000-4000-8000-000000000002') = '44444444-0000-4000-8000-000000000001',
  coalesce(public.keel_household_of('33333333-0000-4000-8000-000000000002')::text,'(aucun)');
insert into t_probe select '① aucune double appartenance',
  (select count(*) from public.household_members where user_id='33333333-0000-4000-8000-000000000002')=1,
  format('lignes=%s',(select count(*) from public.household_members where user_id='33333333-0000-4000-8000-000000000002'));
insert into t_probe select '① l''identité de la bouche invitée est GARDÉE',
  (select first_name from public.household_members where user_id='33333333-0000-4000-8000-000000000002')='Iris',
  (select first_name from public.household_members where user_id='33333333-0000-4000-8000-000000000002');
insert into t_probe select '① le foyer personnel vidé est parti',
  (select count(*) from public.households where id=(select (r->>'household_id')::uuid from t_perso))=0,
  format('restant=%s',(select count(*) from public.households where id=(select (r->>'household_id')::uuid from t_perso)));

-- ── ② UN FOYER COLLECTIF NE S'ABANDONNE PAS PAR CETTE PORTE ────────────────
insert into public.households (id, name, created_by, origin)
values ('44444444-0000-4000-8000-000000000002','Chez Otto','33333333-0000-4000-8000-000000000003','created');
insert into public.household_members (household_id, user_id, role, first_name) values
  ('44444444-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000003','owner','Otto'),
  ('44444444-0000-4000-8000-000000000002', null, 'member','Enfant');
-- une seconde bouche libre chez l'hôte, et l'invitation d'Otto vers elle
insert into public.household_members (household_id, user_id, role, first_name, member_id)
values ('44444444-0000-4000-8000-000000000001'::uuid, null, 'member', 'Iris2',
        '55555555-0000-4000-8000-000000000002'::uuid);
insert into public.household_invitations (household_id, email, token_hash, invited_by, expires_at, member_id)
values ('44444444-0000-4000-8000-000000000001'::uuid, 'lc.collectif@keeltest.dev',
        public.coach_invite_token_hash('jeton-lot1-bis'),
        '33333333-0000-4000-8000-000000000001'::uuid,
        now() + interval '7 days', '55555555-0000-4000-8000-000000000002'::uuid);

select set_config('request.jwt.claims','{"sub":"33333333-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into t_probe select '② foyer collectif: refus inchangé',
  (public.keel_household_join('jeton-lot1-bis','FR')->>'reason')='already_in_household',
  public.keel_household_join('jeton-lot1-bis','FR')::text;
insert into t_probe select '② et son foyer est INTACT',
  (select count(*) from public.household_members where household_id='44444444-0000-4000-8000-000000000002')=2,
  format('bouches=%s',(select count(*) from public.household_members where household_id='44444444-0000-4000-8000-000000000002'));

-- ══════════════════════════════════════════════════════════════════════════
-- ③ LA DISSOLUTION — on ne reste jamais sans foyer, et l'essai ne se rejoue pas
-- ══════════════════════════════════════════════════════════════════════════
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('66666666-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ds.solo@keeltest.dev',now(),now());
insert into public.profiles (id, full_name) values ('66666666-0000-4000-8000-000000000001','Zoe Seule')
on conflict (id) do update set full_name=excluded.full_name;
-- ⛔ même raison qu'en ①: le déclencheur a déjà provisionné ce compte.
delete from public.households h
where h.created_by = '66666666-0000-4000-8000-000000000001'::uuid
  and h.origin = 'personal_auto';

-- un foyer personnel dont l'essai est DÉJÀ consommé
insert into public.households (id, name, created_by, free_until, origin)
values ('77777777-0000-4000-8000-000000000001','Zoe','66666666-0000-4000-8000-000000000001', current_date - 30, 'personal_auto');
insert into public.household_members (household_id, user_id, role, first_name)
values ('77777777-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000001','owner','Zoe');

select set_config('request.jwt.claims','{"sub":"66666666-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into t_probe select '⓪ prémisse: le foyer n''est PAS couvert',
  not public.keel_household_is_covered('77777777-0000-4000-8000-000000000001'), 'free_until = J-30';

create temporary table t_dis as select public.keel_household_dissolve() as r;
insert into t_probe select '① la dissolution rend un foyer, pas le vide',
  coalesce((r->>'ok')::boolean,false) and (r->>'household_id') is not null, r::text from t_dis;
insert into t_probe select '① le compte n''est JAMAIS sans rattachement',
  public.keel_household_of('66666666-0000-4000-8000-000000000001') is not null,
  coalesce(public.keel_household_of('66666666-0000-4000-8000-000000000001')::text,'(aucun)');
insert into t_probe select '① c''est un AUTRE foyer',
  (select r->>'household_id' from t_dis) <> '77777777-0000-4000-8000-000000000001',
  (select r->>'household_id' from t_dis);

-- ⛔ LE CAS QUI COMPTE: l'essai périmé le RESTE.
insert into t_probe select '② l''essai périmé n''est PAS rejoué',
  (select (r->>'free_until')::date from t_dis) = current_date - 30
  and not public.keel_household_is_covered((select (r->>'household_id')::uuid from t_dis)),
  format('free_until=%s couvert=%s', (select r->>'free_until' from t_dis),
         public.keel_household_is_covered((select (r->>'household_id')::uuid from t_dis)));


-- ══════════════════════════════════════════════════════════════════════════
-- ④ LE DÉCLENCHEUR — la chaîne réelle d'une inscription
-- ⚠️ On n'insère QUE le compte: `handle_new_user` crée le profil, qui déclenche
-- le provisionnement. Insérer le profil à la main mesurerait autre chose.
-- ══════════════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('88888888-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','tg.neuf@keeltest.dev',
        '{"full_name":"Nils Neuf"}'::jsonb, now(), now());

insert into t_probe select '① le compte neuf a un profil',
  exists(select 1 from public.profiles where id='88888888-0000-4000-8000-000000000001'),
  coalesce((select full_name from public.profiles where id='88888888-0000-4000-8000-000000000001'),'(aucun)');

insert into t_probe select '① et il a un foyer, posé par le déclencheur',
  public.keel_household_of('88888888-0000-4000-8000-000000000001') is not null,
  coalesce(public.keel_household_of('88888888-0000-4000-8000-000000000001')::text,'(aucun)');

insert into t_probe select '① origine automatique, rôle maître',
  (select h.origin from public.households h
    where h.id = public.keel_household_of('88888888-0000-4000-8000-000000000001')) = 'personal_auto'
  and (select hm.role from public.household_members hm
       where hm.user_id='88888888-0000-4000-8000-000000000001') = 'owner',
  (select format('%s / %s', h.origin, hm.role) from public.household_members hm
     join public.households h on h.id=hm.household_id
    where hm.user_id='88888888-0000-4000-8000-000000000001');

insert into t_probe select '② une bouche, pas deux',
  (select count(*) from public.household_members where user_id='88888888-0000-4000-8000-000000000001')=1,
  format('lignes=%s',(select count(*) from public.household_members where user_id='88888888-0000-4000-8000-000000000001'));

insert into t_probe select '③ l''essai part du défaut (7 j)',
  (select h.free_until from public.households h
    where h.id=public.keel_household_of('88888888-0000-4000-8000-000000000001'))
  = current_date + public.keel_household_trial_days(),
  (select h.free_until::text from public.households h
    where h.id=public.keel_household_of('88888888-0000-4000-8000-000000000001'));


-- ══════════════════════════════════════════════════════════════════════════
-- ⑤ « CRÉER UN FOYER » DEVIENT « NOMMER LE SIEN »
-- ⛔ Sans ce comportement, l'entonnoir entier casse: chaque profil neuf ayant
-- déjà un foyer, `already_in_household` serait vrai de tout le monde.
-- ══════════════════════════════════════════════════════════════════════════
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('99999999-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr.solo@keeltest.dev','{"full_name":"Rene Solo"}'::jsonb,now(),now()),
       ('99999999-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr.duo@keeltest.dev','{"full_name":"Duo Chef"}'::jsonb,now(),now());

-- ① un compte seul: la création NOMME son foyer, sans en créer un second
select set_config('request.jwt.claims','{"sub":"99999999-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table t_avant as select public.keel_household_of('99999999-0000-4000-8000-000000000001') as h,
  (select free_until from public.households where id=public.keel_household_of('99999999-0000-4000-8000-000000000001')) as f;
create temporary table t_cr as select public.keel_household_create('Chez René') as r;
insert into t_probe select '① la création réussit', coalesce((r->>'ok')::boolean,false), r::text from t_cr;
insert into t_probe select '① c''est le MÊME foyer, renommé',
  (select r->>'household_id' from t_cr) = (select h::text from t_avant)
  and (select name from public.households where id=(select h from t_avant))='Chez René',
  format('%s / %s', (select r->>'household_id' from t_cr), (select name from public.households where id=(select h from t_avant)));
insert into t_probe select '① une seule appartenance',
  (select count(*) from public.household_members where user_id='99999999-0000-4000-8000-000000000001')=1,
  format('lignes=%s',(select count(*) from public.household_members where user_id='99999999-0000-4000-8000-000000000001'));
insert into t_probe select '① l''essai n''est pas touché',
  (select free_until from public.households where id=(select h from t_avant)) = (select f from t_avant),
  format('avant=%s après=%s',(select f from t_avant),(select free_until from public.households where id=(select h from t_avant)));

-- ② un foyer où quelqu'un d'autre vit: refus inchangé
select set_config('request.jwt.claims','{"sub":"99999999-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.household_members (household_id, user_id, role, first_name)
values (public.keel_household_of('99999999-0000-4000-8000-000000000002'), null, 'member', 'Colocataire');
insert into t_probe select '② foyer partagé: refus',
  (public.keel_household_create('Chez nous')->>'reason')='already_in_household',
  public.keel_household_create('Chez nous')::text;


select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail from t_probe order by name;
do $$
declare n integer;
begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'LOT 1 cycle de vie · % cas en échec', n; end if;
  raise notice 'LOT 1 cycle de vie: tous les cas passent';
end $$;
rollback;
